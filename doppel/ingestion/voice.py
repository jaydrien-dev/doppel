"""
Voice memo transcription via OpenAI Whisper API.

Accepts audio bytes (webm/opus from browser MediaRecorder or other formats),
sends to Whisper for transcription, returns the transcript text.
"""
from __future__ import annotations

import io
import logging

_log = logging.getLogger(__name__)


async def transcribe_audio(audio_bytes: bytes, filename: str = "memo.webm") -> str:
    """
    Transcribe audio bytes using OpenAI Whisper API.
    Returns the transcript text. Raises on API failure.
    """
    import openai

    client = openai.AsyncOpenAI()

    audio_file = io.BytesIO(audio_bytes)
    audio_file.name = filename

    response = await client.audio.transcriptions.create(
        model="whisper-1",
        file=audio_file,
        response_format="text",
    )

    transcript = response.strip() if isinstance(response, str) else str(response).strip()
    _log.info("Voice memo transcribed: %d chars", len(transcript))
    return transcript
