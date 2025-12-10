import { NextRequest, NextResponse } from 'next/server'

const FIRECRAWL_API_URL = 'https://api.firecrawl.dev/v1'

// File extensions to look for
const DOCUMENT_EXTENSIONS = ['.pdf', '.doc', '.docx', '.epub', '.mobi', '.xls', '.xlsx', '.ppt', '.pptx']

interface DiscoveredLink {
  url: string
  title?: string
  fileType: string
  filename: string
}

// Extract filename and type from URL
function parseUrl(url: string): { filename: string; fileType: string } | null {
  try {
    const urlObj = new URL(url)
    const pathname = urlObj.pathname.toLowerCase()

    for (const ext of DOCUMENT_EXTENSIONS) {
      if (pathname.endsWith(ext)) {
        const filename = decodeURIComponent(pathname.split('/').pop() || '')
        return {
          filename,
          fileType: ext.replace('.', '').toUpperCase(),
        }
      }
    }
    return null
  } catch {
    return null
  }
}

// POST - Map a website to find documents (uses Firecrawl /map endpoint)
export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.FIRECRAWL_API_KEY
    const skipAuth = process.env.FIRECRAWL_SKIP_AUTH === 'true'

    if (!apiKey) {
      if (skipAuth) {
        // Dev mode - return mock data
        return NextResponse.json({
          success: true,
          devMode: true,
          url: 'https://example.com',
          totalLinks: 5,
          documents: [
            { url: 'https://example.com/doc1.pdf', fileType: 'PDF', filename: 'doc1.pdf' },
            { url: 'https://example.com/doc2.pdf', fileType: 'PDF', filename: 'doc2.pdf' },
            { url: 'https://example.com/report.docx', fileType: 'DOCX', filename: 'report.docx' },
          ],
          message: 'Dev mode - showing sample data. Add FIRECRAWL_API_KEY for real crawling.',
        })
      }
      return NextResponse.json({
        error: 'Firecrawl not configured',
        message: 'Add FIRECRAWL_API_KEY to your .env.local file',
        configured: false,
      }, { status: 503 })
    }

    const body = await request.json()
    const {
      url: rawUrl,
      limit = 500, // Max URLs to discover
      filterType = 'all', // 'all', 'pdf', 'doc', 'ebook'
      search, // Optional search query to filter URLs
    } = body

    if (!rawUrl) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 })
    }

    // Normalize URL - ensure it has a protocol
    let url = rawUrl.trim()
    if (!url.match(/^https?:\/\//i)) {
      url = 'https://' + url
    }

    // Validate URL format
    try {
      new URL(url)
    } catch {
      return NextResponse.json({ error: 'Invalid URL format' }, { status: 400 })
    }

    console.log(`Mapping URL for documents: ${url}`)

    // Use Firecrawl's map endpoint to discover all URLs
    const response = await fetch(`${FIRECRAWL_API_URL}/map`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url,
        limit,
        ignoreSitemap: false,
        includeSubdomains: false,
        search, // Firecrawl supports search query to filter URLs
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Firecrawl map error:', response.status, errorText)
      return NextResponse.json({
        error: 'Map failed',
        details: errorText,
        status: response.status,
      }, { status: response.status })
    }

    const data = await response.json()
    const allLinks: string[] = data.links || []

    console.log(`Found ${allLinks.length} total links`)

    // Filter for document links
    const documents: DiscoveredLink[] = []

    for (const link of allLinks) {
      const parsed = parseUrl(link)
      if (parsed) {
        // Apply filter
        if (filterType === 'all') {
          documents.push({ url: link, ...parsed })
        } else if (filterType === 'pdf' && parsed.fileType === 'PDF') {
          documents.push({ url: link, ...parsed })
        } else if (filterType === 'doc' && ['DOC', 'DOCX'].includes(parsed.fileType)) {
          documents.push({ url: link, ...parsed })
        } else if (filterType === 'ebook' && ['EPUB', 'MOBI'].includes(parsed.fileType)) {
          documents.push({ url: link, ...parsed })
        }
      }
    }

    console.log(`Found ${documents.length} document links`)

    return NextResponse.json({
      success: true,
      url,
      totalLinks: allLinks.length,
      documents,
      filterType,
      message: documents.length > 0
        ? `Found ${documents.length} documents on ${url}`
        : 'No documents found on this page. Try a different URL or filter.',
    })
  } catch (error) {
    console.error('Map error:', error)
    return NextResponse.json({
      error: 'Internal server error',
      details: String(error),
    }, { status: 500 })
  }
}

// GET endpoint to check configuration status
export async function GET() {
  const skipAuth = process.env.FIRECRAWL_SKIP_AUTH === 'true'
  const configured = skipAuth || !!process.env.FIRECRAWL_API_KEY

  return NextResponse.json({
    configured,
    skipAuth,
    supportedTypes: DOCUMENT_EXTENSIONS.map(e => e.replace('.', '').toUpperCase()),
    message: configured
      ? 'Map API is ready to discover documents'
      : 'Add FIRECRAWL_API_KEY to .env.local',
  })
}
