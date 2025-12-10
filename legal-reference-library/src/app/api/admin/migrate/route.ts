import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Simple migration endpoint to add content columns
export async function POST() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 })
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    // Check if columns exist by attempting to select them
    const { error: checkError } = await supabase
      .from('lr_resources')
      .select('content, content_source')
      .limit(1)

    if (checkError) {
      // Columns don't exist - need to add them via SQL
      // Since we can't run raw SQL through the JS client without a function,
      // we'll return instructions
      return NextResponse.json({
        success: false,
        message: 'Content columns not found. Please run this SQL in Supabase dashboard:',
        sql: `
ALTER TABLE lr_resources
  ADD COLUMN IF NOT EXISTS content TEXT,
  ADD COLUMN IF NOT EXISTS content_source TEXT;
        `.trim()
      })
    }

    return NextResponse.json({
      success: true,
      message: 'Content columns already exist'
    })
  } catch (error) {
    return NextResponse.json(
      { error: 'Migration check failed', details: String(error) },
      { status: 500 }
    )
  }
}

export async function GET() {
  return POST()
}
