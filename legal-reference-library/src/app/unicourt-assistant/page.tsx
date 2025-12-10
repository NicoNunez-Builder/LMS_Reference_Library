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
import { AddToLibraryModal, isUrlDownloaded } from '@/components/AddToLibraryModal'
import { DownloadIndicator } from '@/components/DownloadIndicator'
import { SearchResultLink } from '@/components/SearchResultLink'
import { SearchResultCard } from '@/components/SearchResultCard'
import {
  SearchResult,
  USStates,
  UniCourtCaseTypes,
} from '@/types'

// Search history storage
const HISTORY_STORAGE_KEY = 'unicourt-assistant-history'
const CASE_CONTEXT_KEY = 'unicourt-case-context'
const MAX_HISTORY_ITEMS = 30

// Types
interface SearchHistoryItem {
  id: string
  timestamp: number
  query: string
  state: string
  caseType: string
  dateFrom: string
  dateTo: string
  results: SearchResult[]
  totalResults: number
}

interface CaseContext {
  caseName: string
  caseNumber: string
  state: string
  county: string
  caseType: string
  partyName: string
  attorneyName: string
  judgeName: string
  keyIssues: string[]
  opposingArguments: string
  notes: string
}

// UniCourt query field definitions
const UNICOURT_FIELDS = {
  case: [
    { field: 'caseName:', description: 'Search by case name', example: 'caseName:(Smith v. Jones)' },
    { field: 'caseNumber:', description: 'Search by case/docket number', example: 'caseNumber:"2023-CV-1234"' },
    { field: 'caseStatus:', description: 'Filter by case status', example: 'caseStatus:Open' },
  ],
  parties: [
    { field: 'Party:(name:', description: 'Search by party name', example: 'Party:(name:"John Smith")' },
    { field: 'Party:(partyRole:', description: 'Filter by party role', example: 'Party:(partyRole:Plaintiff)' },
  ],
  attorneys: [
    { field: 'Attorney:(name:', description: 'Search by attorney name', example: 'Attorney:(name:"Jane Doe")' },
    { field: 'Attorney:(firmName:', description: 'Search by law firm', example: 'Attorney:(firmName:"Smith & Associates")' },
  ],
  court: [
    { field: 'JurisdictionGeo:(state:(name:', description: 'Filter by state', example: 'JurisdictionGeo:(state:(name:"California"))' },
    { field: 'CaseType:(name:', description: 'Filter by case type', example: 'CaseType:(name:"Civil")' },
    { field: 'Court:(name:', description: 'Filter by court name', example: 'Court:(name:"Superior Court")' },
    { field: 'Judge:(name:', description: 'Search by judge name', example: 'Judge:(name:"Smith")' },
  ],
  docket: [
    { field: 'DocketEntry:', description: 'Search docket entries', example: 'DocketEntry:(motion to dismiss)' },
    { field: 'filedDate:', description: 'Filter by filing date', example: 'filedDate:[2023-01-01 TO *]' },
  ],
}

// State court research patterns
const STATE_COURT_PATTERNS = [
  { label: 'Civil Litigation', pattern: 'CaseType:(name:"Civil") AND ({issue})' },
  { label: 'Contract Dispute', pattern: '(breach of contract OR contract dispute) AND CaseType:(name:"Civil")' },
  { label: 'Personal Injury', pattern: '(personal injury OR negligence OR "bodily harm") AND CaseType:(name:"Civil")' },
  { label: 'Family Law', pattern: 'CaseType:(name:"Family") AND ({issue})' },
  { label: 'Divorce Case', pattern: '(dissolution OR divorce) AND CaseType:(name:"Family")' },
  { label: 'Child Custody', pattern: '(custody OR visitation OR "parenting time") AND CaseType:(name:"Family")' },
  { label: 'Probate Matter', pattern: 'CaseType:(name:"Probate") AND ({issue})' },
  { label: 'Estate Dispute', pattern: '(estate OR inheritance OR will contest) AND CaseType:(name:"Probate")' },
  { label: 'Criminal Defense', pattern: 'CaseType:(name:"Criminal") AND ({charge})' },
  { label: 'Landlord-Tenant', pattern: '(eviction OR unlawful detainer OR lease) AND CaseType:(name:"Civil")' },
  { label: 'Small Claims', pattern: 'CaseType:(name:"Small Claims") AND ({dispute})' },
  { label: 'Bankruptcy', pattern: 'CaseType:(name:"Bankruptcy") AND ({issue})' },
]

// Common state court case types for quick filtering
const QUICK_CASE_TYPES = [
  'Civil', 'Criminal', 'Family', 'Probate', 'Bankruptcy',
  'Small Claims', 'Traffic', 'Juvenile',
]

export default function UniCourtAssistantPage() {
  // Query state
  const [query, setQuery] = useState('')
  const [state, setState] = useState<string>('all')
  const [caseType, setCaseType] = useState<string>('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [partyName, setPartyName] = useState('')
  const [attorneyName, setAttorneyName] = useState('')
  const [judgeName, setJudgeName] = useState('')
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<SearchResult[]>([])
  const [totalResults, setTotalResults] = useState(0)
  const [apiConfigured, setApiConfigured] = useState<boolean | null>(null)

  // Search history
  const [searchHistory, setSearchHistory] = useState<SearchHistoryItem[]>([])

  // Case context
  const [caseContext, setCaseContext] = useState<CaseContext>({
    caseName: '',
    caseNumber: '',
    state: '',
    county: '',
    caseType: '',
    partyName: '',
    attorneyName: '',
    judgeName: '',
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

  // Check API configuration on mount
  useEffect(() => {
    const checkConfig = async () => {
      try {
        const response = await fetch('/api/search/unicourt')
        const data = await response.json()
        setApiConfigured(data.configured)
      } catch {
        setApiConfigured(false)
      }
    }
    checkConfig()
  }, [])

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

  // Insert field at cursor position
  const insertField = (field: string) => {
    const textarea = queryInputRef.current
    if (textarea) {
      const start = textarea.selectionStart
      const end = textarea.selectionEnd
      const currentValue = query
      const newValue = currentValue.substring(0, start) + field + currentValue.substring(end)
      setQuery(newValue)
      setTimeout(() => {
        textarea.focus()
        textarea.setSelectionRange(start + field.length, start + field.length)
      }, 0)
    } else {
      setQuery(query + ' ' + field)
    }
  }

  // Apply search pattern template
  const applyPattern = (pattern: string) => {
    setQuery(pattern)
  }

  // Search function
  const handleSearch = async () => {
    if (!query.trim() && !partyName && !attorneyName && !judgeName) return

    setLoading(true)

    try {
      const response = await fetch('/api/search/unicourt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          state: state !== 'all' ? state : undefined,
          caseType: caseType !== 'all' ? caseType : undefined,
          partyName: partyName || undefined,
          attorneyName: attorneyName || undefined,
          judgeName: judgeName || undefined,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
          limit: 25,
        }),
      })

      const data = await response.json()

      if (data.error) {
        console.error('UniCourt API error:', data.error)
        setResults([])
        setTotalResults(0)
        return
      }

      const searchResults = data.results || []
      const total = data.total || 0
      setResults(searchResults)
      setTotalResults(total)

      // Save to history
      if (searchResults.length > 0) {
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
    const searchQuery = query || `Party: ${partyName} | Attorney: ${attorneyName} | Judge: ${judgeName}`
    const historyItem: SearchHistoryItem = {
      id: Date.now().toString(),
      timestamp: Date.now(),
      query: searchQuery,
      state,
      caseType,
      dateFrom,
      dateTo,
      results: searchResults.slice(0, 10),
      totalResults: total,
    }

    setSearchHistory((prev) => {
      const filtered = prev.filter((item) => item.query !== searchQuery)
      const newHistory = [historyItem, ...filtered].slice(0, MAX_HISTORY_ITEMS)

      try {
        localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(newHistory))
      } catch (error) {
        console.error('Failed to save search history:', error)
      }

      return newHistory
    })
  }, [query, partyName, attorneyName, judgeName, state, caseType, dateFrom, dateTo])

  // Restore from history
  const restoreFromHistory = (item: SearchHistoryItem) => {
    setQuery(item.query)
    setState(item.state)
    setCaseType(item.caseType)
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
    if (caseContext.state) {
      searchQuery = `JurisdictionGeo:(state:(name:"${caseContext.state}")) AND (${issue})`
    }
    if (caseContext.caseType) {
      searchQuery += ` AND CaseType:(name:"${caseContext.caseType}")`
    }
    setQuery(searchQuery)
    setState(caseContext.state ? Object.keys(USStates).find(k => USStates[k as keyof typeof USStates] === caseContext.state) || 'all' : 'all')
    setCaseType(caseContext.caseType || 'all')
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

  // If API is not configured, show setup instructions
  if (apiConfigured === false) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">UniCourt Research Assistant</h1>
          <p className="text-muted-foreground text-lg">
            State court case research with comprehensive filters and tracking
          </p>
        </div>

        <Card className="max-w-2xl mx-auto">
          <CardHeader>
            <CardTitle>UniCourt API Configuration Required</CardTitle>
            <CardDescription>
              To use the UniCourt Research Assistant, you need to configure your UniCourt API credentials.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 bg-amber-50 dark:bg-amber-950 rounded-lg border border-amber-200 dark:border-amber-800">
              <h4 className="font-medium text-amber-800 dark:text-amber-200 mb-2">Setup Instructions:</h4>
              <ol className="list-decimal list-inside space-y-2 text-sm text-amber-700 dark:text-amber-300">
                <li>Sign up for a UniCourt Enterprise API account at <a href="https://unicourt.com" target="_blank" rel="noopener noreferrer" className="underline">unicourt.com</a></li>
                <li>Obtain your Client ID and Client Secret from the API dashboard</li>
                <li>Add the following to your <code className="bg-amber-100 dark:bg-amber-900 px-1 rounded">.env.local</code> file:</li>
              </ol>
              <pre className="mt-3 p-3 bg-gray-900 text-gray-100 rounded text-sm overflow-x-auto">
{`UNICOURT_CLIENT_ID=your_client_id_here
UNICOURT_CLIENT_SECRET=your_client_secret_here`}
              </pre>
              <p className="mt-3 text-sm text-amber-700 dark:text-amber-300">
                After adding the credentials, restart your development server.
              </p>
            </div>

            <div className="pt-4">
              <h4 className="font-medium mb-2">UniCourt Features:</h4>
              <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                <li>Access to state court records across all 50 states</li>
                <li>Search by case name, party, attorney, or judge</li>
                <li>Filter by case type, state, and date range</li>
                <li>View docket entries and case documents</li>
                <li>Track cases and receive updates</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2">UniCourt Research Assistant</h1>
        <p className="text-muted-foreground text-lg">
          State court case research with comprehensive filters and tracking
        </p>
        <div className="flex gap-2 mt-4">
          <Badge variant="secondary">State Courts</Badge>
          <Badge variant="secondary">50 States + DC</Badge>
          <Badge variant="secondary">All Case Types</Badge>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4 mb-6">
          <TabsTrigger value="search">Search</TabsTrigger>
          <TabsTrigger value="fields">Query Fields</TabsTrigger>
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
                    <Label>State</Label>
                    <Select value={state} onValueChange={setState}>
                      <SelectTrigger>
                        <SelectValue placeholder="All States" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All States</SelectItem>
                        {Object.entries(USStates).map(([code, name]) => (
                          <SelectItem key={code} value={name}>
                            {name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Case Type</Label>
                    <Select value={caseType} onValueChange={setCaseType}>
                      <SelectTrigger>
                        <SelectValue placeholder="All Types" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Types</SelectItem>
                        {Object.entries(UniCourtCaseTypes).map(([key, label]) => (
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

              {/* Party/Attorney Search */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">People Search</CardTitle>
                  <CardDescription>Search by party, attorney, or judge</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Party Name</Label>
                    <Input
                      placeholder="e.g., John Smith"
                      value={partyName}
                      onChange={(e) => setPartyName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Attorney Name</Label>
                    <Input
                      placeholder="e.g., Jane Doe"
                      value={attorneyName}
                      onChange={(e) => setAttorneyName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Judge Name</Label>
                    <Input
                      placeholder="e.g., Judge Brown"
                      value={judgeName}
                      onChange={(e) => setJudgeName(e.target.value)}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Quick Case Types */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">Quick Filters</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-1">
                    {QUICK_CASE_TYPES.map((type) => (
                      <Badge
                        key={type}
                        variant={caseType === type ? 'default' : 'outline'}
                        className="cursor-pointer"
                        onClick={() => setCaseType(caseType === type ? 'all' : type)}
                      >
                        {type}
                      </Badge>
                    ))}
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
                    Use UniCourt query syntax for precise state court searches
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Textarea
                      ref={queryInputRef}
                      placeholder='Example: caseName:(Smith v. Jones) AND CaseType:(name:"Civil")'
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
                      Press Ctrl+Enter to search. Use the Query Fields tab for syntax help.
                    </p>
                  </div>

                  {/* Quick Insert Fields */}
                  <div className="flex flex-wrap gap-1">
                    <Button variant="outline" size="sm" onClick={() => insertField('caseName:')}>caseName:</Button>
                    <Button variant="outline" size="sm" onClick={() => insertField('caseNumber:')}>caseNumber:</Button>
                    <Button variant="outline" size="sm" onClick={() => insertField('Party:(name:")')}>Party:</Button>
                    <Button variant="outline" size="sm" onClick={() => insertField('Attorney:(name:")')}>Attorney:</Button>
                    <Button variant="outline" size="sm" onClick={() => insertField('Judge:(name:")')}>Judge:</Button>
                    <Button variant="outline" size="sm" onClick={() => insertField('DocketEntry:')}>DocketEntry:</Button>
                    <Button variant="outline" size="sm" onClick={() => insertField(' AND ')}> AND </Button>
                    <Button variant="outline" size="sm" onClick={() => insertField(' OR ')}> OR </Button>
                  </div>

                  <div className="flex gap-2">
                    <Button onClick={() => handleSearch()} disabled={loading} className="flex-1">
                      {loading ? 'Searching...' : 'Search UniCourt'}
                    </Button>
                    <Button variant="outline" onClick={() => {
                      setQuery('')
                      setPartyName('')
                      setAttorneyName('')
                      setJudgeName('')
                    }}>
                      Clear
                    </Button>
                  </div>

                  {/* State Court Pattern Templates */}
                  <div className="pt-4 border-t">
                    <p className="text-sm font-medium mb-2">State Court Templates:</p>
                    <div className="flex flex-wrap gap-2">
                      {STATE_COURT_PATTERNS.slice(0, 6).map((pattern, i) => (
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
                            <div className="flex items-center gap-2 mb-2 flex-wrap">
                              <Badge variant="secondary">State Court</Badge>
                              {result.metadata?.state && (
                                <Badge variant="outline">{result.metadata.state}</Badge>
                              )}
                              {result.metadata?.caseType && (
                                <Badge variant="outline">{result.metadata.caseType}</Badge>
                              )}
                            </div>
                            <CardTitle className="text-lg">
                              <SearchResultLink href={result.url}>
                                {result.title}
                              </SearchResultLink>
                            </CardTitle>
                            {result.metadata && (result.metadata.caseNumber || result.metadata.filedDate || result.metadata.court) && (
                              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-sm text-muted-foreground">
                                {result.metadata.caseNumber && (
                                  <span><span className="font-medium">Docket:</span> {result.metadata.caseNumber}</span>
                                )}
                                {result.metadata.filedDate && (
                                  <span><span className="font-medium">Filed:</span> {result.metadata.filedDate}</span>
                                )}
                                {result.metadata.court && (
                                  <span><span className="font-medium">Court:</span> {result.metadata.court}</span>
                                )}
                                {result.metadata.caseStatus && (
                                  <Badge variant={result.metadata.caseStatus === 'Open' ? 'default' : 'secondary'} className="text-xs">
                                    {result.metadata.caseStatus}
                                  </Badge>
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
                            View on UniCourt
                          </Button>
                        </div>
                      </CardContent>
                    </SearchResultCard>
                  ))}
                </div>
              )}

              {!loading && results.length === 0 && (query || partyName || attorneyName || judgeName) && (
                <Card>
                  <CardContent className="py-8 text-center text-muted-foreground">
                    No results found. Try adjusting your query or filters.
                  </CardContent>
                </Card>
              )}

              {!query && !partyName && !attorneyName && !judgeName && (
                <Card>
                  <CardContent className="py-12 text-center">
                    <h3 className="text-xl font-semibold mb-4">Start Your State Court Research</h3>
                    <p className="text-muted-foreground mb-6">
                      Enter a search query, use the people search filters, or select a template
                    </p>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-w-2xl mx-auto">
                      {STATE_COURT_PATTERNS.map((pattern, i) => (
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

        {/* Query Fields Tab */}
        <TabsContent value="fields">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Case Fields */}
            <Card>
              <CardHeader>
                <CardTitle>Case Information Fields</CardTitle>
                <CardDescription>Search by case details</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {UNICOURT_FIELDS.case.map((field, i) => (
                    <div key={i} className="p-3 bg-muted rounded-lg">
                      <div className="flex items-center justify-between mb-1">
                        <Badge variant="secondary">{field.field}</Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-xs"
                          onClick={() => {
                            insertField(field.field)
                            setActiveTab('search')
                          }}
                        >
                          Use
                        </Button>
                      </div>
                      <code className="text-xs text-blue-600 dark:text-blue-400 break-all">{field.example}</code>
                      <p className="text-xs text-muted-foreground mt-1">{field.description}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Party Fields */}
            <Card>
              <CardHeader>
                <CardTitle>Party Information</CardTitle>
                <CardDescription>Search by party details</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {UNICOURT_FIELDS.parties.map((field, i) => (
                    <div key={i} className="p-3 bg-muted rounded-lg">
                      <div className="flex items-center justify-between mb-1">
                        <Badge variant="secondary" className="text-xs">{field.field}</Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-xs"
                          onClick={() => {
                            insertField(field.field)
                            setActiveTab('search')
                          }}
                        >
                          Use
                        </Button>
                      </div>
                      <code className="text-xs text-blue-600 dark:text-blue-400 break-all">{field.example}</code>
                      <p className="text-xs text-muted-foreground mt-1">{field.description}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Attorney Fields */}
            <Card>
              <CardHeader>
                <CardTitle>Attorney Information</CardTitle>
                <CardDescription>Search by attorney or firm</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {UNICOURT_FIELDS.attorneys.map((field, i) => (
                    <div key={i} className="p-3 bg-muted rounded-lg">
                      <div className="flex items-center justify-between mb-1">
                        <Badge variant="secondary" className="text-xs">{field.field}</Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-xs"
                          onClick={() => {
                            insertField(field.field)
                            setActiveTab('search')
                          }}
                        >
                          Use
                        </Button>
                      </div>
                      <code className="text-xs text-blue-600 dark:text-blue-400 break-all">{field.example}</code>
                      <p className="text-xs text-muted-foreground mt-1">{field.description}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Court Fields */}
            <Card>
              <CardHeader>
                <CardTitle>Court & Jurisdiction</CardTitle>
                <CardDescription>Filter by court and location</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {UNICOURT_FIELDS.court.map((field, i) => (
                    <div key={i} className="p-3 bg-muted rounded-lg">
                      <div className="flex items-center justify-between mb-1">
                        <Badge variant="secondary" className="text-xs">{field.field}</Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-xs"
                          onClick={() => {
                            insertField(field.field)
                            setActiveTab('search')
                          }}
                        >
                          Use
                        </Button>
                      </div>
                      <code className="text-xs text-blue-600 dark:text-blue-400 break-all">{field.example}</code>
                      <p className="text-xs text-muted-foreground mt-1">{field.description}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Docket Fields */}
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle>Docket & Filing Information</CardTitle>
                <CardDescription>Search docket entries and filings</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {UNICOURT_FIELDS.docket.map((field, i) => (
                    <div key={i} className="p-3 bg-muted rounded-lg">
                      <div className="flex items-center justify-between mb-1">
                        <Badge variant="secondary">{field.field}</Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-xs"
                          onClick={() => {
                            insertField(field.field)
                            setActiveTab('search')
                          }}
                        >
                          Use
                        </Button>
                      </div>
                      <code className="text-xs text-blue-600 dark:text-blue-400 break-all">{field.example}</code>
                      <p className="text-xs text-muted-foreground mt-1">{field.description}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Tips Card */}
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle>State Court Research Tips</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div className="space-y-2">
                    <h4 className="font-medium">Effective Strategies</h4>
                    <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                      <li>Start with state filter to narrow results</li>
                      <li>Use case type filter for specific practice areas</li>
                      <li>Search by attorney to find opponent&apos;s past cases</li>
                      <li>Use docket entries to find specific motions</li>
                    </ul>
                  </div>
                  <div className="space-y-2">
                    <h4 className="font-medium">Query Syntax Tips</h4>
                    <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                      <li>Use AND/OR for complex queries</li>
                      <li>Wrap phrases in quotes: &quot;motion to dismiss&quot;</li>
                      <li>Use date ranges: filedDate:[2023-01-01 TO *]</li>
                      <li>Combine filters for precise results</li>
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
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Case Name</Label>
                    <Input
                      placeholder="e.g., Smith v. Jones"
                      value={caseContext.caseName}
                      onChange={(e) => setCaseContext((prev) => ({ ...prev, caseName: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Case Number</Label>
                    <Input
                      placeholder="e.g., 2023-CV-1234"
                      value={caseContext.caseNumber}
                      onChange={(e) => setCaseContext((prev) => ({ ...prev, caseNumber: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>State</Label>
                    <Select
                      value={caseContext.state || '_none'}
                      onValueChange={(v) => setCaseContext((prev) => ({ ...prev, state: v === '_none' ? '' : v }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select state..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_none">Not specified</SelectItem>
                        {Object.entries(USStates).map(([code, name]) => (
                          <SelectItem key={code} value={name}>
                            {name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>County</Label>
                    <Input
                      placeholder="e.g., Los Angeles"
                      value={caseContext.county}
                      onChange={(e) => setCaseContext((prev) => ({ ...prev, county: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Case Type</Label>
                  <Select
                    value={caseContext.caseType || '_none'}
                    onValueChange={(v) => setCaseContext((prev) => ({ ...prev, caseType: v === '_none' ? '' : v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select case type..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">Not specified</SelectItem>
                      {Object.entries(UniCourtCaseTypes).map(([key, label]) => (
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
                  Add issues to quickly search for relevant cases
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

                {/* Suggested Issues for State Courts */}
                <div className="pt-4 border-t">
                  <p className="text-sm font-medium mb-2">Common State Court Issues:</p>
                  <div className="flex flex-wrap gap-1">
                    {[
                      'Breach of Contract',
                      'Negligence',
                      'Personal Injury',
                      'Custody Dispute',
                      'Property Division',
                      'Eviction',
                      'Will Contest',
                      'Fraud',
                      'Employment Dispute',
                      'Insurance Claim',
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
                    Your recent UniCourt searches ({searchHistory.length} saved)
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
                              {item.state !== 'all' && (
                                <Badge variant="secondary" className="text-xs">
                                  {item.state}
                                </Badge>
                              )}
                              {item.caseType !== 'all' && (
                                <Badge variant="outline" className="text-xs">
                                  {item.caseType}
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
