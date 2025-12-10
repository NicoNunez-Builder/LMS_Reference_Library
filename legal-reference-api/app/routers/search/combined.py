from fastapi import APIRouter
import asyncio

from app.models.search import (
    CombinedSearchRequest,
    CombinedSearchResponse,
    SourceSearchResult,
    BaseSearchRequest,
    GoogleSearchRequest,
    CourtListenerSearchRequest,
    UniCourtSearchRequest,
)

from app.routers.search import (
    google,
    youtube,
    books,
    openlibrary,
    courtlistener,
    congress,
    federalregister,
    loc,
    unicourt,
)

router = APIRouter()


@router.post("", response_model=CombinedSearchResponse)
async def search_combined(request: CombinedSearchRequest):
    """Execute searches across multiple sources in parallel."""
    tasks = {}

    # Create base request for simple searches
    base_request = BaseSearchRequest(
        query=request.query,
        category=request.category,
        limit=request.limit,
    )

    # Queue up enabled searches
    if request.include_google:
        google_request = GoogleSearchRequest(
            query=request.query,
            category=request.category,
            limit=request.limit,
            file_type=request.file_type,
        )
        tasks["google"] = google.search_google(google_request)

    if request.include_youtube:
        tasks["youtube"] = youtube.search_youtube(base_request)

    if request.include_books:
        tasks["books"] = books.search_books(base_request)

    if request.include_openlibrary:
        tasks["openlibrary"] = openlibrary.search_openlibrary(base_request)

    if request.include_courtlistener:
        cl_request = CourtListenerSearchRequest(
            query=request.query,
            category=request.category,
            limit=request.limit,
            court=request.court,
            search_type=request.search_type,
            date_from=request.date_from,
            date_to=request.date_to,
        )
        tasks["courtlistener"] = courtlistener.search_courtlistener(cl_request)

    if request.include_congress:
        tasks["congress"] = congress.search_congress(base_request)

    if request.include_federalregister:
        tasks["federalregister"] = federalregister.search_federalregister(base_request)

    if request.include_loc:
        tasks["loc"] = loc.search_loc(base_request)

    if request.include_unicourt:
        uc_request = UniCourtSearchRequest(
            query=request.query,
            state=request.state,
            case_type=request.case_type,
            date_from=request.date_from,
            date_to=request.date_to,
            limit=request.limit,
        )
        tasks["unicourt"] = unicourt.search_unicourt(uc_request)

    # Execute all searches in parallel
    results = {}
    total = 0

    if tasks:
        task_keys = list(tasks.keys())
        task_coros = list(tasks.values())

        # Use gather with return_exceptions to handle failures gracefully
        responses = await asyncio.gather(*task_coros, return_exceptions=True)

        for key, response in zip(task_keys, responses):
            if isinstance(response, Exception):
                # Log error but continue with other results
                results[key] = SourceSearchResult(results=[], count=0)
            else:
                results[key] = SourceSearchResult(
                    results=response.results,
                    count=response.count,
                )
                total += response.count

    return CombinedSearchResponse(
        google=results.get("google"),
        youtube=results.get("youtube"),
        books=results.get("books"),
        openlibrary=results.get("openlibrary"),
        courtlistener=results.get("courtlistener"),
        congress=results.get("congress"),
        federalregister=results.get("federalregister"),
        loc=results.get("loc"),
        unicourt=results.get("unicourt"),
        total=total,
        query=request.query,
    )
