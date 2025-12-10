import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import JSZip from 'jszip'

// Supported file extensions
const SUPPORTED_EXTENSIONS = [
  'pdf', 'doc', 'docx', 'epub', 'mobi',
  'mp4', 'webm', 'mov', 'avi',
  'mp3', 'wav', 'ogg',
  'xls', 'xlsx', 'ppt', 'pptx',
  'txt', 'md', 'json'
]

// Determine storage folder based on file extension
function getStorageFolder(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || ''

  if (['mp4', 'webm', 'mov', 'avi'].includes(ext)) return 'videos'
  if (['mp3', 'wav', 'ogg'].includes(ext)) return 'audio'
  if (['epub', 'mobi'].includes(ext)) return 'ebooks'
  return 'documents'
}

// Determine source type based on file extension
function getSourceType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || ''

  if (ext === 'pdf') return 'pdf'
  if (['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'md'].includes(ext)) return 'document'
  if (['epub', 'mobi'].includes(ext)) return 'ebook'
  if (['mp4', 'webm', 'mov', 'avi'].includes(ext)) return 'video'
  return 'document'
}

// Check if file is supported
function isSupportedFile(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase() || ''
  return SUPPORTED_EXTENSIONS.includes(ext)
}

// Sanitize filename for storage
function sanitizeFilename(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9.-]/g, '_')
}

interface ExtractedFile {
  name: string
  path: string
  size: number
  type: string
  sourceType: string
}

// POST - Extract and list ZIP contents (preview mode)
// or extract and upload all files
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const mode = formData.get('mode') as string || 'preview' // 'preview' or 'upload'
    const categoryId = formData.get('category_id') as string | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    if (!file.name.toLowerCase().endsWith('.zip')) {
      return NextResponse.json({ error: 'File must be a ZIP archive' }, { status: 400 })
    }

    console.log(`Processing ZIP file: ${file.name} (mode: ${mode})`)

    // Read ZIP file
    const arrayBuffer = await file.arrayBuffer()
    const zip = await JSZip.loadAsync(arrayBuffer)

    // Extract file list
    const files: ExtractedFile[] = []
    const skippedFiles: string[] = []

    zip.forEach((relativePath, zipEntry) => {
      // Skip directories and hidden files
      if (zipEntry.dir || relativePath.startsWith('__MACOSX') || relativePath.startsWith('.')) {
        return
      }

      const filename = relativePath.split('/').pop() || relativePath

      if (isSupportedFile(filename)) {
        files.push({
          name: filename,
          path: relativePath,
          size: (zipEntry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize || 0,
          type: filename.split('.').pop()?.toUpperCase() || 'UNKNOWN',
          sourceType: getSourceType(filename),
        })
      } else {
        skippedFiles.push(relativePath)
      }
    })

    // Preview mode - just return the file list
    if (mode === 'preview') {
      return NextResponse.json({
        success: true,
        zipName: file.name,
        totalFiles: files.length,
        skippedFiles: skippedFiles.length,
        files,
        skipped: skippedFiles,
        message: `Found ${files.length} supported files in ZIP`,
      })
    }

    // Upload mode - extract and upload each file
    if (mode === 'upload') {
      if (!categoryId) {
        return NextResponse.json({ error: 'category_id is required for upload mode' }, { status: 400 })
      }

      // Initialize Supabase client
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

      if (!supabaseUrl || !supabaseKey) {
        return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 })
      }

      const supabase = createClient(supabaseUrl, supabaseKey)

      const uploaded: { name: string; url: string; id?: string }[] = []
      const failed: { name: string; error: string }[] = []

      for (const fileInfo of files) {
        try {
          // Extract file content
          const zipEntry = zip.file(fileInfo.path)
          if (!zipEntry) {
            failed.push({ name: fileInfo.name, error: 'File not found in ZIP' })
            continue
          }

          const content = await zipEntry.async('arraybuffer')
          const folder = getStorageFolder(fileInfo.name)
          const timestamp = Date.now()
          const safeName = sanitizeFilename(fileInfo.name)
          const storagePath = `${folder}/${timestamp}_${safeName}`

          // Upload to Supabase Storage
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('staging_library')
            .upload(storagePath, content, {
              contentType: getContentType(fileInfo.name),
              upsert: false,
            })

          if (uploadError) {
            failed.push({ name: fileInfo.name, error: uploadError.message })
            continue
          }

          // Get public URL
          const { data: urlData } = supabase.storage
            .from('staging_library')
            .getPublicUrl(storagePath)

          const fileUrl = urlData?.publicUrl

          // Create resource record in database
          const { data: resourceData, error: resourceError } = await supabase
            .from('lr_resources')
            .insert({
              title: fileInfo.name.replace(/\.[^/.]+$/, '').replace(/_/g, ' '),
              url: fileUrl,
              file_url: fileUrl,
              file_size: content.byteLength,
              file_path: storagePath,
              category_id: categoryId,
              source_type: fileInfo.sourceType,
              is_public: true,
              metadata: {
                extracted_from: file.name,
                original_path: fileInfo.path,
              },
            })
            .select('id')
            .single()

          if (resourceError) {
            console.error('Resource insert error:', resourceError)
            // File uploaded but resource record failed
            uploaded.push({ name: fileInfo.name, url: fileUrl || '' })
          } else {
            uploaded.push({ name: fileInfo.name, url: fileUrl || '', id: resourceData?.id })
          }
        } catch (error) {
          failed.push({ name: fileInfo.name, error: String(error) })
        }
      }

      return NextResponse.json({
        success: true,
        zipName: file.name,
        uploaded: uploaded.length,
        failed: failed.length,
        uploadedFiles: uploaded,
        failedFiles: failed,
        message: `Uploaded ${uploaded.length} of ${files.length} files`,
      })
    }

    return NextResponse.json({ error: 'Invalid mode' }, { status: 400 })
  } catch (error) {
    console.error('ZIP upload error:', error)
    return NextResponse.json({
      error: 'Failed to process ZIP file',
      details: String(error),
    }, { status: 500 })
  }
}

// Helper to get content type
function getContentType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || ''
  const types: Record<string, string> = {
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    epub: 'application/epub+zip',
    mobi: 'application/x-mobipocket-ebook',
    mp4: 'video/mp4',
    webm: 'video/webm',
    mov: 'video/quicktime',
    avi: 'video/x-msvideo',
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    ogg: 'audio/ogg',
    txt: 'text/plain',
    md: 'text/markdown',
    json: 'application/json',
  }
  return types[ext] || 'application/octet-stream'
}

// GET - Check configuration
export async function GET() {
  return NextResponse.json({
    supported: true,
    supportedTypes: SUPPORTED_EXTENSIONS.map(e => e.toUpperCase()),
    message: 'ZIP upload API is ready',
  })
}
