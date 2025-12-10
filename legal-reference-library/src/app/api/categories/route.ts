import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET - List categories with optional group/folder filtering
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)

    // Optional filters
    const groupSlug = searchParams.get('group')
    const folderSlug = searchParams.get('folder')

    // Build query with relations
    let query = supabase
      .from('lr_categories')
      .select(`
        *,
        group:lr_groups(*),
        folder:lr_folders(*)
      `)
      .order('display_order', { ascending: true })

    // Filter by group if specified
    if (groupSlug) {
      // First get the group ID
      const { data: groupData } = await supabase
        .from('lr_groups')
        .select('id')
        .eq('slug', groupSlug)
        .single()

      if (groupData) {
        query = query.eq('group_id', groupData.id)
      }
    }

    // Filter by folder if specified
    if (folderSlug && groupSlug) {
      // Get the folder ID within the group
      const { data: groupData } = await supabase
        .from('lr_groups')
        .select('id')
        .eq('slug', groupSlug)
        .single()

      if (groupData) {
        const { data: folderData } = await supabase
          .from('lr_folders')
          .select('id')
          .eq('slug', folderSlug)
          .eq('group_id', groupData.id)
          .single()

        if (folderData) {
          query = query.eq('folder_id', folderData.id)
        }
      }
    }

    const { data, error } = await query

    if (error) {
      console.error('Supabase error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ categories: data })
  } catch (error) {
    console.error('Categories GET error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    )
  }
}
