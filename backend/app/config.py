from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    llm_provider: str = "anthropic"

    # Postgres connection string (Render sets this for the deployed
    # backend). Empty means "use the local SQLite files under backend/data/"
    # — see app/db.py.
    database_url: str = ""

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

    # Comma-separated emails granted the "owner" / "developer" role the
    # first time they sign in (bootstrapping — there's no in-app role
    # editor yet, see app/billing/trial.py). Existing user rows are never
    # overridden by these lists, so removing an email here after they've
    # already signed in has no effect; that requires a direct DB edit.
    owner_emails: str = ""
    developer_emails: str = ""


@lru_cache
def get_settings() -> Settings:
    return Settings()
