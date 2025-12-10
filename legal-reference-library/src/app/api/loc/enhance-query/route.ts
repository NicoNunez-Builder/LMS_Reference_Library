import { NextRequest, NextResponse } from 'next/server'

// Legal term expansions and synonyms
const LEGAL_EXPANSIONS: Record<string, string[]> = {
  // Constitutional terms
  'constitution': ['constitutional', 'founding document', 'amendment'],
  'amendment': ['constitutional amendment', 'bill of rights'],
  'first amendment': ['free speech', 'freedom of religion', 'freedom of press', 'first amendment'],
  'second amendment': ['right to bear arms', 'gun rights', 'second amendment'],
  'fourth amendment': ['search and seizure', 'privacy rights', 'fourth amendment'],
  'fifth amendment': ['due process', 'self-incrimination', 'double jeopardy', 'fifth amendment'],
  'fourteenth amendment': ['equal protection', 'due process', 'citizenship', 'fourteenth amendment'],

  // Court terms
  'supreme court': ['scotus', 'supreme court', 'judicial review', 'court opinion'],
  'court case': ['litigation', 'judicial proceeding', 'court decision', 'ruling'],
  'ruling': ['decision', 'opinion', 'judgment', 'order'],
  'appeal': ['appellate', 'circuit court', 'appeal'],

  // Legislative terms
  'bill': ['legislation', 'proposed law', 'congressional bill', 'act'],
  'law': ['statute', 'legislation', 'act', 'code'],
  'congress': ['congressional', 'senate', 'house of representatives', 'legislature'],
  'senate': ['senator', 'upper chamber', 'senate'],
  'regulation': ['regulatory', 'rule', 'federal register', 'CFR'],

  // Rights and liberties
  'civil rights': ['civil liberties', 'equal rights', 'discrimination', 'civil rights act'],
  'voting': ['suffrage', 'election', 'voting rights', 'ballot'],
  'freedom': ['liberty', 'rights', 'civil liberties'],
  'discrimination': ['civil rights', 'equal protection', 'segregation'],

  // Executive terms
  'president': ['presidential', 'executive', 'white house', 'administration'],
  'executive order': ['presidential order', 'executive action', 'proclamation'],
  'treaty': ['international agreement', 'foreign relations', 'diplomatic'],

  // Historical terms
  'founding fathers': ['framers', 'constitutional convention', 'founding era'],
  'civil war': ['reconstruction', 'confederacy', 'union', 'slavery abolition'],
  'slavery': ['abolition', 'emancipation', 'thirteenth amendment'],

  // Procedural terms
  'trial': ['court proceeding', 'litigation', 'hearing'],
  'evidence': ['testimony', 'exhibit', 'proof'],
  'jurisdiction': ['venue', 'authority', 'court power'],
  'precedent': ['stare decisis', 'case law', 'prior ruling'],
}

// Suggested collections based on query content
const COLLECTION_SUGGESTIONS: Record<string, { id: string; name: string; keywords: string[] }[]> = {
  constitutional: [
    { id: 'century-of-lawmaking', name: 'A Century of Lawmaking', keywords: ['constitution', 'amendment', 'founding'] },
    { id: 'continental-congress', name: 'Continental Congress', keywords: ['founding', 'convention', 'declaration'] },
    { id: 'federalist-papers', name: 'Federalist Papers', keywords: ['federalist', 'hamilton', 'madison', 'jay'] },
  ],
  presidential: [
    { id: 'abraham-lincoln', name: 'Abraham Lincoln Papers', keywords: ['lincoln', 'civil war', 'emancipation'] },
    { id: 'george-washington', name: 'George Washington Papers', keywords: ['washington', 'revolution', 'founding'] },
    { id: 'thomas-jefferson', name: 'Thomas Jefferson Papers', keywords: ['jefferson', 'declaration', 'louisiana'] },
    { id: 'james-madison', name: 'James Madison Papers', keywords: ['madison', 'constitution', 'federalist'] },
  ],
  judicial: [
    { id: 'supreme-court', name: 'Supreme Court Reports', keywords: ['supreme court', 'scotus', 'opinion', 'ruling'] },
  ],
}

// Format suggestions based on content type
const FORMAT_SUGGESTIONS: Record<string, string> = {
  'document': 'online-text',
  'case': 'online-text',
  'opinion': 'pdf',
  'image': 'image',
  'photo': 'image',
  'video': 'video',
  'film': 'video',
  'map': 'map',
  'newspaper': 'newspaper',
  'book': 'book',
}

interface EnhancementResult {
  originalQuery: string
  enhancedQuery: string
  additions: string[]
  suggestedCollections: { id: string; name: string }[]
  suggestedFormat: string | null
  explanation: string
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { query } = body

    if (!query || typeof query !== 'string') {
      return NextResponse.json(
        { error: 'Query parameter is required' },
        { status: 400 }
      )
    }

    const originalQuery = query.trim()
    const queryLower = originalQuery.toLowerCase()
    const queryWords = queryLower.split(/\s+/)

    const additions: string[] = []
    const suggestedCollections: { id: string; name: string }[] = []
    let suggestedFormat: string | null = null
    const explanations: string[] = []

    // Find matching expansions
    for (const [term, expansions] of Object.entries(LEGAL_EXPANSIONS)) {
      if (queryLower.includes(term)) {
        // Add expansions that aren't already in the query
        for (const expansion of expansions) {
          if (!queryLower.includes(expansion.toLowerCase()) && !additions.includes(expansion)) {
            additions.push(expansion)
          }
        }
      }
    }

    // Limit additions to most relevant (max 5)
    const limitedAdditions = additions.slice(0, 5)

    // Find suggested collections
    for (const [category, collections] of Object.entries(COLLECTION_SUGGESTIONS)) {
      for (const collection of collections) {
        const matchScore = collection.keywords.filter(kw => queryLower.includes(kw)).length
        if (matchScore > 0 && !suggestedCollections.find(c => c.id === collection.id)) {
          suggestedCollections.push({ id: collection.id, name: collection.name })
        }
      }
    }

    // Limit collections to top 3
    const limitedCollections = suggestedCollections.slice(0, 3)

    // Suggest format
    for (const [keyword, format] of Object.entries(FORMAT_SUGGESTIONS)) {
      if (queryLower.includes(keyword)) {
        suggestedFormat = format
        break
      }
    }

    // Build enhanced query
    let enhancedQuery = originalQuery
    if (limitedAdditions.length > 0) {
      // Add terms in parentheses for clarity
      enhancedQuery = `${originalQuery} (${limitedAdditions.join(' OR ')})`
      explanations.push(`Added related terms: ${limitedAdditions.join(', ')}`)
    }

    // Build explanation
    if (limitedCollections.length > 0) {
      explanations.push(`Recommended collections: ${limitedCollections.map(c => c.name).join(', ')}`)
    }
    if (suggestedFormat) {
      explanations.push(`Suggested format filter: ${suggestedFormat}`)
    }

    const result: EnhancementResult = {
      originalQuery,
      enhancedQuery,
      additions: limitedAdditions,
      suggestedCollections: limitedCollections,
      suggestedFormat,
      explanation: explanations.length > 0
        ? explanations.join('. ')
        : 'Query looks good as-is. Try adding specific dates or legal terms for better results.',
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('Query enhancement error:', error)
    return NextResponse.json(
      { error: 'Failed to enhance query', details: String(error) },
      { status: 500 }
    )
  }
}
