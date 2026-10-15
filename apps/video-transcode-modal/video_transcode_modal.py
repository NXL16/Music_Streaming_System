"""Modal L4 endpoint for encrypted adaptive HLS music-video transcoding.

Deploy with:
  modal deploy apps/video-transcode-modal/video_transcode_modal.py
"""

from __future__ import annotations

import base64
import hashlib
import json
import os
import secrets
import subprocess
import tempfile
import time
import uuid
from functools import wraps
from pathlib import Path
from typing import Annotated

import modal
from fastapi import Header, HTTPException

app = modal.App("music-video-transcode")
image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg")
    .pip_install("boto3", "cryptography", "fastapi[standard]")
)
TARGET_RENDITIONS = [
    ("720p", 720, "2800k", 2_800_000),
    ("1080p", 1080, "5000k", 5_000_000),
    ("1440p", 1440, "9000k", 9_000_000),
    ("2160p", 2160, "14000k", 14_000_000),
]
POSTER_WIDTHS = [320, 480, 640, 960, 1280, 1920, 2400]
OPERATION_STALE_SECONDS = 95 * 60
# Keep GPU H.264 GOPs aligned with short VOD HLS segments. NVENC defaults to
# 250 frames (~8.33 seconds at 30fps), which is too long for looping artwork.
HLS_FRAME_RATE = 30
EDITORIAL_HLS_SEGMENT_SECONDS = 2
MUSIC_VIDEO_HLS_SEGMENT_SECONDS = 4
# Music-video posters use a consistent landscape canvas. The source frame is
# fitted inside it rather than cropped, so ultrawide and portrait videos retain
# their complete image with black letterboxing/pillarboxing.
MUSIC_VIDEO_POSTER_ASPECT_RATIO = 16 / 9


def require_token(authorization: str | None) -> None:
    secret = os.environ.get("VIDEO_TRANSCODE_SHARED_SECRET", "")
    if not secret or authorization != f"Bearer {secret}":
        raise HTTPException(status_code=401, detail="unauthorized")


def r2_client():
    import boto3

    return boto3.client(
        "s3",
        endpoint_url=os.environ["R2_ENDPOINT"],
        aws_access_key_id=os.environ["R2_ACCESS_KEY"],
        aws_secret_access_key=os.environ["R2_SECRET_KEY"],
        region_name="auto",
    )


def run(*args: str) -> str:
    completed = subprocess.run(args, check=True, capture_output=True, text=True)
    return completed.stdout


def poster_bg_color(path: Path) -> str:
    """Return the average RGB colour of a poster as a CSS hex value."""
    pixels = subprocess.run(
        [
            "ffmpeg", "-v", "error", "-i", str(path), "-frames:v", "1",
            "-vf", "scale=1:1:flags=area", "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1",
        ],
        check=True,
        capture_output=True,
    ).stdout
    if len(pixels) < 3:
        raise ValueError("POSTER_PALETTE_INVALID")
    return f"{pixels[0]:02x}{pixels[1]:02x}{pixels[2]:02x}"


def probe(path: Path) -> tuple[int, int, float]:
    output = json.loads(run("ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(path)))
    video = next((stream for stream in output.get("streams", []) if stream.get("codec_type") == "video"), {})
    width, height = int(video.get("width") or 0), int(video.get("height") or 0)
    duration = float((output.get("format") or {}).get("duration") or 0)
    if width <= 0 or height <= 0 or duration <= 0:
        raise ValueError("VIDEO_METADATA_INVALID")
    return width, height, duration


def encrypt_hls_key(key: bytes) -> dict[str, str]:
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM

    master = bytes.fromhex(os.environ["ASSET_VIDEO_KEY_ENCRYPTION_KEY"])
    if len(master) != 32 or len(key) != 16:
        raise ValueError("MUSIC_VIDEO_KEY_INVALID")
    iv = secrets.token_bytes(12)
    encrypted = AESGCM(master).encrypt(iv, key, None)
    return {
        "ciphertext": base64.b64encode(encrypted[:-16]).decode(),
        "iv": base64.b64encode(iv).decode(),
        "authTag": base64.b64encode(encrypted[-16:]).decode(),
    }


def content_type(path: Path) -> str:
    if path.suffix == ".ts":
        return "video/MP2T"
    if path.suffix == ".m3u8":
        return "application/x-mpegURL"
    if path.suffix == ".webp":
        return "image/webp"
    return "application/octet-stream"


def even(value: float) -> int:
    """H.264 yuv420p requires even dimensions."""
    return max(2, round(value / 2) * 2)


def output_renditions(source_width: int, source_height: int) -> list[tuple[str, int, int, str, int]]:
    """Create adaptive HLS renditions without changing the source aspect ratio."""
    aspect_ratio = source_width / source_height
    targets = [item for item in TARGET_RENDITIONS if item[1] <= source_height]
    if not targets:
        height = max(2, source_height // 2 * 2)
        return [
            (f"{height}p", even(height * aspect_ratio), height, "2800k", 2_800_000)
        ]

    return [
        (name, even(height * aspect_ratio), even(height), bitrate, bandwidth)
        for name, height, bitrate, bandwidth in targets
    ]


def operation_prefix(asset_id: str, operation_id: str) -> str:
    return f"internal/video-operations/{asset_id}/{operation_id}"


def read_json(s3, bucket: str, key: str) -> dict | None:
    from botocore.exceptions import ClientError

    try:
        response = s3.get_object(Bucket=bucket, Key=key)
    except ClientError as error:
        code = str(error.response.get("Error", {}).get("Code", ""))
        if code in {"404", "NoSuchKey", "NotFound"}:
            return None
        raise
    return json.loads(response["Body"].read())


def write_json(s3, bucket: str, key: str, value: dict) -> None:
    s3.put_object(
        Bucket=bucket,
        Key=key,
        Body=json.dumps(value, separators=(",", ":")).encode(),
        ContentType="application/json",
        CacheControl="no-store",
    )


def video_operation_status(s3, bucket: str, asset_id: str, operation_id: str) -> dict:
    prefix = operation_prefix(asset_id, operation_id)
    result = read_json(s3, bucket, f"{prefix}/result.json")
    if result:
        return result
    state = read_json(s3, bucket, f"{prefix}/state.json") or {}
    if state.get("status") == "FAILED":
        return {"status": "FAILED", "error": str(state.get("error") or "VIDEO_TRANSCODE_MODAL_FAILED")}
    return {"status": "PROCESSING"}


def persist_operation_failure(handler):
    @wraps(handler)
    def wrapped(payload: dict, *args, **kwargs):
        try:
            return handler(payload, *args, **kwargs)
        except Exception as error:
            operation = str(payload.get("operation", "transcode")).strip()
            asset_id = str(payload.get("assetId", "")).strip()
            operation_id = str(payload.get("operationId", "")).strip()
            client_error = isinstance(error, HTTPException) and error.status_code < 500
            if operation == "transcode" and asset_id and operation_id and not client_error:
                try:
                    s3, bucket = r2_client(), os.environ["R2_BUCKET"]
                    write_json(
                        s3,
                        bucket,
                        f"{operation_prefix(asset_id, operation_id)}/state.json",
                        {"status": "FAILED", "failedAt": time.time(), "error": "VIDEO_TRANSCODE_MODAL_FAILED"},
                    )
                except Exception:
                    pass
            raise
    return wrapped


def create_posters(
    source: Path,
    workspace: Path,
    output_prefix: str,
    cdn: str,
    maximum_width: int,
    aspect_ratio: float,
    poster_timestamp_millis: int,
    target_aspect_ratio: float | None = None,
) -> list[dict]:
    posters = []
    generated_widths: set[int] = set()
    for requested_width in POSTER_WIDTHS:
        actual_width = min(requested_width, maximum_width)
        # WebP needs even dimensions. For a 16:9 canvas, use a width divisible
        # by 32 so its 9/16 height is also an exact, even integer.
        if target_aspect_ratio:
            actual_width = max(32, actual_width // 32 * 32)
        if actual_width in generated_widths:
            continue
        generated_widths.add(actual_width)
        poster_aspect_ratio = target_aspect_ratio or aspect_ratio
        actual_height = (
            actual_width * 9 // 16
            if target_aspect_ratio
            else max(1, round(actual_width / poster_aspect_ratio))
        )
        poster_name = f"poster-{actual_width}w.webp"
        path = workspace / poster_name
        video_filter = f"scale={actual_width}:{actual_height}"
        if target_aspect_ratio:
            video_filter = (
                f"scale={actual_width}:{actual_height}:force_original_aspect_ratio=decrease,"
                f"pad={actual_width}:{actual_height}:(ow-iw)/2:(oh-ih)/2:color=black"
            )
        run(
            "ffmpeg", "-y", "-ss", f"{poster_timestamp_millis / 1000:.3f}",
            "-i", str(source), "-frames:v", "1", "-vf", video_filter,
            str(path),
        )
        posters.append({
            "objectKey": f"{output_prefix}/{poster_name}",
            "url": f"{cdn}/{output_prefix}/{poster_name}",
            "contentType": "image/webp",
            "width": actual_width,
            "height": actual_height,
            "sizeBytes": path.stat().st_size,
        })
    return posters


def poster_payload(posters: list[dict], workspace: Path, poster_timestamp_millis: int) -> dict:
    primary = posters[-1]
    return {
        **primary,
        "timestampMillis": poster_timestamp_millis,
        "bgColor": poster_bg_color(workspace / Path(primary["objectKey"]).name),
        "variants": {"renditions": posters},
    }


@app.function(
    image=image,
    timeout=30,
    max_containers=10,
    secrets=[
        modal.Secret.from_name("music-r2"),
        modal.Secret.from_name("music-video-transcode"),
    ],
)
@modal.fastapi_endpoint(method="POST", docs=True)
def status(payload: dict, authorization: Annotated[str | None, Header()] = None) -> dict:
    """Read a durable video operation result without allocating a GPU."""
    require_token(authorization)
    asset_id = str(payload.get("assetId", "")).strip()
    operation_id = str(payload.get("operationId", "")).strip()
    if not asset_id or not operation_id:
        raise HTTPException(status_code=400, detail="assetId and operationId are required")
    s3, bucket = r2_client(), os.environ["R2_BUCKET"]
    return video_operation_status(s3, bucket, asset_id, operation_id)


@app.function(
    image=image,
    gpu=["L4", "A10", "T4"],
    timeout=90 * 60,
    max_containers=2,
    secrets=[
        modal.Secret.from_name("music-r2"),
        modal.Secret.from_name("music-video-transcode"),
    ],
)
@modal.fastapi_endpoint(method="POST", docs=True)
@persist_operation_failure
def transcode(payload: dict, authorization: Annotated[str | None, Header()] = None) -> dict:
    """Transcode a video or replace only its poster renditions."""
    require_token(authorization)
    operation = str(payload.get("operation", "transcode")).strip()
    asset_id = str(payload.get("assetId", "")).strip()
    operation_id = str(payload.get("operationId", "")).strip()
    source_key = str(payload.get("sourceKey", "")).strip()
    filename = str(payload.get("filename", "video.mp4")).strip()
    checksum = str(payload.get("checksum", "")).strip().lower()
    content_type_value = str(payload.get("contentType", "video/mp4")).strip()
    poster_timestamp_millis = int(payload.get("posterTimestampMillis") or 0)
    if operation not in {"transcode", "replace_poster"}:
        raise HTTPException(status_code=400, detail="unsupported operation")
    if not asset_id or not source_key or len(checksum) != 64:
        raise HTTPException(status_code=400, detail="assetId, sourceKey and checksum are required")
    if poster_timestamp_millis < 0:
        raise HTTPException(status_code=400, detail="posterTimestampMillis must be non-negative")
    if operation == "transcode" and not operation_id:
        raise HTTPException(status_code=400, detail="operationId is required")

    s3, bucket = r2_client(), os.environ["R2_BUCKET"]
    cdn = os.environ["CDN_URL"].rstrip("/")
    key_base = os.environ["ASSET_VIDEO_KEY_URI_BASE"].rstrip("/")
    is_music_video = str(payload.get("purpose", "")).strip() == "MUSIC_VIDEO"
    hls_segment_seconds = (
        MUSIC_VIDEO_HLS_SEGMENT_SECONDS
        if is_music_video
        else EDITORIAL_HLS_SEGMENT_SECONDS
    )
    hls_gop_frames = HLS_FRAME_RATE * hls_segment_seconds
    if operation == "transcode":
        operation_state_prefix = operation_prefix(asset_id, operation_id)
        cached = read_json(s3, bucket, f"{operation_state_prefix}/result.json")
        if cached:
            return cached
        state = read_json(s3, bucket, f"{operation_state_prefix}/state.json") or {}
        started_at = float(state.get("startedAt") or 0)
        if state.get("status") == "PROCESSING" and time.time() - started_at < OPERATION_STALE_SECONDS:
            return {"status": "PROCESSING"}
        write_json(
            s3,
            bucket,
            f"{operation_state_prefix}/state.json",
            {"status": "PROCESSING", "startedAt": time.time()},
        )
    suffix = Path(filename).suffix or ".video"
    with tempfile.TemporaryDirectory(prefix="music-video-") as temporary:
        workspace = Path(temporary)
        source = workspace / f"source{suffix}"
        s3.download_file(bucket, source_key, str(source))
        with source.open("rb") as source_file:
            if hashlib.file_digest(source_file, "sha256").hexdigest() != checksum:
                raise RuntimeError("VIDEO_CHECKSUM_MISMATCH")
        source_width, source_height, duration = probe(source)
        active = output_renditions(source_width, source_height)
        output_width = active[-1][1]
        output_height = active[-1][2]
        poster_timestamp_millis = min(
            poster_timestamp_millis,
            max(0, round(duration * 1000) - 1),
        )
        if operation == "replace_poster":
            generation = str(payload.get("generation", "")).strip().strip("/")
            expected_generation = f"processed/{asset_id}/video/"
            if not generation.startswith(expected_generation):
                raise HTTPException(status_code=400, detail="music video generation is required")
            poster_prefix = f"{generation}/poster/{uuid.uuid4()}"
            posters = create_posters(
                source, workspace, poster_prefix, cdn, output_width,
                source_width / source_height,
                poster_timestamp_millis,
                MUSIC_VIDEO_POSTER_ASPECT_RATIO if is_music_video else None,
            )
            for poster in posters:
                local_path = workspace / Path(poster["objectKey"]).name
                s3.upload_file(
                    str(local_path), bucket, poster["objectKey"],
                    ExtraArgs={"ContentType": "image/webp"},
                )
            return {"poster": poster_payload(posters, workspace, poster_timestamp_millis)}

        generation = f"processed/{asset_id}/video/{operation_id}"
        hls_key = secrets.token_bytes(16) if is_music_video else None
        key_info = workspace / "hls-key-info.txt"
        if hls_key:
            key_path = workspace / "hls.key"
            key_path.write_bytes(hls_key)
            key_info.write_text(f"{key_base}/{asset_id}/key\n{key_path}\n")
        renditions: list[dict] = []
        for name, width, height, bitrate, bandwidth in active:
            playlist = f"{secrets.token_hex(12)}.m3u8"
            segment_prefix = secrets.token_urlsafe(18)
            segment_pattern = workspace / f"{segment_prefix}_%013d.ts"
            run(
                "ffmpeg", "-y", "-i", str(source),
                "-map", "0:v:0",
                *( ["-map", "0:a:0?", "-c:a", "aac", "-b:a", "160k"] if is_music_video else ["-an"] ),
                "-vf", f"scale={width}:{height}", "-r", str(HLS_FRAME_RATE),
                "-c:v", "h264_nvenc",
                "-preset", "p4", "-rc", "vbr", "-cq", "23", "-b:v", bitrate,
                "-maxrate", bitrate, "-bufsize", f"{int(bitrate[:-1]) * 2}k", "-pix_fmt", "yuv420p",
                "-g", str(hls_gop_frames), "-keyint_min", str(hls_gop_frames), "-forced-idr", "1",
                "-force_key_frames", f"expr:gte(t,n_forced*{hls_segment_seconds})", "-sc_threshold", "0",
                "-hls_time", str(hls_segment_seconds), "-hls_playlist_type", "vod", "-hls_flags", "independent_segments",
                "-hls_start_number_source", "epoch_us", "-hls_segment_filename", str(segment_pattern),
                *( ["-hls_key_info_file", str(key_info)] if hls_key else [] ), str(workspace / playlist),
            )
            renditions.append({"name": name, "width": width, "height": height, "bandwidth": bandwidth, "playlist": playlist, "segmentPrefix": segment_prefix})

        posters = create_posters(
            source, workspace, generation, cdn, output_width,
            source_width / source_height,
            poster_timestamp_millis,
            MUSIC_VIDEO_POSTER_ASPECT_RATIO if is_music_video else None,
        )
        master = workspace / "default.m3u8"
        master.write_text("#EXTM3U\n#EXT-X-VERSION:3\n" + "".join(
            f"#EXT-X-STREAM-INF:BANDWIDTH={item['bandwidth']},RESOLUTION={item['width']}x{item['height']}\n{item['playlist']}\n"
            for item in renditions
        ))
        for path in workspace.iterdir():
            if path.is_file() and path.name != source.name and path.name not in {"hls.key", "hls-key-info.txt"}:
                s3.upload_file(str(path), bucket, f"{generation}/{path.name}", ExtraArgs={"ContentType": content_type(path)})
        master_key = f"{generation}/default.m3u8"
        public_url = f"{cdn}/{master_key}"
        result = {
            "publicUrl": public_url,
            "width": output_width,
            "height": output_height,
            "durationMillis": round(duration * 1000),
            "variants": {
                "original": {"width": source_width, "height": source_height, "durationMillis": round(duration * 1000), "contentType": content_type_value},
                "generation": generation,
                "renditions": [{"objectKey": master_key, "url": public_url, "contentType": "application/x-mpegURL", "width": output_width, "height": output_height, "sizeBytes": master.stat().st_size}] + [
                    {"objectKey": f"{generation}/{item['playlist']}", "url": f"{cdn}/{generation}/{item['playlist']}", "contentType": "application/x-mpegURL", "width": item["width"], "height": item["height"], "sizeBytes": 0}
                    for item in renditions
                ],
                "poster": poster_payload(posters, workspace, poster_timestamp_millis),
            },
            **({"videoEncryption": encrypt_hls_key(hls_key)} if hls_key else {}),
        }
        write_json(s3, bucket, f"{operation_state_prefix}/result.json", result)
        write_json(
            s3,
            bucket,
            f"{operation_state_prefix}/state.json",
            {"status": "READY", "completedAt": time.time()},
        )
        return result
