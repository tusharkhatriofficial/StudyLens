FROM python:3.11-slim

# Install ffmpeg + Deno (required JS runtime for yt-dlp YouTube extraction)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg curl unzip \
    && curl -fsSL https://deno.land/install.sh | DENO_INSTALL=/usr/local sh \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python deps
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download whisper model
RUN python -c "from faster_whisper import WhisperModel; WhisperModel('base', device='cpu', compute_type='int8')"

# Copy app
COPY . .

# Create dirs (data/ will be a mounted volume for persistence)
RUN mkdir -p data uploads temp

EXPOSE 8000

CMD exec uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8000}
