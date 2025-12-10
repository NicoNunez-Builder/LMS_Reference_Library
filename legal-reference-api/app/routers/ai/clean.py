"""Clean endpoint - basic text cleaning for resources."""
from fastapi import APIRouter, Query
from typing import Optional

from app.config import get_settings
from app.models.ai import (
    CleanRequest,
    CleanResponse,
    CleaningStats,
    CleaningOptions,
)
from app.services.ai import clean_content, get_cleaning_stats
from supabase import create_client

router = APIRouter()


def get_supabase():
    """Get Supabase client."""
    settings = get_settings()
    return create_client(settings.supabase_url, settings.supabase_key)


@router.post("", response_model=CleanResponse)
async def clean_text(request: CleanRequest):
    """
    Preview or apply cleaning to text content.

    - Can clean direct text input or fetch from resource_id
    - Preview mode shows before/after
    - Apply mode saves cleaned content back to resource
    """
    try:
        original_content = request.text or ""
        resource_title = "Direct Input"

        # Fetch content from resource if ID provided
        if request.resource_id and not request.text:
            supabase = get_supabase()

            resource_result = supabase.table("lr_resources").select(
                "id, title, content, description"
            ).eq("id", request.resource_id).single().execute()

            if not resource_result.data:
                return CleanResponse(
                    success=False,
                    error="Resource not found"
                )

            resource = resource_result.data
            original_content = resource.get("content") or resource.get("description") or ""
            resource_title = resource.get("title", "")

        if not original_content:
            return CleanResponse(
                success=False,
                error="No content to clean"
            )

        # Build cleaning options - conservative defaults for legal docs
        if request.options:
            opts = request.options.model_dump(by_alias=False)
        else:
            opts = {
                "remove_html": True,
                "remove_urls": False,  # URLs are often citations
                "remove_boilerplate": False,
                "normalize_whitespace": True,
                "remove_short_lines": False,  # Too aggressive
                "min_line_length": 10,
                "remove_duplicates": False,  # Legal docs repeat phrases
                "normalize_markdown": True,
            }

        cleaned_content = clean_content(original_content, opts)
        stats = get_cleaning_stats(original_content, cleaned_content)

        # Apply changes if requested
        if request.apply and request.resource_id:
            supabase = get_supabase()

            update_result = supabase.table("lr_resources").update({
                "content": cleaned_content
            }).eq("id", request.resource_id).execute()

            return CleanResponse(
                success=True,
                applied=True,
                resource_id=request.resource_id,
                title=resource_title,
                stats=CleaningStats(
                    original_chars=stats["original_chars"],
                    cleaned_chars=stats["cleaned_chars"],
                    reduction_percent=stats["reduction_percent"],
                ),
                message=f"Content cleaned and saved. Reduced by {stats['reduction_percent']}%",
            )

        # Return preview
        return CleanResponse(
            success=True,
            applied=False,
            resource_id=request.resource_id,
            title=resource_title,
            original={
                "content": original_content[:2000] + ("..." if len(original_content) > 2000 else ""),
                "length": len(original_content),
            },
            cleaned={
                "content": cleaned_content[:2000] + ("..." if len(cleaned_content) > 2000 else ""),
                "length": len(cleaned_content),
            },
            stats=CleaningStats(
                original_chars=stats["original_chars"],
                cleaned_chars=stats["cleaned_chars"],
                reduction_percent=stats["reduction_percent"],
            ),
            options=CleaningOptions(**opts),
        )

    except Exception as e:
        return CleanResponse(
            success=False,
            error=f"Cleaning failed: {str(e)}"
        )


@router.get("")
async def get_cleaning_preview(resource_id: str = Query(...)):
    """Get cleaning stats for a resource without modifying."""
    try:
        supabase = get_supabase()

        resource_result = supabase.table("lr_resources").select(
            "id, title, content, description"
        ).eq("id", resource_id).single().execute()

        if not resource_result.data:
            return {
                "success": False,
                "error": "Resource not found"
            }

        resource = resource_result.data
        original_content = resource.get("content") or resource.get("description") or ""

        if not original_content:
            return {
                "resource_id": resource_id,
                "title": resource.get("title"),
                "has_content": False,
                "stats": None,
            }

        cleaned_content = clean_content(original_content)
        stats = get_cleaning_stats(original_content, cleaned_content)

        return {
            "resource_id": resource_id,
            "title": resource.get("title"),
            "has_content": True,
            "stats": stats,
        }

    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }
