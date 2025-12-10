from fastapi import APIRouter, HTTPException
import httpx

from app.config import get_settings
from app.models.search import (
    BaseSearchRequest,
    SearchResponse,
    SearchResult,
    SourceType,
)

router = APIRouter()


@router.post("", response_model=SearchResponse)
async def search_books(request: BaseSearchRequest):
    """Search Google Books API."""
    settings = get_settings()

    # Build search query - add "law" or category to refine results
    search_query = (
        f"{request.query} {request.category}"
        if request.category
        else f"{request.query} law"
    )

    # Call Google Books API
    params = {
        "q": search_query,
        "maxResults": min(request.limit, 40),  # Google Books API max is 40
        "printType": "books",
    }

    # Add API key if available for higher quota
    if settings.google_api_key:
        params["key"] = settings.google_api_key

    async with httpx.AsyncClient() as client:
        response = await client.get(
            "https://www.googleapis.com/books/v1/volumes", params=params
        )

        if response.status_code != 200:
            raise HTTPException(
                status_code=response.status_code,
                detail=f"Google Books API error: {response.text}",
            )

        data = response.json()

    # Transform results
    results = []
    for item in data.get("items", []):
        volume_info = item.get("volumeInfo", {})
        access_info = item.get("accessInfo", {})

        # Build description with author and publisher info
        snippet = volume_info.get("description", "")
        authors = volume_info.get("authors", [])
        if authors:
            snippet = f"By {', '.join(authors)}. {snippet}"
        publisher = volume_info.get("publisher")
        published_date = volume_info.get("publishedDate")
        if publisher and published_date:
            snippet += f" ({publisher}, {published_date})"

        # Truncate snippet
        if len(snippet) > 300:
            snippet = snippet[:297] + "..."

        # Determine source type
        epub_available = access_info.get("epub", {}).get("isAvailable", False)
        pdf_available = access_info.get("pdf", {}).get("isAvailable", False)
        source_type = (
            SourceType.EBOOK
            if epub_available or pdf_available
            else SourceType.DOCUMENT
        )

        # Get thumbnail
        image_links = volume_info.get("imageLinks", {})
        thumbnail = image_links.get("thumbnail") or image_links.get("smallThumbnail")

        results.append(
            SearchResult(
                title=volume_info.get("title", ""),
                url=volume_info.get("infoLink")
                or volume_info.get("previewLink")
                or "",
                snippet=snippet,
                source_type=source_type,
                thumbnail=thumbnail,
            )
        )

    return SearchResponse(
        results=results,
        count=len(results),
        query=search_query,
    )
