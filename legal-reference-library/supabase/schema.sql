-- =============================================
-- LEGAL REFERENCE LIBRARY - DATABASE RESET SCRIPT
-- =============================================
-- This script will DROP all existing tables and recreate them
-- WARNING: All existing data will be lost!
-- =============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enable full-text search
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- =============================================
-- DROP EXISTING OBJECTS (in correct order for foreign key dependencies)
-- =============================================

-- Drop trigger first
DROP TRIGGER IF EXISTS update_LR_resources_updated_at ON LR_resources;

-- Drop function
DROP FUNCTION IF EXISTS LR_update_updated_at_column();

-- Drop policies (must drop before tables)
DROP POLICY IF EXISTS "Public LR_resources are viewable by everyone" ON LR_resources;
DROP POLICY IF EXISTS "Users can insert own LR_resources" ON LR_resources;
DROP POLICY IF EXISTS "Anyone can insert public LR_resources" ON LR_resources;
DROP POLICY IF EXISTS "Users can update own LR_resources" ON LR_resources;
DROP POLICY IF EXISTS "Users can delete own LR_resources" ON LR_resources;
DROP POLICY IF EXISTS "Anyone can delete public LR_resources" ON LR_resources;
DROP POLICY IF EXISTS "Users can view own LR_search_history" ON LR_search_history;
DROP POLICY IF EXISTS "Users can insert own LR_search_history" ON LR_search_history;
DROP POLICY IF EXISTS "LR_groups are viewable by everyone" ON LR_groups;
DROP POLICY IF EXISTS "LR_folders are viewable by everyone" ON LR_folders;
DROP POLICY IF EXISTS "LR_categories are viewable by everyone" ON LR_categories;
DROP POLICY IF EXISTS "LR_tags are viewable by everyone" ON LR_tags;

-- Drop tables in order (children first, then parents)
DROP TABLE IF EXISTS LR_resource_tags CASCADE;
DROP TABLE IF EXISTS LR_search_history CASCADE;
DROP TABLE IF EXISTS LR_resources CASCADE;
DROP TABLE IF EXISTS LR_categories CASCADE;
DROP TABLE IF EXISTS LR_folders CASCADE;
DROP TABLE IF EXISTS LR_groups CASCADE;
DROP TABLE IF EXISTS LR_tags CASCADE;

-- =============================================
-- CREATE TABLES
-- =============================================

-- Category Groups table (top-level containers - tabs in UI)
CREATE TABLE LR_groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Category Folders table (containers within groups)
CREATE TABLE LR_folders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id UUID NOT NULL REFERENCES LR_groups(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(group_id, slug)
);

-- Categories table
CREATE TABLE LR_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  group_id UUID REFERENCES LR_groups(id) ON DELETE CASCADE,
  folder_id UUID REFERENCES LR_folders(id) ON DELETE CASCADE,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(group_id, folder_id, slug)
);

-- Resources table
CREATE TABLE LR_resources (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  description TEXT,
  category_id UUID REFERENCES LR_categories(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN ('website', 'pdf', 'video', 'document', 'article')),
  file_url TEXT,
  file_size BIGINT,
  thumbnail_url TEXT,
  content TEXT,
  content_source TEXT CHECK (content_source IN ('scraped', 'parsed', 'manual')),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  is_public BOOLEAN DEFAULT true,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tags table
CREATE TABLE LR_tags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Resource tags junction table
CREATE TABLE LR_resource_tags (
  resource_id UUID REFERENCES LR_resources(id) ON DELETE CASCADE,
  tag_id UUID REFERENCES LR_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (resource_id, tag_id)
);

-- Search history table
CREATE TABLE LR_search_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  query TEXT NOT NULL,
  filters JSONB,
  results_count INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX idx_LR_groups_display_order ON LR_groups(display_order);
CREATE INDEX idx_LR_folders_group ON LR_folders(group_id);
CREATE INDEX idx_LR_folders_display_order ON LR_folders(group_id, display_order);
CREATE INDEX idx_LR_categories_group ON LR_categories(group_id);
CREATE INDEX idx_LR_categories_folder ON LR_categories(folder_id);
CREATE INDEX idx_LR_categories_display_order ON LR_categories(group_id, folder_id, display_order);
CREATE INDEX idx_LR_resources_category ON LR_resources(category_id);
CREATE INDEX idx_LR_resources_source_type ON LR_resources(source_type);
CREATE INDEX idx_LR_resources_user ON LR_resources(user_id);
CREATE INDEX idx_LR_resources_created_at ON LR_resources(created_at DESC);
CREATE INDEX idx_LR_resource_tags_resource ON LR_resource_tags(resource_id);
CREATE INDEX idx_LR_resource_tags_tag ON LR_resource_tags(tag_id);
CREATE INDEX idx_LR_search_history_user ON LR_search_history(user_id);

-- Full-text search index (includes content for scraped text search)
CREATE INDEX idx_LR_resources_search ON LR_resources USING GIN (to_tsvector('english', title || ' ' || COALESCE(description, '') || ' ' || COALESCE(content, '')));

-- Insert Category Groups
INSERT INTO LR_groups (name, slug, description, display_order) VALUES
  ('Legal Reference Library', 'legal_reference_library', 'Core legal reference materials and research resources', 1),
  ('Case File', 'case_file', 'Case management and litigation documentation', 2);

-- Insert Legal Reference Library categories (Group 1 - no folders, flat structure)
INSERT INTO LR_categories (name, slug, description, group_id, folder_id, display_order)
SELECT name, slug, description,
  (SELECT id FROM LR_groups WHERE slug = 'legal_reference_library'),
  NULL,
  display_order
FROM (VALUES
  ('Constitutional Law', 'constitutional_law', 'Resources related to constitutional law and fundamental rights', 1),
  ('Library of Congress', 'library_of_congress', 'Resources from the Library of Congress', 2),
  ('Statutes', 'statutes', 'Federal and state statutes and legislation', 3),
  ('Contracts & Torts', 'contracts_torts', 'Contract law and tort law resources', 4),
  ('Civil Procedure', 'civil_procedure', 'Civil procedure rules and guidelines', 5),
  ('Property', 'property', 'Property law and real estate legal resources', 6),
  ('Case Law', 'case_law', 'Legal precedents and court decisions', 7),
  ('Legal Research', 'legal_research', 'Legal research tools and methodologies', 8),
  ('Rules of Court', 'rules_of_court', 'Court rules and procedures', 9),
  ('Rules of Evidence', 'rules_of_evidence', 'Evidence rules and standards', 10),
  ('Professional Responsibility', 'professional_responsibility', 'Legal professional ethics and responsibilities', 11),
  ('Ethics Governance', 'ethics_governance', 'Ethics and governance guidelines', 12),
  ('Social Responsibility', 'social_responsibility', 'Social responsibility in legal practice', 13)
) AS t(name, slug, description, display_order);

-- Insert Case File folders (Group 2)
INSERT INTO LR_folders (name, slug, description, group_id, display_order)
SELECT name, slug, description,
  (SELECT id FROM LR_groups WHERE slug = 'case_file'),
  display_order
FROM (VALUES
  ('Admin', 'admin', 'Administrative documents and case management', 1),
  ('Court Filings', 'court_filings', 'Court documents and legal filings', 2),
  ('Discovery', 'discovery', 'Discovery requests, responses, and productions', 3),
  ('Documents', 'documents', 'Case-related documents and communications', 4),
  ('Evidence', 'evidence', 'Evidence collection and management', 5),
  ('Experts', 'experts', 'Expert witness materials and reports', 6),
  ('Witnesses', 'witnesses', 'Witness information and statements', 7),
  ('Hearings and Trial', 'hearings_trial', 'Hearing and trial preparation materials', 8),
  ('Settlement and Resolution', 'settlement_resolution', 'Settlement negotiations and agreements', 9),
  ('Archive and Closure', 'archive_closure', 'Case closure and archival documents', 10)
) AS t(name, slug, description, display_order);

-- Insert Case File categories for each folder

-- Folder 1: Admin
INSERT INTO LR_categories (name, slug, description, group_id, folder_id, display_order)
SELECT name, slug, description,
  (SELECT id FROM LR_groups WHERE slug = 'case_file'),
  (SELECT id FROM LR_folders WHERE slug = 'admin' AND group_id = (SELECT id FROM LR_groups WHERE slug = 'case_file')),
  display_order
FROM (VALUES
  ('Correspondence', 'correspondence', 'Client and third-party communications', 1),
  ('Case Opening Docs', 'case_opening_docs', 'Initial case intake and setup documents', 2),
  ('Retention Agreements', 'retention_agreements', 'Client retention and fee agreements', 3),
  ('Engagement Letters', 'engagement_letters', 'Formal engagement and scope letters', 4),
  ('Conflict Checks', 'conflict_checks', 'Conflict of interest checks and clearances', 5),
  ('Team Rosters', 'team_rosters', 'Case team assignments and contact info', 6),
  ('Billing', 'billing', 'Invoices, time entries, and billing records', 7)
) AS t(name, slug, description, display_order);

-- Folder 2: Court Filings
INSERT INTO LR_categories (name, slug, description, group_id, folder_id, display_order)
SELECT name, slug, description,
  (SELECT id FROM LR_groups WHERE slug = 'case_file'),
  (SELECT id FROM LR_folders WHERE slug = 'court_filings' AND group_id = (SELECT id FROM LR_groups WHERE slug = 'case_file')),
  display_order
FROM (VALUES
  ('Filings', 'filings', 'General court filings and submissions', 1),
  ('Complaint', 'complaint', 'Initial complaints and amended complaints', 2),
  ('Answer', 'answer', 'Answers to complaints and counterclaims', 3),
  ('Motions', 'motions', 'All motions filed with the court', 4),
  ('Oppositions', 'oppositions', 'Opposition briefs and responses', 5),
  ('Orders', 'orders', 'Court orders and rulings', 6),
  ('Stipulations', 'stipulations', 'Party stipulations and agreements', 7),
  ('Pleadings', 'pleadings', 'All formal pleadings', 8),
  ('Declarations', 'declarations', 'Sworn declarations and affidavits', 9),
  ('Exhibits', 'exhibits', 'Exhibits attached to filings', 10),
  ('Notices', 'notices', 'Court notices and notifications', 11),
  ('Docket Reports', 'docket_reports', 'Case docket sheets and reports', 12)
) AS t(name, slug, description, display_order);

-- Folder 3: Discovery
INSERT INTO LR_categories (name, slug, description, group_id, folder_id, display_order)
SELECT name, slug, description,
  (SELECT id FROM LR_groups WHERE slug = 'case_file'),
  (SELECT id FROM LR_folders WHERE slug = 'discovery' AND group_id = (SELECT id FROM LR_groups WHERE slug = 'case_file')),
  display_order
FROM (VALUES
  ('RFPs and Responses', 'rfps_responses', 'Requests for production and responses', 1),
  ('Interrogatories', 'interrogatories', 'Written interrogatories and answers', 2),
  ('Request for Admissions', 'request_admissions', 'Requests for admission and responses', 3),
  ('Discovery Objections', 'discovery_objections', 'Objections to discovery requests', 4),
  ('Meet and Confer', 'meet_confer', 'Meet and confer correspondence and notes', 5),
  ('ESI Protocol', 'esi_protocol', 'Electronically stored information protocols', 6),
  ('Custodian List', 'custodian_list', 'Document custodians and data sources', 7),
  ('Production Logs', 'production_logs', 'Logs tracking document productions', 8),
  ('Document Production', 'document_production', 'General production documents', 9),
  ('Inbound Productions', 'inbound_productions', 'Documents received from opposing parties', 10),
  ('Outbound Productions', 'outbound_productions', 'Documents produced to opposing parties', 11)
) AS t(name, slug, description, display_order);

-- Folder 4: Documents
INSERT INTO LR_categories (name, slug, description, group_id, folder_id, display_order)
SELECT name, slug, description,
  (SELECT id FROM LR_groups WHERE slug = 'case_file'),
  (SELECT id FROM LR_folders WHERE slug = 'documents' AND group_id = (SELECT id FROM LR_groups WHERE slug = 'case_file')),
  display_order
FROM (VALUES
  ('Emails', 'emails', 'Relevant email communications', 1),
  ('Contracts & Agreements', 'contracts_agreements', 'Contracts and business agreements', 2),
  ('Meeting Notes', 'meeting_notes', 'Notes from client and team meetings', 3),
  ('Board Minutes', 'board_minutes', 'Corporate board meeting minutes', 4),
  ('Policy Documents', 'policy_documents', 'Company policies and procedures', 5),
  ('Expert Reports', 'expert_reports_docs', 'Reports prepared by expert witnesses', 6),
  ('Witness Statements', 'witness_statements_docs', 'Written witness statements', 7),
  ('Work Product', 'work_product', 'Attorney work product and analysis', 8),
  ('Research and Memos', 'research_memos', 'Legal research and memoranda', 9)
) AS t(name, slug, description, display_order);

-- Folder 5: Evidence
INSERT INTO LR_categories (name, slug, description, group_id, folder_id, display_order)
SELECT name, slug, description,
  (SELECT id FROM LR_groups WHERE slug = 'case_file'),
  (SELECT id FROM LR_folders WHERE slug = 'evidence' AND group_id = (SELECT id FROM LR_groups WHERE slug = 'case_file')),
  display_order
FROM (VALUES
  ('Raw Collections', 'raw_collections', 'Original unprocessed data collections', 1),
  ('Forensic Images', 'forensic_images', 'Forensic disk and device images', 2),
  ('Processed Files', 'processed_files', 'Processed and extracted files', 3),
  ('Chain of Custody', 'chain_custody', 'Evidence chain of custody documentation', 4),
  ('Hash Reports', 'hash_reports', 'File hash verification reports', 5),
  ('Bates Stamps', 'bates_stamps', 'Bates numbered documents', 6),
  ('Privilege Log', 'privilege_log', 'Privilege log and withheld documents', 7)
) AS t(name, slug, description, display_order);

-- Folder 6: Experts
INSERT INTO LR_categories (name, slug, description, group_id, folder_id, display_order)
SELECT name, slug, description,
  (SELECT id FROM LR_groups WHERE slug = 'case_file'),
  (SELECT id FROM LR_folders WHERE slug = 'experts' AND group_id = (SELECT id FROM LR_groups WHERE slug = 'case_file')),
  display_order
FROM (VALUES
  ('CVs and Retainer Agmts', 'cvs_retainer_agmts', 'Expert CVs and retention agreements', 1),
  ('Expert Reports', 'expert_reports', 'Final expert reports and opinions', 2),
  ('Drafts and Notes', 'drafts_notes', 'Draft reports and working notes', 3),
  ('Communications', 'communications', 'Expert correspondence and emails', 4),
  ('Contact Lists', 'contact_lists_experts', 'Expert contact information', 5),
  ('Interview Notes', 'interview_notes_experts', 'Notes from expert interviews', 6),
  ('Transcripts', 'transcripts_experts', 'Expert deposition transcripts', 7)
) AS t(name, slug, description, display_order);

-- Folder 7: Witnesses
INSERT INTO LR_categories (name, slug, description, group_id, folder_id, display_order)
SELECT name, slug, description,
  (SELECT id FROM LR_groups WHERE slug = 'case_file'),
  (SELECT id FROM LR_folders WHERE slug = 'witnesses' AND group_id = (SELECT id FROM LR_groups WHERE slug = 'case_file')),
  display_order
FROM (VALUES
  ('Contact Lists', 'contact_lists_witnesses', 'Witness contact information', 1),
  ('Interview Notes', 'interview_notes_witnesses', 'Notes from witness interviews', 2),
  ('Transcripts', 'transcripts_witnesses', 'Witness deposition transcripts', 3),
  ('Affidavits', 'affidavits', 'Sworn witness affidavits', 4)
) AS t(name, slug, description, display_order);

-- Folder 8: Hearings and Trial
INSERT INTO LR_categories (name, slug, description, group_id, folder_id, display_order)
SELECT name, slug, description,
  (SELECT id FROM LR_groups WHERE slug = 'case_file'),
  (SELECT id FROM LR_folders WHERE slug = 'hearings_trial' AND group_id = (SELECT id FROM LR_groups WHERE slug = 'case_file')),
  display_order
FROM (VALUES
  ('Hearing Preparation', 'hearing_preparation', 'Materials for hearing preparation', 1),
  ('Deposition Preparation', 'deposition_preparation', 'Deposition outlines and prep materials', 2),
  ('Deposition Transcripts', 'deposition_transcripts', 'Official deposition transcripts', 3),
  ('Trial Binders', 'trial_binders', 'Organized trial binder contents', 4),
  ('Exhibit Lists', 'exhibit_lists', 'Trial exhibit lists and indexes', 5),
  ('Jury Instructions', 'jury_instructions', 'Proposed and final jury instructions', 6),
  ('Opening and Closing', 'opening_closing', 'Opening and closing arguments', 7)
) AS t(name, slug, description, display_order);

-- Folder 9: Settlement and Resolution
INSERT INTO LR_categories (name, slug, description, group_id, folder_id, display_order)
SELECT name, slug, description,
  (SELECT id FROM LR_groups WHERE slug = 'case_file'),
  (SELECT id FROM LR_folders WHERE slug = 'settlement_resolution' AND group_id = (SELECT id FROM LR_groups WHERE slug = 'case_file')),
  display_order
FROM (VALUES
  ('Settlement Discussions', 'settlement_discussions', 'Settlement negotiation communications', 1),
  ('Settlement Agreements', 'settlement_agreements', 'Final settlement agreements', 2),
  ('Mediation Statements', 'mediation_statements', 'Mediation briefs and statements', 3),
  ('Negotiation Drafts', 'negotiation_drafts', 'Draft settlement terms and proposals', 4),
  ('Final Release', 'final_release', 'Release agreements and waivers', 5)
) AS t(name, slug, description, display_order);

-- Folder 10: Archive and Closure
INSERT INTO LR_categories (name, slug, description, group_id, folder_id, display_order)
SELECT name, slug, description,
  (SELECT id FROM LR_groups WHERE slug = 'case_file'),
  (SELECT id FROM LR_folders WHERE slug = 'archive_closure' AND group_id = (SELECT id FROM LR_groups WHERE slug = 'case_file')),
  display_order
FROM (VALUES
  ('Final Billing', 'final_billing', 'Final invoices and billing reconciliation', 1),
  ('Case Closure Rpt', 'case_closure_rpt', 'Case closure summary and reports', 2),
  ('Doc Destruction Logs', 'doc_destruction_logs', 'Document retention and destruction logs', 3),
  ('Transfer to Client', 'transfer_to_client', 'Documents transferred to client', 4)
) AS t(name, slug, description, display_order);

-- Row Level Security (RLS) Policies

-- Enable RLS
ALTER TABLE LR_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE LR_search_history ENABLE ROW LEVEL SECURITY;

-- Public resources can be read by anyone
CREATE POLICY "Public LR_resources are viewable by everyone"
  ON LR_resources FOR SELECT
  USING (is_public = true);

-- Users can insert their own resources
CREATE POLICY "Users can insert own LR_resources"
  ON LR_resources FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Anyone can insert public resources (for anonymous users)
CREATE POLICY "Anyone can insert public LR_resources"
  ON LR_resources FOR INSERT
  WITH CHECK (is_public = true AND user_id IS NULL);

-- Users can update their own resources
CREATE POLICY "Users can update own LR_resources"
  ON LR_resources FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own resources
CREATE POLICY "Users can delete own LR_resources"
  ON LR_resources FOR DELETE
  USING (auth.uid() = user_id);

-- Anyone can delete public resources (for anonymous users)
CREATE POLICY "Anyone can delete public LR_resources"
  ON LR_resources FOR DELETE
  USING (is_public = true AND user_id IS NULL);

-- Users can view their own search history
CREATE POLICY "Users can view own LR_search_history"
  ON LR_search_history FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own search history
CREATE POLICY "Users can insert own LR_search_history"
  ON LR_search_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Categories, groups, folders, and tags are publicly readable
ALTER TABLE LR_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE LR_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE LR_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE LR_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "LR_groups are viewable by everyone"
  ON LR_groups FOR SELECT
  USING (true);

CREATE POLICY "LR_folders are viewable by everyone"
  ON LR_folders FOR SELECT
  USING (true);

CREATE POLICY "LR_categories are viewable by everyone"
  ON LR_categories FOR SELECT
  USING (true);

CREATE POLICY "LR_tags are viewable by everyone"
  ON LR_tags FOR SELECT
  USING (true);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION LR_update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
CREATE TRIGGER update_LR_resources_updated_at
  BEFORE UPDATE ON LR_resources
  FOR EACH ROW
  EXECUTE FUNCTION LR_update_updated_at_column();

-- Storage bucket setup (run this in Supabase dashboard or via API)
-- Create ONE bucket through Supabase UI: staging_library
--
-- Folder structure inside staging_library bucket:
--   staging_library/
--   ├── documents/     (for PDFs, Word docs, etc.)
--   ├── videos/        (for downloaded YouTube videos)
--   └── thumbnails/    (for preview images)
--
-- Files will be stored with paths like:
--   documents/file.pdf
--   videos/video.mp4
--   thumbnails/image.jpg
