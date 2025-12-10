import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET - Get a single resource by ID
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { id } = await params

    const { data, error } = await supabase
      .from('lr_resources')
      .select(`
        *,
        category:lr_categories(*),
        lr_resource_tags(
          tag:lr_tags(*)
        )
      `)
      .eq('id', id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Resource not found' }, { status: 404 })
      }
      console.error('Supabase error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ resource: data })
  } catch (error) {
    console.error('Resource GET error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    )
  }
}

// PUT - Update a resource
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { id } = await params
    const body = await request.json()

    const {
      title,
      url,
      description,
      category_id,
      source_type,
      file_url,
      file_size,
      thumbnail_url,
      metadata,
      is_public,
    } = body

    // Get current user
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Update resource
    const { data, error } = await supabase
      .from('lr_resources')
      .update({
        title,
        url,
        description,
        category_id,
        source_type,
        file_url,
        file_size,
        thumbnail_url,
        metadata,
        is_public,
      })
      .eq('id', id)
      .eq('user_id', user.id) // Ensure user owns this resource
      .select(`
        *,
        category:lr_categories(*)
      `)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Resource not found or unauthorized' },
          { status: 404 }
        )
      }
      console.error('Supabase update error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ resource: data })
  } catch (error) {
    console.error('Resource PUT error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    )
  }
}

// DELETE - Delete a resource and its file from storage
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient()
    const { id } = await params

    // First, get the resource to find its file_url
    const { data: resource, error: fetchError } = await supabase
      .from('lr_resources')
      .select('*')
      .eq('id', id)
      .single()

    if (fetchError) {
      console.error('Fetch error:', fetchError)
      return NextResponse.json({ error: 'Resource not found' }, { status: 404 })
    }

    // If there's a file in storage, delete it
    if (resource.file_url) {
      // Extract file path from URL
      // URL format: https://xxx.supabase.co/storage/v1/object/public/staging_library/documents/123_file.pdf
      const urlParts = resource.file_url.split('/staging_library/')
      if (urlParts.length > 1) {
        const filePath = urlParts[1]
        console.log(`Deleting file from storage: ${filePath}`)

        const { error: storageError } = await supabase.storage
          .from('staging_library')
          .remove([filePath])

        if (storageError) {
          console.error('Storage delete error:', storageError)
          // Continue with database deletion even if storage fails
        } else {
          console.log('File deleted from storage successfully')
        }
      }
    }

    // Delete from database
    const { error: deleteError } = await supabase
      .from('lr_resources')
      .delete()
      .eq('id', id)

    if (deleteError) {
      console.error('Supabase delete error:', deleteError)
      return NextResponse.json({ error: deleteError.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: 'Resource and file deleted successfully'
    })
  } catch (error) {
    console.error('Resource DELETE error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    )
  }
}
