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
async def search_federalregister(request: BaseSearchRequest):
    """Search Federal Register API."""
    # Build search query
    search_query = (
        f"{request.query} {request.category}" if request.category else request.query
    )

    # Build URL parameters
    params = {
        "conditions[term]": search_query,
        "per_page": min(request.limit, 50),
        "order": "relevance",
    }

    async with httpx.AsyncClient() as client:
        response = await client.get(
            "https://www.federalregister.gov/api/v1/documents.json",
            params=params,
            headers={"User-Agent": "LegalReferenceLibrary/1.0"},
        )

        if response.status_code != 200:
            raise HTTPException(
                status_code=response.status_code,
                detail=f"Federal Register API error: {response.text}",
            )

        data = response.json()

    # Transform results
    results = []
    for item in data.get("results", []):
        # Build snippet with document details
        snippet = item.get("abstract") or item.get("title") or ""
        agencies = item.get("agencies", [])
        if agencies:
            agency_names = ", ".join(a.get("name", "") for a in agencies if a.get("name"))
            snippet = f"Agency: {agency_names}. {snippet}"
        pub_date = item.get("publication_date")
        if pub_date:
            snippet = f"Published: {pub_date}. {snippet}"
        doc_type = item.get("type")
        if doc_type:
            snippet = f"[{doc_type}] {snippet}"

        # Truncate snippet
        if len(snippet) > 300:
            snippet = snippet[:297] + "..."

        # Determine source type
        source_type = SourceType.PDF if item.get("pdf_url") else SourceType.DOCUMENT

        results.append(
            SearchResult(
                title=item.get("title", ""),
                url=item.get("html_url", ""),
                snippet=snippet,
                source_type=source_type,
            )
        )

    return SearchResponse(
        results=results,
        count=len(results),
        total=data.get("count"),
        query=search_query,
    )
