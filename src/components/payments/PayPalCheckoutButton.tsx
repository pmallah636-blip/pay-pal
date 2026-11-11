"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, LoaderCircle } from "lucide-react";

type PayPalEligibleMethods = { isEligible: (method: string) => boolean };
type PayPalOrder = { orderId: string };
type PayPalOneTimeSession = {
  start: (options: { presentationMode: "auto" }, order: Promise<PayPalOrder>) => Promise<unknown>;
};
type PayPalSdkInstance = {
  findEligibleMethods: (options: { currencyCode: string }) => Promise<PayPalEligibleMethods>;
  createPayPalOneTimePaymentSession: (handlers: {
    onApprove: (data: { orderId: string }) => Promise<void>;
    onCancel?: (data?: unknown) => void;
    onError?: (error: unknown) => void;
  }) => PayPalOneTimeSession;
};
type PayPalV6Namespace = {
  createInstance: (options: { clientId: string; components: string[]; pageType?: string }) => Promise<PayPalSdkInstance>;
};

declare global {
  interface Window {
    paypal?: PayPalV6Namespace;
  }
}

type Props = {
  invoiceId: string;
  clientId?: string;
  onPaid?: () => void;
};

async function createPayPalOrder(invoiceId: string): Promise<PayPalOrder> {
  const response = await fetch("/api/paypal/create-order", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ invoiceId }),
  });
  const result = (await response.json()) as { orderID?: string; error?: string };
  if (!response.ok || !result.orderID) {
    throw new Error(result.error || "Could not create the PayPal Sandbox order.");
  }
  // SDK v6 requires { orderId }; v5 expected a plain order ID string.
  return { orderId: result.orderID };
}

export function PayPalCheckoutButton({ invoiceId, clientId: propClientId, onPaid }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [clientId, setClientId] = useState<string>(
    propClientId?.trim() || process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID?.trim() || ""
  );
  const [status, setStatus] = useState(
    propClientId || process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID ? "Loading PayPal Sandbox…" : "Checking Sandbox configuration…"
  );
  const [error, setError] = useState<string | null>(null);

  // Fetch client ID from API if not provided in env or props
  useEffect(() => {
    let ignore = false;
    if (!clientId) {
      fetch("/api/paypal/config", { cache: "no-store" })
        .then((res) => res.json())
        .then((data: { clientId?: string }) => {
          if (!ignore) {
            if (data.clientId) {
              setClientId(data.clientId);
              setStatus("Loading PayPal Sandbox…");
            } else {
              setStatus("Sandbox Client ID not configured");
            }
          }
        })
        .catch(() => {
          if (!ignore) setStatus("Sandbox Client ID not configured");
        });
    }
    return () => {
      ignore = true;
    };
  }, [clientId]);

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    let button: HTMLElement | null = null;
    let clickHandler: (() => void) | null = null;
    const container = containerRef.current;

    const initialize = async () => {
      if (cancelled || !window.paypal || !containerRef.current) return;
      try {
        setStatus("Checking PayPal availability…");
        const sdk = await window.paypal.createInstance({
          clientId,
          components: ["paypal-payments"],
          pageType: "checkout",
        });
        const eligibility = await sdk.findEligibleMethods({ currencyCode: "USD" });
        if (cancelled) return;
        if (!eligibility.isEligible("paypal")) {
          setStatus("PayPal is unavailable for this Sandbox account or browser.");
          return;
        }

        const session = sdk.createPayPalOneTimePaymentSession({
          onApprove: async ({ orderId }) => {
            setStatus("Verifying capture with PayPal…");
            setError(null);
            const response = await fetch("/api/paypal/capture-order", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ orderID: orderId }),
            });
            const result = (await response.json()) as {
              verified?: boolean;
              message?: string;
              error?: string;
              captureID?: string;
            };
            if (!response.ok) throw new Error(result.error || "PayPal capture could not be verified.");
            if (!result.verified) throw new Error(result.message || "PayPal has not reported a completed capture.");
            setStatus(`Sandbox capture completed · ${result.captureID ?? "capture confirmed"}`);
            onPaid?.();
          },
          onCancel: () => setStatus("Checkout cancelled. No payment was captured."),
          onError: (reason) => {
            const message = reason instanceof Error ? reason.message : "PayPal Checkout encountered an error.";
            setError(message);
            setStatus("PayPal Checkout needs attention.");
          },
        });

        button = document.createElement("paypal-button");
        button.setAttribute("hidden", "");
        button.setAttribute("aria-label", "Pay with PayPal Sandbox");
        clickHandler = () => {
          setError(null);
          setStatus("Opening PayPal Sandbox checkout…");
          void session.start({ presentationMode: "auto" }, createPayPalOrder(invoiceId)).catch((reason: unknown) => {
            setError(reason instanceof Error ? reason.message : "Could not start PayPal Checkout.");
            setStatus("PayPal Checkout could not start.");
          });
        };
        button.addEventListener("click", clickHandler);
        containerRef.current.replaceChildren(button);
        button.removeAttribute("hidden");
        setStatus("PayPal Sandbox ready");
      } catch (reason) {
        if (cancelled) return;
        setError(reason instanceof Error ? reason.message : "Could not initialize PayPal Checkout.");
        setStatus("PayPal Checkout could not initialize.");
      }
    };

    const loadSdk = () => {
      if (window.paypal) {
        void initialize();
        return;
      }
      const existing = document.querySelector<HTMLScriptElement>("script[data-paymind-paypal-sdk='v6']");
      if (existing) {
        existing.addEventListener("load", () => void initialize(), { once: true });
        existing.addEventListener("error", () => setError("PayPal SDK v6 could not be loaded."), { once: true });
        return;
      }
      const script = document.createElement("script");
      script.src = "https://www.sandbox.paypal.com/web-sdk/v6/core";
      script.async = true;
      script.dataset.paymindPaypalSdk = "v6";
      script.onload = () => void initialize();
      script.onerror = () => setError("PayPal SDK v6 failed to load. Check your internet connection and Sandbox Client ID.");
      document.head.appendChild(script);
    };

    loadSdk();

    return () => {
      cancelled = true;
      if (button && clickHandler) button.removeEventListener("click", clickHandler);
      if (container) container.replaceChildren();
    };
  }, [clientId, invoiceId, onPaid]);

  return (
    <div className="min-w-[190px] max-w-[240px] space-y-1.5">
      {clientId ? (
        <div ref={containerRef} className="min-h-10" />
      ) : (
        <p className="text-xs text-slate-500">Configure Sandbox Client ID to enable checkout.</p>
      )}
      {error ? (
        <p role="alert" className="flex items-start gap-1 text-[11px] text-rose-700">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      ) : status.startsWith("Sandbox capture completed") ? (
        <p className="flex items-start gap-1 text-[11px] text-emerald-700">
          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {status}
        </p>
      ) : status.includes("ready") ? (
        <p className="flex items-center gap-1 text-[11px] text-emerald-700">
          <CheckCircle2 className="h-3 w-3" />
          {status}
        </p>
      ) : (
        <p className="flex items-center gap-1 text-[11px] text-slate-500">
          <LoaderCircle className="h-3 w-3 animate-spin" />
          {status}
        </p>
      )}
    </div>
  );
}
