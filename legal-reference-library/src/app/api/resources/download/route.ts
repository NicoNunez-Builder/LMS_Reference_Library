import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const FIRECRAWL_API_URL = 'https://api.firecrawl.dev/v1'

// Scrape URL using Firecrawl API
async function scrapeUrl(url: string): Promise<{ success: boolean; content?: string; title?: string; error?: string }> {
  const apiKey = process.env.FIRECRAWL_API_KEY
  const skipAuth = process.env.FIRECRAWL_SKIP_AUTH === 'true'

  if (!apiKey) {
    if (skipAuth) {
      return {
        success: true,
        content: `[Dev Mode] Content would be scraped from: ${url}`,
        title: 'Dev Mode - Scraped Content',
      }
    }
    return { success: false, error: 'Firecrawl API not configured' }
  }

  try {
    const response = await fetch(`${FIRECRAWL_API_URL}/scrape`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url,
        formats: ['markdown'],
        onlyMainContent: true,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Firecrawl scrape error:', response.status, errorText)
      return { success: false, error: `Scrape failed: ${response.status}` }
    }

    const data = await response.json()
    return {
      success: true,
      content: data.data?.markdown || '',
      title: data.data?.metadata?.title,
    }
  } catch (error) {
    console.error('Scrape error:', error)
    return { success: false, error: String(error) }
  }
}

// Determine folder based on content type or file extension
function getStorageFolder(contentType: string | null, url: string): string {
  // Check content type first
  if (contentType) {
    if (contentType.includes('video')) return 'videos'
    if (contentType.includes('audio')) return 'audio'
    if (contentType.includes('pdf')) return 'documents'
    if (contentType.includes('epub')) return 'ebooks'
  }

  // Fall back to URL extension
  const ext = url.split('.').pop()?.toLowerCase().split('?')[0]
  switch (ext) {
    case 'mp4':
    case 'webm':
    case 'mov':
    case 'avi':
      return 'videos'
    case 'mp3':
    case 'wav':
    case 'ogg':
      return 'audio'
    case 'epub':
    case 'mobi':
      return 'ebooks'
    default:
      return 'documents'
  }
}

// Generate a safe filename from URL or title
function generateFilename(url: string, title: string, contentType: string | null): string {
  // Try to extract filename from URL
  const urlPath = new URL(url).pathname
  const urlFilename = urlPath.split('/').pop()

  // If URL has a valid filename with extension, use it
  if (urlFilename && urlFilename.includes('.')) {
    return urlFilename.replace(/[^a-zA-Z0-9.-]/g, '_')
  }

  // Otherwise, create from title
  const safeName = title
    .replace(/[^a-zA-Z0-9\s-]/g, '')
    .replace(/\s+/g, '_')
    .substring(0, 100)

  // Determine extension from content type
  let ext = 'pdf' // default
  if (contentType) {
    if (contentType.includes('pdf')) ext = 'pdf'
    else if (contentType.includes('msword') || contentType.includes('wordprocessingml')) ext = 'docx'
    else if (contentType.includes('epub')) ext = 'epub'
    else if (contentType.includes('mp4')) ext = 'mp4'
    else if (contentType.includes('webm')) ext = 'webm'
  }

  return `${safeName}.${ext}`
}

// Sites known to block programmatic downloads
const BLOCKED_DOMAINS = [
  'congress.gov',
  'govinfo.gov',
  'supremecourt.gov',
  'uscourts.gov',
]

// Check if URL is from a domain that blocks downloads
function isBlockedDomain(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase()
    return BLOCKED_DOMAINS.some(domain => hostname.includes(domain))
  } catch {
    return false
  }
}

// Upload scraped content as a markdown file to storage
async function uploadScrapedContent(
  supabase: Awaited<ReturnType<typeof createClient>>,
  content: string,
  title: string
): Promise<{ file_url: string; file_path: string; file_size: number } | null> {
  try {
    const safeName = (title || 'scraped_content')
      .replace(/[^a-zA-Z0-9\s-]/g, '')
      .replace(/\s+/g, '_')
      .substring(0, 100)

    const timestamp = Date.now()
    const filePath = `scraped/${timestamp}_${safeName}.md`
    const buffer = Buffer.from(content, 'utf-8')

    console.log(`Uploading scraped content to: ${filePath}`)

    const { error: uploadError } = await supabase.storage
      .from('staging_library')
      .upload(filePath, buffer, {
        contentType: 'text/markdown',
        upsert: false,
      })

    if (uploadError) {
      console.error('Failed to upload scraped content:', uploadError)
      return null
    }

    const { data: urlData } = supabase.storage
      .from('staging_library')
      .getPublicUrl(filePath)

    console.log(`Scraped content uploaded: ${urlData.publicUrl}`)

    return {
      file_url: urlData.publicUrl,
      file_path: filePath,
      file_size: buffer.length,
    }
  } catch (error) {
    console.error('Error uploading scraped content:', error)
    return null
  }
}

// POST - Download file from URL and store in Supabase
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const body = await request.json()

    const { url, title } = body

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 })
    }

    // Check if this domain blocks programmatic downloads - try scraping instead
    if (isBlockedDomain(url)) {
      console.log(`Blocked domain detected, attempting to scrape: ${url}`)
      const scrapeResult = await scrapeUrl(url)

      if (scrapeResult.success && scrapeResult.content) {
        // Upload scraped content as markdown file
        const uploadResult = await uploadScrapedContent(supabase, scrapeResult.content, title || scrapeResult.title || 'scraped_content')

        return NextResponse.json({
          success: true,
          scraped: true,
          scraped_content: scrapeResult.content,
          content_source: 'scraped',
          file_url: uploadResult?.file_url || null,
          file_path: uploadResult?.file_path || null,
          file_size: uploadResult?.file_size || null,
          message: 'Content scraped from blocked domain (download not available)',
        })
      }

      // Scraping also failed
      return NextResponse.json({
        error: 'This website blocks automated downloads and scraping failed',
        blocked: true,
        reason: 'Government websites like Congress.gov do not allow programmatic downloads. The resource will be saved as a link reference instead.',
      }, { status: 403 })
    }

    console.log(`Downloading file from: ${url}`)

    // Build headers for the download request
    const downloadHeaders: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
    }

    // Add CourtListener API token for courtlistener.com URLs
    const isCourtListener = url.includes('courtlistener.com')
    const courtListenerToken = process.env.COURTLISTENER_API_TOKEN
    if (isCourtListener && courtListenerToken) {
      downloadHeaders['Authorization'] = `Token ${courtListenerToken}`
      console.log('Using CourtListener API token for authenticated download')
    }

    // Fetch the file from external URL
    const response = await fetch(url, {
      headers: downloadHeaders,
      redirect: 'follow',
    })

    if (!response.ok) {
      console.error(`Failed to fetch: ${response.status} ${response.statusText}`)

      // Try scraping instead of downloading for failed requests
      console.log(`Download failed (${response.status}), attempting to scrape: ${url}`)
      const scrapeResult = await scrapeUrl(url)

      if (scrapeResult.success && scrapeResult.content) {
        // Upload scraped content as markdown file
        const uploadResult = await uploadScrapedContent(supabase, scrapeResult.content, title || scrapeResult.title || 'scraped_content')

        return NextResponse.json({
          success: true,
          scraped: true,
          scraped_content: scrapeResult.content,
          content_source: 'scraped',
          file_url: uploadResult?.file_url || null,
          file_path: uploadResult?.file_path || null,
          file_size: uploadResult?.file_size || null,
          message: `Content scraped after download failed (${response.status})`,
        })
      }

      // Special handling for 403 - blocked and scraping failed
      if (response.status === 403) {
        return NextResponse.json({
          error: 'Access denied by the source website',
          blocked: true,
          reason: 'This website does not allow automated downloads. The resource will be saved as a link reference instead.',
        }, { status: 403 })
      }

      return NextResponse.json(
        { error: `Failed to download file: ${response.status} ${response.statusText}` },
        { status: 400 }
      )
    }

    const contentType = response.headers.get('content-type')
    const contentLength = response.headers.get('content-length')

    console.log(`Content-Type: ${contentType}, Size: ${contentLength}`)

    // Check if response is HTML instead of a downloadable file - scrape it
    const isHtmlResponse = contentType?.includes('text/html')
    const isDownloadableFile = contentType?.includes('pdf') ||
      contentType?.includes('octet-stream') ||
      contentType?.includes('msword') ||
      contentType?.includes('document') ||
      contentType?.includes('video') ||
      contentType?.includes('audio') ||
      contentType?.includes('epub') ||
      contentType?.includes('zip')

    if (isHtmlResponse && !isDownloadableFile) {
      console.log(`HTML response detected, attempting to scrape: ${url}`)
      const scrapeResult = await scrapeUrl(url)

      if (scrapeResult.success && scrapeResult.content) {
        // Upload scraped content as markdown file
        const uploadResult = await uploadScrapedContent(supabase, scrapeResult.content, title || scrapeResult.title || 'scraped_content')

        return NextResponse.json({
          success: true,
          scraped: true,
          scraped_content: scrapeResult.content,
          content_source: 'scraped',
          file_url: uploadResult?.file_url || null,
          file_path: uploadResult?.file_path || null,
          file_size: uploadResult?.file_size || null,
          message: 'Content scraped from HTML page (no downloadable file)',
        })
      }

      // HTML but scraping failed - still return what we can
      return NextResponse.json({
        error: 'Page returned HTML instead of downloadable file and scraping failed',
        blocked: false,
        reason: 'The URL points to a web page, not a downloadable file. The resource will be saved as a link reference.',
      }, { status: 400 })
    }

    // Get file as buffer
    const arrayBuffer = await response.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Determine storage folder and filename
    const folder = getStorageFolder(contentType, url)
    const filename = generateFilename(url, title || 'document', contentType)
    const timestamp = Date.now()
    const filePath = `${folder}/${timestamp}_${filename}`

    console.log(`Uploading to: ${filePath}`)

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('staging_library')
      .upload(filePath, buffer, {
        contentType: contentType || 'application/octet-stream',
        upsert: false,
      })

    if (uploadError) {
      console.error('Upload error:', uploadError)
      return NextResponse.json(
        { error: `Failed to upload to storage: ${uploadError.message}` },
        { status: 500 }
      )
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('staging_library')
      .getPublicUrl(filePath)

    console.log(`File uploaded successfully: ${urlData.publicUrl}`)

    return NextResponse.json({
      success: true,
      file_url: urlData.publicUrl,
      file_path: filePath,
      file_size: buffer.length,
      content_type: contentType,
      folder,
    })
  } catch (error) {
    console.error('Download error:', error)
    return NextResponse.json(
      { error: 'Failed to download file', details: String(error) },
      { status: 500 }
    )
  }
}
