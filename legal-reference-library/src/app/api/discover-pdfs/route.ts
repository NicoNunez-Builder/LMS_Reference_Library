import { NextRequest, NextResponse } from 'next/server'

const FIRECRAWL_API_URL = 'https://api.firecrawl.dev/v1'

// Document content types to detect
const PDF_CONTENT_TYPES = [
  'application/pdf',
  'application/x-pdf',
]

const DOCUMENT_CONTENT_TYPES = [
  ...PDF_CONTENT_TYPES,
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/epub+zip',
  'application/x-mobipocket-ebook',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]

interface DiscoveredDocument {
  url: string
  filename: string
  fileType: string
  contentType: string
  size?: number
}

// Extract filename from URL or Content-Disposition header
function extractFilename(url: string, contentDisposition?: string | null): string {
  // Try Content-Disposition header first
  if (contentDisposition) {
    const match = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/)
    if (match && match[1]) {
      return match[1].replace(/['"]/g, '').trim()
    }
  }

  // Fall back to URL
  try {
    const urlObj = new URL(url)
    const pathParts = urlObj.pathname.split('/')
    const lastPart = pathParts[pathParts.length - 1]
    if (lastPart && lastPart.length > 0) {
      return decodeURIComponent(lastPart)
    }
  } catch {
    // ignore
  }

  return 'document'
}

// Get file type from content type
function getFileType(contentType: string): string {
  if (contentType.includes('pdf')) return 'PDF'
  if (contentType.includes('msword') || contentType.includes('wordprocessingml')) return 'DOCX'
  if (contentType.includes('epub')) return 'EPUB'
  if (contentType.includes('mobipocket')) return 'MOBI'
  if (contentType.includes('excel') || contentType.includes('spreadsheet')) return 'XLSX'
  return 'DOC'
}

// Check if a URL returns a document by making a HEAD request
async function checkUrlForDocument(url: string, filterType: string): Promise<DiscoveredDocument | null> {
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 5000) // 5 second timeout

    const response = await fetch(url, {
      method: 'HEAD',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      redirect: 'follow',
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!response.ok) return null

    const contentType = response.headers.get('content-type')?.toLowerCase() || ''
    const contentLength = response.headers.get('content-length')
    const contentDisposition = response.headers.get('content-disposition')

    // Check if this is a document type we're looking for
    let isMatch = false

    if (filterType === 'pdf') {
      isMatch = PDF_CONTENT_TYPES.some(ct => contentType.includes(ct.split('/')[1]))
    } else {
      isMatch = DOCUMENT_CONTENT_TYPES.some(ct => contentType.includes(ct.split('/')[1]))
    }

    if (!isMatch) return null

    const fileType = getFileType(contentType)
    let filename = extractFilename(url, contentDisposition)

    // Add extension if missing
    if (!filename.includes('.')) {
      filename += '.' + fileType.toLowerCase()
    }

    return {
      url,
      filename,
      fileType,
      contentType,
      size: contentLength ? parseInt(contentLength, 10) : undefined,
    }
  } catch {
    return null
  }
}

// Extract all links from HTML content
function extractLinksFromHtml(html: string, baseUrl: string): string[] {
  const links: string[] = []
  // Match href attributes
  const hrefRegex = /href=["']([^"']+)["']/gi
  let match

  while ((match = hrefRegex.exec(html)) !== null) {
    try {
      const href = match[1]
      // Skip javascript:, mailto:, tel:, #anchors
      if (href.startsWith('javascript:') || href.startsWith('mailto:') ||
          href.startsWith('tel:') || href.startsWith('#')) continue

      // Convert relative to absolute URL
      const absoluteUrl = new URL(href, baseUrl).href
      links.push(absoluteUrl)
    } catch {
      // Invalid URL, skip
    }
  }

  return [...new Set(links)] // Remove duplicates
}

// POST - Discover PDFs by scraping page and checking links
export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.FIRECRAWL_API_KEY
    const skipAuth = process.env.FIRECRAWL_SKIP_AUTH === 'true'

    if (!apiKey) {
      if (skipAuth) {
        return NextResponse.json({
          success: true,
          devMode: true,
          documents: [
            { url: 'https://example.com/doc1.pdf', fileType: 'PDF', filename: 'doc1.pdf', contentType: 'application/pdf' },
          ],
          message: 'Dev mode - showing sample data',
        })
      }
      return NextResponse.json({
        error: 'Firecrawl not configured',
        message: 'Add FIRECRAWL_API_KEY to your .env.local file',
      }, { status: 503 })
    }

    const body = await request.json()
    const {
      url: rawUrl,
      filterType = 'pdf',
      maxChecks = 50,
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

    console.log(`Discovering documents at: ${url}`)

    // Step 1: Scrape the page to get HTML content
    const scrapeResponse = await fetch(`${FIRECRAWL_API_URL}/scrape`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url,
        formats: ['html'],
        onlyMainContent: false, // Get full page to find all links
      }),
    })

    if (!scrapeResponse.ok) {
      const errorText = await scrapeResponse.text()
      console.error('Firecrawl scrape error:', scrapeResponse.status, errorText)
      return NextResponse.json({
        error: 'Failed to scrape website',
        details: errorText,
      }, { status: scrapeResponse.status })
    }

    const scrapeData = await scrapeResponse.json()
    const html = scrapeData.data?.html || ''

    if (!html) {
      return NextResponse.json({
        success: true,
        url,
        totalLinks: 0,
        checkedLinks: 0,
        documents: [],
        filterType,
        message: 'Could not retrieve page content',
      })
    }

    // Step 2: Extract all links from the HTML
    const allLinks = extractLinksFromHtml(html, url)
    console.log(`Extracted ${allLinks.length} links from page`)

    // Step 3: First pass - check for obvious document URLs by extension
    const documents: DiscoveredDocument[] = []
    const linksToCheck: string[] = []

    for (const link of allLinks) {
      const lower = link.toLowerCase()
      // Check for obvious document extensions
      if (lower.endsWith('.pdf')) {
        const filename = decodeURIComponent(link.split('/').pop() || 'document.pdf')
        documents.push({ url: link, filename, fileType: 'PDF', contentType: 'application/pdf' })
      } else if (lower.endsWith('.doc') || lower.endsWith('.docx')) {
        const filename = decodeURIComponent(link.split('/').pop() || 'document.docx')
        documents.push({ url: link, filename, fileType: 'DOCX', contentType: 'application/msword' })
      } else if (lower.endsWith('.epub')) {
        const filename = decodeURIComponent(link.split('/').pop() || 'document.epub')
        documents.push({ url: link, filename, fileType: 'EPUB', contentType: 'application/epub+zip' })
      } else if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
        const filename = decodeURIComponent(link.split('/').pop() || 'document.xlsx')
        documents.push({ url: link, filename, fileType: 'XLSX', contentType: 'application/vnd.ms-excel' })
      } else if (!lower.includes('.css') && !lower.includes('.js') &&
                 !lower.includes('.png') && !lower.includes('.jpg') &&
                 !lower.includes('.gif') && !lower.includes('.svg') &&
                 !lower.includes('/login') && !lower.includes('/signup')) {
        // Potential document URL - add to check list
        linksToCheck.push(link)
      }
    }

    console.log(`Found ${documents.length} documents by extension, checking ${Math.min(linksToCheck.length, maxChecks)} more by content-type`)

    // Step 4: Check remaining links by content-type (batched)
    const batchSize = 10
    const urlsToCheck = linksToCheck.slice(0, maxChecks)

    for (let i = 0; i < urlsToCheck.length && documents.length < 50; i += batchSize) {
      const batch = urlsToCheck.slice(i, i + batchSize)
      const results = await Promise.all(
        batch.map(link => checkUrlForDocument(link, filterType))
      )

      for (const result of results) {
        if (result) {
          // Avoid duplicates
          if (!documents.find(d => d.url === result.url)) {
            documents.push(result)
          }
        }
      }
    }

    // Apply filter type
    let filteredDocs = documents
    if (filterType === 'pdf') {
      filteredDocs = documents.filter(d => d.fileType === 'PDF')
    } else if (filterType === 'doc') {
      filteredDocs = documents.filter(d => ['DOC', 'DOCX'].includes(d.fileType))
    } else if (filterType === 'ebook') {
      filteredDocs = documents.filter(d => ['EPUB', 'MOBI'].includes(d.fileType))
    }

    console.log(`Found ${filteredDocs.length} documents total`)

    return NextResponse.json({
      success: true,
      url,
      totalLinks: allLinks.length,
      checkedLinks: urlsToCheck.length,
      documents: filteredDocs,
      filterType,
      message: filteredDocs.length > 0
        ? `Found ${filteredDocs.length} documents on ${url}`
        : 'No documents found. Try a different page or the site may require login.',
    })
  } catch (error) {
    console.error('Discover PDFs error:', error)
    return NextResponse.json({
      error: 'Internal server error',
      details: String(error),
    }, { status: 500 })
  }
}

// GET - Check configuration
export async function GET() {
  const configured = !!process.env.FIRECRAWL_API_KEY || process.env.FIRECRAWL_SKIP_AUTH === 'true'

  return NextResponse.json({
    configured,
    message: configured
      ? 'PDF discovery API is ready'
      : 'Add FIRECRAWL_API_KEY to .env.local',
    supportedTypes: ['PDF', 'DOCX', 'DOC', 'EPUB', 'MOBI', 'XLSX'],
  })
}
