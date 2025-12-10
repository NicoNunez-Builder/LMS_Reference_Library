'use client'

import { useState, useEffect, useCallback } from 'react'
import { isUrlDownloaded, DownloadHistoryItem, DOWNLOAD_HISTORY_KEY } from '@/components/AddToLibraryModal'

// Hook to check and track download status for a URL
export function useDownloadStatus(url: string) {
  const [downloaded, setDownloaded] = useState<DownloadHistoryItem | undefined>(undefined)

  // Check initial status and listen for updates
  useEffect(() => {
    setDownloaded(isUrlDownloaded(url))

    const handleUpdate = (event: Event) => {
      const customEvent = event as CustomEvent<{ url?: string }>
      // Update if this URL was downloaded or if history was cleared
      if (!customEvent.detail?.url || customEvent.detail.url === url) {
        setDownloaded(isUrlDownloaded(url))
      }
    }

    // Re-check on window focus (in case downloaded in another tab)
    const handleFocus = () => setDownloaded(isUrlDownloaded(url))

    window.addEventListener('downloadHistoryUpdated', handleUpdate)
    window.addEventListener('focus', handleFocus)

    return () => {
      window.removeEventListener('downloadHistoryUpdated', handleUpdate)
      window.removeEventListener('focus', handleFocus)
    }
  }, [url])

  return { downloaded, isDownloaded: !!downloaded }
}

// Hook to get a refresh trigger for download status updates
export function useDownloadHistoryRefresh() {
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    const handleUpdate = () => setRefreshKey(k => k + 1)
    const handleFocus = () => setRefreshKey(k => k + 1)

    window.addEventListener('downloadHistoryUpdated', handleUpdate)
    window.addEventListener('focus', handleFocus)

    return () => {
      window.removeEventListener('downloadHistoryUpdated', handleUpdate)
      window.removeEventListener('focus', handleFocus)
    }
  }, [])

  return refreshKey
}
