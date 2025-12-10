import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { CategoryHierarchy } from '@/types'

// GET - Get complete category hierarchy (groups -> folders -> categories)
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Fetch all groups
    const { data: groups, error: groupsError } = await supabase
      .from('lr_groups')
      .select('*')
      .order('display_order', { ascending: true })

    if (groupsError) {
      console.error('Groups fetch error:', groupsError)
      return NextResponse.json({ error: groupsError.message }, { status: 500 })
    }

    // Fetch all folders
    const { data: folders, error: foldersError } = await supabase
      .from('lr_folders')
      .select('*')
      .order('display_order', { ascending: true })

    if (foldersError) {
      console.error('Folders fetch error:', foldersError)
      return NextResponse.json({ error: foldersError.message }, { status: 500 })
    }

    // Fetch all categories
    const { data: categories, error: categoriesError } = await supabase
      .from('lr_categories')
      .select('*')
      .order('display_order', { ascending: true })

    if (categoriesError) {
      console.error('Categories fetch error:', categoriesError)
      return NextResponse.json({ error: categoriesError.message }, { status: 500 })
    }

    // Assemble hierarchy
    const hierarchy: CategoryHierarchy = {
      groups: (groups || []).map(group => {
        // Get folders for this group
        const groupFolders = (folders || [])
          .filter(f => f.group_id === group.id)
          .map(folder => ({
            ...folder,
            categories: (categories || []).filter(c => c.folder_id === folder.id)
          }))

        // Get direct categories (no folder) for this group
        const directCategories = (categories || []).filter(
          c => c.group_id === group.id && !c.folder_id
        )

        return {
          ...group,
          folders: groupFolders,
          categories: directCategories
        }
      })
    }

    return NextResponse.json({ hierarchy })
  } catch (error) {
    console.error('Hierarchy GET error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    )
  }
}
