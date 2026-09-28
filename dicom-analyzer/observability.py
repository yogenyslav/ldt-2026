"""JSON logs, Prometheus metrics and OTLP tracing for the analyzer transport."""
from contextlib import contextmanager
from datetime import datetime, timezone
import json
import logging
import os
import sys
import time

from opentelemetry import trace
from opentelemetry.trace import SpanKind, StatusCode
from opentelemetry.trace.propagation.tracecontext import TraceContextTextMapPropagator
from prometheus_client import CollectorRegistry, Counter, Gauge, Histogram, start_http_server
from prometheus_client import GCCollector, PlatformCollector, ProcessCollector

LOG = logging.getLogger("dicom-analyzer")
PROPAGATOR = TraceContextTextMapPropagator()


class JSONFormatter(logging.Formatter):
    def format(self, record):
        entry = {
            "time": datetime.fromtimestamp(record.created, timezone.utc).isoformat(),
            "level": record.levelname.lower(), "app": os.getenv("APP_NAME", "dicom-analyzer"),
            "message": record.getMessage(),
        }
        entry.update(getattr(record, "fields", {}))
        ctx = trace.get_current_span().get_span_context()
        if ctx.is_valid:
            entry.update(trace_id=f"{ctx.trace_id:032x}", span_id=f"{ctx.span_id:016x}")
        if record.exc_info:
            entry["error"] = self.formatException(record.exc_info)
        return json.dumps(entry, ensure_ascii=False)


def configure_logging():
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JSONFormatter())
    logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"), handlers=[handler], force=True)


class Observability:
    def __init__(self, tracer=None):
        self.registry = CollectorRegistry()
        for collector in (GCCollector, PlatformCollector, ProcessCollector):
            collector(registry=self.registry)
        self.tracer = tracer or trace.get_tracer("dicom-analyzer")
        self.provider = None
        self.server = None
        self.thread = None
        self.events = Counter("dicom_analyzer_messaging_total", "Transport outcomes",
                              ["operation", "outcome"], registry=self.registry)
        self.duration = Histogram("dicom_analyzer_messaging_duration_seconds", "Operation duration",
                                  ["operation"], buckets=(.01, .1, .5, 1, 5, 15, 60, 300),
                                  registry=self.registry)
        self.connected = Gauge("dicom_analyzer_nats_connected", "NATS connection established", registry=self.registry)
        self.ready = Gauge("dicom_analyzer_consumer_ready", "Consumer initialized and connected", registry=self.registry)
        self.active = Gauge("dicom_analyzer_processing_active", "Requests being processed", registry=self.registry)
        self.last_received = Gauge("dicom_analyzer_last_received_timestamp_seconds", "Last received request", registry=self.registry)
        self.last_published = Gauge("dicom_analyzer_last_published_timestamp_seconds", "Last confirmed publish", registry=self.registry)
        for operation in ("consume", "publish", "ack", "nak", "term", "heartbeat", "fetch", "connection"):
            for outcome in ("ok", "error"):
                self.events.labels(operation, outcome)
        for outcome in ("received", "rejected", "retry", "redelivered", "completed", "failed"):
            self.events.labels("consume", outcome)

    def start(self):
        from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
        from opentelemetry.sdk.resources import Resource
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import BatchSpanProcessor

        endpoint = os.getenv("OTEL_EXPORTER_OTLP_TRACES_ENDPOINT") or (
            f'http://{os.getenv("TRACING_HOST", "localhost")}:{os.getenv("TRACING_PORT", "4318")}/v1/traces'
        )
        self.provider = TracerProvider(resource=Resource.create({"service.name": os.getenv("APP_NAME", "dicom-analyzer")}))
        self.provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter(endpoint=endpoint, timeout=5)))
        self.tracer = self.provider.get_tracer("dicom-analyzer")
        host, port = os.getenv("METRICS_ADDR", ":9100").rsplit(":", 1)
        self.server, self.thread = start_http_server(int(port), addr=host or "0.0.0.0", registry=self.registry)
        LOG.info("Observability started", extra={"fields": {"metrics_port": self.server.server_port}})

    def close(self):
        if self.server:
            self.server.shutdown()
            self.server.server_close()
            self.thread.join()
        if self.provider:
            self.provider.shutdown()

    def count(self, operation, outcome):
        self.events.labels(operation, outcome).inc()

    @contextmanager
    def operation(self, operation, *, fields=None, kind=SpanKind.CLIENT, context=None):
        fields = fields or {}
        attrs = {"messaging.system": "nats", "messaging.operation.name": operation}
        attrs.update(fields)
        started = time.monotonic()
        with self.tracer.start_as_current_span(f"nats.{operation}", kind=kind, context=context, attributes=attrs) as span:
            try:
                yield span
            except Exception:
                self.count(operation, "error")
                LOG.exception("NATS %s failed", operation, extra={"fields": fields})
                raise
            else:
                self.count(operation, "ok")
            finally:
                self.duration.labels(operation).observe(time.monotonic() - started)

    async def acknowledge(self, message, action, fields):
        with self.operation(action, fields=fields):
            if action == "ack":
                await message.ack_sync()
            elif action == "nak":
                await message.nak(delay=5)
            else:
                await message.term()
            LOG.info("NATS %s sent", action, extra={"fields": fields})


DEFAULT = Observability()
