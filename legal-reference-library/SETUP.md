# Quick Setup Guide

## Prerequisites

1. **Node.js 18+** - Install from [nodejs.org](https://nodejs.org)
2. **Supabase Account** - Sign up at [supabase.com](https://supabase.com)
3. **Google Cloud Account** - For Search & YouTube APIs

## Step-by-Step Setup

### 1. Install Dependencies

```bash
cd legal-reference-library
npm install
```

### 2. Set Up Supabase

1. Create a new project at [supabase.com](https://supabase.com)
2. Go to **Project Settings > API** and copy:
   - Project URL
   - Anon/Public key

3. Go to **SQL Editor** and run the entire `supabase/schema.sql` file

4. Go to **Storage** and create three buckets:
   - `legal-documents` (make it public)
   - `legal-videos` (make it public)
   - `thumbnails` (make it public)

### 3. Set Up Google APIs

#### Google Custom Search API

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project (or select existing)
3. Enable **Custom Search API**
4. Create credentials → API Key
5. Go to [Programmable Search Engine](https://programmablesearchengine.google.com)
6. Click "Add" to create a new search engine
7. Set "Search the entire web" option
8. Copy your **Search Engine ID** (looks like `abc123def456...`)

#### YouTube Data API

1. In Google Cloud Console
2. Enable **YouTube Data API v3**
3. Use the same API Key (or create a new one)

### 4. Configure Environment Variables

Create `.env.local` file in the root directory:

```bash
# Copy from template
cp .env.local.example .env.local
```

Edit `.env.local` with your actual credentials:

```env
# Supabase (from step 2)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here

# Google APIs (from step 3)
GOOGLE_API_KEY=your-google-api-key
GOOGLE_SEARCH_ENGINE_ID=your-search-engine-id

# YouTube API (same key as Google)
YOUTUBE_API_KEY=your-google-api-key

# App URL
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 5. Run the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Verification

Test these features to ensure everything is working:

1. **Home Page** - Should load with hero section and features
2. **Dashboard** - Should show 13 legal categories
3. **Search** - Try searching for "constitutional law" (requires API keys)
4. **Library** - Should load (might be empty initially)

## Troubleshooting

### "Supabase client error"
- Check that your Supabase URL and key are correct in `.env.local`
- Ensure you've run the SQL schema in Supabase

### "Search API error"
- Verify your Google API key is valid
- Ensure Custom Search API is enabled in Google Cloud Console
- Check that your Search Engine ID is correct

### "Storage bucket not found"
- Create the three storage buckets in Supabase
- Make them public (or configure RLS policies)

### TypeScript errors
- Run `npm install` again
- Delete `.next` folder and restart dev server

## Next Steps

1. Start searching for legal resources
2. Add resources to your library
3. Organize resources by category
4. (Optional) Set up Supabase Auth for user accounts
5. Deploy to Vercel when ready

## Support

- Check the main `README.md` for detailed documentation
- Review the `supabase/schema.sql` for database structure
- Check API route files in `src/app/api/` for endpoint details
