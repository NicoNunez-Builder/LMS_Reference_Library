import { NextRequest, NextResponse } from 'next/server'
import { SearchResult, SourceType } from '@/types'

// Library of Congress API response types
interface LOCResult {
  id: string
  title: string
  description?: string[]
  date?: string
  contributor?: string[]
  subject?: string[]
  url: string
  image_url?: string[]
  mime_type?: string[]
  original_format?: string[]
  digitized?: boolean
  online_format?: string[]
  access_restricted?: boolean
}

interface LOCSearchResponse {
  results: LOCResult[]
  pagination: {
    total: number
    from: number
    to: number
    perpage: number
  }
}

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

    // Build search query - add legal terms for relevance
    const searchQuery = category ? `${query} ${category}` : query

    // Call Library of Congress Search API (no API key required)
    const url = new URL('https://www.loc.gov/search/')
    url.searchParams.append('fo', 'json')
    url.searchParams.append('q', searchQuery)
    url.searchParams.append('c', String(maxResults))
    // Focus on collections with legal content
    url.searchParams.append('fa', 'online-format:pdf|online-format:online text')

    const response = await fetch(url.toString(), {
      headers: {
        'User-Agent': 'LegalReferenceLibrary/1.0',
        'Accept': 'application/json',
      },
    })

    if (!response.ok) {
      console.error('LOC API error:', response.status, response.statusText)
      return NextResponse.json(
        { error: 'Library of Congress API error' },
        { status: response.status }
      )
    }

    const data: LOCSearchResponse = await response.json()

    // Transform results to our SearchResult format
    const results: SearchResult[] = (data.results || []).map((item) => {
      // Build description
      let snippet = ''
      if (item.description && item.description.length > 0) {
        snippet = item.description[0]
      }
      if (item.contributor && item.contributor.length > 0) {
        snippet += snippet ? ` By: ${item.contributor.join(', ')}.` : `By: ${item.contributor.join(', ')}.`
      }
      if (item.date) {
        snippet += ` Date: ${item.date}.`
      }
      if (item.subject && item.subject.length > 0) {
        snippet += ` Subjects: ${item.subject.slice(0, 3).join(', ')}.`
      }

      // Truncate snippet if too long
      if (snippet.length > 300) {
        snippet = snippet.substring(0, 297) + '...'
      }

      // Determine source type based on format
      let sourceType = SourceType.DOCUMENT
      if (item.online_format) {
        const formats = item.online_format.join(' ').toLowerCase()
        if (formats.includes('pdf')) sourceType = SourceType.PDF
        else if (formats.includes('video') || formats.includes('film')) sourceType = SourceType.VIDEO
        else if (formats.includes('audio')) sourceType = SourceType.ARTICLE
      }

      // Get thumbnail
      const thumbnail = item.image_url && item.image_url.length > 0
        ? item.image_url[0]
        : undefined

      return {
        title: item.title || 'Untitled',
        url: item.url || `https://www.loc.gov/item/${item.id}`,
        snippet: snippet || 'No description available',
        source_type: sourceType,
        thumbnail,
      }
    })

    return NextResponse.json({
      results,
      count: results.length,
      total: data.pagination?.total || results.length,
      query: searchQuery,
    })
  } catch (error) {
    console.error('Library of Congress API error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    )
  }
}
