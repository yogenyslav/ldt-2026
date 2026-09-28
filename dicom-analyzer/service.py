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
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen
from uuid import UUID, NAMESPACE_URL, uuid5

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


async def heartbeat(message, interval=20):
    while True:
        await asyncio.sleep(interval)
        try:
            await message.in_progress()
        except Exception:
            LOG.exception("Could not extend ACK deadline")


async def handle(message, js, analyzer):
    try:
        request = decode_request(message.data)
    except (ValueError, TypeError, UnicodeError):
        LOG.warning("Rejecting invalid analysis request")
        await message.term()
        return
    progress = asyncio.create_task(heartbeat(message))
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
        await js.publish(
            f'dicom.analysis.{event["status"]}',
            json.dumps(event, ensure_ascii=False, allow_nan=False).encode(),
            headers={"Nats-Msg-Id": event["event_id"]},
        )
        await message.ack_sync()
        LOG.info("Job %s: %s", request["job_id"], event["status"])
    except Exception:
        LOG.exception("Request will be retried")
        await message.nak(delay=5)
    finally:
        progress.cancel()
        with suppress(asyncio.CancelledError):
            await progress


async def run():
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
    nc = await nats.connect(
        servers=os.getenv("NATS_URL", "nats://localhost:4222").split(","),
        name="dicom-analyzer", connect_timeout=5,
        max_reconnect_attempts=-1, reconnect_time_wait=1, **credentials,
    )
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
        LOG.info("Listening on %s", REQUESTED)
        while not stop.is_set():
            try:
                messages = await subscription.fetch(1, timeout=1)
            except nats.errors.TimeoutError:
                continue
            for message in messages:
                await handle(message, js, analyzer)
    finally:
        await nc.drain()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    asyncio.run(run())
