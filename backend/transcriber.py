import os
import time
from pathlib import Path
from faster_whisper import WhisperModel

# Singleton model — loaded once, reused forever
_model = None  # type: WhisperModel | None
_model_size = os.environ.get("WHISPER_MODEL", "base")  # tiny|base|small|medium|large-v3


def get_model() -> WhisperModel:
    global _model
    if _model is None:
        _model = WhisperModel(
            _model_size,
            device="auto",       # GPU if available, else CPU
            compute_type="auto", # int8 on CPU, float16 on GPU
        )
    return _model


def transcribe(audio_path: Path, progress_callback=None) -> dict:
    """
    Transcribe audio file. Returns:
    {
        "text": "full transcript",
        "segments": [{"start": 0.0, "end": 2.5, "text": "..."}, ...],
        "language": "en",
        "duration": 120.5
    }
    """
    model = get_model()
    segments_iter, info = model.transcribe(
        str(audio_path),
        beam_size=5,
        vad_filter=True,          # Skip silence = faster
        vad_parameters=dict(
            min_silence_duration_ms=500,
        ),
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
