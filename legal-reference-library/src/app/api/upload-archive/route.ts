import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import JSZip from 'jszip'
import * as tar from 'tar-stream'
import { createGunzip } from 'zlib'
import { Readable } from 'stream'

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

interface ExtractedFile {
  name: string
  path: string
  size: number
  type: string
  sourceType: string
  content?: ArrayBuffer
}

// Detect archive type from filename
function getArchiveType(filename: string): 'zip' | 'targz' | 'tar' | null {
  const lower = filename.toLowerCase()
  if (lower.endsWith('.zip')) return 'zip'
  if (lower.endsWith('.tar.gz') || lower.endsWith('.tgz')) return 'targz'
  if (lower.endsWith('.tar')) return 'tar'
  return null
}

// Extract files from ZIP
async function extractFromZip(arrayBuffer: ArrayBuffer): Promise<{ files: ExtractedFile[], skipped: string[] }> {
  const zip = await JSZip.loadAsync(arrayBuffer)
  const files: ExtractedFile[] = []
  const skipped: string[] = []

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
    } else if (filename && !filename.startsWith('.')) {
      skipped.push(relativePath)
    }
  })

  return { files, skipped }
}

// Get file content from ZIP
async function getZipFileContent(arrayBuffer: ArrayBuffer, filePath: string): Promise<ArrayBuffer | null> {
  const zip = await JSZip.loadAsync(arrayBuffer)
  const zipEntry = zip.file(filePath)
  if (!zipEntry) return null
  return zipEntry.async('arraybuffer')
}

// Extract files from tar.gz
async function extractFromTarGz(arrayBuffer: ArrayBuffer, isGzipped: boolean): Promise<{ files: ExtractedFile[], skipped: string[], fileContents: Map<string, Buffer> }> {
  return new Promise((resolve, reject) => {
    const files: ExtractedFile[] = []
    const skipped: string[] = []
    const fileContents = new Map<string, Buffer>()

    const extract = tar.extract()

    extract.on('entry', (header, stream, next) => {
      const chunks: Buffer[] = []

      stream.on('data', (chunk: Buffer) => chunks.push(chunk))

      stream.on('end', () => {
        const content = Buffer.concat(chunks)
        const relativePath = header.name
        const filename = relativePath.split('/').pop() || relativePath

        // Skip directories and hidden files
        if (header.type === 'directory' || relativePath.startsWith('.') || filename.startsWith('.')) {
          next()
          return
        }

        if (isSupportedFile(filename)) {
          files.push({
            name: filename,
            path: relativePath,
            size: header.size || content.length,
            type: filename.split('.').pop()?.toUpperCase() || 'UNKNOWN',
            sourceType: getSourceType(filename),
          })
          fileContents.set(relativePath, content)
        } else if (filename) {
          skipped.push(relativePath)
        }

        next()
      })

      stream.on('error', (err: Error) => {
        console.error('Stream error:', err)
        next()
      })

      stream.resume()
    })

    extract.on('finish', () => {
      resolve({ files, skipped, fileContents })
    })

    extract.on('error', (err: Error) => {
      reject(err)
    })

    // Create readable stream from buffer
    const bufferStream = new Readable()
    bufferStream.push(Buffer.from(arrayBuffer))
    bufferStream.push(null)

    if (isGzipped) {
      const gunzip = createGunzip()
      bufferStream.pipe(gunzip).pipe(extract)
    } else {
      bufferStream.pipe(extract)
    }
  })
}

// POST - Extract and list archive contents (preview mode)
// or extract and upload all files
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const mode = formData.get('mode') as string || 'preview' // 'preview' or 'upload'
    const categoryId = formData.get('category_id') as string | null
    const selectedFiles = formData.get('selected_files') as string | null // JSON array of file paths

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    const archiveType = getArchiveType(file.name)
    if (!archiveType) {
      return NextResponse.json({
        error: 'Unsupported archive format',
        message: 'Supported formats: .zip, .tar.gz, .tgz, .tar'
      }, { status: 400 })
    }

    console.log(`Processing ${archiveType.toUpperCase()} archive: ${file.name} (mode: ${mode})`)

    // Read archive file
    const arrayBuffer = await file.arrayBuffer()

    let files: ExtractedFile[] = []
    let skippedFiles: string[] = []
    let tarFileContents: Map<string, Buffer> | null = null

    // Extract based on archive type
    if (archiveType === 'zip') {
      const result = await extractFromZip(arrayBuffer)
      files = result.files
      skippedFiles = result.skipped
    } else {
      const result = await extractFromTarGz(arrayBuffer, archiveType === 'targz')
      files = result.files
      skippedFiles = result.skipped
      tarFileContents = result.fileContents
    }

    // Preview mode - just return the file list
    if (mode === 'preview') {
      return NextResponse.json({
        success: true,
        archiveName: file.name,
        archiveType,
        totalFiles: files.length,
        skippedFiles: skippedFiles.length,
        files,
        skipped: skippedFiles,
        message: `Found ${files.length} supported files in ${archiveType.toUpperCase()} archive`,
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

      // Parse selected files if provided
      let filesToUpload = files
      if (selectedFiles) {
        try {
          const selectedPaths = JSON.parse(selectedFiles) as string[]
          filesToUpload = files.filter(f => selectedPaths.includes(f.path))
        } catch {
          // If parsing fails, upload all files
        }
      }

      const uploaded: { name: string; url: string; id?: string }[] = []
      const failed: { name: string; error: string }[] = []

      for (const fileInfo of filesToUpload) {
        try {
          // Get file content based on archive type
          let content: ArrayBuffer | Buffer | null = null

          if (archiveType === 'zip') {
            content = await getZipFileContent(arrayBuffer, fileInfo.path)
          } else if (tarFileContents) {
            content = tarFileContents.get(fileInfo.path) || null
          }

          if (!content) {
            failed.push({ name: fileInfo.name, error: 'File not found in archive' })
            continue
          }

          const folder = getStorageFolder(fileInfo.name)
          const timestamp = Date.now()
          const safeName = sanitizeFilename(fileInfo.name)
          const storagePath = `${folder}/${timestamp}_${safeName}`

          // Upload to Supabase Storage
          const { error: uploadError } = await supabase.storage
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
              file_size: content instanceof Buffer ? content.length : content.byteLength,
              file_path: storagePath,
              category_id: categoryId,
              source_type: fileInfo.sourceType,
              is_public: true,
              metadata: {
                extracted_from: file.name,
                original_path: fileInfo.path,
                archive_type: archiveType,
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
        archiveName: file.name,
        archiveType,
        uploaded: uploaded.length,
        failed: failed.length,
        uploadedFiles: uploaded,
        failedFiles: failed,
        message: `Uploaded ${uploaded.length} of ${filesToUpload.length} files`,
      })
    }

    return NextResponse.json({ error: 'Invalid mode' }, { status: 400 })
  } catch (error) {
    console.error('Archive upload error:', error)
    return NextResponse.json({
      error: 'Failed to process archive',
      details: String(error),
    }, { status: 500 })
  }
}

// GET - Check configuration
export async function GET() {
  return NextResponse.json({
    supported: true,
    supportedArchives: ['ZIP', 'TAR.GZ', 'TGZ', 'TAR'],
    supportedFileTypes: SUPPORTED_EXTENSIONS.map(e => e.toUpperCase()),
    message: 'Archive upload API is ready (ZIP and TAR.GZ supported)',
  })
}
