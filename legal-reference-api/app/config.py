from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Application
    app_name: str = "Legal Reference Library API"
    debug: bool = False

    # Supabase
    supabase_url: str
    supabase_key: str

    # External APIs
    google_api_key: str = ""
    google_search_engine_id: str = ""
    youtube_api_key: str = ""
    courtlistener_api_token: str = ""
    congress_api_key: str = ""
    firecrawl_api_key: str = ""
    unicourt_client_id: str = ""
    unicourt_client_secret: str = ""

    # AI
    openai_api_key: str = ""
    gemini_api_key: str = ""

    # CORS
    frontend_url: str = "http://localhost:3000"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
