---
name: tune-pronunciation
description: Fix a word or phrase the Azure TTS voice (lt-LT-LeonasNeural) reads wrong. Pass the misread text as $ARGUMENTS or be prompted for one.
---

Guided loop for fixing a mispronounced word or phrase in `/api/audio` (see `documentation/audio.md`).
Claude cannot hear audio — a human always picks the winning candidate. Never guess and never skip
that step.

## 1. Input

`$ARGUMENTS` is the misread word or phrase. If empty, ask for it with `AskUserQuestion`
("What word or phrase is mispronounced?", free text).

## 2. Look up the target file

The fix must land in the JSON file that matches where the text actually lives — a word-level fix
and a phrase-level fix are kept in separate files on purpose (they're expected to diverge over
time).

Query the Fluent database to decide:
- A match against `Word.lithuanian` → `backend/data/pronunciation.json`.
- A match against `Phrase.text` or `CustomPhrase.text` → `backend/data/phrase_pronunciation.json`.
- No match in either → say so and stop. `/api/audio` would 404 on this text anyway (the endpoint
  only ever synthesizes text the app owns), so there is nothing to fix.

`psql` is **not installed** on this machine. Parse `DATABASE_URL` out of `backend/.env` yourself
(strip any `postgresql+psycopg://` prefix down to `postgresql://`) and query with **psycopg3**
(`import psycopg`) from the backend venv — `psycopg2` is present but broken. Do not `source`/`set
-a` `backend/.env` for this (see the credentials note below); read `DATABASE_URL` the same way,
with Python.

## 3. Credentials

Read `AZURE_SPEECH_KEY` and `AZURE_SPEECH_REGION` out of `backend/.env` **with Python**, never
`source`/`set -a` — that file contains characters (e.g. `&`) that break shell parsing with a
`parse error near '&'`. Never echo or log the key.

```python
import re
env = open("backend/.env").read()
def get(name):
    m = re.search(rf'^{name}=(.*)$', env, re.MULTILINE)
    return m.group(1).strip().strip('"').strip("'") if m else None
key = get("AZURE_SPEECH_KEY")
region = get("AZURE_SPEECH_REGION")
```

## 4. Generate candidates

POST SSML to `https://{region}.tts.speech.microsoft.com/cognitiveservices/v1` with voice
`lt-LT-LeonasNeural` — the same voice `backend/routers/audio.py` uses, so what you hear matches
production. Generate 3–4 respelling candidates per round **plus the unmodified baseline**, so the
user can A/B against what's currently shipping. Save the resulting mp3s to the session scratchpad
(never the repo).

```python
import httpx
def synthesize(spoken: str) -> bytes:
    ssml = (
        f"<speak version='1.0' xml:lang='lt-LT'><voice name='lt-LT-LeonasNeural'>"
        f"{spoken}</voice></speak>"
    )
    r = httpx.post(
        f"https://{region}.tts.speech.microsoft.com/cognitiveservices/v1",
        content=ssml.encode("utf-8"),
        headers={
            "Ocp-Apim-Subscription-Key": key,
            "Content-Type": "application/ssml+xml",
            "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
            "User-Agent": "fluent",
        },
        timeout=10.0,
    )
    r.raise_for_status()
    return r.content
```

## 5. What actually works (learned the hard way — don't re-derive this)

- **Stress diacritics have no audible effect on this voice.** Acute `ú`, grave `ù`, tilde, macron
  `ū` — none of them change how Leonas reads the word. `backend/routers/audio.py` already strips
  them before every TTS call (`_strip_stress_marks`), and manually re-adding one back in made no
  difference in A/B testing either. **Do not waste a round on diacritic variants.**
- **Real respellings work.** Two techniques that have fixed real mispronunciations:
  - Inserting a space to split the word after the stressed syllable:
    `sumuštin` → `sumu štin` (fixes "sumuštinis" and every case form).
  - Substituting letters to force a different grapheme-to-phoneme path:
    `siųsti` → `sjūsti`.
- If none of a round's candidates work, generate another round trying variations on these two
  techniques (different split points, different substitute letters) — not diacritics.

## 6. Play and choose

Play each candidate labelled (baseline first, then each candidate) with `afplay`, pausing between
each so the user can listen:

```bash
afplay <path-to-mp3>
```

Then use `AskUserQuestion` to ask the user which one is correct (options: baseline / candidate 1 /
candidate 2 / … / "none, try another round"). **Never decide this yourself** — you cannot hear
audio, and guessing here is the one thing this skill exists to prevent.

## 7. Write the fix

Append `{"from": "...", "to": "...", "note": "..."}` to the `fixes` array of the file chosen in
step 2 (`about` stays as-is). Key on the **root**, not the inflected form (`sumuštin`, not
`sumuštinio`), so every case form is fixed at once — but never a bare letter pair, which would
corrupt unrelated words that happen to contain it. Before writing, verify the root choice by
synthesizing one *other* inflected form of the same word (via step 4's `synthesize()`) and
confirming it also sounds right — a root that only happens to work for the one form the user
reported is a bug waiting to surface on the next form.

## 8. Aftermath

No restart and no cache purge needed:
- `_respell_map()` re-reads the JSON files whenever their mtime changes, so the fix applies on the
  very next `/api/audio` request.
- The `AudioClip` cache key is `sha1("azure:<voice>|<spoken text>")` — a changed respelling changes
  the *spoken* text, so it's a different key. The old (wrongly spoken) clip is simply never looked
  up again; it isn't purged and doesn't need to be.

Do not go looking for a purge step or a way to invalidate old rows — there isn't one, and there
doesn't need to be.
