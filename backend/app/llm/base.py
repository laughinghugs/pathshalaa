from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class HandwritingExample:
    """A single (image, correct LaTeX) pair used as a few-shot style reference.

    Sourced from a teacher's onboarding calibration samples or from later
    corrections — see app/calibration.py.
    """

    image_bytes: bytes
    mime_type: str
    label: str


class LLMProvider(ABC):
    """Provider-agnostic interface for handwriting recognition and translation.

    Concrete providers (Anthropic, OpenAI) implement this so the rest of the
    app never has to know which one is active.
    """

    @abstractmethod
    async def recognize_equation(
        self,
        image_bytes: bytes,
        mime_type: str,
        examples: list[HandwritingExample] | None = None,
    ) -> str:
        """Returns clean LaTeX for the handwritten equation in the given image.

        If `examples` is given, they're injected ahead of the new image as
        few-shot (image -> correct LaTeX) pairs so the model can calibrate to
        that teacher's handwriting style.
        """

    @abstractmethod
    async def translate_text(self, text: str, target_lang: str) -> str:
        """Translates text into target_lang, preserving any embedded LaTeX."""
