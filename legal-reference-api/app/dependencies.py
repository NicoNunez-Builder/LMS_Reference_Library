from typing import Generator
from supabase import create_client, Client
from app.config import get_settings


def get_supabase() -> Generator[Client, None, None]:
    """
    Dependency that provides a Supabase client.

    Usage in route:
        @router.get("/")
        async def get_items(supabase: Client = Depends(get_supabase)):
            ...
    """
    settings = get_settings()
    client = create_client(settings.supabase_url, settings.supabase_key)
    try:
        yield client
    finally:
        # Supabase client doesn't need explicit cleanup
        pass


def get_supabase_client() -> Client:
    """
    Get Supabase client directly (for services).
    """
    settings = get_settings()
    return create_client(settings.supabase_url, settings.supabase_key)
