"""Chat endpoint - RAG-based Q&A, summarization, and chat."""
from fastapi import APIRouter, Query
from typing import Optional, List

from app.config import get_settings
from app.models.ai import (
    ChatRequest,
    ChatResponse,
    ChatHistoryResponse,
    ChatMode,
    ChatProvider,
    SourceChunk,
)
from app.services.ai import (
    generate_embedding,
    chat_completion,
    gemini_chat_completion,
    chunk_text,
    build_rag_prompt,
    build_summarize_prompt,
)
from supabase import create_client

router = APIRouter()


def get_supabase():
    """Get Supabase client."""
    settings = get_settings()
    return create_client(settings.supabase_url, settings.supabase_key)


async def search_similar_chunks(
    supabase,
    query: str,
    resource_ids: Optional[List[str]] = None,
    limit: int = 10,
    threshold: float = 0.5,
) -> List[dict]:
    """Search for similar chunks using pgvector."""
    # Generate query embedding
    query_embedding = await generate_embedding(query)

    # Call match_embeddings RPC function
    result = supabase.rpc(
        "match_embeddings",
        {
            "query_embedding": query_embedding,
            "match_threshold": threshold,
            "match_count": limit,
            "filter_resource_ids": resource_ids,
        }
    ).execute()

    chunks = result.data or []

    # Get resource details
    if chunks:
        resource_ids_from_chunks = list(set(c["resource_id"] for c in chunks))

        resources_result = supabase.table("lr_resources").select(
            "id, title, url"
        ).in_("id", resource_ids_from_chunks).execute()

        resource_map = {r["id"]: r for r in (resources_result.data or [])}

        for chunk in chunks:
            resource = resource_map.get(chunk["resource_id"], {})
            chunk["resource_title"] = resource.get("title")
            chunk["resource_url"] = resource.get("url")

    return chunks


async def get_resource_content(
    supabase,
    resource_ids: List[str]
) -> List[dict]:
    """Get full content for resources."""
    result = supabase.table("lr_resources").select(
        "id, title, content, description, url"
    ).in_("id", resource_ids).execute()

    return [
        {
            "id": r["id"],
            "title": r["title"],
            "content": r.get("content") or r.get("description") or "",
            "url": r["url"],
        }
        for r in (result.data or [])
    ]


@router.post("", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """
    Chat/Q&A/Summarize with RAG support.

    Modes:
    - chat/qa: Answer questions using vector search for context
    - summarize: Summarize specified resources

    Providers:
    - pgvector: Use OpenAI with vector search
    - gemini: Use Google Gemini with full context
    """
    try:
        settings = get_settings()
        supabase = get_supabase()

        # Validate request
        if request.mode != ChatMode.SUMMARIZE and not request.message:
            return ChatResponse(
                success=False,
                mode=request.mode.value,
                provider=request.provider.value,
                model="",
                error="Message is required for chat/qa modes"
            )

        if request.mode == ChatMode.SUMMARIZE and not request.resource_ids:
            return ChatResponse(
                success=False,
                mode=request.mode.value,
                provider=request.provider.value,
                model="",
                error="resource_ids required for summarize mode"
            )

        response_text = ""
        sources: List[SourceChunk] = []
        model = request.model

        # pgvector RAG approach
        if request.provider == ChatProvider.PGVECTOR:
            if not settings.openai_api_key:
                return ChatResponse(
                    success=False,
                    mode=request.mode.value,
                    provider=request.provider.value,
                    model="",
                    error="OpenAI API key not configured"
                )

            model = model or "gpt-4o-mini"

            if request.mode == ChatMode.SUMMARIZE:
                # Get content for summarization
                resources = await get_resource_content(supabase, request.resource_ids or [])

                if not resources:
                    return ChatResponse(
                        success=False,
                        mode=request.mode.value,
                        provider=request.provider.value,
                        model=model,
                        error="No resources found or no content available"
                    )

                # Create chunks from resources
                chunks = []
                for r in resources:
                    text_chunks = chunk_text(r["content"], 2000, 100)
                    for text in text_chunks[:5]:
                        chunks.append({"text": text, "source": r["title"]})

                prompt = build_summarize_prompt(chunks, request.summary_style.value)
                response_text = await chat_completion(
                    [{"role": "user", "content": prompt}],
                    model=model,
                    temperature=request.temperature
                )

            else:
                # Q&A or chat mode - use vector search
                search_results = await search_similar_chunks(
                    supabase,
                    request.message or "",
                    request.resource_ids,
                    10,
                    0.5
                )

                # Fallback if no matches
                if not search_results and request.resource_ids:
                    resources = await get_resource_content(supabase, request.resource_ids)
                    for r_idx, r in enumerate(resources):
                        chunks = chunk_text(r["content"], 1000, 100)[:3]
                        for idx, text in enumerate(chunks):
                            search_results.append({
                                "resource_id": r["id"],
                                "chunk_index": idx,
                                "chunk_text": text,
                                "similarity": 0.5,
                                "resource_title": r["title"],
                                "resource_url": r["url"],
                            })

                # Build sources
                sources = [
                    SourceChunk(
                        resource_id=s["resource_id"],
                        title=s.get("resource_title"),
                        url=s.get("resource_url"),
                        snippet=s["chunk_text"][:200] + "...",
                        similarity=s["similarity"],
                    )
                    for s in search_results
                ]

                prompt = build_rag_prompt(
                    request.message or "",
                    [{"text": s["chunk_text"], "source": s.get("resource_title", "Unknown")}
                     for s in search_results]
                )

                response_text = await chat_completion(
                    [{"role": "user", "content": prompt}],
                    model=model,
                    temperature=request.temperature
                )

        # Gemini approach
        elif request.provider == ChatProvider.GEMINI:
            if not settings.gemini_api_key:
                return ChatResponse(
                    success=False,
                    mode=request.mode.value,
                    provider=request.provider.value,
                    model="",
                    error="Gemini API key not configured"
                )

            model = model or "gemini-2.0-flash-exp"
            resources = await get_resource_content(supabase, request.resource_ids or [])

            if request.mode == ChatMode.SUMMARIZE:
                context = "\n\n---\n\n".join([
                    f"## {r['title']}\n\n{r['content']}"
                    for r in resources
                ])

                prompt = f"""Summarize the following documents. Style: {request.summary_style.value}.

{context}

Provide a comprehensive summary that:
- Identifies key legal concepts and arguments
- Notes important dates, parties, and case citations
- Organizes information logically"""

                response_text = await gemini_chat_completion(prompt, model=model, temperature=request.temperature)

            else:
                # Q&A mode
                context = "\n\n---\n\n".join([
                    f"## {r['title']} ({r['url']})\n\n{r['content']}"
                    for r in resources
                ])

                prompt = f"""You are a legal research assistant. Answer the following question based on the provided documents.

Question: {request.message}

Instructions:
- Base your answer on the provided documents
- Cite document titles when referencing specific information
- If the answer cannot be found in the documents, say so clearly"""

                response_text = await gemini_chat_completion(prompt, context, model=model, temperature=request.temperature)

                # Create pseudo-sources
                sources = [
                    SourceChunk(
                        resource_id=r["id"],
                        title=r["title"],
                        url=r["url"],
                        snippet=r["content"][:200] + "...",
                        similarity=1.0,
                    )
                    for r in resources
                ]

        # Save to chat history if session provided
        if request.session_id:
            # Save user message
            supabase.table("lr_chat_messages").insert({
                "session_id": request.session_id,
                "role": "user",
                "content": request.message or "[Summarize request]",
            }).execute()

            # Save assistant response
            supabase.table("lr_chat_messages").insert({
                "session_id": request.session_id,
                "role": "assistant",
                "content": response_text,
                "sources": [
                    {
                        "resource_id": s.resource_id,
                        "title": s.title,
                        "similarity": s.similarity,
                    }
                    for s in sources
                ],
            }).execute()

        return ChatResponse(
            success=True,
            response=response_text,
            sources=sources,
            mode=request.mode.value,
            provider=request.provider.value,
            model=model or "",
        )

    except Exception as e:
        return ChatResponse(
            success=False,
            mode=request.mode.value if hasattr(request, 'mode') else "qa",
            provider=request.provider.value if hasattr(request, 'provider') else "pgvector",
            model="",
            error=f"Chat failed: {str(e)}"
        )


@router.get("", response_model=ChatHistoryResponse)
async def get_chat_history(session_id: Optional[str] = Query(None)):
    """Get chat sessions or messages for a specific session."""
    try:
        supabase = get_supabase()

        if session_id:
            # Get specific session
            session_result = supabase.table("lr_chat_sessions").select(
                "*"
            ).eq("id", session_id).single().execute()

            messages_result = supabase.table("lr_chat_messages").select(
                "*"
            ).eq("session_id", session_id).order("created_at").execute()

            return ChatHistoryResponse(
                session=session_result.data if session_result.data else None,
                messages=messages_result.data or [],
            )

        # Get all sessions
        sessions_result = supabase.table("lr_chat_sessions").select(
            "*"
        ).order("updated_at", desc=True).limit(50).execute()

        return ChatHistoryResponse(
            sessions=sessions_result.data or [],
            messages=[],
        )

    except Exception as e:
        return ChatHistoryResponse(
            messages=[],
        )
