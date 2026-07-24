from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    llm_provider: str = "anthropic"

    anthropic_api_key: str = ""
    anthropic_model: str = "claude-opus-4-8"

    openai_api_key: str = ""
    openai_model: str = "gpt-4o"

    # OAuth client ID from Google Cloud Console (Credentials -> OAuth client ID
    # -> Web application). Must match the client ID configured on the frontend.
    google_client_id: str = ""
    # Optional: restrict sign-in to a single Google Workspace domain (the
    # token's "hd" claim). Leave blank to allow any Google account.
    google_allowed_domain: str = ""

    # Signs the app's own session tokens issued after Google verification.
    # Set this to a long random value in production.
    secret_key: str = "change-this-in-production"

    cors_origins: str = "http://localhost:5173"


@lru_cache
def get_settings() -> Settings:
    return Settings()
