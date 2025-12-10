"""Advanced clean endpoint - multiple cleaning methods."""
from fastapi import APIRouter

from app.config import get_settings
from app.models.ai import (
    AdvancedCleanRequest,
    AdvancedCleanResponse,
    AdvancedCleanStats,
    AdvancedCleanMethod,
)
from app.services.ai import (
    clean_with_jina,
    extract_with_readability,
    chat_completion,
)

router = APIRouter()


async def clean_with_llm(text: str, instructions: str = None) -> str:
    """Clean text using LLM."""
    default_instructions = """Clean and format the following text extracted from a document or web page.
Your task:
1. Remove any remaining HTML artifacts, navigation elements, or boilerplate text
2. Fix formatting issues (spacing, line breaks, etc.)
3. Preserve the main content structure (headings, lists, paragraphs)
4. Remove duplicate content
5. Clean up any encoding issues or special characters
6. Keep all substantive content - do not summarize or shorten

Return ONLY the cleaned text, no explanations."""

    response = await chat_completion(
        [
            {"role": "system", "content": instructions or default_instructions},
            {"role": "user", "content": text[:100000]},  # Limit input
        ],
        model="gpt-4o-mini",
        temperature=0.1,
        max_tokens=16000,
    )

    return response


@router.post("", response_model=AdvancedCleanResponse)
async def advanced_clean(request: AdvancedCleanRequest):
    """
    Advanced text cleaning with multiple methods.

    Methods:
    - jina: Use Jina Reader API to extract clean content from URL
    - llm: Use LLM to clean and format text
    - readability: Use readability-style extraction from HTML
    """
    settings = get_settings()

    try:
        result_text = ""
        result_title = None

        if request.method == AdvancedCleanMethod.JINA:
            if not request.url:
                return AdvancedCleanResponse(
                    success=False,
                    error="URL required for Jina Reader"
                )

            jina_result = await clean_with_jina(request.url)
            result_text = jina_result["text"]
            result_title = jina_result.get("title")

        elif request.method == AdvancedCleanMethod.LLM:
            if not request.text:
                return AdvancedCleanResponse(
                    success=False,
                    error="Text required for LLM cleaning"
                )

            if not settings.openai_api_key:
                return AdvancedCleanResponse(
                    success=False,
                    error="OpenAI API key not configured"
                )

            result_text = await clean_with_llm(request.text, request.instructions)

        elif request.method == AdvancedCleanMethod.READABILITY:
            if not request.html and not request.text:
                return AdvancedCleanResponse(
                    success=False,
                    error="HTML or text required for Readability extraction"
                )

            readability_result = extract_with_readability(request.html or request.text)
            result_text = readability_result["text"]
            result_title = readability_result.get("title")

        else:
            return AdvancedCleanResponse(
                success=False,
                error=f"Unknown method: {request.method}"
            )

        # Calculate stats
        stats = AdvancedCleanStats(
            char_count=len(result_text),
            word_count=len(result_text.split()),
            line_count=len(result_text.split("\n")),
        )

        return AdvancedCleanResponse(
            success=True,
            text=result_text,
            title=result_title,
            method=request.method.value,
            stats=stats,
        )

    except Exception as e:
        return AdvancedCleanResponse(
            success=False,
            error=f"Advanced cleaning failed: {str(e)}"
        )
