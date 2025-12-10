// Category Group slugs
export enum CategoryGroupSlug {
  LEGAL_REFERENCE = 'legal_reference_library',
  CASE_FILE = 'case_file',
}

// Category Group - top-level container (tabs in UI)
export interface CategoryGroup {
  id: string
  name: string
  slug: string
  description?: string
  display_order: number
  created_at: string
}

// Category Folder - container within a group
export interface CategoryFolder {
  id: string
  group_id: string
  name: string
  slug: string
  description?: string
  display_order: number
  created_at: string
  categories?: Category[]
  group?: CategoryGroup
}

// Category - the actual category item
export interface Category {
  id: string
  name: string
  slug: string
  description?: string
  group_id?: string
  folder_id?: string
  display_order: number
  created_at: string
  group?: CategoryGroup
  folder?: CategoryFolder
}

// Complete hierarchy structure for API responses
export interface CategoryHierarchy {
  groups: Array<CategoryGroup & {
    folders: Array<CategoryFolder & {
      categories: Category[]
    }>
    categories: Category[] // Direct categories (no folder)
  }>
}

// @deprecated - Use database-driven categories instead
// Kept for backward compatibility during migration
export enum LegalCategory {
  CONSTITUTIONAL_LAW = 'constitutional_law',
  LIBRARY_OF_CONGRESS = 'library_of_congress',
  STATUTES = 'statutes',
  CONTRACTS_TORTS = 'contracts_torts',
  CIVIL_PROCEDURE = 'civil_procedure',
  PROPERTY = 'property',
  CASE_LAW = 'case_law',
  LEGAL_RESEARCH = 'legal_research',
  RULES_OF_COURT = 'rules_of_court',
  RULES_OF_EVIDENCE = 'rules_of_evidence',
  PROFESSIONAL_RESPONSIBILITY = 'professional_responsibility',
  ETHICS_GOVERNANCE = 'ethics_governance',
  SOCIAL_RESPONSIBILITY = 'social_responsibility',
}

// @deprecated - Use database-driven categories instead
export const LegalCategoryLabels: Record<LegalCategory, string> = {
  [LegalCategory.CONSTITUTIONAL_LAW]: 'Constitutional Law',
  [LegalCategory.LIBRARY_OF_CONGRESS]: 'Library of Congress',
  [LegalCategory.STATUTES]: 'Statutes',
  [LegalCategory.CONTRACTS_TORTS]: 'Contracts & Torts',
  [LegalCategory.CIVIL_PROCEDURE]: 'Civil Procedure',
  [LegalCategory.PROPERTY]: 'Property',
  [LegalCategory.CASE_LAW]: 'Case Law',
  [LegalCategory.LEGAL_RESEARCH]: 'Legal Research',
  [LegalCategory.RULES_OF_COURT]: 'Rules of Court',
  [LegalCategory.RULES_OF_EVIDENCE]: 'Rules of Evidence',
  [LegalCategory.PROFESSIONAL_RESPONSIBILITY]: 'Professional Responsibility',
  [LegalCategory.ETHICS_GOVERNANCE]: 'Ethics Governance',
  [LegalCategory.SOCIAL_RESPONSIBILITY]: 'Social Responsibility',
}

// Source types for legal resources
export enum SourceType {
  WEBSITE = 'website',
  PDF = 'pdf',
  VIDEO = 'video',
  DOCUMENT = 'document',
  ARTICLE = 'article',
  EBOOK = 'ebook',
}

// File type filter options for search
export enum FileTypeFilter {
  ALL = 'all',
  PDF = 'pdf',
  DOC = 'doc',
  EBOOK = 'ebook',
}

export const FileTypeFilterLabels: Record<FileTypeFilter, string> = {
  [FileTypeFilter.ALL]: 'All Types',
  [FileTypeFilter.PDF]: 'PDFs',
  [FileTypeFilter.DOC]: 'Documents (DOC/DOCX)',
  [FileTypeFilter.EBOOK]: 'Ebooks (EPUB/MOBI)',
}

// CourtListener search types
export enum CourtListenerSearchType {
  OPINIONS = 'o',
  RECAP = 'r',
  ORAL_ARGUMENTS = 'oa',
}

export const CourtListenerSearchTypeLabels: Record<CourtListenerSearchType, string> = {
  [CourtListenerSearchType.OPINIONS]: 'Court Opinions',
  [CourtListenerSearchType.RECAP]: 'RECAP/Dockets',
  [CourtListenerSearchType.ORAL_ARGUMENTS]: 'Oral Arguments',
}

// Federal Courts for CourtListener
export const FederalCourts = {
  // Supreme Court
  'scotus': 'U.S. Supreme Court',
  // Circuit Courts
  'ca1': '1st Circuit',
  'ca2': '2nd Circuit',
  'ca3': '3rd Circuit',
  'ca4': '4th Circuit',
  'ca5': '5th Circuit',
  'ca6': '6th Circuit',
  'ca7': '7th Circuit',
  'ca8': '8th Circuit',
  'ca9': '9th Circuit',
  'ca10': '10th Circuit',
  'ca11': '11th Circuit',
  'cadc': 'D.C. Circuit',
  'cafc': 'Federal Circuit',
} as const

export type FederalCourtId = keyof typeof FederalCourts

// US States for UniCourt state court searches
export const USStates = {
  'AL': 'Alabama',
  'AK': 'Alaska',
  'AZ': 'Arizona',
  'AR': 'Arkansas',
  'CA': 'California',
  'CO': 'Colorado',
  'CT': 'Connecticut',
  'DE': 'Delaware',
  'FL': 'Florida',
  'GA': 'Georgia',
  'HI': 'Hawaii',
  'ID': 'Idaho',
  'IL': 'Illinois',
  'IN': 'Indiana',
  'IA': 'Iowa',
  'KS': 'Kansas',
  'KY': 'Kentucky',
  'LA': 'Louisiana',
  'ME': 'Maine',
  'MD': 'Maryland',
  'MA': 'Massachusetts',
  'MI': 'Michigan',
  'MN': 'Minnesota',
  'MS': 'Mississippi',
  'MO': 'Missouri',
  'MT': 'Montana',
  'NE': 'Nebraska',
  'NV': 'Nevada',
  'NH': 'New Hampshire',
  'NJ': 'New Jersey',
  'NM': 'New Mexico',
  'NY': 'New York',
  'NC': 'North Carolina',
  'ND': 'North Dakota',
  'OH': 'Ohio',
  'OK': 'Oklahoma',
  'OR': 'Oregon',
  'PA': 'Pennsylvania',
  'RI': 'Rhode Island',
  'SC': 'South Carolina',
  'SD': 'South Dakota',
  'TN': 'Tennessee',
  'TX': 'Texas',
  'UT': 'Utah',
  'VT': 'Vermont',
  'VA': 'Virginia',
  'WA': 'Washington',
  'WV': 'West Virginia',
  'WI': 'Wisconsin',
  'WY': 'Wyoming',
  'DC': 'District of Columbia',
} as const

export type USStateCode = keyof typeof USStates

// UniCourt case types
export const UniCourtCaseTypes = {
  'Civil': 'Civil',
  'Criminal': 'Criminal',
  'Family': 'Family',
  'Probate': 'Probate',
  'Bankruptcy': 'Bankruptcy',
  'Small Claims': 'Small Claims',
  'Traffic': 'Traffic',
  'Juvenile': 'Juvenile',
} as const

// Content source types for scraped/parsed content
export type ContentSource = 'scraped' | 'parsed' | 'manual'

// Database types
export interface Resource {
  id: string
  title: string
  url: string
  description?: string
  category_id: string
  category?: Category
  source_type: SourceType
  file_url?: string
  file_size?: number
  thumbnail_url?: string
  content?: string
  content_source?: ContentSource
  user_id?: string
  is_public: boolean
  metadata?: Record<string, any>
  created_at: string
  updated_at: string
}

export interface Tag {
  id: string
  name: string
  created_at: string
}

export interface ResourceTag {
  resource_id: string
  tag_id: string
}

export interface SearchHistory {
  id: string
  user_id?: string
  query: string
  filters?: Record<string, any>
  results_count: number
  created_at: string
}

// API Response types
export interface SearchResult {
  title: string
  url: string
  snippet: string
  source_type: SourceType
  thumbnail?: string
  metadata?: {
    date?: string
    subjects?: string[]
    collection?: string
    format?: string[]
    location?: string[]
    author?: string
    // Court case specific fields
    caseId?: string
    caseNumber?: string
    docketNumber?: string
    court?: string
    state?: string
    caseType?: string
    filedDate?: string
    dateFiled?: string
    caseStatus?: string
  }
}

export interface GoogleSearchResponse {
  items: Array<{
    title: string
    link: string
    snippet: string
    pagemap?: {
      cse_thumbnail?: Array<{ src: string }>
    }
  }>
}

export interface YouTubeSearchResponse {
  items: Array<{
    id: { videoId: string }
    snippet: {
      title: string
      description: string
      thumbnails: {
        default: { url: string }
        medium: { url: string }
        high: { url: string }
      }
    }
  }>
}

export interface GoogleBooksResponse {
  totalItems: number
  items?: Array<{
    id: string
    volumeInfo: {
      title: string
      authors?: string[]
      publisher?: string
      publishedDate?: string
      description?: string
      pageCount?: number
      categories?: string[]
      imageLinks?: {
        smallThumbnail?: string
        thumbnail?: string
      }
      previewLink?: string
      infoLink?: string
    }
    accessInfo?: {
      pdf?: { isAvailable: boolean; acsTokenLink?: string }
      epub?: { isAvailable: boolean; acsTokenLink?: string }
      webReaderLink?: string
    }
  }>
}

export interface OpenLibrarySearchResponse {
  numFound: number
  docs: Array<{
    key: string
    title: string
    author_name?: string[]
    first_publish_year?: number
    publisher?: string[]
    subject?: string[]
    cover_i?: number
    isbn?: string[]
    ebook_access?: string
  }>
}

// CourtListener API response types
export interface CourtListenerSearchResponse {
  count: number
  results: Array<{
    id: number
    absolute_url: string
    case_name: string
    case_name_short?: string
    court: string
    court_id: string
    date_filed: string
    docket_number?: string
    citation?: string[]
    snippet: string
    judge?: string
    attorney?: string
  }>
}

// Congress.gov API response types
export interface CongressGovSearchResponse {
  bills?: Array<{
    congress: number
    type: string
    number: string
    title: string
    introducedDate?: string
    latestAction?: {
      actionDate: string
      text: string
    }
    sponsors?: Array<{
      name: string
      party: string
      state: string
    }>
    url: string
  }>
  pagination?: {
    count: number
  }
}

// Federal Register API response types
export interface FederalRegisterSearchResponse {
  count: number
  results: Array<{
    document_number: string
    title: string
    type: string
    abstract?: string
    publication_date: string
    agencies: Array<{ name: string }>
    html_url: string
    pdf_url?: string
    citation?: string
  }>
}

// Harvard Caselaw Access Project API response types
export interface HarvardCaselawSearchResponse {
  count: number
  results: Array<{
    id: number
    name: string
    name_abbreviation: string
    decision_date: string
    court: {
      name: string
      slug: string
    }
    jurisdiction: {
      name: string
      slug: string
    }
    citations: Array<{
      cite: string
      type: string
    }>
    frontend_url: string
    preview?: string[]
  }>
}

// Form types
export interface ResourceFormData {
  title: string
  url: string
  description?: string
  category_id: string
  source_type: SourceType
  tags?: string[]
}

export interface SearchFilters {
  category?: LegalCategory
  source_type?: SourceType
  query?: string
  date_from?: string
  date_to?: string
}
