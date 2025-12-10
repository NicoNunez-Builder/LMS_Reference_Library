'use client'

import { useViewedStatus } from '@/hooks/useViewedStatus'
import { cn } from '@/lib/utils'

interface SearchResultLinkProps {
  href: string
  children: React.ReactNode
  className?: string
}

export function SearchResultLink({ href, children, className }: SearchResultLinkProps) {
  const { viewed, markViewed } = useViewedStatus(href)

  const handleClick = () => {
    markViewed()
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={handleClick}
      className={cn(
        'hover:underline transition-colors',
        viewed
          ? 'text-purple-600 dark:text-purple-400'
          : 'text-blue-600 dark:text-blue-400',
        className
      )}
    >
      {children}
    </a>
  )
}
