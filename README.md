# StudyLens - Turn Any Video Into Study Notes Instantly

**Transform YouTube videos and uploaded lectures into transcripts, summaries, flashcards, quizzes, and more — powered by AI.**

StudyLens is a self-hosted, open-source study tool that takes any video (YouTube URL or file upload), transcribes it locally using Whisper AI, and generates rich study materials using your choice of AI provider (OpenAI, Google Gemini, or Anthropic Claude).

---

## Why StudyLens?

Watching a 2-hour lecture and taking notes manually is painful. StudyLens does it in minutes:

- **Paste a YouTube link** or **upload a video file** — that's it
- Get a full **transcript with timestamps** you can click to jump to that moment
- AI generates **summary notes, topic breakdowns, Q&A, practice questions, MCQs**, and exhaustive study guides
- **Chat with your notes** — highlight any text and ask AI to explain it
- Come back later and **generate more** output types without re-processing the video
- **Merge multiple videos** into a combined study guide

No note-taking apps, no copy-pasting, no context switching. Just paste and study.

---

## Features

### Core
- **YouTube URL or File Upload** — supports any video up to 500MB
- **Local Transcription** — uses [faster-whisper](https://github.com/SYSTRAN/faster-whisper) (runs on your machine, no audio sent to cloud)
- **7 Output Types:**
  - Transcript (with clickable timestamps)
  - Summary Notes
  - Main Topics Breakdown
  - Detailed Q&A (exam prep)
  - Practice Questions
  - Multiple Choice Quiz (MCQ)
  - Exhaustive Notes (full coverage)

### Study Tools
- **Generate More** — already generated a transcript + summary? Come back later and add MCQs, Q&A, or any missing type without re-processing
- **Chat with AI** — highlight any text in your notes and ask questions about it
- **Full-Screen Chat** — standalone AI chat, optionally referencing a study session
- **Merge Sessions** — combine transcripts from multiple videos into one study guide
- **Fullscreen Reader** — distraction-free reading with zoom controls (60%-200%)

### Platform
- **User Accounts** — register/login to save history, or use as a guest
- **Multi-Provider AI** — bring your own OpenAI, Google Gemini, or Anthropic API key
- **Server Default Key** — set a default API key in `.env` so users don't need their own
- **Rate Limiting** — configurable daily limits for guests and logged-in users
- **Dark/Light Theme** — automatic or manual toggle
- **Guided Tour** — interactive onboarding for first-time users
- **Docker Ready** — one command to deploy

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Vanilla JS (ES6+), Tailwind CSS, Marked.js |
| **Backend** | Python, FastAPI, Uvicorn |
| **Transcription** | faster-whisper (OpenAI Whisper, runs locally) |
| **AI Generation** | OpenAI GPT-4o-mini / Google Gemini 2.5 Flash / Anthropic Claude Sonnet |
| **Video Download** | yt-dlp + ffmpeg |
| **Database** | SQLite (WAL mode) |
| **Auth** | PBKDF2-HMAC-SHA256 with secure sessions |

---

## Quick Start

### Prerequisites

- **Python 3.10+**
- **ffmpeg** — `brew install ffmpeg` (macOS) / `apt install ffmpeg` (Linux)
- **An AI API key** (at least one of: OpenAI, Google Gemini, or Anthropic)

### 1. Clone and setup

```bash
git clone https://github.com/tusharkhatriofficial/study_lense.git
cd study_lense
```

### 2. Configure your API key

Create a `.env` file in the project root:

```env
# At least one API key is required for AI features (summaries, Q&A, quizzes, etc.)
# Transcription works without any key (runs locally via Whisper)

OPENAI_API_KEY=sk-your-openai-key-here
# GEMINI_API_KEY=your-gemini-key-here
# ANTHROPIC_API_KEY=your-anthropic-key-here
```

**How API keys work:**
- The `.env` key acts as the **server default** — all users can generate content using it (subject to rate limits)
- Users can also add their **own API keys** in the Settings page for unlimited usage
- If no server default key is set, users **must** provide their own key in Settings before using AI features
- **Transcription does not require an API key** — it runs locally on your machine using Whisper

Get your keys:
- OpenAI: [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
- Google Gemini: [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
- Anthropic: [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys)

### 3. Run

```bash
chmod +x run.sh
./run.sh
```

Open **http://localhost:8000** in your browser.

The first run will:
- Create a Python virtual environment
- Install all dependencies
- Download the Whisper `base` model (~150MB, one-time)

### Docker

```bash
docker build -t studylens .
docker run -p 8000:8000 --env-file .env -v ./data:/app/data studylens
```

The `data/` volume persists your SQLite database (user accounts, history, chats) across container restarts.

---

## How It Works

```
YouTube URL / Video File
        │
        ▼
   yt-dlp / ffmpeg          ← Downloads video, extracts audio (16kHz mono WAV)
        │
        ▼
   faster-whisper            ← Local transcription (no cloud, your machine)
        │
        ▼
   AI Provider               ← Generates study materials from transcript
   (OpenAI / Gemini /          (runs in parallel for speed)
    Anthropic)
        │
        ▼
   SQLite Database           ← Saves everything for logged-in users
        │
        ▼
   Study Dashboard           ← Tabs for each output type, chat, reader
```

---

## Rate Limits (Default)

When using the server's default API key:

| User Type | Processing Limit | Chat Limit |
|-----------|-----------------|------------|
| Guest (no account) | 3/day | 5/day |
| Logged-in user | 20/day | 30/day |
| User with own API key | Unlimited | Unlimited |

---

## Project Structure

```
studyLens/
├── backend/
│   ├── main.py           # FastAPI app — all API endpoints
│   ├── db.py             # SQLite database layer
│   ├── downloader.py     # YouTube download + audio extraction
│   ├── transcriber.py    # Whisper transcription
│   └── summarizer.py     # Multi-provider AI content generation
├── static/
│   ├── index.html        # Single-page app HTML
│   ├── app.js            # Frontend logic
│   └── style.css         # Tailwind + custom styles
├── data/                  # SQLite database (gitignored)
├── .env                   # API keys (gitignored)
├── Dockerfile
├── requirements.txt
└── run.sh                # Local dev startup script
```

---

## API Endpoints

<details>
<summary>Click to expand full API reference</summary>

### Processing
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/process` | Process a video (YouTube URL or file upload) |
| `GET` | `/api/status/{task_id}` | SSE stream for real-time progress |

### History
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/history` | List all study sessions |
| `GET` | `/api/history/{id}` | Get a specific study session |
| `PATCH` | `/api/history/{id}` | Rename a study session |
| `DELETE` | `/api/history/{id}` | Delete a study session |
| `POST` | `/api/history/{id}/generate-more` | Generate additional output types |

### Chat
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/history/{id}/chats` | Create a chat within a study session |
| `POST` | `/api/chats/{id}/message` | Send a message to an existing chat |
| `POST` | `/api/standalone-chat` | Full-screen chat (optionally referencing a session) |

### Other
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/merge` | Merge multiple study sessions |
| `POST` | `/api/register` | Create account |
| `POST` | `/api/login` | Login |
| `GET` | `/api/health` | Health check |

</details>

---

## Contributing

Contributions are welcome! Feel free to open issues or submit pull requests.

---

## License

MIT

---

Built by [Tushar Khatri](https://tusharkhatri.in)
