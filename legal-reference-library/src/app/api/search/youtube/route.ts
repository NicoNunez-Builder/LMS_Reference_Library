import { NextRequest, NextResponse } from 'next/server'
import { YouTubeSearchResponse, SearchResult, SourceType } from '@/types'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { query, category, limit = 10 } = body
    const maxResults = Math.min(limit, 50) // YouTube API max is 50

    if (!query) {
      return NextResponse.json(
        { error: 'Query parameter is required' },
        { status: 400 }
      )
    }

    const apiKey = process.env.YOUTUBE_API_KEY

    if (!apiKey) {
      return NextResponse.json(
        { error: 'YouTube API key not configured' },
        { status: 500 }
      )
    }

    // Build search query with category filter
    const searchQuery = category ? `${query} ${category}` : query

    // Call YouTube Data API
    const url = new URL('https://www.googleapis.com/youtube/v3/search')
    url.searchParams.append('key', apiKey)
    url.searchParams.append('q', searchQuery)
    url.searchParams.append('part', 'snippet')
    url.searchParams.append('type', 'video')
    url.searchParams.append('maxResults', String(maxResults))
    url.searchParams.append('order', 'relevance')

    const response = await fetch(url.toString())

    if (!response.ok) {
      const error = await response.json()
      return NextResponse.json(
        { error: 'YouTube API error', details: error },
        { status: response.status }
      )
    }

    const data: YouTubeSearchResponse = await response.json()

    // Transform results to our SearchResult format
    const results: SearchResult[] = (data.items || []).map((item) => ({
      title: item.snippet.title,
      url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
      snippet: item.snippet.description,
      source_type: SourceType.VIDEO,
      thumbnail: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.medium?.url,
    }))

    return NextResponse.json({
      results,
      count: results.length,
      query: searchQuery,
    })
  } catch (error) {
    console.error('YouTube Search API error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    )
  }
}
