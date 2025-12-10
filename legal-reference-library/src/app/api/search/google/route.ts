import { NextRequest, NextResponse } from 'next/server'
import { GoogleSearchResponse, SearchResult, SourceType, FileTypeFilter } from '@/types'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { query, category, fileType, limit = 10 } = body

    if (!query) {
      return NextResponse.json(
        { error: 'Query parameter is required' },
        { status: 400 }
      )
    }

    const apiKey = process.env.GOOGLE_API_KEY
    const searchEngineId = process.env.GOOGLE_SEARCH_ENGINE_ID

    if (!apiKey || !searchEngineId) {
      return NextResponse.json(
        { error: 'Google API credentials not configured' },
        { status: 500 }
      )
    }

    // Build search query with category and file type filters
    let searchQuery = category ? `${query} ${category}` : query

    // Add file type filter to query
    if (fileType && fileType !== FileTypeFilter.ALL) {
      switch (fileType) {
        case FileTypeFilter.PDF:
          searchQuery += ' filetype:pdf'
          break
        case FileTypeFilter.DOC:
          searchQuery += ' (filetype:doc OR filetype:docx)'
          break
        case FileTypeFilter.EBOOK:
          searchQuery += ' (filetype:epub OR filetype:mobi OR filetype:pdf ebook)'
          break
      }
    }

    // Call Google Custom Search API
    // Note: Google Custom Search API max is 10 per request, need multiple requests for more
    const maxPerRequest = 10
    const totalLimit = Math.min(limit, 50)
    const url = new URL('https://www.googleapis.com/customsearch/v1')
    url.searchParams.append('key', apiKey)
    url.searchParams.append('cx', searchEngineId)
    url.searchParams.append('q', searchQuery)
    url.searchParams.append('num', String(Math.min(totalLimit, maxPerRequest)))

    const response = await fetch(url.toString())

    if (!response.ok) {
      const error = await response.json()
      return NextResponse.json(
        { error: 'Google Search API error', details: error },
        { status: response.status }
      )
    }

    const data: GoogleSearchResponse = await response.json()

    // Transform results to our SearchResult format
    const results: SearchResult[] = (data.items || []).map((item) => ({
      title: item.title,
      url: item.link,
      snippet: item.snippet,
      source_type: detectSourceType(item.link),
      thumbnail: item.pagemap?.cse_thumbnail?.[0]?.src,
    }))

    return NextResponse.json({
      results,
      count: results.length,
      query: searchQuery,
    })
  } catch (error) {
    console.error('Google Search API error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    )
  }
}

// Helper function to detect source type from URL
function detectSourceType(url: string): SourceType {
  const lowerUrl = url.toLowerCase()
  if (lowerUrl.endsWith('.pdf')) return SourceType.PDF
  if (lowerUrl.endsWith('.doc') || lowerUrl.endsWith('.docx')) return SourceType.DOCUMENT
  if (lowerUrl.endsWith('.epub') || lowerUrl.endsWith('.mobi')) return SourceType.EBOOK
  return SourceType.WEBSITE
}
