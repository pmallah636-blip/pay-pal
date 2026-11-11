const PAYPAL_API_BASE = "https://api-m.sandbox.paypal.com";

type PayPalTokenResponse = {
  access_token?: string;
  error_description?: string;
};

export function isPayPalSandboxConfigured() {
  return Boolean(
    (process.env.PAYPAL_CLIENT_ID || process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID)?.trim() &&
    process.env.PAYPAL_CLIENT_SECRET?.trim()
  );
}

export async function getPayPalAccessToken() {
  const clientId = (process.env.PAYPAL_CLIENT_ID || process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID)?.trim();
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) throw new Error("PayPal Sandbox credentials are not configured.");

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const response = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${credentials}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => ({}))) as PayPalTokenResponse;
  if (!response.ok || !payload.access_token) {
    throw new Error("PayPal could not issue a Sandbox access token. Check the rotated app credentials.");
  }
  return payload.access_token;
}

export async function paypalRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const accessToken = await getPayPalAccessToken();
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${accessToken}`);
  headers.set("Content-Type", "application/json");
  headers.set("Accept", "application/json");
  const response = await fetch(`${PAYPAL_API_BASE}${path}`, { ...init, headers, cache: "no-store" });
  const payload = (await response.json().catch(() => ({}))) as T & {
    message?: string;
    name?: string;
    details?: Array<{ issue?: string; description?: string }>;
  };
  if (!response.ok) {
    const issue = payload.details?.[0]?.issue;
    throw new Error(issue || payload.message || payload.name || `PayPal request failed (${response.status}).`);
  }
  return payload;
}

export const PAYPAL_SANDBOX_API_BASE = PAYPAL_API_BASE;
