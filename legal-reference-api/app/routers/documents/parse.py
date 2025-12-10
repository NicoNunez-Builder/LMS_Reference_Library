"""Parse document endpoint - extracts text from PDF, DOCX, and other documents."""
from fastapi import APIRouter, HTTPException
import httpx
from io import BytesIO
from typing import Optional

from app.models.document import (
    ParseDocumentRequest,
    ParseDocumentResponse,
    DocumentType,
)

router = APIRouter()


def detect_document_type(url: str, content_type: Optional[str] = None) -> Optional[DocumentType]:
    """Detect document type from URL or content-type header."""
    url_lower = url.lower()

    # Check URL extension
    if url_lower.endswith(".pdf"):
        return DocumentType.PDF
    elif url_lower.endswith(".docx"):
        return DocumentType.DOCX
    elif url_lower.endswith(".doc"):
        return DocumentType.DOC
    elif url_lower.endswith(".txt"):
        return DocumentType.TXT
    elif url_lower.endswith(".md"):
        return DocumentType.MD
    elif url_lower.endswith(".html") or url_lower.endswith(".htm"):
        return DocumentType.HTML
    elif url_lower.endswith(".rtf"):
        return DocumentType.RTF

    # Check content-type
    if content_type:
        ct_lower = content_type.lower()
        if "pdf" in ct_lower:
            return DocumentType.PDF
        elif "docx" in ct_lower or "wordprocessingml" in ct_lower:
            return DocumentType.DOCX
        elif "msword" in ct_lower:
            return DocumentType.DOC
        elif "text/plain" in ct_lower:
            return DocumentType.TXT
        elif "text/markdown" in ct_lower:
            return DocumentType.MD
        elif "text/html" in ct_lower:
            return DocumentType.HTML
        elif "rtf" in ct_lower:
            return DocumentType.RTF

    return None


async def parse_pdf(content: bytes) -> dict:
    """Parse PDF document using pypdf."""
    try:
        from pypdf import PdfReader

        reader = PdfReader(BytesIO(content))
        pages = []

        for page in reader.pages:
            text = page.extract_text()
            if text:
                pages.append(text)

        full_text = "\n\n".join(pages)
        word_count = len(full_text.split())

        return {
            "text": full_text,
            "word_count": word_count,
            "page_count": len(reader.pages),
            "metadata": {
                "info": dict(reader.metadata) if reader.metadata else None,
            }
        }
    except ImportError:
        raise HTTPException(
            status_code=500,
            detail="pypdf library not installed. Run: pip install pypdf"
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"PDF parsing failed: {str(e)}"
        )


async def parse_docx(content: bytes) -> dict:
    """Parse DOCX document using python-docx."""
    try:
        from docx import Document

        doc = Document(BytesIO(content))
        paragraphs = []

        for para in doc.paragraphs:
            if para.text.strip():
                paragraphs.append(para.text)

        full_text = "\n\n".join(paragraphs)
        word_count = len(full_text.split())

        # Extract metadata
        metadata = {}
        if doc.core_properties:
            props = doc.core_properties
            metadata = {
                "title": props.title,
                "author": props.author,
                "subject": props.subject,
                "created": str(props.created) if props.created else None,
                "modified": str(props.modified) if props.modified else None,
            }

        return {
            "text": full_text,
            "word_count": word_count,
            "page_count": None,  # DOCX doesn't have pages
            "metadata": metadata
        }
    except ImportError:
        raise HTTPException(
            status_code=500,
            detail="python-docx library not installed. Run: pip install python-docx"
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"DOCX parsing failed: {str(e)}"
        )


async def parse_text(content: bytes, encoding: str = "utf-8") -> dict:
    """Parse plain text document."""
    try:
        text = content.decode(encoding)
    except UnicodeDecodeError:
        # Try other common encodings
        for enc in ["latin-1", "cp1252", "utf-16"]:
            try:
                text = content.decode(enc)
                break
            except UnicodeDecodeError:
                continue
        else:
            text = content.decode("utf-8", errors="replace")

    word_count = len(text.split())

    return {
        "text": text,
        "word_count": word_count,
        "page_count": None,
        "metadata": {}
    }


async def parse_html(content: bytes) -> dict:
    """Parse HTML document, extracting text content."""
    try:
        from bs4 import BeautifulSoup

        soup = BeautifulSoup(content, "html.parser")

        # Remove script and style elements
        for element in soup(["script", "style", "nav", "header", "footer"]):
            element.decompose()

        # Get text
        text = soup.get_text(separator="\n\n")

        # Clean up whitespace
        lines = [line.strip() for line in text.split("\n")]
        text = "\n".join(line for line in lines if line)

        word_count = len(text.split())

        # Extract title if present
        title = soup.title.string if soup.title else None

        return {
            "text": text,
            "word_count": word_count,
            "page_count": None,
            "metadata": {"title": title}
        }
    except ImportError:
        # Fallback without BeautifulSoup - basic text extraction
        import re
        text = content.decode("utf-8", errors="replace")
        text = re.sub(r"<[^>]+>", " ", text)
        text = re.sub(r"\s+", " ", text).strip()

        return {
            "text": text,
            "word_count": len(text.split()),
            "page_count": None,
            "metadata": {}
        }


@router.post("", response_model=ParseDocumentResponse)
async def parse_document(request: ParseDocumentRequest):
    """
    Parse a document from URL and extract text content.

    Supported formats:
    - PDF: Uses pypdf for text extraction
    - DOCX: Uses python-docx for text extraction
    - TXT/MD: Direct text reading
    - HTML: Extracts text content, strips tags
    """
    try:
        # Download the document
        async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as client:
            response = await client.get(request.url)
            response.raise_for_status()

        content = response.content
        content_type = response.headers.get("content-type", "")

        # Determine document type
        doc_type = request.document_type or detect_document_type(request.url, content_type)

        if not doc_type:
            return ParseDocumentResponse(
                success=False,
                error="Could not determine document type. Please specify document_type."
            )

        # Parse based on type
        if doc_type == DocumentType.PDF:
            result = await parse_pdf(content)
        elif doc_type in [DocumentType.DOCX, DocumentType.DOC]:
            result = await parse_docx(content)
        elif doc_type in [DocumentType.TXT, DocumentType.MD]:
            result = await parse_text(content)
        elif doc_type == DocumentType.HTML:
            result = await parse_html(content)
        elif doc_type == DocumentType.RTF:
            # RTF can be treated as text with some cleanup
            result = await parse_text(content)
        else:
            return ParseDocumentResponse(
                success=False,
                error=f"Unsupported document type: {doc_type}"
            )

        return ParseDocumentResponse(
            success=True,
            text=result["text"],
            word_count=result["word_count"],
            page_count=result.get("page_count"),
            document_type=doc_type.value,
            metadata=result.get("metadata"),
        )

    except httpx.HTTPStatusError as e:
        return ParseDocumentResponse(
            success=False,
            error=f"Failed to download document: HTTP {e.response.status_code}"
        )
    except httpx.RequestError as e:
        return ParseDocumentResponse(
            success=False,
            error=f"Request failed: {str(e)}"
        )
    except HTTPException as e:
        return ParseDocumentResponse(
            success=False,
            error=e.detail
        )
    except Exception as e:
        return ParseDocumentResponse(
            success=False,
            error=f"Parsing failed: {str(e)}"
        )
