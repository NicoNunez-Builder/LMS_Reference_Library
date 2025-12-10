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
async def search_congress(request: BaseSearchRequest):
    """Search Congress.gov for bills and legislation."""
    settings = get_settings()

    # Build search query
    search_query = (
        f"{request.query} {request.category}" if request.category else request.query
    )

    # Build URL parameters
    params = {
        "q": search_query,
        "limit": min(request.limit, 50),
        "format": "json",
    }

    if settings.congress_api_key:
        params["api_key"] = settings.congress_api_key

    async with httpx.AsyncClient() as client:
        response = await client.get(
            "https://api.congress.gov/v3/bill",
            params=params,
            headers={"User-Agent": "LegalReferenceLibrary/1.0"},
        )

        if response.status_code in (401, 403):
            # Return helpful error for missing API key
            return SearchResponse(
                results=[],
                count=0,
                query=search_query,
                error="Congress.gov API key required. Get one free at api.congress.gov",
            )

        if response.status_code != 200:
            raise HTTPException(
                status_code=response.status_code,
                detail=f"Congress.gov API error: {response.text}",
            )

        data = response.json()

    # Transform results
    results = []
    for item in data.get("bills", []):
        # Build snippet with bill details
        snippet = item.get("title", "")
        latest_action = item.get("latestAction")
        if latest_action:
            action_date = latest_action.get("actionDate", "")
            action_text = latest_action.get("text", "")
            snippet += f" Latest action ({action_date}): {action_text}"
        sponsors = item.get("sponsors", [])
        if sponsors:
            sponsor = sponsors[0]
            name = sponsor.get("name", "")
            party = sponsor.get("party", "")
            state = sponsor.get("state", "")
            snippet += f" Sponsor: {name} ({party}-{state})"

        # Truncate snippet
        if len(snippet) > 300:
            snippet = snippet[:297] + "..."

        # Build URL
        bill_type = (item.get("type") or "bill").lower()
        bill_number = item.get("number", "")
        congress_num = item.get("congress", "118")

        results.append(
            SearchResult(
                title=f"{item.get('type', 'Bill')} {bill_number}: {item.get('title', 'Untitled')}",
                url=f"https://www.congress.gov/bill/{congress_num}th-congress/{bill_type}/{bill_number}",
                snippet=snippet,
                source_type=SourceType.DOCUMENT,
            )
        )

    return SearchResponse(
        results=results,
        count=len(results),
        total=data.get("pagination", {}).get("count"),
        query=search_query,
    )
