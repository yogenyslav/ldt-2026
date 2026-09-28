import asyncio
from datetime import datetime, timezone
import io
import json
import os
from pathlib import Path
import unittest
from unittest.mock import AsyncMock, Mock, patch
from urllib.error import HTTPError, URLError
from uuid import uuid4

from service import Analyzer, decode_request, handle, heartbeat, result_event


def request():
    return dict(version=1, event_id=str(uuid4()), job_id=str(uuid4()),
                dicom_id="orthanc-id", status="pending",
                occurred_at=datetime.now(timezone.utc).isoformat())


def result():
    return dict(status="completed", anatomical_region="spine", confidence=0.8,
                violations=[], duration_ms=42, metadata={"shape": [100, 200]})


class ContractTests(unittest.TestCase):
    def test_invalid_requests(self):
        for update in ({"version": True}, {"job_id": str(uuid4()).replace("-", "x")},
                       {"event_id": "00000000-0000-0000-0000-000000000000"},
                       {"dicom_id": " "}, {"occurred_at": "yesterday"},
                       {"occurred_at": "2026-09-28"}, {"status": "completed"},
                       {"result": {}}):
            with self.subTest(update=update), self.assertRaises(ValueError):
                decode_request(json.dumps(request() | update))
        self.assertEqual(decode_request(json.dumps(request()))["status"], "pending")

    def test_envelope_and_stable_id(self):
        event = request()
        first = result_event(event, result())
        second = result_event(event, {"status": "failed", "error": "bad DICOM"})
        self.assertEqual(first["event_id"], second["event_id"])
        self.assertEqual(first["job_id"], event["job_id"])
        self.assertEqual(first["result"], {k: v for k, v in result().items() if k != "status"})
        self.assertNotIn("result", second)
        self.assertEqual(second["error"], "bad DICOM")

    def test_download_auth_and_cleanup(self):
        paths = []

        def process(path):
            paths.append(path)
            self.assertEqual(Path(path).read_bytes(), b"DICOM")
            return result()

        with patch.dict(os.environ, {"ORTHANC_NAME": "user", "ORTHANC_PASSWORD": "pass",
                                     "ORTHANC_TOKEN": ""}), \
                patch("service.urlopen", return_value=io.BytesIO(b"DICOM")) as download:
            analyzer = Analyzer(Mock(process=process))
            self.assertEqual(analyzer.process(request()), result())
            req = download.call_args.args[0]
            self.assertTrue(req.full_url.endswith("/instances/orthanc-id/file"))
            self.assertEqual(req.get_header("Authorization"), "Basic dXNlcjpwYXNz")
        self.assertFalse(Path(paths[0]).exists())

    def test_cleanup_after_qc_exception_and_token_override(self):
        paths = []

        def process(path):
            paths.append(path)
            raise ValueError("invalid image")

        with patch.dict(os.environ, {"ORTHANC_TOKEN": "custom-token"}), \
                patch("service.urlopen", return_value=io.BytesIO(b"DICOM")) as download:
            with self.assertRaises(ValueError):
                Analyzer(Mock(process=process)).process(request())
            self.assertEqual(download.call_args.args[0].get_header("Authorization"), "Basic custom-token")
        self.assertFalse(Path(paths[0]).exists())


class DeliveryTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.message = Mock(data=json.dumps(request()).encode(), ack_sync=AsyncMock(),
                            nak=AsyncMock(), term=AsyncMock(), in_progress=AsyncMock(),
                            headers={}, metadata=Mock(num_delivered=1))
        self.js = Mock(publish=AsyncMock())
        self.analyzer = Mock(process=Mock(return_value=result()))

    async def test_publish_before_ack(self):
        async def publish(*args, **kwargs):
            self.message.ack_sync.assert_not_awaited()

        self.js.publish.side_effect = publish
        await handle(self.message, self.js, self.analyzer)
        args = self.js.publish.call_args
        event = json.loads(args.args[1])
        self.assertEqual(args.args[0], "dicom.analysis.completed")
        self.assertEqual(args.kwargs["headers"]["Nats-Msg-Id"], event["event_id"])
        self.message.ack_sync.assert_awaited_once()

    async def test_qc_failure(self):
        self.analyzer.process.return_value = {"status": "failed", "error": "bad DICOM"}
        await handle(self.message, self.js, self.analyzer)
        self.assertEqual(self.js.publish.call_args.args[0], "dicom.analysis.failed")
        self.message.ack_sync.assert_awaited_once()

    async def test_transient_download_failure(self):
        self.analyzer.process.side_effect = URLError("unavailable")
        await handle(self.message, self.js, self.analyzer)
        self.js.publish.assert_not_awaited()
        self.message.ack_sync.assert_not_awaited()
        self.message.nak.assert_awaited_once_with(delay=5)

    async def test_missing_dicom_publishes_failure(self):
        self.analyzer.process.side_effect = HTTPError("", 404, "missing", {}, None)
        await handle(self.message, self.js, self.analyzer)
        self.assertEqual(self.js.publish.call_args.args[0], "dicom.analysis.failed")
        self.message.ack_sync.assert_awaited_once()

    async def test_publish_failure_does_not_ack(self):
        self.js.publish.side_effect = TimeoutError()
        await handle(self.message, self.js, self.analyzer)
        self.message.ack_sync.assert_not_awaited()
        self.message.nak.assert_awaited_once_with(delay=5)

    async def test_invalid_message_terminated(self):
        self.message.data = b"{}"
        await handle(self.message, self.js, self.analyzer)
        self.message.term.assert_awaited_once()
        self.analyzer.process.assert_not_called()
        self.js.publish.assert_not_awaited()

    async def test_heartbeat(self):
        task = asyncio.create_task(heartbeat(self.message, interval=0.001))
        await asyncio.sleep(0.02)
        task.cancel()
        with self.assertRaises(asyncio.CancelledError):
            await task
        self.message.in_progress.assert_awaited()


if __name__ == "__main__":
    unittest.main()
