-- ====================================================================
-- PayMind Migration 002: Secure Client Preview & Mutual Demonstration
-- ====================================================================
-- NOTE: This file is the FRESH INSTALL baseline only.
-- For already-applied databases, run migration 005 to:
--   - Remove the insecure "Public token access for authenticated preview" policy
--   - Replace session_token with token_hash (SHA-256 of the raw token)
-- ====================================================================

-- 1. PREVIEW SESSIONS
CREATE TABLE IF NOT EXISTS public.preview_sessions (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    milestone_id UUID REFERENCES public.milestones(id) ON DELETE SET NULL,
    seller_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    client_name TEXT NOT NULL,
    client_email TEXT NOT NULL,
    -- Store SHA-256 hash of the token; raw token returned once at creation only
    token_hash TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'revoked', 'completed')),
    allowed_parts JSONB NOT NULL DEFAULT '{"interactive_preview": true, "documentation": true, "source_inspection_requestable": false}'::jsonb,
    watermark_text TEXT NOT NULL,
    preview_content JSONB NOT NULL,
    source_inspection JSONB NOT NULL DEFAULT '{"enabled": false, "seller_authorized": false, "client_accepted_terms": false}'::jsonb,
    demonstration JSONB NOT NULL DEFAULT '{"seller_confirmed": false, "client_confirmed": false, "requirements": []}'::jsonb,
    access_count INT NOT NULL DEFAULT 0,
    last_accessed_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_preview_sessions_token_hash ON public.preview_sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_preview_sessions_project ON public.preview_sessions(project_id);
CREATE INDEX IF NOT EXISTS idx_preview_sessions_seller ON public.preview_sessions(seller_id);

-- 2. PREVIEW AUDIT LOGS
CREATE TABLE IF NOT EXISTS public.preview_audit_logs (
    id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    session_id TEXT NOT NULL REFERENCES public.preview_sessions(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    actor TEXT NOT NULL CHECK (actor IN ('seller', 'client', 'system')),
    actor_name TEXT NOT NULL,
    details TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_preview_audit_logs_session ON public.preview_audit_logs(session_id);

-- 3. RLS POLICIES
-- SECURITY: The service-role key bypasses RLS for server-side verification.
-- No anonymous or unauthenticated user should be able to SELECT preview sessions directly.
-- Token verification is performed server-side before any session data is returned.
ALTER TABLE public.preview_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.preview_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Sellers can manage own preview sessions" ON public.preview_sessions;
CREATE POLICY "Sellers can manage own preview sessions"
    ON public.preview_sessions FOR ALL USING (auth.uid() = seller_id);

-- NOTE: The insecure "Public token access for authenticated preview" policy
-- has been INTENTIONALLY REMOVED. It allowed any authenticated user to SELECT
-- all active sessions including their token hashes, bypassing all application auth.
-- Preview session verification is performed server-side using the service-role key only.

DROP POLICY IF EXISTS "Sellers can view audit logs for own sessions" ON public.preview_audit_logs;
CREATE POLICY "Sellers can view audit logs for own sessions"
    ON public.preview_audit_logs FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.preview_sessions ps
            WHERE ps.id = preview_audit_logs.session_id
              AND ps.seller_id = auth.uid()
        )
    );
