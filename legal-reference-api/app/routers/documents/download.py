"""Download endpoint - downloads files from URL to Supabase storage."""
from fastapi import APIRouter, HTTPException
import httpx
import uuid
from urllib.parse import urlparse, unquote
import mimetypes

from app.config import get_settings
from app.models.document import DownloadRequest, DownloadResponse
from supabase import create_client

router = APIRouter()


def get_supabase_client():
    """Get Supabase client instance."""
    settings = get_settings()
    return create_client(settings.supabase_url, settings.supabase_key)


def extract_filename_from_url(url: str) -> str:
    """Extract filename from URL or generate a unique one."""
    parsed = urlparse(url)
    path = unquote(parsed.path)

    # Get filename from path
    if "/" in path:
        filename = path.split("/")[-1]
        if filename and "." in filename:
            return filename

    # Generate unique filename if none found
    return f"file_{uuid.uuid4().hex[:8]}"


def guess_content_type(url: str, headers: dict) -> str:
    """Determine content type from headers or URL."""
    # Try content-type header first
    content_type = headers.get("content-type", "").split(";")[0].strip()
    if content_type and content_type != "application/octet-stream":
        return content_type

    # Fall back to guessing from URL
    guessed, _ = mimetypes.guess_type(url)
    return guessed or "application/octet-stream"


@router.post("", response_model=DownloadResponse)
async def download_file(request: DownloadRequest):
    """
    Download a file from URL and upload to Supabase storage.

    - Downloads the file from the provided URL
    - Uploads to Supabase storage in the specified folder
    - Returns the public URL for the stored file
    """
    try:
        settings = get_settings()
        supabase = get_supabase_client()

        # Download the file
        async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as client:
            response = await client.get(request.url)
            response.raise_for_status()

        file_content = response.content
        content_type = guess_content_type(request.url, dict(response.headers))

        # Determine filename
        if request.filename:
            filename = request.filename
        else:
            filename = extract_filename_from_url(request.url)
            # Ensure unique filename
            filename = f"{uuid.uuid4().hex[:8]}_{filename}"

        # Build storage path
        storage_path = f"{request.folder.value}/{filename}"

        # Upload to Supabase storage
        result = supabase.storage.from_(request.bucket).upload(
            path=storage_path,
            file=file_content,
            file_options={"content-type": content_type}
        )

        # Get public URL
        public_url = supabase.storage.from_(request.bucket).get_public_url(storage_path)

        return DownloadResponse(
            success=True,
            public_url=public_url,
            storage_path=storage_path,
            filename=filename,
            content_type=content_type,
            size=len(file_content),
        )

    except httpx.HTTPStatusError as e:
        return DownloadResponse(
            success=False,
            error=f"Failed to download file: HTTP {e.response.status_code}"
        )
    except httpx.RequestError as e:
        return DownloadResponse(
            success=False,
            error=f"Request failed: {str(e)}"
        )
    except Exception as e:
        return DownloadResponse(
            success=False,
            error=f"Upload failed: {str(e)}"
        )


@router.get("/info")
async def get_file_info(url: str):
    """
    Get file info (size, type) from URL without downloading.
    Uses HEAD request to fetch headers only.
    """
    try:
        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
            response = await client.head(url)
            response.raise_for_status()

        headers = dict(response.headers)
        content_length = headers.get("content-length")
        content_type = guess_content_type(url, headers)

        return {
            "success": True,
            "url": url,
            "content_type": content_type,
            "size": int(content_length) if content_length else None,
            "filename": extract_filename_from_url(url),
        }

    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }
