from fastapi import APIRouter, HTTPException
import httpx

from app.config import get_settings
from app.models.search import (
    GoogleSearchRequest,
    SearchResponse,
    SearchResult,
    SourceType,
    FileTypeFilter,
)

router = APIRouter()


def detect_source_type(url: str) -> SourceType:
    """Detect source type from URL."""
    lower_url = url.lower()
    if lower_url.endswith(".pdf"):
        return SourceType.PDF
    if lower_url.endswith(".doc") or lower_url.endswith(".docx"):
        return SourceType.DOCUMENT
    if lower_url.endswith(".epub") or lower_url.endswith(".mobi"):
        return SourceType.EBOOK
    return SourceType.WEBSITE


@router.post("", response_model=SearchResponse)
async def search_google(request: GoogleSearchRequest):
    """Search using Google Custom Search API."""
    settings = get_settings()

    if not settings.google_api_key or not settings.google_search_engine_id:
        raise HTTPException(
            status_code=500, detail="Google API credentials not configured"
        )

    # Build search query with category and file type filters
    search_query = (
        f"{request.query} {request.category}" if request.category else request.query
    )

    # Add file type filter to query
    if request.file_type and request.file_type != FileTypeFilter.ALL:
        if request.file_type == FileTypeFilter.PDF:
            search_query += " filetype:pdf"
        elif request.file_type == FileTypeFilter.DOC:
            search_query += " (filetype:doc OR filetype:docx)"
        elif request.file_type == FileTypeFilter.EBOOK:
            search_query += " (filetype:epub OR filetype:mobi OR filetype:pdf ebook)"

    # Call Google Custom Search API
    params = {
        "key": settings.google_api_key,
        "cx": settings.google_search_engine_id,
        "q": search_query,
        "num": min(request.limit, 10),  # Google API max is 10 per request
    }

    async with httpx.AsyncClient() as client:
        response = await client.get(
            "https://www.googleapis.com/customsearch/v1", params=params
        )

        if response.status_code != 200:
            raise HTTPException(
                status_code=response.status_code,
                detail=f"Google Search API error: {response.text}",
            )

        data = response.json()

    # Transform results
    results = []
    for item in data.get("items", []):
        thumbnail = None
        if "pagemap" in item and "cse_thumbnail" in item["pagemap"]:
            thumbnails = item["pagemap"]["cse_thumbnail"]
            if thumbnails:
                thumbnail = thumbnails[0].get("src")

        results.append(
            SearchResult(
                title=item.get("title", ""),
                url=item.get("link", ""),
                snippet=item.get("snippet"),
                source_type=detect_source_type(item.get("link", "")),
                thumbnail=thumbnail,
            )
        )

    return SearchResponse(
        results=results,
        count=len(results),
        query=search_query,
    )
