import { NextRequest, NextResponse } from 'next/server'

const FIRECRAWL_API_URL = 'https://api.firecrawl.dev/v1'

// Scrape a single URL
export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.FIRECRAWL_API_KEY
    const skipAuth = process.env.FIRECRAWL_SKIP_AUTH === 'true'

    if (!apiKey) {
      if (skipAuth) {
        return NextResponse.json({
          success: true,
          data: {
            markdown: '[Dev Mode] Firecrawl API bypassed. Add FIRECRAWL_API_KEY for real scraping.',
            metadata: { title: 'Dev Mode - No API Key' },
          },
          devMode: true,
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
      url,
      formats = ['markdown', 'html'],
      onlyMainContent = true,
      includeTags,
      excludeTags,
      waitFor = 0,
    } = body

    if (!url) {
      return NextResponse.json({
        error: 'URL is required',
      }, { status: 400 })
    }

    console.log(`Scraping URL: ${url}`)

    const response = await fetch(`${FIRECRAWL_API_URL}/scrape`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url,
        formats,
        onlyMainContent,
        includeTags,
        excludeTags,
        waitFor,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Firecrawl scrape error:', response.status, errorText)
      return NextResponse.json({
        error: 'Scrape failed',
        details: errorText,
        status: response.status,
      }, { status: response.status })
    }

    const data = await response.json()

    return NextResponse.json({
      success: true,
      data: data.data,
      metadata: data.data?.metadata,
    })
  } catch (error) {
    console.error('Scrape error:', error)
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
    message: configured
      ? skipAuth
        ? 'Firecrawl API auth bypassed for development'
        : 'Firecrawl API is configured'
      : 'Add FIRECRAWL_API_KEY to .env.local',
  })
}
