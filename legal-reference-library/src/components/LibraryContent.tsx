'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Resource, SourceType, LegalCategoryLabels } from '@/types'
import Link from 'next/link'
import { SearchResultLink } from '@/components/SearchResultLink'

export default function LibraryContent() {
  const searchParams = useSearchParams()
  const [resources, setResources] = useState<Resource[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState(searchParams.get('category') || '')
  const [sourceTypeFilter, setSourceTypeFilter] = useState('')

  // Delete state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [resourceToDelete, setResourceToDelete] = useState<Resource | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    fetchResources()
  }, [categoryFilter, sourceTypeFilter])

  const fetchResources = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (categoryFilter) params.append('category', categoryFilter)
      if (sourceTypeFilter) params.append('source_type', sourceTypeFilter)
      if (searchQuery) params.append('query', searchQuery)

      const response = await fetch(`/api/resources?${params.toString()}`)
      const data = await response.json()
      setResources(data.resources || [])
    } catch (error) {
      console.error('Error fetching resources:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSearch = () => {
    fetchResources()
  }

  const handleDeleteClick = (resource: Resource) => {
    setResourceToDelete(resource)
    setDeleteDialogOpen(true)
  }

  const handleDeleteConfirm = async () => {
    if (!resourceToDelete) return

    setDeleting(true)
    try {
      const response = await fetch(`/api/resources/${resourceToDelete.id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to delete resource')
      }

      // Remove from local state
      setResources(resources.filter(r => r.id !== resourceToDelete.id))
      setDeleteDialogOpen(false)
      setResourceToDelete(null)
    } catch (error) {
      console.error('Delete error:', error)
      alert(error instanceof Error ? error.message : 'Failed to delete resource')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2">Resource Library</h1>
        <p className="text-muted-foreground text-lg">
          Browse and manage your saved legal resources
        </p>
      </div>

      {/* Filters */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Input
              placeholder="Search resources..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
            <Select value={categoryFilter || "all"} onValueChange={(val) => setCategoryFilter(val === "all" ? "" : val)}>
              <SelectTrigger>
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {Object.entries(LegalCategoryLabels).map(([key, label]) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={sourceTypeFilter || "all"} onValueChange={(val) => setSourceTypeFilter(val === "all" ? "" : val)}>
              <SelectTrigger>
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value={SourceType.WEBSITE}>Websites</SelectItem>
                <SelectItem value={SourceType.PDF}>PDFs</SelectItem>
                <SelectItem value={SourceType.VIDEO}>Videos</SelectItem>
                <SelectItem value={SourceType.DOCUMENT}>Documents</SelectItem>
                <SelectItem value={SourceType.ARTICLE}>Articles</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleSearch} className="mt-4">
            Apply Filters
          </Button>
        </CardContent>
      </Card>

      {/* Resources Grid */}
      {loading ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">Loading resources...</p>
        </div>
      ) : resources.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground mb-4">No resources found</p>
            <Link href="/search">
              <Button>Search for Resources</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {resources.map((resource) => (
            <Card key={resource.id} className="flex flex-col">
              {resource.thumbnail_url && (
                <img
                  src={resource.thumbnail_url}
                  alt={resource.title}
                  className="w-full h-48 object-cover rounded-t-lg"
                />
              )}
              <CardHeader className="flex-1">
                <div className="flex items-start justify-between mb-2">
                  <Badge variant="outline">{resource.source_type}</Badge>
                  {resource.category && (
                    <Badge variant="secondary">{resource.category.name}</Badge>
                  )}
                </div>
                <CardTitle className="text-lg line-clamp-2">
                  <SearchResultLink href={resource.url}>
                    {resource.title}
                  </SearchResultLink>
                </CardTitle>
                {resource.description && (
                  <CardDescription className="line-clamp-3">
                    {resource.description}
                  </CardDescription>
                )}
                {resource.file_size && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Size: {(resource.file_size / 1024 / 1024).toFixed(2)} MB
                  </p>
                )}
              </CardHeader>
              <CardContent>
                <div className="flex gap-2">
                  {resource.file_url && (
                    <a href={resource.file_url} target="_blank" rel="noopener noreferrer" className="flex-1">
                      <Button variant="outline" size="sm" className="w-full">
                        Open File
                      </Button>
                    </a>
                  )}
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleDeleteClick(resource)}
                  >
                    Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Resource</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{resourceToDelete?.title}"?
              {resourceToDelete?.file_url && (
                <span className="block mt-2 text-destructive">
                  This will also delete the file from storage.
                </span>
              )}
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
