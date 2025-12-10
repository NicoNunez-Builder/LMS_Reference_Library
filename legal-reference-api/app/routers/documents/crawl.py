"""Crawl endpoint - multi-page website crawling using Firecrawl."""
from fastapi import APIRouter, HTTPException
import httpx
import asyncio

from app.config import get_settings
from app.models.document import (
    CrawlRequest,
    CrawlStatusResponse,
    CrawlResponse,
    CrawledPage,
)

router = APIRouter()

FIRECRAWL_API_URL = "https://api.firecrawl.dev/v1"


@router.post("", response_model=CrawlStatusResponse)
async def start_crawl(request: CrawlRequest):
    """
    Start a crawl job for a website.

    Returns a job ID that can be used to check status and retrieve results.
    Crawling is async - use /crawl/{job_id} to get results.
    """
    settings = get_settings()

    if not settings.firecrawl_api_key:
        return CrawlStatusResponse(
            success=False,
            error="Firecrawl API key not configured"
        )

    try:
        # Build crawl options
        payload = {
            "url": request.url,
            "maxDepth": request.max_depth,
            "limit": request.limit,
            "scrapeOptions": {
                "formats": request.formats,
            },
            "allowExternalLinks": request.allow_external_links,
        }

        if request.include_paths:
            payload["includePaths"] = request.include_paths
        if request.exclude_paths:
            payload["excludePaths"] = request.exclude_paths

        # Start crawl job
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{FIRECRAWL_API_URL}/crawl",
                json=payload,
                headers={
                    "Authorization": f"Bearer {settings.firecrawl_api_key}",
                    "Content-Type": "application/json",
                }
            )
            response.raise_for_status()

        data = response.json()

        if not data.get("success"):
            return CrawlStatusResponse(
                success=False,
                error=data.get("error", "Failed to start crawl")
            )

        return CrawlStatusResponse(
            success=True,
            job_id=data.get("id"),
            status="queued",
        )

    except httpx.HTTPStatusError as e:
        error_detail = "Unknown error"
        try:
            error_data = e.response.json()
            error_detail = error_data.get("error", str(e))
        except:
            error_detail = f"HTTP {e.response.status_code}"

        return CrawlStatusResponse(
            success=False,
            error=f"Firecrawl API error: {error_detail}"
        )
    except Exception as e:
        return CrawlStatusResponse(
            success=False,
            error=f"Failed to start crawl: {str(e)}"
        )


@router.get("/{job_id}", response_model=CrawlResponse)
async def get_crawl_status(job_id: str):
    """
    Get the status and results of a crawl job.

    Returns partial results while crawling is in progress,
    and full results when completed.
    """
    settings = get_settings()

    if not settings.firecrawl_api_key:
        return CrawlResponse(
            success=False,
            status="error",
            error="Firecrawl API key not configured"
        )

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                f"{FIRECRAWL_API_URL}/crawl/{job_id}",
                headers={
                    "Authorization": f"Bearer {settings.firecrawl_api_key}",
                }
            )
            response.raise_for_status()

        data = response.json()

        # Parse pages
        pages = []
        for page_data in data.get("data", []):
            pages.append(CrawledPage(
                url=page_data.get("metadata", {}).get("sourceURL", ""),
                title=page_data.get("metadata", {}).get("title"),
                markdown=page_data.get("markdown"),
                html=page_data.get("html"),
                metadata=page_data.get("metadata"),
            ))

        return CrawlResponse(
            success=True,
            job_id=job_id,
            status=data.get("status", "unknown"),
            pages=pages,
            total=data.get("total", len(pages)),
        )

    except httpx.HTTPStatusError as e:
        return CrawlResponse(
            success=False,
            status="error",
            error=f"Failed to get crawl status: HTTP {e.response.status_code}"
        )
    except Exception as e:
        return CrawlResponse(
            success=False,
            status="error",
            error=f"Failed to get crawl status: {str(e)}"
        )


@router.delete("/{job_id}")
async def cancel_crawl(job_id: str):
    """Cancel a running crawl job."""
    settings = get_settings()

    if not settings.firecrawl_api_key:
        raise HTTPException(
            status_code=500,
            detail="Firecrawl API key not configured"
        )

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.delete(
                f"{FIRECRAWL_API_URL}/crawl/{job_id}",
                headers={
                    "Authorization": f"Bearer {settings.firecrawl_api_key}",
                }
            )
            response.raise_for_status()

        return {"success": True, "message": f"Crawl job {job_id} cancelled"}

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to cancel crawl: {str(e)}"
        )


@router.post("/sync", response_model=CrawlResponse)
async def crawl_sync(request: CrawlRequest, timeout_seconds: int = 120):
    """
    Start a crawl and wait for results (synchronous version).

    Polls the crawl status until complete or timeout.
    Useful for smaller crawls where you want immediate results.
    """
    # Start the crawl
    start_result = await start_crawl(request)

    if not start_result.success or not start_result.job_id:
        return CrawlResponse(
            success=False,
            status="error",
            error=start_result.error or "Failed to start crawl"
        )

    job_id = start_result.job_id

    # Poll for results
    poll_interval = 2  # seconds
    max_polls = timeout_seconds // poll_interval

    for _ in range(max_polls):
        await asyncio.sleep(poll_interval)

        result = await get_crawl_status(job_id)

        if result.status in ["completed", "failed", "error"]:
            return result

    # Timeout - return partial results
    final_result = await get_crawl_status(job_id)
    final_result.error = f"Timeout after {timeout_seconds}s - partial results returned"
    return final_result
