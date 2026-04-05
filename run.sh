#!/bin/bash
set -e

cd "$(dirname "$0")"

# Check dependencies
command -v ffmpeg >/dev/null 2>&1 || { echo "ERROR: ffmpeg not found. Install with: brew install ffmpeg"; exit 1; }

# Check for .env file with at least one API key
if [ -f ".env" ]; then
    # Source .env to check keys (ignore comments and empty lines)
    HAS_KEY=false
    while IFS= read -r line; do
        case "$line" in
            OPENAI_API_KEY=*|GEMINI_API_KEY=*|ANTHROPIC_API_KEY=*)
                val="${line#*=}"
                if [ -n "$val" ] && [ "$val" != "sk-your-key-here" ] && [ "$val" != "your-gemini-key-here" ] && [ "$val" != "your-anthropic-key-here" ]; then
                    HAS_KEY=true
                fi
                ;;
        esac
    done < .env
    if [ "$HAS_KEY" = false ]; then
        echo "WARNING: No API key found in .env"
        echo "  Transcription will work, but AI features (summaries, quizzes, Q&A) need a key."
        echo "  Run: cp .env.example .env  and add your key."
        echo ""
    fi
else
    echo "WARNING: No .env file found."
    echo "  Run: cp .env.example .env  and add at least one API key."
    echo ""
fi

# Create venv if needed
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

source venv/bin/activate

# Install deps
echo "Installing dependencies..."
pip install -q -r requirements.txt

# Install mlx-whisper on Apple Silicon Macs for GPU-accelerated transcription
if [ "$(uname)" = "Darwin" ] && [ "$(uname -m)" = "arm64" ]; then
    pip install -q mlx-whisper 2>/dev/null && echo "  Installed mlx-whisper (Apple Silicon GPU acceleration)" || true
fi

echo ""
echo "========================================="
echo "  StudyLens running on http://localhost:8000"
echo "========================================="
echo ""

uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
