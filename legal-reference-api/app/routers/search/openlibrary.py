from fastapi import APIRouter, HTTPException
import httpx

from app.models.search import (
    BaseSearchRequest,
    SearchResponse,
    SearchResult,
    SourceType,
)

router = APIRouter()


@router.post("", response_model=SearchResponse)
async def search_openlibrary(request: BaseSearchRequest):
    """Search Open Library API."""
    # Build search query - add law subject for relevance
    search_query = (
        f"{request.query} {request.category}"
        if request.category
        else f"{request.query} law"
    )

    # Call Open Library Search API (no API key required)
    params = {
        "q": search_query,
        "limit": min(request.limit, 50),
        "fields": "key,title,author_name,first_publish_year,publisher,subject,cover_i,isbn,ebook_access",
    }

    async with httpx.AsyncClient() as client:
        response = await client.get(
            "https://openlibrary.org/search.json",
            params=params,
            headers={"User-Agent": "LegalReferenceLibrary/1.0"},
        )

        if response.status_code != 200:
            raise HTTPException(
                status_code=response.status_code,
                detail="Open Library API error",
            )

        data = response.json()

    # Transform results
    results = []
    for doc in data.get("docs", []):
        # Build description
        snippet = ""
        authors = doc.get("author_name", [])
        if authors:
            snippet = f"By {', '.join(authors)}."
        first_publish_year = doc.get("first_publish_year")
        if first_publish_year:
            snippet += f" First published: {first_publish_year}."
        publishers = doc.get("publisher", [])
        if publishers:
            snippet += f" Publisher: {publishers[0]}."
        subjects = doc.get("subject", [])
        if subjects:
            snippet += f" Subjects: {', '.join(subjects[:3])}."

        # Build URL to Open Library
        book_key = doc.get("key", "")
        book_url = f"https://openlibrary.org{book_key}"

        # Build thumbnail URL
        cover_id = doc.get("cover_i")
        thumbnail = (
            f"https://covers.openlibrary.org/b/id/{cover_id}-M.jpg"
            if cover_id
            else None
        )

        # Determine source type
        ebook_access = doc.get("ebook_access", "")
        source_type = (
            SourceType.EBOOK
            if ebook_access in ("borrowable", "public")
            else SourceType.DOCUMENT
        )

        results.append(
            SearchResult(
                title=doc.get("title", ""),
                url=book_url,
                snippet=snippet or "No description available",
                source_type=source_type,
                thumbnail=thumbnail,
            )
        )

    return SearchResponse(
        results=results,
        count=len(results),
        query=search_query,
    )
