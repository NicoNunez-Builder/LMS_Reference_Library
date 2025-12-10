  -- =============================================       
  -- Case File Category Descriptions Update Script       
  -- =============================================       

  -- Folder 1: Admin (7 categories)
  UPDATE lr_categories SET description = 'Client and     
  third-party communications' WHERE slug =
  'correspondence';
  UPDATE lr_categories SET description = 'Initial        
  case intake and setup documents' WHERE slug =
  'case_opening_docs';
  UPDATE lr_categories SET description = 'Client
  retention and fee agreements' WHERE slug =
  'retention_agreements';
  UPDATE lr_categories SET description = 'Formal
  engagement and scope letters' WHERE slug =
  'engagement_letters';
  UPDATE lr_categories SET description = 'Conflict of    
   interest checks and clearances' WHERE slug =
  'conflict_checks';
  UPDATE lr_categories SET description = 'Case team      
  assignments and contact info' WHERE slug =
  'team_rosters';
  UPDATE lr_categories SET description = 'Invoices,      
  time entries, and billing records' WHERE slug =        
  'billing';

  -- Folder 2: Court Filings (12 categories)
  UPDATE lr_categories SET description = 'General        
  court filings and submissions' WHERE slug =
  'filings';
  UPDATE lr_categories SET description = 'Initial        
  complaints and amended complaints' WHERE slug =        
  'complaint';
  UPDATE lr_categories SET description = 'Answers to     
  complaints and counterclaims' WHERE slug =
  'answer';
  UPDATE lr_categories SET description = 'All motions    
   filed with the court' WHERE slug = 'motions';
  UPDATE lr_categories SET description = 'Opposition     
  briefs and responses' WHERE slug = 'oppositions';      
  UPDATE lr_categories SET description = 'Court
  orders and rulings' WHERE slug = 'orders';
  UPDATE lr_categories SET description = 'Party
  stipulations and agreements' WHERE slug =
  'stipulations';
  UPDATE lr_categories SET description = 'All formal     
  pleadings' WHERE slug = 'pleadings';
  UPDATE lr_categories SET description = 'Sworn
  declarations and affidavits' WHERE slug =
  'declarations';
  UPDATE lr_categories SET description = 'Exhibits       
  attached to filings' WHERE slug = 'exhibits';
  UPDATE lr_categories SET description = 'Court
  notices and notifications' WHERE slug = 'notices';     
  UPDATE lr_categories SET description = 'Case docket    
   sheets and reports' WHERE slug = 'docket_reports';    

  -- Folder 3: Discovery (11 categories)
  UPDATE lr_categories SET description = 'Requests       
  for production and responses' WHERE slug =
  'rfps_responses';
  UPDATE lr_categories SET description = 'Written        
  interrogatories and answers' WHERE slug =
  'interrogatories';
  UPDATE lr_categories SET description = 'Requests       
  for admission and responses' WHERE slug =
  'request_admissions';
  UPDATE lr_categories SET description = 'Objections     
  to discovery requests' WHERE slug =
  'discovery_objections';
  UPDATE lr_categories SET description = 'Meet and       
  confer correspondence and notes' WHERE slug =
  'meet_confer';
  UPDATE lr_categories SET description =
  'Electronically stored information protocols' WHERE    
   slug = 'esi_protocol';
  UPDATE lr_categories SET description = 'Document       
  custodians and data sources' WHERE slug =
  'custodian_list';
  UPDATE lr_categories SET description = 'Logs
  tracking document productions' WHERE slug =
  'production_logs';
  UPDATE lr_categories SET description = 'General        
  production documents' WHERE slug =
  'document_production';
  UPDATE lr_categories SET description = 'Documents      
  received from opposing parties' WHERE slug =
  'inbound_productions';
  UPDATE lr_categories SET description = 'Documents      
  produced to opposing parties' WHERE slug =
  'outbound_productions';

  -- Folder 4: Documents (9 categories)
  UPDATE lr_categories SET description = 'Relevant       
  email communications' WHERE slug = 'emails';
  UPDATE lr_categories SET description = 'Contracts      
  and business agreements' WHERE slug =
  'contracts_agreements';
  UPDATE lr_categories SET description = 'Notes from     
  client and team meetings' WHERE slug =
  'meeting_notes';
  UPDATE lr_categories SET description = 'Corporate      
  board meeting minutes' WHERE slug =
  'board_minutes';
  UPDATE lr_categories SET description = 'Company        
  policies and procedures' WHERE slug =
  'policy_documents';
  UPDATE lr_categories SET description = 'Reports        
  prepared by expert witnesses' WHERE slug =
  'expert_reports_docs';
  UPDATE lr_categories SET description = 'Written        
  witness statements' WHERE slug =
  'witness_statements_docs';
  UPDATE lr_categories SET description = 'Attorney       
  work product and analysis' WHERE slug =
  'work_product';
  UPDATE lr_categories SET description = 'Legal
  research and memoranda' WHERE slug =
  'research_memos';

  -- Folder 5: Evidence (7 categories)
  UPDATE lr_categories SET description = 'Original       
  unprocessed data collections' WHERE slug =
  'raw_collections';
  UPDATE lr_categories SET description = 'Forensic       
  disk and device images' WHERE slug =
  'forensic_images';
  UPDATE lr_categories SET description = 'Processed      
  and extracted files' WHERE slug =
  'processed_files';
  UPDATE lr_categories SET description = 'Evidence       
  chain of custody documentation' WHERE slug =
  'chain_custody';
  UPDATE lr_categories SET description = 'File hash      
  verification reports' WHERE slug = 'hash_reports';     
  UPDATE lr_categories SET description = 'Bates
  numbered documents' WHERE slug = 'bates_stamps';       
  UPDATE lr_categories SET description = 'Privilege      
  log and withheld documents' WHERE slug =
  'privilege_log';

  -- Folder 6: Experts (7 categories)
  UPDATE lr_categories SET description = 'Expert CVs     
  and retention agreements' WHERE slug =
  'cvs_retainer_agmts';
  UPDATE lr_categories SET description = 'Final
  expert reports and opinions' WHERE slug =
  'expert_reports';
  UPDATE lr_categories SET description = 'Draft
  reports and working notes' WHERE slug =
  'drafts_notes';
  UPDATE lr_categories SET description = 'Expert
  correspondence and emails' WHERE slug =
  'communications';
  UPDATE lr_categories SET description = 'Expert
  contact information' WHERE slug =
  'contact_lists_experts';
  UPDATE lr_categories SET description = 'Notes from     
  expert interviews' WHERE slug =
  'interview_notes_experts';
  UPDATE lr_categories SET description = 'Expert
  deposition transcripts' WHERE slug =
  'transcripts_experts';

  -- Folder 7: Witnesses (4 categories)
  UPDATE lr_categories SET description = 'Witness        
  contact information' WHERE slug =
  'contact_lists_witnesses';
  UPDATE lr_categories SET description = 'Notes from     
  witness interviews' WHERE slug =
  'interview_notes_witnesses';
  UPDATE lr_categories SET description = 'Witness        
  deposition transcripts' WHERE slug =
  'transcripts_witnesses';
  UPDATE lr_categories SET description = 'Sworn
  witness affidavits' WHERE slug = 'affidavits';

  -- Folder 8: Hearings and Trial (7 categories)
  UPDATE lr_categories SET description = 'Materials      
  for hearing preparation' WHERE slug =
  'hearing_preparation';
  UPDATE lr_categories SET description = 'Deposition     
  outlines and prep materials' WHERE slug =
  'deposition_preparation';
  UPDATE lr_categories SET description = 'Official       
  deposition transcripts' WHERE slug =
  'deposition_transcripts';
  UPDATE lr_categories SET description = 'Organized      
  trial binder contents' WHERE slug =
  'trial_binders';
  UPDATE lr_categories SET description = 'Trial
  exhibit lists and indexes' WHERE slug =
  'exhibit_lists';
  UPDATE lr_categories SET description = 'Proposed       
  and final jury instructions' WHERE slug =
  'jury_instructions';
  UPDATE lr_categories SET description = 'Opening and    
   closing arguments' WHERE slug = 'opening_closing';    

  -- Folder 9: Settlement and Resolution (5 categories)
  UPDATE lr_categories SET description = 'Settlement     
  negotiation communications' WHERE slug =
  'settlement_discussions';
  UPDATE lr_categories SET description = 'Final
  settlement agreements' WHERE slug =
  'settlement_agreements';
  UPDATE lr_categories SET description = 'Mediation      
  briefs and statements' WHERE slug =
  'mediation_statements';
  UPDATE lr_categories SET description = 'Draft
  settlement terms and proposals' WHERE slug =
  'negotiation_drafts';
  UPDATE lr_categories SET description = 'Release        
  agreements and waivers' WHERE slug =
  'final_release';

  -- Folder 10: Archive and Closure (4 categories)       
  UPDATE lr_categories SET description = 'Final
  invoices and billing reconciliation' WHERE slug =      
  'final_billing';
  UPDATE lr_categories SET description = 'Case
  closure summary and reports' WHERE slug =
  'case_closure_rpt';
  UPDATE lr_categories SET description = 'Document       
  retention and destruction logs' WHERE slug =
  'doc_destruction_logs';
  UPDATE lr_categories SET description = 'Documents      
  transferred to client' WHERE slug =
  'transfer_to_client';