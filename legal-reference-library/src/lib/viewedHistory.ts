// Viewed history storage - tracks URLs the user has clicked or added to library
export const VIEWED_HISTORY_KEY = 'search-viewed-history'

export interface ViewedHistoryItem {
  url: string
  viewedAt: number
}

// Get viewed history from localStorage
export function getViewedHistory(): ViewedHistoryItem[] {
  if (typeof window === 'undefined') return []
  try {
    const stored = localStorage.getItem(VIEWED_HISTORY_KEY)
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

// Check if a URL has been viewed
export function isUrlViewed(url: string): boolean {
  const history = getViewedHistory()
  return history.some(item => item.url === url)
}

// Mark a URL as viewed
export function markAsViewed(url: string): void {
  try {
    const history = getViewedHistory()
    // Don't add duplicates
    if (history.some(item => item.url === url)) return

    // Add new entry at the beginning
    const newHistory = [{ url, viewedAt: Date.now() }, ...history].slice(0, 500) // Keep max 500 items
    localStorage.setItem(VIEWED_HISTORY_KEY, JSON.stringify(newHistory))

    // Dispatch event so other components can update
    window.dispatchEvent(new CustomEvent('viewedHistoryUpdated', { detail: { url } }))
  } catch (error) {
    console.error('Failed to save viewed history:', error)
  }
}

// Clear viewed history
export function clearViewedHistory(): void {
  try {
    localStorage.removeItem(VIEWED_HISTORY_KEY)
    window.dispatchEvent(new CustomEvent('viewedHistoryUpdated'))
  } catch (error) {
    console.error('Failed to clear viewed history:', error)
  }
}
