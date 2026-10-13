from __future__ import annotations

from pydantic import BaseModel

# Languages Qwen-Audio-TTS supports, mapped from the request's ``language``
# value to the ISO code the enrollment and synthesis APIs expect as
# ``language_hints``.
LANGUAGE_CODES: dict[str, str] = {
    "Chinese": "zh",
    "English": "en",
    "German": "de",
    "Italian": "it",
    "Portuguese": "pt",
    "Spanish": "es",
    "Japanese": "ja",
    "Korean": "ko",
    "French": "fr",
    "Russian": "ru",
}

# Let DashScope detect the language instead of hinting one.
AUTO_LANGUAGE = "Auto"

SUPPORTED_LANGUAGES = sorted([*LANGUAGE_CODES, AUTO_LANGUAGE])


class HealthResponse(BaseModel):
    status: str
    provider: str
    model: str
    enrollment_model: str
    api_key_configured: bool
    cached_voices: int
