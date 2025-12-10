from fastapi import APIRouter, Depends, HTTPException, Query
from supabase import Client
from typing import Optional

from app.dependencies import get_supabase
from app.models.resource import (
    ResourceCreate,
    ResourceUpdate,
    ResourceResponse,
    ResourceListResponse,
    SourceType,
)

router = APIRouter()


@router.get("", response_model=ResourceListResponse)
async def list_resources(
    category: Optional[str] = Query(None, description="Filter by category slug"),
    source_type: Optional[SourceType] = Query(None, description="Filter by source type"),
    query: Optional[str] = Query(None, description="Search query"),
    limit: int = Query(50, ge=1, le=100, description="Number of results"),
    offset: int = Query(0, ge=0, description="Offset for pagination"),
    supabase: Client = Depends(get_supabase),
):
    """
    List resources with optional filters and pagination.
    """
    try:
        # Build query
        query_builder = supabase.table("lr_resources").select(
            "*, category:lr_categories(*)",
            count="exact"
        )

        # Apply filters
        query_builder = query_builder.eq("is_public", True)

        if source_type:
            query_builder = query_builder.eq("source_type", source_type.value)

        if query:
            query_builder = query_builder.or_(
                f"title.ilike.%{query}%,description.ilike.%{query}%"
            )

        # Order and paginate
        query_builder = query_builder.order("created_at", desc=True)
        query_builder = query_builder.range(offset, offset + limit - 1)

        result = query_builder.execute()

        # Filter by category slug if provided (done after fetch due to nested filter)
        resources = result.data
        if category:
            resources = [
                r for r in resources
                if r.get("category") and r["category"].get("slug") == category
            ]

        return ResourceListResponse(
            resources=resources,
            count=result.count or len(resources),
            limit=limit,
            offset=offset,
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("", response_model=ResourceResponse, status_code=201)
async def create_resource(
    resource: ResourceCreate,
    supabase: Client = Depends(get_supabase),
):
    """
    Create a new resource.
    """
    try:
        # Prepare data
        data = resource.model_dump(exclude_none=True)

        # Convert enum to string
        if "source_type" in data:
            data["source_type"] = data["source_type"].value
        if "content_source" in data and data["content_source"]:
            data["content_source"] = data["content_source"].value

        # Insert
        result = supabase.table("lr_resources").insert(data).execute()

        if not result.data:
            raise HTTPException(status_code=400, detail="Failed to create resource")

        # Fetch with category
        resource_id = result.data[0]["id"]
        fetch_result = supabase.table("lr_resources").select(
            "*, category:lr_categories(*)"
        ).eq("id", resource_id).single().execute()

        return fetch_result.data

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{resource_id}", response_model=ResourceResponse)
async def get_resource(
    resource_id: str,
    supabase: Client = Depends(get_supabase),
):
    """
    Get a single resource by ID.
    """
    try:
        result = supabase.table("lr_resources").select(
            "*, category:lr_categories(*)"
        ).eq("id", resource_id).execute()

        if not result.data:
            raise HTTPException(status_code=404, detail="Resource not found")

        return result.data[0]

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{resource_id}", response_model=ResourceResponse)
async def update_resource(
    resource_id: str,
    resource: ResourceUpdate,
    supabase: Client = Depends(get_supabase),
):
    """
    Update an existing resource.
    """
    try:
        # Check if resource exists
        existing = supabase.table("lr_resources").select("id").eq(
            "id", resource_id
        ).execute()

        if not existing.data:
            raise HTTPException(status_code=404, detail="Resource not found")

        # Prepare update data
        data = resource.model_dump(exclude_none=True, exclude_unset=True)

        if not data:
            raise HTTPException(status_code=400, detail="No fields to update")

        # Convert enums to strings
        if "source_type" in data:
            data["source_type"] = data["source_type"].value
        if "content_source" in data and data["content_source"]:
            data["content_source"] = data["content_source"].value

        # Update
        result = supabase.table("lr_resources").update(data).eq(
            "id", resource_id
        ).execute()

        if not result.data:
            raise HTTPException(status_code=400, detail="Failed to update resource")

        # Fetch with category
        fetch_result = supabase.table("lr_resources").select(
            "*, category:lr_categories(*)"
        ).eq("id", resource_id).single().execute()

        return fetch_result.data

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{resource_id}", status_code=204)
async def delete_resource(
    resource_id: str,
    supabase: Client = Depends(get_supabase),
):
    """
    Delete a resource.
    """
    try:
        # Check if resource exists
        existing = supabase.table("lr_resources").select("id").eq(
            "id", resource_id
        ).execute()

        if not existing.data:
            raise HTTPException(status_code=404, detail="Resource not found")

        # Delete
        supabase.table("lr_resources").delete().eq("id", resource_id).execute()

        return None

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
