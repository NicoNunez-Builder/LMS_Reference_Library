"""Pydantic models for document processing endpoints."""
from pydantic import BaseModel, Field, HttpUrl
from typing import Optional, List
from enum import Enum


class DocumentType(str, Enum):
    """Supported document types for parsing."""
    PDF = "pdf"
    DOCX = "docx"
    DOC = "doc"
    TXT = "txt"
    MD = "md"
    HTML = "html"
    RTF = "rtf"


class StorageFolder(str, Enum):
    """Storage folder options for downloads."""
    DOCUMENTS = "documents"
    VIDEOS = "videos"
    THUMBNAILS = "thumbnails"
    GENERAL = "general"


# Download Models
class DownloadRequest(BaseModel):
    """Request to download a file from URL to Supabase storage."""
    url: str = Field(..., description="URL of the file to download")
    filename: Optional[str] = Field(None, description="Custom filename (auto-generated if not provided)")
    folder: StorageFolder = Field(StorageFolder.DOCUMENTS, description="Storage folder")
    bucket: str = Field("reference-files", description="Supabase storage bucket")


class DownloadResponse(BaseModel):
    """Response from download operation."""
    success: bool
    public_url: Optional[str] = None
    storage_path: Optional[str] = None
    filename: Optional[str] = None
    content_type: Optional[str] = None
    size: Optional[int] = None
    error: Optional[str] = None


# Parse Document Models
class ParseDocumentRequest(BaseModel):
    """Request to parse a document from URL."""
    url: str = Field(..., description="URL of the document to parse")
    document_type: Optional[DocumentType] = Field(
        None,
        description="Document type (auto-detected from URL if not provided)"
    )


class ParseDocumentResponse(BaseModel):
    """Response from document parsing."""
    success: bool
    text: Optional[str] = None
    word_count: Optional[int] = None
    page_count: Optional[int] = None
    document_type: Optional[str] = None
    metadata: Optional[dict] = None
    error: Optional[str] = None


# Scrape Models (Firecrawl)
class ScrapeRequest(BaseModel):
    """Request to scrape a single URL using Firecrawl."""
    url: str = Field(..., description="URL to scrape")
    formats: List[str] = Field(
        default=["markdown", "html"],
        description="Output formats to return"
    )
    only_main_content: bool = Field(
        True,
        description="Extract only main content (exclude headers/footers)"
    )
    include_tags: Optional[List[str]] = Field(
        None,
        description="Only include content from these HTML tags"
    )
    exclude_tags: Optional[List[str]] = Field(
        None,
        description="Exclude content from these HTML tags"
    )
    wait_for: Optional[int] = Field(
        None,
        description="Wait time in ms for dynamic content"
    )


class ScrapeResponse(BaseModel):
    """Response from scraping operation."""
    success: bool
    markdown: Optional[str] = None
    html: Optional[str] = None
    raw_html: Optional[str] = None
    links: Optional[List[str]] = None
    metadata: Optional[dict] = None
    error: Optional[str] = None


# Crawl Models (Firecrawl)
class CrawlRequest(BaseModel):
    """Request to crawl a website using Firecrawl."""
    url: str = Field(..., description="Starting URL to crawl")
    max_depth: int = Field(2, ge=1, le=10, description="Maximum crawl depth")
    limit: int = Field(10, ge=1, le=100, description="Maximum pages to crawl")
    formats: List[str] = Field(
        default=["markdown"],
        description="Output formats for crawled pages"
    )
    include_paths: Optional[List[str]] = Field(
        None,
        description="Only crawl URLs matching these patterns"
    )
    exclude_paths: Optional[List[str]] = Field(
        None,
        description="Skip URLs matching these patterns"
    )
    allow_external_links: bool = Field(
        False,
        description="Follow links to external domains"
    )


class CrawlStatusResponse(BaseModel):
    """Status response for crawl job."""
    success: bool
    job_id: Optional[str] = None
    status: Optional[str] = None  # queued, processing, completed, failed
    total: Optional[int] = None
    completed: Optional[int] = None
    error: Optional[str] = None


class CrawledPage(BaseModel):
    """Single page from crawl results."""
    url: str
    title: Optional[str] = None
    markdown: Optional[str] = None
    html: Optional[str] = None
    metadata: Optional[dict] = None


class CrawlResponse(BaseModel):
    """Response from completed crawl operation."""
    success: bool
    job_id: Optional[str] = None
    status: str
    pages: List[CrawledPage] = []
    total: int = 0
    error: Optional[str] = None


# File Download Models (direct file access)
class FileDownloadRequest(BaseModel):
    """Request to get a file from Supabase storage."""
    storage_path: str = Field(..., description="Path in Supabase storage")
    bucket: str = Field("reference-files", description="Storage bucket name")


class FileDownloadResponse(BaseModel):
    """Response with file download info."""
    success: bool
    download_url: Optional[str] = None
    public_url: Optional[str] = None
    content_type: Optional[str] = None
    size: Optional[int] = None
    error: Optional[str] = None
