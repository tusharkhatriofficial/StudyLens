import asyncio
import json
import os
import uuid
from pathlib import Path
from dotenv import load_dotenv
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Request, Response
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse, JSONResponse
from backend.downloader import download_youtube, extract_audio
from backend.transcriber import transcribe
from backend.summarizer import GENERATORS, check_api, chat_completion, resolve_provider_and_key
from backend import db

load_dotenv(Path(__file__).parent.parent / ".env")

app = FastAPI(title="StudyLens")

BASE_DIR = Path(__file__).parent.parent
UPLOAD_DIR = BASE_DIR / "uploads"
TEMP_DIR = BASE_DIR / "temp"
UPLOAD_DIR.mkdir(exist_ok=True)
TEMP_DIR.mkdir(exist_ok=True)

tasks = {}
db.init_db()


def get_user(request: Request):
    token = request.cookies.get("session")
    if not token:
        return None
    return db.get_user_by_session(token)


def require_user(request: Request):
    user = get_user(request)
    if not user:
        raise HTTPException(401, "Not logged in")
    return user


# ---- Pages ----
@app.get("/")
async def index():
    return FileResponse(BASE_DIR / "static" / "index.html")

app.mount("/static", StaticFiles(directory=BASE_DIR / "static"), name="static")



# ---- Auth ----
@app.post("/api/register")
async def register(request: Request):
    body = await request.json()
    username = body.get("username", "").strip()
    email = body.get("email", "").strip()
    password = body.get("password", "")
    if not username or not email or not password:
        raise HTTPException(400, "All fields required")
    if len(password) < 4:
        raise HTTPException(400, "Password too short")
    try:
        user_id = db.create_user(username, email, password)
    except ValueError as e:
        raise HTTPException(400, str(e))
    token = db.create_session(user_id)
    resp = JSONResponse({"ok": True, "username": username})
    resp.set_cookie("session", token, httponly=True, max_age=86400 * 30, samesite="lax")
    return resp


@app.post("/api/login")
async def login(request: Request):
    body = await request.json()
    user = db.login_user(body.get("username", ""), body.get("password", ""))
    if not user:
        raise HTTPException(401, "Invalid username or password")
    token = db.create_session(user["id"])
    resp = JSONResponse({"ok": True, "username": user["username"]})
    resp.set_cookie("session", token, httponly=True, max_age=86400 * 30, samesite="lax")
    return resp


@app.post("/api/logout")
async def logout(request: Request):
    token = request.cookies.get("session")
    if token:
        db.delete_session(token)
    resp = JSONResponse({"ok": True})
    resp.delete_cookie("session")
    return resp


@app.get("/api/me")
async def me(request: Request):
    user = get_user(request)
    if not user:
        return JSONResponse({"logged_in": False})
    return {"logged_in": True, "username": user["username"], "user_id": user["id"]}


# ---- API Keys (logged-in users only) ----
@app.get("/api/keys")
async def get_keys(request: Request):
    user = require_user(request)
    keys = db.get_api_keys(user["id"])
    masked = {p: k[:8] + "..." + k[-4:] if len(k) > 12 else "***" for p, k in keys.items()}
    return {"keys": masked}


@app.post("/api/keys")
async def save_key(request: Request):
    user = require_user(request)
    body = await request.json()
    provider = body.get("provider", "").strip()
    api_key = body.get("api_key", "").strip()
    if provider not in ("openai", "gemini", "anthropic"):
        raise HTTPException(400, "Invalid provider")
    if not api_key:
        raise HTTPException(400, "API key required")
    db.save_api_key(user["id"], provider, api_key)
    return {"ok": True}


@app.delete("/api/keys/{provider}")
async def remove_key(provider: str, request: Request):
    user = require_user(request)
    db.delete_api_key(user["id"], provider)
    return {"ok": True}


# ---- History (logged-in users only) ----
@app.get("/api/history")
async def get_history(request: Request):
    user = get_user(request)
    if not user:
        return {"history": []}
    items = db.get_history(user["id"])
    return {"history": items}


@app.get("/api/history/{item_id}")
async def get_history_item(item_id: int, request: Request):
    user = require_user(request)
    item = db.get_history_item(user["id"], item_id)
    if not item:
        raise HTTPException(404, "Not found")
    return item


@app.patch("/api/history/{item_id}")
async def rename_history_item(item_id: int, request: Request):
    user = require_user(request)
    body = await request.json()
    title = body.get("title", "").strip()
    if not title:
        raise HTTPException(400, "Title required")
    db.rename_history_item(user["id"], item_id, title)
    return {"ok": True}


@app.delete("/api/history/{item_id}")
async def delete_history_item(item_id: int, request: Request):
    user = require_user(request)
    db.delete_history_item(user["id"], item_id)
    return {"ok": True}


# ---- Chats (mini conversations within history items) ----
@app.get("/api/history/{item_id}/chats")
async def get_chats(item_id: int, request: Request):
    user = require_user(request)
    chats = db.get_chats_for_history(user["id"], item_id)
    return {"chats": chats}


@app.post("/api/history/{item_id}/chats")
async def create_chat(item_id: int, request: Request):
    user = require_user(request)
    body = await request.json()
    selected_text = body.get("selected_text", "")
    user_message = body.get("message", "").strip()
    if not user_message:
        raise HTTPException(400, "Message required")

    # Get parent history for context
    item = db.get_history_item(user["id"], item_id)
    if not item:
        raise HTTPException(404, "History item not found")

    # Get API key
    user_keys = db.get_api_keys(user["id"])
    api_key = user_keys.get("openai") or user_keys.get("gemini") or user_keys.get("anthropic") or ""
    _, api_key = resolve_provider_and_key(api_key)
    if not api_key:
        raise HTTPException(400, "No API key. Add one in Settings.")

    # Build context from parent study material
    context_parts = []
    if item.get("transcript"):
        context_parts.append(f"Video transcript:\n{item['transcript'][:5000]}")
    outputs = item.get("outputs", {})
    for key, val in outputs.items():
        if key != "transcript" and val:
            context_parts.append(f"{key}:\n{val[:3000]}")
    context = "\n\n---\n\n".join(context_parts)[:12000]

    system_prompt = f"""You are a helpful study assistant. The user is studying from video notes generated by StudyLens.
Answer their questions based on the study material below. Be concise but thorough.

STUDY MATERIAL:
{context}"""

    if selected_text:
        system_prompt += f"\n\nThe user selected this specific text to ask about:\n\"{selected_text[:1000]}\""

    messages = [{"role": "user", "content": user_message}]

    try:
        ai_reply = await chat_completion(
            [{"role": "system", "content": system_prompt}, {"role": "user", "content": user_message}],
            api_key=api_key,
        )
    except Exception as e:
        raise HTTPException(500, f"AI error: {str(e)[:200]}")

    messages.append({"role": "assistant", "content": ai_reply})

    chat_id = db.create_chat(user["id"], item_id, selected_text, messages)
    return {"chat_id": chat_id, "messages": messages}


@app.post("/api/chats/{chat_id}/message")
async def send_chat_message(chat_id: int, request: Request):
    user = require_user(request)
    body = await request.json()
    user_message = body.get("message", "").strip()
    if not user_message:
        raise HTTPException(400, "Message required")

    chat = db.get_chat(chat_id, user["id"])
    if not chat:
        raise HTTPException(404, "Chat not found")

    # Get parent history for context
    item = db.get_history_item(user["id"], chat["history_id"])
    context_parts = []
    if item and item.get("transcript"):
        context_parts.append(f"Video transcript:\n{item['transcript'][:5000]}")
    if item:
        for key, val in item.get("outputs", {}).items():
            if key != "transcript" and val:
                context_parts.append(f"{key}:\n{val[:3000]}")
    context = "\n\n---\n\n".join(context_parts)[:12000]

    system_prompt = f"""You are a helpful study assistant. The user is studying from video notes generated by StudyLens.
Answer their questions based on the study material below. Be concise but thorough.

STUDY MATERIAL:
{context}"""

    if chat.get("selected_text"):
        system_prompt += f"\n\nOriginal selected text:\n\"{chat['selected_text'][:1000]}\""

    # Build full message history
    prev = chat["messages"]
    prev.append({"role": "user", "content": user_message})
    api_messages = [{"role": "system", "content": system_prompt}] + prev[-10:]  # last 10 msgs

    user_keys = db.get_api_keys(user["id"])
    api_key = user_keys.get("openai") or user_keys.get("gemini") or user_keys.get("anthropic") or ""

    try:
        ai_reply = await chat_completion(api_messages, api_key=api_key)
    except Exception as e:
        raise HTTPException(500, f"AI error: {str(e)[:200]}")

    prev.append({"role": "assistant", "content": ai_reply})
    db.update_chat_messages(chat_id, user["id"], prev)
    return {"messages": prev}


@app.delete("/api/chats/{chat_id}")
async def delete_chat_endpoint(chat_id: int, request: Request):
    user = require_user(request)
    db.delete_chat(chat_id, user["id"])
    return {"ok": True}


# ---- Full-screen standalone chat ----
CHAT_LIMIT_LOGGED_IN = 30
CHAT_LIMIT_GUEST = 5

@app.post("/api/standalone-chat")
async def standalone_chat(request: Request):
    user = get_user(request)  # Allow guests too
    body = await request.json()
    user_message = body.get("message", "").strip()
    history_ref_id = body.get("history_id")  # optional reference
    chat_id = body.get("chat_id")  # continue existing
    if not user_message:
        raise HTTPException(400, "Message required")

    # Resolve API key: user's own key > server default
    api_key = ""
    if user:
        user_keys = db.get_api_keys(user["id"])
        api_key = user_keys.get("openai") or user_keys.get("gemini") or user_keys.get("anthropic") or ""
    _, api_key = resolve_provider_and_key(api_key)
    if not api_key:
        raise HTTPException(400, "No API key available. Add one in Settings or contact the admin.")

    # Rate limit when using server default key
    has_own_key = user and (db.get_api_keys(user["id"]).get("openai") or db.get_api_keys(user["id"]).get("gemini") or db.get_api_keys(user["id"]).get("anthropic"))
    if not has_own_key:
        client_ip = request.client.host if request.client else "unknown"
        if user:
            used = db.get_usage_today(user_id=user["id"])
            if used >= CHAT_LIMIT_LOGGED_IN:
                raise HTTPException(429, f"Daily chat limit reached ({CHAT_LIMIT_LOGGED_IN}/day). Add your own API key in Settings for unlimited use.")
        else:
            used = db.get_usage_today(ip=client_ip)
            if used >= CHAT_LIMIT_GUEST:
                raise HTTPException(429, f"Guest chat limit reached ({CHAT_LIMIT_GUEST}/day). Create an account for more, or add your own API key.")

    system_prompt = "You are a helpful study assistant on StudyLens. Be concise but thorough."

    # Load existing chat or start new
    prev = []
    user_id = user["id"] if user else None
    if chat_id and user_id:
        existing = db.get_standalone_chat(int(chat_id), user_id)
        if existing:
            prev = existing["messages"]
            if not history_ref_id:
                history_ref_id = existing.get("history_id")

    # Add context from referenced history item
    if history_ref_id and user_id:
        item = db.get_history_item(user_id, int(history_ref_id))
        if item:
            ctx = []
            if item.get("transcript"):
                ctx.append(f"Transcript:\n{item['transcript'][:5000]}")
            for k, v in item.get("outputs", {}).items():
                if k != "transcript" and v:
                    ctx.append(f"{k}:\n{v[:3000]}")
            system_prompt += "\n\nThe user is referencing this study material:\n\n" + "\n---\n".join(ctx)[:12000]

    prev.append({"role": "user", "content": user_message})

    try:
        ai_reply = await chat_completion(
            [{"role": "system", "content": system_prompt}] + prev[-12:],
            api_key=api_key,
        )
    except Exception as e:
        raise HTTPException(500, f"AI error: {str(e)[:200]}")

    prev.append({"role": "assistant", "content": ai_reply})

    # Only persist chats for logged-in users
    if user_id:
        if chat_id:
            db.update_standalone_chat(int(chat_id), user_id, prev)
        else:
            title = user_message[:40] + ("..." if len(user_message) > 40 else "")
            chat_id = db.create_standalone_chat(
                user_id, int(history_ref_id) if history_ref_id else None, title, prev
            )

    return {"chat_id": chat_id, "messages": prev}


@app.get("/api/standalone-chats")
async def list_standalone_chats(request: Request):
    user = require_user(request)
    chats = db.get_standalone_chats(user["id"])
    return {"chats": chats}


@app.delete("/api/standalone-chats/{chat_id}")
async def del_standalone_chat(chat_id: int, request: Request):
    user = require_user(request)
    db.delete_standalone_chat(chat_id, user["id"])
    return {"ok": True}


@app.patch("/api/standalone-chats/{chat_id}")
async def rename_standalone_chat_endpoint(chat_id: int, request: Request):
    user = require_user(request)
    body = await request.json()
    title = body.get("title", "").strip()
    if not title:
        raise HTTPException(400, "Title required")
    db.rename_standalone_chat(chat_id, user["id"], title)
    return {"ok": True}


# ---- Generate more for existing history item ----
@app.post("/api/history/{item_id}/generate-more")
async def generate_more(item_id: int, request: Request):
    user = require_user(request)
    body = await request.json()
    new_options = body.get("options", [])
    mcq_options = int(body.get("mcq_options", 4))

    if not new_options:
        raise HTTPException(400, "Select at least one option")

    item = db.get_history_item(user["id"], item_id)
    if not item:
        raise HTTPException(404, "History item not found")
    if not item.get("transcript"):
        raise HTTPException(400, "No transcript available for this item")

    user_keys = db.get_api_keys(user["id"])
    api_key = user_keys.get("openai") or user_keys.get("gemini") or user_keys.get("anthropic") or ""
    _, api_key = resolve_provider_and_key(api_key)
    if not api_key:
        raise HTTPException(400, "No API key. Add one in Settings.")

    task_id = str(uuid.uuid4())[:8]
    tasks[task_id] = {"status": "processing", "progress": 10, "stage": "generating", "user_id": user["id"]}

    asyncio.create_task(_generate_more_pipeline(
        task_id, user["id"], item_id, item["transcript"],
        item.get("outputs", {}), new_options, mcq_options, api_key
    ))
    return {"task_id": task_id}


async def _generate_more_pipeline(task_id, user_id, history_id, transcript,
                                   existing_outputs, new_options, mcq_options, api_key):
    try:
        outputs = dict(existing_outputs)
        gen_tasks_map = {}
        for opt in new_options:
            gen_func = GENERATORS.get(opt)
            if gen_func:
                kwargs = {"transcript": transcript, "api_key": api_key}
                if opt == "mcq":
                    kwargs["num_options"] = mcq_options
                gen_tasks_map[opt] = asyncio.create_task(gen_func(**kwargs))

        total = len(gen_tasks_map)
        done = 0
        for opt, t in gen_tasks_map.items():
            try:
                outputs[opt] = await t
            except Exception as e:
                outputs[opt] = f"**Error:** {str(e)[:200]}"
            done += 1
            tasks[task_id]["progress"] = 10 + int((done / total) * 85)

        # Update existing history item with new outputs
        conn = db.get_conn()
        import json as _json
        conn.execute("UPDATE history SET outputs=? WHERE id=? AND user_id=?",
                     (_json.dumps(outputs), history_id, user_id))
        conn.commit()
        conn.close()

        tasks[task_id].update(
            status="done", stage="complete", progress=100,
            history_id=history_id,
        )
    except Exception as e:
        tasks[task_id].update(status="error", error=str(e))


# ---- Merge multiple study sessions ----
@app.post("/api/merge")
async def merge_sessions(request: Request):
    user = require_user(request)
    body = await request.json()
    history_ids = body.get("history_ids", [])
    options = body.get("options", ["summary_notes"])
    mcq_options = int(body.get("mcq_options", 4))
    title = body.get("title", "").strip()
    mode = body.get("mode", "regenerate")  # "combine" or "regenerate"

    if len(history_ids) < 2:
        raise HTTPException(400, "Select at least 2 study sessions to merge")

    # Gather all session data
    all_items = []
    for hid in history_ids:
        item = db.get_history_item(user["id"], int(hid))
        if item:
            all_items.append(item)

    if not all_items:
        raise HTTPException(400, "No sessions found")

    source_titles = [it.get("title") or f"Video {it['id']}" for it in all_items]
    source_urls = [it.get("source_url", "") for it in all_items]

    # Build combined transcript and segments
    all_transcripts = [it["transcript"] for it in all_items if it.get("transcript")]
    if not all_transcripts:
        raise HTTPException(400, "No transcripts found in selected sessions")

    combined_transcript = "\n\n---\n\n".join(
        f"[{t}]\n{txt}" for t, txt in zip(source_titles, all_transcripts)
    )

    # Merge segments from all sources with time offsets
    combined_segments = []
    time_offset = 0.0
    for it in all_items:
        it_segs = it.get("segments", [])
        it_title = it.get("title") or f"Video {it['id']}"
        # Add a header segment marking the start of this source
        combined_segments.append({"start": time_offset, "end": time_offset, "text": f"--- {it_title} ---"})
        for seg in it_segs:
            combined_segments.append({
                "start": round(seg["start"] + time_offset, 2),
                "end": round(seg["end"] + time_offset, 2),
                "text": seg["text"],
            })
        time_offset += it.get("duration", 0) or (it_segs[-1]["end"] if it_segs else 0)

    if not title:
        title = "Merged: " + " + ".join(source_titles[:3])
        if len(source_titles) > 3:
            title += f" +{len(source_titles)-3} more"

    # Store source info for the merged session
    merge_meta = json.dumps({"source_ids": history_ids, "source_urls": source_urls, "source_titles": source_titles})

    if mode == "combine":
        # Combine Only: just stitch together existing outputs, no AI calls
        outputs = {}
        if "transcript" in options:
            outputs["transcript"] = combined_transcript
        for opt in options:
            if opt == "transcript":
                continue
            parts = []
            for it in all_items:
                it_outputs = it.get("outputs", {})
                if it_outputs.get(opt):
                    parts.append(f"## {it.get('title') or 'Video'}\n\n{it_outputs[opt]}")
            if parts:
                outputs[opt] = "\n\n---\n\n".join(parts)

        total_duration = sum(it.get("duration", 0) for it in all_items)
        history_id = db.save_history(
            user["id"], title, "merge", merge_meta,
            combined_transcript, combined_segments, outputs, options, total_duration, "",
        )
        return {"history_id": history_id, "mode": "combine"}

    # Regenerate mode: use AI to create new content from combined transcript
    api_key = ""
    user_keys = db.get_api_keys(user["id"])
    api_key = user_keys.get("openai") or user_keys.get("gemini") or user_keys.get("anthropic") or ""
    _, api_key = resolve_provider_and_key(api_key)
    if not api_key:
        raise HTTPException(400, "No API key. Add one in Settings.")

    task_id = str(uuid.uuid4())[:8]
    total_duration = sum(it.get("duration", 0) for it in all_items)
    tasks[task_id] = {"status": "processing", "progress": 10, "stage": "generating", "user_id": user["id"]}

    asyncio.create_task(_merge_pipeline(
        task_id, user["id"], combined_transcript, options, mcq_options, api_key, title, merge_meta, total_duration, combined_segments
    ))
    return {"task_id": task_id, "mode": "regenerate"}


async def _merge_pipeline(task_id, user_id, transcript, options, mcq_options, api_key, title, merge_meta, total_duration, segments):
    try:
        outputs = {}
        gen_options = [o for o in options if o != "transcript"]

        if "transcript" in options:
            outputs["transcript"] = transcript

        tasks[task_id].update(progress=20)

        if gen_options:
            gen_tasks_map = {}
            for opt in gen_options:
                gen_func = GENERATORS.get(opt)
                if gen_func:
                    kwargs = {"transcript": transcript, "api_key": api_key}
                    if opt == "mcq":
                        kwargs["num_options"] = mcq_options
                    gen_tasks_map[opt] = asyncio.create_task(gen_func(**kwargs))

            total = len(gen_tasks_map)
            done = 0
            for opt, t in gen_tasks_map.items():
                try:
                    outputs[opt] = await t
                except Exception as e:
                    outputs[opt] = f"**Error:** {str(e)[:200]}"
                done += 1
                tasks[task_id]["progress"] = 20 + int((done / total) * 70)

        history_id = db.save_history(
            user_id, title, "merge", merge_meta,
            transcript, segments, outputs, options, total_duration, "",
        )

        tasks[task_id].update(
            status="done", stage="complete", progress=100,
            outputs=outputs, segments=segments,
            history_id=history_id,
        )
    except Exception as e:
        tasks[task_id].update(status="error", error=str(e))


# ---- Processing (works for guests AND logged-in users) ----
@app.post("/api/process")
async def process(request: Request):
    user = get_user(request)  # May be None for guests
    form = await request.form()
    url = form.get("url", "")
    file = form.get("file")
    options = json.loads(form.get("options", "[]"))
    mcq_options = int(form.get("mcq_options", "4"))
    guest_api_key = form.get("api_key", "")
    use_own_key = form.get("use_own_key", "") == "1"
    preferred_provider = form.get("preferred_provider", "")

    if not url and not file:
        raise HTTPException(400, "Provide a URL or upload a file")
    if not options:
        raise HTTPException(400, "Select at least one output option")

    # Validate YouTube URL loosely
    if url:
        if not any(d in url for d in ("youtube.com/", "youtu.be/")):
            raise HTTPException(400, "Invalid YouTube URL. Must be a youtube.com or youtu.be link.")

    # Pre-check: if AI options are selected, ensure an API key exists
    ai_options = [o for o in options if o != "transcript"]
    if ai_options:
        has_own_key = False
        if guest_api_key:
            has_own_key = True
        if user:
            user_keys = db.get_api_keys(user["id"])
            if user_keys.get("openai") or user_keys.get("gemini") or user_keys.get("anthropic"):
                has_own_key = True

        _, default_key = resolve_provider_and_key()
        if not has_own_key and not default_key:
            raise HTTPException(400, "No API key available. Add your key in Settings.")

        # Usage limit check when using default server key
        if not has_own_key and default_key:
            client_ip = request.client.host if request.client else "unknown"
            if user:
                used = db.get_usage_today(user_id=user["id"])
                if used >= LIMIT_LOGGED_IN:
                    raise HTTPException(429, f"Daily limit reached ({LIMIT_LOGGED_IN}/day). Add your own API key in Settings, or contact hello@tusharkhatri.in for increased quota.")
            else:
                used = db.get_usage_today(ip=client_ip)
                if used >= LIMIT_GUEST:
                    raise HTTPException(429, f"Guest limit reached ({LIMIT_GUEST}/day). Create an account for more, or add your own API key in Settings.")

    task_id = str(uuid.uuid4())[:8]
    user_id = user["id"] if user else None
    client_ip = request.client.host if request.client else "unknown"
    tasks[task_id] = {"status": "queued", "progress": 0, "stage": "starting", "user_id": user_id, "ip": client_ip}

    upload_path = None
    if file and hasattr(file, "read"):
        content = await file.read()
        # 500MB limit
        if len(content) > 500 * 1024 * 1024:
            raise HTTPException(400, "File too large. Maximum 500MB.")
        upload_path = UPLOAD_DIR / f"{task_id}_{file.filename}"
        with open(upload_path, "wb") as f:
            f.write(content)

    client_ip = request.client.host if request.client else "unknown"
    asyncio.create_task(_process_pipeline(
        task_id, user_id, options, mcq_options,
        youtube_url=url if url else None,
        upload_path=upload_path,
        guest_api_key=guest_api_key,
        client_ip=client_ip,
        use_own_key=use_own_key,
        preferred_provider=preferred_provider,
    ))
    return {"task_id": task_id}


@app.get("/api/status/{task_id}")
async def status_stream(task_id: str):
    async def event_stream():
        last_sent = None
        while True:
            task = tasks.get(task_id)
            if not task:
                yield f"data: {json.dumps({'error': 'Task not found'})}\n\n"
                break
            send = {k: v for k, v in task.items() if k not in ("user_id",)}
            current = json.dumps(send, default=str)
            if current != last_sent:
                yield f"data: {current}\n\n"
                last_sent = current
            if task.get("status") in ("done", "error"):
                break
            await asyncio.sleep(0.3)
    return StreamingResponse(event_stream(), media_type="text/event-stream")


@app.delete("/api/task/{task_id}")
async def cancel_task(task_id: str):
    """Cancel a running task."""
    task = tasks.get(task_id)
    if task:
        task["status"] = "cancelled"
        task["error"] = "Cancelled by user"
    return {"ok": True}


@app.get("/api/active-tasks")
async def get_active_tasks(request: Request):
    """Get all active tasks for the current user (for resume on page refresh)."""
    user = get_user(request)
    user_id = user["id"] if user else None
    client_ip = request.client.host if request.client else "unknown"

    active = []
    for tid, task in tasks.items():
        if task.get("status") in ("queued", "processing"):
            # Match by user_id or IP for guests
            if task.get("user_id") == user_id or (not user_id and task.get("ip") == client_ip):
                active.append({"task_id": tid, **{k: v for k, v in task.items() if k not in ("user_id", "ip")}})
    return {"tasks": active}


@app.get("/api/health")
async def health():
    _, key = resolve_provider_and_key()
    return {"status": "ok", "default_key": bool(key)}


# Usage limits: 20/day logged-in, 3/day guest (when using default key)
LIMIT_LOGGED_IN = 20
LIMIT_GUEST = 3


async def _process_pipeline(task_id: str, user_id, options: list,
                            mcq_options: int, youtube_url: str = None,
                            upload_path: Path = None, guest_api_key: str = "",
                            client_ip: str = "", use_own_key: bool = False,
                            preferred_provider: str = ""):
    try:
        tasks[task_id].update(status="processing", stage="downloading", progress=5)

        if youtube_url:
            audio_path = await download_youtube(youtube_url, task_id)
        else:
            tasks[task_id].update(stage="extracting_audio", progress=10)
            audio_path = TEMP_DIR / f"{task_id}.wav"
            await extract_audio(upload_path, audio_path)

        tasks[task_id].update(stage="transcribing", progress=20)

        loop = asyncio.get_event_loop()
        def progress_cb(pct):
            tasks[task_id]["progress"] = 20 + int(pct * 40)

        result = await loop.run_in_executor(
            None, lambda: transcribe(audio_path, progress_callback=progress_cb)
        )

        transcript_text = result["text"]
        segments = result["segments"]

        # Edge case: empty transcript (music video, no speech, etc.)
        if not transcript_text.strip():
            outputs = {}
            if "transcript" in options:
                outputs["transcript"] = "(No speech detected in this video)"
            ai_opts = [o for o in options if o != "transcript"]
            for opt in ai_opts:
                outputs[opt] = "**No speech detected in this video.** Cannot generate AI content from silence. Try a video with spoken content."
            tasks[task_id].update(
                status="done", stage="complete", progress=100,
                outputs=outputs, transcript="", segments=[],
                duration=result.get("duration", 0), language=result.get("language", ""),
                history_id=None,
            )
            for f in TEMP_DIR.glob(f"{task_id}*"):
                f.unlink(missing_ok=True)
            return

        tasks[task_id].update(stage="generating", progress=65)

        # Resolve API key based on user preference
        api_key = ""
        using_default_key = False
        if use_own_key:
            if user_id:
                user_keys = db.get_api_keys(user_id)
                api_key = user_keys.get(preferred_provider) or user_keys.get("openai") or user_keys.get("gemini") or user_keys.get("anthropic") or ""
            if not api_key and guest_api_key:
                api_key = guest_api_key
        if not api_key:
            _, api_key = resolve_provider_and_key()
            using_default_key = True

        outputs = {}
        gen_options = [o for o in options if o != "transcript"]

        if "transcript" in options:
            outputs["transcript"] = transcript_text

        if gen_options and api_key:
            gen_tasks = {}
            for opt in gen_options:
                gen_func = GENERATORS.get(opt)
                if gen_func:
                    kwargs = {"transcript": transcript_text, "api_key": api_key}
                    if opt == "mcq":
                        kwargs["num_options"] = mcq_options
                    gen_tasks[opt] = asyncio.create_task(gen_func(**kwargs))

            total = len(gen_tasks)
            done_count = 0
            for opt, t in gen_tasks.items():
                try:
                    outputs[opt] = await t
                except Exception as ai_err:
                    err_msg = str(ai_err)
                    if "401" in err_msg or "Incorrect API key" in err_msg:
                        outputs[opt] = "**Invalid API key.** Please check your OpenAI key in Settings."
                    elif "429" in err_msg or "Rate limit" in err_msg:
                        outputs[opt] = "**Rate limit reached.** Please wait a moment and try again."
                    elif "insufficient_quota" in err_msg:
                        outputs[opt] = "**API quota exceeded.** Check your OpenAI billing at platform.openai.com."
                    else:
                        outputs[opt] = f"**AI generation failed:** {err_msg[:200]}"
                done_count += 1
                pct = 65 + int((done_count / total) * 30)
                tasks[task_id].update(progress=pct)
            # Record usage if using default key
            if using_default_key:
                db.record_usage(user_id=user_id, ip=client_ip)
        elif gen_options and not api_key:
            for opt in gen_options:
                outputs[opt] = "**No API key found.** Add one in Settings first."

        # Save history only for logged-in users
        history_id = None
        if user_id:
            title = youtube_url or (upload_path.name if upload_path else "Video")
            if youtube_url:
                title = youtube_url.split("v=")[-1][:20] if "v=" in youtube_url else youtube_url[:50]
            history_id = db.save_history(
                user_id, title, "youtube" if youtube_url else "upload",
                youtube_url or "", transcript_text, segments, outputs, options,
                result.get("duration", 0), result.get("language", ""),
            )

        tasks[task_id].update(
            status="done", stage="complete", progress=100,
            outputs=outputs, transcript=transcript_text, segments=segments,
            duration=result.get("duration", 0), language=result.get("language", ""),
            history_id=history_id,
        )

        for f in TEMP_DIR.glob(f"{task_id}*"):
            f.unlink(missing_ok=True)
        if upload_path and upload_path.exists():
            upload_path.unlink(missing_ok=True)

    except Exception as e:
        tasks[task_id].update(status="error", error=str(e))
        for f in TEMP_DIR.glob(f"{task_id}*"):
            f.unlink(missing_ok=True)
