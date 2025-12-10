'use client'

import { useState, useEffect, useCallback } from 'react'
import { isUrlViewed, markAsViewed } from '@/lib/viewedHistory'

// Hook to check and track viewed status for a URL
export function useViewedStatus(url: string) {
  const [viewed, setViewed] = useState(false)

  // Check initial status and listen for updates
  useEffect(() => {
    setViewed(isUrlViewed(url))

    const handleUpdate = (event: Event) => {
      const customEvent = event as CustomEvent<{ url?: string }>
      // Update if this URL was marked or if history was cleared
      if (!customEvent.detail?.url || customEvent.detail.url === url) {
        setViewed(isUrlViewed(url))
      }
    }

    // Re-check on window focus (in case viewed in another tab)
    const handleFocus = () => setViewed(isUrlViewed(url))

    window.addEventListener('viewedHistoryUpdated', handleUpdate)
    window.addEventListener('focus', handleFocus)

    return () => {
      window.removeEventListener('viewedHistoryUpdated', handleUpdate)
      window.removeEventListener('focus', handleFocus)
    }
  }, [url])

  const markViewed = useCallback(() => {
    markAsViewed(url)
    setViewed(true)
  }, [url])

  return { viewed, markViewed }
}

// Hook to get a refresh trigger for viewed status updates
export function useViewedHistoryRefresh() {
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    const handleUpdate = () => setRefreshKey(k => k + 1)
    const handleFocus = () => setRefreshKey(k => k + 1)

    window.addEventListener('viewedHistoryUpdated', handleUpdate)
    window.addEventListener('focus', handleFocus)

    return () => {
      window.removeEventListener('viewedHistoryUpdated', handleUpdate)
      window.removeEventListener('focus', handleFocus)
    }
  }, [])

  return refreshKey
}
