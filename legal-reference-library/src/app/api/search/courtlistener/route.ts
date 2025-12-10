import { NextRequest, NextResponse } from 'next/server'
import { SearchResult, SourceType, CourtListenerSearchType } from '@/types'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      query,
      category,
      limit = 10,
      court,           // Court filter (e.g., 'scotus', 'ca9')
      searchType = CourtListenerSearchType.OPINIONS,  // 'o', 'r', or 'oa'
      dateFrom,        // Filed after date (YYYY-MM-DD)
      dateTo,          // Filed before date (YYYY-MM-DD)
    } = body
    const maxResults = Math.min(limit, 50)

    if (!query) {
      return NextResponse.json(
        { error: 'Query parameter is required' },
        { status: 400 }
      )
    }

    // Build search query
    const searchQuery = category ? `${query} ${category}` : query

    // Call CourtListener API v4 (free, no API key required)
    const url = new URL('https://www.courtlistener.com/api/rest/v4/search/')
    url.searchParams.append('q', searchQuery)
    url.searchParams.append('type', searchType)
    url.searchParams.append('order_by', 'score desc')
    url.searchParams.append('page_size', String(maxResults))

    // Add court filter if specified
    if (court && court !== 'all') {
      url.searchParams.append('court', court)
    }

    // Add date filters if specified
    if (dateFrom) {
      url.searchParams.append('filed_after', dateFrom)
    }
    if (dateTo) {
      url.searchParams.append('filed_before', dateTo)
    }

    // Build headers - add auth token if available
    const headers: Record<string, string> = {
      'User-Agent': 'LegalReferenceLibrary/1.0',
    }

    const apiToken = process.env.COURTLISTENER_API_TOKEN
    if (apiToken) {
      headers['Authorization'] = `Token ${apiToken}`
    }

    const response = await fetch(url.toString(), { headers })

    if (!response.ok) {
      const error = await response.text()
      return NextResponse.json(
        { error: 'CourtListener API error', details: error },
        { status: response.status }
      )
    }

    const data = await response.json()

    // Transform results to our SearchResult format (v4 API uses camelCase)
    const results: SearchResult[] = (data.results || []).map((item: any) => {
      // v4 API: snippet is in opinions array, or use caseName as fallback
      const opinionSnippet = item.opinions?.[0]?.snippet || ''

      // Build snippet with case details (without docket/date since we show them separately)
      let snippet = opinionSnippet
      if (item.court) {
        snippet = `${item.court}. ${snippet}`
      }

      return {
        title: item.caseName || item.caseNameShort || 'Unknown Case',
        url: `https://www.courtlistener.com${item.absolute_url}`,
        snippet: snippet.slice(0, 300) + (snippet.length > 300 ? '...' : ''),
        source_type: SourceType.DOCUMENT,
        thumbnail: undefined,
        metadata: {
          docketNumber: item.docketNumber || undefined,
          dateFiled: item.dateFiled || undefined,
          court: item.court || undefined,
        },
      }
    })

    return NextResponse.json({
      results,
      count: results.length,
      total: data.count,
      query: searchQuery,
    })
  } catch (error) {
    console.error('CourtListener API error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    )
  }
}
