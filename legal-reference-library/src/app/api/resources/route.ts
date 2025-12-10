import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET - List all resources with optional filters
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)

    const category = searchParams.get('category')
    const sourceType = searchParams.get('source_type')
    const query = searchParams.get('query')
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    let queryBuilder = supabase
      .from('lr_resources')
      .select(`
        *,
        category:lr_categories(*)
      `)
      .eq('is_public', true)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    // Apply filters
    if (category) {
      queryBuilder = queryBuilder.eq('category.slug', category)
    }

    if (sourceType) {
      queryBuilder = queryBuilder.eq('source_type', sourceType)
    }

    if (query) {
      queryBuilder = queryBuilder.or(
        `title.ilike.%${query}%,description.ilike.%${query}%`
      )
    }

    const { data, error, count } = await queryBuilder

    if (error) {
      console.error('Supabase error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      resources: data,
      count,
      limit,
      offset,
    })
  } catch (error) {
    console.error('Resources GET error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    )
  }
}

// POST - Create a new resource
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
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
      content,
      content_source,
      metadata,
      is_public = true,
    } = body

    // Validate required fields
    if (!title || !url || !category_id || !source_type) {
      return NextResponse.json(
        { error: 'Missing required fields: title, url, category_id, source_type' },
        { status: 400 }
      )
    }

    // Get current user (if authenticated)
    const {
      data: { user },
    } = await supabase.auth.getUser()

    const { data, error } = await supabase
      .from('lr_resources')
      .insert({
        title,
        url,
        description,
        category_id,
        source_type,
        file_url,
        file_size,
        thumbnail_url,
        content,
        content_source,
        metadata,
        is_public,
        user_id: user?.id || null,
      })
      .select(`
        *,
        category:lr_categories(*)
      `)
      .single()

    if (error) {
      console.error('Supabase insert error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ resource: data }, { status: 201 })
  } catch (error) {
    console.error('Resources POST error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    )
  }
}
