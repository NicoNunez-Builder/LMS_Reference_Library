'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { ScrollArea } from '@/components/ui/scroll-area'
import { HierarchicalCategorySelector } from '@/components/HierarchicalCategorySelector'

// Types
interface ParseResult {
  fileName: string
  fileType: string
  mimeType: string
  text: string
  html?: string
  pages?: number
  metadata?: Record<string, any>
  stats: {
    wordCount: number
    charCount: number
    pages?: number
  }
}

interface ParseHistory {
  id: string
  timestamp: number
  fileName: string
  fileType: string
  preview: string
  stats: ParseResult['stats']
}

interface CleaningOptions {
  removeHtml: boolean
  removeUrls: boolean
  removeBoilerplate: boolean
  normalizeWhitespace: boolean
  removeShortLines: boolean
  removeDuplicates: boolean
  normalizeMarkdown: boolean
}

const HISTORY_KEY = 'document-parser-history'
const MAX_HISTORY = 20

export default function DocumentParserPage() {
  const searchParams = useSearchParams()

  // Upload state
  const [file, setFile] = useState<File | null>(null)
  const [url, setUrl] = useState('')
  const [parsing, setParsing] = useState(false)
  const [result, setResult] = useState<ParseResult | null>(null)
  const [error, setError] = useState('')
  const [autoParseTriggered, setAutoParseTriggered] = useState(false)

  // Cleaning state
  const [cleanedText, setCleanedText] = useState('')
  const [isCleaningApplied, setIsCleaningApplied] = useState(false)
  const [cleaningInProgress, setCleaningInProgress] = useState(false)
  const [aiCleaningMethod, setAiCleaningMethod] = useState<string | null>(null)
  const [cleaningOptions, setCleaningOptions] = useState<CleaningOptions>({
    removeHtml: true,
    removeUrls: false,
    removeBoilerplate: false,
    normalizeWhitespace: true,
    removeShortLines: false,
    removeDuplicates: false,
    normalizeMarkdown: true,
  })

  // Add to library state
  const [showAddToLibrary, setShowAddToLibrary] = useState(false)
  const [libraryTitle, setLibraryTitle] = useState('')
  const [libraryDescription, setLibraryDescription] = useState('')
  const [libraryCategory, setLibraryCategory] = useState('')
  const [addingToLibrary, setAddingToLibrary] = useState(false)
  const [addToLibrarySuccess, setAddToLibrarySuccess] = useState('')

  // History state
  const [history, setHistory] = useState<ParseHistory[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem(HISTORY_KEY)
        return stored ? JSON.parse(stored) : []
      } catch {
        return []
      }
    }
    return []
  })

  // Drag state
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Active tab
  const [activeTab, setActiveTab] = useState('upload')

  // Read URL from query params on mount
  useEffect(() => {
    const urlParam = searchParams.get('url')
    if (urlParam && !autoParseTriggered) {
      setUrl(urlParam)
      setAutoParseTriggered(true)
    }
  }, [searchParams, autoParseTriggered])

  // Initialize cleaned text when result changes
  useEffect(() => {
    if (result?.text) {
      setCleanedText(result.text)
      setIsCleaningApplied(false)
      // Auto-set library title from filename
      setLibraryTitle(result.fileName.replace(/\.[^/.]+$/, ''))
      // Auto-set description with file info
      setLibraryDescription(`Extracted from ${result.fileName} (${result.fileType.toUpperCase()}, ${result.stats.wordCount.toLocaleString()} words)`)
    }
  }, [result])

  // Handle file selection
  const handleFileSelect = (selectedFile: File) => {
    setFile(selectedFile)
    setUrl('')
    setError('')
    setResult(null)
    setCleanedText('')
    setIsCleaningApplied(false)
  }

  // Handle file input change
  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      handleFileSelect(selectedFile)
    }
  }

  // Handle drag events
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)

    const droppedFile = e.dataTransfer.files?.[0]
    if (droppedFile) {
      handleFileSelect(droppedFile)
    }
  }, [])

  // Parse document
  const handleParse = async () => {
    if (!file && !url.trim()) {
      setError('Please select a file or enter a URL')
      return
    }

    setParsing(true)
    setError('')
    setResult(null)

    try {
      const formData = new FormData()

      if (file) {
        formData.append('file', file)
      } else {
        formData.append('url', url)
      }

      const response = await fetch('/api/parse-document', {
        method: 'POST',
        body: formData,
      })

      const data = await response.json()

      if (data.error) {
        setError(data.error + (data.details ? `: ${data.details}` : ''))
        return
      }

      setResult(data)

      // Add to history
      const historyItem: ParseHistory = {
        id: Date.now().toString(),
        timestamp: Date.now(),
        fileName: data.fileName,
        fileType: data.fileType,
        preview: data.text.slice(0, 200),
        stats: data.stats,
      }

      setHistory(prev => {
        const newHistory = [historyItem, ...prev].slice(0, MAX_HISTORY)
        try {
          localStorage.setItem(HISTORY_KEY, JSON.stringify(newHistory))
        } catch (e) {
          console.error('Failed to save history:', e)
        }
        return newHistory
      })

      setActiveTab('cleanup')
    } catch (err) {
      setError(String(err))
    } finally {
      setParsing(false)
    }
  }

  // Apply cleaning
  const applyClean = async () => {
    if (!result?.text) return

    setCleaningInProgress(true)

    try {
      const response = await fetch('/api/ai/clean', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: result.text,
          options: cleaningOptions,
        }),
      })

      const data = await response.json()

      if (data.success) {
        setCleanedText(data.cleaned.content.length > 2000
          ? data.cleaned.content
          : data.cleaned.content)
        // If API truncated, we need full content - fetch it differently
        // For now, let's just apply client-side cleaning
        setIsCleaningApplied(true)
      } else {
        setError(`Cleaning failed: ${data.error}`)
      }
    } catch (err) {
      // Fallback to simple cleaning if API fails
      let cleaned = result.text

      if (cleaningOptions.normalizeWhitespace) {
        cleaned = cleaned.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
        cleaned = cleaned.replace(/\t/g, '    ')
        cleaned = cleaned.replace(/ {2,}/g, ' ')
        cleaned = cleaned.replace(/\n{4,}/g, '\n\n\n')
      }

      if (cleaningOptions.removeHtml) {
        cleaned = cleaned.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        cleaned = cleaned.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        cleaned = cleaned.replace(/<[^>]+>/g, ' ')
        cleaned = cleaned.replace(/&nbsp;/g, ' ')
        cleaned = cleaned.replace(/&amp;/g, '&')
        cleaned = cleaned.replace(/&lt;/g, '<')
        cleaned = cleaned.replace(/&gt;/g, '>')
      }

      setCleanedText(cleaned.trim())
      setIsCleaningApplied(true)
    } finally {
      setCleaningInProgress(false)
    }
  }

  // Reset to original
  const resetToOriginal = () => {
    if (result?.text) {
      setCleanedText(result.text)
      setIsCleaningApplied(false)
    }
  }

  // AI-powered cleaning
  const applyAiClean = async (method: 'jina' | 'llm' | 'readability') => {
    if (!result) return

    setAiCleaningMethod(method)
    setError('')

    try {
      const requestBody: Record<string, unknown> = { method }

      if (method === 'jina') {
        // Jina needs a URL - check if we have one
        if (!url.trim()) {
          setError('Jina Reader requires a URL. Please parse from a URL first.')
          setAiCleaningMethod(null)
          return
        }
        requestBody.url = url
      } else if (method === 'llm') {
        requestBody.text = cleanedText || result.text
      } else if (method === 'readability') {
        // Use HTML if available, otherwise use the text
        requestBody.html = result.html || cleanedText || result.text
      }

      const response = await fetch('/api/ai/advanced-clean', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      })

      const data = await response.json()

      if (data.success) {
        setCleanedText(data.text)
        setIsCleaningApplied(true)
        if (data.title && !libraryTitle) {
          setLibraryTitle(data.title)
        }
      } else {
        setError(`AI cleaning failed: ${data.error}`)
      }
    } catch (err) {
      setError(`AI cleaning error: ${String(err)}`)
    } finally {
      setAiCleaningMethod(null)
    }
  }

  // Copy text to clipboard
  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      alert('Copied to clipboard!')
    } catch {
      alert('Failed to copy')
    }
  }

  // Download as text file
  const downloadAsText = (text: string, suffix: string = '') => {
    if (!result) return

    const blob = new Blob([text], { type: 'text/plain' })
    const downloadUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = downloadUrl
    a.download = `${result.fileName.replace(/\.[^/.]+$/, '')}${suffix}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(downloadUrl)
  }

  // Add to library
  const addToLibrary = async () => {
    if (!libraryTitle.trim() || !libraryCategory) {
      setError('Please provide a title and select a category')
      return
    }

    setAddingToLibrary(true)
    setError('')

    try {
      // Create a blob and upload as TXT file
      const blob = new Blob([cleanedText], { type: 'text/plain' })
      const fileName = `${libraryTitle.replace(/[^a-zA-Z0-9-_]/g, '_')}.txt`

      // Create FormData for file upload
      const formData = new FormData()
      formData.append('file', blob, fileName)

      // Upload to storage
      const uploadResponse = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      })

      const uploadData = await uploadResponse.json()

      if (!uploadResponse.ok) {
        throw new Error(uploadData.error || 'Failed to upload file')
      }

      // Create resource record
      const resourceResponse = await fetch('/api/resources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: libraryTitle,
          description: libraryDescription || `Extracted from ${result?.fileName || 'document'}`,
          url: uploadData.url || '',
          file_url: uploadData.url,
          category_id: libraryCategory,
          source_type: 'document',
          content: cleanedText,
          is_public: true,
          metadata: {
            original_file: result?.fileName,
            extracted_at: new Date().toISOString(),
            word_count: cleanedText.split(/\s+/).filter(w => w.length > 0).length,
            char_count: cleanedText.length,
          },
        }),
      })

      const resourceData = await resourceResponse.json()

      if (!resourceResponse.ok) {
        throw new Error(resourceData.error || 'Failed to create resource')
      }

      setAddToLibrarySuccess(`Successfully added "${libraryTitle}" to library!`)
      setShowAddToLibrary(false)

      // Reset form
      setTimeout(() => setAddToLibrarySuccess(''), 5000)
    } catch (err) {
      setError(`Failed to add to library: ${String(err)}`)
    } finally {
      setAddingToLibrary(false)
    }
  }

  // Clear history
  const clearHistory = () => {
    setHistory([])
    try {
      localStorage.removeItem(HISTORY_KEY)
    } catch (e) {
      console.error('Failed to clear history:', e)
    }
  }

  // Format file size
  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  // Calculate stats for text
  const getTextStats = (text: string) => ({
    wordCount: text.split(/\s+/).filter(w => w.length > 0).length,
    charCount: text.length,
    lineCount: text.split('\n').length,
  })

  const originalStats = result ? getTextStats(result.text) : null
  const cleanedStats = cleanedText ? getTextStats(cleanedText) : null

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2">Document Parser</h1>
        <p className="text-muted-foreground text-lg">
          Extract, clean, and save text from documents
        </p>
        <div className="flex gap-2 mt-4">
          <Badge variant="secondary">PDF</Badge>
          <Badge variant="secondary">DOCX</Badge>
          <Badge variant="secondary">TXT</Badge>
          <Badge variant="secondary">Markdown</Badge>
          <Badge variant="secondary">HTML</Badge>
        </div>
      </div>

      {addToLibrarySuccess && (
        <div className="mb-4 p-3 bg-green-50 dark:bg-green-950 rounded border border-green-200 dark:border-green-800">
          <p className="text-sm text-green-700 dark:text-green-300">{addToLibrarySuccess}</p>
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-950 rounded border border-red-200 dark:border-red-800">
          <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4 mb-6">
          <TabsTrigger value="upload">Upload / Parse</TabsTrigger>
          <TabsTrigger value="cleanup" disabled={!result}>
            Clean & Edit {result && '(Ready)'}
          </TabsTrigger>
          <TabsTrigger value="save" disabled={!result}>
            Save to Library
          </TabsTrigger>
          <TabsTrigger value="history">
            History ({history.length})
          </TabsTrigger>
        </TabsList>

        {/* Upload Tab */}
        <TabsContent value="upload">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* File Upload */}
            <Card>
              <CardHeader>
                <CardTitle>Upload Document</CardTitle>
                <CardDescription>
                  Drag and drop or click to select a file
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Drop Zone */}
                <div
                  className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
                    isDragging
                      ? 'border-primary bg-primary/10'
                      : file
                      ? 'border-green-500 bg-green-50 dark:bg-green-950'
                      : 'border-muted-foreground/25 hover:border-primary'
                  }`}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    accept=".pdf,.docx,.doc,.txt,.md,.html,.htm,.rtf"
                    onChange={handleFileInputChange}
                  />

                  {file ? (
                    <div className="space-y-2">
                      <div className="text-4xl">📄</div>
                      <p className="font-medium">{file.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {formatSize(file.size)} - {file.type || 'Unknown type'}
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation()
                          setFile(null)
                        }}
                      >
                        Remove
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="text-4xl">📁</div>
                      <p className="font-medium">
                        Drop a file here or click to browse
                      </p>
                      <p className="text-sm text-muted-foreground">
                        PDF, DOCX, TXT, Markdown, HTML
                      </p>
                    </div>
                  )}
                </div>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">
                      Or parse from URL
                    </span>
                  </div>
                </div>

                {/* URL Input */}
                <div className="space-y-2">
                  <Label>Document URL</Label>
                  <Input
                    placeholder="https://example.com/document.pdf"
                    value={url}
                    onChange={(e) => {
                      setUrl(e.target.value)
                      setFile(null)
                      setError('')
                    }}
                  />
                  <p className="text-xs text-muted-foreground">
                    Direct link to a PDF, DOCX, or text file
                  </p>
                </div>

                <Button
                  onClick={handleParse}
                  disabled={parsing || (!file && !url.trim())}
                  className="w-full"
                >
                  {parsing ? 'Parsing...' : 'Parse Document'}
                </Button>
              </CardContent>
            </Card>

            {/* Info Card */}
            <Card>
              <CardHeader>
                <CardTitle>Workflow</CardTitle>
                <CardDescription>
                  Parse, clean, edit, and save to library
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="p-3 bg-muted rounded-lg">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline">1</Badge>
                      <span className="font-medium">Upload & Parse</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Upload a file or provide a URL to extract text content
                    </p>
                  </div>

                  <div className="p-3 bg-muted rounded-lg">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline">2</Badge>
                      <span className="font-medium">Clean & Edit</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Apply cleaning options and manually edit the text
                    </p>
                  </div>

                  <div className="p-3 bg-muted rounded-lg">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline">3</Badge>
                      <span className="font-medium">Save to Library</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Add the cleaned content to your library as a TXT resource
                    </p>
                  </div>

                  <div className="pt-4 border-t">
                    <h4 className="font-medium mb-2">Supported Formats:</h4>
                    <div className="flex flex-wrap gap-2">
                      <Badge>PDF</Badge>
                      <Badge>DOCX</Badge>
                      <Badge variant="outline">TXT</Badge>
                      <Badge variant="outline">MD</Badge>
                      <Badge variant="outline">HTML</Badge>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Clean & Edit Tab */}
        <TabsContent value="cleanup">
          {result ? (
            <div className="space-y-4">
              {/* Cleaning Controls */}
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-lg">Cleaning Options</CardTitle>
                      <CardDescription>Select options and apply to clean the text</CardDescription>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={resetToOriginal}
                        disabled={!isCleaningApplied}
                      >
                        Reset to Original
                      </Button>
                      <Button
                        size="sm"
                        onClick={applyClean}
                        disabled={cleaningInProgress}
                      >
                        {cleaningInProgress ? 'Cleaning...' : 'Apply Cleaning'}
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-6">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="removeHtml"
                        checked={cleaningOptions.removeHtml}
                        onCheckedChange={(checked) =>
                          setCleaningOptions(prev => ({ ...prev, removeHtml: !!checked }))
                        }
                      />
                      <Label htmlFor="removeHtml" className="text-sm">Remove HTML</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="normalizeWhitespace"
                        checked={cleaningOptions.normalizeWhitespace}
                        onCheckedChange={(checked) =>
                          setCleaningOptions(prev => ({ ...prev, normalizeWhitespace: !!checked }))
                        }
                      />
                      <Label htmlFor="normalizeWhitespace" className="text-sm">Normalize Whitespace</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="normalizeMarkdown"
                        checked={cleaningOptions.normalizeMarkdown}
                        onCheckedChange={(checked) =>
                          setCleaningOptions(prev => ({ ...prev, normalizeMarkdown: !!checked }))
                        }
                      />
                      <Label htmlFor="normalizeMarkdown" className="text-sm">Normalize Markdown</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="removeUrls"
                        checked={cleaningOptions.removeUrls}
                        onCheckedChange={(checked) =>
                          setCleaningOptions(prev => ({ ...prev, removeUrls: !!checked }))
                        }
                      />
                      <Label htmlFor="removeUrls" className="text-sm">Remove URLs</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="removeBoilerplate"
                        checked={cleaningOptions.removeBoilerplate}
                        onCheckedChange={(checked) =>
                          setCleaningOptions(prev => ({ ...prev, removeBoilerplate: !!checked }))
                        }
                      />
                      <Label htmlFor="removeBoilerplate" className="text-sm">Remove Boilerplate</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="removeShortLines"
                        checked={cleaningOptions.removeShortLines}
                        onCheckedChange={(checked) =>
                          setCleaningOptions(prev => ({ ...prev, removeShortLines: !!checked }))
                        }
                      />
                      <Label htmlFor="removeShortLines" className="text-sm">Remove Short Lines</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="removeDuplicates"
                        checked={cleaningOptions.removeDuplicates}
                        onCheckedChange={(checked) =>
                          setCleaningOptions(prev => ({ ...prev, removeDuplicates: !!checked }))
                        }
                      />
                      <Label htmlFor="removeDuplicates" className="text-sm">Remove Duplicates</Label>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* AI Cleaning Options */}
              <Card>
                <CardHeader className="pb-3">
                  <div>
                    <CardTitle className="text-lg">AI Cleaning</CardTitle>
                    <CardDescription>Use AI-powered methods to clean extracted content</CardDescription>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-3">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => applyAiClean('jina')}
                      disabled={!!aiCleaningMethod || !url.trim()}
                      title={!url.trim() ? 'Requires URL input' : 'Extract clean content using Jina Reader API'}
                    >
                      {aiCleaningMethod === 'jina' ? 'Extracting...' : 'Jina Reader'}
                      {!url.trim() && <span className="ml-1 text-xs text-muted-foreground">(needs URL)</span>}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => applyAiClean('llm')}
                      disabled={!!aiCleaningMethod}
                      title="Use GPT-4o-mini to clean and format text"
                    >
                      {aiCleaningMethod === 'llm' ? 'Processing...' : 'LLM Clean'}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => applyAiClean('readability')}
                      disabled={!!aiCleaningMethod}
                      title="Extract main content using Readability algorithm"
                    >
                      {aiCleaningMethod === 'readability' ? 'Extracting...' : 'Readability Extract'}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-3">
                    <strong>Jina Reader:</strong> Best for web pages (requires URL) |{' '}
                    <strong>LLM Clean:</strong> AI-powered formatting |{' '}
                    <strong>Readability:</strong> Extract main content from HTML
                  </p>
                </CardContent>
              </Card>

              {/* Side by Side View */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Original */}
                <Card>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-lg">Original</CardTitle>
                        {originalStats && (
                          <CardDescription>
                            {originalStats.wordCount.toLocaleString()} words | {originalStats.charCount.toLocaleString()} chars | {originalStats.lineCount.toLocaleString()} lines
                          </CardDescription>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(result.text)}
                      >
                        Copy
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[500px] w-full rounded border">
                      <pre className="p-4 text-sm font-mono whitespace-pre-wrap">
                        {result.text || 'No content'}
                      </pre>
                    </ScrollArea>
                  </CardContent>
                </Card>

                {/* Cleaned/Edited */}
                <Card>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-lg">
                          Cleaned / Edited
                          {isCleaningApplied && (
                            <Badge variant="secondary" className="ml-2">Modified</Badge>
                          )}
                        </CardTitle>
                        {cleanedStats && (
                          <CardDescription>
                            {cleanedStats.wordCount.toLocaleString()} words | {cleanedStats.charCount.toLocaleString()} chars | {cleanedStats.lineCount.toLocaleString()} lines
                            {originalStats && cleanedStats.charCount !== originalStats.charCount && (
                              <span className={cleanedStats.charCount < originalStats.charCount ? ' text-green-600' : ' text-yellow-600'}>
                                {' '}({cleanedStats.charCount < originalStats.charCount ? '-' : '+'}{Math.abs(((cleanedStats.charCount - originalStats.charCount) / originalStats.charCount) * 100).toFixed(1)}%)
                              </span>
                            )}
                          </CardDescription>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyToClipboard(cleanedText)}
                        >
                          Copy
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => downloadAsText(cleanedText, '_cleaned')}
                        >
                          Download
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <Textarea
                      value={cleanedText}
                      onChange={(e) => {
                        setCleanedText(e.target.value)
                        setIsCleaningApplied(true)
                      }}
                      className="h-[500px] font-mono text-sm resize-none"
                      placeholder="Parsed content will appear here..."
                    />
                  </CardContent>
                </Card>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => downloadAsText(cleanedText, '_cleaned')}
                >
                  Download as TXT
                </Button>
                <Button onClick={() => setActiveTab('save')}>
                  Continue to Save
                </Button>
              </div>
            </div>
          ) : (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                Upload and parse a document first
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Save to Library Tab */}
        <TabsContent value="save">
          {result ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Preview */}
              <Card>
                <CardHeader>
                  <CardTitle>Content Preview</CardTitle>
                  <CardDescription>
                    {cleanedStats?.wordCount.toLocaleString()} words | {cleanedStats?.charCount.toLocaleString()} characters
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[400px] w-full rounded border">
                    <pre className="p-4 text-sm font-mono whitespace-pre-wrap">
                      {cleanedText || 'No content'}
                    </pre>
                  </ScrollArea>
                </CardContent>
              </Card>

              {/* Save Form */}
              <Card>
                <CardHeader>
                  <CardTitle>Add to Library</CardTitle>
                  <CardDescription>
                    Save the cleaned content as a TXT resource
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="libraryTitle">Title *</Label>
                    <Input
                      id="libraryTitle"
                      value={libraryTitle}
                      onChange={(e) => setLibraryTitle(e.target.value)}
                      placeholder="Enter resource title"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="libraryDescription">Description</Label>
                    <Textarea
                      id="libraryDescription"
                      value={libraryDescription}
                      onChange={(e) => setLibraryDescription(e.target.value)}
                      placeholder="Optional description..."
                      rows={3}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Category *</Label>
                    <HierarchicalCategorySelector
                      value={libraryCategory}
                      onChange={setLibraryCategory}
                    />
                  </div>

                  <div className="pt-4 border-t">
                    <div className="flex items-center justify-between text-sm text-muted-foreground mb-4">
                      <span>Original file:</span>
                      <span>{result.fileName}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm text-muted-foreground mb-4">
                      <span>File type:</span>
                      <Badge variant="outline">TXT (Plain Text)</Badge>
                    </div>
                  </div>

                  <Button
                    onClick={addToLibrary}
                    disabled={addingToLibrary || !libraryTitle.trim() || !libraryCategory}
                    className="w-full"
                  >
                    {addingToLibrary ? 'Adding to Library...' : 'Add to Library'}
                  </Button>
                </CardContent>
              </Card>
            </div>
          ) : (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                Upload and parse a document first
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Parse History</CardTitle>
                  <CardDescription>
                    Recently parsed documents ({history.length})
                  </CardDescription>
                </div>
                {history.length > 0 && (
                  <Button variant="outline" size="sm" onClick={clearHistory}>
                    Clear History
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {history.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  No parse history yet. Parsed documents will appear here.
                </p>
              ) : (
                <div className="space-y-3">
                  {history.map((item) => (
                    <div
                      key={item.id}
                      className="p-4 border rounded-lg hover:bg-muted/50"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="outline">
                              {item.fileType.toUpperCase()}
                            </Badge>
                            <span className="font-medium truncate">
                              {item.fileName}
                            </span>
                          </div>
                          <p className="text-sm text-muted-foreground line-clamp-2">
                            {item.preview}...
                          </p>
                          <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                            <span>{item.stats.wordCount.toLocaleString()} words</span>
                            {item.stats.pages && (
                              <span>{item.stats.pages} pages</span>
                            )}
                            <span>
                              {new Date(item.timestamp).toLocaleString()}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
