'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { createClient } from '@/lib/supabase/client'
import { Resource } from '@/types'

type ChatMode = 'qa' | 'summarize' | 'chat'
type Provider = 'pgvector' | 'gemini'
type SummaryStyle = 'brief' | 'detailed' | 'bullet'
type ActivePanel = 'chat' | 'clean'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  sources?: {
    resource_id: string
    title: string
    url?: string
    snippet: string
    similarity: number
  }[]
  timestamp: Date
}

interface ResourceWithEmbedding extends Resource {
  embedded?: boolean
  chunkCount?: number
}

interface CleaningPreview {
  resource_id: string
  title: string
  original: { content: string; length: number }
  cleaned: { content: string; length: number }
  stats: {
    originalChars: number
    cleanedChars: number
    reductionPercent: number
    originalLines: number
    cleanedLines: number
    linesRemoved: number
  }
}

export default function ChatPage() {
  const router = useRouter()

  // Resources state
  const [resources, setResources] = useState<ResourceWithEmbedding[]>([])
  const [selectedResources, setSelectedResources] = useState<string[]>([])
  const [resourcesLoading, setResourcesLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')

  // Chat settings
  const [mode, setMode] = useState<ChatMode>('qa')
  const [provider, setProvider] = useState<Provider>('pgvector')
  const [model, setModel] = useState<string>('')
  const [temperature, setTemperature] = useState(0.7)
  const [summaryStyle, setSummaryStyle] = useState<SummaryStyle>('detailed')

  // Chat state
  const [message, setMessage] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Embedding state
  const [embeddingInProgress, setEmbeddingInProgress] = useState<string[]>([])

  // Data cleaning state
  const [activePanel, setActivePanel] = useState<ActivePanel>('chat')
  const [cleaningPreview, setCleaningPreview] = useState<CleaningPreview | null>(null)
  const [cleaningLoading, setCleaningLoading] = useState(false)
  const [cleaningApplying, setCleaningApplying] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const outputRef = useRef<HTMLDivElement>(null)

  // Model options based on provider
  const modelOptions = {
    pgvector: [
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

  // Load resources on mount
  useEffect(() => {
    loadResources()
  }, [])

  // Set default model when provider changes
  useEffect(() => {
    setModel(modelOptions[provider][0].id)
  }, [provider])

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const loadResources = async () => {
    setResourcesLoading(true)
    try {
      const supabase = createClient()

      // Get resources with content
      const { data: resourcesData, error: resourcesError } = await supabase
        .from('lr_resources')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100)

      if (resourcesError) throw resourcesError

      // Get embedding stats
      const response = await fetch('/api/ai/embed')
      const embedStats = await response.json()

      // Get detailed embedding info for resources
      const resourcesWithEmbedding: ResourceWithEmbedding[] = await Promise.all(
        (resourcesData || []).map(async (r) => {
          try {
            const embedResponse = await fetch(`/api/ai/embed?resource_id=${r.id}`)
            const embedData = await embedResponse.json()
            return {
              ...r,
              embedded: embedData.embedded,
              chunkCount: embedData.chunks,
            }
          } catch {
            return { ...r, embedded: false, chunkCount: 0 }
          }
        })
      )

      setResources(resourcesWithEmbedding)
    } catch (err) {
      console.error('Failed to load resources:', err)
      setError('Failed to load resources')
    } finally {
      setResourcesLoading(false)
    }
  }

  const toggleResourceSelection = (resourceId: string) => {
    setSelectedResources((prev) =>
      prev.includes(resourceId)
        ? prev.filter((id) => id !== resourceId)
        : [...prev, resourceId]
    )
  }

  const selectAll = () => {
    const filtered = filteredResources.map((r) => r.id)
    setSelectedResources(filtered)
  }

  const clearSelection = () => {
    setSelectedResources([])
  }

  const generateEmbeddings = async (resourceId: string) => {
    setEmbeddingInProgress((prev) => [...prev, resourceId])
    try {
      const response = await fetch('/api/ai/embed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resource_id: resourceId }),
      })

      const data = await response.json()

      if (data.success) {
        // Update resource in state
        setResources((prev) =>
          prev.map((r) =>
            r.id === resourceId
              ? { ...r, embedded: true, chunkCount: data.results[0]?.chunks || 0 }
              : r
          )
        )
      } else {
        setError(`Failed to generate embeddings: ${data.error}`)
      }
    } catch (err) {
      console.error('Embedding error:', err)
      setError('Failed to generate embeddings')
    } finally {
      setEmbeddingInProgress((prev) => prev.filter((id) => id !== resourceId))
    }
  }

  const previewCleaning = async (resourceId: string) => {
    setCleaningLoading(true)
    setCleaningPreview(null)
    setActivePanel('clean')

    try {
      const response = await fetch('/api/ai/clean', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resource_id: resourceId }),
      })

      const data = await response.json()

      if (data.success) {
        setCleaningPreview({
          resource_id: resourceId,
          title: data.title,
          original: data.original,
          cleaned: data.cleaned,
          stats: data.stats,
        })
      } else {
        setError(`Failed to preview cleaning: ${data.error}`)
      }
    } catch (err) {
      console.error('Cleaning preview error:', err)
      setError('Failed to preview cleaning')
    } finally {
      setCleaningLoading(false)
    }
  }

  const applyCleaning = async () => {
    if (!cleaningPreview) return

    setCleaningApplying(true)

    try {
      const response = await fetch('/api/ai/clean', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resource_id: cleaningPreview.resource_id,
          apply: true,
        }),
      })

      const data = await response.json()

      if (data.success) {
        // Re-embed after cleaning
        await generateEmbeddings(cleaningPreview.resource_id)
        setCleaningPreview(null)
        setActivePanel('chat')
        // Reload resources to reflect changes
        loadResources()
      } else {
        setError(`Failed to apply cleaning: ${data.error}`)
      }
    } catch (err) {
      console.error('Apply cleaning error:', err)
      setError('Failed to apply cleaning')
    } finally {
      setCleaningApplying(false)
    }
  }

  const sendToParser = (resource: ResourceWithEmbedding) => {
    // Use file_url if available, otherwise use the source url
    const parseUrl = resource.file_url || resource.url
    if (parseUrl) {
      router.push(`/document-parser?url=${encodeURIComponent(parseUrl)}`)
    } else {
      setError('No file URL available for this resource')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!message.trim() && mode !== 'summarize') {
      setError('Please enter a message')
      return
    }

    if (selectedResources.length === 0 && mode !== 'chat') {
      setError('Please select at least one resource')
      return
    }

    setIsLoading(true)
    setError(null)

    // Add user message to chat
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: mode === 'summarize' ? '[Summarize selected documents]' : message,
      timestamp: new Date(),
    }
    setMessages((prev) => [...prev, userMessage])
    setMessage('')

    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: mode === 'summarize' ? 'Summarize these documents' : message,
          mode,
          provider,
          resource_ids: selectedResources,
          model,
          temperature,
          summary_style: summaryStyle,
        }),
      })

      const data = await response.json()

      if (data.error) {
        throw new Error(data.error)
      }

      // Add assistant response
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.response,
        sources: data.sources,
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, assistantMessage])
    } catch (err) {
      console.error('Chat error:', err)
      setError(err instanceof Error ? err.message : 'Failed to get response')
    } finally {
      setIsLoading(false)
    }
  }

  const clearChat = () => {
    setMessages([])
  }

  // Filter resources based on search
  const filteredResources = resources.filter((r) =>
    r.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.description?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2">AI Chat & Analysis</h1>
        <p className="text-muted-foreground text-lg">
          Chat with your documents, generate summaries, and ask questions using RAG
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Panel - Source Selection */}
        <div className="lg:col-span-1 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Select Sources</CardTitle>
              <CardDescription>
                Choose documents to include in the context
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Search */}
              <Input
                placeholder="Search resources..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />

              {/* Selection actions */}
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={selectAll}>
                  Select All
                </Button>
                <Button variant="outline" size="sm" onClick={clearSelection}>
                  Clear
                </Button>
                <Badge variant="secondary">
                  {selectedResources.length} selected
                </Badge>
              </div>

              {/* Resource list */}
              {resourcesLoading ? (
                <div className="text-center py-8">
                  <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Loading resources...</p>
                </div>
              ) : (
                <ScrollArea className="h-[400px]">
                  <div className="space-y-2 pr-4">
                    {filteredResources.map((resource) => (
                      <div
                        key={resource.id}
                        className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                          selectedResources.includes(resource.id)
                            ? 'bg-primary/10 border-primary'
                            : 'hover:bg-muted'
                        }`}
                        onClick={() => toggleResourceSelection(resource.id)}
                      >
                        <Checkbox
                          checked={selectedResources.includes(resource.id)}
                          onCheckedChange={() => toggleResourceSelection(resource.id)}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate text-sm">
                            {resource.title}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="outline" className="text-xs">
                              {resource.source_type}
                            </Badge>
                            {resource.embedded ? (
                              <Badge variant="secondary" className="text-xs">
                                {resource.chunkCount} chunks
                              </Badge>
                            ) : (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-5 text-xs px-2"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  generateEmbeddings(resource.id)
                                }}
                                disabled={embeddingInProgress.includes(resource.id)}
                              >
                                {embeddingInProgress.includes(resource.id)
                                  ? 'Embedding...'
                                  : 'Embed'}
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-5 text-xs px-2"
                              onClick={(e) => {
                                e.stopPropagation()
                                previewCleaning(resource.id)
                              }}
                              disabled={cleaningLoading}
                            >
                              Clean
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-5 text-xs px-2"
                              onClick={(e) => {
                                e.stopPropagation()
                                sendToParser(resource)
                              }}
                            >
                              Parse
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                    {filteredResources.length === 0 && (
                      <p className="text-center text-muted-foreground py-4">
                        No resources found
                      </p>
                    )}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>

          {/* Settings Card */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Mode */}
              <div className="space-y-2">
                <Label>Mode</Label>
                <Select value={mode} onValueChange={(v) => setMode(v as ChatMode)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="qa">Q&A (Ask questions)</SelectItem>
                    <SelectItem value="summarize">Summarize</SelectItem>
                    <SelectItem value="chat">Chat (General)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Provider */}
              <div className="space-y-2">
                <Label>Provider</Label>
                <Select value={provider} onValueChange={(v) => setProvider(v as Provider)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pgvector">pgvector RAG (OpenAI)</SelectItem>
                    <SelectItem value="gemini">Gemini Direct</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {provider === 'pgvector'
                    ? 'Uses chunked embeddings for precise retrieval'
                    : 'Sends full documents to Gemini\'s large context'}
                </p>
              </div>

              {/* Model */}
              <div className="space-y-2">
                <Label>Model</Label>
                <Select value={model} onValueChange={setModel}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {modelOptions[provider].map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Summary style (only for summarize mode) */}
              {mode === 'summarize' && (
                <div className="space-y-2">
                  <Label>Summary Style</Label>
                  <Select
                    value={summaryStyle}
                    onValueChange={(v) => setSummaryStyle(v as SummaryStyle)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="brief">Brief (2-3 sentences)</SelectItem>
                      <SelectItem value="detailed">Detailed</SelectItem>
                      <SelectItem value="bullet">Bullet Points</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Temperature */}
              <div className="space-y-2">
                <Label>Temperature: {temperature}</Label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={temperature}
                  onChange={(e) => setTemperature(parseFloat(e.target.value))}
                  className="w-full"
                />
                <p className="text-xs text-muted-foreground">
                  Lower = more focused, Higher = more creative
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Panel - Chat & Output */}
        <div className="lg:col-span-2 space-y-4">
          {/* Panel Toggle */}
          <div className="flex gap-2">
            <Button
              variant={activePanel === 'chat' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActivePanel('chat')}
            >
              Chat & Analysis
            </Button>
            <Button
              variant={activePanel === 'clean' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActivePanel('clean')}
            >
              Data Cleaning {cleaningPreview && '(1)'}
            </Button>
          </div>

          {/* Data Cleaning Panel */}
          {activePanel === 'clean' && (
            <Card className="h-[500px] flex flex-col">
              <CardHeader className="pb-3 flex-shrink-0 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-lg">Data Cleaning Preview</CardTitle>
                  <CardDescription>
                    {cleaningPreview
                      ? `Cleaning: ${cleaningPreview.title}`
                      : 'Select a resource and click "Clean" to preview'}
                  </CardDescription>
                </div>
                {cleaningPreview && (
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCleaningPreview(null)}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={applyCleaning}
                      disabled={cleaningApplying}
                    >
                      {cleaningApplying ? 'Applying...' : 'Apply & Re-embed'}
                    </Button>
                  </div>
                )}
              </CardHeader>
              <CardContent className="flex-1 overflow-hidden">
                {cleaningLoading ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center">
                      <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">Loading preview...</p>
                    </div>
                  </div>
                ) : cleaningPreview ? (
                  <div className="h-full flex flex-col">
                    {/* Stats */}
                    <div className="mb-4 p-3 bg-muted rounded-lg">
                      <div className="grid grid-cols-3 gap-4 text-center">
                        <div>
                          <p className="text-2xl font-bold text-destructive">
                            -{cleaningPreview.stats.reductionPercent}%
                          </p>
                          <p className="text-xs text-muted-foreground">Size Reduction</p>
                        </div>
                        <div>
                          <p className="text-2xl font-bold">
                            {cleaningPreview.stats.linesRemoved}
                          </p>
                          <p className="text-xs text-muted-foreground">Lines Removed</p>
                        </div>
                        <div>
                          <p className="text-2xl font-bold">
                            {(cleaningPreview.stats.originalChars - cleaningPreview.stats.cleanedChars).toLocaleString()}
                          </p>
                          <p className="text-xs text-muted-foreground">Chars Removed</p>
                        </div>
                      </div>
                    </div>

                    {/* Side-by-side comparison */}
                    <div className="flex-1 grid grid-cols-2 gap-4 min-h-0">
                      <div className="flex flex-col min-h-0">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-sm font-medium">Original</p>
                          <Badge variant="outline">
                            {cleaningPreview.original.length.toLocaleString()} chars
                          </Badge>
                        </div>
                        <ScrollArea className="flex-1 border rounded-lg p-3 bg-red-50 dark:bg-red-950/20">
                          <pre className="text-xs whitespace-pre-wrap font-mono">
                            {cleaningPreview.original.content}
                          </pre>
                        </ScrollArea>
                      </div>
                      <div className="flex flex-col min-h-0">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-sm font-medium">Cleaned</p>
                          <Badge variant="outline">
                            {cleaningPreview.cleaned.length.toLocaleString()} chars
                          </Badge>
                        </div>
                        <ScrollArea className="flex-1 border rounded-lg p-3 bg-green-50 dark:bg-green-950/20">
                          <pre className="text-xs whitespace-pre-wrap font-mono">
                            {cleaningPreview.cleaned.content}
                          </pre>
                        </ScrollArea>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    <div className="text-center">
                      <p className="text-lg mb-2">No preview</p>
                      <p className="text-sm">
                        Click "Clean" on a resource to preview the cleaning
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Output Panel */}
          {activePanel === 'chat' && (
          <>
          <Card className="h-[500px] flex flex-col">
            <CardHeader className="pb-3 flex-shrink-0 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg">Output</CardTitle>
                <CardDescription>
                  AI responses and analysis results
                </CardDescription>
              </div>
              {messages.length > 0 && (
                <Button variant="outline" size="sm" onClick={clearChat}>
                  Clear Chat
                </Button>
              )}
            </CardHeader>
            <CardContent className="flex-1 overflow-hidden">
              <ScrollArea className="h-full pr-4" ref={outputRef}>
                {messages.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    <div className="text-center">
                      <p className="text-lg mb-2">No messages yet</p>
                      <p className="text-sm">
                        Select resources and send a message to get started
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {messages.map((msg) => (
                      <div
                        key={msg.id}
                        className={`flex ${
                          msg.role === 'user' ? 'justify-end' : 'justify-start'
                        }`}
                      >
                        <div
                          className={`max-w-[85%] rounded-lg p-4 ${
                            msg.role === 'user'
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-muted'
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-2">
                            <span className="font-medium text-sm">
                              {msg.role === 'user' ? 'You' : 'Assistant'}
                            </span>
                            <span className="text-xs opacity-70">
                              {formatTime(msg.timestamp)}
                            </span>
                          </div>
                          <div className="whitespace-pre-wrap text-sm">
                            {msg.content}
                          </div>
                          {msg.sources && msg.sources.length > 0 && (
                            <div className="mt-3 pt-3 border-t border-border/50">
                              <p className="text-xs font-medium mb-2">Sources:</p>
                              <div className="space-y-2">
                                {msg.sources.map((source, idx) => (
                                  <div
                                    key={idx}
                                    className="text-xs bg-background/50 rounded p-2"
                                  >
                                    <p className="font-medium">{source.title}</p>
                                    <p className="text-muted-foreground mt-1 line-clamp-2">
                                      {source.snippet}
                                    </p>
                                    <div className="flex items-center gap-2 mt-1">
                                      <Badge variant="outline" className="text-xs">
                                        {(source.similarity * 100).toFixed(0)}% match
                                      </Badge>
                                      {source.url && (
                                        <a
                                          href={source.url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-primary hover:underline"
                                        >
                                          View
                                        </a>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                    {isLoading && (
                      <div className="flex justify-start">
                        <div className="bg-muted rounded-lg p-4">
                          <div className="flex items-center gap-2">
                            <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
                            <span className="text-sm text-muted-foreground">
                              Thinking...
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Input Panel */}
          <Card>
            <CardContent className="pt-4">
              {error && (
                <div className="mb-4 p-3 bg-destructive/10 text-destructive rounded-lg text-sm">
                  {error}
                </div>
              )}
              <form onSubmit={handleSubmit} className="space-y-4">
                {mode === 'summarize' ? (
                  <div className="text-center py-4">
                    <p className="text-muted-foreground mb-4">
                      Click the button below to summarize the selected documents
                    </p>
                    <Button
                      type="submit"
                      size="lg"
                      disabled={isLoading || selectedResources.length === 0}
                    >
                      {isLoading ? 'Generating Summary...' : 'Generate Summary'}
                    </Button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Textarea
                      placeholder={
                        mode === 'qa'
                          ? 'Ask a question about your documents...'
                          : 'Type your message...'
                      }
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault()
                          handleSubmit(e)
                        }
                      }}
                      className="flex-1 min-h-[80px] resize-none"
                      disabled={isLoading}
                    />
                    <Button
                      type="submit"
                      className="h-auto"
                      disabled={isLoading || !message.trim()}
                    >
                      {isLoading ? 'Sending...' : 'Send'}
                    </Button>
                  </div>
                )}
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {selectedResources.length} resource(s) selected
                    {provider === 'pgvector' && ' (using RAG)'}
                    {provider === 'gemini' && ' (using full context)'}
                  </span>
                  <span>Press Enter to send, Shift+Enter for new line</span>
                </div>
              </form>
            </CardContent>
          </Card>
          </>
          )}
        </div>
      </div>
    </div>
  )
}
