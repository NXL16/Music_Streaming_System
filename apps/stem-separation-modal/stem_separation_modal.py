"""Modal GPU endpoint for BS-RoFormer stem separation.

Deploy with: modal deploy apps/stem-separation-modal/stem_separation_modal.py
"""

from __future__ import annotations

import os
import json
import subprocess
import tempfile
from threading import Lock
from pathlib import Path
from typing import Annotated

import modal
from botocore.exceptions import ClientError
from fastapi import Header, HTTPException

app = modal.App("music-stem-separation")
model_cache = modal.Volume.from_name("bs-roformer-model-cache", create_if_missing=True)
image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg")
    .pip_install(
        "audio-separator",
        "onnxruntime-gpu",
        "boto3",
        "fastapi[standard]",
    )
)
MODEL_NAME = "model_bs_roformer_ep_317_sdr_12.9755.ckpt"
DEFAULT_HIGH_QUALITY_MIN_BITRATE = 300_000
_separators: dict[str, object] = {}
_separator_lock = Lock()


def r2_client():
    import boto3

    return boto3.client(
        "s3",
        endpoint_url=os.environ["R2_ENDPOINT"],
        aws_access_key_id=os.environ["R2_ACCESS_KEY"],
        aws_secret_access_key=os.environ["R2_SECRET_KEY"],
        region_name="auto",
    )


def configure_output_dir(separator, output_dir: Path) -> None:
    """Point both audio-separator layers at the current request directory.

    ``Separator.load_model()`` passes a snapshot of ``output_dir`` to its
    architecture-specific model. Updating only the top-level ``Separator``
    instance therefore leaves a warm model writing into a previous request's
    temporary directory.
    """

    target_dir = str(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    separator.output_dir = target_dir

    model_instance = getattr(separator, "model_instance", None)
    if model_instance is None:
        raise RuntimeError("BS-RoFormer model is not initialized")
    model_instance.output_dir = target_dir


def select_output_format(source_path: Path) -> str:
    """Keep lossless stems only when a 320k/lossless source can benefit."""
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "a:0", "-show_entries",
         "stream=codec_name,bit_rate:format=bit_rate", "-of", "json", str(source_path)],
        check=True, capture_output=True, text=True,
    )
    stream = (json.loads(result.stdout).get("streams") or [{}])[0]
    codec = str(stream.get("codec_name") or "").lower()
    # VBR MP3/AAC commonly omits stream.bit_rate even when the container has
    # a reliable average bitrate. Falling back to format.bit_rate keeps a
    # genuine 320 kbps upload eligible for the high rendition.
    container = json.loads(result.stdout).get("format") or {}
    bitrate = int(stream.get("bit_rate") or container.get("bit_rate") or 0)
    try:
        minimum_high_bitrate = int(os.environ.get("HIGH_QUALITY_MIN_BITRATE", ""))
    except ValueError:
        minimum_high_bitrate = DEFAULT_HIGH_QUALITY_MIN_BITRATE
    if minimum_high_bitrate <= 0:
        minimum_high_bitrate = DEFAULT_HIGH_QUALITY_MIN_BITRATE
    return "flac" if codec in {"flac", "pcm_s16le", "pcm_s24le", "pcm_s32le", "alac"} or bitrate >= minimum_high_bitrate else "m4a"


def encode_aac_128(source_path: Path, output_path: Path) -> Path:
    """Create the sole lossy rendition for low-quality stem inputs."""
    subprocess.run(
        [
            "ffmpeg", "-y", "-i", str(source_path), "-map", "0:a:0",
            "-dn", "-sn", "-map_metadata", "-1", "-c:a", "aac",
            "-b:a", "128k", str(output_path),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    return output_path


def require_service_token(authorization: str | None) -> None:
    expected = os.environ.get("STEM_SEPARATION_SHARED_SECRET", "")
    if not expected or authorization != f"Bearer {expected}":
        raise HTTPException(status_code=401, detail="unauthorized")


def has_complete_staging_stems(s3, bucket: str, vocal_key: str, instrumental_key: str) -> bool:
    """Return true only when a previous attempt uploaded a complete, usable pair."""
    try:
        vocal = s3.head_object(Bucket=bucket, Key=vocal_key)
        instrumental = s3.head_object(Bucket=bucket, Key=instrumental_key)
    except ClientError as error:
        status_code = error.response.get("ResponseMetadata", {}).get("HTTPStatusCode")
        if status_code == 404:
            return False
        raise

    return bool(vocal.get("ContentLength")) and bool(instrumental.get("ContentLength"))


def separate_to_output(source_path: Path, output_dir: Path, output_format: str) -> list[str]:
    """Reuse one model per output format and serialize its mutable output dir."""

    with _separator_lock:
        separator = _separators.get(output_format)
        if separator is None:
            from audio_separator.separator import Separator

            separator = Separator(
                model_file_dir="/models",
                output_dir=str(output_dir),
                output_format=output_format,
            )
            separator.load_model(model_filename=MODEL_NAME)
            _separators[output_format] = separator
            # Persist the first downloaded model for future cold containers.
            model_cache.commit()

        # Keep the wrapper and the loaded architecture's output directory in
        # sync. Requests are serialized by `_separator_lock`, so this mutable
        # setting cannot leak between concurrent calls.
        configure_output_dir(separator, output_dir)

        return separator.separate(str(source_path))


@app.function(
    image=image,
    timeout=30,
    secrets=[modal.Secret.from_name("music-r2")],
)
@modal.fastapi_endpoint(method="GET", docs=True)
def health(authorization: Annotated[str | None, Header()] = None) -> dict:
    """Low-cost readiness check; does not allocate a GPU or load the model."""
    require_service_token(authorization)

    import onnxruntime as ort

    r2_client().head_bucket(Bucket=os.environ["R2_BUCKET"])
    return {
        "status": "ok",
        "onnxruntimeVersion": ort.__version__,
        "executionProviders": ort.get_available_providers(),
        "r2": "ok",
    }


@app.function(
    image=image,
    gpu="L4",
    timeout=20 * 60,
    volumes={"/models": model_cache},
    secrets=[modal.Secret.from_name("music-r2")],
)
@modal.fastapi_endpoint(method="POST", docs=True)
def separate(
    payload: dict,
    authorization: Annotated[str | None, Header()] = None,
) -> dict:
    """Read a source from R2 and write BS-RoFormer FLAC or M4A stems to staging."""
    require_service_token(authorization)

    song_id = str(payload.get("songId", "")).strip()
    source_key = str(payload.get("sourceKey", "")).strip()
    if not song_id or not source_key:
        raise ValueError("songId and sourceKey are required")

    bucket = os.environ["R2_BUCKET"]
    s3 = r2_client()
    # A worker retry after packaging/metadata failure must reuse the staging
    # pair. This avoids another GPU separation and makes the operation safe to
    # retry without multiplying cost.
    for extension in ("flac", "m4a"):
        vocal_key = f"staging/{song_id}/vocal.{extension}"
        instrumental_key = f"staging/{song_id}/instrumental.{extension}"
        if has_complete_staging_stems(s3, bucket, vocal_key, instrumental_key):
            return {"songId": song_id, "vocalKey": vocal_key, "instrumentalKey": instrumental_key, "modelVersion": MODEL_NAME}

    with tempfile.TemporaryDirectory(prefix="stem-separation-") as temp:
        workspace = Path(temp)
        source_path = workspace / "source"
        output_dir = workspace / "output"
        output_dir.mkdir()
        s3.download_file(bucket, source_key, str(source_path))
        output_format = select_output_format(source_path)
        extension = "flac" if output_format == "flac" else "m4a"
        vocal_key = f"staging/{song_id}/vocal.{extension}"
        instrumental_key = f"staging/{song_id}/instrumental.{extension}"

        os.environ.setdefault("HF_HOME", "/models/huggingface")
        # Preserve lossless stems for high-quality outputs. Lower-quality
        # sources first produce local WAV, then exactly one AAC 128 encode for
        # staging; the worker can remux it without another lossy pass.
        separator_format = "flac" if output_format == "flac" else "wav"
        generated = separate_to_output(source_path, output_dir, separator_format)

        # audio-separator has returned both absolute paths and bare filenames
        # across releases. Resolve its return value, then also inspect the
        # isolated output directory as the source of truth.
        generated_paths = [Path(item) for item in generated]
        candidates = [
            path if path.is_absolute() else output_dir / path
            for path in generated_paths
        ]
        candidates.extend(path for path in output_dir.rglob("*") if path.is_file())

        def find_stem(name: str) -> Path | None:
            name = name.lower()
            return next(
                (path for path in candidates if name in path.name.lower() and path.is_file()),
                None,
            )

        vocal = find_stem("vocal")
        instrumental = find_stem("instrumental")
        if not vocal or not vocal.exists() or not instrumental or not instrumental.exists():
            generated_names = [str(path) for path in generated_paths]
            output_names = [str(path.relative_to(output_dir)) for path in output_dir.rglob("*") if path.is_file()]
            raise RuntimeError(
                "BS-RoFormer did not produce both stems "
                f"(generated={generated_names}, output={output_names})"
            )

        if output_format == "m4a":
            vocal = encode_aac_128(vocal, workspace / "vocal.m4a")
            instrumental = encode_aac_128(instrumental, workspace / "instrumental.m4a")

        content_type = "audio/flac" if output_format == "flac" else "audio/mp4"
        s3.upload_file(str(vocal), bucket, vocal_key, ExtraArgs={"ContentType": content_type})
        s3.upload_file(
            str(instrumental),
            bucket,
            instrumental_key,
            ExtraArgs={"ContentType": content_type},
        )
        return {
            "songId": song_id,
            "vocalKey": vocal_key,
            "instrumentalKey": instrumental_key,
            "modelVersion": MODEL_NAME,
        }
