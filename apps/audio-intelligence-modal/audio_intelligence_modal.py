"""Modal GPU endpoint for one-time CLAP analysis of an original music mix.

Deploy with:
  modal deploy apps/audio-intelligence-modal/audio_intelligence_modal.py
"""

from __future__ import annotations

import os
import tempfile
from pathlib import Path
from threading import Lock
from typing import Annotated

import modal
from fastapi import Header, HTTPException

APP_NAME = "music-audio-intelligence"
MODEL_ID = "laion/larger_clap_general"
MODEL_REVISION = "78bb1ac2ba8d1c6fb80d054ddf055d274e7fdd6d"
ANALYSIS_VERSION = "clap-larger-general-3"
EMBEDDING_DIMENSION = 512
TAGS = [
    "energetic music", "relaxing music", "melancholic music",
    "happy music", "romantic music", "hip hop", "pop music",
    "rock music", "electronic music", "acoustic music", "piano",
    "guitar", "female vocal", "male vocal", "instrumental music",
]

app = modal.App(APP_NAME)
model_cache = modal.Volume.from_name("clap-model-cache", create_if_missing=True)
image = modal.Image.debian_slim(python_version="3.11").pip_install(
    "boto3", "fastapi[standard]", "transformers>=4.51", "torch", "torchaudio", "librosa",
)
_model = None
_processor = None
_model_lock = Lock()


def require_token(authorization: str | None) -> None:
    secret = os.environ.get("AUDIO_INTELLIGENCE_SHARED_SECRET", "")
    if not secret or authorization != f"Bearer {secret}":
        raise HTTPException(status_code=401, detail="unauthorized")


def r2_client():
    import boto3
    return boto3.client(
        "s3", endpoint_url=os.environ["R2_ENDPOINT"],
        aws_access_key_id=os.environ["R2_ACCESS_KEY"],
        aws_secret_access_key=os.environ["R2_SECRET_KEY"], region_name="auto",
    )


def clap():
    global _model, _processor
    with _model_lock:
        if _model is None:
            from transformers import ClapModel, ClapProcessor
            _processor = ClapProcessor.from_pretrained(MODEL_ID, revision=MODEL_REVISION)
            import torch
            device = "cuda" if torch.cuda.is_available() else "cpu"
            _model = ClapModel.from_pretrained(
                MODEL_ID, revision=MODEL_REVISION
            ).eval().to(device)
            model_cache.commit()
    return _model, _processor


@app.function(
    image=image,
    gpu="L4",
    timeout=15 * 60,
    volumes={"/root/.cache/huggingface": model_cache},
    secrets=[
        modal.Secret.from_name("music-r2"),
        modal.Secret.from_name("music-audio-intelligence"),
    ],
)
@modal.fastapi_endpoint(method="POST", docs=True)
def analyze(payload: dict, authorization: Annotated[str | None, Header()] = None) -> dict:
    """Analyse only a source checksum/version once; the caller owns retries."""
    require_token(authorization)
    song_id = str(payload.get("songId", "")).strip()
    source_key = str(payload.get("sourceKey", "")).strip()
    if not song_id or not source_key:
        raise HTTPException(status_code=400, detail="songId and sourceKey are required")

    import librosa
    import numpy as np
    import torch

    with tempfile.TemporaryDirectory(prefix="clap-") as directory:
        source = Path(directory) / "source"
        r2_client().download_file(os.environ["R2_BUCKET"], source_key, str(source))
        samples, sample_rate = librosa.load(str(source), sr=48_000, mono=True)
        if not len(samples):
            raise HTTPException(status_code=422, detail="audio has no samples")
        model, processor = clap()
        audio_inputs = processor(audio=[samples], sampling_rate=sample_rate, return_tensors="pt")
        text_inputs = processor(text=TAGS, return_tensors="pt", padding=True)
        device = next(model.parameters()).device
        audio_inputs = {key: value.to(device) for key, value in audio_inputs.items()}
        text_inputs = {key: value.to(device) for key, value in text_inputs.items()}
        with torch.no_grad():
            embedding_output = model.get_audio_features(**audio_inputs)
            embedding = getattr(embedding_output, "pooler_output", None)
            if embedding is None:
                raise RuntimeError("CLAP did not return pooler_output")
            if embedding.shape[-1] != EMBEDDING_DIMENSION:
                embedding = model.audio_projection(embedding)
            embedding = embedding.reshape(-1, embedding.shape[-1]).mean(dim=0)
            embedding = torch.nn.functional.normalize(embedding, dim=0)
            if embedding.numel() != EMBEDDING_DIMENSION:
                raise RuntimeError(
                    f"CLAP embedding dimension was {embedding.numel()}, expected {EMBEDDING_DIMENSION}"
                )
            logits = model(**audio_inputs, **text_inputs).logits_per_audio[0]
        probabilities = torch.softmax(logits, dim=0).cpu().tolist()
        ranked = sorted(zip(TAGS, probabilities), key=lambda item: item[1], reverse=True)
        tempo, _ = librosa.beat.beat_track(y=samples, sr=sample_rate)
        energy = float(np.sqrt(np.mean(np.square(samples))))
        return {
            "songId": song_id,
            "analysisVersion": ANALYSIS_VERSION,
            "modelId": MODEL_ID,
            "modelRevision": MODEL_REVISION,
            "bpm": round(float(np.asarray(tempo).reshape(-1)[0]), 2),
            "energy": round(min(1.0, energy * 4), 4),
            "tags": [tag for tag, score in ranked[:5] if score >= 0.03],
            "tagScores": {tag: round(float(score), 5) for tag, score in ranked[:5]},
            "embedding": embedding.cpu().tolist(),
        }
