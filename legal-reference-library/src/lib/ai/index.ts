import OpenAI from 'openai'
import { GoogleGenerativeAI } from '@google/generative-ai'

// Initialize clients
export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export const gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '')

// Chunking configuration
export const CHUNK_SIZE = 1000 // characters
export const CHUNK_OVERLAP = 200 // characters

// Data cleaning configuration - ONLY match exact standalone boilerplate lines
const BOILERPLATE_PATTERNS = [
  // Navigation/Menu patterns - exact matches only
  /^(home|menu|navigation|search|login|sign in|sign up|register|subscribe|newsletter|contact us|about us|help|faq|sitemap)$/i,
  /^(skip to (main )?content|back to top|read more|show more|load more|view all|see all)$/i,
  // Social media - exact standalone matches only
  /^(share|tweet|like|follow us|subscribe|comment|reply)$/i,
  /^(share on|follow on|like on)\s+(facebook|twitter|linkedin|instagram)$/i,
  // Empty/formatting lines
  /^[-=_*]{3,}$/,
  /^\s*\|\s*$/,
  // Ads/Promotional - exact matches only
  /^(advertisement|sponsored|promoted|ad)$/i,
]

const URL_PATTERNS = [
  // Only standalone URLs on their own line
  /^https?:\/\/[^\s]+$/,
]

const MARKDOWN_CLEANUP_PATTERNS = [
  // Excessive heading markers
  { pattern: /^#{4,}\s*/gm, replacement: '### ' },
  // Excessive horizontal rules
  { pattern: /^[-=_*]{4,}\s*$/gm, replacement: '---' },
  // Multiple consecutive horizontal rules
  { pattern: /(^---\s*\n){2,}/gm, replacement: '---\n' },
  // Excessive newlines
  { pattern: /\n{4,}/g, replacement: '\n\n\n' },
  // Trailing whitespace
  { pattern: /[ \t]+$/gm, replacement: '' },
  // Leading whitespace on lines (except indentation)
  { pattern: /^[ \t]{4,}/gm, replacement: '    ' },
]

// Clean and preprocess content before embedding
export function cleanContent(text: string, options: CleaningOptions = {}): string {
  if (!text || !text.trim()) {
    return ''
  }

  const {
    removeHtml = true,
    removeUrls = false, // Disabled - URLs in legal docs are often citations
    removeBoilerplate = false, // Disabled - legal docs don't have web boilerplate
    normalizeWhitespace = true,
    removeShortLines = false, // Disabled - too aggressive for legal docs
    minLineLength = 10,
    removeDuplicates = false, // Disabled - legal docs often have repeated phrases
    normalizeMarkdown = true,
  } = options

  let cleaned = text

  // Step 1: Remove HTML tags
  if (removeHtml) {
    // Remove script and style content
    cleaned = cleaned.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    cleaned = cleaned.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    // Remove HTML comments
    cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, '')
    // Remove HTML tags but keep content
    cleaned = cleaned.replace(/<[^>]+>/g, ' ')
    // Decode common HTML entities
    cleaned = cleaned
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&[a-z]+;/gi, '') // Remove other entities
  }

  // Step 2: Normalize markdown
  if (normalizeMarkdown) {
    for (const { pattern, replacement } of MARKDOWN_CLEANUP_PATTERNS) {
      cleaned = cleaned.replace(pattern, replacement)
    }
  }

  // Step 3: Remove standalone URLs
  if (removeUrls) {
    for (const pattern of URL_PATTERNS) {
      cleaned = cleaned.replace(pattern, ' ')
    }
  }

  // Step 4: Normalize whitespace
  if (normalizeWhitespace) {
    // Replace tabs with spaces
    cleaned = cleaned.replace(/\t/g, '    ')
    // Normalize multiple spaces
    cleaned = cleaned.replace(/ {2,}/g, ' ')
    // Normalize line endings
    cleaned = cleaned.replace(/\r\n/g, '\n')
    cleaned = cleaned.replace(/\r/g, '\n')
  }

  // Step 5: Process line by line for boilerplate and short lines
  let lines = cleaned.split('\n')

  if (removeBoilerplate) {
    lines = lines.filter(line => {
      const trimmed = line.trim()
      if (!trimmed) return true // Keep empty lines for now

      // Check against boilerplate patterns
      for (const pattern of BOILERPLATE_PATTERNS) {
        if (pattern.test(trimmed)) {
          return false
        }
      }
      return true
    })
  }

  if (removeShortLines) {
    lines = lines.filter(line => {
      const trimmed = line.trim()
      // Keep empty lines (paragraph separators)
      if (!trimmed) return true
      // Keep heading-like lines
      if (trimmed.startsWith('#')) return true
      // Keep list items
      if (/^[-*•]\s/.test(trimmed)) return true
      if (/^\d+\.\s/.test(trimmed)) return true
      // Keep legal document markers (sections, subsections, articles)
      if (/^§\s*\d/.test(trimmed)) return true // § 1, § 101, etc.
      if (/^\([a-z0-9]+\)/i.test(trimmed)) return true // (a), (1), (i), etc.
      if (/^(Section|Article|Chapter|Part|Title|Rule)\s+\d/i.test(trimmed)) return true
      // Remove very short lines (but be conservative)
      return trimmed.length >= minLineLength
    })
  }

  if (removeDuplicates) {
    const seen = new Set<string>()
    lines = lines.filter(line => {
      const trimmed = line.trim().toLowerCase()
      // Keep empty lines
      if (!trimmed) return true
      // Check for duplicates (case-insensitive)
      if (seen.has(trimmed)) {
        return false
      }
      seen.add(trimmed)
      return true
    })
  }

  cleaned = lines.join('\n')

  // Step 6: Final whitespace normalization
  if (normalizeWhitespace) {
    // Remove excessive newlines
    cleaned = cleaned.replace(/\n{4,}/g, '\n\n\n')
    // Trim
    cleaned = cleaned.trim()
  }

  return cleaned
}

// Cleaning options interface
export interface CleaningOptions {
  removeHtml?: boolean
  removeUrls?: boolean
  removeBoilerplate?: boolean
  normalizeWhitespace?: boolean
  removeShortLines?: boolean
  minLineLength?: number
  removeDuplicates?: boolean
  normalizeMarkdown?: boolean
}

// Get cleaning statistics
export function getCleaningStats(original: string, cleaned: string): CleaningStats {
  const originalLines = original.split('\n').length
  const cleanedLines = cleaned.split('\n').length
  const originalChars = original.length
  const cleanedChars = cleaned.length
  const originalWords = original.split(/\s+/).filter(w => w.length > 0).length
  const cleanedWords = cleaned.split(/\s+/).filter(w => w.length > 0).length

  return {
    originalLines,
    cleanedLines,
    linesRemoved: originalLines - cleanedLines,
    originalChars,
    cleanedChars,
    charsRemoved: originalChars - cleanedChars,
    originalWords,
    cleanedWords,
    wordsRemoved: originalWords - cleanedWords,
    reductionPercent: Math.round((1 - cleanedChars / originalChars) * 100),
  }
}

export interface CleaningStats {
  originalLines: number
  cleanedLines: number
  linesRemoved: number
  originalChars: number
  cleanedChars: number
  charsRemoved: number
  originalWords: number
  cleanedWords: number
  wordsRemoved: number
  reductionPercent: number
}

// Split text into chunks with overlap
export function chunkText(text: string, chunkSize = CHUNK_SIZE, overlap = CHUNK_OVERLAP): string[] {
  // Guard against empty or whitespace-only text
  if (!text || !text.trim()) {
    return []
  }

  const chunks: string[] = []
  let start = 0

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length)
    let chunk = text.slice(start, end)

    // Try to break at sentence or paragraph boundary
    if (end < text.length) {
      const lastPeriod = chunk.lastIndexOf('. ')
      const lastNewline = chunk.lastIndexOf('\n')
      const breakPoint = Math.max(lastPeriod, lastNewline)

      if (breakPoint > chunkSize * 0.5) {
        chunk = chunk.slice(0, breakPoint + 1)
      }
    }

    const trimmedChunk = chunk.trim()
    if (trimmedChunk.length > 0) {
      chunks.push(trimmedChunk)
    }

    // Ensure we always make forward progress to prevent infinite loops
    const increment = Math.max(chunk.length - overlap, 1)
    start += increment

    // Safety check: if we're at the end or past it, break
    if (start >= text.length) {
      break
    }
  }

  return chunks
}

// Generate embeddings using OpenAI
export async function generateEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  })
  return response.data[0].embedding
}

// Generate embeddings for multiple texts (batch)
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: texts,
  })
  return response.data.map(d => d.embedding)
}

// Count tokens (approximate)
export function countTokens(text: string): number {
  // Rough estimate: ~4 chars per token for English
  return Math.ceil(text.length / 4)
}

// Chat completion with OpenAI
export async function chatCompletion(
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
  options: {
    model?: string
    temperature?: number
    maxTokens?: number
  } = {}
): Promise<string> {
  const {
    model = 'gpt-4o-mini',
    temperature = 0.7,
    maxTokens = 4096,
  } = options

  const response = await openai.chat.completions.create({
    model,
    messages,
    temperature,
    max_tokens: maxTokens,
  })

  return response.choices[0]?.message?.content || ''
}

// Gemini chat completion
export async function geminiChatCompletion(
  prompt: string,
  context?: string,
  options: {
    model?: string
    temperature?: number
  } = {}
): Promise<string> {
  const {
    model = 'gemini-2.0-flash-exp',
    temperature = 0.7,
  } = options

  const genModel = gemini.getGenerativeModel({ model })

  const fullPrompt = context
    ? `Context:\n${context}\n\nQuestion/Task:\n${prompt}`
    : prompt

  const result = await genModel.generateContent({
    contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
    generationConfig: { temperature },
  })

  return result.response.text()
}

// RAG prompt template for Q&A
export function buildRAGPrompt(
  query: string,
  chunks: { text: string; source: string }[]
): string {
  const contextParts = chunks.map((c, i) =>
    `[Source ${i + 1}: ${c.source}]\n${c.text}`
  ).join('\n\n---\n\n')

  return `You are a helpful legal research assistant. Answer the user's question based on the provided context from legal documents. If the answer cannot be found in the context, say so clearly.

Context from documents:
${contextParts}

User Question: ${query}

Instructions:
- Base your answer on the provided context
- Cite sources by their numbers (e.g., [Source 1]) when referencing specific information
- If you're unsure or the context doesn't contain enough information, acknowledge this
- Provide a clear, well-structured answer`
}

// Summarization prompt
export function buildSummarizePrompt(
  chunks: { text: string; source: string }[],
  style: 'brief' | 'detailed' | 'bullet' = 'detailed'
): string {
  const contextParts = chunks.map((c, i) =>
    `[Document ${i + 1}: ${c.source}]\n${c.text}`
  ).join('\n\n---\n\n')

  const styleInstructions = {
    brief: 'Provide a concise 2-3 sentence summary.',
    detailed: 'Provide a comprehensive summary covering all major points.',
    bullet: 'Provide a summary in bullet point format, organized by topic.',
  }

  return `You are a legal document summarization assistant. Summarize the following documents.

Documents:
${contextParts}

Instructions:
- ${styleInstructions[style]}
- Identify key legal concepts, arguments, and conclusions
- Note any important dates, parties, or case citations
- Maintain accuracy and don't add information not present in the source`
}

// Provider types
export type AIProvider = 'openai' | 'gemini'
export type RAGProvider = 'pgvector' | 'gemini-files'

// Model options
export const MODELS = {
  openai: [
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini (Fast)' },
    { id: 'gpt-4o', name: 'GPT-4o (Powerful)' },
    { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' },
  ],
  gemini: [
    { id: 'gemini-2.0-flash-exp', name: 'Gemini 2.0 Flash' },
    { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro' },
    { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash' },
  ],
}
