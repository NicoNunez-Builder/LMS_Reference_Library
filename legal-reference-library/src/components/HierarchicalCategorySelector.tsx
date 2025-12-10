'use client'

import { useState, useEffect } from 'react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CategoryHierarchy, Category, CategoryFolder, CategoryGroup } from '@/types'

interface HierarchicalCategorySelectorProps {
  value?: string // Selected category ID
  onChange: (categoryId: string, category?: Category) => void
  showCounts?: boolean
  mode?: 'select' | 'browse' // Select for forms, browse for dashboard
  compact?: boolean
}

export function HierarchicalCategorySelector({
  value,
  onChange,
  showCounts = false,
  mode = 'select',
  compact = false,
}: HierarchicalCategorySelectorProps) {
  const [hierarchy, setHierarchy] = useState<CategoryHierarchy | null>(null)
  const [activeGroup, setActiveGroup] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/categories/hierarchy')
      .then((res) => res.json())
      .then((data) => {
        if (data.hierarchy) {
          setHierarchy(data.hierarchy)
          setActiveGroup(data.hierarchy.groups?.[0]?.slug || '')
        }
        setLoading(false)
      })
      .catch((err) => {
        setError('Failed to load categories')
        setLoading(false)
      })
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center p-4">
        <div className="animate-pulse text-muted-foreground">Loading categories...</div>
      </div>
    )
  }

  if (error || !hierarchy) {
    return (
      <div className="text-destructive p-4">
        {error || 'Failed to load categories'}
      </div>
    )
  }

  const handleCategorySelect = (category: Category) => {
    onChange(category.id, category)
  }

  // Find selected category info
  const findSelectedCategory = (): Category | undefined => {
    if (!value) return undefined
    for (const group of hierarchy.groups) {
      // Check direct categories
      const directCat = group.categories.find(c => c.id === value)
      if (directCat) return directCat
      // Check folder categories
      for (const folder of group.folders) {
        const folderCat = folder.categories.find(c => c.id === value)
        if (folderCat) return folderCat
      }
    }
    return undefined
  }

  const selectedCategory = findSelectedCategory()

  return (
    <div className={compact ? '' : 'space-y-4'}>
      {/* Show selected category badge */}
      {value && selectedCategory && mode === 'select' && (
        <div className="mb-2">
          <Badge variant="secondary" className="text-sm">
            Selected: {selectedCategory.name}
          </Badge>
        </div>
      )}

      <Tabs value={activeGroup} onValueChange={setActiveGroup}>
        <TabsList className={compact ? 'w-full' : ''}>
          {hierarchy.groups.map((group) => (
            <TabsTrigger key={group.id} value={group.slug}>
              {group.name}
            </TabsTrigger>
          ))}
        </TabsList>

        {hierarchy.groups.map((group) => (
          <TabsContent key={group.id} value={group.slug} className="mt-4">
            {/* Group has folders - show accordion */}
            {group.folders.length > 0 ? (
              <FolderAccordion
                folders={group.folders}
                onCategorySelect={handleCategorySelect}
                selectedCategoryId={value}
                compact={compact}
              />
            ) : (
              /* Group has direct categories - show grid */
              <CategoryGrid
                categories={group.categories}
                onSelect={handleCategorySelect}
                selectedId={value}
                compact={compact}
              />
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}

// Folder accordion component
interface FolderAccordionProps {
  folders: Array<CategoryFolder & { categories: Category[] }>
  onCategorySelect: (category: Category) => void
  selectedCategoryId?: string
  compact?: boolean
}

function FolderAccordion({
  folders,
  onCategorySelect,
  selectedCategoryId,
  compact,
}: FolderAccordionProps) {
  // Find which folder contains the selected category
  const selectedFolderId = folders.find(f =>
    f.categories.some(c => c.id === selectedCategoryId)
  )?.id

  return (
    <Accordion
      type="single"
      collapsible
      defaultValue={selectedFolderId}
      className="w-full"
    >
      {folders.map((folder) => (
        <AccordionItem key={folder.id} value={folder.id}>
          <AccordionTrigger className="hover:no-underline">
            <div className="flex items-center gap-2">
              <span className="font-medium">{folder.name}</span>
              <Badge variant="outline" className="text-xs">
                {folder.categories.length}
              </Badge>
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <div className={compact ? 'space-y-1' : 'grid grid-cols-2 gap-2 p-2'}>
              {folder.categories.map((category) => (
                <button
                  key={category.id}
                  onClick={() => onCategorySelect(category)}
                  className={`text-left p-2 rounded-md transition-colors ${
                    selectedCategoryId === category.id
                      ? 'bg-primary text-primary-foreground'
                      : 'hover:bg-muted'
                  } ${compact ? 'w-full text-sm' : ''}`}
                >
                  {category.name}
                </button>
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  )
}

// Category grid component for flat categories
interface CategoryGridProps {
  categories: Category[]
  onSelect: (category: Category) => void
  selectedId?: string
  compact?: boolean
}

function CategoryGrid({ categories, onSelect, selectedId, compact }: CategoryGridProps) {
  if (compact) {
    return (
      <div className="space-y-1">
        {categories.map((category) => (
          <button
            key={category.id}
            onClick={() => onSelect(category)}
            className={`w-full text-left p-2 rounded-md text-sm transition-colors ${
              selectedId === category.id
                ? 'bg-primary text-primary-foreground'
                : 'hover:bg-muted'
            }`}
          >
            {category.name}
          </button>
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
      {categories.map((category) => (
        <Card
          key={category.id}
          className={`cursor-pointer transition-all hover:shadow-md ${
            selectedId === category.id
              ? 'ring-2 ring-primary'
              : ''
          }`}
          onClick={() => onSelect(category)}
        >
          <CardContent className="p-4">
            <h3 className="font-medium text-sm">{category.name}</h3>
            {category.description && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                {category.description}
              </p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

export { FolderAccordion, CategoryGrid }
