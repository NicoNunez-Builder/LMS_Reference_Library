from fastapi import APIRouter, HTTPException
import httpx

from app.config import get_settings
from app.models.search import (
    CourtListenerSearchRequest,
    SearchResponse,
    SearchResult,
    SearchResultMetadata,
    SourceType,
    CourtListenerSearchType,
)

router = APIRouter()


@router.post("", response_model=SearchResponse)
async def search_courtlistener(request: CourtListenerSearchRequest):
    """Search CourtListener legal database."""
    settings = get_settings()

    # Build search query
    search_query = (
        f"{request.query} {request.category}" if request.category else request.query
    )

    # Build URL parameters
    params = {
        "q": search_query,
        "type": request.search_type.value,
        "order_by": "score desc",
        "page_size": min(request.limit, 50),
    }

    # Add court filter if specified
    if request.court and request.court != "all":
        params["court"] = request.court

    # Add date filters if specified
    if request.date_from:
        params["filed_after"] = request.date_from
    if request.date_to:
        params["filed_before"] = request.date_to

    # Build headers
    headers = {"User-Agent": "LegalReferenceLibrary/1.0"}
    if settings.courtlistener_api_token:
        headers["Authorization"] = f"Token {settings.courtlistener_api_token}"

    async with httpx.AsyncClient() as client:
        response = await client.get(
            "https://www.courtlistener.com/api/rest/v4/search/",
            params=params,
            headers=headers,
        )

        if response.status_code != 200:
            raise HTTPException(
                status_code=response.status_code,
                detail=f"CourtListener API error: {response.text}",
            )

        data = response.json()

    # Transform results
    results = []
    for item in data.get("results", []):
        # Get snippet from opinions array
        opinion_snippet = ""
        opinions = item.get("opinions", [])
        if opinions and len(opinions) > 0:
            opinion_snippet = opinions[0].get("snippet", "")

        # Build snippet with case details
        snippet = opinion_snippet
        court = item.get("court")
        if court:
            snippet = f"{court}. {snippet}"

        # Truncate snippet
        if len(snippet) > 300:
            snippet = snippet[:297] + "..."

        results.append(
            SearchResult(
                title=item.get("caseName")
                or item.get("caseNameShort")
                or "Unknown Case",
                url=f"https://www.courtlistener.com{item.get('absolute_url', '')}",
                snippet=snippet,
                source_type=SourceType.DOCUMENT,
                metadata=SearchResultMetadata(
                    docket_number=item.get("docketNumber"),
                    date_filed=item.get("dateFiled"),
                    court=item.get("court"),
                ),
            )
        )

    return SearchResponse(
        results=results,
        count=len(results),
        total=data.get("count"),
        query=search_query,
    )
