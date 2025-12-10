import { NextRequest, NextResponse } from 'next/server'

// Cache collections for 1 hour
let cachedCollections: LOCCollection[] | null = null
let cacheTime: number = 0
const CACHE_DURATION = 60 * 60 * 1000 // 1 hour

export interface LOCCollection {
  id: string
  title: string
  description: string
  url: string
  count: number
  image_url?: string
  subjects?: string[]
}

interface LOCCollectionResponse {
  results: Array<{
    id: string
    title: string
    description?: string
    url: string
    count?: number
    image_url?: string[]
    subject?: string[]
  }>
  pagination: {
    total: number
    from: number
    to: number
    perpage: number
    next?: string
  }
}

// Legal-relevant collection keywords for filtering
const LEGAL_KEYWORDS = [
  'law', 'legal', 'congress', 'legislation', 'court', 'constitution',
  'government', 'federal', 'supreme', 'judicial', 'statute', 'bill',
  'treaty', 'regulation', 'civil rights', 'rights', 'justice',
  'president', 'senate', 'house of representatives', 'amendment'
]

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const filter = searchParams.get('filter') // 'all', 'legal', or specific subject
    const search = searchParams.get('search')
    const format = searchParams.get('format') // 'manuscripts', 'books', etc.
    const page = parseInt(searchParams.get('page') || '1')
    const perPage = parseInt(searchParams.get('perPage') || '50')

    // Check cache
    const now = Date.now()
    if (!cachedCollections || now - cacheTime > CACHE_DURATION) {
      // Fetch all collections from LOC API
      const allCollections: LOCCollection[] = []
      let nextUrl: string | null = 'https://www.loc.gov/collections/?fo=json&c=100'

      while (nextUrl) {
        const response = await fetch(nextUrl, {
          headers: {
            'User-Agent': 'LegalReferenceLibrary/1.0',
            'Accept': 'application/json',
          },
        })

        if (!response.ok) {
          throw new Error(`LOC API error: ${response.status}`)
        }

        const data: LOCCollectionResponse = await response.json()

        for (const item of data.results) {
          allCollections.push({
            id: item.id,
            title: item.title,
            description: item.description || '',
            url: item.url,
            count: item.count || 0,
            image_url: item.image_url?.[0],
            subjects: item.subject || [],
          })
        }

        nextUrl = data.pagination.next || null

        // Safety limit - don't fetch more than 10 pages
        if (allCollections.length > 1000) break
      }

      cachedCollections = allCollections
      cacheTime = now
    }

    let collections = [...cachedCollections]

    // Filter by legal relevance
    if (filter === 'legal') {
      collections = collections.filter((col) => {
        const searchText = `${col.title} ${col.description} ${col.subjects?.join(' ')}`.toLowerCase()
        return LEGAL_KEYWORDS.some((keyword) => searchText.includes(keyword))
      })
    }

    // Search filter
    if (search) {
      const searchLower = search.toLowerCase()
      collections = collections.filter((col) => {
        const searchText = `${col.title} ${col.description} ${col.subjects?.join(' ')}`.toLowerCase()
        return searchText.includes(searchLower)
      })
    }

    // Format filter (based on subjects/description)
    if (format) {
      const formatLower = format.toLowerCase()
      collections = collections.filter((col) => {
        const searchText = `${col.title} ${col.description} ${col.subjects?.join(' ')}`.toLowerCase()
        return searchText.includes(formatLower)
      })
    }

    // Sort by item count (most items first)
    collections.sort((a, b) => b.count - a.count)

    // Paginate
    const total = collections.length
    const start = (page - 1) * perPage
    const end = start + perPage
    const paginatedCollections = collections.slice(start, end)

    return NextResponse.json({
      collections: paginatedCollections,
      pagination: {
        total,
        page,
        perPage,
        totalPages: Math.ceil(total / perPage),
      },
      legalCount: cachedCollections.filter((col) => {
        const searchText = `${col.title} ${col.description} ${col.subjects?.join(' ')}`.toLowerCase()
        return LEGAL_KEYWORDS.some((keyword) => searchText.includes(keyword))
      }).length,
      totalCount: cachedCollections.length,
    })
  } catch (error) {
    console.error('LOC Collections API error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch LOC collections', details: String(error) },
      { status: 500 }
    )
  }
}
