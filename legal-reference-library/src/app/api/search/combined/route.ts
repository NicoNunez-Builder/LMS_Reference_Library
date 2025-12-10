import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      query,
      category,
      fileType,
      limit = 10,
      includeGoogle = true,
      includeYoutube = true,
      includeBooks = false,
      includeOpenLibrary = false,
      includeCourtListener = false,
      includeCongress = false,
      includeFederalRegister = false,
      includeLOC = false,
      includeUniCourt = false,
      // CourtListener specific filters
      court,
      searchType,
      dateFrom,
      dateTo,
      // UniCourt specific filters
      state,
      caseType,
    } = body

    if (!query) {
      return NextResponse.json(
        { error: 'Query parameter is required' },
        { status: 400 }
      )
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

    // Validate and cap limit
    const maxLimit = Math.min(Math.max(1, limit), 50)

    // Make parallel requests to all enabled APIs
    const searchPromises: { key: string; promise: Promise<any> }[] = []

    if (includeGoogle) {
      searchPromises.push({
        key: 'google',
        promise: fetch(`${baseUrl}/api/search/google`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, category, fileType, limit: maxLimit }),
        }).then((res) => res.json()),
      })
    }

    if (includeYoutube) {
      searchPromises.push({
        key: 'youtube',
        promise: fetch(`${baseUrl}/api/search/youtube`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, category, limit: maxLimit }),
        }).then((res) => res.json()),
      })
    }

    if (includeBooks) {
      searchPromises.push({
        key: 'books',
        promise: fetch(`${baseUrl}/api/search/books`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, category, limit: maxLimit }),
        }).then((res) => res.json()),
      })
    }

    if (includeOpenLibrary) {
      searchPromises.push({
        key: 'openlibrary',
        promise: fetch(`${baseUrl}/api/search/openlibrary`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, category, limit: maxLimit }),
        }).then((res) => res.json()),
      })
    }

    if (includeCourtListener) {
      searchPromises.push({
        key: 'courtlistener',
        promise: fetch(`${baseUrl}/api/search/courtlistener`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query,
            category,
            limit: maxLimit,
            court,
            searchType,
            dateFrom,
            dateTo,
          }),
        }).then((res) => res.json()),
      })
    }

    if (includeCongress) {
      searchPromises.push({
        key: 'congress',
        promise: fetch(`${baseUrl}/api/search/congress`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, category, limit: maxLimit }),
        }).then((res) => res.json()),
      })
    }

    if (includeFederalRegister) {
      searchPromises.push({
        key: 'federalregister',
        promise: fetch(`${baseUrl}/api/search/federalregister`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, category, limit: maxLimit }),
        }).then((res) => res.json()),
      })
    }

    if (includeLOC) {
      searchPromises.push({
        key: 'loc',
        promise: fetch(`${baseUrl}/api/search/loc`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, category, limit: maxLimit }),
        }).then((res) => res.json()),
      })
    }

    if (includeUniCourt) {
      searchPromises.push({
        key: 'unicourt',
        promise: fetch(`${baseUrl}/api/search/unicourt`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query,
            state,
            caseType,
            dateFrom,
            dateTo,
            limit: maxLimit,
          }),
        }).then((res) => res.json()),
      })
    }

    // Execute all searches in parallel
    const results = await Promise.allSettled(searchPromises.map((p) => p.promise))

    // Map results back to their keys
    const response: Record<string, { results: any[]; count: number }> = {}
    let total = 0

    searchPromises.forEach((search, index) => {
      const result = results[index]
      const searchResults =
        result.status === 'fulfilled' ? result.value.results || [] : []
      response[search.key] = {
        results: searchResults,
        count: searchResults.length,
      }
      total += searchResults.length
    })

    return NextResponse.json({
      ...response,
      total,
      query,
    })
  } catch (error) {
    console.error('Combined search error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    )
  }
}
