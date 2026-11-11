-- ====================================================================
-- PayMind Master Database Migration (PostgreSQL / Supabase)
-- Version: 1.0 (Initial Schema)
-- ====================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. PROFILES (Freelancer / Client metadata)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL UNIQUE,
    full_name TEXT,
    role TEXT NOT NULL DEFAULT 'freelancer' CHECK (role IN ('freelancer', 'client', 'admin')),
    country TEXT NOT NULL DEFAULT 'IN',
    business_name TEXT,
    gstin TEXT,
    has_lut BOOLEAN NOT NULL DEFAULT TRUE, -- Letter of Undertaking for 0% GST export
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. CLIENT CONTACTS & BASIC PROJECT HISTORY
CREATE TABLE IF NOT EXISTS public.clients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    freelancer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    company TEXT,
    email TEXT NOT NULL,
    country TEXT NOT NULL DEFAULT 'US',
    total_projects_count INT NOT NULL DEFAULT 0,
    completed_projects_count INT NOT NULL DEFAULT 0,
    dispute_count INT NOT NULL DEFAULT 0,
    average_payment_delay_days NUMERIC(4,1) NOT NULL DEFAULT 0.0,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. PROJECTS
CREATE TABLE IF NOT EXISTS public.projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    freelancer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
    client_name TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    total_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'contract_review', 'active', 'in_review', 'completed', 'disputed', 'cancelled')),
    contract_raw_text TEXT,
    protection_level TEXT NOT NULL DEFAULT 'unreviewed' CHECK (protection_level IN ('high', 'balanced', 'risky', 'unreviewed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. MILESTONES & DELIVERABLE STAGES
CREATE TABLE IF NOT EXISTS public.milestones (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    amount NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    order_index INT NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'under_client_review', 'approved', 'paid', 'disputed')),
    due_date DATE,
    acceptance_criteria JSONB NOT NULL DEFAULT '[]'::jsonb,
    paypal_order_id TEXT,
    paypal_capture_id TEXT,
    paypal_status TEXT DEFAULT 'NOT_CREATED',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_milestones_project_id ON public.milestones(project_id);
CREATE INDEX IF NOT EXISTS idx_milestones_paypal_order_id ON public.milestones(paypal_order_id);

-- 6. INVOICES
CREATE TABLE IF NOT EXISTS public.invoices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    milestone_id UUID REFERENCES public.milestones(id) ON DELETE SET NULL,
    invoice_number TEXT NOT NULL UNIQUE,
    amount NUMERIC(12,2) NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'paid', 'overdue', 'cancelled')),
    paypal_invoice_id TEXT,
    due_date DATE NOT NULL,
    paid_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. PAYPAL WEBHOOK EVENT LOGS (Idempotent tracking)
CREATE TABLE IF NOT EXISTS public.paypal_webhook_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id TEXT NOT NULL UNIQUE,
    event_type TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    summary TEXT,
    payload JSONB NOT NULL,
    verified BOOLEAN NOT NULL DEFAULT FALSE,
    processed BOOLEAN NOT NULL DEFAULT FALSE,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_paypal_webhook_event_id ON public.paypal_webhook_events(event_id);

-- 8. CONTRACT ANALYSES (AI Extraction)
CREATE TABLE IF NOT EXISTS public.contract_analyses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    raw_text TEXT NOT NULL,
    scope_deliverables JSONB NOT NULL DEFAULT '[]'::jsonb,
    extracted_amount NUMERIC(12,2),
    currency VARCHAR(3),
    deadlines JSONB DEFAULT '[]'::jsonb,
    missing_clauses JSONB DEFAULT '[]'::jsonb,
    unbalanced_risks JSONB DEFAULT '[]'::jsonb,
    readiness_score INT NOT NULL DEFAULT 50,
    suggested_safeguards JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. DIGITAL DELIVERABLES & PREVIEWS
CREATE TABLE IF NOT EXISTS public.deliverables (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    milestone_id UUID REFERENCES public.milestones(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    file_type TEXT NOT NULL, -- e.g. web_app, zip, pdf, design
    storage_path TEXT NOT NULL,
    file_size_bytes BIGINT NOT NULL,
    sha256_hash VARCHAR(64) NOT NULL,
    preview_type TEXT NOT NULL DEFAULT 'sandbox_iframe', -- sandbox_iframe, document_viewer, raw_download
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 11. AI DELIVERY PASSPORT
CREATE TABLE IF NOT EXISTS public.delivery_passports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    milestone_id UUID NOT NULL REFERENCES public.milestones(id) ON DELETE CASCADE,
    product_name TEXT NOT NULL,
    version TEXT NOT NULL DEFAULT 'v1.0.0',
    file_name TEXT NOT NULL,
    file_size_bytes BIGINT NOT NULL,
    sha256_hash VARCHAR(64) NOT NULL,
    checks JSONB NOT NULL DEFAULT '[]'::jsonb,
    all_passed BOOLEAN NOT NULL DEFAULT FALSE,
    client_review_status TEXT NOT NULL DEFAULT 'pending_review' CHECK (client_review_status IN ('pending_review', 'changes_requested', 'accepted')),
    client_feedback TEXT,
    handover_completed BOOLEAN NOT NULL DEFAULT FALSE,
    handover_timestamp TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 12. AUDIT LOGS
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 13. ENABLE ROW LEVEL SECURITY
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deliverables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_passports ENABLE ROW LEVEL SECURITY;

-- 14. BASIC RLS POLICIES (Users access their own records)
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can manage own clients" ON public.clients FOR ALL USING (auth.uid() = freelancer_id);
CREATE POLICY "Users can manage own projects" ON public.projects FOR ALL USING (auth.uid() = freelancer_id);
