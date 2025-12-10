"""Scrape endpoint - single URL scraping using Firecrawl."""
from fastapi import APIRouter, HTTPException
import httpx

from app.config import get_settings
from app.models.document import ScrapeRequest, ScrapeResponse

router = APIRouter()

FIRECRAWL_API_URL = "https://api.firecrawl.dev/v1"


@router.post("", response_model=ScrapeResponse)
async def scrape_url(request: ScrapeRequest):
    """
    Scrape a single URL using Firecrawl API.

    Returns the page content in markdown and/or HTML format,
    with optional filtering of main content only.
    """
    settings = get_settings()

    if not settings.firecrawl_api_key:
        return ScrapeResponse(
            success=False,
            error="Firecrawl API key not configured"
        )

    try:
        # Build request payload
        payload = {
            "url": request.url,
            "formats": request.formats,
            "onlyMainContent": request.only_main_content,
        }

        if request.include_tags:
            payload["includeTags"] = request.include_tags
        if request.exclude_tags:
            payload["excludeTags"] = request.exclude_tags
        if request.wait_for:
            payload["waitFor"] = request.wait_for

        # Call Firecrawl API
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                f"{FIRECRAWL_API_URL}/scrape",
                json=payload,
                headers={
                    "Authorization": f"Bearer {settings.firecrawl_api_key}",
                    "Content-Type": "application/json",
                }
            )
            response.raise_for_status()

        data = response.json()

        if not data.get("success"):
            return ScrapeResponse(
                success=False,
                error=data.get("error", "Scraping failed")
            )

        result = data.get("data", {})

        # Extract links from the page
        links = []
        if "links" in result:
            links = result["links"]
        elif "metadata" in result and "links" in result["metadata"]:
            links = result["metadata"]["links"]

        return ScrapeResponse(
            success=True,
            markdown=result.get("markdown"),
            html=result.get("html"),
            raw_html=result.get("rawHtml"),
            links=links if links else None,
            metadata=result.get("metadata"),
        )

    except httpx.HTTPStatusError as e:
        error_detail = "Unknown error"
        try:
            error_data = e.response.json()
            error_detail = error_data.get("error", str(e))
        except:
            error_detail = f"HTTP {e.response.status_code}"

        return ScrapeResponse(
            success=False,
            error=f"Firecrawl API error: {error_detail}"
        )
    except httpx.RequestError as e:
        return ScrapeResponse(
            success=False,
            error=f"Request failed: {str(e)}"
        )
    except Exception as e:
        return ScrapeResponse(
            success=False,
            error=f"Scraping failed: {str(e)}"
        )


@router.post("/batch")
async def scrape_batch(urls: list[str]):
    """
    Scrape multiple URLs in a single request.
    Uses Firecrawl batch endpoint for efficiency.
    """
    settings = get_settings()

    if not settings.firecrawl_api_key:
        raise HTTPException(
            status_code=500,
            detail="Firecrawl API key not configured"
        )

    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(
                f"{FIRECRAWL_API_URL}/batch/scrape",
                json={
                    "urls": urls,
                    "formats": ["markdown"],
                },
                headers={
                    "Authorization": f"Bearer {settings.firecrawl_api_key}",
                    "Content-Type": "application/json",
                }
            )
            response.raise_for_status()

        data = response.json()

        return {
            "success": data.get("success", False),
            "job_id": data.get("id"),
            "urls_count": len(urls),
        }

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Batch scrape failed: {str(e)}"
        )
