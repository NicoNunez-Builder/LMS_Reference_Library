'use client'

import { useState, useEffect, useRef, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { AddToLibraryModal } from '@/components/AddToLibraryModal'
import { DownloadIndicator } from '@/components/DownloadIndicator'
import { SearchResultLink } from '@/components/SearchResultLink'
import { SearchResultCard } from '@/components/SearchResultCard'
import {
  SearchResult,
  FileTypeFilter,
  FileTypeFilterLabels,
} from '@/types'

const RESULTS_LIMIT_OPTIONS = [
  { value: '10', label: '10 results' },
  { value: '25', label: '25 results' },
  { value: '50', label: '50 results' },
]

const SOURCE_LABELS: Record<string, string> = {
  congress: 'Congress (Bills)',
  federalregister: 'Federal Register',
  google: 'Web Search',
  youtube: 'YouTube',
  books: 'Google Books',
  openlibrary: 'Open Library',
}

function SearchContent() {
  const searchParams = useSearchParams()
  const sourceParam = searchParams.get('source')

  const [query, setQuery] = useState('')
  const [fileType, setFileType] = useState<string>(FileTypeFilter.ALL)
  const [resultsLimit, setResultsLimit] = useState('10')
  const [loading, setLoading] = useState(false)

  // Modal state for adding to library
  const [modalOpen, setModalOpen] = useState(false)
  const [selectedResult, setSelectedResult] = useState<SearchResult | null>(null)
  const [successMessage, setSuccessMessage] = useState('')

  // Search source toggles
  const [includeGoogle, setIncludeGoogle] = useState(false)
  const [includeYoutube, setIncludeYoutube] = useState(false)
  const [includeBooks, setIncludeBooks] = useState(false)
  const [includeOpenLibrary, setIncludeOpenLibrary] = useState(false)
  const [includeCongress, setIncludeCongress] = useState(false)
  const [includeFederalRegister, setIncludeFederalRegister] = useState(false)

  // Results from each source
  const [googleResults, setGoogleResults] = useState<SearchResult[]>([])
  const [youtubeResults, setYoutubeResults] = useState<SearchResult[]>([])
  const [booksResults, setBooksResults] = useState<SearchResult[]>([])
  const [openLibraryResults, setOpenLibraryResults] = useState<SearchResult[]>([])
  const [congressResults, setCongressResults] = useState<SearchResult[]>([])
  const [federalRegisterResults, setFederalRegisterResults] = useState<SearchResult[]>([])

  // Initialize sources based on URL param and clear previous search
  useEffect(() => {
    // Clear previous search query and results
    setQuery('')
    setGoogleResults([])
    setYoutubeResults([])
    setBooksResults([])
    setOpenLibraryResults([])
    setCongressResults([])
    setFederalRegisterResults([])

    // Reset all sources first
    setIncludeGoogle(false)
    setIncludeYoutube(false)
    setIncludeBooks(false)
    setIncludeOpenLibrary(false)
    setIncludeCongress(false)
    setIncludeFederalRegister(false)

    // Set the source from URL param
    switch (sourceParam) {
      case 'congress':
        setIncludeCongress(true)
        break
      case 'federalregister':
        setIncludeFederalRegister(true)
        break
      case 'google':
        setIncludeGoogle(true)
        break
      case 'youtube':
        setIncludeYoutube(true)
        break
      case 'books':
        setIncludeBooks(true)
        break
      case 'openlibrary':
        setIncludeOpenLibrary(true)
        break
      default:
        // If no source specified, enable all
        setIncludeGoogle(true)
        setIncludeYoutube(true)
        setIncludeCongress(true)
        setIncludeFederalRegister(true)
    }
  }, [sourceParam])

  const handleSearch = async () => {
    if (!query.trim()) return

    setLoading(true)
    setSuccessMessage('')
    try {
      const response = await fetch('/api/search/combined', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          fileType,
          limit: parseInt(resultsLimit),
          includeGoogle,
          includeYoutube,
          includeBooks,
          includeOpenLibrary,
          includeCourtListener: false,
          includeCongress,
          includeFederalRegister,
          includeLOC: false,
          includeUniCourt: false,
        }),
      })

      const data = await response.json()
      setGoogleResults(data.google?.results || [])
      setYoutubeResults(data.youtube?.results || [])
      setBooksResults(data.books?.results || [])
      setOpenLibraryResults(data.openlibrary?.results || [])
      setCongressResults(data.congress?.results || [])
      setFederalRegisterResults(data.federalregister?.results || [])
      setQuery('') // Clear search input after successful search
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

  const totalResults = googleResults.length + youtubeResults.length + booksResults.length + openLibraryResults.length + congressResults.length + federalRegisterResults.length

  // Get page title based on source
  const pageTitle = sourceParam && SOURCE_LABELS[sourceParam]
    ? `Search ${SOURCE_LABELS[sourceParam]}`
    : 'Search Legal Resources'

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2">{pageTitle}</h1>
        <p className="text-muted-foreground text-lg">
          {sourceParam ? `Search for resources from ${SOURCE_LABELS[sourceParam]}` : 'Find legal resources from multiple sources'}
        </p>
      </div>

      {/* Search Form */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Search</CardTitle>
          <CardDescription>
            Enter your search query to find relevant legal resources
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Main search inputs */}
          <div className="flex flex-col md:flex-row gap-4">
            <Input
              placeholder="Search for legal resources..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="flex-1"
            />
            <Select value={fileType} onValueChange={setFileType}>
              <SelectTrigger className="w-full md:w-[180px]">
                <SelectValue placeholder="All File Types" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(FileTypeFilterLabels).map(([key, label]) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={resultsLimit} onValueChange={setResultsLimit}>
              <SelectTrigger className="w-full md:w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RESULTS_LIMIT_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Search sources - only show if no specific source is selected */}
          {!sourceParam && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Search Sources</Label>
                <div className="flex flex-wrap gap-4">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="congress"
                      checked={includeCongress}
                      onCheckedChange={(checked) => setIncludeCongress(checked as boolean)}
                    />
                    <Label htmlFor="congress" className="text-sm cursor-pointer">Congress (Bills)</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="federalregister"
                      checked={includeFederalRegister}
                      onCheckedChange={(checked) => setIncludeFederalRegister(checked as boolean)}
                    />
                    <Label htmlFor="federalregister" className="text-sm cursor-pointer">Federal Register</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="google"
                      checked={includeGoogle}
                      onCheckedChange={(checked) => setIncludeGoogle(checked as boolean)}
                    />
                    <Label htmlFor="google" className="text-sm cursor-pointer">Web Search</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="youtube"
                      checked={includeYoutube}
                      onCheckedChange={(checked) => setIncludeYoutube(checked as boolean)}
                    />
                    <Label htmlFor="youtube" className="text-sm cursor-pointer">YouTube</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="books"
                      checked={includeBooks}
                      onCheckedChange={(checked) => setIncludeBooks(checked as boolean)}
                    />
                    <Label htmlFor="books" className="text-sm cursor-pointer">Google Books</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="openlibrary"
                      checked={includeOpenLibrary}
                      onCheckedChange={(checked) => setIncludeOpenLibrary(checked as boolean)}
                    />
                    <Label htmlFor="openlibrary" className="text-sm cursor-pointer">Open Library</Label>
                  </div>
                </div>
              </div>
            </div>
          )}

          <Button onClick={handleSearch} disabled={loading} className="w-full md:w-auto">
            {loading ? 'Searching...' : 'Search'}
          </Button>
        </CardContent>
      </Card>

      {/* Results */}
      {totalResults > 0 && (
        <Tabs defaultValue={
          congressResults.length > 0 ? "congress" :
          federalRegisterResults.length > 0 ? "federalregister" :
          googleResults.length > 0 ? "google" :
          youtubeResults.length > 0 ? "youtube" :
          booksResults.length > 0 ? "books" : "openlibrary"
        } className="w-full">
          <TabsList className="flex flex-wrap h-auto gap-2 bg-transparent">
            {congressResults.length > 0 && (
              <TabsTrigger value="congress" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                Congress ({congressResults.length})
              </TabsTrigger>
            )}
            {federalRegisterResults.length > 0 && (
              <TabsTrigger value="federalregister" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                Federal Register ({federalRegisterResults.length})
              </TabsTrigger>
            )}
            {googleResults.length > 0 && (
              <TabsTrigger value="google" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                Web ({googleResults.length})
              </TabsTrigger>
            )}
            {youtubeResults.length > 0 && (
              <TabsTrigger value="youtube" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                Videos ({youtubeResults.length})
              </TabsTrigger>
            )}
            {booksResults.length > 0 && (
              <TabsTrigger value="books" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                Google Books ({booksResults.length})
              </TabsTrigger>
            )}
            {openLibraryResults.length > 0 && (
              <TabsTrigger value="openlibrary" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                Open Library ({openLibraryResults.length})
              </TabsTrigger>
            )}
          </TabsList>

          {/* Congress.gov Results */}
          <TabsContent value="congress" className="mt-6">
            <div className="space-y-4">
              {congressResults.map((result, index) => (
                <SearchResultCard key={index} url={result.url}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <Badge variant="secondary" className="mb-2">Legislation</Badge>
                        <CardTitle className="text-lg mb-2">
                          <SearchResultLink href={result.url}>
                            {result.title}
                          </SearchResultLink>
                        </CardTitle>
                        <CardDescription>{result.snippet}</CardDescription>
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
                    </div>
                  </CardContent>
                </SearchResultCard>
              ))}
            </div>
          </TabsContent>

          {/* Federal Register Results */}
          <TabsContent value="federalregister" className="mt-6">
            <div className="space-y-4">
              {federalRegisterResults.map((result, index) => (
                <SearchResultCard key={index} url={result.url}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <Badge variant="secondary" className="mb-2">Federal Register</Badge>
                        <CardTitle className="text-lg mb-2">
                          <SearchResultLink href={result.url}>
                            {result.title}
                          </SearchResultLink>
                        </CardTitle>
                        <CardDescription>{result.snippet}</CardDescription>
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
                    </div>
                  </CardContent>
                </SearchResultCard>
              ))}
            </div>
          </TabsContent>

          {/* Web Results */}
          <TabsContent value="google" className="mt-6">
            <div className="space-y-4">
              {googleResults.map((result, index) => (
                <SearchResultCard key={index} url={result.url}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-lg mb-2">
                          <SearchResultLink href={result.url}>
                            {result.title}
                          </SearchResultLink>
                        </CardTitle>
                        <CardDescription>{result.snippet}</CardDescription>
                        <div className="flex items-center gap-2 mt-2">
                          <Badge variant="outline">{result.source_type}</Badge>
                          <span className="text-xs text-muted-foreground truncate max-w-md">{result.url}</span>
                        </div>
                      </div>
                      {result.thumbnail && (
                        <img
                          src={result.thumbnail}
                          alt={result.title}
                          className="w-24 h-24 object-cover rounded ml-4"
                        />
                      )}
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
                    </div>
                  </CardContent>
                </SearchResultCard>
              ))}
            </div>
          </TabsContent>

          {/* YouTube Results */}
          <TabsContent value="youtube" className="mt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {youtubeResults.map((result, index) => (
                <SearchResultCard key={index} url={result.url} className="overflow-hidden">
                  {result.thumbnail && (
                    <img
                      src={result.thumbnail}
                      alt={result.title}
                      className="w-full h-48 object-cover"
                    />
                  )}
                  <CardHeader>
                    <CardTitle className="text-base line-clamp-2">
                      <SearchResultLink href={result.url}>
                        {result.title}
                      </SearchResultLink>
                    </CardTitle>
                    <CardDescription className="line-clamp-3">
                      {result.snippet}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-col gap-2">
                      <DownloadIndicator url={result.url} />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleAddToLibrary(result)}
                        className="w-full"
                      >
                        Add to Library
                      </Button>
                    </div>
                  </CardContent>
                </SearchResultCard>
              ))}
            </div>
          </TabsContent>

          {/* Google Books Results */}
          <TabsContent value="books" className="mt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {booksResults.map((result, index) => (
                <SearchResultCard key={index} url={result.url} className="overflow-hidden">
                  <div className="flex">
                    {result.thumbnail && (
                      <img
                        src={result.thumbnail}
                        alt={result.title}
                        className="w-32 h-48 object-cover"
                      />
                    )}
                    <div className="flex-1">
                      <CardHeader>
                        <Badge variant="secondary" className="w-fit mb-2">{result.source_type}</Badge>
                        <CardTitle className="text-base line-clamp-2">
                          <SearchResultLink href={result.url}>
                            {result.title}
                          </SearchResultLink>
                        </CardTitle>
                        <CardDescription className="line-clamp-4 text-xs">
                          {result.snippet}
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="flex flex-col gap-2">
                          <DownloadIndicator url={result.url} />
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleAddToLibrary(result)}
                            className="w-full"
                          >
                            Add to Library
                          </Button>
                        </div>
                      </CardContent>
                    </div>
                  </div>
                </SearchResultCard>
              ))}
            </div>
          </TabsContent>

          {/* Open Library Results */}
          <TabsContent value="openlibrary" className="mt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {openLibraryResults.map((result, index) => (
                <SearchResultCard key={index} url={result.url} className="overflow-hidden">
                  <div className="flex">
                    {result.thumbnail && (
                      <img
                        src={result.thumbnail}
                        alt={result.title}
                        className="w-32 h-48 object-cover"
                      />
                    )}
                    <div className="flex-1">
                      <CardHeader>
                        <Badge variant="secondary" className="w-fit mb-2">{result.source_type}</Badge>
                        <CardTitle className="text-base line-clamp-2">
                          <SearchResultLink href={result.url}>
                            {result.title}
                          </SearchResultLink>
                        </CardTitle>
                        <CardDescription className="line-clamp-4 text-xs">
                          {result.snippet}
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="flex flex-col gap-2">
                          <DownloadIndicator url={result.url} />
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleAddToLibrary(result)}
                            className="w-full"
                          >
                            Add to Library
                          </Button>
                        </div>
                      </CardContent>
                    </div>
                  </div>
                </SearchResultCard>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      )}

      {!loading && totalResults === 0 && query && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No results found. Try a different search query or enable more search sources.
          </CardContent>
        </Card>
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

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="container mx-auto px-4 py-8">Loading...</div>}>
      <SearchContent />
    </Suspense>
  )
}
