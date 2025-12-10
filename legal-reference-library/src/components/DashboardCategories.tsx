'use client'

import { useState, useEffect } from 'react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CategoryHierarchy, Category, CategoryFolder } from '@/types'
import Link from 'next/link'

interface DashboardCategoriesProps {
  resourceCounts: Record<string, number>
}

export function DashboardCategories({ resourceCounts }: DashboardCategoriesProps) {
  const [hierarchy, setHierarchy] = useState<CategoryHierarchy | null>(null)
  const [activeGroup, setActiveGroup] = useState<string>('')
  const [loading, setLoading] = useState(true)

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
      .catch(() => {
        setLoading(false)
      })
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-pulse text-muted-foreground">Loading categories...</div>
      </div>
    )
  }

  if (!hierarchy) {
    return (
      <div className="text-destructive p-4">Failed to load categories</div>
    )
  }

  // Calculate folder counts
  const getFolderCount = (folder: CategoryFolder & { categories: Category[] }) => {
    return folder.categories.reduce((sum, cat) => sum + (resourceCounts[cat.id] || 0), 0)
  }

  // Calculate group counts
  const getGroupCount = (group: typeof hierarchy.groups[0]) => {
    const directCount = group.categories.reduce((sum, cat) => sum + (resourceCounts[cat.id] || 0), 0)
    const folderCount = group.folders.reduce((sum, folder) => sum + getFolderCount(folder), 0)
    return directCount + folderCount
  }

  return (
    <Tabs value={activeGroup} onValueChange={setActiveGroup}>
      <TabsList className="mb-6">
        {hierarchy.groups.map((group) => (
          <TabsTrigger key={group.id} value={group.slug} className="gap-2">
            {group.name}
            <Badge variant="secondary" className="ml-1">
              {getGroupCount(group)}
            </Badge>
          </TabsTrigger>
        ))}
      </TabsList>

      {hierarchy.groups.map((group) => (
        <TabsContent key={group.id} value={group.slug}>
          {group.description && (
            <p className="text-muted-foreground mb-6">{group.description}</p>
          )}

          {/* Group has folders - show accordion */}
          {group.folders.length > 0 ? (
            <Accordion type="multiple" className="space-y-4">
              {group.folders.map((folder) => (
                <AccordionItem key={folder.id} value={folder.id} className="border rounded-lg px-4">
                  <AccordionTrigger className="hover:no-underline py-4">
                    <div className="flex items-center gap-3">
                      <span className="font-semibold text-lg">{folder.name}</span>
                      <Badge variant="outline">
                        {getFolderCount(folder)} resources
                      </Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-4">
                      {folder.categories.map((category) => (
                        <CategoryCard
                          key={category.id}
                          category={category}
                          resourceCount={resourceCounts[category.id] || 0}
                        />
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          ) : (
            /* Group has direct categories - show grid */
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {group.categories.map((category) => (
                <CategoryCard
                  key={category.id}
                  category={category}
                  resourceCount={resourceCounts[category.id] || 0}
                />
              ))}
            </div>
          )}
        </TabsContent>
      ))}
    </Tabs>
  )
}

// Inline CategoryCard component
function CategoryCard({
  category,
  resourceCount,
}: {
  category: Category
  resourceCount: number
}) {
  return (
    <Link href={`/library?category=${category.slug}`}>
      <Card className="h-full hover:shadow-md transition-shadow cursor-pointer">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">{category.name}</CardTitle>
          {category.description && (
            <CardDescription className="line-clamp-2">
              {category.description}
            </CardDescription>
          )}
        </CardHeader>
        <CardContent>
          <Badge variant="secondary">
            {resourceCount} {resourceCount === 1 ? 'resource' : 'resources'}
          </Badge>
        </CardContent>
      </Card>
    </Link>
  )
}
