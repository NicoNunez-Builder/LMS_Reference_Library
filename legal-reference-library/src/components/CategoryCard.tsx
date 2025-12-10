'use client'

import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Category } from '@/types'

interface CategoryCardProps {
  category: Category
  resourceCount?: number
}

export function CategoryCard({ category, resourceCount = 0 }: CategoryCardProps) {
  return (
    <Link href={`/library?category=${category.slug}`}>
      <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
        <CardHeader>
          <div className="flex items-start justify-between">
            <CardTitle className="text-lg">{category.name}</CardTitle>
            <Badge variant="secondary">{resourceCount}</Badge>
          </div>
          {category.description && (
            <CardDescription className="line-clamp-2">
              {category.description}
            </CardDescription>
          )}
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            View resources →
          </p>
        </CardContent>
      </Card>
    </Link>
  )
}
