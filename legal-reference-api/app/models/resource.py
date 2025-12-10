from pydantic import BaseModel, Field
from typing import Optional, Any
from datetime import datetime
from enum import Enum


class SourceType(str, Enum):
    """Types of resources that can be stored."""
    website = "website"
    pdf = "pdf"
    video = "video"
    document = "document"
    article = "article"
    ebook = "ebook"


class ContentSource(str, Enum):
    """How the content was obtained."""
    scraped = "scraped"
    parsed = "parsed"
    manual = "manual"


# Request Models
class ResourceCreate(BaseModel):
    """Schema for creating a new resource."""
    title: str = Field(..., min_length=1, max_length=500)
    url: str = Field(..., min_length=1)
    description: Optional[str] = None
    category_id: str
    source_type: SourceType
    file_url: Optional[str] = None
    file_size: Optional[int] = None
    thumbnail_url: Optional[str] = None
    content: Optional[str] = None
    content_source: Optional[ContentSource] = None
    metadata: Optional[dict[str, Any]] = None
    is_public: bool = True


class ResourceUpdate(BaseModel):
    """Schema for updating an existing resource."""
    title: Optional[str] = Field(None, min_length=1, max_length=500)
    url: Optional[str] = None
    description: Optional[str] = None
    category_id: Optional[str] = None
    source_type: Optional[SourceType] = None
    file_url: Optional[str] = None
    file_size: Optional[int] = None
    thumbnail_url: Optional[str] = None
    content: Optional[str] = None
    content_source: Optional[ContentSource] = None
    metadata: Optional[dict[str, Any]] = None
    is_public: Optional[bool] = None


# Response Models
class CategoryBasic(BaseModel):
    """Basic category info for embedding in resource responses."""
    id: str
    name: str
    slug: str
    description: Optional[str] = None
    group_id: Optional[str] = None
    folder_id: Optional[str] = None


class ResourceResponse(BaseModel):
    """Schema for resource in API responses."""
    id: str
    title: str
    url: str
    description: Optional[str] = None
    category_id: str
    source_type: SourceType
    file_url: Optional[str] = None
    file_size: Optional[int] = None
    thumbnail_url: Optional[str] = None
    content: Optional[str] = None
    content_source: Optional[ContentSource] = None
    user_id: Optional[str] = None
    is_public: bool
    metadata: Optional[dict[str, Any]] = None
    created_at: datetime
    updated_at: datetime
    category: Optional[CategoryBasic] = None

    class Config:
        from_attributes = True


class ResourceListResponse(BaseModel):
    """Schema for paginated list of resources."""
    resources: list[ResourceResponse]
    count: int
    limit: int
    offset: int
