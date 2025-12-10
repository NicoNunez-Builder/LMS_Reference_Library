import { NextRequest, NextResponse } from 'next/server'
import { OpenLibrarySearchResponse, SearchResult, SourceType } from '@/types'

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

    // Build search query - add law subject for relevance
    const searchQuery = category ? `${query} ${category}` : `${query} law`

    // Call Open Library Search API (no API key required)
    const url = new URL('https://openlibrary.org/search.json')
    url.searchParams.append('q', searchQuery)
    url.searchParams.append('limit', String(maxResults))
    url.searchParams.append('fields', 'key,title,author_name,first_publish_year,publisher,subject,cover_i,isbn,ebook_access')

    const response = await fetch(url.toString(), {
      headers: {
        'User-Agent': 'LegalReferenceLibrary/1.0',
      },
    })

    if (!response.ok) {
      return NextResponse.json(
        { error: 'Open Library API error' },
        { status: response.status }
      )
    }

    const data: OpenLibrarySearchResponse = await response.json()

    // Transform results to our SearchResult format
    const results: SearchResult[] = data.docs.map((doc) => {
      // Build description
      let snippet = ''
      if (doc.author_name) {
        snippet = `By ${doc.author_name.join(', ')}.`
      }
      if (doc.first_publish_year) {
        snippet += ` First published: ${doc.first_publish_year}.`
      }
      if (doc.publisher) {
        snippet += ` Publisher: ${doc.publisher[0]}.`
      }
      if (doc.subject) {
        snippet += ` Subjects: ${doc.subject.slice(0, 3).join(', ')}.`
      }

      // Build URL to Open Library
      const bookUrl = `https://openlibrary.org${doc.key}`

      // Build thumbnail URL
      const thumbnail = doc.cover_i
        ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg`
        : undefined

      return {
        title: doc.title,
        url: bookUrl,
        snippet: snippet || 'No description available',
        source_type: doc.ebook_access === 'borrowable' || doc.ebook_access === 'public'
          ? SourceType.EBOOK
          : SourceType.DOCUMENT,
        thumbnail,
      }
    })

    return NextResponse.json({
      results,
      count: results.length,
      query: searchQuery,
    })
  } catch (error) {
    console.error('Open Library API error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    )
  }
}
