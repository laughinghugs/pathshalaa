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
        prompt: str,
        examples: list[HandwritingExample] | None = None,
    ) -> str:
        """Returns the model's raw text response for the given image.

        `prompt` is built by app/plugins/prompts.py from whichever
        subject-agent(s) are active — it instructs the model to return a
        JSON array of AICommand objects (see app/commands.py), which the
        caller is responsible for parsing/validating. This method itself
        stays subject-agnostic.

        If `examples` is given, they're injected ahead of the new image as
        few-shot (image -> correct label) pairs so the model can calibrate to
        that teacher's handwriting style.
        """

    @abstractmethod
    async def translate_text(self, text: str, target_lang: str) -> str:
        """Translates text into target_lang, preserving any embedded LaTeX."""

    @abstractmethod
    async def solve_equation(self, prompt: str) -> str:
        """Returns the model's raw text response for a step-by-step solve prompt.

        `prompt` is built by app/solving.py, which already computed and
        embedded the verified correct final answer (via SymPy) — the model's
        job is only to narrate a pedagogical path to it, as a JSON
        `solution_steps` command (see app/commands.py), which the caller is
        responsible for parsing/validating.
        """
