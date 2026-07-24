from __future__ import annotations

import base64

import anthropic

from .base import HandwritingExample, LLMProvider

BASE_RECOGNIZE_PROMPT = (
    "This image contains a handwritten math equation on a whiteboard-style canvas. "
    "Transcribe it as clean, valid LaTeX. Return ONLY the LaTeX for the equation itself — "
    "no explanation, no markdown code fences, and no surrounding $ or $$ delimiters."
)

FEW_SHOT_RECOGNIZE_PROMPT = (
    "The preceding examples show this teacher's handwriting style, each with its correct "
    "LaTeX reading. Using them as a style reference, read the following handwritten "
    "equation and return clean LaTeX. Return ONLY the LaTeX for the equation itself — "
    "no explanation, no markdown code fences, and no surrounding $ or $$ delimiters."
)

EXAMPLE_QUESTION = "What is the correct LaTeX for this handwritten symbol or equation?"


def _image_block(image_bytes: bytes, mime_type: str) -> dict:
    return {
        "type": "image",
        "source": {
            "type": "base64",
            "media_type": mime_type,
            "data": base64.standard_b64encode(image_bytes).decode("utf-8"),
        },
    }


class AnthropicProvider(LLMProvider):
    def __init__(self, api_key: str, model: str):
        self.client = anthropic.AsyncAnthropic(api_key=api_key)
        self.model = model

    async def recognize_equation(
        self,
        image_bytes: bytes,
        mime_type: str,
        examples: list[HandwritingExample] | None = None,
    ) -> str:
        messages = _build_few_shot_messages(examples)
        prompt = FEW_SHOT_RECOGNIZE_PROMPT if examples else BASE_RECOGNIZE_PROMPT
        messages.append(
            {
                "role": "user",
                "content": [_image_block(image_bytes, mime_type), {"type": "text", "text": prompt}],
            }
        )

        response = await self.client.messages.create(
            model=self.model,
            max_tokens=1024,
            messages=messages,
        )
        return _extract_text(response)

    async def translate_text(self, text: str, target_lang: str) -> str:
        prompt = (
            f"Translate the following text into {target_lang}. "
            "Preserve any LaTeX math expressions exactly as they are. "
            f"Return only the translation, nothing else.\n\n{text}"
        )
        response = await self.client.messages.create(
            model=self.model,
            max_tokens=2048,
            messages=[{"role": "user", "content": prompt}],
        )
        return _extract_text(response)


def _build_few_shot_messages(examples: list[HandwritingExample] | None) -> list[dict]:
    messages: list[dict] = []
    for example in examples or []:
        messages.append(
            {
                "role": "user",
                "content": [
                    _image_block(example.image_bytes, example.mime_type),
                    {"type": "text", "text": EXAMPLE_QUESTION},
                ],
            }
        )
        messages.append({"role": "assistant", "content": example.label})
    return messages


def _extract_text(response: anthropic.types.Message) -> str:
    return "".join(block.text for block in response.content if block.type == "text").strip()
