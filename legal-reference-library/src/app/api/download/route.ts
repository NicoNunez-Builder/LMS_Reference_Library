import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Single bucket with folder structure
const BUCKET_NAME = 'staging_library'

// Folder types within the bucket
type FolderType = 'documents' | 'videos' | 'thumbnails'

function getFolder(fileType: string): FolderType {
  if (fileType.startsWith('video/')) return 'videos'
  if (fileType.startsWith('image/')) return 'thumbnails'
  return 'documents'
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const body = await request.json()
    const { url, fileName, folder } = body

    if (!url || !fileName) {
      return NextResponse.json(
        { error: 'URL and fileName are required' },
        { status: 400 }
      )
    }

    // Get current user (optional for this endpoint, but recommended)
    const {
      data: { user },
    } = await supabase.auth.getUser()

    // Download the file from the URL
    const fileResponse = await fetch(url)

    if (!fileResponse.ok) {
      return NextResponse.json(
        { error: 'Failed to download file from URL' },
        { status: 400 }
      )
    }

    const fileBlob = await fileResponse.blob()
    const arrayBuffer = await fileBlob.arrayBuffer()
    const fileBuffer = Buffer.from(arrayBuffer)

    // Determine folder based on file type or use provided folder
    const targetFolder: FolderType = folder || getFolder(fileBlob.type)

    // Generate unique file name with folder path
    const timestamp = Date.now()
    const uniqueFileName = `${timestamp}-${fileName}`
    const filePath = user
      ? `${targetFolder}/${user.id}/${uniqueFileName}`
      : `${targetFolder}/public/${uniqueFileName}`

    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(filePath, fileBuffer, {
        contentType: fileBlob.type,
        upsert: false,
      })

    if (error) {
      console.error('Supabase storage error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Get public URL
    const {
      data: { publicUrl },
    } = supabase.storage.from(BUCKET_NAME).getPublicUrl(filePath)

    return NextResponse.json({
      success: true,
      file_url: publicUrl,
      file_path: filePath,
      file_size: fileBuffer.length,
      bucket: BUCKET_NAME,
      folder: targetFolder,
    })
  } catch (error) {
    console.error('Download error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    )
  }
}

// GET - Get download URL for a file
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)

    const filePath = searchParams.get('path')
    const expiresIn = parseInt(searchParams.get('expiresIn') || '3600')

    if (!filePath) {
      return NextResponse.json(
        { error: 'File path is required' },
        { status: 400 }
      )
    }

    // Get signed URL for private files
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .createSignedUrl(filePath, expiresIn)

    if (error) {
      console.error('Supabase storage error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      signedUrl: data.signedUrl,
      expiresIn,
    })
  } catch (error) {
    console.error('Get download URL error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    )
  }
}
