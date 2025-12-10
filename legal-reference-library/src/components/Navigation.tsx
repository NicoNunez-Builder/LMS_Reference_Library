'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { ThemeToggle } from '@/components/ThemeToggle'
import {
  Home,
  LayoutDashboard,
  Scale,
  Building2,
  Library,
  Globe,
  FileText,
  BookOpen,
  Upload,
  Landmark,
  ScrollText,
  Youtube,
  BookMarked,
  BookCopy,
  Search,
  FolderSearch,
  MessageSquare,
} from 'lucide-react'

export function Navigation() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const topNavItems = [
    { href: '/', label: 'Home', icon: Home },
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  ]

  const assistantNavItems = [
    { href: '/chat', label: 'AI Chat', icon: MessageSquare },
    { href: '/courtlistener-assistant', label: 'Federal Courts', icon: Scale },
    { href: '/unicourt-assistant', label: 'State Courts', icon: Building2 },
    { href: '/loc-assistant', label: 'Library of Congress', icon: Library },
    { href: '/ediscovery-assistant', label: 'E-Discovery', icon: FolderSearch },
  ]

  const searchNavItems = [
    { href: '/search?source=congress', label: 'Congress', icon: Landmark },
    { href: '/search?source=federalregister', label: 'Federal Register', icon: ScrollText },
    { href: '/search?source=google', label: 'Web Search', icon: Search },
    { href: '/search?source=youtube', label: 'YouTube', icon: Youtube },
    { href: '/search?source=books', label: 'Google Books', icon: BookMarked },
    { href: '/search?source=openlibrary', label: 'Open Library', icon: BookCopy },
  ]

  const toolsNavItems = [
    { href: '/web-scraper', label: 'Web Scraper', icon: Globe },
    { href: '/document-parser', label: 'Doc Parser', icon: FileText },
  ]

  const libraryNavItems = [
    { href: '/library', label: 'Library', icon: BookOpen },
    { href: '/upload', label: 'Upload', icon: Upload },
  ]

  const renderNavItem = (item: { href: string; label: string; icon: React.ComponentType<{ className?: string }> }) => {
    const Icon = item.icon
    // Check if active - handle query params properly
    const [basePath, queryString] = item.href.split('?')
    let isActive = false

    if (queryString) {
      // For items with query params (like search sources), match both path and source param
      const itemParams = new URLSearchParams(queryString)
      const itemSource = itemParams.get('source')
      const currentSource = searchParams.get('source')
      isActive = pathname === basePath && itemSource === currentSource
    } else {
      // For items without query params, use standard path matching
      isActive = pathname === basePath || (basePath !== '/' && pathname.startsWith(basePath))
    }

    return (
      <Link key={item.href} href={item.href}>
        <Button
          variant={isActive ? 'secondary' : 'ghost'}
          size="sm"
          className="w-full justify-start gap-2"
        >
          <Icon className="h-4 w-4" />
          {item.label}
        </Button>
      </Link>
    )
  }

  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-56 border-r bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-full flex-col">
        {/* Logo */}
        <div className="border-b px-4 py-4">
          <Link href="/" className="flex flex-col">
            <span className="font-bold text-xl leading-tight">LexGo AI</span>
            <span className="text-sm text-muted-foreground">Legal Research</span>
          </Link>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <div className="flex flex-col gap-1">
            {topNavItems.map(renderNavItem)}
          </div>

          <Separator className="my-3" />

          <div className="mb-2">
            <span className="px-2 text-xs font-medium text-muted-foreground">Assistants</span>
          </div>
          <div className="flex flex-col gap-1">
            {assistantNavItems.map(renderNavItem)}
          </div>

          <Separator className="my-3" />

          <div className="mb-2">
            <span className="px-2 text-xs font-medium text-muted-foreground">Search</span>
          </div>
          <div className="flex flex-col gap-1">
            {searchNavItems.map(renderNavItem)}
          </div>

          <Separator className="my-3" />

          <div className="mb-2">
            <span className="px-2 text-xs font-medium text-muted-foreground">Tools</span>
          </div>
          <div className="flex flex-col gap-1">
            {toolsNavItems.map(renderNavItem)}
          </div>

          <Separator className="my-3" />

          <div className="flex flex-col gap-1">
            {libraryNavItems.map(renderNavItem)}
          </div>
        </nav>

        {/* Footer with Theme Toggle */}
        <div className="border-t px-4 py-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Theme</span>
            <ThemeToggle />
          </div>
        </div>
      </div>
    </aside>
  )
}
