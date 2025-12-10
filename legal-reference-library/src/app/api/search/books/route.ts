import { NextRequest, NextResponse } from 'next/server'
import { GoogleBooksResponse, SearchResult, SourceType } from '@/types'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { query, category, limit = 10 } = body
    const maxResults = Math.min(limit, 40) // Google Books API max is 40

    if (!query) {
      return NextResponse.json(
        { error: 'Query parameter is required' },
        { status: 400 }
      )
    }

    // Build search query - add "law" or category to refine results
    let searchQuery = category ? `${query} ${category}` : `${query} law`

    // Call Google Books API (no API key required for basic searches)
    const url = new URL('https://www.googleapis.com/books/v1/volumes')
    url.searchParams.append('q', searchQuery)
    url.searchParams.append('maxResults', String(maxResults))
    url.searchParams.append('printType', 'books')

    // Add API key if available for higher quota
    const apiKey = process.env.GOOGLE_API_KEY
    if (apiKey) {
      url.searchParams.append('key', apiKey)
    }

    const response = await fetch(url.toString())

    if (!response.ok) {
      const error = await response.json()
      return NextResponse.json(
        { error: 'Google Books API error', details: error },
        { status: response.status }
      )
    }

    const data: GoogleBooksResponse = await response.json()

    // Transform results to our SearchResult format
    const results: SearchResult[] = (data.items || []).map((item) => {
      const volumeInfo = item.volumeInfo
      const accessInfo = item.accessInfo

      // Build description with author and publisher info
      let snippet = volumeInfo.description || ''
      if (volumeInfo.authors) {
        snippet = `By ${volumeInfo.authors.join(', ')}. ${snippet}`
      }
      if (volumeInfo.publisher && volumeInfo.publishedDate) {
        snippet += ` (${volumeInfo.publisher}, ${volumeInfo.publishedDate})`
      }

      return {
        title: volumeInfo.title,
        url: volumeInfo.infoLink || volumeInfo.previewLink || '',
        snippet: snippet.slice(0, 300) + (snippet.length > 300 ? '...' : ''),
        source_type: accessInfo?.epub?.isAvailable || accessInfo?.pdf?.isAvailable
          ? SourceType.EBOOK
          : SourceType.DOCUMENT,
        thumbnail: volumeInfo.imageLinks?.thumbnail || volumeInfo.imageLinks?.smallThumbnail,
      }
    })

    return NextResponse.json({
      results,
      count: results.length,
      query: searchQuery,
    })
  } catch (error) {
    console.error('Google Books API error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    )
  }
}
