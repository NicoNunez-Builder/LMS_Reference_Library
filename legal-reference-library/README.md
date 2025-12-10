# Legal Reference Library

A full-stack web application for discovering, organizing, and managing legal references from across the internet. Built with Next.js, TypeScript, Tailwind CSS, and Supabase.

## Features

- 🔍 **Smart Search**: Integrated Google Custom Search and YouTube Data API for finding legal resources
- 📚 **13 Legal Categories**: Organized classification system covering all major legal domains
- 💾 **Document Storage**: Download and store PDFs, videos, and documents using Supabase Storage
- 🏷️ **Tagging System**: Flexible tagging for additional resource classification
- 🔐 **Authentication**: Secure user authentication with Supabase Auth
- 📱 **Responsive Design**: Beautiful UI built with shadcn/ui components

## Legal Categories

1. Constitutional Law
2. Library of Congress
3. Statutes
4. Contracts & Torts
5. Civil Procedure
6. Property
7. Case Law
8. Legal Research
9. Rules of Court
10. Rules of Evidence
11. Professional Responsibility
12. Ethics Governance
13. Social Responsibility

## Tech Stack

- **Framework**: Next.js 14+ (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **UI Components**: shadcn/ui
- **Database**: Supabase PostgreSQL
- **Storage**: Supabase Storage Buckets
- **Authentication**: Supabase Auth
- **APIs**: Google Custom Search API, YouTube Data API

## Prerequisites

Before you begin, ensure you have:

- Node.js 18+ installed
- A Supabase account and project
- Google Cloud Console account (for Search & YouTube APIs)

## Setup Instructions

### 1. Clone and Install

```bash
cd legal-reference-library
npm install
```

### 2. Set Up Supabase

1. Create a new project at [supabase.com](https://supabase.com)
2. Go to Project Settings > API to get your credentials
3. Go to SQL Editor and run the SQL from `supabase/schema.sql`
4. Go to Storage and create three buckets:
   - `legal-documents`
   - `legal-videos`
   - `thumbnails`

### 3. Set Up Google APIs

#### Google Custom Search API

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project or select existing
3. Enable "Custom Search API"
4. Create credentials (API Key)
5. Go to [Programmable Search Engine](https://programmablesearchengine.google.com)
6. Create a new search engine
7. Get your Search Engine ID

#### YouTube Data API

1. In Google Cloud Console
2. Enable "YouTube Data API v3"
3. Create or use existing API Key

### 4. Environment Variables

Create a `.env.local` file in the root directory:

```bash
cp .env.local.example .env.local
```

Fill in your credentials:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your-supabase-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key

# Google Custom Search
GOOGLE_API_KEY=your-google-api-key
GOOGLE_SEARCH_ENGINE_ID=your-search-engine-id

# YouTube
YOUTUBE_API_KEY=your-youtube-api-key

# App URL
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 5. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
legal-reference-library/
├── src/
│   ├── app/                    # Next.js app directory
│   │   ├── api/               # API routes
│   │   │   ├── search/       # Search endpoints
│   │   │   ├── resources/    # Resource CRUD
│   │   │   └── download/     # File download
│   │   ├── dashboard/        # Dashboard page
│   │   ├── library/          # Resource library
│   │   ├── search/           # Search interface
│   │   └── layout.tsx        # Root layout
│   ├── components/           # React components
│   │   ├── ui/              # shadcn/ui components
│   │   └── ...              # Custom components
│   ├── lib/                 # Utilities
│   │   ├── supabase/       # Supabase clients
│   │   └── utils.ts        # Helper functions
│   └── types/              # TypeScript types
├── supabase/
│   └── schema.sql          # Database schema
└── public/                 # Static assets
```

## API Routes

### Search

- `POST /api/search/google` - Search the web for legal resources
- `POST /api/search/youtube` - Search YouTube for legal videos
- `POST /api/search/combined` - Combined search results

### Resources

- `GET /api/resources` - List all resources
- `GET /api/resources/[id]` - Get single resource
- `POST /api/resources` - Create new resource
- `PUT /api/resources/[id]` - Update resource
- `DELETE /api/resources/[id]` - Delete resource

### Downloads

- `POST /api/download` - Download file to Supabase Storage

## Usage

### Searching for Resources

1. Navigate to the Search page
2. Enter your query and select filters (category, source type)
3. View results from Google and YouTube
4. Click "Add to Library" to save resources
5. Optionally download files for offline access

### Managing Resources

1. Go to the Library page
2. View all your saved resources
3. Filter by category, source type, or search
4. Edit or delete resources as needed
5. Access downloaded files

### Categories Dashboard

1. Visit the Dashboard
2. Browse by legal category
3. Click a category to view related resources
4. Add new resources to specific categories

## Deployment

### Deploy to Vercel

```bash
npm install -g vercel
vercel
```

Follow the prompts and add your environment variables in Vercel's dashboard.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License

## Support

For issues or questions, please open an issue on GitHub.
