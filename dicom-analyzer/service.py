import asyncio
import base64
from contextlib import suppress
from datetime import datetime, timezone
import json
import logging
import os
import shutil
import signal
import tempfile
import time
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen
from uuid import UUID, NAMESPACE_URL, uuid5

from observability import DEFAULT, PROPAGATOR, Observability, SpanKind, StatusCode, configure_logging

STREAM = "DICOM_EVENTS"
DURABLE = "analyzer-requests"
REQUESTED = "dicom.analysis.requested"
LOG = logging.getLogger("dicom-analyzer")


def decode_request(payload):
    event = json.loads(payload)
    if not isinstance(event, dict) or type(event.get("version")) is not int or event["version"] != 1:
        raise ValueError("invalid envelope")
    for key in ("event_id", "job_id"):
        if not isinstance(event.get(key), str) or UUID(event[key]).int == 0:
            raise ValueError("invalid UUID")
    dicom_id = event.get("dicom_id")
    if not isinstance(dicom_id, str) or not dicom_id.strip() or len(dicom_id.encode()) > 256:
        raise ValueError("invalid dicom_id")
    timestamp = event.get("occurred_at")
    if not isinstance(timestamp, str):
        raise ValueError("missing occurred_at")
    date = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
    if date.tzinfo is None or date.year == 1:
        raise ValueError("invalid occurred_at")
    if event.get("status") != "pending" or event.get("result") is not None:
        raise ValueError("invalid request status/result")
    return event


class Analyzer:
    def __init__(self, qc):
        self.qc = qc
        host = os.getenv("ORTHANC_HOST", "localhost")
        port = os.getenv("ORTHANC_PORT", "8042")
        self.url = f"http://{host}:{port}"
        credentials = f'{os.getenv("ORTHANC_NAME", "")}:{os.getenv("ORTHANC_PASSWORD", "")}'
        self.token = os.getenv("ORTHANC_TOKEN") or base64.b64encode(credentials.encode()).decode()

    def process(self, event):
        request = Request(
            f'{self.url}/instances/{quote(event["dicom_id"], safe="")}/file',
            headers={"Authorization": f"Basic {self.token}"},
        )

        with tempfile.TemporaryDirectory(prefix="dicom-analyzer-") as directory:
            path = os.path.join(directory, "image.dcm")
            with urlopen(request, timeout=30) as response, open(path, "wb") as output:
                shutil.copyfileobj(response, output)
            return self.qc.process(path)


def result_event(request, result):
    status = result["status"]
    if status not in ("completed", "failed"):
        raise ValueError("invalid QC status")
    event = {
        "version": 1,
        "event_id": str(uuid5(NAMESPACE_URL, f'dicom-analyzer:{request["event_id"]}')),
        "job_id": request["job_id"], "dicom_id": request["dicom_id"],
        "status": status, "occurred_at": datetime.now(timezone.utc).isoformat(),
    }
    if status == "failed":
        event["error"] = result.get("error") or "DICOM analysis failed"
    else:
        event["result"] = {key: result[key] for key in (
            "anatomical_region", "confidence", "violations", "duration_ms", "metadata",
        )}
    return event


async def heartbeat(message, interval=20, obs=DEFAULT, fields=None):
    while True:
        await asyncio.sleep(interval)
        try:
            await message.in_progress()
            obs.count("heartbeat", "ok")
        except Exception:
            obs.count("heartbeat", "error")
            LOG.exception("Could not extend ACK deadline", extra={"fields": fields or {}})


async def handle(message, js, analyzer, obs=DEFAULT):
    obs.count("consume", "received")
    obs.last_received.set_to_current_time()
    obs.active.inc()
    started = time.monotonic()
    try:
        context = PROPAGATOR.extract(message.headers or {})
        with obs.tracer.start_as_current_span(
            "nats.consume", kind=SpanKind.CONSUMER, context=context,
            attributes={"messaging.system": "nats", "messaging.destination.name": REQUESTED},
        ) as span:
            await _handle(message, js, analyzer, obs, span)
    finally:
        obs.active.dec()
        obs.duration.labels("consume").observe(time.monotonic() - started)


async def _handle(message, js, analyzer, obs, span):
    fields = {"subject": REQUESTED}
    try:
        request = decode_request(message.data)
    except (ValueError, TypeError, UnicodeError):
        obs.count("consume", "rejected")
        span.set_status(StatusCode.ERROR, "Invalid request")
        LOG.warning("Rejecting invalid analysis request", extra={"fields": fields})
        await obs.acknowledge(message, "term", fields)
        return
    fields.update(job_id=request["job_id"], event_id=request["event_id"])
    span.set_attributes(fields)
    deliveries = message.metadata.num_delivered
    if deliveries > 1:
        obs.count("consume", "redelivered")
    LOG.info("NATS request received", extra={"fields": fields | {"deliveries": deliveries}})
    progress = asyncio.create_task(heartbeat(message, obs=obs, fields=fields))
    try:
        try:
            result = await asyncio.to_thread(analyzer.process, request)
        except HTTPError as exc:
            if exc.code not in (400, 404, 410, 422):
                raise  # Infrastructure/auth errors may be repaired; retry.
            result = {"status": "failed", "error": f"Orthanc returned HTTP {exc.code}"}
        except (URLError, TimeoutError, OSError):
            raise
        except Exception as exc:
            LOG.exception("Analysis failed for job %s", request["job_id"])
            result = {"status": "failed", "error": f"{type(exc).__name__}: {exc}"}
        event = result_event(request, result)
        obs.count("consume", event["status"])
        if event["status"] == "failed":
            span.set_status(StatusCode.ERROR, "Analysis failed")
            LOG.warning("Analysis failed", extra={"fields": fields | {"error": event["error"]}})
        subject = f'dicom.analysis.{event["status"]}'
        publish_fields = {"subject": subject, "job_id": event["job_id"], "event_id": event["event_id"]}
        with obs.operation("publish", kind=SpanKind.PRODUCER, fields=publish_fields):
            headers = {"Nats-Msg-Id": event["event_id"]}
            PROPAGATOR.inject(headers)
            LOG.info("Publishing NATS result", extra={"fields": publish_fields})
            await js.publish(subject, json.dumps(event, ensure_ascii=False, allow_nan=False).encode(), headers=headers)
            obs.last_published.set_to_current_time()
            LOG.info("NATS result published", extra={"fields": publish_fields})
        await obs.acknowledge(message, "ack", fields)
        obs.count("consume", "ok")
    except Exception as exc:
        span.record_exception(exc)
        span.set_status(StatusCode.ERROR, type(exc).__name__)
        obs.count("consume", "retry")
        obs.count("consume", "error")
        LOG.exception("Request will be retried", extra={"fields": fields})
        await obs.acknowledge(message, "nak", fields)
    finally:
        progress.cancel()
        with suppress(asyncio.CancelledError):
            await progress


async def run(obs=None):
    owned = obs is None
    obs = obs or Observability()
    try:
        if owned:
            obs.start()
        await consume(obs)
    except Exception:
        LOG.exception("Analyzer stopped with an error")
        raise
    finally:
        obs.ready.set(0)
        obs.connected.set(0)
        if owned:
            await asyncio.to_thread(obs.close)


async def consume(obs):
    import nats
    from nats.js.api import AckPolicy, ConsumerConfig, DeliverPolicy, StreamConfig
    from nats.js.errors import NotFoundError
    from main import QCService

    replicas = int(os.getenv("NATS_REPLICAS", "1"))
    if not 1 <= replicas <= 5:
        raise ValueError("invalid NATS_REPLICAS")
    analyzer = Analyzer(QCService(models_dir=os.getenv("MODELS_DIR")))
    stop = asyncio.Event()
    for sig in (signal.SIGINT, signal.SIGTERM):
        asyncio.get_running_loop().add_signal_handler(sig, stop.set)
    credentials = {}
    if os.getenv("DICOM_ANALYZER_PASSWORD"):
        credentials = {"user": "dicom-analyzer", "password": os.environ["DICOM_ANALYZER_PASSWORD"]}
    consumer_initialized = False

    async def disconnected():
        obs.connected.set(0)
        obs.ready.set(0)
        LOG.warning("NATS disconnected")

    async def reconnected():
        obs.connected.set(1)
        obs.ready.set(int(consumer_initialized))
        obs.count("connection", "reconnected")
        LOG.info("NATS reconnected")

    async def connection_error(exc):
        obs.count("connection", "error")
        LOG.error("NATS connection error", extra={"fields": {"error": str(exc)}})

    LOG.info("Connecting to NATS")
    nc = await nats.connect(
        servers=os.getenv("NATS_URL", "nats://localhost:4222").split(","),
        name="dicom-analyzer", connect_timeout=5,
        max_reconnect_attempts=-1, reconnect_time_wait=1,
        disconnected_cb=disconnected, reconnected_cb=reconnected, error_cb=connection_error, **credentials,
    )
    obs.connected.set(1)
    obs.count("connection", "ok")
    LOG.info("NATS connected")
    try:
        js = nc.jetstream(timeout=5)
        try:
            await js.stream_info(STREAM)
        except NotFoundError:
            await js.add_stream(config=StreamConfig(
                name=STREAM, subjects=["dicom.>"], storage="file", retention="limits",
                discard="new", max_age=30 * 24 * 3600, max_bytes=1 << 30,
                num_replicas=replicas, duplicate_window=600,
            ))
        subscription = await js.pull_subscribe(
            REQUESTED, durable=DURABLE, stream=STREAM,
            config=ConsumerConfig(
                durable_name=DURABLE, filter_subject=REQUESTED,
                ack_policy=AckPolicy.EXPLICIT, deliver_policy=DeliverPolicy.ALL,
                ack_wait=60, max_ack_pending=100,
            ),
        )
        consumer_initialized = True
        obs.ready.set(1)
        LOG.info("NATS consumer ready", extra={"fields": {"subject": REQUESTED, "stream": STREAM, "durable": DURABLE}})
        while not stop.is_set():
            try:
                messages = await subscription.fetch(1, timeout=1)
            except nats.errors.TimeoutError:
                continue
            except Exception:
                obs.count("fetch", "error")
                LOG.exception("NATS fetch failed", extra={"fields": {"subject": REQUESTED}})
                raise
            for message in messages:
                await handle(message, js, analyzer, obs)
    finally:
        obs.ready.set(0)
        LOG.info("Draining NATS connection")
        await nc.drain()


if __name__ == "__main__":
    configure_logging()
    asyncio.run(run())
