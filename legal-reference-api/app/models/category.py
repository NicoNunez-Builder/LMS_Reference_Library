from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class CategoryGroup(BaseModel):
    """Top-level category container."""
    id: str
    name: str
    slug: str
    description: Optional[str] = None
    display_order: int = 0
    created_at: datetime

    class Config:
        from_attributes = True


class CategoryFolder(BaseModel):
    """Mid-level container within a group."""
    id: str
    group_id: str
    name: str
    slug: str
    description: Optional[str] = None
    display_order: int = 0
    created_at: datetime

    class Config:
        from_attributes = True


class Category(BaseModel):
    """Category for organizing resources."""
    id: str
    name: str
    slug: str
    description: Optional[str] = None
    group_id: Optional[str] = None
    folder_id: Optional[str] = None
    display_order: int = 0
    created_at: datetime

    class Config:
        from_attributes = True


class CategoryWithNested(Category):
    """Category with optional nested group/folder."""
    group: Optional[CategoryGroup] = None
    folder: Optional[CategoryFolder] = None


class FolderWithCategories(CategoryFolder):
    """Folder containing its categories."""
    categories: list[Category] = []


class GroupWithFolders(CategoryGroup):
    """Group containing folders and direct categories."""
    folders: list[FolderWithCategories] = []
    categories: list[Category] = []  # Direct categories (no folder)


class CategoryHierarchyResponse(BaseModel):
    """Full category hierarchy response."""
    groups: list[GroupWithFolders]


class CategoryListResponse(BaseModel):
    """Simple list of categories."""
    categories: list[CategoryWithNested]
