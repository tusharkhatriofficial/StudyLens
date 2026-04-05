import sqlite3
import hashlib
import secrets
import json
from pathlib import Path
from contextlib import contextmanager

DB_PATH = Path(__file__).parent.parent / "data" / "studylens.db"
DB_PATH.parent.mkdir(exist_ok=True)


def get_conn():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db():
    conn = get_conn()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            salt TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS sessions (
            token TEXT PRIMARY KEY,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS api_keys (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            provider TEXT NOT NULL,
            api_key TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, provider)
        );
        CREATE TABLE IF NOT EXISTS history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            title TEXT,
            source_type TEXT,
            source_url TEXT,
            transcript TEXT,
            segments TEXT,
            outputs TEXT,
            options TEXT,
            duration REAL,
            language TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS chats (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            history_id INTEGER REFERENCES history(id) ON DELETE CASCADE,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            selected_text TEXT,
            messages TEXT DEFAULT '[]',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS standalone_chats (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            history_id INTEGER,
            title TEXT DEFAULT 'New Chat',
            messages TEXT DEFAULT '[]',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS usage (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            ip TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_usage_user ON usage(user_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_usage_ip ON usage(ip, created_at);

        CREATE TABLE IF NOT EXISTS folders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)
    # Add folder_id column to history if it doesn't exist
    try:
        conn.execute("ALTER TABLE history ADD COLUMN folder_id INTEGER REFERENCES folders(id) ON DELETE SET NULL")
    except Exception:
        pass  # Column already exists
    conn.commit()
    conn.close()


# ---- Auth ----

def hash_password(password: str, salt: str = None):
    if salt is None:
        salt = secrets.token_hex(16)
    h = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 100000)
    return h.hex(), salt


def create_user(username: str, email: str, password: str):
    pw_hash, salt = hash_password(password)
    conn = get_conn()
    try:
        conn.execute(
            "INSERT INTO users (username, email, password_hash, salt) VALUES (?, ?, ?, ?)",
            (username, email, pw_hash, salt),
        )
        conn.commit()
        user_id = conn.execute("SELECT id FROM users WHERE username=?", (username,)).fetchone()["id"]
        return user_id
    except sqlite3.IntegrityError as e:
        if "username" in str(e):
            raise ValueError("Username already taken")
        raise ValueError("Email already registered")
    finally:
        conn.close()


def login_user(username: str, password: str):
    conn = get_conn()
    row = conn.execute("SELECT * FROM users WHERE username=?", (username,)).fetchone()
    conn.close()
    if not row:
        return None
    pw_hash, _ = hash_password(password, row["salt"])
    if pw_hash != row["password_hash"]:
        return None
    return dict(row)


def create_session(user_id: int) -> str:
    token = secrets.token_urlsafe(32)
    conn = get_conn()
    conn.execute("INSERT INTO sessions (token, user_id) VALUES (?, ?)", (token, user_id))
    conn.commit()
    conn.close()
    return token


def get_user_by_session(token: str):
    if not token:
        return None
    conn = get_conn()
    row = conn.execute(
        "SELECT u.* FROM users u JOIN sessions s ON u.id = s.user_id WHERE s.token=?",
        (token,),
    ).fetchone()
    conn.close()
    return dict(row) if row else None


def delete_session(token: str):
    conn = get_conn()
    conn.execute("DELETE FROM sessions WHERE token=?", (token,))
    conn.commit()
    conn.close()


# ---- API Keys ----

def save_api_key(user_id: int, provider: str, api_key: str):
    conn = get_conn()
    conn.execute(
        """INSERT INTO api_keys (user_id, provider, api_key) VALUES (?, ?, ?)
           ON CONFLICT(user_id, provider) DO UPDATE SET api_key=excluded.api_key""",
        (user_id, provider, api_key),
    )
    conn.commit()
    conn.close()


def get_api_keys(user_id: int):
    conn = get_conn()
    rows = conn.execute("SELECT provider, api_key FROM api_keys WHERE user_id=?", (user_id,)).fetchall()
    conn.close()
    return {r["provider"]: r["api_key"] for r in rows}


def delete_api_key(user_id: int, provider: str):
    conn = get_conn()
    conn.execute("DELETE FROM api_keys WHERE user_id=? AND provider=?", (user_id, provider))
    conn.commit()
    conn.close()


# ---- History ----

def save_history(user_id: int, title: str, source_type: str, source_url: str,
                 transcript: str, segments: list, outputs: dict, options: list,
                 duration: float, language: str) -> int:
    conn = get_conn()
    cur = conn.execute(
        """INSERT INTO history (user_id, title, source_type, source_url, transcript,
           segments, outputs, options, duration, language)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (user_id, title, source_type, source_url, transcript,
         json.dumps(segments), json.dumps(outputs), json.dumps(options),
         duration, language),
    )
    conn.commit()
    history_id = cur.lastrowid
    conn.close()
    return history_id


# ---- Folders ----

def create_folder(user_id: int, name: str) -> int:
    conn = get_conn()
    cur = conn.execute("INSERT INTO folders (user_id, name) VALUES (?, ?)", (user_id, name))
    conn.commit()
    fid = cur.lastrowid
    conn.close()
    return fid


def get_folders(user_id: int):
    conn = get_conn()
    rows = conn.execute("SELECT id, name, created_at FROM folders WHERE user_id=? ORDER BY name", (user_id,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def rename_folder(user_id: int, folder_id: int, name: str):
    conn = get_conn()
    conn.execute("UPDATE folders SET name=? WHERE id=? AND user_id=?", (name, folder_id, user_id))
    conn.commit()
    conn.close()


def delete_folder(user_id: int, folder_id: int):
    conn = get_conn()
    # Move items out of folder before deleting
    conn.execute("UPDATE history SET folder_id=NULL WHERE folder_id=? AND user_id=?", (folder_id, user_id))
    conn.execute("DELETE FROM folders WHERE id=? AND user_id=?", (folder_id, user_id))
    conn.commit()
    conn.close()


def move_to_folder(user_id: int, history_id: int, folder_id: int = None):
    conn = get_conn()
    conn.execute("UPDATE history SET folder_id=? WHERE id=? AND user_id=?", (folder_id, history_id, user_id))
    conn.commit()
    conn.close()


def get_history(user_id: int, limit: int = 50):
    conn = get_conn()
    rows = conn.execute(
        "SELECT id, title, source_type, source_url, duration, language, options, folder_id, created_at FROM history WHERE user_id=? ORDER BY created_at DESC LIMIT ?",
        (user_id, limit),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_history_item(user_id: int, history_id: int):
    conn = get_conn()
    row = conn.execute(
        "SELECT * FROM history WHERE id=? AND user_id=?",
        (history_id, user_id),
    ).fetchone()
    conn.close()
    if row:
        r = dict(row)
        r["segments"] = json.loads(r["segments"]) if r["segments"] else []
        r["outputs"] = json.loads(r["outputs"]) if r["outputs"] else {}
        r["options"] = json.loads(r["options"]) if r["options"] else []
        return r
    return None


def rename_history_item(user_id: int, history_id: int, title: str):
    conn = get_conn()
    conn.execute("UPDATE history SET title=? WHERE id=? AND user_id=?", (title, history_id, user_id))
    conn.commit()
    conn.close()


def delete_history_item(user_id: int, history_id: int):
    conn = get_conn()
    conn.execute("DELETE FROM history WHERE id=? AND user_id=?", (history_id, user_id))
    conn.commit()
    conn.close()


# ---- Chats (mini conversations within a history item) ----

def create_chat(user_id: int, history_id: int, selected_text: str, messages: list) -> int:
    conn = get_conn()
    cur = conn.execute(
        "INSERT INTO chats (history_id, user_id, selected_text, messages) VALUES (?, ?, ?, ?)",
        (history_id, user_id, selected_text, json.dumps(messages)),
    )
    conn.commit()
    chat_id = cur.lastrowid
    conn.close()
    return chat_id


def update_chat_messages(chat_id: int, user_id: int, messages: list):
    conn = get_conn()
    conn.execute(
        "UPDATE chats SET messages=? WHERE id=? AND user_id=?",
        (json.dumps(messages), chat_id, user_id),
    )
    conn.commit()
    conn.close()


def get_chats_for_history(user_id: int, history_id: int):
    conn = get_conn()
    rows = conn.execute(
        "SELECT id, selected_text, messages, created_at FROM chats WHERE history_id=? AND user_id=? ORDER BY created_at DESC",
        (history_id, user_id),
    ).fetchall()
    conn.close()
    result = []
    for r in rows:
        d = dict(r)
        d["messages"] = json.loads(d["messages"]) if d["messages"] else []
        result.append(d)
    return result


def get_chat(chat_id: int, user_id: int):
    conn = get_conn()
    row = conn.execute("SELECT * FROM chats WHERE id=? AND user_id=?", (chat_id, user_id)).fetchone()
    conn.close()
    if row:
        d = dict(row)
        d["messages"] = json.loads(d["messages"]) if d["messages"] else []
        return d
    return None


def delete_chat(chat_id: int, user_id: int):
    conn = get_conn()
    conn.execute("DELETE FROM chats WHERE id=? AND user_id=?", (chat_id, user_id))
    conn.commit()
    conn.close()


# ---- Standalone Chats ----

def create_standalone_chat(user_id: int, history_id, title: str, messages: list) -> int:
    conn = get_conn()
    cur = conn.execute(
        "INSERT INTO standalone_chats (user_id, history_id, title, messages) VALUES (?, ?, ?, ?)",
        (user_id, history_id, title, json.dumps(messages)),
    )
    conn.commit()
    cid = cur.lastrowid
    conn.close()
    return cid


def update_standalone_chat(chat_id: int, user_id: int, messages: list):
    conn = get_conn()
    conn.execute("UPDATE standalone_chats SET messages=? WHERE id=? AND user_id=?",
                 (json.dumps(messages), chat_id, user_id))
    conn.commit()
    conn.close()


def get_standalone_chats(user_id: int, limit: int = 50):
    conn = get_conn()
    rows = conn.execute(
        "SELECT id, history_id, title, messages, created_at FROM standalone_chats WHERE user_id=? ORDER BY created_at DESC LIMIT ?",
        (user_id, limit),
    ).fetchall()
    conn.close()
    result = []
    for r in rows:
        d = dict(r)
        d["messages"] = json.loads(d["messages"]) if d["messages"] else []
        result.append(d)
    return result


def get_standalone_chat(chat_id: int, user_id: int):
    conn = get_conn()
    row = conn.execute("SELECT * FROM standalone_chats WHERE id=? AND user_id=?", (chat_id, user_id)).fetchone()
    conn.close()
    if row:
        d = dict(row)
        d["messages"] = json.loads(d["messages"]) if d["messages"] else []
        return d
    return None


def rename_standalone_chat(chat_id: int, user_id: int, title: str):
    conn = get_conn()
    conn.execute("UPDATE standalone_chats SET title=? WHERE id=? AND user_id=?", (title, chat_id, user_id))
    conn.commit()
    conn.close()


def delete_standalone_chat(chat_id: int, user_id: int):
    conn = get_conn()
    conn.execute("DELETE FROM standalone_chats WHERE id=? AND user_id=?", (chat_id, user_id))
    conn.commit()
    conn.close()


# ---- Usage Tracking ----

def record_usage(user_id=None, ip=None):
    conn = get_conn()
    conn.execute("INSERT INTO usage (user_id, ip) VALUES (?, ?)", (user_id, ip))
    conn.commit()
    conn.close()


def get_usage_today(user_id=None, ip=None):
    conn = get_conn()
    if user_id:
        row = conn.execute(
            "SELECT COUNT(*) as cnt FROM usage WHERE user_id=? AND created_at >= date('now')",
            (user_id,)
        ).fetchone()
    else:
        row = conn.execute(
            "SELECT COUNT(*) as cnt FROM usage WHERE ip=? AND created_at >= date('now')",
            (ip,)
        ).fetchone()
    conn.close()
    return row["cnt"] if row else 0
