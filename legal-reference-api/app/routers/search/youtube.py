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
async def search_youtube(request: BaseSearchRequest):
    """Search YouTube videos."""
    settings = get_settings()

    if not settings.youtube_api_key:
        raise HTTPException(status_code=500, detail="YouTube API key not configured")

    # Build search query
    search_query = (
        f"{request.query} {request.category}" if request.category else request.query
    )

    # Call YouTube Data API
    params = {
        "key": settings.youtube_api_key,
        "q": search_query,
        "part": "snippet",
        "type": "video",
        "maxResults": min(request.limit, 50),  # YouTube API max is 50
        "order": "relevance",
    }

    async with httpx.AsyncClient() as client:
        response = await client.get(
            "https://www.googleapis.com/youtube/v3/search", params=params
        )

        if response.status_code != 200:
            raise HTTPException(
                status_code=response.status_code,
                detail=f"YouTube API error: {response.text}",
            )

        data = response.json()

    # Transform results
    results = []
    for item in data.get("items", []):
        snippet = item.get("snippet", {})
        video_id = item.get("id", {}).get("videoId", "")

        # Get best available thumbnail
        thumbnails = snippet.get("thumbnails", {})
        thumbnail = (
            thumbnails.get("high", {}).get("url")
            or thumbnails.get("medium", {}).get("url")
            or thumbnails.get("default", {}).get("url")
        )

        results.append(
            SearchResult(
                title=snippet.get("title", ""),
                url=f"https://www.youtube.com/watch?v={video_id}",
                snippet=snippet.get("description"),
                source_type=SourceType.VIDEO,
                thumbnail=thumbnail,
            )
        )

    return SearchResponse(
        results=results,
        count=len(results),
        query=search_query,
    )
