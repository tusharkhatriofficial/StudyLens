import asyncio
import subprocess
from pathlib import Path

TEMP_DIR = Path(__file__).parent.parent / "temp"
TEMP_DIR.mkdir(exist_ok=True)


async def download_youtube(url: str, task_id: str) -> Path:
    """Download YouTube audio using yt-dlp. Returns path to WAV file."""
    wav_path = TEMP_DIR / f"{task_id}.wav"

    output_template = str(TEMP_DIR / f"{task_id}.%(ext)s")
    cmd = [
        "yt-dlp",
        "-f", "ba/b",
        "-x",
        "--audio-format", "wav",
        "-o", output_template,
        "--no-playlist",
        "--no-warnings",
        "--no-check-certificates",
        "--socket-timeout", "15",
        "--retries", "3",
        "--concurrent-fragments", "4",
        "--user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        url,
    ]
    await _run(cmd)

    if not wav_path.exists():
        for f in TEMP_DIR.glob(f"{task_id}.*"):
            if f.suffix not in (".wav", ".part", ".ytdl"):
                await extract_audio(f, wav_path)
                f.unlink(missing_ok=True)
                break

    if not wav_path.exists():
        raise RuntimeError(f"Download failed for {url}. Check the URL is valid.")

    final_path = TEMP_DIR / f"{task_id}_16k.wav"
    await _run([
        "ffmpeg", "-y", "-i", str(wav_path),
        "-ar", "16000", "-ac", "1", "-acodec", "pcm_s16le",
        str(final_path),
    ])
    wav_path.unlink(missing_ok=True)
    final_path.rename(wav_path)
    return wav_path


async def extract_audio(input_path: Path, output_path: Path = None) -> Path:
    """Extract audio from video file using ffmpeg."""
    if output_path is None:
        output_path = input_path.with_suffix(".wav")
    cmd = [
        "ffmpeg", "-y",
        "-i", str(input_path),
        "-vn",
        "-acodec", "pcm_s16le",
        "-ar", "16000",
        "-ac", "1",
        str(output_path),
    ]
    await _run(cmd)
    return output_path


async def _run(cmd):
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    stdout, stderr = await proc.communicate()
    if proc.returncode != 0:
        err = stderr.decode()[-500:]
        raise RuntimeError(f"Command failed: {' '.join(cmd[:3])}...\n{err}")
    return proc
