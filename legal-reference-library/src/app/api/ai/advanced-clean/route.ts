import { NextRequest, NextResponse } from 'next/server'
import { chatCompletion } from '@/lib/ai'

// Jina Reader API - Free tier available
async function cleanWithJina(url: string): Promise<{ text: string; title?: string }> {
  try {
    // Jina Reader API converts URLs to clean markdown
    const jinaUrl = `https://r.jina.ai/${url}`

    const response = await fetch(jinaUrl, {
      headers: {
        'Accept': 'text/plain',
      },
    })

    if (!response.ok) {
      throw new Error(`Jina API error: ${response.status}`)
    }

    const text = await response.text()

    // Extract title from the first line if it's a heading
    const lines = text.split('\n')
    let title: string | undefined
    if (lines[0]?.startsWith('# ')) {
      title = lines[0].replace(/^#\s*/, '')
    }

    return { text, title }
  } catch (error) {
    throw new Error(`Jina Reader failed: ${String(error)}`)
  }
}

// LLM-powered cleaning using OpenAI
async function cleanWithLLM(text: string, instructions?: string): Promise<string> {
  const defaultInstructions = `Clean and format the following text extracted from a document or web page.
Your task:
1. Remove any remaining HTML artifacts, navigation elements, or boilerplate text
2. Fix formatting issues (spacing, line breaks, etc.)
3. Preserve the main content structure (headings, lists, paragraphs)
4. Remove duplicate content
5. Clean up any encoding issues or special characters
6. Keep all substantive content - do not summarize or shorten

Return ONLY the cleaned text, no explanations.`

  const response = await chatCompletion([
    {
      role: 'system',
      content: instructions || defaultInstructions,
    },
    {
      role: 'user',
      content: text.slice(0, 100000), // Limit input size
    },
  ], {
    model: 'gpt-4o-mini',
    temperature: 0.1,
    maxTokens: 16000,
  })

  return response
}

// Readability-style extraction (server-side implementation)
function extractWithReadability(html: string): { text: string; title?: string } {
  // Remove script and style tags
  let cleaned = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')

  // Extract title
  const titleMatch = cleaned.match(/<title[^>]*>([^<]*)<\/title>/i)
  const title = titleMatch ? titleMatch[1].trim() : undefined

  // Remove header, footer, nav, aside elements (common boilerplate containers)
  cleaned = cleaned
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
    .replace(/<aside[^>]*>[\s\S]*?<\/aside>/gi, '')

  // Try to find main content areas
  let mainContent = cleaned

  // Look for article or main tags
  const articleMatch = cleaned.match(/<article[^>]*>([\s\S]*?)<\/article>/i)
  const mainMatch = cleaned.match(/<main[^>]*>([\s\S]*?)<\/main>/i)

  if (articleMatch) {
    mainContent = articleMatch[1]
  } else if (mainMatch) {
    mainContent = mainMatch[1]
  }

  // Convert common HTML to text
  let text = mainContent
    // Headings
    .replace(/<h1[^>]*>/gi, '\n\n# ')
    .replace(/<h2[^>]*>/gi, '\n\n## ')
    .replace(/<h3[^>]*>/gi, '\n\n### ')
    .replace(/<h4[^>]*>/gi, '\n\n#### ')
    .replace(/<\/h[1-6]>/gi, '\n')
    // Paragraphs and breaks
    .replace(/<p[^>]*>/gi, '\n\n')
    .replace(/<\/p>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<hr\s*\/?>/gi, '\n---\n')
    // Lists
    .replace(/<ul[^>]*>/gi, '\n')
    .replace(/<ol[^>]*>/gi, '\n')
    .replace(/<\/[uo]l>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<\/li>/gi, '')
    // Links - keep text, remove tags
    .replace(/<a[^>]*>([^<]*)<\/a>/gi, '$1')
    // Bold/italic
    .replace(/<(strong|b)[^>]*>/gi, '**')
    .replace(/<\/(strong|b)>/gi, '**')
    .replace(/<(em|i)[^>]*>/gi, '_')
    .replace(/<\/(em|i)>/gi, '_')
    // Remove remaining tags
    .replace(/<[^>]+>/g, '')
    // Decode entities
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&[a-z]+;/gi, '')
    // Clean up whitespace
    .replace(/\n{4,}/g, '\n\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim()

  return { text, title }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      method, // 'jina' | 'llm' | 'readability'
      text,
      url,
      html,
      instructions, // Custom instructions for LLM
    } = body

    if (!method) {
      return NextResponse.json(
        { error: 'Method required (jina, llm, or readability)' },
        { status: 400 }
      )
    }

    let result: { text: string; title?: string; method: string }

    switch (method) {
      case 'jina':
        if (!url) {
          return NextResponse.json(
            { error: 'URL required for Jina Reader' },
            { status: 400 }
          )
        }
        const jinaResult = await cleanWithJina(url)
        result = { ...jinaResult, method: 'jina' }
        break

      case 'llm':
        if (!text) {
          return NextResponse.json(
            { error: 'Text required for LLM cleaning' },
            { status: 400 }
          )
        }
        const llmResult = await cleanWithLLM(text, instructions)
        result = { text: llmResult, method: 'llm' }
        break

      case 'readability':
        if (!html && !text) {
          return NextResponse.json(
            { error: 'HTML or text required for Readability extraction' },
            { status: 400 }
          )
        }
        const readabilityResult = extractWithReadability(html || text)
        result = { ...readabilityResult, method: 'readability' }
        break

      default:
        return NextResponse.json(
          { error: `Unknown method: ${method}` },
          { status: 400 }
        )
    }

    // Calculate stats
    const stats = {
      charCount: result.text.length,
      wordCount: result.text.split(/\s+/).filter(w => w.length > 0).length,
      lineCount: result.text.split('\n').length,
    }

    return NextResponse.json({
      success: true,
      ...result,
      stats,
    })
  } catch (error) {
    console.error('Advanced clean error:', error)
    return NextResponse.json(
      { error: 'Advanced cleaning failed', details: String(error) },
      { status: 500 }
    )
  }
}
