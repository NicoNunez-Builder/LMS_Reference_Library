"""Embeddings endpoint - generate and manage vector embeddings."""
from fastapi import APIRouter, Query
from typing import Optional

from app.config import get_settings
from app.models.ai import (
    EmbedRequest,
    EmbedResponse,
    EmbedResult,
    EmbedStatusResponse,
)
from app.services.ai import (
    chunk_text,
    count_tokens,
    clean_content,
    get_cleaning_stats,
    generate_embeddings,
)
from supabase import create_client

router = APIRouter()


def get_supabase():
    """Get Supabase client."""
    settings = get_settings()
    return create_client(settings.supabase_url, settings.supabase_key)


@router.post("", response_model=EmbedResponse)
async def generate_resource_embeddings(request: EmbedRequest):
    """
    Generate embeddings for one or more resources.

    - Chunks text content
    - Generates embeddings using OpenAI
    - Stores in lr_embeddings table with pgvector
    """
    settings = get_settings()

    if not settings.openai_api_key:
        return EmbedResponse(
            success=False,
            processed=0,
            successful=0,
            skipped=0,
            errors=1,
            results=[],
            message="OpenAI API key not configured"
        )

    if not request.resource_id and not request.resource_ids:
        return EmbedResponse(
            success=False,
            processed=0,
            successful=0,
            skipped=0,
            errors=1,
            results=[],
            message="resource_id or resource_ids required"
        )

    supabase = get_supabase()
    ids = request.resource_ids or [request.resource_id]
    results = []

    for resource_id in ids:
        try:
            # Check if embeddings already exist
            if not request.force:
                count_result = supabase.table("lr_embeddings").select(
                    "id", count="exact"
                ).eq("resource_id", resource_id).execute()

                if count_result.count and count_result.count > 0:
                    results.append(EmbedResult(
                        resource_id=resource_id,
                        title="",
                        chunks=count_result.count,
                        status="skipped",
                    ))
                    continue

            # Get resource content
            resource_result = supabase.table("lr_resources").select(
                "id, title, content, description, url"
            ).eq("id", resource_id).single().execute()

            if not resource_result.data:
                results.append(EmbedResult(
                    resource_id=resource_id,
                    title="",
                    chunks=0,
                    status="error",
                    error="Resource not found",
                ))
                continue

            resource = resource_result.data
            raw_content = resource.get("content") or resource.get("description") or ""

            if not raw_content or len(raw_content) < 50:
                results.append(EmbedResult(
                    resource_id=resource_id,
                    title=resource.get("title", ""),
                    chunks=0,
                    status="error",
                    error="No content to embed (content too short or missing)",
                ))
                continue

            # Clean content if requested
            if request.clean_data:
                text_content = clean_content(raw_content)
                cleaning_stats = get_cleaning_stats(raw_content, text_content)
            else:
                text_content = raw_content
                cleaning_stats = None

            if not text_content or len(text_content) < 50:
                results.append(EmbedResult(
                    resource_id=resource_id,
                    title=resource.get("title", ""),
                    chunks=0,
                    status="error",
                    error="Content too short after cleaning",
                ))
                continue

            # Delete existing embeddings if force
            if request.force:
                supabase.table("lr_embeddings").delete().eq(
                    "resource_id", resource_id
                ).execute()

            # Chunk the text
            chunks = chunk_text(text_content)

            if not chunks:
                results.append(EmbedResult(
                    resource_id=resource_id,
                    title=resource.get("title", ""),
                    chunks=0,
                    status="error",
                    error="No chunks generated",
                ))
                continue

            # Generate embeddings in batches
            batch_size = 100
            all_embeddings = []

            for i in range(0, len(chunks), batch_size):
                batch = chunks[i:i + batch_size]
                embeddings = await generate_embeddings(batch)
                all_embeddings.extend(embeddings)

            # Insert embeddings
            embedding_records = [
                {
                    "resource_id": resource_id,
                    "chunk_index": idx,
                    "chunk_text": chunk,
                    "embedding": f"[{','.join(str(x) for x in all_embeddings[idx])}]",
                    "token_count": count_tokens(chunk),
                    "metadata": {
                        "source_title": resource.get("title"),
                        "source_url": resource.get("url"),
                    },
                }
                for idx, chunk in enumerate(chunks)
            ]

            insert_result = supabase.table("lr_embeddings").insert(
                embedding_records
            ).execute()

            results.append(EmbedResult(
                resource_id=resource_id,
                title=resource.get("title", ""),
                chunks=len(chunks),
                status="success",
                cleaning_stats=cleaning_stats,
            ))

        except Exception as e:
            results.append(EmbedResult(
                resource_id=resource_id,
                title="",
                chunks=0,
                status="error",
                error=str(e),
            ))

    successful = len([r for r in results if r.status == "success"])
    skipped = len([r for r in results if r.status == "skipped"])
    errors = len([r for r in results if r.status == "error"])

    return EmbedResponse(
        success=True,
        processed=len(results),
        successful=successful,
        skipped=skipped,
        errors=errors,
        results=results,
        message=f"Embedded {successful} resources, {skipped} skipped, {errors} errors",
    )


@router.get("")
async def get_embedding_status(
    resource_id: Optional[str] = Query(None),
    category_id: Optional[str] = Query(None),
):
    """Get embedding status for resources."""
    settings = get_settings()
    supabase = get_supabase()

    try:
        if resource_id:
            # Get count for specific resource
            count_result = supabase.table("lr_embeddings").select(
                "id", count="exact"
            ).eq("resource_id", resource_id).execute()

            return {
                "resource_id": resource_id,
                "embedded": (count_result.count or 0) > 0,
                "chunks": count_result.count or 0,
            }

        if category_id:
            # Get stats for category
            resources_result = supabase.table("lr_resources").select(
                "id, title"
            ).eq("category_id", category_id).execute()

            resources = resources_result.data or []
            if not resources:
                return {
                    "category_id": category_id,
                    "total_resources": 0,
                    "embedded_resources": 0,
                    "resources": [],
                }

            resource_ids = [r["id"] for r in resources]

            embeddings_result = supabase.table("lr_embeddings").select(
                "resource_id"
            ).in_("resource_id", resource_ids).execute()

            embedded_ids = set(e["resource_id"] for e in (embeddings_result.data or []))

            return {
                "category_id": category_id,
                "total_resources": len(resources),
                "embedded_resources": len(embedded_ids),
                "resources": [
                    {
                        "id": r["id"],
                        "title": r["title"],
                        "embedded": r["id"] in embedded_ids,
                    }
                    for r in resources
                ],
            }

        # General stats
        total_result = supabase.table("lr_embeddings").select(
            "id", count="exact"
        ).execute()

        resources_result = supabase.table("lr_embeddings").select(
            "resource_id"
        ).execute()

        unique_resources = set(e["resource_id"] for e in (resources_result.data or []))

        return {
            "total_embeddings": total_result.count or 0,
            "embedded_resources": len(unique_resources),
            "configured": bool(settings.openai_api_key),
        }

    except Exception as e:
        return {
            "error": str(e),
            "configured": bool(settings.openai_api_key),
        }


@router.delete("")
async def delete_embeddings(resource_id: str = Query(...)):
    """Delete embeddings for a resource."""
    supabase = get_supabase()

    try:
        supabase.table("lr_embeddings").delete().eq(
            "resource_id", resource_id
        ).execute()

        return {
            "success": True,
            "message": f"Deleted embeddings for resource {resource_id}",
        }

    except Exception as e:
        return {
            "success": False,
            "error": str(e),
        }
