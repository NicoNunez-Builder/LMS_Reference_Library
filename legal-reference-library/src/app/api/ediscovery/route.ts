import { NextRequest, NextResponse } from 'next/server'

// E-Discovery dataset configurations
const DATASETS = {
  enron: {
    name: 'Enron Email Corpus',
    description: '~500,000 emails from 150 Enron employees, released during federal investigation',
    searchUrl: 'https://www.cs.cmu.edu/~enron/',
    apiUrl: null, // We'll use a third-party search or local index
  },
  wikileaks: {
    name: 'WikiLeaks Archives',
    description: 'Searchable archives including Podesta, DNC, and Clinton emails',
    collections: [
      { id: 'podesta', name: 'Podesta Emails', count: 50000 },
      { id: 'dnc', name: 'DNC Emails', count: 20000 },
      { id: 'clinton', name: 'Clinton Emails', count: 30000 },
    ],
  },
  courtdocs: {
    name: 'Court Documents',
    description: 'Unsealed court documents from high-profile cases via CourtListener RECAP',
    cases: [
      { id: 'epstein', name: 'Epstein/Maxwell Documents', court: 'SDNY' },
      { id: 'enron-case', name: 'Enron Corporate Fraud', court: 'SDTX' },
    ],
  },
  clintonFoia: {
    name: 'Clinton FOIA Emails',
    description: 'Hillary Clinton State Department emails released via FOIA (2009-2013)',
    sources: [
      { id: 'state-foia', name: 'State Dept FOIA', url: 'https://foia.state.gov/Search/Results.aspx?collection=Clinton_Email', description: 'Official searchable collection' },
      { id: 'archives', name: 'National Archives', url: 'https://www.archives.gov/foia/state-department-emails', description: 'FOIA documents' },
      { id: 'internet-archive', name: 'Internet Archive', url: 'https://archive.org/details/hillary-clinton-emails-august-31-release', description: '~7,000 emails for download' },
      { id: 'black-vault', name: 'The Black Vault', url: 'https://www.theblackvault.com/documentarchive/archive-of-secretary-of-state-hillary-clinton-e-mails/', description: 'Complete archive with .zip downloads' },
    ],
  },
}

// WikiLeaks search (using their public search interface)
async function searchWikiLeaks(query: string, collection: string, limit: number) {
  try {
    // WikiLeaks has a search endpoint - we'll scrape the results
    const collectionMap: Record<string, string> = {
      podesta: 'podesta-emails',
      dnc: 'dnc-emails',
      clinton: 'clinton-emails',
      all: '',
    }

    const collectionPath = collectionMap[collection] || ''
    const searchUrl = `https://search.wikileaks.org/?query=${encodeURIComponent(query)}${collectionPath ? `&exact_collection=${collectionPath}` : ''}`

    // For now, return a structured response that links to WikiLeaks search
    // In production, you could use a scraper or cached index
    return {
      source: 'wikileaks',
      collection: collection,
      searchUrl: searchUrl,
      results: [],
      message: 'WikiLeaks search - click to view results on WikiLeaks',
      directLink: true,
    }
  } catch (error) {
    console.error('WikiLeaks search error:', error)
    return { source: 'wikileaks', results: [], error: 'Search failed' }
  }
}

// Enron email search using publicly available APIs
async function searchEnron(query: string, limit: number) {
  try {
    // The Enron dataset is available on Kaggle and other sources
    // For a production app, you'd want to index this locally or use a search service
    // Here we'll link to searchable online versions

    const searchableUrls = [
      {
        name: 'CMU Enron Dataset',
        url: `https://www.cs.cmu.edu/~enron/`,
        description: 'Original dataset download from Carnegie Mellon',
      },
      {
        name: 'Kaggle Enron Dataset',
        url: `https://www.kaggle.com/datasets/wcukierski/enron-email-dataset`,
        description: 'Searchable and downloadable on Kaggle',
      },
      {
        name: 'EDRM Enron Dataset',
        url: `https://www.edrm.net/resources/data-sets/edrm-enron-email-data-set/`,
        description: 'EDRM formatted version with PST files',
      },
    ]

    return {
      source: 'enron',
      query: query,
      resources: searchableUrls,
      results: [],
      message: 'Enron dataset available for download/search from these sources',
    }
  } catch (error) {
    console.error('Enron search error:', error)
    return { source: 'enron', results: [], error: 'Search failed' }
  }
}

// Court documents search using CourtListener v4 API
async function searchCourtDocs(query: string, caseType: string, limit: number) {
  try {
    const token = process.env.COURTLISTENER_API_TOKEN

    // Build search query based on case type
    let searchQuery = query
    if (caseType === 'epstein') {
      searchQuery = `${query} (epstein OR maxwell OR "jeffrey epstein" OR "ghislaine maxwell")`
    } else if (caseType === 'enron-case') {
      searchQuery = `${query} (enron OR "kenneth lay" OR "jeffrey skilling")`
    }

    const url = new URL('https://www.courtlistener.com/api/rest/v4/search/')
    url.searchParams.append('q', searchQuery)
    url.searchParams.append('type', 'r') // RECAP documents
    url.searchParams.append('order_by', 'score desc')
    url.searchParams.append('page_size', String(limit))

    const headers: Record<string, string> = {
      'User-Agent': 'LegalReferenceLibrary/1.0',
    }
    if (token) {
      headers['Authorization'] = `Token ${token}`
    }

    const response = await fetch(url.toString(), { headers })

    if (!response.ok) {
      throw new Error(`CourtListener API error: ${response.status}`)
    }

    const data = await response.json()

    const results = (data.results || []).slice(0, limit).map((item: any) => {
      // Extract summary from recap_documents if available
      let summary = ''
      if (item.recap_documents && item.recap_documents.length > 0) {
        const doc = item.recap_documents[0]
        // Use description first (filing info), then snippet (document text)
        if (doc.description) {
          summary = doc.description
        } else if (doc.snippet) {
          // Clean up snippet - remove case header formatting
          summary = doc.snippet.replace(/\s+/g, ' ').trim()
        }
      }
      // Fallback to case name full or docket info
      if (!summary && item.case_name_full) {
        summary = item.case_name_full
      }

      return {
        id: item.id || item.docket_id,
        title: item.caseName || item.caseNameShort || 'Untitled Document',
        snippet: summary,
        url: `https://www.courtlistener.com${item.docket_absolute_url || `/docket/${item.docket_id}/`}`,
        court: item.court || item.court_id,
        date: item.dateFiled,
        source_type: 'document',
        metadata: {
          docketNumber: item.docketNumber,
          court: item.court,
          caseType: caseType,
          documentCount: item.recap_documents?.length || 0,
        },
      }
    })

    return {
      source: 'courtdocs',
      caseType: caseType,
      total: data.count || results.length,
      results: results,
    }
  } catch (error) {
    console.error('Court docs search error:', error)
    return { source: 'courtdocs', results: [], error: 'Search failed' }
  }
}

// GET - Return available datasets and configuration
export async function GET() {
  return NextResponse.json({
    datasets: DATASETS,
    message: 'E-Discovery datasets available for search',
  })
}

// POST - Search across datasets
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      query,
      source = 'all', // 'enron', 'wikileaks', 'courtdocs', 'all'
      collection = 'all', // For WikiLeaks: 'podesta', 'dnc', 'clinton', 'all'
      caseType = 'all', // For court docs: 'epstein', 'enron-case', 'all'
      limit = 20,
    } = body

    if (!query?.trim()) {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 })
    }

    const results: Record<string, any> = {}

    // Search selected sources
    if (source === 'all' || source === 'enron') {
      results.enron = await searchEnron(query, limit)
    }

    if (source === 'all' || source === 'wikileaks') {
      results.wikileaks = await searchWikiLeaks(query, collection, limit)
    }

    if (source === 'all' || source === 'courtdocs') {
      results.courtdocs = await searchCourtDocs(query, caseType, limit)
    }

    return NextResponse.json({
      query,
      results,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('E-Discovery search error:', error)
    return NextResponse.json(
      { error: 'Search failed' },
      { status: 500 }
    )
  }
}
