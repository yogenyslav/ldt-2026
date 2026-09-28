import io
import json
import logging
import os
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.request import urlopen
from unittest.mock import AsyncMock, Mock, patch

from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter
from opentelemetry.trace import StatusCode

from observability import JSONFormatter, Observability
from service import handle
from test_service import request, result


class TelemetryTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.exporter = InMemorySpanExporter()
        self.provider = TracerProvider()
        self.provider.add_span_processor(SimpleSpanProcessor(self.exporter))
        self.obs = Observability(self.provider.get_tracer("test"))
        self.request = request()
        self.message = Mock(data=json.dumps(self.request).encode(), headers={
            "traceparent": "00-11111111111111111111111111111111-2222222222222222-01",
        }, metadata=Mock(num_delivered=2), ack_sync=AsyncMock(), nak=AsyncMock(), term=AsyncMock())
        self.js = Mock(publish=AsyncMock())
        self.analyzer = Mock(process=Mock(return_value=result()))
        self.logs = io.StringIO()
        self.handler = logging.StreamHandler(self.logs)
        self.handler.setFormatter(JSONFormatter())
        self.logger = logging.getLogger("dicom-analyzer")
        self.level = self.logger.level
        self.logger.setLevel(logging.INFO)
        self.logger.addHandler(self.handler)

    def tearDown(self):
        self.logger.removeHandler(self.handler)
        self.logger.setLevel(self.level)
        self.provider.shutdown()

    def counter(self, operation, outcome):
        return self.obs.registry.get_sample_value("dicom_analyzer_messaging_total", {"operation": operation, "outcome": outcome})

    async def test_success_correlates_logs_spans_and_headers(self):
        await handle(self.message, self.js, self.analyzer, self.obs)
        self.assertEqual(self.counter("publish", "ok"), 1)
        self.assertEqual(self.counter("ack", "ok"), 1)
        self.assertEqual(self.counter("consume", "redelivered"), 1)
        self.assertEqual(self.obs.registry.get_sample_value("dicom_analyzer_processing_active"), 0)
        spans = {span.name: span for span in self.exporter.get_finished_spans()}
        self.assertEqual(spans["nats.consume"].parent.span_id, int("2222222222222222", 16))
        self.assertEqual(spans["nats.publish"].parent.span_id, spans["nats.consume"].context.span_id)
        self.assertIn("11111111111111111111111111111111", self.js.publish.call_args.kwargs["headers"]["traceparent"])
        entries = [json.loads(line) for line in self.logs.getvalue().splitlines()]
        received = next(item for item in entries if item["message"] == "NATS request received")
        self.assertEqual(received["job_id"], self.request["job_id"])
        self.assertEqual(received["trace_id"], "11111111111111111111111111111111")
        self.assertIn("time", received)

    async def test_publish_error_records_retry_and_error_span(self):
        self.js.publish.side_effect = TimeoutError("publish timeout")
        await handle(self.message, self.js, self.analyzer, self.obs)
        self.assertEqual(self.counter("publish", "error"), 1)
        self.assertEqual(self.counter("publish", "ok"), 0)
        self.assertEqual(self.counter("consume", "retry"), 1)
        self.assertEqual(self.counter("consume", "ok"), 0)
        self.assertEqual(self.counter("ack", "ok"), 0)
        spans = {span.name: span for span in self.exporter.get_finished_spans()}
        self.assertEqual(spans["nats.publish"].status.status_code, StatusCode.ERROR)
        self.assertEqual(spans["nats.consume"].status.status_code, StatusCode.ERROR)

    async def test_ack_failure_is_distinct_from_publish_failure(self):
        self.message.ack_sync.side_effect = TimeoutError()
        await handle(self.message, self.js, self.analyzer, self.obs)
        self.assertEqual(self.counter("publish", "ok"), 1)
        self.assertEqual(self.counter("ack", "error"), 1)
        self.assertEqual(self.counter("consume", "retry"), 1)

    async def test_invalid_payload_and_failed_analysis(self):
        self.message.data = b"{}"
        await handle(self.message, self.js, self.analyzer, self.obs)
        self.assertEqual(self.counter("consume", "rejected"), 1)
        self.assertEqual(self.counter("term", "ok"), 1)
        self.message.data = json.dumps(self.request).encode()
        self.analyzer.process.return_value = {"status": "failed", "error": "bad image"}
        await handle(self.message, self.js, self.analyzer, self.obs)
        self.assertEqual(self.counter("consume", "failed"), 1)
        self.assertEqual(self.counter("publish", "ok"), 1)
        self.assertEqual(self.exporter.get_finished_spans()[-1].status.status_code, StatusCode.ERROR)


class ExportTests(unittest.TestCase):
    def test_http_metrics_and_otlp_export(self):
        payloads = []

        class Collector(BaseHTTPRequestHandler):
            def do_POST(self):
                payloads.append((self.path, self.rfile.read(int(self.headers["Content-Length"]))))
                self.send_response(200)
                self.end_headers()

            def log_message(self, *args):
                pass

        collector = ThreadingHTTPServer(("127.0.0.1", 0), Collector)
        thread = threading.Thread(target=collector.serve_forever, daemon=True)
        thread.start()
        obs = Observability()
        try:
            with patch.dict(os.environ, {"METRICS_ADDR": "127.0.0.1:0", "OTEL_EXPORTER_OTLP_TRACES_ENDPOINT": f"http://127.0.0.1:{collector.server_port}/v1/traces"}):
                obs.start()
            with obs.operation("publish"):
                pass
            with urlopen(f"http://127.0.0.1:{obs.server.server_port}/metrics") as response:
                text = response.read().decode()
            self.assertIn('dicom_analyzer_messaging_total{operation="publish",outcome="ok"} 1.0', text)
            self.assertTrue(obs.provider.force_flush())
            self.assertEqual(payloads[0][0], "/v1/traces")
            self.assertIn(b"dicom-analyzer", payloads[0][1])
        finally:
            obs.close()
            collector.shutdown()
            collector.server_close()
            thread.join()
