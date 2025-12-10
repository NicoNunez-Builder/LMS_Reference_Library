'use client'

import { useState, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { AddToLibraryModal } from '@/components/AddToLibraryModal'
import { DownloadIndicator } from '@/components/DownloadIndicator'
import { SearchResultLink } from '@/components/SearchResultLink'
import { SearchResultCard } from '@/components/SearchResultCard'
import { SearchResult } from '@/types'
import { ExternalLink, Database, Mail, FileText, Download, Archive, Copy, Check } from 'lucide-react'

interface DatasetConfig {
  datasets: {
    enron: {
      name: string
      description: string
    }
    wikileaks: {
      name: string
      description: string
      collections: { id: string; name: string; count: number }[]
    }
    courtdocs: {
      name: string
      description: string
      cases: { id: string; name: string; court: string }[]
    }
  }
}

export default function EDiscoveryAssistantPage() {
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState('courtdocs')
  const [config, setConfig] = useState<DatasetConfig | null>(null)

  // Source-specific filters
  const [wikileaksCollection, setWikileaksCollection] = useState('all')
  const [courtCase, setCourtCase] = useState('epstein')

  // Results
  const [enronResults, setEnronResults] = useState<any>(null)
  const [wikileaksResults, setWikileaksResults] = useState<any>(null)
  const [courtResults, setCourtResults] = useState<SearchResult[]>([])

  // Modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [selectedResult, setSelectedResult] = useState<SearchResult | null>(null)
  const [successMessage, setSuccessMessage] = useState('')
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null)

  const copyToClipboard = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url)
      setCopiedUrl(url)
      setTimeout(() => setCopiedUrl(null), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  // Load config on mount and clear search state
  useEffect(() => {
    loadConfig()
    // Clear search state on page load
    setQuery('')
    setEnronResults(null)
    setWikileaksResults(null)
    setCourtResults([])
  }, [])

  const loadConfig = async () => {
    try {
      const response = await fetch('/api/ediscovery')
      const data = await response.json()
      setConfig(data)
    } catch (error) {
      console.error('Failed to load config:', error)
    }
  }

  const handleSearch = async () => {
    if (!query.trim()) return

    setLoading(true)
    try {
      const response = await fetch('/api/ediscovery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          source: activeTab,
          collection: wikileaksCollection,
          caseType: courtCase,
          limit: 25,
        }),
      })

      const data = await response.json()

      if (data.results.enron) {
        setEnronResults(data.results.enron)
      }
      if (data.results.wikileaks) {
        setWikileaksResults(data.results.wikileaks)
      }
      if (data.results.courtdocs) {
        setCourtResults(data.results.courtdocs.results || [])
      }
    } catch (error) {
      console.error('Search error:', error)
    } finally {
      setLoading(false)
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

  const openExternalLink = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2">E-Discovery Assistant</h1>
        <p className="text-muted-foreground text-lg">
          Search and browse electronic discovery datasets for legal research
        </p>
        <div className="flex gap-2 mt-4 flex-wrap">
          <Badge variant="secondary">Enron Emails</Badge>
          <Badge variant="secondary">WikiLeaks Archives</Badge>
          <Badge variant="secondary">Court Documents</Badge>
          <Badge variant="secondary">Clinton FOIA Emails</Badge>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4 mb-6">
          <TabsTrigger value="courtdocs" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Court Documents
          </TabsTrigger>
          <TabsTrigger value="enron" className="flex items-center gap-2">
            <Mail className="h-4 w-4" />
            Enron Emails
          </TabsTrigger>
          <TabsTrigger value="wikileaks" className="flex items-center gap-2">
            <Database className="h-4 w-4" />
            WikiLeaks
          </TabsTrigger>
          <TabsTrigger value="clinton-foia" className="flex items-center gap-2">
            <Archive className="h-4 w-4" />
            Clinton FOIA
          </TabsTrigger>
        </TabsList>

        {/* Court Documents Tab */}
        <TabsContent value="courtdocs">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            <div className="lg:col-span-1 space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Search Filters</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Case Collection</Label>
                    <Select value={courtCase} onValueChange={setCourtCase}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="epstein">Epstein/Maxwell Documents</SelectItem>
                        <SelectItem value="enron-case">Enron Corporate Fraud</SelectItem>
                        <SelectItem value="all">All Cases</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">About</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground space-y-2">
                  <p>Search unsealed court documents from high-profile cases via CourtListener RECAP archive.</p>
                  <p>Documents include motions, orders, exhibits, and depositions.</p>
                </CardContent>
              </Card>
            </div>

            <div className="lg:col-span-3 space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Search Court Documents</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-4">
                    <Input
                      placeholder="Search court documents..."
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                      className="flex-1"
                    />
                    <Button onClick={handleSearch} disabled={loading}>
                      {loading ? 'Searching...' : 'Search'}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {courtResults.length > 0 && (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Found {courtResults.length} documents
                  </p>
                  {courtResults.map((result, index) => (
                    <SearchResultCard key={index} url={result.url}>
                      <CardHeader>
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <Badge variant="secondary">{result.source_type}</Badge>
                              {result.metadata?.court && (
                                <Badge variant="outline">{result.metadata.court}</Badge>
                              )}
                            </div>
                            <CardTitle className="text-lg">
                              <SearchResultLink href={result.url}>
                                {result.title}
                              </SearchResultLink>
                            </CardTitle>
                            {(result.metadata?.docketNumber || result.date || result.metadata?.documentCount) && (
                              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-sm text-muted-foreground">
                                {result.metadata?.docketNumber && (
                                  <span><span className="font-medium">Docket:</span> {result.metadata.docketNumber}</span>
                                )}
                                {result.date && (
                                  <span><span className="font-medium">Filed:</span> {result.date}</span>
                                )}
                                {result.metadata?.documentCount > 0 && (
                                  <span><span className="font-medium">Documents:</span> {result.metadata.documentCount}</span>
                                )}
                              </div>
                            )}
                            {result.snippet && (
                              <div className="mt-3 p-3 bg-muted/50 rounded-md">
                                <p className="text-sm font-medium text-muted-foreground mb-1">Summary:</p>
                                <p className="text-sm">{result.snippet}</p>
                              </div>
                            )}
                            <div className="mt-3 flex items-center gap-2">
                              <span className="text-sm font-medium text-muted-foreground">Source URL:</span>
                              <span className="text-sm text-blue-600 dark:text-blue-400 truncate flex-1 max-w-md">{result.url}</span>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 shrink-0"
                                onClick={() => copyToClipboard(result.url)}
                              >
                                {copiedUrl === result.url ? (
                                  <Check className="h-4 w-4 text-green-500" />
                                ) : (
                                  <Copy className="h-4 w-4" />
                                )}
                              </Button>
                            </div>
                          </div>
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
                            onClick={() => openExternalLink(result.url)}
                          >
                            <ExternalLink className="h-4 w-4 mr-1" />
                            View
                          </Button>
                        </div>
                      </CardContent>
                    </SearchResultCard>
                  ))}
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        {/* Enron Emails Tab */}
        <TabsContent value="enron">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            <div className="lg:col-span-1 space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">About Enron Dataset</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground space-y-2">
                  <p>The Enron email corpus contains ~500,000 emails from 150 employees.</p>
                  <p>Released during the federal investigation into Enron's collapse in 2001.</p>
                  <p>Standard benchmark dataset for e-discovery and legal tech research.</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Dataset Stats</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>Total Emails</span>
                      <Badge variant="secondary">~500,000</Badge>
                    </div>
                    <div className="flex justify-between">
                      <span>Users</span>
                      <Badge variant="secondary">150</Badge>
                    </div>
                    <div className="flex justify-between">
                      <span>Date Range</span>
                      <Badge variant="outline">1998-2002</Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="lg:col-span-3 space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Search Enron Emails</CardTitle>
                  <CardDescription>
                    Search will return links to download and search the Enron dataset
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-4">
                    <Input
                      placeholder="Search Enron emails..."
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                      className="flex-1"
                    />
                    <Button onClick={handleSearch} disabled={loading}>
                      {loading ? 'Searching...' : 'Search'}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Dataset Download Links */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Download Sources</CardTitle>
                  <CardDescription>
                    Access the Enron dataset from these trusted sources
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Card className="border-2 hover:border-primary cursor-pointer" onClick={() => openExternalLink('https://www.cs.cmu.edu/~enron/')}>
                      <CardContent className="pt-6">
                        <div className="flex items-center gap-2 mb-2">
                          <Download className="h-5 w-5" />
                          <span className="font-medium">CMU Dataset</span>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Original dataset from Carnegie Mellon University
                        </p>
                      </CardContent>
                    </Card>

                    <Card className="border-2 hover:border-primary cursor-pointer" onClick={() => openExternalLink('https://www.kaggle.com/datasets/wcukierski/enron-email-dataset')}>
                      <CardContent className="pt-6">
                        <div className="flex items-center gap-2 mb-2">
                          <Download className="h-5 w-5" />
                          <span className="font-medium">Kaggle</span>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Searchable and downloadable on Kaggle
                        </p>
                      </CardContent>
                    </Card>

                    <Card className="border-2 hover:border-primary cursor-pointer" onClick={() => openExternalLink('https://www.edrm.net/resources/data-sets/edrm-enron-email-data-set/')}>
                      <CardContent className="pt-6">
                        <div className="flex items-center gap-2 mb-2">
                          <Download className="h-5 w-5" />
                          <span className="font-medium">EDRM</span>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          EDRM formatted version with PST files
                        </p>
                      </CardContent>
                    </Card>
                  </div>
                </CardContent>
              </Card>

              {enronResults && (
                <Card>
                  <CardHeader>
                    <CardTitle>Search Resources</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground mb-4">{enronResults.message}</p>
                    <div className="space-y-2">
                      {enronResults.resources?.map((resource: any, index: number) => (
                        <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                          <div>
                            <p className="font-medium">{resource.name}</p>
                            <p className="text-sm text-muted-foreground">{resource.description}</p>
                          </div>
                          <Button variant="outline" size="sm" onClick={() => openExternalLink(resource.url)}>
                            <ExternalLink className="h-4 w-4 mr-1" />
                            Open
                          </Button>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </TabsContent>

        {/* WikiLeaks Tab */}
        <TabsContent value="wikileaks">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            <div className="lg:col-span-1 space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Collection Filter</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Email Collection</Label>
                    <Select value={wikileaksCollection} onValueChange={setWikileaksCollection}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Collections</SelectItem>
                        <SelectItem value="podesta">Podesta Emails (~50K)</SelectItem>
                        <SelectItem value="dnc">DNC Emails (~20K)</SelectItem>
                        <SelectItem value="clinton">Clinton Emails (~30K)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">About WikiLeaks</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground space-y-2">
                  <p>WikiLeaks hosts searchable archives of leaked email collections.</p>
                  <p>Search redirects to WikiLeaks' own search interface.</p>
                </CardContent>
              </Card>
            </div>

            <div className="lg:col-span-3 space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Search WikiLeaks Archives</CardTitle>
                  <CardDescription>
                    Search will open WikiLeaks search interface with your query
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-4">
                    <Input
                      placeholder="Search WikiLeaks archives..."
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                      className="flex-1"
                    />
                    <Button onClick={handleSearch} disabled={loading}>
                      {loading ? 'Searching...' : 'Search'}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Collection Quick Links */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Browse Collections</CardTitle>
                  <CardDescription>
                    Direct links to WikiLeaks email archives
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Card className="border-2 hover:border-primary cursor-pointer" onClick={() => openExternalLink('https://wikileaks.org/podesta-emails/')}>
                      <CardContent className="pt-6">
                        <div className="flex items-center gap-2 mb-2">
                          <Mail className="h-5 w-5" />
                          <span className="font-medium">Podesta Emails</span>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          ~50,000 emails from John Podesta
                        </p>
                      </CardContent>
                    </Card>

                    <Card className="border-2 hover:border-primary cursor-pointer" onClick={() => openExternalLink('https://wikileaks.org/dnc-emails/')}>
                      <CardContent className="pt-6">
                        <div className="flex items-center gap-2 mb-2">
                          <Mail className="h-5 w-5" />
                          <span className="font-medium">DNC Emails</span>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          ~20,000 DNC emails from 2016
                        </p>
                      </CardContent>
                    </Card>

                    <Card className="border-2 hover:border-primary cursor-pointer" onClick={() => openExternalLink('https://wikileaks.org/clinton-emails/')}>
                      <CardContent className="pt-6">
                        <div className="flex items-center gap-2 mb-2">
                          <Mail className="h-5 w-5" />
                          <span className="font-medium">Clinton Emails</span>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          ~30,000 State Department emails
                        </p>
                      </CardContent>
                    </Card>
                  </div>
                </CardContent>
              </Card>

              {wikileaksResults && (
                <Card>
                  <CardHeader>
                    <CardTitle>Search Results</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground mb-4">{wikileaksResults.message}</p>
                    {wikileaksResults.directLink && wikileaksResults.searchUrl && (
                      <Button onClick={() => openExternalLink(wikileaksResults.searchUrl)}>
                        <ExternalLink className="h-4 w-4 mr-2" />
                        Open WikiLeaks Search
                      </Button>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </TabsContent>

        {/* Clinton FOIA Emails Tab */}
        <TabsContent value="clinton-foia">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            <div className="lg:col-span-1 space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">About Clinton Emails</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground space-y-2">
                  <p>Hillary Clinton used a private email server during her tenure as Secretary of State (2009-2013).</p>
                  <p>Over 30,000 emails were released via FOIA requests and investigations.</p>
                  <p>Available from official government sources and public archives.</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Collection Stats</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>Total Emails</span>
                      <Badge variant="secondary">~55,000</Badge>
                    </div>
                    <div className="flex justify-between">
                      <span>Released via FOIA</span>
                      <Badge variant="secondary">~33,000</Badge>
                    </div>
                    <div className="flex justify-between">
                      <span>Date Range</span>
                      <Badge variant="outline">2009-2013</Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="lg:col-span-3 space-y-4">
              {/* Official Government Sources */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Official Government Sources</CardTitle>
                  <CardDescription>
                    FOIA releases from the State Department and National Archives
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Card className="border-2 hover:border-primary cursor-pointer" onClick={() => openExternalLink('https://foia.state.gov/Search/Results.aspx?collection=Clinton_Email')}>
                      <CardContent className="pt-6">
                        <div className="flex items-center gap-2 mb-2">
                          <FileText className="h-5 w-5" />
                          <span className="font-medium">State Dept FOIA</span>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Official Virtual Reading Room - searchable Clinton email collection
                        </p>
                      </CardContent>
                    </Card>

                    <Card className="border-2 hover:border-primary cursor-pointer" onClick={() => openExternalLink('https://www.archives.gov/foia/state-department-emails')}>
                      <CardContent className="pt-6">
                        <div className="flex items-center gap-2 mb-2">
                          <Archive className="h-5 w-5" />
                          <span className="font-medium">National Archives</span>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          FOIA documents on email and records management
                        </p>
                      </CardContent>
                    </Card>
                  </div>
                </CardContent>
              </Card>

              {/* Archive Downloads */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Bulk Download Archives</CardTitle>
                  <CardDescription>
                    Complete email archives available for download
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Card className="border-2 hover:border-primary cursor-pointer" onClick={() => openExternalLink('https://archive.org/details/hillary-clinton-emails-august-31-release')}>
                      <CardContent className="pt-6">
                        <div className="flex items-center gap-2 mb-2">
                          <Download className="h-5 w-5" />
                          <span className="font-medium">Internet Archive</span>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          ~7,000 emails - free download and streaming
                        </p>
                      </CardContent>
                    </Card>

                    <Card className="border-2 hover:border-primary cursor-pointer" onClick={() => openExternalLink('https://www.theblackvault.com/documentarchive/archive-of-secretary-of-state-hillary-clinton-e-mails/')}>
                      <CardContent className="pt-6">
                        <div className="flex items-center gap-2 mb-2">
                          <Download className="h-5 w-5" />
                          <span className="font-medium">The Black Vault</span>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Complete archive organized by release date - .zip downloads
                        </p>
                      </CardContent>
                    </Card>
                  </div>
                </CardContent>
              </Card>

              {/* Search Tips */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Search Tips</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground space-y-2">
                  <p><strong>State Dept FOIA:</strong> Use advanced search to filter by date, subject, or sender/recipient.</p>
                  <p><strong>Black Vault:</strong> Best for bulk download - each FOIA release is in a separate .zip file with searchable PDFs.</p>
                  <p><strong>Internet Archive:</strong> Good for browsing and online reading without download.</p>
                </CardContent>
              </Card>
            </div>
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
