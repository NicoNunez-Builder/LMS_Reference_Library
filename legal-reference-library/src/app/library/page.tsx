import { Suspense } from 'react'
import LibraryContent from '@/components/LibraryContent'

export default function LibraryPage() {
  return (
    <Suspense fallback={
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">
          <p className="text-muted-foreground">Loading library...</p>
        </div>
      </div>
    }>
      <LibraryContent />
    </Suspense>
  )
}
