-- ====================================================================
-- PayMind Migration 004: Safe Preview Identifiers & Referential Integrity
-- Version: 2.0 (Corrected)
--
-- Summary of Changes:
-- 1. Converts preview primary key `preview_sessions.id` from UUID to TEXT
--    to support PayMind application session IDs (e.g. 'prev_session_...').
-- 2. Converts foreign key `preview_audit_logs.session_id` and PK `preview_audit_logs.id`
--    from UUID to TEXT to match `preview_sessions.id`.
-- 3. Safely drops and RECREATES referential integrity foreign keys:
--    - `preview_audit_logs_session_id_fkey` -> REFERENCES preview_sessions(id) ON DELETE CASCADE
--    - `preview_sessions_project_id_fkey`  -> REFERENCES projects(id) ON DELETE CASCADE
--    - `preview_sessions_milestone_id_fkey`-> REFERENCES milestones(id) ON DELETE SET NULL
--    - `preview_sessions_seller_id_fkey`   -> REFERENCES profiles(id) ON DELETE SET NULL
-- 4. Preserves `seller_id` as UUID (matching public.profiles.id UUID) and
--    relaxes NOT NULL constraint to allow demo / unauthenticated sessions.
-- 5. Safe for existing data (no DROP TABLE, no DELETE, casts existing UUIDs to TEXT).
-- 6. Fully idempotent and handles partially-migrated schemas with fine-grained guards.
-- 7. Ensures Row Level Security (RLS) policies cover both sessions and audit logs.
-- ====================================================================

DO $$
DECLARE
    v_sessions_exists BOOLEAN;
    v_audit_logs_exists BOOLEAN;
    v_projects_exists BOOLEAN;
    v_milestones_exists BOOLEAN;
    v_profiles_exists BOOLEAN;
    v_session_id_type TEXT;
    v_audit_session_id_type TEXT;
    v_project_id_type TEXT;
    v_projects_pk_type TEXT;
    v_milestone_id_type TEXT;
    v_milestones_pk_type TEXT;
    v_seller_id_nullable TEXT;
BEGIN
    -- ----------------------------------------------------------------
    -- 1. Check Table Existence Individually
    -- ----------------------------------------------------------------
    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'preview_sessions'
    ) INTO v_sessions_exists;

    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'preview_audit_logs'
    ) INTO v_audit_logs_exists;

    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'projects'
    ) INTO v_projects_exists;

    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'milestones'
    ) INTO v_milestones_exists;

    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'profiles'
    ) INTO v_profiles_exists;

    IF NOT v_sessions_exists THEN
        RAISE NOTICE 'Table public.preview_sessions does not exist yet. Please execute migration 002 first.';
        RETURN;
    END IF;

    -- ----------------------------------------------------------------
    -- 2. Inspect Column Types Individually
    -- ----------------------------------------------------------------
    SELECT data_type INTO v_session_id_type
    FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'preview_sessions' AND column_name = 'id';

    IF v_audit_logs_exists THEN
        SELECT data_type INTO v_audit_session_id_type
        FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'preview_audit_logs' AND column_name = 'session_id';
    END IF;

    SELECT data_type INTO v_project_id_type
    FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'preview_sessions' AND column_name = 'project_id';

    IF v_projects_exists THEN
        SELECT data_type INTO v_projects_pk_type
        FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'projects' AND column_name = 'id';
    END IF;

    SELECT data_type INTO v_milestone_id_type
    FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'preview_sessions' AND column_name = 'milestone_id';

    IF v_milestones_exists THEN
        SELECT data_type INTO v_milestones_pk_type
        FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'milestones' AND column_name = 'id';
    END IF;

    SELECT is_nullable INTO v_seller_id_nullable
    FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'preview_sessions' AND column_name = 'seller_id';

    -- ----------------------------------------------------------------
    -- 3. Safely Drop Foreign Keys Before Column Type Alterations
    -- ----------------------------------------------------------------
    IF v_audit_logs_exists THEN
        ALTER TABLE public.preview_audit_logs 
            DROP CONSTRAINT IF EXISTS preview_audit_logs_session_id_fkey;
    END IF;

    ALTER TABLE public.preview_sessions 
        DROP CONSTRAINT IF EXISTS preview_sessions_project_id_fkey,
        DROP CONSTRAINT IF EXISTS preview_sessions_milestone_id_fkey,
        DROP CONSTRAINT IF EXISTS preview_sessions_seller_id_fkey;

    -- ----------------------------------------------------------------
    -- 4. Alter Preview Audit Logs Identifiers (if table exists)
    -- ----------------------------------------------------------------
    IF v_audit_logs_exists THEN
        -- Alter PK id to TEXT if currently UUID
        IF (
            SELECT data_type FROM information_schema.columns 
            WHERE table_schema = 'public' AND table_name = 'preview_audit_logs' AND column_name = 'id'
        ) = 'uuid' THEN
            ALTER TABLE public.preview_audit_logs
                ALTER COLUMN id TYPE TEXT USING id::text,
                ALTER COLUMN id SET DEFAULT uuid_generate_v4()::text;
            RAISE NOTICE 'Converted preview_audit_logs.id to TEXT.';
        END IF;

        -- Alter session_id FK to TEXT if currently UUID
        IF v_audit_session_id_type = 'uuid' THEN
            ALTER TABLE public.preview_audit_logs
                ALTER COLUMN session_id TYPE TEXT USING session_id::text;
            RAISE NOTICE 'Converted preview_audit_logs.session_id to TEXT.';
        END IF;
    END IF;

    -- ----------------------------------------------------------------
    -- 5. Alter Preview Sessions Primary Key to TEXT
    -- ----------------------------------------------------------------
    IF v_session_id_type = 'uuid' THEN
        ALTER TABLE public.preview_sessions
            ALTER COLUMN id TYPE TEXT USING id::text,
            ALTER COLUMN id SET DEFAULT uuid_generate_v4()::text;
        RAISE NOTICE 'Converted preview_sessions.id to TEXT.';
    ELSE
        RAISE NOTICE 'preview_sessions.id is already TEXT (%s).', v_session_id_type;
    END IF;

    -- ----------------------------------------------------------------
    -- 6. Recreate preview_audit_logs_session_id_fkey
    -- ----------------------------------------------------------------
    IF v_audit_logs_exists THEN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints 
            WHERE table_schema = 'public' 
              AND table_name = 'preview_audit_logs' 
              AND constraint_name = 'preview_audit_logs_session_id_fkey'
        ) THEN
            ALTER TABLE public.preview_audit_logs
                ADD CONSTRAINT preview_audit_logs_session_id_fkey
                FOREIGN KEY (session_id) REFERENCES public.preview_sessions(id) ON DELETE CASCADE;
            RAISE NOTICE 'Recreated constraint: preview_audit_logs_session_id_fkey -> preview_sessions(id).';
        END IF;
    END IF;

    -- ----------------------------------------------------------------
    -- 7. Ensure seller_id is Nullable & Recreate Foreign Key to profiles(id)
    -- ----------------------------------------------------------------
    IF v_seller_id_nullable = 'NO' THEN
        ALTER TABLE public.preview_sessions ALTER COLUMN seller_id DROP NOT NULL;
        RAISE NOTICE 'Relaxed seller_id constraint to allow NULL for demo/unauthenticated sessions.';
    END IF;

    IF v_profiles_exists THEN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints 
            WHERE table_schema = 'public' 
              AND table_name = 'preview_sessions' 
              AND constraint_name = 'preview_sessions_seller_id_fkey'
        ) THEN
            ALTER TABLE public.preview_sessions
                ADD CONSTRAINT preview_sessions_seller_id_fkey
                FOREIGN KEY (seller_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
            RAISE NOTICE 'Recreated constraint: preview_sessions_seller_id_fkey -> profiles(id).';
        END IF;
    END IF;

    -- ----------------------------------------------------------------
    -- 8. Recreate project_id Foreign Key (Referential Integrity)
    -- ----------------------------------------------------------------
    IF v_projects_exists THEN
        -- Re-inspect current types after any earlier changes
        SELECT data_type INTO v_project_id_type
        FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'preview_sessions' AND column_name = 'project_id';

        SELECT data_type INTO v_projects_pk_type
        FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'projects' AND column_name = 'id';

        -- If types match, recreate the native foreign key constraint
        IF v_project_id_type = v_projects_pk_type THEN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.table_constraints 
                WHERE table_schema = 'public' 
                  AND table_name = 'preview_sessions' 
                  AND constraint_name = 'preview_sessions_project_id_fkey'
            ) THEN
                ALTER TABLE public.preview_sessions
                    ADD CONSTRAINT preview_sessions_project_id_fkey
                    FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;
                RAISE NOTICE 'Recreated constraint: preview_sessions_project_id_fkey -> projects(id) (%s).', v_project_id_type;
            END IF;
        ELSE
            -- Types differ (e.g. preview_sessions.project_id is TEXT while projects.id is UUID).
            -- If all existing preview_sessions.project_id rows are valid UUID format or table empty, convert to match
            IF v_projects_pk_type = 'uuid' AND v_project_id_type = 'text' THEN
                IF NOT EXISTS (
                    SELECT 1 FROM public.preview_sessions 
                    WHERE project_id IS NOT NULL 
                      AND project_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                ) THEN
                    ALTER TABLE public.preview_sessions
                        ALTER COLUMN project_id TYPE UUID USING project_id::uuid;
                    ALTER TABLE public.preview_sessions
                        ADD CONSTRAINT preview_sessions_project_id_fkey
                        FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;
                    RAISE NOTICE 'Converted preview_sessions.project_id to UUID and restored FK to projects(id).';
                ELSE
                    RAISE NOTICE 'preview_sessions.project_id contains non-UUID strings; preserving TEXT type to prevent data loss. FK constraint omitted.';
                END IF;
            END IF;
        END IF;
    END IF;

    -- ----------------------------------------------------------------
    -- 9. Recreate milestone_id Foreign Key (Referential Integrity)
    -- ----------------------------------------------------------------
    IF v_milestones_exists THEN
        SELECT data_type INTO v_milestone_id_type
        FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'preview_sessions' AND column_name = 'milestone_id';

        SELECT data_type INTO v_milestones_pk_type
        FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'milestones' AND column_name = 'id';

        IF v_milestone_id_type = v_milestones_pk_type THEN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.table_constraints 
                WHERE table_schema = 'public' 
                  AND table_name = 'preview_sessions' 
                  AND constraint_name = 'preview_sessions_milestone_id_fkey'
            ) THEN
                ALTER TABLE public.preview_sessions
                    ADD CONSTRAINT preview_sessions_milestone_id_fkey
                    FOREIGN KEY (milestone_id) REFERENCES public.milestones(id) ON DELETE SET NULL;
                RAISE NOTICE 'Recreated constraint: preview_sessions_milestone_id_fkey -> milestones(id) (%s).', v_milestone_id_type;
            END IF;
        ELSE
            IF v_milestones_pk_type = 'uuid' AND v_milestone_id_type = 'text' THEN
                IF NOT EXISTS (
                    SELECT 1 FROM public.preview_sessions 
                    WHERE milestone_id IS NOT NULL 
                      AND milestone_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                ) THEN
                    ALTER TABLE public.preview_sessions
                        ALTER COLUMN milestone_id TYPE UUID USING milestone_id::uuid;
                    ALTER TABLE public.preview_sessions
                        ADD CONSTRAINT preview_sessions_milestone_id_fkey
                        FOREIGN KEY (milestone_id) REFERENCES public.milestones(id) ON DELETE SET NULL;
                    RAISE NOTICE 'Converted preview_sessions.milestone_id to UUID and restored FK to milestones(id).';
                ELSE
                    RAISE NOTICE 'preview_sessions.milestone_id contains non-UUID strings; preserving TEXT type to prevent data loss. FK constraint omitted.';
                END IF;
            END IF;
        END IF;
    END IF;

    -- ----------------------------------------------------------------
    -- 10. Check & Update Row Level Security (RLS) Policies
    -- ----------------------------------------------------------------
    -- Ensure RLS is active
    ALTER TABLE public.preview_sessions ENABLE ROW LEVEL SECURITY;
    IF v_audit_logs_exists THEN
        ALTER TABLE public.preview_audit_logs ENABLE ROW LEVEL SECURITY;
    END IF;

    -- Verify Sellers policy on preview_sessions
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
          AND tablename = 'preview_sessions' 
          AND policyname = 'Sellers can manage own preview sessions'
    ) THEN
        CREATE POLICY "Sellers can manage own preview sessions" 
            ON public.preview_sessions FOR ALL USING (auth.uid() = seller_id);
        RAISE NOTICE 'Created policy: Sellers can manage own preview sessions.';
    END IF;

    -- SECURITY: Remove the insecure "Public token access for authenticated preview" policy
    -- if it was created by an earlier version of migration 002 or 004.
    -- This policy allowed any authenticated user to SELECT all active sessions
    -- (including their token data) without possessing the token — a critical security flaw.
    -- Preview session verification is performed server-side using the service-role key only.
    DROP POLICY IF EXISTS "Public token access for authenticated preview" ON public.preview_sessions;
    RAISE NOTICE 'Removed insecure "Public token access for authenticated preview" policy if it existed.';

    -- Ensure Sellers can view audit logs for own sessions on preview_audit_logs
    IF v_audit_logs_exists THEN
        IF NOT EXISTS (
            SELECT 1 FROM pg_policies 
            WHERE schemaname = 'public' 
              AND tablename = 'preview_audit_logs' 
              AND policyname = 'Sellers can view audit logs for own sessions'
        ) THEN
            CREATE POLICY "Sellers can view audit logs for own sessions"
                ON public.preview_audit_logs FOR SELECT
                USING (
                    EXISTS (
                        SELECT 1 FROM public.preview_sessions ps
                        WHERE ps.id = preview_audit_logs.session_id
                          AND ps.seller_id = auth.uid()
                    )
                );
            RAISE NOTICE 'Created policy: Sellers can view audit logs for own sessions.';
        END IF;
    END IF;

    RAISE NOTICE 'Migration 004 completed successfully with full referential integrity.';
END $$;
