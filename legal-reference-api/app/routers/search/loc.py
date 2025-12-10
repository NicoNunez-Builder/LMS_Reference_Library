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
async def search_loc(request: BaseSearchRequest):
    """Search Library of Congress API."""
    # Build search query
    search_query = (
        f"{request.query} {request.category}" if request.category else request.query
    )

    # Build URL parameters
    params = {
        "fo": "json",
        "q": search_query,
        "c": min(request.limit, 50),
        "fa": "online-format:pdf|online-format:online text",
    }

    async with httpx.AsyncClient() as client:
        response = await client.get(
            "https://www.loc.gov/search/",
            params=params,
            headers={
                "User-Agent": "LegalReferenceLibrary/1.0",
                "Accept": "application/json",
            },
        )

        if response.status_code != 200:
            raise HTTPException(
                status_code=response.status_code,
                detail="Library of Congress API error",
            )

        data = response.json()

    # Transform results
    results = []
    for item in data.get("results", []):
        # Build description
        snippet = ""
        descriptions = item.get("description", [])
        if descriptions:
            snippet = descriptions[0]
        contributors = item.get("contributor", [])
        if contributors:
            snippet += f" By: {', '.join(contributors)}." if snippet else f"By: {', '.join(contributors)}."
        date = item.get("date")
        if date:
            snippet += f" Date: {date}."
        subjects = item.get("subject", [])
        if subjects:
            snippet += f" Subjects: {', '.join(subjects[:3])}."

        # Truncate snippet
        if len(snippet) > 300:
            snippet = snippet[:297] + "..."

        # Determine source type based on format
        source_type = SourceType.DOCUMENT
        online_formats = item.get("online_format", [])
        if online_formats:
            formats_str = " ".join(online_formats).lower()
            if "pdf" in formats_str:
                source_type = SourceType.PDF
            elif "video" in formats_str or "film" in formats_str:
                source_type = SourceType.VIDEO
            elif "audio" in formats_str:
                source_type = SourceType.ARTICLE

        # Get thumbnail
        image_urls = item.get("image_url", [])
        thumbnail = image_urls[0] if image_urls else None

        # Build URL
        item_id = item.get("id", "")
        url = item.get("url") or f"https://www.loc.gov/item/{item_id}"

        results.append(
            SearchResult(
                title=item.get("title", "Untitled"),
                url=url,
                snippet=snippet or "No description available",
                source_type=source_type,
                thumbnail=thumbnail,
            )
        )

    pagination = data.get("pagination", {})
    return SearchResponse(
        results=results,
        count=len(results),
        total=pagination.get("total"),
        query=search_query,
    )
