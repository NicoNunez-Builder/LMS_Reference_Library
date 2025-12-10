import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { chunkText, generateEmbeddings, countTokens, cleanContent, getCleaningStats } from '@/lib/ai'

// Initialize Supabase client
function getSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase not configured')
  }

  return createClient(supabaseUrl, supabaseKey)
}

// POST - Generate embeddings for a resource
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { resource_id, resource_ids, force = false, cleanData = true } = body

    if (!resource_id && !resource_ids) {
      return NextResponse.json(
        { error: 'resource_id or resource_ids required' },
        { status: 400 }
      )
    }

    const supabase = getSupabase()
    const ids = resource_ids || [resource_id]

    const results: {
      resource_id: string
      title: string
      chunks: number
      status: 'success' | 'skipped' | 'error'
      error?: string
      cleaningStats?: {
        originalChars: number
        cleanedChars: number
        reductionPercent: number
      } | null
    }[] = []

    for (const id of ids) {
      try {
        // Check if embeddings already exist
        if (!force) {
          const { count } = await supabase
            .from('lr_embeddings')
            .select('id', { count: 'exact', head: true })
            .eq('resource_id', id)

          if (count && count > 0) {
            results.push({
              resource_id: id,
              title: '',
              chunks: count,
              status: 'skipped',
            })
            continue
          }
        }

        // Get resource content
        const { data: resource, error: resourceError } = await supabase
          .from('lr_resources')
          .select('id, title, content, description, url')
          .eq('id', id)
          .single()

        if (resourceError || !resource) {
          results.push({
            resource_id: id,
            title: '',
            chunks: 0,
            status: 'error',
            error: 'Resource not found',
          })
          continue
        }

        // Get text content
        const rawContent = resource.content || resource.description || ''

        if (!rawContent || rawContent.length < 50) {
          results.push({
            resource_id: id,
            title: resource.title,
            chunks: 0,
            status: 'error',
            error: 'No content to embed (content too short or missing)',
          })
          continue
        }

        // Clean the content before embedding
        const textContent = cleanData ? cleanContent(rawContent) : rawContent
        const cleaningStats = cleanData ? getCleaningStats(rawContent, textContent) : null

        if (!textContent || textContent.length < 50) {
          results.push({
            resource_id: id,
            title: resource.title,
            chunks: 0,
            status: 'error',
            error: 'Content too short after cleaning',
          })
          continue
        }

        // Delete existing embeddings if force
        if (force) {
          await supabase
            .from('lr_embeddings')
            .delete()
            .eq('resource_id', id)
        }

        // Chunk the text
        const chunks = chunkText(textContent)

        if (chunks.length === 0) {
          results.push({
            resource_id: id,
            title: resource.title,
            chunks: 0,
            status: 'error',
            error: 'No chunks generated',
          })
          continue
        }

        // Generate embeddings in batches
        const batchSize = 100
        const allEmbeddings: number[][] = []

        for (let i = 0; i < chunks.length; i += batchSize) {
          const batch = chunks.slice(i, i + batchSize)
          const embeddings = await generateEmbeddings(batch)
          allEmbeddings.push(...embeddings)
        }

        // Insert embeddings
        const embeddingRecords = chunks.map((chunk, index) => ({
          resource_id: id,
          chunk_index: index,
          chunk_text: chunk,
          embedding: `[${allEmbeddings[index].join(',')}]`,
          token_count: countTokens(chunk),
          metadata: {
            source_title: resource.title,
            source_url: resource.url,
          },
        }))

        const { error: insertError } = await supabase
          .from('lr_embeddings')
          .insert(embeddingRecords)

        if (insertError) {
          console.error('Insert error:', insertError)
          results.push({
            resource_id: id,
            title: resource.title,
            chunks: 0,
            status: 'error',
            error: insertError.message,
          })
          continue
        }

        results.push({
          resource_id: id,
          title: resource.title,
          chunks: chunks.length,
          status: 'success',
          cleaningStats,
        })
      } catch (err) {
        results.push({
          resource_id: id,
          title: '',
          chunks: 0,
          status: 'error',
          error: String(err),
        })
      }
    }

    const successful = results.filter(r => r.status === 'success').length
    const skipped = results.filter(r => r.status === 'skipped').length
    const errors = results.filter(r => r.status === 'error').length

    return NextResponse.json({
      success: true,
      processed: results.length,
      successful,
      skipped,
      errors,
      results,
      message: `Embedded ${successful} resources, ${skipped} skipped, ${errors} errors`,
    })
  } catch (error) {
    console.error('Embed error:', error)
    return NextResponse.json(
      { error: 'Failed to generate embeddings', details: String(error) },
      { status: 500 }
    )
  }
}

// GET - Check embedding status for resources
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const resourceId = searchParams.get('resource_id')
    const categoryId = searchParams.get('category_id')

    const supabase = getSupabase()

    if (resourceId) {
      // Get embedding count for a specific resource
      const { count, error } = await supabase
        .from('lr_embeddings')
        .select('id', { count: 'exact', head: true })
        .eq('resource_id', resourceId)

      if (error) throw error

      return NextResponse.json({
        resource_id: resourceId,
        embedded: (count || 0) > 0,
        chunks: count || 0,
      })
    }

    if (categoryId) {
      // Get embedding stats for a category
      const { data: resources } = await supabase
        .from('lr_resources')
        .select('id, title')
        .eq('category_id', categoryId)

      if (!resources || resources.length === 0) {
        return NextResponse.json({
          category_id: categoryId,
          total_resources: 0,
          embedded_resources: 0,
          resources: [],
        })
      }

      const resourceIds = resources.map(r => r.id)

      // Get embeddings for these resources
      const { data: embeddings } = await supabase
        .from('lr_embeddings')
        .select('resource_id')
        .in('resource_id', resourceIds)

      const embeddedIds = new Set(embeddings?.map(e => e.resource_id) || [])

      const resourceStats = resources.map(r => ({
        id: r.id,
        title: r.title,
        embedded: embeddedIds.has(r.id),
      }))

      return NextResponse.json({
        category_id: categoryId,
        total_resources: resources.length,
        embedded_resources: embeddedIds.size,
        resources: resourceStats,
      })
    }

    // Return general stats
    const { count: totalEmbeddings } = await supabase
      .from('lr_embeddings')
      .select('id', { count: 'exact', head: true })

    const { data: embeddedResources } = await supabase
      .from('lr_embeddings')
      .select('resource_id')

    const uniqueResources = new Set(embeddedResources?.map(e => e.resource_id) || [])

    return NextResponse.json({
      total_embeddings: totalEmbeddings || 0,
      embedded_resources: uniqueResources.size,
      configured: !!process.env.OPENAI_API_KEY,
    })
  } catch (error) {
    console.error('Get embeddings error:', error)
    return NextResponse.json(
      { error: 'Failed to get embedding status', details: String(error) },
      { status: 500 }
    )
  }
}

// DELETE - Remove embeddings for a resource
export async function DELETE(request: NextRequest) {
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

    const { error } = await supabase
      .from('lr_embeddings')
      .delete()
      .eq('resource_id', resourceId)

    if (error) throw error

    return NextResponse.json({
      success: true,
      message: `Deleted embeddings for resource ${resourceId}`,
    })
  } catch (error) {
    console.error('Delete embeddings error:', error)
    return NextResponse.json(
      { error: 'Failed to delete embeddings', details: String(error) },
      { status: 500 }
    )
  }
}
