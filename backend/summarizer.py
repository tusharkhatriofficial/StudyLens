import os
from openai import AsyncOpenAI

TRANSCRIPT_LIMIT = 15000

# ===================== Multi-Provider AI Client =====================

def resolve_provider_and_key(api_key: str = None, provider: str = None):
    """
    Figures out which provider + key to use.
    Priority: explicit key > user DB key > server .env key
    Returns (provider, key) tuple.
    """
    if api_key and provider:
        return provider, api_key

    # Auto-detect provider from key format
    if api_key:
        if api_key.startswith("sk-"):
            return "openai", api_key
        elif api_key.startswith("AIza"):
            return "gemini", api_key
        elif api_key.startswith("sk-ant-"):
            return "anthropic", api_key
        return "openai", api_key  # default guess

    # Fall back to .env keys — try each
    for env_key, prov in [
        ("OPENAI_API_KEY", "openai"),
        ("GEMINI_API_KEY", "gemini"),
        ("ANTHROPIC_API_KEY", "anthropic"),
    ]:
        val = os.environ.get(env_key, "")
        if val:
            return prov, val

    return None, None


async def _call(api_key: str, system: str, prompt: str, provider: str = None) -> str:
    """Route to the right provider."""
    prov, key = resolve_provider_and_key(api_key, provider)
    if not key:
        return "**No API key configured.** Add one in Settings."

    if prov == "gemini":
        return await _call_gemini(key, system, prompt)
    elif prov == "anthropic":
        return await _call_anthropic(key, system, prompt)
    else:
        return await _call_openai(key, system, prompt)


async def _call_openai(api_key: str, system: str, prompt: str) -> str:
    client = AsyncOpenAI(api_key=api_key)
    resp = await client.chat.completions.create(
        model="gpt-4o-mini", temperature=0.3, max_tokens=4096,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": prompt},
        ],
    )
    return resp.choices[0].message.content


async def _call_gemini(api_key: str, system: str, prompt: str) -> str:
    from google import genai
    client = genai.Client(api_key=api_key)
    resp = await client.aio.models.generate_content(
        model="gemini-2.5-flash",
        contents=f"{system}\n\n{prompt}",
    )
    return resp.text


async def _call_anthropic(api_key: str, system: str, prompt: str) -> str:
    import anthropic
    client = anthropic.AsyncAnthropic(api_key=api_key)
    resp = await client.messages.create(
        model="claude-sonnet-4-6", max_tokens=4096, temperature=0.3,
        system=system,
        messages=[{"role": "user", "content": prompt}],
    )
    return resp.content[0].text


# For chat endpoints that create their own client
def _get_client(api_key: str = None):
    """Returns OpenAI client. Used by chat endpoints."""
    key = api_key or os.environ.get("OPENAI_API_KEY", "")
    return AsyncOpenAI(api_key=key)


def get_chat_provider_and_key(api_key: str = None, provider: str = None):
    """For chat endpoints — returns (provider, key)."""
    return resolve_provider_and_key(api_key, provider)


async def chat_completion(messages: list, api_key: str = None, provider: str = None) -> str:
    """Multi-provider chat completion for the chat feature."""
    prov, key = resolve_provider_and_key(api_key, provider)
    if not key:
        raise ValueError("No API key configured")

    if prov == "gemini":
        from google import genai
        client = genai.Client(api_key=key)
        # Convert messages to single string for Gemini
        text = "\n\n".join(f"{'User' if m['role']=='user' else 'System' if m['role']=='system' else 'Assistant'}: {m['content']}" for m in messages)
        resp = await client.aio.models.generate_content(model="gemini-2.5-flash", contents=text)
        return resp.text
    elif prov == "anthropic":
        import anthropic
        client = anthropic.AsyncAnthropic(api_key=key)
        sys_msg = next((m["content"] for m in messages if m["role"] == "system"), "")
        chat_msgs = [m for m in messages if m["role"] != "system"]
        resp = await client.messages.create(
            model="claude-sonnet-4-6", max_tokens=2048, temperature=0.4,
            system=sys_msg, messages=chat_msgs,
        )
        return resp.content[0].text
    else:
        client = AsyncOpenAI(api_key=key)
        resp = await client.chat.completions.create(
            model="gpt-4o-mini", temperature=0.4, max_tokens=2048,
            messages=messages,
        )
        return resp.choices[0].message.content


async def check_api(api_key: str = None) -> bool:
    _, key = resolve_provider_and_key(api_key)
    return bool(key)


# ===================== Generation Modes =====================

async def generate_transcript(transcript: str, **kw) -> str:
    return transcript


async def generate_summary_notes(transcript: str, api_key: str = None, provider: str = None, **kw) -> str:
    return await _call(api_key,
        "You are an expert study assistant. Create clear, structured study notes from video transcripts. Use markdown.",
        f"Create concise study notes from this transcript.\n\nRULES:\n- Extract ALL key concepts, definitions, facts\n- Use clear headings (##) and bullet points\n- Include formulas, dates, names, specific data\n- Someone should NOT need to watch the video after reading these\n\nTRANSCRIPT:\n{transcript[:TRANSCRIPT_LIMIT]}\n\nSTUDY NOTES:",
        provider)


async def generate_main_topics(transcript: str, api_key: str = None, provider: str = None, **kw) -> str:
    return await _call(api_key,
        "You are an expert educator. Extract and summarize main topics from video transcripts. Use markdown.",
        f"Identify every topic discussed in this video transcript.\n\nFor EACH topic provide:\n1. **Topic Name** — clear, searchable title\n2. **Summary** — 3-5 sentence explanation\n3. **Key Points** — bullet list of facts/concepts\n4. **Keywords** — comma-separated terms\n\nTRANSCRIPT:\n{transcript[:TRANSCRIPT_LIMIT]}\n\nTOPICS:",
        provider)


async def generate_detailed_notes_qa(transcript: str, api_key: str = None, provider: str = None, **kw) -> str:
    return await _call(api_key,
        "You are an expert educator creating comprehensive exam preparation material. Use markdown.",
        f"Create EXTREMELY detailed study notes with Q&A from this transcript.\n\nInclude:\n1. **Detailed Notes** — every concept explained thoroughly with examples\n2. **Possible Exam Questions & Answers** — for EACH topic, list questions an examiner could ask and provide model answers\n3. **Key Definitions** — glossary of important terms\n4. **Common Mistakes** — pitfalls students should avoid\n\nBe thorough. Cover everything. This is exam prep material.\n\nTRANSCRIPT:\n{transcript[:TRANSCRIPT_LIMIT]}\n\nDETAILED NOTES & Q&A:",
        provider)


async def generate_practice_qa(transcript: str, api_key: str = None, provider: str = None, **kw) -> str:
    return await _call(api_key,
        "You are an expert exam creator. Generate practice questions with answers. Use markdown.",
        f"Generate a comprehensive practice question set from this transcript.\n\nCreate:\n- 10-15 short answer questions with detailed answers\n- 5-8 long answer / essay-type questions with model answers\n- 5 true/false questions with explanations\n\nFormat each as:\n**Q1:** [question]\n**A:** [answer]\n\nTRANSCRIPT:\n{transcript[:TRANSCRIPT_LIMIT]}\n\nPRACTICE SET:",
        provider)


async def generate_mcq(transcript: str, api_key: str = None, provider: str = None, num_options: int = 4, **kw) -> str:
    return await _call(api_key,
        "You are an expert exam creator specializing in multiple choice questions. Use markdown.",
        f"Generate 15-20 multiple choice questions from this transcript.\n\nEach question must have exactly {num_options} options labeled A, B, C{', D' if num_options >= 4 else ''}{', E' if num_options >= 5 else ''} etc.\n\nFormat:\n**Q1.** [question]\nA) [option]\nB) [option]\nC) [option]\n{'D) [option]' if num_options >= 4 else ''}\n{'E) [option]' if num_options >= 5 else ''}\n\n**Answer:** [correct letter] — [brief explanation]\n\n---\n\nMake questions test real understanding, not just memorization.\n\nTRANSCRIPT:\n{transcript[:TRANSCRIPT_LIMIT]}\n\nMCQ SET:",
        provider)


async def generate_exhaustive_notes(transcript: str, api_key: str = None, provider: str = None, **kw) -> str:
    return await _call(api_key,
        "You are an obsessively thorough note-taker and educator. Capture EVERY SINGLE piece of information. Use markdown.",
        f"Create EXHAUSTIVE, incredibly detailed notes from this transcript. Capture absolutely everything.\n\nRULES:\n- Document EVERY concept, fact, example, analogy, story, aside, and remark\n- If the speaker mentioned it, it goes in the notes\n- Organize into clear sections with ## headings\n- Under each section, use nested bullet points for details\n- Include exact numbers, names, dates, formulas, and quotes\n- Add a \"Key Definitions\" section at the end\n- Add a \"Timeline / Flow\" section showing order of topics\n- This should be a COMPLETE replacement for watching the video\n\nTRANSCRIPT:\n{transcript[:TRANSCRIPT_LIMIT]}\n\nEXHAUSTIVE NOTES:",
        provider)


GENERATORS = {
    "transcript": generate_transcript,
    "summary_notes": generate_summary_notes,
    "main_topics": generate_main_topics,
    "detailed_qa": generate_detailed_notes_qa,
    "practice_qa": generate_practice_qa,
    "mcq": generate_mcq,
    "exhaustive": generate_exhaustive_notes,
}
