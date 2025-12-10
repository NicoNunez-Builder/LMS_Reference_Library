import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cleanContent, getCleaningStats, CleaningOptions } from '@/lib/ai'

// Initialize Supabase client
function getSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase not configured')
  }

  return createClient(supabaseUrl, supabaseKey)
}

// POST - Preview or apply cleaning to a resource's content
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      resource_id,
      text, // Direct text input (optional, alternative to resource_id)
      options = {}, // CleaningOptions
      apply = false, // If true, save the cleaned content back to the resource
    } = body

    let originalContent = text || ''
    let resourceTitle = 'Direct Input'

    // If resource_id provided, fetch content from database
    if (resource_id && !text) {
      const supabase = getSupabase()

      const { data: resource, error } = await supabase
        .from('lr_resources')
        .select('id, title, content, description')
        .eq('id', resource_id)
        .single()

      if (error || !resource) {
        return NextResponse.json(
          { error: 'Resource not found' },
          { status: 404 }
        )
      }

      originalContent = resource.content || resource.description || ''
      resourceTitle = resource.title
    }

    if (!originalContent) {
      return NextResponse.json(
        { error: 'No content to clean' },
        { status: 400 }
      )
    }

    // Clean the content - use conservative defaults for legal documents
    const cleaningOptions: CleaningOptions = {
      removeHtml: options.removeHtml ?? true,
      removeUrls: options.removeUrls ?? false, // Disabled - URLs are often citations
      removeBoilerplate: options.removeBoilerplate ?? false, // Disabled - legal docs don't have web boilerplate
      normalizeWhitespace: options.normalizeWhitespace ?? true,
      removeShortLines: options.removeShortLines ?? false, // Disabled - too aggressive
      minLineLength: options.minLineLength ?? 10,
      removeDuplicates: options.removeDuplicates ?? false, // Disabled - legal docs often repeat phrases
      normalizeMarkdown: options.normalizeMarkdown ?? true,
    }

    const cleanedContent = cleanContent(originalContent, cleaningOptions)
    const stats = getCleaningStats(originalContent, cleanedContent)

    // If apply is true and we have a resource_id, save the cleaned content
    if (apply && resource_id) {
      const supabase = getSupabase()

      const { error: updateError } = await supabase
        .from('lr_resources')
        .update({ content: cleanedContent })
        .eq('id', resource_id)

      if (updateError) {
        return NextResponse.json(
          { error: 'Failed to save cleaned content', details: updateError.message },
          { status: 500 }
        )
      }

      return NextResponse.json({
        success: true,
        applied: true,
        resource_id,
        title: resourceTitle,
        stats,
        message: `Content cleaned and saved. Reduced by ${stats.reductionPercent}%`,
      })
    }

    // Return preview
    return NextResponse.json({
      success: true,
      applied: false,
      resource_id: resource_id || null,
      title: resourceTitle,
      original: {
        content: originalContent.slice(0, 2000) + (originalContent.length > 2000 ? '...' : ''),
        length: originalContent.length,
      },
      cleaned: {
        content: cleanedContent.slice(0, 2000) + (cleanedContent.length > 2000 ? '...' : ''),
        length: cleanedContent.length,
      },
      stats,
      options: cleaningOptions,
    })
  } catch (error) {
    console.error('Clean content error:', error)
    return NextResponse.json(
      { error: 'Failed to clean content', details: String(error) },
      { status: 500 }
    )
  }
}

// GET - Get cleaning stats for a resource without modifying
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const resourceId = searchParams.get('resource_id')

    if (!resourceId) {
      return NextResponse.json(
        { error: 'resource_id required' },
        { status: 400 }
      )
    }

    const supabase = getSupabase()

    const { data: resource, error } = await supabase
      .from('lr_resources')
      .select('id, title, content, description')
      .eq('id', resourceId)
      .single()

    if (error || !resource) {
      return NextResponse.json(
        { error: 'Resource not found' },
        { status: 404 }
      )
    }

    const originalContent = resource.content || resource.description || ''

    if (!originalContent) {
      return NextResponse.json({
        resource_id: resourceId,
        title: resource.title,
        hasContent: false,
        stats: null,
      })
    }

    const cleanedContent = cleanContent(originalContent)
    const stats = getCleaningStats(originalContent, cleanedContent)

    return NextResponse.json({
      resource_id: resourceId,
      title: resource.title,
      hasContent: true,
      stats,
    })
  } catch (error) {
    console.error('Get cleaning stats error:', error)
    return NextResponse.json(
      { error: 'Failed to get cleaning stats', details: String(error) },
      { status: 500 }
    )
  }
}
