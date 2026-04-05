<div align="center">

# StudyLens

### Turn Any Video Into Complete Study Notes — Instantly

[![Python](https://img.shields.io/badge/Python-3.10+-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![Whisper](https://img.shields.io/badge/Whisper-Local_AI-412991?style=for-the-badge&logo=openai&logoColor=white)](https://github.com/SYSTRAN/faster-whisper)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?style=for-the-badge&logo=docker&logoColor=white)](https://docker.com)
[![License](https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge)](LICENSE)

**Paste a YouTube link or upload a video. Get transcripts, summaries, quizzes, Q&A, and more.**<br>
**Transcription runs 100% locally. Only AI generation needs an API key.**

[Getting Started](#-getting-started) · [Features](#-features) · [How It Works](#-how-it-works) · [API Keys](#-api-key-setup)

</div>

---

## The Problem

You watch a 2-hour lecture. You take notes. You miss things. You rewatch parts. You spend more time organizing notes than actually studying.

**StudyLens fixes this.** Paste a link, pick what you want, and get study-ready material in minutes — not hours.

---

## What You Get

<table>
<tr>
<td width="50%">

### From any video, generate:

| Output | What it does |
|--------|-------------|
| **Transcript** | Full text with clickable timestamps |
| **Summary Notes** | Structured, concise study notes |
| **Main Topics** | Topic-by-topic breakdown with key points |
| **Detailed Q&A** | Exam-style questions with model answers |
| **Practice Questions** | Short answer, long answer, and true/false |
| **MCQ Quiz** | 15-20 multiple choice questions |
| **Exhaustive Notes** | Every single detail captured |

</td>
<td width="50%">

### Plus:

| Feature | Description |
|---------|------------|
| **Chat with Notes** | Highlight text, ask AI to explain it |
| **Generate More** | Add new output types later without re-processing |
| **Merge Sessions** | Combine multiple videos into one study guide |
| **Fullscreen Reader** | Clean reading view with zoom (60%-200%) |
| **Dark Mode** | Toggle between light and dark themes |
| **User Accounts** | Save history, chats, and settings |

</td>
</tr>
</table>

---

## How It Works

```
  YouTube URL / Video File
          |
          v
  yt-dlp + ffmpeg              Extracts audio locally
          |
          v
  faster-whisper               Transcribes on YOUR machine (no cloud)
          |
          v
  LLM API                      Generates study materials
  (OpenAI / Gemini / Claude)   (only step that needs an API key)
          |
          v
  SQLite                       Saves everything for logged-in users
```

> **No subscriptions. No monthly fees.** Transcription is fully local using [faster-whisper](https://github.com/SYSTRAN/faster-whisper). The only cost is the LLM API call for generating summaries/quizzes — typically a few cents per video using GPT-4o-mini.

---

## Tech Stack

| Component | Technology | Runs Locally? |
|-----------|-----------|:---:|
| **Transcription** | [faster-whisper](https://github.com/SYSTRAN/faster-whisper) (Whisper model) | Yes |
| **Video Download** | [yt-dlp](https://github.com/yt-dlp/yt-dlp) + [ffmpeg](https://ffmpeg.org) | Yes |
| **AI Generation** | OpenAI `gpt-4o-mini` / Google `gemini-2.5-flash` / Anthropic `claude-sonnet-4-6` | API call |
| **Backend** | Python, [FastAPI](https://fastapi.tiangolo.com), Uvicorn | Yes |
| **Frontend** | Vanilla JavaScript, Tailwind CSS, Marked.js | Yes |
| **Database** | SQLite (WAL mode) | Yes |
| **Auth** | PBKDF2-HMAC-SHA256, secure httponly cookies | Yes |

Everything runs on your machine except the LLM API calls for generating AI content.

---

## Getting Started

### One-Command Docker Setup (Recommended)

You only need [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed — nothing else.

```bash
docker run -d -p 8000:8000 -e OPENAI_API_KEY=sk-your-key-here -v studylens-data:/app/data --restart unless-stopped tusharkhatriofficial/studylens
```

Open **http://localhost:8000**. Done.

> Replace `OPENAI_API_KEY=sk-your-key-here` with your actual key. You can use `GEMINI_API_KEY` or `ANTHROPIC_API_KEY` instead — see [API Key Setup](#-api-key-setup).

**Your data is safe.** The `-v studylens-data:/app/data` flag stores the SQLite database (accounts, history, chats) in a Docker volume. It persists across container stops, restarts, and updates. You will never lose your data.

To stop: `docker stop <container-id>`. To start again: `docker start <container-id>`. To update: `docker pull tusharkhatriofficial/studylens && docker run ...` (same command as above).

### Docker Compose (alternative)

For a more permanent setup, create a folder with this `docker-compose.yml`:

```yaml
services:
  studylens:
    image: tusharkhatriofficial/studylens:latest
    ports:
      - "8000:8000"
    environment:
      - OPENAI_API_KEY=sk-your-key-here
    volumes:
      - studylens-data:/app/data
    restart: unless-stopped

volumes:
  studylens-data:
```

Then run:

```bash
docker compose up -d
```

---

### Manual Setup (without Docker)

If you prefer running it directly:

| Requirement | Install |
|-------------|---------|
| **Python 3.10+** | [python.org](https://python.org) |
| **ffmpeg** | `brew install ffmpeg` (macOS) / `apt install ffmpeg` (Linux / WSL) |
| **An LLM API key** | See [API Key Setup](#-api-key-setup) below |

```bash
git clone https://github.com/tusharkhatriofficial/study_lense.git
cd study_lense
```

Create the `.env` file (`cp .env.example .env` and add your key), then:

```bash
chmod +x run.sh
./run.sh
```

Open **http://localhost:8000**.

> First run creates a virtual environment, installs dependencies, and downloads the Whisper `base` model (~150MB). This is a one-time setup.

---

## API Key Setup

StudyLens needs an LLM API key **only for generating AI content** (summaries, quizzes, Q&A, etc.). Transcription is fully local and free.

### Where to get a key

| Provider | Model Used | Get Key |
|----------|-----------|---------|
| **OpenAI** | `gpt-4o-mini` | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |
| **Google Gemini** | `gemini-2.5-flash` | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) |
| **Anthropic** | `claude-sonnet-4-6` | [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys) |

You only need **one** key. Pick whichever provider you prefer.

### How keys work in StudyLens

| Setup | What happens |
|-------|-------------|
| **Key in `.env` file** | Acts as the server default. All users can use it (with rate limits). |
| **Key in Settings page** | Users add their own key in-app. Overrides the server default. No rate limits. |
| **No key at all** | Transcription still works. AI features ask the user to add a key in Settings. |

### Rate limits (when using the server default key)

| User Type | Video Processing | AI Chat |
|-----------|:---:|:---:|
| Guest (no account) | 3/day | 5/day |
| Logged-in user | 20/day | 30/day |
| Using own API key | Unlimited | Unlimited |

---

## Features in Detail

<details>
<summary><strong>Generate More</strong> — add output types later without re-processing</summary>

<br>

Generated only a transcript and summary? Open that session from history, and you'll see checkboxes for every output type you haven't generated yet (MCQ, Q&A, Topics, etc.). Check what you want and hit Go. StudyLens uses the saved transcript — no need to re-download or re-transcribe the video.

</details>

<details>
<summary><strong>Chat with Notes</strong> — highlight text and ask AI about it</summary>

<br>

In any study session, highlight text in your notes. A tooltip appears letting you ask AI about the selection. The AI has full context of your transcript and all generated outputs, so answers are specific to your content.

There's also a standalone full-screen chat that can optionally reference any study session.

</details>

<details>
<summary><strong>Merge Sessions</strong> — combine multiple videos into one guide</summary>

<br>

Select 2 or more study sessions from your history and merge them. StudyLens combines all transcripts (labeled by source) and generates new study materials from the combined content. Great for combining lecture series or related videos.

</details>

<details>
<summary><strong>Multi-Provider AI</strong> — choose your preferred LLM</summary>

<br>

StudyLens auto-detects the provider from your API key format:
- Keys starting with `sk-` → OpenAI (`gpt-4o-mini`)
- Keys starting with `AIza` → Google Gemini (`gemini-2.5-flash`)
- Keys starting with `sk-ant-` → Anthropic Claude (`claude-sonnet-4-6`)

You can set a different key per provider in Settings and switch between them.

</details>

---

## Project Structure

```
study_lense/
├── backend/
│   ├── main.py           # FastAPI — all API endpoints, SSE progress, auth
│   ├── db.py             # SQLite — users, history, chats, usage tracking
│   ├── downloader.py     # yt-dlp + ffmpeg — download & extract audio
│   ├── transcriber.py    # faster-whisper — local transcription
│   └── summarizer.py     # Multi-provider LLM — content generation
├── static/
│   ├── index.html        # Single-page app
│   ├── app.js            # Frontend logic (vanilla JS)
│   └── style.css         # Tailwind CSS + custom styles
├── data/                  # SQLite database (gitignored)
├── .env                   # Your API keys (gitignored)
├── Dockerfile
├── requirements.txt
└── run.sh
```

---

## API Reference

<details>
<summary>Click to expand</summary>

### Video Processing
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/process` | Process a YouTube URL or uploaded video file |
| `GET` | `/api/status/{task_id}` | SSE stream — real-time progress updates |

### Study Sessions
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/history` | List all saved study sessions |
| `GET` | `/api/history/{id}` | Get full session (transcript, outputs, metadata) |
| `POST` | `/api/history/{id}/generate-more` | Generate additional output types |
| `PATCH` | `/api/history/{id}` | Rename a session |
| `DELETE` | `/api/history/{id}` | Delete a session |
| `POST` | `/api/merge` | Merge multiple sessions into one |

### Chat
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/history/{id}/chats` | List chats for a study session |
| `POST` | `/api/history/{id}/chats` | Start a new chat (with optional text selection) |
| `POST` | `/api/chats/{id}/message` | Send message to existing chat |
| `POST` | `/api/standalone-chat` | Full-screen chat (optionally references a session) |

### Auth & Settings
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/register` | Create account |
| `POST` | `/api/login` | Login |
| `POST` | `/api/logout` | Logout |
| `GET` | `/api/me` | Get current user |
| `POST` | `/api/keys` | Save an API key |
| `GET` | `/api/health` | Health check (also reports if a default key is configured) |

</details>

---

## Contributing

Contributions welcome. Open an issue or submit a PR.

## License

MIT

---

<div align="center">

Built by [Tushar Khatri](https://tusharkhatri.in)

</div>
