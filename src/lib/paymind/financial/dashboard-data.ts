import type { AgDataSourcesDefinition } from "ag-studio";
import {
  buildFinancialDashboardRows as buildRows,
  summarizeFinancialRows as summarizeRows,
  toAgStudioFinancialData as toAgData,
} from "./dashboard-data-core.mjs";

export type FinancialDataSource = "supabase" | "seeded_demo";

export type FinancialDashboardRow = {
  record_id: string;
  project_name: string;
  client_name: string;
  invoice_number: string;
  currency: string;
  amount: number;
  due_date: string;
  paid_at: string | null;
  invoice_status: string;
  payment_status: string;
  verification_state: string;
  capture_id: string | null;
  order_id: string | null;
  is_verified_capture: boolean;
  data_source: FinancialDataSource;
};

export type FinancialSummary = ReturnType<typeof summarizeFinancialRows>;

export const buildFinancialDashboardRows = buildRows as (input: {
  invoices: Array<{
    id: string;
    project_id?: string;
    invoice_number: string;
    amount: number | string;
    currency: string;
    status: string;
    due_date: string;
    paid_at?: string | null;
  }>;
  payments?: Array<{
    invoice_id: string;
    order_id?: string | null;
    capture_id?: string | null;
    status?: string | null;
    capture_status?: string | null;
    amount?: number | string | null;
    currency?: string | null;
  }>;
  projects?: Array<{ id: string; title: string; client_name: string }>;
  dataSource: FinancialDataSource;
}) => FinancialDashboardRow[];

export const summarizeFinancialRows = summarizeRows as (rows: FinancialDashboardRow[]) => {
  total_records: number;
  verified_capture_count: number;
  pending_count: number;
  total_amount_by_currency: Record<string, number>;
  verified_amount_by_currency: Record<string, number>;
  data_sources: FinancialDataSource[];
};

export const toAgStudioFinancialData = toAgData as (
  rows: FinancialDashboardRow[],
) => AgDataSourcesDefinition;
