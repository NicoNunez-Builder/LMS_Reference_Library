import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import Link from 'next/link'
import { notFound } from 'next/navigation'

export default async function ResourceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { id } = await params

  const { data: resource, error } = await supabase
    .from('lr_resources')
    .select(`
      *,
      category:lr_categories(*),
      lr_resource_tags(
        tag:lr_tags(*)
      )
    `)
    .eq('id', id)
    .single()

  if (error || !resource) {
    notFound()
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <Link href="/library">
        <Button variant="ghost" className="mb-4">
          ← Back to Library
        </Button>
      </Link>

      <Card>
        {resource.thumbnail_url && (
          <img
            src={resource.thumbnail_url}
            alt={resource.title}
            className="w-full h-64 object-cover rounded-t-lg"
          />
        )}
        <CardHeader>
          <div className="flex items-start justify-between mb-4">
            <div className="flex gap-2">
              <Badge variant="outline">{resource.source_type}</Badge>
              {resource.category && (
                <Badge variant="secondary">{resource.category.name}</Badge>
              )}
            </div>
            {resource.file_size && (
              <Badge variant="outline">
                {(resource.file_size / 1024 / 1024).toFixed(2)} MB
              </Badge>
            )}
          </div>
          <CardTitle className="text-3xl mb-2">{resource.title}</CardTitle>
          {resource.description && (
            <CardDescription className="text-base">
              {resource.description}
            </CardDescription>
          )}
        </CardHeader>

        <CardContent>
          <div className="space-y-6">
            <Separator />

            <div>
              <h3 className="font-semibold mb-2">Source URL</h3>
              <a
                href={resource.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline break-all"
              >
                {resource.url}
              </a>
            </div>

            {resource.lr_resource_tags && resource.lr_resource_tags.length > 0 && (
              <>
                <Separator />
                <div>
                  <h3 className="font-semibold mb-2">Tags</h3>
                  <div className="flex flex-wrap gap-2">
                    {resource.lr_resource_tags.map((rt: any) => (
                      <Badge key={rt.tag.id} variant="outline">
                        {rt.tag.name}
                      </Badge>
                    ))}
                  </div>
                </div>
              </>
            )}

            <Separator />

            <div>
              <h3 className="font-semibold mb-2">Metadata</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Created:</span>
                  <span className="ml-2">
                    {new Date(resource.created_at).toLocaleDateString()}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Updated:</span>
                  <span className="ml-2">
                    {new Date(resource.updated_at).toLocaleDateString()}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Visibility:</span>
                  <span className="ml-2">
                    {resource.is_public ? 'Public' : 'Private'}
                  </span>
                </div>
              </div>
            </div>

            <Separator />

            <div className="flex gap-4">
              <a href={resource.url} target="_blank" rel="noopener noreferrer" className="flex-1">
                <Button className="w-full">
                  Open Resource
                </Button>
              </a>
              {resource.file_url && (
                <a href={resource.file_url} target="_blank" rel="noopener noreferrer" className="flex-1">
                  <Button variant="outline" className="w-full">
                    Download File
                  </Button>
                </a>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
