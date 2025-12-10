import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function Home() {
  const features = [
    {
      title: 'Smart Search',
      description: 'Search across Google and YouTube for legal resources with intelligent filtering',
    },
    {
      title: '13 Legal Categories',
      description: 'Organized classification covering Constitutional Law, Statutes, Case Law, and more',
    },
    {
      title: 'Document Storage',
      description: 'Download and store PDFs, videos, and documents for offline access',
    },
    {
      title: 'Tagging System',
      description: 'Flexible tagging for additional resource classification and organization',
    },
  ]

  return (
    <div className="container mx-auto px-4">
      {/* Hero Section */}
      <section className="py-20 text-center">
        <h1 className="text-5xl font-bold mb-4">
          Legal Reference Library
        </h1>
        <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
          Discover, organize, and manage legal references from across the internet.
          Your comprehensive resource for legal research.
        </p>
        <div className="flex gap-4 justify-center">
          <Link href="/search">
            <Button size="lg">Start Searching</Button>
          </Link>
          <Link href="/dashboard">
            <Button size="lg" variant="outline">Browse Categories</Button>
          </Link>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-16">
        <h2 className="text-3xl font-bold text-center mb-12">Features</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map((feature, index) => (
            <Card key={index}>
              <CardHeader>
                <CardTitle>{feature.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>{feature.description}</CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Categories Preview */}
      <section className="py-16">
        <h2 className="text-3xl font-bold text-center mb-4">Legal Categories</h2>
        <p className="text-center text-muted-foreground mb-8">
          Explore resources across 13 comprehensive legal categories
        </p>
        <div className="flex flex-wrap justify-center gap-3 mb-8">
          {[
            'Constitutional Law',
            'Statutes',
            'Case Law',
            'Contracts & Torts',
            'Civil Procedure',
            'Property',
            'Legal Research',
            'Rules of Court',
            'Rules of Evidence',
            'Professional Responsibility',
          ].map((category) => (
            <div key={category} className="px-4 py-2 bg-secondary rounded-full text-sm">
              {category}
            </div>
          ))}
        </div>
        <div className="text-center">
          <Link href="/dashboard">
            <Button variant="outline">View All Categories</Button>
          </Link>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 text-center">
        <Card className="max-w-2xl mx-auto">
          <CardHeader>
            <CardTitle className="text-2xl">Ready to Get Started?</CardTitle>
            <CardDescription className="text-base">
              Begin building your legal reference library today
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/search">
              <Button size="lg">Search Resources</Button>
            </Link>
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
