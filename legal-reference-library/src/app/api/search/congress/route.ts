import { NextRequest, NextResponse } from 'next/server'
import { SearchResult, SourceType } from '@/types'

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

    const apiKey = process.env.CONGRESS_API_KEY

    // Build search query
    const searchQuery = category ? `${query} ${category}` : query

    // Call Congress.gov API
    const url = new URL('https://api.congress.gov/v3/bill')
    url.searchParams.append('q', searchQuery)
    url.searchParams.append('limit', String(maxResults))
    url.searchParams.append('format', 'json')

    if (apiKey) {
      url.searchParams.append('api_key', apiKey)
    }

    const response = await fetch(url.toString(), {
      headers: {
        'User-Agent': 'LegalReferenceLibrary/1.0',
      },
    })

    if (!response.ok) {
      // If API key is missing or invalid, return helpful error
      if (response.status === 403 || response.status === 401) {
        return NextResponse.json({
          results: [],
          count: 0,
          query: searchQuery,
          error: 'Congress.gov API key required. Get one free at api.congress.gov',
        })
      }
      const error = await response.text()
      return NextResponse.json(
        { error: 'Congress.gov API error', details: error },
        { status: response.status }
      )
    }

    const data = await response.json()

    // Transform results to our SearchResult format
    const results: SearchResult[] = (data.bills || []).map((item: any) => {
      // Build snippet with bill details
      let snippet = item.title || ''
      if (item.latestAction) {
        snippet += ` Latest action (${item.latestAction.actionDate}): ${item.latestAction.text}`
      }
      if (item.sponsors && item.sponsors.length > 0) {
        const sponsor = item.sponsors[0]
        snippet += ` Sponsor: ${sponsor.name} (${sponsor.party}-${sponsor.state})`
      }

      const billId = `${item.type?.toLowerCase() || 'bill'}${item.number}`
      const congressNum = item.congress || '118'

      return {
        title: `${item.type || 'Bill'} ${item.number}: ${item.title || 'Untitled'}`,
        url: `https://www.congress.gov/bill/${congressNum}th-congress/${item.type?.toLowerCase() || 'house-bill'}/${item.number}`,
        snippet: snippet.slice(0, 300) + (snippet.length > 300 ? '...' : ''),
        source_type: SourceType.DOCUMENT,
        thumbnail: undefined,
      }
    })

    return NextResponse.json({
      results,
      count: results.length,
      total: data.pagination?.count || results.length,
      query: searchQuery,
    })
  } catch (error) {
    console.error('Congress.gov API error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    )
  }
}
