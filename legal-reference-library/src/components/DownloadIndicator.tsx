'use client'

import { useState, useEffect } from 'react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { isUrlDownloaded, DownloadHistoryItem } from '@/components/AddToLibraryModal'

interface DownloadIndicatorProps {
  url: string
  className?: string
}

export function DownloadIndicator({ url, className }: DownloadIndicatorProps) {
  const [downloadInfo, setDownloadInfo] = useState<DownloadHistoryItem | undefined>()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    // Check if URL has been downloaded
    const info = isUrlDownloaded(url)
    setDownloadInfo(info)
  }, [url])

  // Re-check on focus (in case another tab added it)
  useEffect(() => {
    const handleFocus = () => {
      const info = isUrlDownloaded(url)
      setDownloadInfo(info)
    }
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [url])

  if (!downloadInfo) {
    return null
  }

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return 'Link only'
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={`h-7 px-2 gap-1 text-green-600 hover:text-green-700 hover:bg-green-50 dark:text-green-400 dark:hover:text-green-300 dark:hover:bg-green-950 ${className}`}
          title="In Library"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          <span className="text-xs">In Library</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="start">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-green-600"
            >
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
            <span className="font-semibold text-green-700 dark:text-green-400">
              Saved to Library
            </span>
          </div>

          <div className="space-y-2 text-sm">
            <div>
              <span className="text-muted-foreground">Title:</span>
              <p className="font-medium truncate">{downloadInfo.title}</p>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Added:</span>
              <span>{formatDate(downloadInfo.downloadedAt)}</span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">File:</span>
              <Badge variant={downloadInfo.fileUrl ? 'default' : 'secondary'} className="text-xs">
                {downloadInfo.fileUrl ? formatFileSize(downloadInfo.fileSize) : 'Link only'}
              </Badge>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Type:</span>
              <Badge variant="outline" className="text-xs">
                {downloadInfo.sourceType}
              </Badge>
            </div>
          </div>

          {downloadInfo.fileUrl && (
            <div className="pt-2 border-t">
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => window.open(downloadInfo.fileUrl!, '_blank')}
              >
                View Downloaded File
              </Button>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

// Hook to refresh download status
export function useDownloadStatus(url: string) {
  const [isDownloaded, setIsDownloaded] = useState(false)
  const [downloadInfo, setDownloadInfo] = useState<DownloadHistoryItem | undefined>()

  useEffect(() => {
    const info = isUrlDownloaded(url)
    setIsDownloaded(!!info)
    setDownloadInfo(info)
  }, [url])

  const refresh = () => {
    const info = isUrlDownloaded(url)
    setIsDownloaded(!!info)
    setDownloadInfo(info)
  }

  return { isDownloaded, downloadInfo, refresh }
}
