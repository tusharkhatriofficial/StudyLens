import os
import platform
from pathlib import Path

_model_size = os.environ.get("WHISPER_MODEL", "base")

# ---- Auto-detect best backend ----
# Apple Silicon Mac → mlx-whisper (Metal GPU, 5-10x faster)
# NVIDIA GPU / CPU  → faster-whisper (CUDA or CPU fallback)

_USE_MLX = False
if platform.system() == "Darwin" and platform.machine() == "arm64":
    try:
        import mlx_whisper
        _USE_MLX = True
        print(f"[StudyLens] Using MLX Whisper (Apple Silicon GPU) — model: {_model_size}")
    except ImportError:
        print("[StudyLens] mlx-whisper not installed, falling back to faster-whisper (CPU)")

if not _USE_MLX:
    print(f"[StudyLens] Using faster-whisper — model: {_model_size}")


# ===================== MLX Backend (Apple Silicon) =====================

_MLX_MODELS = {
    "tiny": "mlx-community/whisper-tiny",
    "base": "mlx-community/whisper-base-mlx",
    "small": "mlx-community/whisper-small-mlx",
    "medium": "mlx-community/whisper-medium-mlx",
    "large": "mlx-community/whisper-large-mlx",
    "large-v2": "mlx-community/whisper-large-v2-mlx",
    "large-v3": "mlx-community/whisper-large-v3-mlx",
}

def _transcribe_mlx(audio_path: Path, progress_callback=None) -> dict:
    """Transcribe using mlx-whisper on Apple Silicon GPU."""
    model_repo = _MLX_MODELS.get(_model_size, f"mlx-community/whisper-{_model_size}-mlx")

    result = mlx_whisper.transcribe(
        str(audio_path),
        path_or_hf_repo=model_repo,
        verbose=False,
    )

    segments = []
    full_text_parts = []
    duration = 0

    for seg in result.get("segments", []):
        segments.append({
            "start": round(seg["start"], 2),
            "end": round(seg["end"], 2),
            "text": seg["text"].strip(),
        })
        full_text_parts.append(seg["text"].strip())
        duration = max(duration, seg["end"])
        if progress_callback and duration > 0:
            pct = min(seg["end"] / max(duration, 1), 1.0)
            progress_callback(pct)

    # Final progress
    if progress_callback:
        progress_callback(1.0)

    return {
        "text": result.get("text", " ".join(full_text_parts)),
        "segments": segments,
        "language": result.get("language", ""),
        "duration": duration,
    }


# ===================== faster-whisper Backend (CUDA / CPU) =====================

_fw_model = None

def _get_fw_model():
    global _fw_model
    if _fw_model is None:
        from faster_whisper import WhisperModel
        _fw_model = WhisperModel(
            _model_size,
            device="auto",       # GPU if available, else CPU
            compute_type="auto", # int8 on CPU, float16 on GPU
        )
    return _fw_model


def _transcribe_fw(audio_path: Path, progress_callback=None) -> dict:
    """Transcribe using faster-whisper (CUDA GPU or CPU)."""
    model = _get_fw_model()
    segments_iter, info = model.transcribe(
        str(audio_path),
        beam_size=5,
        vad_filter=True,
        vad_parameters=dict(min_silence_duration_ms=500),
    )

    segments = []
    full_text_parts = []
    duration = info.duration or 0

    for seg in segments_iter:
        segments.append({
            "start": round(seg.start, 2),
            "end": round(seg.end, 2),
            "text": seg.text.strip(),
        })
        full_text_parts.append(seg.text.strip())
        if progress_callback and duration > 0:
            pct = min(seg.end / duration, 1.0)
            progress_callback(pct)

    return {
        "text": " ".join(full_text_parts),
        "segments": segments,
        "language": info.language,
        "duration": duration,
    }


# ===================== Public API =====================

def transcribe(audio_path: Path, progress_callback=None) -> dict:
    """
    Transcribe audio file. Auto-selects the best backend for the platform.
    Returns: {"text": str, "segments": list, "language": str, "duration": float}
    """
    if _USE_MLX:
        return _transcribe_mlx(audio_path, progress_callback)
    return _transcribe_fw(audio_path, progress_callback)
