import { NextRequest, NextResponse } from 'next/server'

const FIRECRAWL_API_URL = 'https://api.firecrawl.dev/v1'

interface DiscoveredDocument {
  url: string
  filename: string
  fileType: string
  foundOnPage: string
}

// Extract document links from HTML content
function extractDocumentLinks(html: string, baseUrl: string): DiscoveredDocument[] {
  const documents: DiscoveredDocument[] = []
  const hrefRegex = /href=["']([^"']+)["']/gi
  let match

  while ((match = hrefRegex.exec(html)) !== null) {
    try {
      const href = match[1]
      if (href.startsWith('javascript:') || href.startsWith('mailto:') ||
          href.startsWith('tel:') || href.startsWith('#')) continue

      const absoluteUrl = new URL(href, baseUrl).href
      const lower = absoluteUrl.toLowerCase()

      // Check for document extensions
      let fileType: string | null = null
      let filename = ''

      if (lower.endsWith('.pdf')) {
        fileType = 'PDF'
        filename = decodeURIComponent(absoluteUrl.split('/').pop() || 'document.pdf')
      } else if (lower.endsWith('.doc') || lower.endsWith('.docx')) {
        fileType = 'DOCX'
        filename = decodeURIComponent(absoluteUrl.split('/').pop() || 'document.docx')
      } else if (lower.endsWith('.epub')) {
        fileType = 'EPUB'
        filename = decodeURIComponent(absoluteUrl.split('/').pop() || 'document.epub')
      } else if (lower.endsWith('.mobi')) {
        fileType = 'MOBI'
        filename = decodeURIComponent(absoluteUrl.split('/').pop() || 'document.mobi')
      } else if (lower.endsWith('.xls') || lower.endsWith('.xlsx')) {
        fileType = 'XLSX'
        filename = decodeURIComponent(absoluteUrl.split('/').pop() || 'document.xlsx')
      } else if (lower.endsWith('.ppt') || lower.endsWith('.pptx')) {
        fileType = 'PPTX'
        filename = decodeURIComponent(absoluteUrl.split('/').pop() || 'document.pptx')
      }

      if (fileType) {
        documents.push({
          url: absoluteUrl,
          filename,
          fileType,
          foundOnPage: baseUrl,
        })
      }
    } catch {
      // Invalid URL, skip
    }
  }

  return documents
}

// POST - Crawl site for PDFs
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
            { url: 'https://example.com/doc1.pdf', fileType: 'PDF', filename: 'doc1.pdf', foundOnPage: 'https://example.com' },
            { url: 'https://example.com/docs/doc2.pdf', fileType: 'PDF', filename: 'doc2.pdf', foundOnPage: 'https://example.com/docs' },
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
      maxPages = 50,
      maxDepth = 3,
      filterType = 'all', // 'all', 'pdf', 'doc', 'ebook'
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

    console.log(`Starting PDF crawl at: ${url} (maxPages: ${maxPages}, maxDepth: ${maxDepth})`)

    // Start async crawl
    const crawlResponse = await fetch(`${FIRECRAWL_API_URL}/crawl`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url,
        limit: maxPages,
        maxDepth,
        scrapeOptions: {
          formats: ['html'],
          onlyMainContent: false,
        },
      }),
    })

    if (!crawlResponse.ok) {
      const errorText = await crawlResponse.text()
      console.error('Firecrawl crawl error:', crawlResponse.status, errorText)
      return NextResponse.json({
        error: 'Failed to start crawl',
        details: errorText,
      }, { status: crawlResponse.status })
    }

    const crawlData = await crawlResponse.json()
    const jobId = crawlData.id

    if (!jobId) {
      return NextResponse.json({
        error: 'No job ID returned',
        details: JSON.stringify(crawlData),
      }, { status: 500 })
    }

    console.log(`Crawl started with job ID: ${jobId}`)

    // Poll for completion
    const allDocuments: DiscoveredDocument[] = []
    const seenUrls = new Set<string>()
    let pagesProcessed = 0
    let status = 'scraping'
    let pollAttempts = 0
    const maxPollAttempts = 60 // 5 minutes max

    while (status !== 'completed' && status !== 'failed' && pollAttempts < maxPollAttempts) {
      await new Promise(resolve => setTimeout(resolve, 5000)) // Wait 5 seconds
      pollAttempts++

      const statusResponse = await fetch(`${FIRECRAWL_API_URL}/crawl/${jobId}`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
      })

      if (!statusResponse.ok) {
        console.error('Failed to check crawl status:', statusResponse.status)
        continue
      }

      const statusData = await statusResponse.json()
      status = statusData.status
      pagesProcessed = statusData.completed || 0

      console.log(`Crawl status: ${status}, pages: ${pagesProcessed}/${statusData.total || '?'}`)

      // Process any available data
      const pages = statusData.data || []
      for (const page of pages) {
        if (page.html && page.metadata?.sourceURL) {
          const docs = extractDocumentLinks(page.html, page.metadata.sourceURL)
          for (const doc of docs) {
            if (!seenUrls.has(doc.url)) {
              seenUrls.add(doc.url)
              allDocuments.push(doc)
            }
          }
        }
      }
    }

    // Final status check and data retrieval
    if (status === 'completed') {
      const finalResponse = await fetch(`${FIRECRAWL_API_URL}/crawl/${jobId}`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
      })

      if (finalResponse.ok) {
        const finalData = await finalResponse.json()
        const pages = finalData.data || []

        for (const page of pages) {
          if (page.html && page.metadata?.sourceURL) {
            const docs = extractDocumentLinks(page.html, page.metadata.sourceURL)
            for (const doc of docs) {
              if (!seenUrls.has(doc.url)) {
                seenUrls.add(doc.url)
                allDocuments.push(doc)
              }
            }
          }
        }
      }
    }

    // Apply filter
    let filteredDocs = allDocuments
    if (filterType === 'pdf') {
      filteredDocs = allDocuments.filter(d => d.fileType === 'PDF')
    } else if (filterType === 'doc') {
      filteredDocs = allDocuments.filter(d => ['DOC', 'DOCX'].includes(d.fileType))
    } else if (filterType === 'ebook') {
      filteredDocs = allDocuments.filter(d => ['EPUB', 'MOBI'].includes(d.fileType))
    }

    console.log(`Crawl complete. Found ${filteredDocs.length} documents across ${pagesProcessed} pages`)

    return NextResponse.json({
      success: true,
      url,
      pagesProcessed,
      totalDocuments: filteredDocs.length,
      documents: filteredDocs,
      filterType,
      status,
      message: filteredDocs.length > 0
        ? `Found ${filteredDocs.length} documents across ${pagesProcessed} pages`
        : `No documents found after crawling ${pagesProcessed} pages`,
    })
  } catch (error) {
    console.error('Crawl PDFs error:', error)
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
      ? 'PDF crawl API is ready'
      : 'Add FIRECRAWL_API_KEY to .env.local',
  })
}
