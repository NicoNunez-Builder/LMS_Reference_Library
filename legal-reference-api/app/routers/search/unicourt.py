from fastapi import APIRouter, HTTPException
import httpx
from typing import Optional
import time

from app.config import get_settings
from app.models.search import (
    UniCourtSearchRequest,
    SearchResponse,
    SearchResult,
    SearchResultMetadata,
    SourceType,
)

router = APIRouter()

# Token cache
_cached_token: Optional[str] = None
_token_expiry: Optional[float] = None

UNICOURT_BASE_URL = "https://enterpriseapi.unicourt.com"


async def get_access_token() -> Optional[str]:
    """Generate or retrieve access token."""
    global _cached_token, _token_expiry

    settings = get_settings()

    if not settings.unicourt_client_id or not settings.unicourt_client_secret:
        return None

    # Return cached token if still valid
    if _cached_token and _token_expiry and time.time() < _token_expiry:
        return _cached_token

    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{UNICOURT_BASE_URL}/generateNewToken",
            json={
                "clientId": settings.unicourt_client_id,
                "clientSecret": settings.unicourt_client_secret,
            },
        )

        if response.status_code != 200:
            return None

        data = response.json()
        _cached_token = data.get("accessToken") or data.get("access_token")
        # Refresh token every 24 hours
        _token_expiry = time.time() + 24 * 60 * 60

        return _cached_token


def build_query(params: UniCourtSearchRequest) -> str:
    """Build UniCourt query string from parameters."""
    query_parts = []

    # Main search query
    if params.query:
        if ":" in params.query:
            query_parts.append(params.query)
        else:
            query_parts.append(
                f"(caseName:({params.query}) OR DocketEntry:({params.query}))"
            )

    # State/Jurisdiction filter
    if params.state:
        query_parts.append(f'(JurisdictionGeo:(state:(name:"{params.state}")))')

    # Case type filter
    if params.case_type:
        query_parts.append(f'(CaseType:(name:"{params.case_type}"))')

    # Party name
    if params.party_name:
        query_parts.append(f'(Party:(name:"{params.party_name}"))')

    # Attorney name
    if params.attorney_name:
        query_parts.append(f'(Attorney:(name:"{params.attorney_name}"))')

    # Judge name
    if params.judge_name:
        query_parts.append(f'(Judge:(name:"{params.judge_name}"))')

    # Case number
    if params.case_number:
        query_parts.append(f'(caseNumber:"{params.case_number}")')

    # Date range
    if params.date_from:
        query_parts.append(f"(filedDate:[{params.date_from} TO *])")
    if params.date_to:
        query_parts.append(f"(filedDate:[* TO {params.date_to}])")

    return " AND ".join(query_parts)


@router.post("", response_model=SearchResponse)
async def search_unicourt(request: UniCourtSearchRequest):
    """Search UniCourt for court cases."""
    settings = get_settings()

    # Check for credentials
    if not settings.unicourt_client_id or not settings.unicourt_client_secret:
        return SearchResponse(
            results=[],
            count=0,
            total=0,
            query=request.query or "",
            error="UniCourt not configured. Add UNICOURT_CLIENT_ID and UNICOURT_CLIENT_SECRET.",
        )

    # Get access token
    access_token = await get_access_token()
    if not access_token:
        raise HTTPException(
            status_code=401, detail="Could not authenticate with UniCourt API"
        )

    # Build query
    search_query = build_query(request)
    if not search_query:
        raise HTTPException(status_code=400, detail="Please provide search criteria")

    # Search cases
    params = {
        "q": search_query,
        "pageNumber": request.page,
        "sort": "filedDate",
        "order": "desc",
    }

    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{UNICOURT_BASE_URL}/caseSearch",
            params=params,
            headers={
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json",
            },
        )

        if response.status_code != 200:
            raise HTTPException(
                status_code=response.status_code,
                detail=f"UniCourt search failed: {response.text}",
            )

        data = response.json()

    # Transform results
    results = []
    case_results = data.get("caseSearchResultArray") or data.get("results") or []
    for item in case_results[: request.limit]:
        # Build snippet from available data
        snippet_parts = []
        if item.get("courtName"):
            snippet_parts.append(f"Court: {item['courtName']}")
        if item.get("caseType"):
            snippet_parts.append(f"Type: {item['caseType']}")
        if item.get("filedDate"):
            snippet_parts.append(f"Filed: {item['filedDate']}")
        if item.get("caseStatus"):
            snippet_parts.append(f"Status: {item['caseStatus']}")
        parties = item.get("parties", [])
        if parties:
            party_names = ", ".join(p.get("name", "") for p in parties[:3])
            snippet_parts.append(f"Parties: {party_names}")

        snippet = ". ".join(snippet_parts) + "." if snippet_parts else ""
        if len(snippet) > 300:
            snippet = snippet[:297] + "..."

        results.append(
            SearchResult(
                title=item.get("caseName")
                or item.get("caseTitle")
                or "Unknown Case",
                url=item.get("caseUrl")
                or f"https://unicourt.com/case/{item.get('caseId', '')}",
                snippet=snippet or "No additional details available",
                source_type=SourceType.DOCUMENT,
                metadata=SearchResultMetadata(
                    case_id=item.get("caseId"),
                    case_number=item.get("caseNumber"),
                    court=item.get("courtName"),
                    state=item.get("state"),
                    case_type=item.get("caseType"),
                    case_status=item.get("caseStatus"),
                    date_filed=item.get("filedDate"),
                ),
            )
        )

    return SearchResponse(
        results=results,
        count=len(results),
        total=data.get("totalCount") or data.get("totalResults"),
        query=search_query,
    )


@router.get("/status")
async def unicourt_status():
    """Check UniCourt configuration status."""
    settings = get_settings()
    configured = bool(
        settings.unicourt_client_id and settings.unicourt_client_secret
    )

    return {
        "configured": configured,
        "message": "UniCourt API is configured"
        if configured
        else "Add UNICOURT_CLIENT_ID and UNICOURT_CLIENT_SECRET to .env",
    }
