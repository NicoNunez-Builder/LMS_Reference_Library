import { NextRequest, NextResponse } from 'next/server'
import { SearchResult, SourceType } from '@/types'

// LOC format filters
export const LOC_FORMATS = {
  'online-text': 'Online Text',
  'pdf': 'PDF Documents',
  'image': 'Images',
  'audio': 'Audio',
  'video': 'Video/Film',
  'map': 'Maps',
  'manuscript': 'Manuscripts',
  'newspaper': 'Newspapers',
  'book': 'Books',
  'legislation': 'Legislation',
} as const

// Legal topic suggestions for guided search
export const LEGAL_TOPICS = [
  { id: 'constitutional-law', label: 'Constitutional Law', query: 'constitution constitutional law amendment' },
  { id: 'civil-rights', label: 'Civil Rights', query: 'civil rights discrimination equality' },
  { id: 'supreme-court', label: 'Supreme Court', query: 'supreme court judicial decisions' },
  { id: 'congressional-records', label: 'Congressional Records', query: 'congress congressional record legislation' },
  { id: 'federal-law', label: 'Federal Law & Regulations', query: 'federal law regulation statute code' },
  { id: 'treaties', label: 'Treaties & International Law', query: 'treaty international law agreement' },
  { id: 'presidential-papers', label: 'Presidential Papers', query: 'president presidential papers executive' },
  { id: 'historical-legal', label: 'Historical Legal Documents', query: 'historical legal founding documents' },
  { id: 'court-cases', label: 'Court Cases & Opinions', query: 'court case opinion ruling judicial' },
  { id: 'bills-acts', label: 'Bills & Acts', query: 'bill act legislation law passed' },
]

// LOC subject/collection filters for legal content
export const LEGAL_COLLECTIONS = [
  { id: 'century-of-lawmaking', name: 'A Century of Lawmaking for a New Nation', slug: 'century-of-lawmaking' },
  { id: 'continental-congress', name: 'Continental Congress and Constitutional Convention', slug: 'continental-congress-and-constitutional-convention' },
  { id: 'supreme-court', name: 'Supreme Court of the United States', slug: 'united-states-reports' },
  { id: 'thomas-jefferson', name: 'Thomas Jefferson Papers', slug: 'thomas-jefferson-papers' },
  { id: 'george-washington', name: 'George Washington Papers', slug: 'george-washington-papers' },
  { id: 'james-madison', name: 'James Madison Papers', slug: 'james-madison-papers' },
  { id: 'abraham-lincoln', name: 'Abraham Lincoln Papers', slug: 'abraham-lincoln-papers' },
  { id: 'federalist-papers', name: 'The Federalist Papers', slug: 'federalist-papers' },
]

interface LOCSearchResult {
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
  online_format?: string[]
  partof?: string[]
  location?: string[]
}

interface LOCSearchResponse {
  results: LOCSearchResult[]
  pagination: {
    total: number
    from: number
    to: number
    perpage: number
    next?: string
  }
  facets?: Record<string, Array<{ name: string; count: number }>>
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      query,
      limit = 20,
      page = 1,
      format,
      collection,
      dateFrom,
      dateTo,
      topic,
    } = body

    if (!query && !topic) {
      return NextResponse.json(
        { error: 'Query or topic parameter is required' },
        { status: 400 }
      )
    }

    const maxResults = Math.min(limit, 50)

    // Build search query
    let searchQuery = query || ''

    // If a predefined topic is selected, enhance the query
    if (topic) {
      const topicData = LEGAL_TOPICS.find((t) => t.id === topic)
      if (topicData) {
        searchQuery = searchQuery ? `${searchQuery} ${topicData.query}` : topicData.query
      }
    }

    // Build LOC API URL
    const url = new URL('https://www.loc.gov/search/')
    url.searchParams.append('fo', 'json')
    url.searchParams.append('q', searchQuery)
    url.searchParams.append('c', String(maxResults))
    url.searchParams.append('sp', String(page))

    // Add format filter
    if (format && format !== 'all') {
      url.searchParams.append('fa', `online-format:${format}`)
    }

    // Add collection filter
    if (collection) {
      const collectionData = LEGAL_COLLECTIONS.find((c) => c.id === collection)
      if (collectionData) {
        url.searchParams.append('fa', `partof:${collectionData.name}`)
      }
    }

    // Add date range filters
    if (dateFrom || dateTo) {
      const dateFilter = []
      if (dateFrom) dateFilter.push(`date:${dateFrom}`)
      if (dateTo) dateFilter.push(`to:${dateTo}`)
      // LOC uses date faceting
    }

    const response = await fetch(url.toString(), {
      headers: {
        'User-Agent': 'LegalReferenceLibrary/1.0',
        'Accept': 'application/json',
      },
    })

    if (!response.ok) {
      console.error('LOC Search API error:', response.status, response.statusText)
      return NextResponse.json(
        { error: 'Library of Congress API error' },
        { status: response.status }
      )
    }

    const data: LOCSearchResponse = await response.json()

    // Transform results
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
      if (item.partof && item.partof.length > 0) {
        snippet += ` Collection: ${item.partof[0]}.`
      }

      // Truncate snippet
      if (snippet.length > 400) {
        snippet = snippet.substring(0, 397) + '...'
      }

      // Determine source type
      let sourceType = SourceType.DOCUMENT
      if (item.online_format) {
        const formats = item.online_format.join(' ').toLowerCase()
        if (formats.includes('pdf')) sourceType = SourceType.PDF
        else if (formats.includes('video') || formats.includes('film')) sourceType = SourceType.VIDEO
        else if (formats.includes('audio')) sourceType = SourceType.ARTICLE
      }

      return {
        title: item.title || 'Untitled',
        url: item.url || `https://www.loc.gov/item/${item.id}`,
        snippet: snippet || 'No description available',
        source_type: sourceType,
        thumbnail: item.image_url?.[0],
        metadata: {
          date: item.date,
          subjects: item.subject,
          collection: item.partof?.[0],
          format: item.online_format,
          location: item.location,
        },
      }
    })

    // Extract facets for filtering UI
    const facets = data.facets || {}

    return NextResponse.json({
      results,
      count: results.length,
      total: data.pagination?.total || results.length,
      page,
      query: searchQuery,
      facets: {
        formats: facets['online_format'] || [],
        subjects: facets['subject'] || [],
        dates: facets['date'] || [],
        collections: facets['partof'] || [],
      },
    })
  } catch (error) {
    console.error('LOC Search API error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    )
  }
}

// GET endpoint for topic and format suggestions
export async function GET() {
  return NextResponse.json({
    topics: LEGAL_TOPICS,
    formats: LOC_FORMATS,
    collections: LEGAL_COLLECTIONS,
  })
}
