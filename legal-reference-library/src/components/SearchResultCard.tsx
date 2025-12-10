'use client'

import { ReactNode } from 'react'
import { Card } from '@/components/ui/card'
import { useViewedStatus } from '@/hooks/useViewedStatus'
import { useDownloadStatus } from '@/hooks/useDownloadStatus'
import { cn } from '@/lib/utils'

interface SearchResultCardProps {
  url: string
  children: ReactNode
  className?: string
}

/**
 * A Card wrapper that applies color styling based on viewed/downloaded status:
 * - Red border/tint: Item has been downloaded/added to library
 * - Green border/tint: Item has been viewed (clicked) but not downloaded
 * - Default: Not viewed or downloaded
 *
 * Priority: Downloaded (red) > Viewed (green) > Default
 */
export function SearchResultCard({ url, children, className }: SearchResultCardProps) {
  const { viewed } = useViewedStatus(url)
  const { isDownloaded } = useDownloadStatus(url)

  // Determine the status class
  // Priority: Downloaded > Viewed > Default
  const statusClass = isDownloaded
    ? 'border-red-400 dark:border-red-600 bg-red-50/50 dark:bg-red-950/30'
    : viewed
    ? 'border-green-400 dark:border-green-600 bg-green-50/50 dark:bg-green-950/30'
    : ''

  return (
    <Card className={cn(statusClass, className)}>
      {children}
    </Card>
  )
}

/**
 * A simpler version that just returns the status for custom styling
 */
export function useResultStatus(url: string) {
  const { viewed } = useViewedStatus(url)
  const { isDownloaded } = useDownloadStatus(url)

  return {
    viewed,
    isDownloaded,
    status: isDownloaded ? 'downloaded' : viewed ? 'viewed' : 'none',
    statusClass: isDownloaded
      ? 'border-red-400 dark:border-red-600 bg-red-50/50 dark:bg-red-950/30'
      : viewed
      ? 'border-green-400 dark:border-green-600 bg-green-50/50 dark:bg-green-950/30'
      : '',
  }
}
