-- ============================================================
-- GPT Registry — Database Query Cheat Sheet
-- ============================================================
-- Connect:
--   docker-compose exec postgres psql -U gpt_registry -d gpt_registry
--
-- Tips:
--   \x on          — expanded (vertical) display
--   \x off         — table (horizontal) display
--   \dt            — list all tables
--   \d gpts        — describe gpts table schema
-- ============================================================

-- ========================
-- SCHEMA OVERVIEW
-- ========================
-- 5 tables:
--   configurations        — singleton (id=1), API keys, filter settings
--   categories             — classification categories (name, color, enabled)
--   sync_logs              — one row per pipeline run (status, counts, timestamps)
--   pipeline_log_entries   — per-step log messages for each sync run
--   gpts                   — the main GPT registry (all fetched GPTs)

-- ========================
-- TABLE: configurations
-- ========================
-- View current config (API keys are Fernet-encrypted)
SELECT id, workspace_id, base_url, classification_enabled, classification_model,
       max_categories_per_gpt, include_all, min_shared_users,
       visibility_filters, excluded_emails,
       compliance_api_key IS NOT NULL as has_compliance_key,
       openai_api_key IS NOT NULL as has_openai_key
FROM configurations;

-- ========================
-- TABLE: categories
-- ========================
-- List all categories
SELECT id, name, description, color, enabled, sort_order
FROM categories ORDER BY sort_order;

-- Count GPTs per category
SELECT c.name, c.color, count(g.id) as gpt_count
FROM categories c
LEFT JOIN gpts g ON g.primary_category_id = c.id
GROUP BY c.id ORDER BY gpt_count DESC;

-- ========================
-- TABLE: gpts
-- ========================
-- All GPTs overview
SELECT name, owner_email, builder_name, visibility, shared_user_count, created_at::date as created
FROM gpts ORDER BY created_at DESC;

-- Full details for a specific GPT
\x on
SELECT * FROM gpts WHERE name ILIKE '%keyword%';
\x off

-- GPTs by builder
SELECT builder_name, count(*) as gpt_count, array_agg(name) as gpt_names
FROM gpts GROUP BY builder_name ORDER BY gpt_count DESC;

-- GPTs by visibility
SELECT visibility, count(*) as gpt_count
FROM gpts GROUP BY visibility ORDER BY gpt_count DESC;

-- GPTs by owner
SELECT owner_email, count(*) as gpt_count
FROM gpts GROUP BY owner_email ORDER BY gpt_count DESC;

-- GPTs with classification results
SELECT name, primary_category_id, secondary_category_id,
       classification_confidence, LEFT(llm_summary, 100) as summary
FROM gpts WHERE primary_category_id IS NOT NULL
ORDER BY classification_confidence DESC;

-- GPTs with embeddings
SELECT name, embedding IS NOT NULL as has_embedding
FROM gpts ORDER BY name;

-- GPTs with tools
SELECT name, tools
FROM gpts WHERE jsonb_array_length(COALESCE(tools, '[]'::jsonb)) > 0;

-- GPTs with files
SELECT name, files
FROM gpts WHERE jsonb_array_length(COALESCE(files, '[]'::jsonb)) > 0;

-- GPTs shared with others (has recipients)
SELECT name, owner_email, shared_user_count, recipients
FROM gpts WHERE shared_user_count > 0 ORDER BY shared_user_count DESC;

-- Search GPTs by instruction content
SELECT name, owner_email, LEFT(instructions, 200) as instructions_preview
FROM gpts WHERE instructions ILIKE '%keyword%';

-- Recently created GPTs (last 30 days)
SELECT name, owner_email, created_at
FROM gpts WHERE created_at > now() - interval '30 days'
ORDER BY created_at DESC;

-- ========================
-- TABLE: sync_logs
-- ========================
-- Pipeline run history
SELECT id, status, started_at, finished_at,
       total_gpts_found, gpts_after_filter, gpts_classified, gpts_embedded,
       finished_at - started_at as duration
FROM sync_logs ORDER BY started_at DESC;

-- Last successful run
SELECT * FROM sync_logs WHERE status = 'completed' ORDER BY finished_at DESC LIMIT 1;

-- ========================
-- TABLE: pipeline_log_entries
-- ========================
-- Logs for the latest run
SELECT timestamp, level, message
FROM pipeline_log_entries
WHERE sync_log_id = (SELECT max(id) FROM sync_logs)
ORDER BY id;

-- Logs for a specific run (replace N with sync_log_id)
-- SELECT timestamp, level, message FROM pipeline_log_entries WHERE sync_log_id = N ORDER BY id;

-- Only errors/warnings
SELECT sync_log_id, timestamp, level, message
FROM pipeline_log_entries
WHERE level IN ('error', 'warn')
ORDER BY id DESC LIMIT 20;

-- ========================
-- COUNTS SUMMARY
-- ========================
SELECT
  (SELECT count(*) FROM gpts) as total_gpts,
  (SELECT count(*) FROM categories) as total_categories,
  (SELECT count(*) FROM categories WHERE enabled) as enabled_categories,
  (SELECT count(*) FROM sync_logs) as total_runs,
  (SELECT count(*) FROM sync_logs WHERE status = 'completed') as successful_runs,
  (SELECT count(*) FROM pipeline_log_entries) as total_log_entries;
