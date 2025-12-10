"""AI service helpers for embeddings, chat completion, and text processing."""
import re
import httpx
from typing import List, Optional
from app.config import get_settings

settings = get_settings()


# Text chunking
def chunk_text(
    text: str,
    chunk_size: int = 1000,
    overlap: int = 100
) -> List[str]:
    """Split text into overlapping chunks."""
    if not text or len(text) < chunk_size:
        return [text] if text else []

    chunks = []
    start = 0

    while start < len(text):
        end = start + chunk_size

        # Try to break at sentence boundary
        if end < len(text):
            # Look for sentence end near chunk boundary
            for sep in [". ", ".\n", "? ", "?\n", "! ", "!\n"]:
                last_sep = text[start:end].rfind(sep)
                if last_sep > chunk_size // 2:
                    end = start + last_sep + len(sep)
                    break

        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)

        start = end - overlap

    return chunks


# Token counting (approximate)
def count_tokens(text: str) -> int:
    """Estimate token count (rough approximation: ~4 chars per token)."""
    return len(text) // 4


# Text cleaning
def clean_content(text: str, options: Optional[dict] = None) -> str:
    """Clean text content with configurable options."""
    if not text:
        return ""

    opts = options or {}
    cleaned = text

    # Remove HTML tags
    if opts.get("remove_html", True):
        cleaned = re.sub(r"<[^>]+>", " ", cleaned)

    # Remove URLs (optional, disabled by default for legal docs)
    if opts.get("remove_urls", False):
        cleaned = re.sub(r"https?://\S+", "", cleaned)

    # Normalize whitespace
    if opts.get("normalize_whitespace", True):
        cleaned = re.sub(r"[ \t]+", " ", cleaned)
        cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)

    # Remove short lines (optional)
    if opts.get("remove_short_lines", False):
        min_len = opts.get("min_line_length", 10)
        lines = cleaned.split("\n")
        cleaned = "\n".join(
            line for line in lines
            if len(line.strip()) >= min_len or not line.strip()
        )

    # Normalize markdown (optional)
    if opts.get("normalize_markdown", True):
        # Fix heading spacing
        cleaned = re.sub(r"\n(#{1,6})\s*", r"\n\n\1 ", cleaned)
        # Fix list spacing
        cleaned = re.sub(r"\n([-*])\s+", r"\n\1 ", cleaned)

    return cleaned.strip()


def get_cleaning_stats(original: str, cleaned: str) -> dict:
    """Calculate cleaning statistics."""
    original_len = len(original)
    cleaned_len = len(cleaned)
    reduction = ((original_len - cleaned_len) / original_len * 100) if original_len > 0 else 0

    return {
        "original_chars": original_len,
        "cleaned_chars": cleaned_len,
        "reduction_percent": round(reduction, 2),
    }


# OpenAI embeddings
async def generate_embedding(text: str) -> List[float]:
    """Generate embedding for a single text using OpenAI."""
    if not settings.openai_api_key:
        raise ValueError("OpenAI API key not configured")

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            "https://api.openai.com/v1/embeddings",
            headers={
                "Authorization": f"Bearer {settings.openai_api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": "text-embedding-3-small",
                "input": text,
            }
        )
        response.raise_for_status()
        data = response.json()
        return data["data"][0]["embedding"]


async def generate_embeddings(texts: List[str]) -> List[List[float]]:
    """Generate embeddings for multiple texts."""
    if not settings.openai_api_key:
        raise ValueError("OpenAI API key not configured")

    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(
            "https://api.openai.com/v1/embeddings",
            headers={
                "Authorization": f"Bearer {settings.openai_api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": "text-embedding-3-small",
                "input": texts,
            }
        )
        response.raise_for_status()
        data = response.json()
        # Sort by index to maintain order
        sorted_data = sorted(data["data"], key=lambda x: x["index"])
        return [item["embedding"] for item in sorted_data]


# OpenAI chat completion
async def chat_completion(
    messages: List[dict],
    model: str = "gpt-4o-mini",
    temperature: float = 0.7,
    max_tokens: int = 4096,
) -> str:
    """Generate chat completion using OpenAI."""
    if not settings.openai_api_key:
        raise ValueError("OpenAI API key not configured")

    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(
            "https://api.openai.com/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {settings.openai_api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": model,
                "messages": messages,
                "temperature": temperature,
                "max_tokens": max_tokens,
            }
        )
        response.raise_for_status()
        data = response.json()
        return data["choices"][0]["message"]["content"]


# Gemini chat completion
async def gemini_chat_completion(
    prompt: str,
    context: Optional[str] = None,
    model: str = "gemini-2.0-flash-exp",
    temperature: float = 0.7,
) -> str:
    """Generate completion using Google Gemini."""
    if not settings.gemini_api_key:
        raise ValueError("Gemini API key not configured")

    full_prompt = prompt
    if context:
        full_prompt = f"Context:\n{context}\n\n---\n\n{prompt}"

    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(
            f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
            params={"key": settings.gemini_api_key},
            json={
                "contents": [{"parts": [{"text": full_prompt}]}],
                "generationConfig": {
                    "temperature": temperature,
                    "maxOutputTokens": 8192,
                }
            }
        )
        response.raise_for_status()
        data = response.json()
        return data["candidates"][0]["content"]["parts"][0]["text"]


# RAG prompt builders
def build_rag_prompt(question: str, sources: List[dict]) -> str:
    """Build RAG prompt with sources context."""
    context = "\n\n".join([
        f"Source: {s.get('source', 'Unknown')}\n{s.get('text', '')}"
        for s in sources
    ])

    return f"""You are a legal research assistant. Answer the following question based on the provided sources.

Question: {question}

Sources:
{context}

Instructions:
- Base your answer on the provided sources
- Cite source titles when referencing specific information
- If the answer cannot be found in the sources, say so clearly
- Be precise and accurate with legal terminology"""


def build_summarize_prompt(chunks: List[dict], style: str = "detailed") -> str:
    """Build summarization prompt."""
    context = "\n\n".join([
        f"From '{c.get('source', 'Unknown')}':\n{c.get('text', '')}"
        for c in chunks
    ])

    style_instructions = {
        "brief": "Provide a concise 2-3 paragraph summary.",
        "detailed": "Provide a comprehensive summary covering all key points.",
        "bullet": "Provide a bullet-point summary of key findings and arguments.",
    }

    return f"""Summarize the following legal document excerpts.

{style_instructions.get(style, style_instructions['detailed'])}

Documents:
{context}

Focus on:
- Key legal concepts and arguments
- Important dates, parties, and case citations
- Main conclusions and implications"""


# Jina Reader for URL cleaning
async def clean_with_jina(url: str) -> dict:
    """Clean URL content using Jina Reader API."""
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.get(
            f"https://r.jina.ai/{url}",
            headers={"Accept": "text/plain"}
        )
        response.raise_for_status()
        text = response.text

    # Extract title from first heading
    title = None
    lines = text.split("\n")
    if lines and lines[0].startswith("# "):
        title = lines[0].replace("# ", "").strip()

    return {"text": text, "title": title}


# Readability-style HTML extraction
def extract_with_readability(html: str) -> dict:
    """Extract main content from HTML."""
    # Remove scripts, styles, comments
    cleaned = html
    cleaned = re.sub(r"<script[^>]*>[\s\S]*?</script>", "", cleaned, flags=re.I)
    cleaned = re.sub(r"<style[^>]*>[\s\S]*?</style>", "", cleaned, flags=re.I)
    cleaned = re.sub(r"<noscript[^>]*>[\s\S]*?</noscript>", "", cleaned, flags=re.I)
    cleaned = re.sub(r"<!--[\s\S]*?-->", "", cleaned)

    # Extract title
    title_match = re.search(r"<title[^>]*>([^<]*)</title>", cleaned, re.I)
    title = title_match.group(1).strip() if title_match else None

    # Remove boilerplate containers
    for tag in ["header", "footer", "nav", "aside"]:
        cleaned = re.sub(f"<{tag}[^>]*>[\\s\\S]*?</{tag}>", "", cleaned, flags=re.I)

    # Try to find main content
    article_match = re.search(r"<article[^>]*>([\s\S]*?)</article>", cleaned, re.I)
    main_match = re.search(r"<main[^>]*>([\s\S]*?)</main>", cleaned, re.I)

    if article_match:
        cleaned = article_match.group(1)
    elif main_match:
        cleaned = main_match.group(1)

    # Convert HTML to text
    text = cleaned
    # Headings
    text = re.sub(r"<h1[^>]*>", "\n\n# ", text, flags=re.I)
    text = re.sub(r"<h2[^>]*>", "\n\n## ", text, flags=re.I)
    text = re.sub(r"<h3[^>]*>", "\n\n### ", text, flags=re.I)
    text = re.sub(r"</h[1-6]>", "\n", text, flags=re.I)
    # Paragraphs
    text = re.sub(r"<p[^>]*>", "\n\n", text, flags=re.I)
    text = re.sub(r"</p>", "", text, flags=re.I)
    text = re.sub(r"<br\s*/?>", "\n", text, flags=re.I)
    # Lists
    text = re.sub(r"<li[^>]*>", "\n- ", text, flags=re.I)
    text = re.sub(r"</li>", "", text, flags=re.I)
    # Remove remaining tags
    text = re.sub(r"<[^>]+>", "", text)
    # Decode entities
    text = text.replace("&nbsp;", " ")
    text = text.replace("&amp;", "&")
    text = text.replace("&lt;", "<")
    text = text.replace("&gt;", ">")
    text = text.replace("&quot;", '"')
    text = text.replace("&#39;", "'")
    # Clean whitespace
    text = re.sub(r"\n{4,}", "\n\n\n", text)
    text = re.sub(r"[ \t]+", " ", text)

    return {"text": text.strip(), "title": title}
