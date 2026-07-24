from functools import lru_cache

from app.config import get_settings

from .base import LLMProvider


@lru_cache
def get_llm_provider() -> LLMProvider:
    """Returns the configured LLM provider, selected via the LLM_PROVIDER env var."""
    settings = get_settings()

    if settings.llm_provider == "anthropic":
        from .anthropic_provider import AnthropicProvider

        return AnthropicProvider(api_key=settings.anthropic_api_key, model=settings.anthropic_model)

    if settings.llm_provider == "openai":
        from .openai_provider import OpenAIProvider

        return OpenAIProvider(api_key=settings.openai_api_key, model=settings.openai_model)

    raise ValueError(f"Unknown LLM_PROVIDER: {settings.llm_provider!r} (expected 'anthropic' or 'openai')")


__all__ = ["LLMProvider", "get_llm_provider"]
