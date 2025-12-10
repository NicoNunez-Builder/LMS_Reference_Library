'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { AddToLibraryModal, isUrlDownloaded } from '@/components/AddToLibraryModal'
import { DownloadIndicator } from '@/components/DownloadIndicator'
import { SearchResultLink } from '@/components/SearchResultLink'
import { SearchResultCard } from '@/components/SearchResultCard'
import {
  SearchResult,
  CourtListenerSearchType,
  CourtListenerSearchTypeLabels,
  FederalCourts,
} from '@/types'

// Search history storage
const HISTORY_STORAGE_KEY = 'courtlistener-assistant-history'
const CASE_CONTEXT_KEY = 'courtlistener-case-context'
const MAX_HISTORY_ITEMS = 30

// Types
interface SearchHistoryItem {
  id: string
  timestamp: number
  query: string
  searchType: string
  court: string
  dateFrom: string
  dateTo: string
  results: SearchResult[]
  totalResults: number
}

interface CaseContext {
  caseName: string
  caseNumber: string
  court: string
  keyIssues: string[]
  opposingArguments: string
  notes: string
}

// Search operator definitions
const SEARCH_OPERATORS = {
  boolean: [
    { operator: 'AND', syntax: 'term1 AND term2', description: 'Both terms required (default behavior)' },
    { operator: 'OR', syntax: 'term1 OR term2', description: 'Either term matches' },
    { operator: 'NOT', syntax: 'term1 NOT term2', description: 'Exclude second term' },
    { operator: '( )', syntax: '(term1 OR term2) AND term3', description: 'Group terms for complex queries' },
  ],
  phrase: [
    { operator: '" "', syntax: '"exact phrase"', description: 'Match exact phrase, no stemming' },
    { operator: '~N', syntax: '"word1 word2"~50', description: 'Words within N words of each other' },
  ],
  wildcard: [
    { operator: '*', syntax: 'liabil*', description: 'Matches any characters (liability, liable, etc.)' },
    { operator: '?', syntax: 'wom?n', description: 'Matches single character (woman, women)' },
  ],
  range: [
    { operator: '[TO]', syntax: '[2020 TO 2024]', description: 'Inclusive range of values' },
    { operator: '[TO *]', syntax: 'page_count:[100 TO *]', description: 'Open-ended range (100+)' },
  ],
  fielded: [
    { operator: 'caseName:', syntax: 'caseName:"Smith v. Jones"', description: 'Search in case name field' },
    { operator: 'court:', syntax: 'court:scotus', description: 'Filter by court' },
    { operator: 'citation:', syntax: 'citation:([500 TO 600] U.S.)', description: 'Search by citation volume' },
    { operator: 'judge:', syntax: 'judge:Roberts', description: 'Search by judge name' },
    { operator: 'docketNumber:', syntax: 'docketNumber:21-1234', description: 'Search by docket number' },
  ],
}

// Common legal search patterns
const LEGAL_PATTERNS = [
  { label: 'Constitutional Issue', pattern: '(constitutional OR constitution) AND ({issue})' },
  { label: 'Statutory Interpretation', pattern: '(statutory interpretation OR legislative intent) AND ({statute})' },
  { label: 'Precedent Search', pattern: '(precedent OR stare decisis) AND ("{case}")' },
  { label: 'Due Process', pattern: '"due process" AND (procedural OR substantive) AND ({topic})' },
  { label: 'First Amendment', pattern: '("first amendment" OR "free speech" OR "freedom of speech") AND ({issue})' },
  { label: 'Fourth Amendment', pattern: '("fourth amendment" OR "search and seizure" OR "warrant") AND ({issue})' },
  { label: 'Contract Dispute', pattern: '(breach of contract OR contract interpretation) AND ({terms})' },
  { label: 'Negligence', pattern: '(negligence OR "duty of care" OR "proximate cause") AND ({context})' },
  { label: 'Summary Judgment', pattern: '"summary judgment" AND ("genuine issue" OR "material fact") AND ({topic})' },
  { label: 'Standing', pattern: '(standing OR "case or controversy" OR justiciability) AND ({issue})' },
]

export default function CourtListenerAssistantPage() {
  // Query state
  const [query, setQuery] = useState('')
  const [searchType, setSearchType] = useState<string>(CourtListenerSearchType.OPINIONS)
  const [court, setCourt] = useState<string>('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<SearchResult[]>([])
  const [totalResults, setTotalResults] = useState(0)
  const [page, setPage] = useState(1)

  // Search history
  const [searchHistory, setSearchHistory] = useState<SearchHistoryItem[]>([])

  // Case context
  const [caseContext, setCaseContext] = useState<CaseContext>({
    caseName: '',
    caseNumber: '',
    court: '',
    keyIssues: [],
    opposingArguments: '',
    notes: '',
  })
  const [newIssue, setNewIssue] = useState('')

  // Modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [selectedResult, setSelectedResult] = useState<SearchResult | null>(null)
  const [successMessage, setSuccessMessage] = useState('')

  // Active tab
  const [activeTab, setActiveTab] = useState('search')

  // Query input ref for cursor position
  const queryInputRef = useRef<HTMLTextAreaElement>(null)

  // Load history and case context on mount
  useEffect(() => {
    try {
      const storedHistory = localStorage.getItem(HISTORY_STORAGE_KEY)
      if (storedHistory) {
        setSearchHistory(JSON.parse(storedHistory))
      }

      const storedContext = localStorage.getItem(CASE_CONTEXT_KEY)
      if (storedContext) {
        setCaseContext(JSON.parse(storedContext))
      }
    } catch (error) {
      console.error('Failed to load stored data:', error)
    }
  }, [])

  // Save case context when it changes
  useEffect(() => {
    try {
      localStorage.setItem(CASE_CONTEXT_KEY, JSON.stringify(caseContext))
    } catch (error) {
      console.error('Failed to save case context:', error)
    }
  }, [caseContext])

  // Insert operator at cursor position
  const insertOperator = (syntax: string) => {
    const textarea = queryInputRef.current
    if (textarea) {
      const start = textarea.selectionStart
      const end = textarea.selectionEnd
      const currentValue = query
      const newValue = currentValue.substring(0, start) + syntax + currentValue.substring(end)
      setQuery(newValue)
      // Focus and set cursor position after the inserted text
      setTimeout(() => {
        textarea.focus()
        textarea.setSelectionRange(start + syntax.length, start + syntax.length)
      }, 0)
    } else {
      setQuery(query + ' ' + syntax)
    }
  }

  // Apply legal pattern template
  const applyPattern = (pattern: string) => {
    setQuery(pattern)
  }

  // Search function
  const handleSearch = async (searchPage = 1) => {
    if (!query.trim()) return

    setLoading(true)
    setPage(searchPage)

    try {
      const response = await fetch('/api/search/courtlistener', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          searchType,
          court: court !== 'all' ? court : undefined,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
          limit: 25,
        }),
      })

      const data = await response.json()
      const searchResults = data.results || []
      const total = data.total || 0
      setResults(searchResults)
      setTotalResults(total)

      // Save to history (only for first page)
      if (searchPage === 1 && searchResults.length > 0) {
        saveToHistory(searchResults, total)
      }
    } catch (error) {
      console.error('Search error:', error)
    } finally {
      setLoading(false)
    }
  }

  // Save search to history
  const saveToHistory = useCallback((searchResults: SearchResult[], total: number) => {
    const historyItem: SearchHistoryItem = {
      id: Date.now().toString(),
      timestamp: Date.now(),
      query,
      searchType,
      court,
      dateFrom,
      dateTo,
      results: searchResults.slice(0, 10), // Only save first 10 results
      totalResults: total,
    }

    setSearchHistory((prev) => {
      const filtered = prev.filter((item) => item.query !== query)
      const newHistory = [historyItem, ...filtered].slice(0, MAX_HISTORY_ITEMS)

      try {
        localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(newHistory))
      } catch (error) {
        console.error('Failed to save search history:', error)
      }

      return newHistory
    })
  }, [query, searchType, court, dateFrom, dateTo])

  // Restore from history
  const restoreFromHistory = (item: SearchHistoryItem) => {
    setQuery(item.query)
    setSearchType(item.searchType)
    setCourt(item.court)
    setDateFrom(item.dateFrom)
    setDateTo(item.dateTo)
    setResults(item.results)
    setTotalResults(item.totalResults)
    setActiveTab('search')
  }

  // Delete history item
  const deleteHistoryItem = (id: string) => {
    setSearchHistory((prev) => {
      const newHistory = prev.filter((item) => item.id !== id)
      try {
        localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(newHistory))
      } catch (error) {
        console.error('Failed to update history:', error)
      }
      return newHistory
    })
  }

  // Clear all history
  const clearHistory = () => {
    setSearchHistory([])
    try {
      localStorage.removeItem(HISTORY_STORAGE_KEY)
    } catch (error) {
      console.error('Failed to clear history:', error)
    }
  }

  // Add issue to case context
  const addIssue = () => {
    if (newIssue.trim()) {
      setCaseContext((prev) => ({
        ...prev,
        keyIssues: [...prev.keyIssues, newIssue.trim()],
      }))
      setNewIssue('')
    }
  }

  // Remove issue from case context
  const removeIssue = (index: number) => {
    setCaseContext((prev) => ({
      ...prev,
      keyIssues: prev.keyIssues.filter((_, i) => i !== index),
    }))
  }

  // Generate search from case context
  const searchFromContext = (issue: string) => {
    let searchQuery = issue
    if (caseContext.court) {
      searchQuery = `court:${caseContext.court} AND (${issue})`
    }
    setQuery(searchQuery)
    setActiveTab('search')
    setTimeout(() => handleSearch(), 100)
  }

  // Modal handlers
  const handleAddToLibrary = (result: SearchResult) => {
    setSelectedResult(result)
    setModalOpen(true)
  }

  const handleAddSuccess = () => {
    setSuccessMessage(`"${selectedResult?.title}" added to library successfully!`)
    setSelectedResult(null)
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2">CourtListener Research Assistant</h1>
        <p className="text-muted-foreground text-lg">
          Advanced legal case research with Boolean operators, proximity search, and case tracking
        </p>
        <div className="flex gap-2 mt-4">
          <Badge variant="secondary">Case Law Search</Badge>
          <Badge variant="secondary">RECAP/Dockets</Badge>
          <Badge variant="secondary">Oral Arguments</Badge>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4 mb-6">
          <TabsTrigger value="search">Search</TabsTrigger>
          <TabsTrigger value="operators">Operators Guide</TabsTrigger>
          <TabsTrigger value="context">Case Context</TabsTrigger>
          <TabsTrigger value="history">Search History</TabsTrigger>
        </TabsList>

        {/* Search Tab */}
        <TabsContent value="search">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Search Sidebar */}
            <div className="lg:col-span-1 space-y-4">
              {/* Filters Card */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">Search Filters</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Search Type</Label>
                    <Select value={searchType} onValueChange={setSearchType}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(CourtListenerSearchTypeLabels).map(([key, label]) => (
                          <SelectItem key={key} value={key}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Court</Label>
                    <Select value={court} onValueChange={setCourt}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Courts</SelectItem>
                        {Object.entries(FederalCourts).map(([key, label]) => (
                          <SelectItem key={key} value={key}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Filed After</Label>
                    <Input
                      type="date"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Filed Before</Label>
                    <Input
                      type="date"
                      value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Quick Operators */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">Quick Insert</CardTitle>
                  <CardDescription>Click to insert at cursor</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex flex-wrap gap-1">
                    <Button variant="outline" size="sm" onClick={() => insertOperator(' AND ')}>AND</Button>
                    <Button variant="outline" size="sm" onClick={() => insertOperator(' OR ')}>OR</Button>
                    <Button variant="outline" size="sm" onClick={() => insertOperator(' NOT ')}>NOT</Button>
                    <Button variant="outline" size="sm" onClick={() => insertOperator('""')}>""</Button>
                    <Button variant="outline" size="sm" onClick={() => insertOperator('~')}>~</Button>
                    <Button variant="outline" size="sm" onClick={() => insertOperator('*')}>*</Button>
                    <Button variant="outline" size="sm" onClick={() => insertOperator('()')}>( )</Button>
                    <Button variant="outline" size="sm" onClick={() => insertOperator('[TO]')}>[TO]</Button>
                  </div>
                  <div className="pt-2 border-t">
                    <p className="text-xs text-muted-foreground mb-2">Field Operators:</p>
                    <div className="flex flex-wrap gap-1">
                      <Button variant="ghost" size="sm" className="text-xs h-6" onClick={() => insertOperator('caseName:')}>caseName:</Button>
                      <Button variant="ghost" size="sm" className="text-xs h-6" onClick={() => insertOperator('court:')}>court:</Button>
                      <Button variant="ghost" size="sm" className="text-xs h-6" onClick={() => insertOperator('judge:')}>judge:</Button>
                      <Button variant="ghost" size="sm" className="text-xs h-6" onClick={() => insertOperator('citation:')}>citation:</Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Case Context Quick Access */}
              {caseContext.keyIssues.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg">Your Case Issues</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-1">
                      {caseContext.keyIssues.slice(0, 5).map((issue, i) => (
                        <Button
                          key={i}
                          variant="ghost"
                          size="sm"
                          className="w-full justify-start text-left h-auto py-1 text-xs"
                          onClick={() => searchFromContext(issue)}
                        >
                          {issue}
                        </Button>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Main Search Area */}
            <div className="lg:col-span-3 space-y-4">
              {/* Query Builder */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">Build Your Query</CardTitle>
                  <CardDescription>
                    Use Boolean operators, phrases, and field searches for precise results
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Textarea
                      ref={queryInputRef}
                      placeholder='Example: "due process" AND (procedural OR substantive) AND court:scotus'
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && e.ctrlKey) {
                          handleSearch()
                        }
                      }}
                      className="min-h-[100px] font-mono text-sm"
                    />
                    <p className="text-xs text-muted-foreground">
                      Press Ctrl+Enter to search. Use the Quick Insert buttons or Operators Guide for help.
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <Button onClick={() => handleSearch()} disabled={loading} className="flex-1">
                      {loading ? 'Searching...' : 'Search CourtListener'}
                    </Button>
                    <Button variant="outline" onClick={() => setQuery('')}>
                      Clear
                    </Button>
                  </div>

                  {/* Legal Pattern Templates */}
                  <div className="pt-4 border-t">
                    <p className="text-sm font-medium mb-2">Legal Research Templates:</p>
                    <div className="flex flex-wrap gap-2">
                      {LEGAL_PATTERNS.slice(0, 6).map((pattern, i) => (
                        <Badge
                          key={i}
                          variant="outline"
                          className="cursor-pointer hover:bg-muted"
                          onClick={() => applyPattern(pattern.pattern)}
                        >
                          {pattern.label}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Results */}
              {results.length > 0 && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <p className="text-sm text-muted-foreground">
                      Found {totalResults.toLocaleString()} results
                    </p>
                  </div>

                  {results.map((result, index) => (
                    <SearchResultCard key={index} url={result.url}>
                      <CardHeader>
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <Badge variant="secondary">
                                {CourtListenerSearchTypeLabels[searchType as CourtListenerSearchType] || 'Case Law'}
                              </Badge>
                            </div>
                            <CardTitle className="text-lg">
                              <SearchResultLink href={result.url}>
                                {result.title}
                              </SearchResultLink>
                            </CardTitle>
                            {(result.metadata?.docketNumber || result.metadata?.dateFiled) && (
                              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-sm text-muted-foreground">
                                {result.metadata?.docketNumber && (
                                  <span><span className="font-medium">Docket:</span> {result.metadata.docketNumber}</span>
                                )}
                                {result.metadata?.dateFiled && (
                                  <span><span className="font-medium">Filed:</span> {result.metadata.dateFiled}</span>
                                )}
                              </div>
                            )}
                            <CardDescription className="mt-2 whitespace-pre-wrap">
                              {result.snippet}
                            </CardDescription>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="flex items-center gap-2">
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
                            View on CourtListener
                          </Button>
                        </div>
                      </CardContent>
                    </SearchResultCard>
                  ))}
                </div>
              )}

              {!loading && results.length === 0 && query && (
                <Card>
                  <CardContent className="py-8 text-center text-muted-foreground">
                    No results found. Try adjusting your query or filters.
                  </CardContent>
                </Card>
              )}

              {!query && (
                <Card>
                  <CardContent className="py-12 text-center">
                    <h3 className="text-xl font-semibold mb-4">Start Your Research</h3>
                    <p className="text-muted-foreground mb-6">
                      Enter a search query above or select a legal research template to begin
                    </p>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-w-2xl mx-auto">
                      {LEGAL_PATTERNS.map((pattern, i) => (
                        <Button
                          key={i}
                          variant="outline"
                          size="sm"
                          className="text-xs"
                          onClick={() => applyPattern(pattern.pattern)}
                        >
                          {pattern.label}
                        </Button>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </TabsContent>

        {/* Operators Guide Tab */}
        <TabsContent value="operators">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Boolean Operators */}
            <Card>
              <CardHeader>
                <CardTitle>Boolean Operators</CardTitle>
                <CardDescription>Combine search terms logically</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {SEARCH_OPERATORS.boolean.map((op, i) => (
                    <div key={i} className="p-3 bg-muted rounded-lg">
                      <div className="flex items-center justify-between mb-1">
                        <Badge variant="secondary">{op.operator}</Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-xs"
                          onClick={() => {
                            insertOperator(op.syntax)
                            setActiveTab('search')
                          }}
                        >
                          Use
                        </Button>
                      </div>
                      <code className="text-sm text-blue-600 dark:text-blue-400">{op.syntax}</code>
                      <p className="text-xs text-muted-foreground mt-1">{op.description}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Phrase & Proximity */}
            <Card>
              <CardHeader>
                <CardTitle>Phrase & Proximity</CardTitle>
                <CardDescription>Find exact phrases or nearby words</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {SEARCH_OPERATORS.phrase.map((op, i) => (
                    <div key={i} className="p-3 bg-muted rounded-lg">
                      <div className="flex items-center justify-between mb-1">
                        <Badge variant="secondary">{op.operator}</Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-xs"
                          onClick={() => {
                            insertOperator(op.syntax)
                            setActiveTab('search')
                          }}
                        >
                          Use
                        </Button>
                      </div>
                      <code className="text-sm text-blue-600 dark:text-blue-400">{op.syntax}</code>
                      <p className="text-xs text-muted-foreground mt-1">{op.description}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Wildcards */}
            <Card>
              <CardHeader>
                <CardTitle>Wildcard Operators</CardTitle>
                <CardDescription>Match variations of terms</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {SEARCH_OPERATORS.wildcard.map((op, i) => (
                    <div key={i} className="p-3 bg-muted rounded-lg">
                      <div className="flex items-center justify-between mb-1">
                        <Badge variant="secondary">{op.operator}</Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-xs"
                          onClick={() => {
                            insertOperator(op.syntax)
                            setActiveTab('search')
                          }}
                        >
                          Use
                        </Button>
                      </div>
                      <code className="text-sm text-blue-600 dark:text-blue-400">{op.syntax}</code>
                      <p className="text-xs text-muted-foreground mt-1">{op.description}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Range Queries */}
            <Card>
              <CardHeader>
                <CardTitle>Range Queries</CardTitle>
                <CardDescription>Search within numeric or date ranges</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {SEARCH_OPERATORS.range.map((op, i) => (
                    <div key={i} className="p-3 bg-muted rounded-lg">
                      <div className="flex items-center justify-between mb-1">
                        <Badge variant="secondary">{op.operator}</Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-xs"
                          onClick={() => {
                            insertOperator(op.syntax)
                            setActiveTab('search')
                          }}
                        >
                          Use
                        </Button>
                      </div>
                      <code className="text-sm text-blue-600 dark:text-blue-400">{op.syntax}</code>
                      <p className="text-xs text-muted-foreground mt-1">{op.description}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Fielded Searches */}
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle>Field-Specific Searches</CardTitle>
                <CardDescription>Search within specific document fields</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {SEARCH_OPERATORS.fielded.map((op, i) => (
                    <div key={i} className="p-3 bg-muted rounded-lg">
                      <div className="flex items-center justify-between mb-1">
                        <Badge variant="secondary">{op.operator}</Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-xs"
                          onClick={() => {
                            insertOperator(op.operator)
                            setActiveTab('search')
                          }}
                        >
                          Use
                        </Button>
                      </div>
                      <code className="text-xs text-blue-600 dark:text-blue-400 break-all">{op.syntax}</code>
                      <p className="text-xs text-muted-foreground mt-1">{op.description}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Tips Card */}
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle>Pro Tips for Legal Research</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div className="space-y-2">
                    <h4 className="font-medium">Query Best Practices</h4>
                    <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                      <li>Start specific, then broaden if needed</li>
                      <li>Use explicit AND between all terms in complex queries</li>
                      <li>Use quotes for legal terms of art: &quot;due process&quot;</li>
                      <li>Proximity search for concepts: &quot;breach duty&quot;~10</li>
                    </ul>
                  </div>
                  <div className="space-y-2">
                    <h4 className="font-medium">Effective Strategies</h4>
                    <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                      <li>Filter by jurisdiction first for faster results</li>
                      <li>Use wildcards for word variations: negligen*</li>
                      <li>Combine field searches: court:scotus AND caseName:&quot;v. United States&quot;</li>
                      <li>Use date ranges to find recent precedents</li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Case Context Tab */}
        <TabsContent value="context">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Your Case Information</CardTitle>
                <CardDescription>
                  Track your current case details to enhance research
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Case Name</Label>
                  <Input
                    placeholder="e.g., Smith v. Jones"
                    value={caseContext.caseName}
                    onChange={(e) => setCaseContext((prev) => ({ ...prev, caseName: e.target.value }))}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Case/Docket Number</Label>
                  <Input
                    placeholder="e.g., 21-cv-1234"
                    value={caseContext.caseNumber}
                    onChange={(e) => setCaseContext((prev) => ({ ...prev, caseNumber: e.target.value }))}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Court</Label>
                  <Select
                    value={caseContext.court || '_none'}
                    onValueChange={(v) => setCaseContext((prev) => ({ ...prev, court: v === '_none' ? '' : v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select court..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">Not specified</SelectItem>
                      {Object.entries(FederalCourts).map(([key, label]) => (
                        <SelectItem key={key} value={key}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Opposing Arguments / Positions</Label>
                  <Textarea
                    placeholder="Summarize the opposing party's main arguments..."
                    value={caseContext.opposingArguments}
                    onChange={(e) => setCaseContext((prev) => ({ ...prev, opposingArguments: e.target.value }))}
                    rows={3}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Research Notes</Label>
                  <Textarea
                    placeholder="Notes about your research strategy..."
                    value={caseContext.notes}
                    onChange={(e) => setCaseContext((prev) => ({ ...prev, notes: e.target.value }))}
                    rows={3}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Key Legal Issues</CardTitle>
                <CardDescription>
                  Add issues to quickly search for relevant precedents
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Input
                    placeholder="Add a legal issue..."
                    value={newIssue}
                    onChange={(e) => setNewIssue(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addIssue()}
                  />
                  <Button onClick={addIssue}>Add</Button>
                </div>

                <div className="space-y-2">
                  {caseContext.keyIssues.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">
                      No issues added yet. Add legal issues you need to research.
                    </p>
                  ) : (
                    caseContext.keyIssues.map((issue, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between p-3 bg-muted rounded-lg"
                      >
                        <span className="text-sm flex-1">{issue}</span>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7"
                            onClick={() => searchFromContext(issue)}
                          >
                            Search
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-destructive"
                            onClick={() => removeIssue(i)}
                          >
                            Remove
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Suggested Issues */}
                <div className="pt-4 border-t">
                  <p className="text-sm font-medium mb-2">Common Legal Issues:</p>
                  <div className="flex flex-wrap gap-1">
                    {[
                      'Standing',
                      'Subject Matter Jurisdiction',
                      'Personal Jurisdiction',
                      'Due Process',
                      'Equal Protection',
                      'First Amendment',
                      'Fourth Amendment',
                      'Qualified Immunity',
                      'Summary Judgment Standard',
                      'Statute of Limitations',
                    ].map((issue, i) => (
                      <Badge
                        key={i}
                        variant="outline"
                        className="cursor-pointer hover:bg-muted text-xs"
                        onClick={() => {
                          setCaseContext((prev) => ({
                            ...prev,
                            keyIssues: [...prev.keyIssues, issue],
                          }))
                        }}
                      >
                        + {issue}
                      </Badge>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Search History Tab */}
        <TabsContent value="history">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Search History</CardTitle>
                  <CardDescription>
                    Your recent CourtListener searches ({searchHistory.length} saved)
                  </CardDescription>
                </div>
                {searchHistory.length > 0 && (
                  <Button variant="outline" size="sm" onClick={clearHistory}>
                    Clear All
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {searchHistory.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  No search history yet. Your searches will appear here.
                </p>
              ) : (
                <div className="space-y-3">
                  {searchHistory.map((item) => {
                    // Count how many results from this search are downloaded
                    const downloadedCount = item.results.filter(r => isUrlDownloaded(r.url)).length
                    return (
                      <div
                        key={item.id}
                        className="p-4 border rounded-lg hover:bg-muted/50 cursor-pointer"
                        onClick={() => restoreFromHistory(item)}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <p className="font-mono text-sm truncate">{item.query}</p>
                            <div className="flex items-center gap-2 mt-2 flex-wrap">
                              <Badge variant="secondary" className="text-xs">
                                {CourtListenerSearchTypeLabels[item.searchType as CourtListenerSearchType] || item.searchType}
                              </Badge>
                              {item.court !== 'all' && (
                                <Badge variant="outline" className="text-xs">
                                  {FederalCourts[item.court as keyof typeof FederalCourts] || item.court}
                                </Badge>
                              )}
                              <span className="text-xs text-muted-foreground">
                                {item.totalResults} results
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {new Date(item.timestamp).toLocaleDateString()}
                              </span>
                              {downloadedCount > 0 && (
                                <Badge variant="default" className="text-xs h-5 px-1.5 bg-green-600">
                                  {downloadedCount} saved
                                </Badge>
                              )}
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8"
                            onClick={(e) => {
                              e.stopPropagation()
                              deleteHistoryItem(item.id)
                            }}
                          >
                            Delete
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
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
              X
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
