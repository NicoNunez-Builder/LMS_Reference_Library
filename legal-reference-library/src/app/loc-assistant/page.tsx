'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Textarea } from '@/components/ui/textarea'
import { AddToLibraryModal, isUrlDownloaded } from '@/components/AddToLibraryModal'
import { DownloadIndicator } from '@/components/DownloadIndicator'
import { SearchResultLink } from '@/components/SearchResultLink'
import { SearchResultCard } from '@/components/SearchResultCard'
import { SearchResult } from '@/types'

// Types
interface LOCTopic {
  id: string
  label: string
  query: string
}

interface LOCCollection {
  id: string
  name: string
  slug: string
}

interface LOCFormat {
  [key: string]: string
}

interface CollectionItem {
  id: string
  title: string
  description: string
  url: string
  count: number
  image_url?: string
  subjects?: string[]
}

interface QueryEnhancement {
  originalQuery: string
  enhancedQuery: string
  additions: string[]
  suggestedCollections: { id: string; name: string }[]
  suggestedFormat: string | null
  explanation: string
}

interface SearchHistoryItem {
  id: string
  timestamp: number
  query: string
  enhancedQuery: string
  selectedTopic: string
  selectedFormat: string
  selectedCollection: string
  results: SearchResult[]
  totalResults: number
}

const HISTORY_STORAGE_KEY = 'loc-assistant-history'
const MAX_HISTORY_ITEMS = 20

export default function LOCAssistantPage() {
  // Search state
  const [query, setQuery] = useState('')
  const [enhancedQuery, setEnhancedQuery] = useState('')
  const [enhancement, setEnhancement] = useState<QueryEnhancement | null>(null)
  const [enhancing, setEnhancing] = useState(false)
  const [useEnhanced, setUseEnhanced] = useState(true)
  const debounceRef = useRef<NodeJS.Timeout | null>(null)

  const [selectedTopic, setSelectedTopic] = useState<string>('')
  const [selectedFormat, setSelectedFormat] = useState<string>('all')
  const [selectedCollection, setSelectedCollection] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<SearchResult[]>([])
  const [totalResults, setTotalResults] = useState(0)
  const [page, setPage] = useState(1)

  // Search history state
  const [searchHistory, setSearchHistory] = useState<SearchHistoryItem[]>([])
  const [showHistory, setShowHistory] = useState(false)

  // Collections browser state
  const [collections, setCollections] = useState<CollectionItem[]>([])
  const [collectionsLoading, setCollectionsLoading] = useState(false)
  const [collectionsFilter, setCollectionsFilter] = useState<'all' | 'legal'>('legal')
  const [collectionsSearch, setCollectionsSearch] = useState('')
  const [legalCount, setLegalCount] = useState(0)
  const [totalCount, setTotalCount] = useState(0)

  // Config data
  const [topics, setTopics] = useState<LOCTopic[]>([])
  const [formats, setFormats] = useState<LOCFormat>({})
  const [legalCollections, setLegalCollections] = useState<LOCCollection[]>([])

  // Modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [selectedResult, setSelectedResult] = useState<SearchResult | null>(null)
  const [successMessage, setSuccessMessage] = useState('')

  // Active tab
  const [activeTab, setActiveTab] = useState('search')

  // Load config on mount
  useEffect(() => {
    loadConfig()
  }, [])

  // Load search history from localStorage on mount (but don't restore last search)
  useEffect(() => {
    try {
      const stored = localStorage.getItem(HISTORY_STORAGE_KEY)
      if (stored) {
        const history = JSON.parse(stored) as SearchHistoryItem[]
        setSearchHistory(history)
      }
      // Clear any previous search state when entering the page
      setQuery('')
      setEnhancedQuery('')
      setEnhancement(null)
      setSelectedTopic('')
      setSelectedFormat('all')
      setSelectedCollection('')
      setResults([])
      setTotalResults(0)
    } catch (error) {
      console.error('Failed to load search history:', error)
    }
  }, [])

  // Save search to history
  const saveToHistory = useCallback((searchResults: SearchResult[], total: number) => {
    const historyItem: SearchHistoryItem = {
      id: Date.now().toString(),
      timestamp: Date.now(),
      query,
      enhancedQuery,
      selectedTopic,
      selectedFormat,
      selectedCollection,
      results: searchResults,
      totalResults: total,
    }

    setSearchHistory((prev) => {
      // Remove duplicate queries (keep most recent)
      const filtered = prev.filter((item) => item.query !== query)
      const newHistory = [historyItem, ...filtered].slice(0, MAX_HISTORY_ITEMS)

      // Save to localStorage
      try {
        localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(newHistory))
      } catch (error) {
        console.error('Failed to save search history:', error)
      }

      return newHistory
    })
  }, [query, enhancedQuery, selectedTopic, selectedFormat, selectedCollection])

  // Restore a search from history
  const restoreFromHistory = useCallback((historyItem: SearchHistoryItem) => {
    setQuery(historyItem.query)
    setEnhancedQuery(historyItem.enhancedQuery)
    setSelectedTopic(historyItem.selectedTopic)
    setSelectedFormat(historyItem.selectedFormat)
    setSelectedCollection(historyItem.selectedCollection)
    setResults(historyItem.results)
    setTotalResults(historyItem.totalResults)
    setShowHistory(false)
  }, [])

  // Clear history
  const clearHistory = useCallback(() => {
    setSearchHistory([])
    try {
      localStorage.removeItem(HISTORY_STORAGE_KEY)
    } catch (error) {
      console.error('Failed to clear search history:', error)
    }
  }, [])

  // Delete single history item
  const deleteHistoryItem = useCallback((id: string) => {
    setSearchHistory((prev) => {
      const newHistory = prev.filter((item) => item.id !== id)
      try {
        localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(newHistory))
      } catch (error) {
        console.error('Failed to update search history:', error)
      }
      return newHistory
    })
  }, [])

  // Load collections when tab changes or filter changes
  useEffect(() => {
    if (activeTab === 'collections') {
      loadCollections()
    }
  }, [activeTab, collectionsFilter, collectionsSearch])

  const loadConfig = async () => {
    try {
      const response = await fetch('/api/loc/search')
      const data = await response.json()
      setTopics(data.topics || [])
      setFormats(data.formats || {})
      setLegalCollections(data.collections || [])
    } catch (error) {
      console.error('Failed to load LOC config:', error)
    }
  }

  const loadCollections = async () => {
    setCollectionsLoading(true)
    try {
      const params = new URLSearchParams()
      params.append('filter', collectionsFilter)
      if (collectionsSearch) params.append('search', collectionsSearch)
      params.append('perPage', '50')

      const response = await fetch(`/api/loc/collections?${params}`)
      const data = await response.json()
      setCollections(data.collections || [])
      setLegalCount(data.legalCount || 0)
      setTotalCount(data.totalCount || 0)
    } catch (error) {
      console.error('Failed to load collections:', error)
    } finally {
      setCollectionsLoading(false)
    }
  }

  // Debounced query enhancement
  const enhanceQuery = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim() || searchQuery.length < 3) {
      setEnhancement(null)
      setEnhancedQuery('')
      return
    }

    setEnhancing(true)
    try {
      const response = await fetch('/api/loc/enhance-query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: searchQuery }),
      })
      const data: QueryEnhancement = await response.json()
      setEnhancement(data)
      setEnhancedQuery(data.enhancedQuery)

      // Auto-apply suggested collection if one is found
      if (data.suggestedCollections.length > 0 && !selectedCollection) {
        // Don't auto-select, just show suggestion
      }
      // Auto-apply suggested format if one is found
      if (data.suggestedFormat && selectedFormat === 'all') {
        // Don't auto-select, just show suggestion
      }
    } catch (error) {
      console.error('Failed to enhance query:', error)
    } finally {
      setEnhancing(false)
    }
  }, [selectedCollection, selectedFormat])

  // Debounce the enhancement
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }

    debounceRef.current = setTimeout(() => {
      enhanceQuery(query)
    }, 500) // 500ms debounce

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
    }
  }, [query, enhanceQuery])

  const handleSearch = async (searchPage = 1) => {
    if (!query.trim() && !selectedTopic) return

    // Use enhanced query if available and enabled
    const searchQuery = useEnhanced && enhancedQuery ? enhancedQuery : query

    setLoading(true)
    setPage(searchPage)
    try {
      const response = await fetch('/api/loc/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: searchQuery,
          topic: selectedTopic,
          format: selectedFormat,
          collection: selectedCollection,
          limit: 20,
          page: searchPage,
        }),
      })

      const data = await response.json()
      const searchResults = data.results || []
      const total = data.total || 0
      setResults(searchResults)
      setTotalResults(total)

      // Save to history (only for first page of results)
      if (searchPage === 1 && searchResults.length > 0) {
        saveToHistory(searchResults, total)
      }
    } catch (error) {
      console.error('Search error:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleTopicSelect = (topicId: string) => {
    setSelectedTopic(topicId)
    const topic = topics.find((t) => t.id === topicId)
    if (topic && !query) {
      // Optionally pre-fill query with topic keywords
    }
  }

  const handleAddToLibrary = (result: SearchResult) => {
    setSelectedResult(result)
    setModalOpen(true)
  }

  const handleAddSuccess = () => {
    setSuccessMessage(`"${selectedResult?.title}" added to library successfully!`)
    setSelectedResult(null)
  }

  const handleCollectionClick = (collection: CollectionItem) => {
    // Open collection in new tab
    window.open(collection.url, '_blank')
  }

  const handleSearchFromCollection = (collection: CollectionItem) => {
    setQuery(collection.title)
    setActiveTab('search')
    setTimeout(() => handleSearch(), 100)
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2">Library of Congress Assistant</h1>
        <p className="text-muted-foreground text-lg">
          Explore 175+ million items across 564 digital collections with guided legal research
        </p>
        <div className="flex gap-2 mt-4">
          <Badge variant="secondary">{totalCount} Total Collections</Badge>
          <Badge variant="default">{legalCount} Legal Collections</Badge>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3 mb-6">
          <TabsTrigger value="search">Guided Search</TabsTrigger>
          <TabsTrigger value="collections">Browse Collections</TabsTrigger>
          <TabsTrigger value="topics">Legal Topics</TabsTrigger>
        </TabsList>

        {/* Guided Search Tab */}
        <TabsContent value="search">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Search Sidebar */}
            <div className="lg:col-span-1 space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Search Filters</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Topic Selector */}
                  <div className="space-y-2">
                    <Label>Legal Topic</Label>
                    <Select value={selectedTopic || '_all'} onValueChange={(v) => handleTopicSelect(v === '_all' ? '' : v)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a topic..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_all">All Topics</SelectItem>
                        {topics.map((topic) => (
                          <SelectItem key={topic.id} value={topic.id}>
                            {topic.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Format Selector */}
                  <div className="space-y-2">
                    <Label>Format</Label>
                    <Select value={selectedFormat} onValueChange={setSelectedFormat}>
                      <SelectTrigger>
                        <SelectValue placeholder="All formats" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Formats</SelectItem>
                        {Object.entries(formats).map(([key, label]) => (
                          <SelectItem key={key} value={key}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Collection Selector */}
                  <div className="space-y-2">
                    <Label>Legal Collection</Label>
                    <Select value={selectedCollection || '_all'} onValueChange={(v) => setSelectedCollection(v === '_all' ? '' : v)}>
                      <SelectTrigger>
                        <SelectValue placeholder="All collections" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_all">All Collections</SelectItem>
                        {legalCollections.map((col) => (
                          <SelectItem key={col.id} value={col.id}>
                            {col.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Quick Topics */}
                  <div className="space-y-2">
                    <Label>Quick Search Topics</Label>
                    <div className="flex flex-wrap gap-1">
                      {topics.slice(0, 5).map((topic) => (
                        <Badge
                          key={topic.id}
                          variant={selectedTopic === topic.id ? 'default' : 'outline'}
                          className="cursor-pointer text-xs"
                          onClick={() => handleTopicSelect(topic.id)}
                        >
                          {topic.label}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Search Tips */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Search Tips</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground space-y-2">
                  <p>• Use quotes for exact phrases: "civil rights act"</p>
                  <p>• Combine topics with keywords for better results</p>
                  <p>• Filter by collection for primary sources</p>
                  <p>• PDF format often has downloadable documents</p>
                </CardContent>
              </Card>

              {/* Search History */}
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">Search History</CardTitle>
                    {searchHistory.length > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs text-muted-foreground"
                        onClick={clearHistory}
                      >
                        Clear All
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {searchHistory.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No search history yet. Your searches will appear here.
                    </p>
                  ) : (
                    <div className="space-y-2 max-h-[300px] overflow-y-auto">
                      {searchHistory.map((item) => {
                        // Count how many results from this search are downloaded
                        const downloadedCount = item.results.filter(r => isUrlDownloaded(r.url)).length
                        return (
                          <div
                            key={item.id}
                            className="group p-2 rounded-lg border hover:bg-muted/50 cursor-pointer"
                            onClick={() => restoreFromHistory(item)}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">
                                  {item.query}
                                </p>
                                <div className="flex items-center gap-2 mt-1">
                                  <span className="text-xs text-muted-foreground">
                                    {item.totalResults} results
                                  </span>
                                  <span className="text-xs text-muted-foreground">
                                    {new Date(item.timestamp).toLocaleDateString()}
                                  </span>
                                  {downloadedCount > 0 && (
                                    <Badge variant="default" className="text-xs h-4 px-1.5 bg-green-600">
                                      {downloadedCount} saved
                                    </Badge>
                                  )}
                                </div>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  deleteHistoryItem(item.id)
                                }}
                              >
                                ✕
                              </Button>
                            </div>
                            {item.selectedTopic && (
                              <Badge variant="outline" className="text-xs mt-1">
                                {topics.find((t) => t.id === item.selectedTopic)?.label || item.selectedTopic}
                              </Badge>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Search Results Area */}
            <div className="lg:col-span-3 space-y-4">
              {/* Search Input with Enhancement */}
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">Search Query</CardTitle>
                    <div className="flex items-center gap-2">
                      <Label htmlFor="use-enhanced" className="text-sm text-muted-foreground">
                        AI Enhancement
                      </Label>
                      <Button
                        id="use-enhanced"
                        variant={useEnhanced ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setUseEnhanced(!useEnhanced)}
                      >
                        {useEnhanced ? 'On' : 'Off'}
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Original Query Input */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Your Search</Label>
                    <div className="flex gap-4">
                      <Input
                        placeholder="Type your search query..."
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                        className="flex-1"
                      />
                      <Button onClick={() => handleSearch()} disabled={loading || enhancing}>
                        {loading ? 'Searching...' : 'Search'}
                      </Button>
                    </div>
                  </div>

                  {/* Enhanced Query Display */}
                  {useEnhanced && query.length >= 3 && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Label className="text-sm font-medium">Enhanced Query</Label>
                        {enhancing && (
                          <span className="text-xs text-muted-foreground animate-pulse">
                            Analyzing...
                          </span>
                        )}
                      </div>
                      <div className="relative">
                        <Textarea
                          value={enhancedQuery}
                          onChange={(e) => setEnhancedQuery(e.target.value)}
                          className="min-h-[60px] bg-muted/50 text-sm"
                          placeholder="Enhanced query will appear here..."
                        />
                        {enhancement && enhancement.additions.length > 0 && (
                          <div className="absolute top-2 right-2">
                            <Badge variant="secondary" className="text-xs">
                              +{enhancement.additions.length} terms
                            </Badge>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Enhancement Suggestions */}
                  {useEnhanced && enhancement && (
                    <div className="p-3 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800">
                      <p className="text-sm text-blue-800 dark:text-blue-200 mb-2">
                        {enhancement.explanation}
                      </p>

                      {/* Suggested Collections */}
                      {enhancement.suggestedCollections.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          <span className="text-xs text-blue-600 dark:text-blue-400">Collections:</span>
                          {enhancement.suggestedCollections.map((col) => (
                            <Badge
                              key={col.id}
                              variant="outline"
                              className="text-xs cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900"
                              onClick={() => setSelectedCollection(col.id)}
                            >
                              {col.name}
                            </Badge>
                          ))}
                        </div>
                      )}

                      {/* Suggested Format */}
                      {enhancement.suggestedFormat && (
                        <div className="flex items-center gap-2 mt-2">
                          <span className="text-xs text-blue-600 dark:text-blue-400">Format:</span>
                          <Badge
                            variant="outline"
                            className="text-xs cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900"
                            onClick={() => setSelectedFormat(enhancement.suggestedFormat!)}
                          >
                            {formats[enhancement.suggestedFormat] || enhancement.suggestedFormat}
                          </Badge>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Selected Topic */}
                  {selectedTopic && (
                    <div className="text-sm text-muted-foreground">
                      Topic: <Badge variant="secondary">{topics.find((t) => t.id === selectedTopic)?.label}</Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="ml-2 h-6 px-2"
                        onClick={() => setSelectedTopic('')}
                      >
                        Clear
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Results */}
              {results.length > 0 && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <p className="text-sm text-muted-foreground">
                      Found {totalResults.toLocaleString()} results
                    </p>
                    {totalResults > 20 && (
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={page === 1}
                          onClick={() => handleSearch(page - 1)}
                        >
                          Previous
                        </Button>
                        <span className="text-sm py-2">Page {page}</span>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={page * 20 >= totalResults}
                          onClick={() => handleSearch(page + 1)}
                        >
                          Next
                        </Button>
                      </div>
                    )}
                  </div>

                  {results.map((result, index) => (
                    <SearchResultCard key={index} url={result.url}>
                      <CardHeader>
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <Badge variant="secondary">{result.source_type}</Badge>
                              {result.metadata?.collection && (
                                <Badge variant="outline" className="text-xs">
                                  {result.metadata.collection}
                                </Badge>
                              )}
                            </div>
                            <CardTitle className="text-lg">
                              <SearchResultLink href={result.url}>
                                {result.title}
                              </SearchResultLink>
                            </CardTitle>
                            <CardDescription className="mt-2">{result.snippet}</CardDescription>
                            {result.metadata?.subjects && (
                              <div className="flex flex-wrap gap-1 mt-2">
                                {result.metadata.subjects.slice(0, 5).map((subject, i) => (
                                  <Badge key={i} variant="outline" className="text-xs">
                                    {subject}
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </div>
                          {result.thumbnail && (
                            <img
                              src={result.thumbnail}
                              alt={result.title}
                              className="w-24 h-32 object-cover rounded"
                            />
                          )}
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="flex gap-2">
                          <DownloadIndicator url={result.url} />
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleAddToLibrary(result)}
                          >
                            Add to Library
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => window.open(result.url, '_blank')}
                          >
                            View on LOC
                          </Button>
                        </div>
                      </CardContent>
                    </SearchResultCard>
                  ))}
                </div>
              )}

              {!loading && results.length === 0 && (query || selectedTopic) && (
                <Card>
                  <CardContent className="py-8 text-center text-muted-foreground">
                    No results found. Try adjusting your search terms or filters.
                  </CardContent>
                </Card>
              )}

              {!query && !selectedTopic && (
                <Card>
                  <CardContent className="py-12 text-center">
                    <h3 className="text-xl font-semibold mb-4">Start Your Research</h3>
                    <p className="text-muted-foreground mb-6">
                      Enter a search term or select a legal topic to explore the Library of Congress
                    </p>
                    <div className="flex flex-wrap justify-center gap-2">
                      {topics.map((topic) => (
                        <Button
                          key={topic.id}
                          variant="outline"
                          onClick={() => {
                            handleTopicSelect(topic.id)
                            setTimeout(() => handleSearch(), 100)
                          }}
                        >
                          {topic.label}
                        </Button>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </TabsContent>

        {/* Browse Collections Tab */}
        <TabsContent value="collections">
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Browse LOC Collections</CardTitle>
              <CardDescription>
                Explore {collectionsFilter === 'legal' ? legalCount : totalCount} collections
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col md:flex-row gap-4">
                <Input
                  placeholder="Search collections..."
                  value={collectionsSearch}
                  onChange={(e) => setCollectionsSearch(e.target.value)}
                  className="flex-1"
                />
                <Select
                  value={collectionsFilter}
                  onValueChange={(v) => setCollectionsFilter(v as 'all' | 'legal')}
                >
                  <SelectTrigger className="w-[200px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="legal">Legal Collections ({legalCount})</SelectItem>
                    <SelectItem value="all">All Collections ({totalCount})</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {collectionsLoading ? (
            <div className="text-center py-8">Loading collections...</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {collections.map((collection) => (
                <Card key={collection.id} className="hover:shadow-lg transition-shadow">
                  <CardHeader>
                    {collection.image_url && (
                      <img
                        src={collection.image_url}
                        alt={collection.title}
                        className="w-full h-32 object-cover rounded mb-2"
                      />
                    )}
                    <CardTitle className="text-base line-clamp-2">{collection.title}</CardTitle>
                    <CardDescription className="line-clamp-3">
                      {collection.description || 'No description available'}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between mb-3">
                      <Badge variant="secondary">{collection.count.toLocaleString()} items</Badge>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => handleCollectionClick(collection)}
                      >
                        Browse
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleSearchFromCollection(collection)}
                      >
                        Search
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Legal Topics Tab */}
        <TabsContent value="topics">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Legal Research Topics</CardTitle>
                <CardDescription>
                  Pre-configured searches for common legal research areas
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Accordion type="single" collapsible className="w-full">
                  {topics.map((topic) => (
                    <AccordionItem key={topic.id} value={topic.id}>
                      <AccordionTrigger>{topic.label}</AccordionTrigger>
                      <AccordionContent>
                        <p className="text-sm text-muted-foreground mb-3">
                          Search terms: {topic.query}
                        </p>
                        <Button
                          size="sm"
                          onClick={() => {
                            handleTopicSelect(topic.id)
                            setActiveTab('search')
                            setTimeout(() => handleSearch(), 100)
                          }}
                        >
                          Search This Topic
                        </Button>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Featured Legal Collections</CardTitle>
                <CardDescription>
                  Primary source collections for legal research
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {legalCollections.map((collection) => (
                    <div
                      key={collection.id}
                      className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 cursor-pointer"
                      onClick={() => {
                        setSelectedCollection(collection.id)
                        setActiveTab('search')
                      }}
                    >
                      <span className="font-medium">{collection.name}</span>
                      <Button variant="ghost" size="sm">
                        Explore
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle>About Library of Congress Legal Resources</CardTitle>
              </CardHeader>
              <CardContent className="prose dark:prose-invert max-w-none">
                <p>
                  The Library of Congress holds the world's largest collection of legal materials,
                  including over 2.9 million volumes in the Law Library. Key resources include:
                </p>
                <ul>
                  <li><strong>Congressional Records</strong> - Bills, debates, and committee reports from 1774</li>
                  <li><strong>Constitutional Documents</strong> - Original founding documents and amendments</li>
                  <li><strong>Supreme Court Records</strong> - Opinions and case materials</li>
                  <li><strong>Presidential Papers</strong> - From Washington to modern presidents</li>
                  <li><strong>Historical Legal Documents</strong> - Treaties, statutes, and legal correspondence</li>
                </ul>
                <p className="text-sm text-muted-foreground">
                  All materials are free to access. No API key required.
                </p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Success message */}
      {successMessage && (
        <Card className="fixed bottom-4 right-4 w-auto border-green-500 bg-green-50 dark:bg-green-950 shadow-lg">
          <CardContent className="py-3 px-4 flex items-center gap-2">
            <span className="text-green-700 dark:text-green-300">{successMessage}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSuccessMessage('')}
              className="h-6 w-6 p-0"
            >
              ✕
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Add to Library Modal */}
      <AddToLibraryModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        result={selectedResult}
        onSuccess={handleAddSuccess}
      />
    </div>
  )
}
