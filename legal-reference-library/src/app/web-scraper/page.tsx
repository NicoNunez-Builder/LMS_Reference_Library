'use client'

import { useState, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AddToLibraryModal } from '@/components/AddToLibraryModal'
import { SearchResult, SourceType } from '@/types'

// Types
interface ScrapeResult {
  url: string
  title: string
  markdown?: string
  html?: string
  metadata?: {
    title?: string
    description?: string
    language?: string
    sourceURL?: string
    statusCode?: number
  }
}

interface CrawlJob {
  id: string
  url: string
  status: 'started' | 'scraping' | 'completed' | 'failed'
  total?: number
  completed?: number
  startedAt: number
  results: ScrapeResult[]
}

interface DiscoveredDocument {
  url: string
  filename: string
  fileType: string
}

// Storage keys
const CRAWL_JOBS_KEY = 'web-scraper-crawl-jobs'
const SCRAPE_HISTORY_KEY = 'web-scraper-history'
const MAX_HISTORY = 20

export default function WebScraperPage() {
  // Config state
  const [apiConfigured, setApiConfigured] = useState<boolean | null>(null)

  // Scrape state
  const [scrapeUrl, setScrapeUrl] = useState('')
  const [scraping, setScraping] = useState(false)
  const [scrapeResult, setScrapeResult] = useState<ScrapeResult | null>(null)
  const [scrapeError, setScrapeError] = useState('')
  const [onlyMainContent, setOnlyMainContent] = useState(true)
  const [includeHtml, setIncludeHtml] = useState(false)

  // Crawl state
  const [crawlUrl, setCrawlUrl] = useState('')
  const [crawling, setCrawling] = useState(false)
  const [crawlLimit, setCrawlLimit] = useState('50')
  const [maxDepth, setMaxDepth] = useState('3')
  const [includePaths, setIncludePaths] = useState('')
  const [excludePaths, setExcludePaths] = useState('')
  const [allowExternalLinks, setAllowExternalLinks] = useState(false)
  const [crawlJobs, setCrawlJobs] = useState<CrawlJob[]>([])
  const [selectedJob, setSelectedJob] = useState<CrawlJob | null>(null)

  // Document finder state
  const [mapUrl, setMapUrl] = useState('')
  const [mapping, setMapping] = useState(false)
  const [mapFilterType, setMapFilterType] = useState('pdf')
  const [discoveredDocs, setDiscoveredDocs] = useState<DiscoveredDocument[]>([])
  const [mapMessage, setMapMessage] = useState('')
  const [selectedDocs, setSelectedDocs] = useState<Set<string>>(new Set())
  const [deepScan, setDeepScan] = useState(true) // Use content-type detection by default
  const [multiPage, setMultiPage] = useState(false) // Crawl entire site
  const [maxPages, setMaxPages] = useState('50')
  const [crawlDepth, setCrawlDepth] = useState('3')

  // History
  const [scrapeHistory, setScrapeHistory] = useState<ScrapeResult[]>([])

  // Modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [selectedResult, setSelectedResult] = useState<SearchResult | null>(null)
  const [successMessage, setSuccessMessage] = useState('')

  // Content preview state
  const [previewContent, setPreviewContent] = useState<ScrapeResult | null>(null)
  const [showPreview, setShowPreview] = useState(false)

  // Active tab
  const [activeTab, setActiveTab] = useState('scrape')

  // Check API configuration
  useEffect(() => {
    const checkConfig = async () => {
      try {
        const response = await fetch('/api/scrape')
        const data = await response.json()
        setApiConfigured(data.configured)
      } catch {
        setApiConfigured(false)
      }
    }
    checkConfig()
  }, [])

  // Load history and crawl jobs
  useEffect(() => {
    try {
      const storedHistory = localStorage.getItem(SCRAPE_HISTORY_KEY)
      if (storedHistory) {
        setScrapeHistory(JSON.parse(storedHistory))
      }

      const storedJobs = localStorage.getItem(CRAWL_JOBS_KEY)
      if (storedJobs) {
        setCrawlJobs(JSON.parse(storedJobs))
      }
    } catch (error) {
      console.error('Failed to load stored data:', error)
    }
  }, [])

  // Poll for crawl job status
  useEffect(() => {
    const activeJobs = crawlJobs.filter(job =>
      job.status === 'started' || job.status === 'scraping'
    )

    if (activeJobs.length === 0) return

    const interval = setInterval(async () => {
      for (const job of activeJobs) {
        try {
          const response = await fetch(`/api/crawl?jobId=${job.id}`)
          const data = await response.json()

          if (data.success) {
            setCrawlJobs(prev => {
              const updated = prev.map(j => {
                if (j.id === job.id) {
                  return {
                    ...j,
                    status: data.status,
                    total: data.total,
                    completed: data.completed,
                    results: data.data || [],
                  }
                }
                return j
              })
              localStorage.setItem(CRAWL_JOBS_KEY, JSON.stringify(updated))
              return updated
            })
          }
        } catch (error) {
          console.error('Failed to check crawl status:', error)
        }
      }
    }, 5000) // Poll every 5 seconds

    return () => clearInterval(interval)
  }, [crawlJobs])

  // Scrape single URL
  const handleScrape = async () => {
    if (!scrapeUrl.trim()) return

    setScraping(true)
    setScrapeError('')
    setScrapeResult(null)

    try {
      const formats = ['markdown']
      if (includeHtml) formats.push('html')

      const response = await fetch('/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: scrapeUrl,
          formats,
          onlyMainContent,
        }),
      })

      const data = await response.json()

      if (data.error) {
        setScrapeError(data.error + (data.details ? `: ${data.details}` : ''))
        return
      }

      const result: ScrapeResult = {
        url: scrapeUrl,
        title: data.data?.metadata?.title || scrapeUrl,
        markdown: data.data?.markdown,
        html: data.data?.html,
        metadata: data.data?.metadata,
      }

      setScrapeResult(result)

      // Add to history
      setScrapeHistory(prev => {
        const filtered = prev.filter(item => item.url !== scrapeUrl)
        const newHistory = [result, ...filtered].slice(0, MAX_HISTORY)
        localStorage.setItem(SCRAPE_HISTORY_KEY, JSON.stringify(newHistory))
        return newHistory
      })
    } catch (error) {
      setScrapeError(String(error))
    } finally {
      setScraping(false)
    }
  }

  // Start crawl job
  const handleCrawl = async () => {
    if (!crawlUrl.trim()) return

    setCrawling(true)

    try {
      const response = await fetch('/api/crawl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: crawlUrl,
          limit: parseInt(crawlLimit),
          maxDepth: parseInt(maxDepth),
          includePaths: includePaths ? includePaths.split(',').map(p => p.trim()) : undefined,
          excludePaths: excludePaths ? excludePaths.split(',').map(p => p.trim()) : undefined,
          allowExternalLinks,
        }),
      })

      const data = await response.json()

      if (data.error) {
        alert(`Crawl failed: ${data.error}`)
        return
      }

      const newJob: CrawlJob = {
        id: data.jobId,
        url: crawlUrl,
        status: 'started',
        startedAt: Date.now(),
        results: [],
      }

      setCrawlJobs(prev => {
        const updated = [newJob, ...prev]
        localStorage.setItem(CRAWL_JOBS_KEY, JSON.stringify(updated))
        return updated
      })

      setCrawlUrl('')
      setActiveTab('jobs')
    } catch (error) {
      alert(`Crawl error: ${error}`)
    } finally {
      setCrawling(false)
    }
  }

  // Map website for documents
  const handleMapDocuments = async () => {
    if (!mapUrl.trim()) return

    setMapping(true)
    setDiscoveredDocs([])
    setMapMessage('')
    setSelectedDocs(new Set())

    try {
      let endpoint: string
      let body: Record<string, unknown>

      if (multiPage) {
        // Multi-page crawl - crawls entire site
        endpoint = '/api/crawl-pdfs'
        body = {
          url: mapUrl,
          filterType: mapFilterType,
          maxPages: parseInt(maxPages),
          maxDepth: parseInt(crawlDepth),
        }
        setMapMessage('Crawling site for documents... This may take a few minutes.')
      } else if (deepScan) {
        // Single page deep scan (content-type detection)
        endpoint = '/api/discover-pdfs'
        body = {
          url: mapUrl,
          filterType: mapFilterType,
          maxChecks: 50,
        }
      } else {
        // Fast scan (URL extension only)
        endpoint = '/api/map'
        body = {
          url: mapUrl,
          filterType: mapFilterType,
          limit: 500,
        }
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const data = await response.json()

      if (data.error) {
        setMapMessage(`Error: ${data.error}`)
        return
      }

      setDiscoveredDocs(data.documents || [])
      setMapMessage(data.message || `Found ${data.documents?.length || 0} documents`)
    } catch (error) {
      setMapMessage(`Error: ${String(error)}`)
    } finally {
      setMapping(false)
    }
  }

  // Toggle document selection
  const toggleDocSelection = (url: string) => {
    setSelectedDocs(prev => {
      const next = new Set(prev)
      if (next.has(url)) {
        next.delete(url)
      } else {
        next.add(url)
      }
      return next
    })
  }

  // Select all documents
  const selectAllDocs = () => {
    if (selectedDocs.size === discoveredDocs.length) {
      setSelectedDocs(new Set())
    } else {
      setSelectedDocs(new Set(discoveredDocs.map(d => d.url)))
    }
  }

  // Add discovered document to library
  const handleAddDocToLibrary = (doc: DiscoveredDocument) => {
    const searchResult: SearchResult = {
      title: doc.filename,
      url: doc.url,
      snippet: `${doc.fileType} document from ${mapUrl}`,
      source_type: doc.fileType === 'PDF' ? SourceType.PDF : SourceType.DOCUMENT,
    }
    setSelectedResult(searchResult)
    setModalOpen(true)
  }

  // Delete crawl job
  const deleteCrawlJob = (jobId: string) => {
    setCrawlJobs(prev => {
      const updated = prev.filter(job => job.id !== jobId)
      localStorage.setItem(CRAWL_JOBS_KEY, JSON.stringify(updated))
      return updated
    })
    if (selectedJob?.id === jobId) {
      setSelectedJob(null)
    }
  }

  // Convert scrape result to search result for library modal
  const convertToSearchResult = (result: ScrapeResult): SearchResult => ({
    title: result.title || result.metadata?.title || result.url,
    url: result.url,
    snippet: result.metadata?.description || result.markdown?.slice(0, 200) || '',
    source_type: SourceType.WEBSITE,
    metadata: {
      author: undefined,
    },
  })

  // Add to library handler
  const handleAddToLibrary = (result: ScrapeResult) => {
    setSelectedResult(convertToSearchResult(result))
    setModalOpen(true)
  }

  // Preview content handler
  const handlePreview = (result: ScrapeResult) => {
    setPreviewContent(result)
    setShowPreview(true)
  }

  const handleAddSuccess = () => {
    setSuccessMessage(`Added to library successfully!`)
    setSelectedResult(null)
  }

  // If API not configured, show setup
  if (apiConfigured === false) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">Web Scraper</h1>
          <p className="text-muted-foreground text-lg">
            Scrape and crawl websites to discover legal resources
          </p>
        </div>

        <Card className="max-w-2xl mx-auto">
          <CardHeader>
            <CardTitle>Firecrawl API Configuration Required</CardTitle>
            <CardDescription>
              To use the Web Scraper, you need to configure your Firecrawl API key.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 bg-amber-50 dark:bg-amber-950 rounded-lg border border-amber-200 dark:border-amber-800">
              <h4 className="font-medium text-amber-800 dark:text-amber-200 mb-2">Setup Instructions:</h4>
              <ol className="list-decimal list-inside space-y-2 text-sm text-amber-700 dark:text-amber-300">
                <li>Sign up for Firecrawl at <a href="https://firecrawl.dev" target="_blank" rel="noopener noreferrer" className="underline">firecrawl.dev</a></li>
                <li>Get your API key from the dashboard</li>
                <li>Add it to your <code className="bg-amber-100 dark:bg-amber-900 px-1 rounded">.env.local</code> file:</li>
              </ol>
              <pre className="mt-3 p-3 bg-gray-900 text-gray-100 rounded text-sm overflow-x-auto">
{`FIRECRAWL_API_KEY=your_api_key_here`}
              </pre>
            </div>

            <div className="pt-4">
              <h4 className="font-medium mb-2">Features:</h4>
              <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                <li>Scrape single pages to clean markdown</li>
                <li>Crawl entire websites to discover resources</li>
                <li>Extract main content, skip navigation/ads</li>
                <li>Save scraped content directly to your library</li>
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
        <h1 className="text-4xl font-bold mb-2">Web Scraper</h1>
        <p className="text-muted-foreground text-lg">
          Scrape and crawl websites to discover legal resources
        </p>
        <div className="flex gap-2 mt-4 flex-wrap">
          <Badge variant="secondary">Find PDFs</Badge>
          <Badge variant="secondary">Single Page Scrape</Badge>
          <Badge variant="secondary">Website Crawler</Badge>
          <Badge variant="secondary">Save to Library</Badge>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-5 mb-6">
          <TabsTrigger value="find-docs">Find PDFs</TabsTrigger>
          <TabsTrigger value="scrape">Scrape URL</TabsTrigger>
          <TabsTrigger value="crawl">Crawl Site</TabsTrigger>
          <TabsTrigger value="jobs">
            Jobs {crawlJobs.length > 0 && `(${crawlJobs.length})`}
          </TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        {/* Find Documents Tab */}
        <TabsContent value="find-docs">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Search Form */}
            <Card className="lg:col-span-1">
              <CardHeader>
                <CardTitle>Find Documents</CardTitle>
                <CardDescription>
                  Discover PDFs and documents on any website
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Website URL</Label>
                  <Input
                    placeholder="https://example.com"
                    value={mapUrl}
                    onChange={(e) => setMapUrl(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleMapDocuments()}
                  />
                  <p className="text-xs text-muted-foreground">
                    Enter a website URL to scan for documents
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Document Type</Label>
                  <Select value={mapFilterType} onValueChange={setMapFilterType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Documents</SelectItem>
                      <SelectItem value="pdf">PDFs Only</SelectItem>
                      <SelectItem value="doc">Word Docs (.doc, .docx)</SelectItem>
                      <SelectItem value="ebook">eBooks (.epub, .mobi)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-3 pt-2 border-t">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="multiPage"
                      checked={multiPage}
                      onCheckedChange={(checked) => setMultiPage(checked as boolean)}
                    />
                    <Label htmlFor="multiPage" className="text-sm font-medium">
                      Crawl entire site (multi-page)
                    </Label>
                  </div>

                  {multiPage && (
                    <div className="grid grid-cols-2 gap-2 pl-6">
                      <div className="space-y-1">
                        <Label className="text-xs">Max Pages</Label>
                        <Select value={maxPages} onValueChange={setMaxPages}>
                          <SelectTrigger className="h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="10">10 pages</SelectItem>
                            <SelectItem value="25">25 pages</SelectItem>
                            <SelectItem value="50">50 pages</SelectItem>
                            <SelectItem value="100">100 pages</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Max Depth</Label>
                        <Select value={crawlDepth} onValueChange={setCrawlDepth}>
                          <SelectTrigger className="h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="1">1 level</SelectItem>
                            <SelectItem value="2">2 levels</SelectItem>
                            <SelectItem value="3">3 levels</SelectItem>
                            <SelectItem value="5">5 levels</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}

                  {!multiPage && (
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="deepScan"
                        checked={deepScan}
                        onCheckedChange={(checked) => setDeepScan(checked as boolean)}
                      />
                      <Label htmlFor="deepScan" className="text-sm">
                        Deep scan (finds hidden PDFs)
                      </Label>
                    </div>
                  )}
                </div>

                <Button
                  onClick={handleMapDocuments}
                  disabled={mapping || !mapUrl.trim()}
                  className="w-full"
                >
                  {mapping
                    ? (multiPage ? 'Crawling site...' : 'Scanning...')
                    : (multiPage ? 'Crawl Site for Documents' : 'Find Documents')}
                </Button>

                {mapMessage && (
                  <div className={`p-3 rounded border ${
                    mapMessage.startsWith('Error')
                      ? 'bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300'
                      : 'bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300'
                  }`}>
                    <p className="text-sm">{mapMessage}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Results */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Discovered Documents</CardTitle>
                    <CardDescription>
                      {discoveredDocs.length} document(s) found
                    </CardDescription>
                  </div>
                  {discoveredDocs.length > 0 && (
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={selectAllDocs}
                      >
                        {selectedDocs.size === discoveredDocs.length ? 'Deselect All' : 'Select All'}
                      </Button>
                      {selectedDocs.size > 0 && (
                        <Badge variant="secondary">
                          {selectedDocs.size} selected
                        </Badge>
                      )}
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {discoveredDocs.length > 0 ? (
                  <div className="space-y-2 max-h-[500px] overflow-y-auto">
                    {discoveredDocs.map((doc, index) => (
                      <div
                        key={index}
                        className={`p-3 border rounded-lg flex items-center gap-3 hover:bg-muted/50 ${
                          selectedDocs.has(doc.url) ? 'border-primary bg-muted' : ''
                        }`}
                      >
                        <Checkbox
                          checked={selectedDocs.has(doc.url)}
                          onCheckedChange={() => toggleDocSelection(doc.url)}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">
                              {doc.fileType}
                            </Badge>
                            <span className="font-medium truncate">
                              {doc.filename}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground truncate mt-1">
                            {doc.url}
                          </p>
                        </div>
                        <div className="flex gap-2 flex-shrink-0">
                          <Button
                            variant="outline"
                            size="sm"
                            asChild
                          >
                            <a
                              href={doc.url}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              View
                            </a>
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleAddDocToLibrary(doc)}
                          >
                            Add
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    {mapping ? (
                      <div className="flex flex-col items-center gap-2">
                        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
                        <p>Scanning website for documents...</p>
                      </div>
                    ) : (
                      <p>Enter a URL and click &quot;Find Documents&quot; to discover PDFs and other documents</p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Scrape Tab */}
        <TabsContent value="scrape">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Scrape Form */}
            <Card className="lg:col-span-1">
              <CardHeader>
                <CardTitle>Scrape Single URL</CardTitle>
                <CardDescription>
                  Extract content from a single webpage
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>URL to Scrape</Label>
                  <Input
                    placeholder="https://example.com/page"
                    value={scrapeUrl}
                    onChange={(e) => setScrapeUrl(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleScrape()}
                  />
                </div>

                <div className="space-y-3">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="mainContent"
                      checked={onlyMainContent}
                      onCheckedChange={(checked) => setOnlyMainContent(checked as boolean)}
                    />
                    <Label htmlFor="mainContent" className="text-sm">
                      Only main content (skip nav/footer)
                    </Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="includeHtml"
                      checked={includeHtml}
                      onCheckedChange={(checked) => setIncludeHtml(checked as boolean)}
                    />
                    <Label htmlFor="includeHtml" className="text-sm">
                      Include raw HTML
                    </Label>
                  </div>
                </div>

                <Button
                  onClick={handleScrape}
                  disabled={scraping || !scrapeUrl.trim()}
                  className="w-full"
                >
                  {scraping ? 'Scraping...' : 'Scrape Page'}
                </Button>

                {scrapeError && (
                  <div className="p-3 bg-red-50 dark:bg-red-950 rounded border border-red-200 dark:border-red-800">
                    <p className="text-sm text-red-700 dark:text-red-300">{scrapeError}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Scrape Result */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Scraped Content</CardTitle>
                    {scrapeResult && (
                      <CardDescription className="truncate max-w-lg">
                        {scrapeResult.title}
                      </CardDescription>
                    )}
                  </div>
                  {scrapeResult && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleAddToLibrary(scrapeResult)}
                    >
                      Add to Library
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {scrapeResult ? (
                  <div className="space-y-4">
                    {scrapeResult.metadata && (
                      <div className="flex flex-wrap gap-2">
                        {scrapeResult.metadata.language && (
                          <Badge variant="outline">
                            Lang: {scrapeResult.metadata.language}
                          </Badge>
                        )}
                        {scrapeResult.metadata.statusCode && (
                          <Badge variant="outline">
                            Status: {scrapeResult.metadata.statusCode}
                          </Badge>
                        )}
                      </div>
                    )}

                    <div className="prose dark:prose-invert max-w-none">
                      <div className="p-4 bg-muted rounded-lg max-h-[500px] overflow-y-auto">
                        <pre className="whitespace-pre-wrap text-sm">
                          {scrapeResult.markdown || 'No content extracted'}
                        </pre>
                      </div>
                    </div>

                    {includeHtml && scrapeResult.html && (
                      <details className="mt-4">
                        <summary className="cursor-pointer text-sm font-medium">
                          View Raw HTML
                        </summary>
                        <div className="mt-2 p-4 bg-muted rounded-lg max-h-[300px] overflow-y-auto">
                          <pre className="text-xs whitespace-pre-wrap">
                            {scrapeResult.html}
                          </pre>
                        </div>
                      </details>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    Enter a URL and click &quot;Scrape Page&quot; to extract content
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Crawl Tab */}
        <TabsContent value="crawl">
          <Card>
            <CardHeader>
              <CardTitle>Crawl Website</CardTitle>
              <CardDescription>
                Crawl an entire website to discover and scrape multiple pages
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Starting URL</Label>
                  <Input
                    placeholder="https://example.com"
                    value={crawlUrl}
                    onChange={(e) => setCrawlUrl(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    The crawler will start here and follow links
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Max Pages</Label>
                    <Select value={crawlLimit} onValueChange={setCrawlLimit}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="10">10 pages</SelectItem>
                        <SelectItem value="25">25 pages</SelectItem>
                        <SelectItem value="50">50 pages</SelectItem>
                        <SelectItem value="100">100 pages</SelectItem>
                        <SelectItem value="200">200 pages</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Max Depth</Label>
                    <Select value={maxDepth} onValueChange={setMaxDepth}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">1 level</SelectItem>
                        <SelectItem value="2">2 levels</SelectItem>
                        <SelectItem value="3">3 levels</SelectItem>
                        <SelectItem value="5">5 levels</SelectItem>
                        <SelectItem value="10">10 levels</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Include Paths (optional)</Label>
                  <Input
                    placeholder="/cases, /opinions, /documents"
                    value={includePaths}
                    onChange={(e) => setIncludePaths(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Comma-separated paths to include
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Exclude Paths (optional)</Label>
                  <Input
                    placeholder="/login, /admin, /api"
                    value={excludePaths}
                    onChange={(e) => setExcludePaths(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Comma-separated paths to exclude
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="externalLinks"
                  checked={allowExternalLinks}
                  onCheckedChange={(checked) => setAllowExternalLinks(checked as boolean)}
                />
                <Label htmlFor="externalLinks" className="text-sm">
                  Allow external links (crawl linked external sites)
                </Label>
              </div>

              <Button
                onClick={handleCrawl}
                disabled={crawling || !crawlUrl.trim()}
                className="w-full md:w-auto"
              >
                {crawling ? 'Starting Crawl...' : 'Start Crawl'}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Jobs Tab */}
        <TabsContent value="jobs">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Jobs List */}
            <Card className="lg:col-span-1">
              <CardHeader>
                <CardTitle>Crawl Jobs</CardTitle>
                <CardDescription>
                  {crawlJobs.length} job(s)
                </CardDescription>
              </CardHeader>
              <CardContent>
                {crawlJobs.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    No crawl jobs yet. Start a crawl to see jobs here.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {crawlJobs.map((job) => (
                      <div
                        key={job.id}
                        className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                          selectedJob?.id === job.id
                            ? 'border-primary bg-muted'
                            : 'hover:bg-muted/50'
                        }`}
                        onClick={() => setSelectedJob(job)}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <Badge
                            variant={
                              job.status === 'completed'
                                ? 'default'
                                : job.status === 'failed'
                                ? 'destructive'
                                : 'secondary'
                            }
                          >
                            {job.status}
                          </Badge>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            onClick={(e) => {
                              e.stopPropagation()
                              deleteCrawlJob(job.id)
                            }}
                          >
                            X
                          </Button>
                        </div>
                        <p className="text-sm truncate">{job.url}</p>
                        <p className="text-xs text-muted-foreground">
                          {job.completed || 0} / {job.total || '?'} pages
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(job.startedAt).toLocaleString()}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Job Results */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>
                  {selectedJob ? 'Crawl Results' : 'Select a Job'}
                </CardTitle>
                {selectedJob && (
                  <CardDescription>
                    {selectedJob.results.length} pages scraped from {selectedJob.url}
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent>
                {selectedJob ? (
                  selectedJob.results.length > 0 ? (
                    <div className="space-y-3 max-h-[600px] overflow-y-auto">
                      {selectedJob.results.map((result, index) => (
                        <div
                          key={index}
                          className="p-3 border rounded-lg"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="font-medium truncate">
                                {result.metadata?.title || result.url}
                              </p>
                              <p className="text-xs text-muted-foreground truncate">
                                {result.url}
                              </p>
                              {result.markdown && (
                                <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                                  {result.markdown.slice(0, 150)}...
                                </p>
                              )}
                            </div>
                            <div className="flex gap-1">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handlePreview({
                                  url: result.url,
                                  title: result.metadata?.title || result.url,
                                  markdown: result.markdown,
                                  metadata: result.metadata,
                                })}
                              >
                                Preview
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleAddToLibrary({
                                  url: result.url,
                                  title: result.metadata?.title || result.url,
                                  markdown: result.markdown,
                                  metadata: result.metadata,
                                })}
                              >
                                Add
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12 text-muted-foreground">
                      {selectedJob.status === 'completed'
                        ? 'No pages were scraped'
                        : 'Crawl in progress... Results will appear here.'}
                    </div>
                  )
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    Select a job from the list to view results
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Scrape History</CardTitle>
                  <CardDescription>
                    Recently scraped pages ({scrapeHistory.length})
                  </CardDescription>
                </div>
                {scrapeHistory.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setScrapeHistory([])
                      localStorage.removeItem(SCRAPE_HISTORY_KEY)
                    }}
                  >
                    Clear History
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {scrapeHistory.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  No scrape history yet. Scraped pages will appear here.
                </p>
              ) : (
                <div className="space-y-3">
                  {scrapeHistory.map((result, index) => (
                    <div
                      key={index}
                      className="p-4 border rounded-lg hover:bg-muted/50"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium">{result.title}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {result.url}
                          </p>
                          {result.markdown && (
                            <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                              {result.markdown.slice(0, 200)}...
                            </p>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handlePreview(result)}
                          >
                            Preview
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setScrapeUrl(result.url)
                              setScrapeResult(result)
                              setActiveTab('scrape')
                            }}
                          >
                            View
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleAddToLibrary(result)}
                          >
                            Add
                          </Button>
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

      {/* Content Preview Modal */}
      {showPreview && previewContent && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <Card className="w-full max-w-4xl max-h-[90vh] flex flex-col">
            <CardHeader className="flex-shrink-0 border-b">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <CardTitle className="truncate">
                    {previewContent.title || previewContent.metadata?.title || 'Scraped Content'}
                  </CardTitle>
                  <CardDescription className="truncate">
                    <a
                      href={previewContent.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:underline"
                    >
                      {previewContent.url}
                    </a>
                  </CardDescription>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 flex-shrink-0"
                  onClick={() => {
                    setShowPreview(false)
                    setPreviewContent(null)
                  }}
                >
                  ✕
                </Button>
              </div>
              {previewContent.metadata && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {previewContent.metadata.language && (
                    <Badge variant="outline">
                      Language: {previewContent.metadata.language}
                    </Badge>
                  )}
                  {previewContent.metadata.statusCode && (
                    <Badge variant="outline">
                      Status: {previewContent.metadata.statusCode}
                    </Badge>
                  )}
                  {previewContent.metadata.description && (
                    <Badge variant="secondary" className="max-w-md truncate">
                      {previewContent.metadata.description}
                    </Badge>
                  )}
                </div>
              )}
            </CardHeader>
            <CardContent className="flex-1 overflow-y-auto p-4">
              {previewContent.markdown ? (
                <div className="prose dark:prose-invert max-w-none">
                  <pre className="whitespace-pre-wrap text-sm bg-muted p-4 rounded-lg">
                    {previewContent.markdown}
                  </pre>
                </div>
              ) : (
                <p className="text-muted-foreground text-center py-8">
                  No content available to preview
                </p>
              )}
            </CardContent>
            <div className="flex-shrink-0 border-t p-4 flex justify-between items-center">
              <div className="text-sm text-muted-foreground">
                {previewContent.markdown && (
                  <span>
                    {previewContent.markdown.split(/\s+/).filter(w => w.length > 0).length} words
                    {' • '}
                    {previewContent.markdown.length.toLocaleString()} characters
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    if (previewContent.markdown) {
                      navigator.clipboard.writeText(previewContent.markdown)
                    }
                  }}
                >
                  Copy Content
                </Button>
                <Button
                  onClick={() => {
                    handleAddToLibrary(previewContent)
                    setShowPreview(false)
                    setPreviewContent(null)
                  }}
                >
                  Add to Library
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}

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
