'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { HierarchicalCategorySelector } from '@/components/HierarchicalCategorySelector'
import { SearchResult } from '@/types'
import { markAsViewed } from '@/lib/viewedHistory'

// Download history storage
export const DOWNLOAD_HISTORY_KEY = 'library-download-history'

export interface DownloadHistoryItem {
  url: string
  title: string
  categoryId: string
  categoryName?: string
  fileUrl: string | null
  fileSize: number | null
  downloadedAt: number
  sourceType: string
}

// Helper to get download history
export function getDownloadHistory(): DownloadHistoryItem[] {
  if (typeof window === 'undefined') return []
  try {
    const stored = localStorage.getItem(DOWNLOAD_HISTORY_KEY)
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

// Helper to check if a URL has been downloaded
export function isUrlDownloaded(url: string): DownloadHistoryItem | undefined {
  const history = getDownloadHistory()
  return history.find(item => item.url === url)
}

// Helper to save to download history
function saveToDownloadHistory(item: DownloadHistoryItem) {
  try {
    const history = getDownloadHistory()
    // Remove existing entry for same URL
    const filtered = history.filter(h => h.url !== item.url)
    // Add new entry at the beginning
    const newHistory = [item, ...filtered].slice(0, 100) // Keep max 100 items
    localStorage.setItem(DOWNLOAD_HISTORY_KEY, JSON.stringify(newHistory))

    // Dispatch event so other components can update
    window.dispatchEvent(new CustomEvent('downloadHistoryUpdated', { detail: { url: item.url } }))
  } catch (error) {
    console.error('Failed to save download history:', error)
  }
}

interface AddToLibraryModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  result: SearchResult | null
  onSuccess?: () => void
}

type SaveStatus = 'idle' | 'downloading' | 'scraping' | 'saving' | 'success' | 'error'

export function AddToLibraryModal({
  open,
  onOpenChange,
  result,
  onSuccess,
}: AddToLibraryModalProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [downloadFile, setDownloadFile] = useState(true)
  const [status, setStatus] = useState<SaveStatus>('idle')
  const [statusMessage, setStatusMessage] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [scrapedContent, setScrapedContent] = useState<string | null>(null)
  const [contentSource, setContentSource] = useState<string | null>(null)

  // Reset form when result changes or modal opens
  useEffect(() => {
    if (open && result) {
      setTitle(result.title)
      setDescription(result.snippet || '')
      setCategoryId('')
      setDownloadFile(true)
      setStatus('idle')
      setStatusMessage('')
      setError(null)
      setScrapedContent(null)
      setContentSource(null)
    }
  }, [open, result])

  // Handle modal open/close
  const handleOpenChange = (newOpen: boolean) => {
    onOpenChange(newOpen)
  }

  const handleSave = async () => {
    if (!result) return

    if (!categoryId) {
      setError('Please select a category')
      return
    }

    setError(null)
    let fileUrl: string | undefined
    let fileSize: number | undefined

    // Step 1: Download file if requested
    if (downloadFile) {
      setStatus('downloading')
      setStatusMessage('Downloading file to storage...')

      try {
        const downloadResponse = await fetch('/api/resources/download', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: result.url,
            title: title,
          }),
        })

        const downloadData = await downloadResponse.json()

        if (!downloadResponse.ok) {
          // Check if it's a blocked domain - continue without download
          if (downloadData.blocked) {
            setStatusMessage(downloadData.reason || 'Download blocked - saving as link reference')
            // Don't return, continue to save without file
          } else {
            throw new Error(downloadData.error || 'Failed to download file')
          }
        } else if (downloadData.scraped) {
          // Content was scraped instead of downloaded
          setStatus('scraping')
          setStatusMessage(downloadData.message || 'Content scraped from page')
          setScrapedContent(downloadData.scraped_content)
          setContentSource(downloadData.content_source)
          // Scraped content is also saved as a markdown file
          if (downloadData.file_url) {
            fileUrl = downloadData.file_url
            fileSize = downloadData.file_size
          }
        } else {
          // Normal file download
          fileUrl = downloadData.file_url
          fileSize = downloadData.file_size
          setStatusMessage(`Downloaded: ${(fileSize! / 1024 / 1024).toFixed(2)} MB`)
        }
      } catch (err) {
        setStatus('error')
        setError(err instanceof Error ? err.message : 'Failed to download file')
        return
      }
    }

    // Step 2: Save resource to database
    setStatus('saving')
    setStatusMessage('Saving to library...')

    try {
      const response = await fetch('/api/resources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description,
          url: result.url,
          file_url: fileUrl || null,
          file_size: fileSize || null,
          content: scrapedContent || null,
          content_source: contentSource || null,
          category_id: categoryId,
          source_type: result.source_type,
          is_public: true,
          thumbnail_url: result.thumbnail,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to save resource')
      }

      // Save to download history
      saveToDownloadHistory({
        url: result.url,
        title,
        categoryId,
        fileUrl: fileUrl || null,
        fileSize: fileSize || null,
        downloadedAt: Date.now(),
        sourceType: result.source_type,
      })

      // Mark as viewed
      markAsViewed(result.url)

      setStatus('success')
      setStatusMessage('Saved successfully!')

      // Close modal after brief delay
      setTimeout(() => {
        onOpenChange(false)
        onSuccess?.()
      }, 1000)
    } catch (err) {
      setStatus('error')
      setError(err instanceof Error ? err.message : 'Failed to save resource')
    }
  }

  const isProcessing = status === 'downloading' || status === 'scraping' || status === 'saving'

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add to Library</DialogTitle>
          <DialogDescription>
            Download and save this resource to your library
          </DialogDescription>
        </DialogHeader>

        {/* Action Buttons at Top */}
        <div className="flex justify-between items-center py-2 border-b">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isProcessing}
            onClick={() => {
              if (result) {
                setTitle(result.title)
                setDescription(result.snippet || '')
              }
            }}
          >
            Autofill from Result
          </Button>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={isProcessing}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={isProcessing || !categoryId}
            >
              {isProcessing ? statusMessage : 'Save to Library'}
            </Button>
          </div>
        </div>

        {/* Status indicator */}
        {status !== 'idle' && (
          <div className={`p-3 rounded-lg ${
            status === 'downloading' ? 'bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300' :
            status === 'scraping' ? 'bg-purple-50 dark:bg-purple-950 text-purple-700 dark:text-purple-300' :
            status === 'saving' ? 'bg-yellow-50 dark:bg-yellow-950 text-yellow-700 dark:text-yellow-300' :
            status === 'success' ? 'bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300' :
            'bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300'
          }`}>
            <div className="flex items-center gap-2">
              {isProcessing && (
                <div className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full" />
              )}
              <span>{statusMessage}</span>
            </div>
          </div>
        )}

        <div className="space-y-4 py-4">
          {/* Download option */}
          <div className="flex items-center space-x-2 p-3 bg-muted rounded-lg">
            <Checkbox
              id="download"
              checked={downloadFile}
              onCheckedChange={(checked) => setDownloadFile(checked as boolean)}
              disabled={isProcessing}
            />
            <Label htmlFor="download" className="cursor-pointer flex-1">
              <span className="font-medium">Download file to storage</span>
              <p className="text-sm text-muted-foreground">
                Required for text extraction and vector search
              </p>
            </Label>
          </div>

          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Resource title"
              disabled={isProcessing}
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Resource description"
              rows={3}
              disabled={isProcessing}
            />
          </div>

          {/* URL (read-only) */}
          <div className="space-y-2">
            <Label>Source URL</Label>
            <Input value={result?.url || ''} readOnly className="bg-muted text-xs" />
          </div>

          {/* Source Type */}
          <div className="space-y-2">
            <Label>Source Type</Label>
            <Badge variant="secondary">{result?.source_type || 'Unknown'}</Badge>
          </div>

          {/* Category Selector */}
          <div className="space-y-2">
            <Label>Category *</Label>
            <div className="border rounded-lg p-4">
              <HierarchicalCategorySelector
                value={categoryId}
                onChange={(id) => setCategoryId(id)}
                mode="select"
                compact
              />
            </div>
          </div>

          {error && (
            <div className="text-destructive text-sm p-3 bg-destructive/10 rounded-lg">
              {error}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
