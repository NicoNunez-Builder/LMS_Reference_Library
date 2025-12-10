# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Structure

This is a monorepo-style directory. The main application is in:

```
legal-reference-library/    # Main Next.js application
```

**Always run commands from within the `legal-reference-library/` directory.**

## Commands

```bash
cd legal-reference-library
npm run dev          # Start development server (localhost:3000)
npm run build        # Production build
npm run lint         # Run ESLint
npm run db:migrate <file>  # Run SQL migration: npm run db:migrate supabase/schema.sql
```

## Architecture Overview

Legal Reference Library is a Next.js 16 App Router application for discovering, organizing, and managing legal research resources. It integrates multiple external APIs to search across legal databases and stores resources in Supabase.

### Data Flow

```
External APIs (Google, YouTube, CourtListener, Congress.gov, etc.)
                    |
           /api/search/* endpoints
                    |
         Unified SearchResult type
                    |
    AddToLibraryModal -> /api/resources/download
                    |
         +---------+-----------+
    Direct Download      Web Scraping (Firecrawl)
         |                      |
    Supabase Storage    staging_library/scraped/
         |                      |
         +---------+-----------+
                    |
           /api/resources POST
                    |
           lr_resources table
```

### Key Patterns

**Supabase Client Split:**
- Browser: `src/lib/supabase/client.ts` - Client-side operations
- Server: `src/lib/supabase/server.ts` - Server-side with cookie handling

**API Response Normalization:** All search APIs return unified `SearchResult` type defined in `src/types/index.ts`

**Scraping Fallback:** When downloads fail (403, blocked domains, HTML response), the system scrapes via Firecrawl API and stores content as markdown in both `staging_library/scraped/` bucket and `content` column

### Database Tables (LR_ prefix)

- `lr_groups` -> `lr_folders` -> `lr_categories` (3-level hierarchy)
- `lr_resources` - Main resources table with `content`, `file_url`, `metadata` JSONB
- `lr_tags` + `lr_resource_tags` - Many-to-many tagging
- `lr_search_history` - User search tracking

### Storage Buckets

- `staging_library` - Primary bucket for downloads and scraped content
- `legal-documents`, `legal-videos`, `thumbnails` - Legacy/specialized buckets

## External API Integrations

| API | Endpoint | Auth |
|-----|----------|------|
| Google Custom Search | `/api/search/google` | `GOOGLE_API_KEY` + `GOOGLE_SEARCH_ENGINE_ID` |
| YouTube | `/api/search/youtube` | `YOUTUBE_API_KEY` |
| CourtListener | `/api/search/courtlistener` | `COURTLISTENER_API_TOKEN` |
| Congress.gov | `/api/search/congress` | Optional API key |
| Federal Register | `/api/search/federalregister` | None |
| Library of Congress | `/api/search/loc` | None |
| UniCourt | `/api/search/unicourt` | `UNICOURT_CLIENT_ID` + `UNICOURT_CLIENT_SECRET` |
| Google Books | `/api/search/books` | Uses `GOOGLE_API_KEY` |
| OpenLibrary | `/api/search/openlibrary` | None |
| Firecrawl (scraping) | Used in download route | `FIRECRAWL_API_KEY` |

## Type Definitions

Core types in `src/types/index.ts`:
- `SearchResult` - Unified search result from all APIs
- `Resource` - Database resource model
- `CategoryHierarchy` - Group/folder/category tree
- `SourceType` - website, pdf, video, document, article, ebook
- `CourtListenerSearchType` - Opinions, RECAP, Oral Arguments

## Blocked Domains

Downloads auto-fallback to scraping for: `congress.gov`, `govinfo.gov`, `supremecourt.gov`, `uscourts.gov`

## Database Migrations

SQL files are in `legal-reference-library/supabase/`. Run via:
```bash
npm run db:migrate supabase/<migration-file>.sql
```

Or paste SQL directly in Supabase Dashboard SQL Editor (more reliable due to DNS issues with pooler endpoints).
