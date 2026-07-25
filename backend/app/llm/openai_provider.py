from __future__ import annotations

import base64

from openai import AsyncOpenAI

from .base import HandwritingExample, LLMProvider

EXAMPLE_QUESTION = "What is the correct LaTeX for this handwritten symbol or equation?"


def _image_content(image_bytes: bytes, mime_type: str) -> dict:
    data = base64.standard_b64encode(image_bytes).decode("utf-8")
    return {"type": "image_url", "image_url": {"url": f"data:{mime_type};base64,{data}"}}


class OpenAIProvider(LLMProvider):
    def __init__(self, api_key: str, model: str):
        self.client = AsyncOpenAI(api_key=api_key)
        self.model = model

    async def recognize_equation(
        self,
        image_bytes: bytes,
        mime_type: str,
        prompt: str,
        examples: list[HandwritingExample] | None = None,
    ) -> str:
        messages = _build_few_shot_messages(examples)
        messages.append(
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    _image_content(image_bytes, mime_type),
                ],
            }
        )

        response = await self.client.chat.completions.create(
            model=self.model,
            max_completion_tokens=1024,
            messages=messages,
        )
        return (response.choices[0].message.content or "").strip()

    async def translate_text(self, text: str, target_lang: str) -> str:
        prompt = (
            f"Translate the following text into {target_lang}. "
            "Preserve any LaTeX math expressions exactly as they are. "
            f"Return only the translation, nothing else.\n\n{text}"
        )
        response = await self.client.chat.completions.create(
            model=self.model,
            max_completion_tokens=2048,
            messages=[{"role": "user", "content": prompt}],
        )
        return (response.choices[0].message.content or "").strip()


def _build_few_shot_messages(examples: list[HandwritingExample] | None) -> list[dict]:
    messages: list[dict] = []
    for example in examples or []:
        messages.append(
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": EXAMPLE_QUESTION},
                    _image_content(example.image_bytes, example.mime_type),
                ],
            }
        )
        messages.append({"role": "assistant", "content": example.label})
    return messages
