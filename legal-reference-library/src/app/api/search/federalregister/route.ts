import { NextRequest, NextResponse } from 'next/server'
import { FederalRegisterSearchResponse, SearchResult, SourceType } from '@/types'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { query, category, limit = 10 } = body
    const maxResults = Math.min(limit, 50)

    if (!query) {
      return NextResponse.json(
        { error: 'Query parameter is required' },
        { status: 400 }
      )
    }

    // Build search query
    const searchQuery = category ? `${query} ${category}` : query

    // Call Federal Register API (free, no API key required)
    const url = new URL('https://www.federalregister.gov/api/v1/documents.json')
    url.searchParams.append('conditions[term]', searchQuery)
    url.searchParams.append('per_page', String(maxResults))
    url.searchParams.append('order', 'relevance')

    const response = await fetch(url.toString(), {
      headers: {
        'User-Agent': 'LegalReferenceLibrary/1.0',
      },
    })

    if (!response.ok) {
      const error = await response.text()
      return NextResponse.json(
        { error: 'Federal Register API error', details: error },
        { status: response.status }
      )
    }

    const data: FederalRegisterSearchResponse = await response.json()

    // Transform results to our SearchResult format
    const results: SearchResult[] = (data.results || []).map((item) => {
      // Build snippet with document details
      let snippet = item.abstract || item.title || ''
      if (item.agencies && item.agencies.length > 0) {
        snippet = `Agency: ${item.agencies.map(a => a.name).join(', ')}. ${snippet}`
      }
      if (item.publication_date) {
        snippet = `Published: ${item.publication_date}. ${snippet}`
      }
      if (item.type) {
        snippet = `[${item.type}] ${snippet}`
      }

      return {
        title: item.title,
        url: item.html_url,
        snippet: snippet.slice(0, 300) + (snippet.length > 300 ? '...' : ''),
        source_type: item.pdf_url ? SourceType.PDF : SourceType.DOCUMENT,
        thumbnail: undefined,
      }
    })

    return NextResponse.json({
      results,
      count: results.length,
      total: data.count,
      query: searchQuery,
    })
  } catch (error) {
    console.error('Federal Register API error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    )
  }
}
