import { NextRequest, NextResponse } from 'next/server'
import { SearchResult, SourceType } from '@/types'

// UniCourt API configuration
const UNICOURT_BASE_URL = 'https://enterpriseapi.unicourt.com'

// Token cache to avoid generating new tokens for every request
let cachedToken: string | null = null
let tokenExpiry: number | null = null

// Generate or retrieve access token
async function getAccessToken(): Promise<string | null> {
  const clientId = process.env.UNICOURT_CLIENT_ID
  const clientSecret = process.env.UNICOURT_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    console.error('UniCourt credentials not configured')
    return null
  }

  // Return cached token if still valid (tokens don't expire, but we refresh every 24 hours)
  if (cachedToken && tokenExpiry && Date.now() < tokenExpiry) {
    return cachedToken
  }

  try {
    const response = await fetch(`${UNICOURT_BASE_URL}/generateNewToken`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        clientId,
        clientSecret,
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      console.error('UniCourt token generation failed:', error)
      return null
    }

    const data = await response.json()
    cachedToken = data.accessToken || data.access_token
    // Refresh token every 24 hours even though they don't expire
    tokenExpiry = Date.now() + 24 * 60 * 60 * 1000

    return cachedToken
  } catch (error) {
    console.error('UniCourt auth error:', error)
    return null
  }
}

// Build UniCourt query string from parameters
function buildQuery(params: {
  query: string
  state?: string
  caseType?: string
  partyName?: string
  attorneyName?: string
  judgeName?: string
  caseNumber?: string
  dateFrom?: string
  dateTo?: string
}): string {
  const queryParts: string[] = []

  // Main search query
  if (params.query) {
    // Check if query already contains field operators
    if (params.query.includes(':')) {
      queryParts.push(params.query)
    } else {
      // Search in case name and docket entries
      queryParts.push(`(caseName:(${params.query}) OR DocketEntry:(${params.query}))`)
    }
  }

  // State/Jurisdiction filter
  if (params.state) {
    queryParts.push(`(JurisdictionGeo:(state:(name:"${params.state}")))`)
  }

  // Case type filter
  if (params.caseType) {
    queryParts.push(`(CaseType:(name:"${params.caseType}"))`)
  }

  // Party name
  if (params.partyName) {
    queryParts.push(`(Party:(name:"${params.partyName}"))`)
  }

  // Attorney name
  if (params.attorneyName) {
    queryParts.push(`(Attorney:(name:"${params.attorneyName}"))`)
  }

  // Judge name
  if (params.judgeName) {
    queryParts.push(`(Judge:(name:"${params.judgeName}"))`)
  }

  // Case number
  if (params.caseNumber) {
    queryParts.push(`(caseNumber:"${params.caseNumber}")`)
  }

  // Date range
  if (params.dateFrom) {
    queryParts.push(`(filedDate:[${params.dateFrom} TO *])`)
  }
  if (params.dateTo) {
    queryParts.push(`(filedDate:[* TO ${params.dateTo}])`)
  }

  return queryParts.join(' AND ')
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      query,
      state,
      caseType,
      partyName,
      attorneyName,
      judgeName,
      caseNumber,
      dateFrom,
      dateTo,
      limit = 25,
      page = 1,
    } = body

    const skipAuth = process.env.UNICOURT_SKIP_AUTH === 'true'

    // Check for credentials
    if (!process.env.UNICOURT_CLIENT_ID || !process.env.UNICOURT_CLIENT_SECRET) {
      if (skipAuth) {
        // Return empty results in dev mode
        return NextResponse.json({
          results: [],
          count: 0,
          total: 0,
          query: query || '',
          message: 'UniCourt API bypassed - add credentials for real results',
          devMode: true,
        })
      }
      return NextResponse.json({
        error: 'UniCourt not configured',
        message: 'Add UNICOURT_CLIENT_ID and UNICOURT_CLIENT_SECRET to your .env.local file',
        configured: false,
      }, { status: 503 })
    }

    // Get access token
    const accessToken = await getAccessToken()
    if (!accessToken) {
      return NextResponse.json({
        error: 'Authentication failed',
        message: 'Could not authenticate with UniCourt API',
      }, { status: 401 })
    }

    // Build query
    const searchQuery = buildQuery({
      query,
      state,
      caseType,
      partyName,
      attorneyName,
      judgeName,
      caseNumber,
      dateFrom,
      dateTo,
    })

    if (!searchQuery) {
      return NextResponse.json({
        error: 'Query required',
        message: 'Please provide search criteria',
      }, { status: 400 })
    }

    console.log('UniCourt search query:', searchQuery)

    // Search cases
    const searchUrl = new URL(`${UNICOURT_BASE_URL}/caseSearch`)
    searchUrl.searchParams.append('q', searchQuery)
    searchUrl.searchParams.append('pageNumber', String(page))
    searchUrl.searchParams.append('sort', 'filedDate')
    searchUrl.searchParams.append('order', 'desc')

    const response = await fetch(searchUrl.toString(), {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('UniCourt search error:', response.status, errorText)
      return NextResponse.json({
        error: 'Search failed',
        details: errorText,
        status: response.status,
      }, { status: response.status })
    }

    const data = await response.json()

    // Transform results to our SearchResult format
    const results: SearchResult[] = (data.caseSearchResultArray || data.results || [])
      .slice(0, limit)
      .map((item: any) => {
        // Build snippet from available data
        let snippet = ''
        if (item.courtName) snippet += `Court: ${item.courtName}. `
        if (item.caseType) snippet += `Type: ${item.caseType}. `
        if (item.filedDate) snippet += `Filed: ${item.filedDate}. `
        if (item.caseStatus) snippet += `Status: ${item.caseStatus}. `
        if (item.parties?.length) {
          const partyNames = item.parties.slice(0, 3).map((p: any) => p.name).join(', ')
          snippet += `Parties: ${partyNames}. `
        }

        return {
          title: item.caseName || item.caseTitle || 'Unknown Case',
          url: item.caseUrl || `https://unicourt.com/case/${item.caseId}`,
          snippet: snippet.slice(0, 300) || 'No additional details available',
          source_type: SourceType.DOCUMENT,
          thumbnail: undefined,
          metadata: {
            caseId: item.caseId,
            caseNumber: item.caseNumber,
            court: item.courtName,
            state: item.state,
            caseType: item.caseType,
            filedDate: item.filedDate,
            caseStatus: item.caseStatus,
          },
        }
      })

    return NextResponse.json({
      results,
      count: results.length,
      total: data.totalCount || data.totalResults || results.length,
      query: searchQuery,
      caseSearchId: data.caseSearchId, // For pagination
    })
  } catch (error) {
    console.error('UniCourt API error:', error)
    return NextResponse.json({
      error: 'Internal server error',
      details: String(error),
    }, { status: 500 })
  }
}

// GET endpoint to check configuration status
export async function GET() {
  const skipAuth = process.env.UNICOURT_SKIP_AUTH === 'true'
  const configured = skipAuth || !!(process.env.UNICOURT_CLIENT_ID && process.env.UNICOURT_CLIENT_SECRET)

  return NextResponse.json({
    configured,
    skipAuth,
    message: configured
      ? skipAuth
        ? 'UniCourt API auth bypassed for development'
        : 'UniCourt API is configured'
      : 'Add UNICOURT_CLIENT_ID and UNICOURT_CLIENT_SECRET to .env.local',
  })
}
