-- PayMind Migration 003: authenticated payment ownership and durable PayPal records.
-- Apply after 001_initial_schema.sql and 002_preview_and_demonstration.sql.

-- Normalize saved contact emails so confirmed client accounts can be matched case-insensitively.
UPDATE public.clients SET email = lower(btrim(email)) WHERE email IS DISTINCT FROM lower(btrim(email));
CREATE INDEX IF NOT EXISTS idx_paymind_clients_email ON public.clients (email);

-- Keep the account profile in sync with Supabase Auth sign-ups.
CREATE OR REPLACE FUNCTION public.handle_paymind_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  profile_role text;
BEGIN
  profile_role := COALESCE(NEW.raw_user_meta_data->>'role', 'freelancer');
  IF profile_role NOT IN ('freelancer', 'client') THEN
    profile_role := 'freelancer';
  END IF;

  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    lower(COALESCE(NEW.email, '')), 
    NULLIF(NEW.raw_user_meta_data->>'full_name', ''),
    profile_role
  )
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        full_name = COALESCE(public.profiles.full_name, EXCLUDED.full_name);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_paymind ON auth.users;
CREATE TRIGGER on_auth_user_created_paymind
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_paymind_new_user();

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Authenticated sellers can read/update invoices and milestones belonging to their own projects.
DROP POLICY IF EXISTS "Sellers can read own invoices" ON public.invoices;
CREATE POLICY "Sellers can read own invoices" ON public.invoices
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = invoices.project_id AND p.freelancer_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Sellers can update own invoices" ON public.invoices;
CREATE POLICY "Sellers can update own invoices" ON public.invoices
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = invoices.project_id AND p.freelancer_id = auth.uid()
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = invoices.project_id AND p.freelancer_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Sellers can read own milestones" ON public.milestones;
CREATE POLICY "Sellers can read own milestones" ON public.milestones
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = milestones.project_id AND p.freelancer_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Sellers can update own milestones" ON public.milestones;
CREATE POLICY "Sellers can update own milestones" ON public.milestones
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = milestones.project_id AND p.freelancer_id = auth.uid()
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = milestones.project_id AND p.freelancer_id = auth.uid()
    )
  );

ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_status_check;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_status_check
  CHECK (status IN ('draft', 'sent', 'paid', 'overdue', 'cancelled', 'refunded'));

ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS paypal_order_id text;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS paypal_capture_id text;
ALTER TABLE public.milestones ADD COLUMN IF NOT EXISTS paypal_order_id text;
ALTER TABLE public.milestones ADD COLUMN IF NOT EXISTS paypal_capture_id text;

-- A separate durable transaction ledger supports both the seeded local demo invoices
-- (string IDs) and real UUID invoice IDs. The service-role key is server-only.
CREATE TABLE IF NOT EXISTS public.paypal_payment_records (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  invoice_id text NOT NULL,
  milestone_id text,
  invoice_number text NOT NULL,
  order_id text NOT NULL UNIQUE,
  capture_id text UNIQUE,
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  currency varchar(3) NOT NULL,
  status text NOT NULL DEFAULT 'CREATED',
  order_status text,
  capture_status text,
  payer_email text,
  raw_capture jsonb,
  last_event_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_paypal_payment_records_owner ON public.paypal_payment_records(owner_id);
CREATE INDEX IF NOT EXISTS idx_paypal_payment_records_invoice ON public.paypal_payment_records(invoice_id);
CREATE INDEX IF NOT EXISTS idx_paypal_payment_records_capture ON public.paypal_payment_records(capture_id);

ALTER TABLE public.paypal_payment_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own PayPal payment records" ON public.paypal_payment_records;
CREATE POLICY "Users can view own PayPal payment records" ON public.paypal_payment_records
  FOR SELECT USING (auth.uid() = owner_id);
DROP POLICY IF EXISTS "Users can insert own PayPal payment records" ON public.paypal_payment_records;
CREATE POLICY "Users can insert own PayPal payment records" ON public.paypal_payment_records
  FOR INSERT WITH CHECK (
    auth.uid() = owner_id AND EXISTS (
      SELECT 1 FROM public.invoices i
      JOIN public.projects p ON p.id = i.project_id
      WHERE i.id::text = paypal_payment_records.invoice_id
        AND p.freelancer_id = auth.uid()
    )
  );
DROP POLICY IF EXISTS "Users can update own PayPal payment records" ON public.paypal_payment_records;
CREATE POLICY "Users can update own PayPal payment records" ON public.paypal_payment_records
  FOR UPDATE USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

-- Webhooks are written only by the server using SUPABASE_SERVICE_ROLE_KEY.
ALTER TABLE public.paypal_webhook_events ENABLE ROW LEVEL SECURITY;
-- Deliberately no client-facing policies are added to paypal_webhook_events.

COMMENT ON TABLE public.paypal_payment_records IS 'Server-verified PayPal Sandbox order and capture ledger. Do not write from browser code.';
COMMENT ON TABLE public.paypal_webhook_events IS 'Webhook events persisted only after PayPal transmission signature verification.';
