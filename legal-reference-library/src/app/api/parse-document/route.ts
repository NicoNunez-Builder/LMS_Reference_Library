import { NextRequest, NextResponse } from 'next/server'
import mammoth from 'mammoth'

// pdf-parse v1 is a simple function export
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse') as (buffer: Buffer) => Promise<{
  text: string
  numpages: number
  info: Record<string, unknown>
}>

// Supported file types
const SUPPORTED_TYPES = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/msword': 'doc',
  'text/plain': 'txt',
  'text/markdown': 'md',
  'text/html': 'html',
  'application/rtf': 'rtf',
}

// Parse PDF document using pdf-parse v1 function API
async function parsePDF(buffer: Buffer): Promise<{ text: string; pages: number; info: Record<string, unknown> }> {
  try {
    console.log('Parsing PDF, buffer size:', buffer.length)
    const data = await pdfParse(buffer)
    console.log('PDF parsed successfully, text length:', data.text?.length)
    return {
      text: data.text,
      pages: data.numpages,
      info: data.info || {},
    }
  } catch (error) {
    console.error('PDF parse error:', error)
    throw new Error(`Failed to parse PDF: ${error}`)
  }
}

// Parse Word document (DOCX)
async function parseDocx(buffer: Buffer): Promise<{ text: string; html: string }> {
  try {
    const result = await mammoth.extractRawText({ buffer })
    const htmlResult = await mammoth.convertToHtml({ buffer })
    return {
      text: result.value,
      html: htmlResult.value,
    }
  } catch (error) {
    console.error('DOCX parse error:', error)
    throw new Error(`Failed to parse DOCX: ${error}`)
  }
}

// Parse text-based files
function parseText(buffer: Buffer): string {
  return buffer.toString('utf-8')
}

// Extract text from HTML
function extractTextFromHtml(html: string): string {
  // Simple HTML tag removal - for basic extraction
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const url = formData.get('url') as string | null

    if (!file && !url) {
      return NextResponse.json({
        error: 'Either file or URL is required',
      }, { status: 400 })
    }

    let buffer: Buffer
    let fileName: string
    let mimeType: string

    if (file) {
      // Handle uploaded file
      const arrayBuffer = await file.arrayBuffer()
      buffer = Buffer.from(arrayBuffer)
      fileName = file.name
      mimeType = file.type
    } else if (url) {
      // Fetch file from URL
      console.log(`Fetching document from URL: ${url}`)

      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      })

      if (!response.ok) {
        return NextResponse.json({
          error: `Failed to fetch document: ${response.status} ${response.statusText}`,
        }, { status: 400 })
      }

      const arrayBuffer = await response.arrayBuffer()
      buffer = Buffer.from(arrayBuffer)

      // Get filename from URL or content-disposition
      const contentDisposition = response.headers.get('content-disposition')
      if (contentDisposition) {
        const match = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/)
        fileName = match ? match[1].replace(/['"]/g, '') : url.split('/').pop() || 'document'
      } else {
        fileName = url.split('/').pop()?.split('?')[0] || 'document'
      }

      mimeType = response.headers.get('content-type') || 'application/octet-stream'
    } else {
      return NextResponse.json({
        error: 'No file or URL provided',
      }, { status: 400 })
    }

    console.log(`Parsing document: ${fileName} (${mimeType})`)

    // Determine file type
    let fileType = SUPPORTED_TYPES[mimeType as keyof typeof SUPPORTED_TYPES]

    // If mime type not recognized, try to detect from filename
    if (!fileType) {
      const ext = fileName.split('.').pop()?.toLowerCase()
      if (ext === 'pdf') fileType = 'pdf'
      else if (ext === 'docx') fileType = 'docx'
      else if (ext === 'doc') fileType = 'doc'
      else if (ext === 'txt') fileType = 'txt'
      else if (ext === 'md') fileType = 'md'
      else if (ext === 'html' || ext === 'htm') fileType = 'html'
      else if (ext === 'rtf') fileType = 'rtf'
    }

    if (!fileType) {
      return NextResponse.json({
        error: `Unsupported file type: ${mimeType}. Supported: PDF, DOCX, DOC, TXT, MD, HTML`,
      }, { status: 400 })
    }

    let result: {
      text: string
      html?: string
      pages?: number
      metadata?: Record<string, any>
    }

    switch (fileType) {
      case 'pdf':
        const pdfResult = await parsePDF(buffer)
        result = {
          text: pdfResult.text,
          pages: pdfResult.pages,
          metadata: pdfResult.info,
        }
        break

      case 'docx':
        const docxResult = await parseDocx(buffer)
        result = {
          text: docxResult.text,
          html: docxResult.html,
        }
        break

      case 'doc':
        // For .doc files, we'll try mammoth but it may not work
        // Modern Word uses .docx, .doc is legacy binary format
        try {
          const docResult = await parseDocx(buffer)
          result = {
            text: docResult.text,
            html: docResult.html,
          }
        } catch {
          return NextResponse.json({
            error: 'Legacy .doc format not fully supported. Please convert to .docx',
          }, { status: 400 })
        }
        break

      case 'txt':
      case 'md':
        result = {
          text: parseText(buffer),
        }
        break

      case 'html':
        const htmlContent = parseText(buffer)
        result = {
          text: extractTextFromHtml(htmlContent),
          html: htmlContent,
        }
        break

      case 'rtf':
        // Basic RTF handling - strip RTF codes
        const rtfContent = parseText(buffer)
        result = {
          text: rtfContent
            .replace(/\\[a-z]+\d* ?/gi, '')
            .replace(/[{}]/g, '')
            .replace(/\s+/g, ' ')
            .trim(),
        }
        break

      default:
        return NextResponse.json({
          error: `Unsupported file type: ${fileType}`,
        }, { status: 400 })
    }

    // Calculate some stats
    const wordCount = result.text.split(/\s+/).filter(w => w.length > 0).length
    const charCount = result.text.length

    return NextResponse.json({
      success: true,
      fileName,
      fileType,
      mimeType,
      text: result.text,
      html: result.html,
      pages: result.pages,
      metadata: result.metadata,
      stats: {
        wordCount,
        charCount,
        pages: result.pages,
      },
    })
  } catch (error) {
    console.error('Document parse error:', error)
    return NextResponse.json({
      error: 'Failed to parse document',
      details: String(error),
    }, { status: 500 })
  }
}

// GET endpoint for info
export async function GET() {
  return NextResponse.json({
    supportedTypes: Object.values(SUPPORTED_TYPES),
    maxFileSize: '10MB',
    features: [
      'PDF text extraction with page count',
      'Word document (DOCX) to text and HTML',
      'Plain text and Markdown files',
      'HTML content extraction',
      'URL-based document fetching',
    ],
  })
}
