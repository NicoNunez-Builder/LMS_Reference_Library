from fastapi import APIRouter, Depends, HTTPException, Query
from supabase import Client
from typing import Optional

from app.dependencies import get_supabase
from app.models.category import (
    Category,
    CategoryWithNested,
    CategoryListResponse,
    CategoryHierarchyResponse,
    GroupWithFolders,
    FolderWithCategories,
)

router = APIRouter()


@router.get("", response_model=CategoryListResponse)
async def list_categories(
    group: Optional[str] = Query(None, description="Filter by group slug"),
    folder: Optional[str] = Query(None, description="Filter by folder slug"),
    supabase: Client = Depends(get_supabase),
):
    """
    List categories with optional filters.
    """
    try:
        # Build query with relations
        query_builder = supabase.table("lr_categories").select(
            "*, group:lr_groups(*), folder:lr_folders(*)"
        )

        # Order by display_order
        query_builder = query_builder.order("display_order", desc=False)

        result = query_builder.execute()

        categories = result.data

        # Filter by group/folder slug if provided
        if group:
            categories = [
                c for c in categories
                if c.get("group") and c["group"].get("slug") == group
            ]

        if folder:
            categories = [
                c for c in categories
                if c.get("folder") and c["folder"].get("slug") == folder
            ]

        return CategoryListResponse(categories=categories)

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/hierarchy", response_model=CategoryHierarchyResponse)
async def get_category_hierarchy(
    supabase: Client = Depends(get_supabase),
):
    """
    Get full category hierarchy (groups -> folders -> categories).
    """
    try:
        # Fetch all groups
        groups_result = supabase.table("lr_groups").select("*").order(
            "display_order", desc=False
        ).execute()

        # Fetch all folders
        folders_result = supabase.table("lr_folders").select("*").order(
            "display_order", desc=False
        ).execute()

        # Fetch all categories
        categories_result = supabase.table("lr_categories").select("*").order(
            "display_order", desc=False
        ).execute()

        groups_data = groups_result.data or []
        folders_data = folders_result.data or []
        categories_data = categories_result.data or []

        # Build hierarchy
        hierarchy = []

        for group in groups_data:
            group_id = group["id"]

            # Get folders for this group
            group_folders = [
                FolderWithCategories(
                    **folder,
                    categories=[
                        Category(**cat)
                        for cat in categories_data
                        if cat.get("folder_id") == folder["id"]
                    ]
                )
                for folder in folders_data
                if folder.get("group_id") == group_id
            ]

            # Get direct categories (no folder)
            direct_categories = [
                Category(**cat)
                for cat in categories_data
                if cat.get("group_id") == group_id and not cat.get("folder_id")
            ]

            hierarchy.append(
                GroupWithFolders(
                    **group,
                    folders=group_folders,
                    categories=direct_categories,
                )
            )

        return CategoryHierarchyResponse(groups=hierarchy)

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{category_id}", response_model=CategoryWithNested)
async def get_category(
    category_id: str,
    supabase: Client = Depends(get_supabase),
):
    """
    Get a single category by ID.
    """
    try:
        result = supabase.table("lr_categories").select(
            "*, group:lr_groups(*), folder:lr_folders(*)"
        ).eq("id", category_id).execute()

        if not result.data:
            raise HTTPException(status_code=404, detail="Category not found")

        return result.data[0]

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
