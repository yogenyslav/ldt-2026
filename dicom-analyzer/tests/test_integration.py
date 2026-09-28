"""Run only against disposable NATS; uses the repository's real role permissions."""
import asyncio
import io
import json
import os
import sys
import types
import unittest
from unittest.mock import Mock, patch

from service import DURABLE, REQUESTED, STREAM, run
from test_service import request, result


@unittest.skipUnless(os.getenv("TEST_NATS_URL"), "TEST_NATS_URL is not set")
class NatsIntegrationTests(unittest.IsolatedAsyncioTestCase):
    async def test_service_with_role_permissions(self):
        import nats
        from nats.js.api import ConsumerConfig
        from nats.js.errors import NotFoundError

        url = os.environ["TEST_NATS_URL"]
        worker = await nats.connect(url, user="dicom-worker", password="test")
        js = worker.jetstream()
        qc = Mock(process=Mock(side_effect=[result(), {"status": "failed", "error": "bad DICOM"}]))
        stops = []
        env = {"NATS_URL": url, "NATS_REPLICAS": "1", "DICOM_ANALYZER_PASSWORD": "test"}
        loop = asyncio.get_running_loop()
        with patch.dict(os.environ, env), \
                patch.dict(sys.modules, {"main": types.SimpleNamespace(QCService=Mock(return_value=qc))}), \
                patch.object(loop, "add_signal_handler", side_effect=lambda sig, callback: stops.append(callback)), \
                patch("service.urlopen", side_effect=lambda *a, **kw: io.BytesIO(b"DICOM")):
            task = asyncio.create_task(run())
            try:
                for _ in range(100):
                    if task.done():
                        await task
                    try:
                        await js.stream_info(STREAM)
                        break
                    except NotFoundError:
                        await asyncio.sleep(0.05)
                subscriptions = {}
                for status in ("completed", "failed"):
                    subject = f"dicom.analysis.{status}"
                    subscriptions[status] = await js.pull_subscribe(
                        subject, durable=f"worker-{status}", stream=STREAM,
                        config=ConsumerConfig(ack_wait=60, max_ack_pending=100),
                    )
                for status in ("completed", "failed"):
                    event = request()
                    await js.publish(REQUESTED, json.dumps(event).encode())
                    messages = await subscriptions[status].fetch(1, timeout=5)
                    output = json.loads(messages[0].data)
                    self.assertEqual(output["job_id"], event["job_id"])
                    self.assertEqual(output["status"], status)
                    self.assertEqual(messages[0].headers["Nats-Msg-Id"], output["event_id"])
                    await messages[0].ack_sync()
                # Allow the service to finish its request ACK and stop via its signal callback.
                stops[0]()
                await asyncio.wait_for(task, timeout=5)
                analyzer = await nats.connect(url, user="dicom-analyzer", password="test")
                try:
                    info = await analyzer.jetstream().consumer_info(STREAM, DURABLE)
                    self.assertEqual(info.num_ack_pending, 0)
                    self.assertEqual(info.num_pending, 0)
                finally:
                    await analyzer.close()
            finally:
                if not task.done():
                    task.cancel()
                    await asyncio.gather(task, return_exceptions=True)
                await worker.close()
