import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  generateEmbedding,
  chatCompletion,
  geminiChatCompletion,
  buildRAGPrompt,
  buildSummarizePrompt,
  chunkText,
  gemini,
} from '@/lib/ai'

// Initialize Supabase client
function getSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase not configured')
  }

  return createClient(supabaseUrl, supabaseKey)
}

interface ChatRequest {
  message: string
  mode: 'chat' | 'qa' | 'summarize'
  provider: 'pgvector' | 'gemini'
  resource_ids?: string[]
  session_id?: string
  model?: string
  temperature?: number
  summary_style?: 'brief' | 'detailed' | 'bullet'
}

interface SourceChunk {
  id: string
  resource_id: string
  chunk_index: number
  chunk_text: string
  similarity: number
  resource_title?: string
  resource_url?: string
}

// Search for similar chunks using pgvector
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function searchSimilarChunks(
  supabase: any,
  query: string,
  resourceIds?: string[],
  limit = 10,
  threshold = 0.5
): Promise<SourceChunk[]> {
  // Generate query embedding
  const queryEmbedding = await generateEmbedding(query)

  // Call the match_embeddings function
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc('match_embeddings', {
    query_embedding: queryEmbedding,
    match_threshold: threshold,
    match_count: limit,
    filter_resource_ids: resourceIds || null,
  })

  if (error) {
    console.error('Vector search error:', error)
    throw error
  }

  // Get resource details for the chunks
  if (data && data.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const resourceIdsFromChunks = [...new Set(data.map((d: any) => d.resource_id))]

    const { data: resources } = await supabase
      .from('lr_resources')
      .select('id, title, url')
      .in('id', resourceIdsFromChunks as string[])

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const resourceMap = new Map<string, any>(resources?.map((r: any) => [r.id, r]) || [])

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return data.map((chunk: any) => ({
      ...chunk,
      resource_title: resourceMap.get(chunk.resource_id)?.title,
      resource_url: resourceMap.get(chunk.resource_id)?.url,
    }))
  }

  return []
}

// Get full content for resources (for Gemini direct processing)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getResourceContent(
  supabase: any,
  resourceIds: string[]
): Promise<{ id: string; title: string; content: string; url: string }[]> {
  const { data, error } = await supabase
    .from('lr_resources')
    .select('id, title, content, description, url')
    .in('id', resourceIds)

  if (error) throw error

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data || []).map((r: any) => ({
    id: r.id,
    title: r.title,
    content: r.content || r.description || '',
    url: r.url,
  }))
}

// POST - Chat/Q&A/Summarize
export async function POST(request: NextRequest) {
  try {
    const body: ChatRequest = await request.json()
    const {
      message,
      mode = 'qa',
      provider = 'pgvector',
      resource_ids,
      session_id,
      model,
      temperature = 0.7,
      summary_style = 'detailed',
    } = body

    if (!message && mode !== 'summarize') {
      return NextResponse.json(
        { error: 'Message is required for chat/qa modes' },
        { status: 400 }
      )
    }

    if (mode === 'summarize' && (!resource_ids || resource_ids.length === 0)) {
      return NextResponse.json(
        { error: 'resource_ids required for summarize mode' },
        { status: 400 }
      )
    }

    const supabase = getSupabase()
    let response: string
    let sources: SourceChunk[] = []

    // pgvector RAG approach
    if (provider === 'pgvector') {
      if (mode === 'summarize') {
        // Get content directly for summarization
        const resources = await getResourceContent(supabase, resource_ids || [])

        if (resources.length === 0) {
          return NextResponse.json(
            { error: 'No resources found or no content available' },
            { status: 400 }
          )
        }

        // For summarization, use chunks from each resource
        const chunks = resources.flatMap(r => {
          const textChunks = chunkText(r.content, 2000, 100)
          return textChunks.slice(0, 5).map(text => ({
            text,
            source: r.title,
          }))
        })

        const prompt = buildSummarizePrompt(chunks, summary_style)

        response = await chatCompletion(
          [{ role: 'user', content: prompt }],
          { model: model || 'gpt-4o-mini', temperature }
        )
      } else {
        // Q&A or chat mode - use vector search
        sources = await searchSimilarChunks(
          supabase,
          message,
          resource_ids,
          10,
          0.5
        )

        if (sources.length === 0 && resource_ids && resource_ids.length > 0) {
          // Fallback: get first chunks from resources if no matches
          const resources = await getResourceContent(supabase, resource_ids)

          sources = resources.flatMap((r, rIdx) => {
            const chunks = chunkText(r.content, 1000, 100).slice(0, 3)
            return chunks.map((text, idx) => ({
              id: `fallback-${rIdx}-${idx}`,
              resource_id: r.id,
              chunk_index: idx,
              chunk_text: text,
              similarity: 0.5,
              resource_title: r.title,
              resource_url: r.url,
            }))
          })
        }

        const prompt = buildRAGPrompt(
          message,
          sources.map(s => ({
            text: s.chunk_text,
            source: s.resource_title || 'Unknown',
          }))
        )

        response = await chatCompletion(
          [{ role: 'user', content: prompt }],
          { model: model || 'gpt-4o-mini', temperature }
        )
      }
    }
    // Gemini direct approach
    else if (provider === 'gemini') {
      const resources = await getResourceContent(supabase, resource_ids || [])

      if (mode === 'summarize') {
        // Build context from all resources
        const context = resources
          .map(r => `## ${r.title}\n\n${r.content}`)
          .join('\n\n---\n\n')

        const summaryPrompt = `Please summarize the following documents. Style: ${summary_style}.

${context}

Provide a comprehensive summary that:
- Identifies key legal concepts and arguments
- Notes important dates, parties, and case citations
- Organizes information logically`

        response = await geminiChatCompletion(
          summaryPrompt,
          undefined,
          { model: model || 'gemini-2.0-flash-exp', temperature }
        )
      } else {
        // Q&A mode with full context
        const context = resources
          .map(r => `## ${r.title} (${r.url})\n\n${r.content}`)
          .join('\n\n---\n\n')

        const qaPrompt = `You are a legal research assistant. Answer the following question based on the provided documents.

Question: ${message}

Instructions:
- Base your answer on the provided documents
- Cite document titles when referencing specific information
- If the answer cannot be found in the documents, say so clearly`

        response = await geminiChatCompletion(
          qaPrompt,
          context,
          { model: model || 'gemini-2.0-flash-exp', temperature }
        )

        // Create pseudo-sources for reference
        sources = resources.map((r, idx) => ({
          id: `gemini-${idx}`,
          resource_id: r.id,
          chunk_index: 0,
          chunk_text: r.content.slice(0, 500) + '...',
          similarity: 1,
          resource_title: r.title,
          resource_url: r.url,
        }))
      }
    } else {
      return NextResponse.json(
        { error: 'Invalid provider. Use "pgvector" or "gemini"' },
        { status: 400 }
      )
    }

    // Save message to session if provided
    if (session_id) {
      // Save user message
      await supabase.from('lr_chat_messages').insert({
        session_id,
        role: 'user',
        content: message || `[Summarize request]`,
      })

      // Save assistant response
      await supabase.from('lr_chat_messages').insert({
        session_id,
        role: 'assistant',
        content: response,
        sources: sources.map(s => ({
          resource_id: s.resource_id,
          chunk_index: s.chunk_index,
          title: s.resource_title,
          similarity: s.similarity,
        })),
      })
    }

    return NextResponse.json({
      success: true,
      response,
      sources: sources.map(s => ({
        resource_id: s.resource_id,
        title: s.resource_title,
        url: s.resource_url,
        snippet: s.chunk_text.slice(0, 200) + '...',
        similarity: s.similarity,
      })),
      mode,
      provider,
      model: model || (provider === 'pgvector' ? 'gpt-4o-mini' : 'gemini-2.0-flash-exp'),
    })
  } catch (error) {
    console.error('Chat error:', error)
    return NextResponse.json(
      { error: 'Failed to process request', details: String(error) },
      { status: 500 }
    )
  }
}

// GET - Get chat sessions and messages
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const sessionId = searchParams.get('session_id')

    const supabase = getSupabase()

    if (sessionId) {
      // Get messages for a specific session
      const { data: session } = await supabase
        .from('lr_chat_sessions')
        .select('*')
        .eq('id', sessionId)
        .single()

      const { data: messages } = await supabase
        .from('lr_chat_messages')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true })

      return NextResponse.json({
        session,
        messages: messages || [],
      })
    }

    // Get all sessions
    const { data: sessions } = await supabase
      .from('lr_chat_sessions')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(50)

    return NextResponse.json({
      sessions: sessions || [],
    })
  } catch (error) {
    console.error('Get chat error:', error)
    return NextResponse.json(
      { error: 'Failed to get chat data', details: String(error) },
      { status: 500 }
    )
  }
}
