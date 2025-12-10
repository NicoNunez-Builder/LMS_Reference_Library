import { NextRequest, NextResponse } from 'next/server'

const FIRECRAWL_API_URL = 'https://api.firecrawl.dev/v1'

// Start a crawl job
export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.FIRECRAWL_API_KEY
    const skipAuth = process.env.FIRECRAWL_SKIP_AUTH === 'true'

    if (!apiKey) {
      if (skipAuth) {
        return NextResponse.json({
          success: true,
          jobId: `dev-${Date.now()}`,
          status: 'completed',
          message: '[Dev Mode] Firecrawl API bypassed. Add FIRECRAWL_API_KEY for real crawling.',
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
      limit = 50,
      maxDepth = 3,
      includePaths,
      excludePaths,
      allowBackwardLinks = false,
      allowExternalLinks = false,
      scrapeOptions = {
        formats: ['markdown'],
        onlyMainContent: true,
      },
    } = body

    if (!url) {
      return NextResponse.json({
        error: 'URL is required',
      }, { status: 400 })
    }

    console.log(`Starting crawl for: ${url}`)

    const response = await fetch(`${FIRECRAWL_API_URL}/crawl`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url,
        limit,
        maxDepth,
        includePaths,
        excludePaths,
        allowBackwardLinks,
        allowExternalLinks,
        scrapeOptions,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Firecrawl crawl error:', response.status, errorText)
      return NextResponse.json({
        error: 'Crawl failed to start',
        details: errorText,
        status: response.status,
      }, { status: response.status })
    }

    const data = await response.json()

    return NextResponse.json({
      success: true,
      jobId: data.id,
      status: data.status || 'started',
      message: 'Crawl job started. Use the job ID to check status.',
    })
  } catch (error) {
    console.error('Crawl error:', error)
    return NextResponse.json({
      error: 'Internal server error',
      details: String(error),
    }, { status: 500 })
  }
}

// Check crawl job status
export async function GET(request: NextRequest) {
  try {
    const apiKey = process.env.FIRECRAWL_API_KEY

    if (!apiKey) {
      return NextResponse.json({
        error: 'Firecrawl not configured',
        configured: false,
      }, { status: 503 })
    }

    const { searchParams } = new URL(request.url)
    const jobId = searchParams.get('jobId')

    if (!jobId) {
      // Return configuration status if no jobId
      return NextResponse.json({
        configured: true,
        message: 'Firecrawl API is configured',
      })
    }

    console.log(`Checking crawl status for job: ${jobId}`)

    const response = await fetch(`${FIRECRAWL_API_URL}/crawl/${jobId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Firecrawl status check error:', response.status, errorText)
      return NextResponse.json({
        error: 'Failed to check crawl status',
        details: errorText,
        status: response.status,
      }, { status: response.status })
    }

    const data = await response.json()

    return NextResponse.json({
      success: true,
      status: data.status,
      total: data.total,
      completed: data.completed,
      creditsUsed: data.creditsUsed,
      expiresAt: data.expiresAt,
      data: data.data || [],
    })
  } catch (error) {
    console.error('Status check error:', error)
    return NextResponse.json({
      error: 'Internal server error',
      details: String(error),
    }, { status: 500 })
  }
}
