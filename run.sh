#!/bin/bash
set -e

cd "$(dirname "$0")"

# Check dependencies
command -v ffmpeg >/dev/null 2>&1 || { echo "ERROR: ffmpeg not found. Install with: brew install ffmpeg"; exit 1; }

if [ -z "$OPENAI_API_KEY" ]; then
    echo "WARNING: OPENAI_API_KEY not set. Export it for AI-generated notes:"
    echo "  export OPENAI_API_KEY=sk-..."
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

echo ""
echo "========================================="
echo "  Starting VideoProj on http://localhost:8000"
echo "========================================="
echo ""

uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
