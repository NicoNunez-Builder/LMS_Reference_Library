"""Pydantic models for AI endpoints (chat, embeddings, cleaning)."""
from pydantic import BaseModel, Field
from typing import Optional, List, Literal
from enum import Enum


# Chat Models
class ChatMode(str, Enum):
    """Chat operation modes."""
    CHAT = "chat"
    QA = "qa"
    SUMMARIZE = "summarize"


class ChatProvider(str, Enum):
    """AI provider options."""
    PGVECTOR = "pgvector"
    GEMINI = "gemini"


class SummaryStyle(str, Enum):
    """Summary output styles."""
    BRIEF = "brief"
    DETAILED = "detailed"
    BULLET = "bullet"


class ChatRequest(BaseModel):
    """Request for chat/Q&A/summarize operations."""
    message: Optional[str] = Field(None, description="User message (required for chat/qa)")
    mode: ChatMode = Field(ChatMode.QA, description="Operation mode")
    provider: ChatProvider = Field(ChatProvider.PGVECTOR, description="AI provider")
    resource_ids: Optional[List[str]] = Field(None, description="Filter to specific resources")
    session_id: Optional[str] = Field(None, description="Chat session ID for history")
    model: Optional[str] = Field(None, description="Override default model")
    temperature: float = Field(0.7, ge=0, le=2, description="Sampling temperature")
    summary_style: SummaryStyle = Field(SummaryStyle.DETAILED, description="Style for summaries")


class SourceChunk(BaseModel):
    """Source chunk from vector search."""
    resource_id: str
    title: Optional[str] = None
    url: Optional[str] = None
    snippet: str
    similarity: float


class ChatResponse(BaseModel):
    """Response from chat endpoint."""
    success: bool
    response: Optional[str] = None
    sources: List[SourceChunk] = []
    mode: str
    provider: str
    model: str
    error: Optional[str] = None


class ChatSession(BaseModel):
    """Chat session info."""
    id: str
    title: Optional[str] = None
    created_at: str
    updated_at: str


class ChatMessage(BaseModel):
    """Single chat message."""
    id: str
    session_id: str
    role: Literal["user", "assistant"]
    content: str
    sources: Optional[List[dict]] = None
    created_at: str


class ChatHistoryResponse(BaseModel):
    """Response with chat history."""
    session: Optional[ChatSession] = None
    messages: List[ChatMessage] = []
    sessions: Optional[List[ChatSession]] = None


# Embedding Models
class EmbedRequest(BaseModel):
    """Request to generate embeddings."""
    resource_id: Optional[str] = Field(None, description="Single resource ID")
    resource_ids: Optional[List[str]] = Field(None, description="Multiple resource IDs")
    force: bool = Field(False, description="Regenerate even if exists")
    clean_data: bool = Field(True, description="Clean content before embedding")


class EmbedResult(BaseModel):
    """Result for single resource embedding."""
    resource_id: str
    title: str
    chunks: int
    status: Literal["success", "skipped", "error"]
    error: Optional[str] = None
    cleaning_stats: Optional[dict] = None


class EmbedResponse(BaseModel):
    """Response from embedding operation."""
    success: bool
    processed: int
    successful: int
    skipped: int
    errors: int
    results: List[EmbedResult]
    message: str


class EmbedStatusResponse(BaseModel):
    """Response for embedding status check."""
    resource_id: Optional[str] = None
    category_id: Optional[str] = None
    embedded: Optional[bool] = None
    chunks: Optional[int] = None
    total_resources: Optional[int] = None
    embedded_resources: Optional[int] = None
    total_embeddings: Optional[int] = None
    resources: Optional[List[dict]] = None
    configured: Optional[bool] = None


# Cleaning Models
class CleaningOptions(BaseModel):
    """Options for text cleaning."""
    remove_html: bool = Field(True, alias="removeHtml")
    remove_urls: bool = Field(False, alias="removeUrls")
    remove_boilerplate: bool = Field(False, alias="removeBoilerplate")
    normalize_whitespace: bool = Field(True, alias="normalizeWhitespace")
    remove_short_lines: bool = Field(False, alias="removeShortLines")
    min_line_length: int = Field(10, alias="minLineLength")
    remove_duplicates: bool = Field(False, alias="removeDuplicates")
    normalize_markdown: bool = Field(True, alias="normalizeMarkdown")

    class Config:
        populate_by_name = True


class CleanRequest(BaseModel):
    """Request to clean text content."""
    resource_id: Optional[str] = Field(None, description="Resource ID to clean")
    text: Optional[str] = Field(None, description="Direct text to clean")
    options: Optional[CleaningOptions] = Field(None, description="Cleaning options")
    apply: bool = Field(False, description="Save cleaned content back to resource")


class CleaningStats(BaseModel):
    """Statistics from cleaning operation."""
    original_chars: int
    cleaned_chars: int
    reduction_percent: float


class CleanResponse(BaseModel):
    """Response from cleaning operation."""
    success: bool
    applied: bool = False
    resource_id: Optional[str] = None
    title: Optional[str] = None
    original: Optional[dict] = None
    cleaned: Optional[dict] = None
    stats: Optional[CleaningStats] = None
    options: Optional[CleaningOptions] = None
    message: Optional[str] = None
    error: Optional[str] = None


# Advanced Cleaning Models
class AdvancedCleanMethod(str, Enum):
    """Advanced cleaning method options."""
    JINA = "jina"
    LLM = "llm"
    READABILITY = "readability"


class AdvancedCleanRequest(BaseModel):
    """Request for advanced cleaning."""
    method: AdvancedCleanMethod = Field(..., description="Cleaning method")
    text: Optional[str] = Field(None, description="Text to clean (for llm, readability)")
    url: Optional[str] = Field(None, description="URL to clean (for jina)")
    html: Optional[str] = Field(None, description="HTML to clean (for readability)")
    instructions: Optional[str] = Field(None, description="Custom LLM instructions")


class AdvancedCleanStats(BaseModel):
    """Stats from advanced cleaning."""
    char_count: int
    word_count: int
    line_count: int


class AdvancedCleanResponse(BaseModel):
    """Response from advanced cleaning."""
    success: bool
    text: Optional[str] = None
    title: Optional[str] = None
    method: Optional[str] = None
    stats: Optional[AdvancedCleanStats] = None
    error: Optional[str] = None
