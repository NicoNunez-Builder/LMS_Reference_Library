import { createClient } from '@/lib/supabase/server'
import { DashboardCategories } from '@/components/DashboardCategories'

// Disable caching to always show fresh resource counts
export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const supabase = await createClient()

  // Fetch resource counts per category
  const { data: resourceCounts } = await supabase
    .from('lr_resources')
    .select('category_id')

  const countMap: Record<string, number> = {}
  resourceCounts?.forEach((resource) => {
    countMap[resource.category_id] = (countMap[resource.category_id] || 0) + 1
  })

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2">Legal Reference Library</h1>
        <p className="text-muted-foreground text-lg">
          Browse legal resources organized by category
        </p>
      </div>

      <DashboardCategories resourceCounts={countMap} />
    </div>
  )
}
