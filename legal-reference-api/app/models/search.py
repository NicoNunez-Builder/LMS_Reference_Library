from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from enum import Enum


class SourceType(str, Enum):
    WEBSITE = "website"
    PDF = "pdf"
    VIDEO = "video"
    DOCUMENT = "document"
    ARTICLE = "article"
    EBOOK = "ebook"


class FileTypeFilter(str, Enum):
    ALL = "all"
    PDF = "pdf"
    DOC = "doc"
    EBOOK = "ebook"


class CourtListenerSearchType(str, Enum):
    OPINIONS = "o"
    RECAP = "r"
    ORAL_ARGUMENTS = "oa"


# Search request models
class BaseSearchRequest(BaseModel):
    query: str = Field(..., min_length=1, description="Search query")
    category: Optional[str] = Field(None, description="Category filter")
    limit: int = Field(10, ge=1, le=50, description="Number of results")


class GoogleSearchRequest(BaseSearchRequest):
    file_type: Optional[FileTypeFilter] = Field(None, description="File type filter")


class CourtListenerSearchRequest(BaseSearchRequest):
    court: Optional[str] = Field(None, description="Court filter (e.g., 'scotus', 'ca9')")
    search_type: CourtListenerSearchType = Field(
        CourtListenerSearchType.OPINIONS, description="Search type"
    )
    date_from: Optional[str] = Field(None, description="Filed after date (YYYY-MM-DD)")
    date_to: Optional[str] = Field(None, description="Filed before date (YYYY-MM-DD)")


class UniCourtSearchRequest(BaseModel):
    query: Optional[str] = Field(None, description="Search query")
    state: Optional[str] = Field(None, description="State filter")
    case_type: Optional[str] = Field(None, description="Case type filter")
    party_name: Optional[str] = Field(None, description="Party name filter")
    attorney_name: Optional[str] = Field(None, description="Attorney name filter")
    judge_name: Optional[str] = Field(None, description="Judge name filter")
    case_number: Optional[str] = Field(None, description="Case number filter")
    date_from: Optional[str] = Field(None, description="Filed after date")
    date_to: Optional[str] = Field(None, description="Filed before date")
    limit: int = Field(25, ge=1, le=100, description="Number of results")
    page: int = Field(1, ge=1, description="Page number")


class CombinedSearchRequest(BaseModel):
    query: str = Field(..., min_length=1, description="Search query")
    category: Optional[str] = None
    file_type: Optional[FileTypeFilter] = None
    limit: int = Field(10, ge=1, le=50)
    # Source toggles
    include_google: bool = True
    include_youtube: bool = True
    include_books: bool = False
    include_openlibrary: bool = False
    include_courtlistener: bool = False
    include_congress: bool = False
    include_federalregister: bool = False
    include_loc: bool = False
    include_unicourt: bool = False
    # CourtListener specific
    court: Optional[str] = None
    search_type: Optional[CourtListenerSearchType] = None
    date_from: Optional[str] = None
    date_to: Optional[str] = None
    # UniCourt specific
    state: Optional[str] = None
    case_type: Optional[str] = None


# Search result models
class SearchResultMetadata(BaseModel):
    docket_number: Optional[str] = None
    date_filed: Optional[str] = None
    court: Optional[str] = None
    case_id: Optional[str] = None
    case_number: Optional[str] = None
    state: Optional[str] = None
    case_type: Optional[str] = None
    case_status: Optional[str] = None


class SearchResult(BaseModel):
    title: str
    url: str
    snippet: Optional[str] = None
    source_type: SourceType = SourceType.WEBSITE
    thumbnail: Optional[str] = None
    metadata: Optional[SearchResultMetadata] = None


class SearchResponse(BaseModel):
    results: List[SearchResult] = []
    count: int = 0
    total: Optional[int] = None
    query: str
    error: Optional[str] = None


class SourceSearchResult(BaseModel):
    results: List[SearchResult] = []
    count: int = 0


class CombinedSearchResponse(BaseModel):
    google: Optional[SourceSearchResult] = None
    youtube: Optional[SourceSearchResult] = None
    books: Optional[SourceSearchResult] = None
    openlibrary: Optional[SourceSearchResult] = None
    courtlistener: Optional[SourceSearchResult] = None
    congress: Optional[SourceSearchResult] = None
    federalregister: Optional[SourceSearchResult] = None
    loc: Optional[SourceSearchResult] = None
    unicourt: Optional[SourceSearchResult] = None
    total: int = 0
    query: str
