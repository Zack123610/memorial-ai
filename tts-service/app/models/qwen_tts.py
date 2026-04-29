from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

import numpy as np

logger = logging.getLogger(__name__)


def resolve_device(requested: str) -> str:
    if requested != "auto":
        return requested
    import torch

    if torch.backends.mps.is_available():
        return "mps"
    if torch.cuda.is_available():
        return "cuda"
    return "cpu"


def resolve_dtype(name: str) -> Any:
    import torch

    return {
        "float16": torch.float16,
        "bfloat16": torch.bfloat16,
        "float32": torch.float32,
    }[name]


@dataclass
class CloneResult:
    audio: np.ndarray
    sample_rate: int


class QwenTtsRunner:
    """Lazy wrapper around Qwen3-TTS-12Hz-1.7B-CustomVoice."""

    def __init__(self, model_id: str, device: str, dtype_name: str) -> None:
        self.model_id = model_id
        self.device = device
        self.dtype_name = dtype_name
        self._model: Any | None = None

    @property
    def loaded(self) -> bool:
        return self._model is not None

    def load(self) -> None:
        if self._model is not None:
            return

        # flash_attention_2 is NVIDIA-only; on Apple Silicon use sdpa.
        from qwen_tts import Qwen3TTSModel

        device = resolve_device(self.device)
        dtype = resolve_dtype(self.dtype_name)
        attn = "sdpa" if device != "cuda" else "flash_attention_2"

        logger.info("loading %s on %s (%s, attn=%s)", self.model_id, device, self.dtype_name, attn)
        self._model = Qwen3TTSModel.from_pretrained(
            self.model_id,
            device_map=device,
            dtype=dtype,
            attn_implementation=attn,
        )
        self.device = device
        logger.info("model ready")

    def clone(
        self,
        text: str,
        language: str,
        ref_audio: tuple[np.ndarray, int] | str,
        ref_text: str,
    ) -> CloneResult:
        if self._model is None:
            self.load()
        assert self._model is not None

        wavs, sr = self._model.generate_voice_clone(
            text=text,
            language=language,
            ref_audio=ref_audio,
            ref_text=ref_text,
        )
        # generate_voice_clone returns a list (one per text). For single-text input, take first.
        audio = wavs[0] if isinstance(wavs, list) else wavs
        return CloneResult(audio=np.asarray(audio), sample_rate=int(sr))
