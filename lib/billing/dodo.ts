import "server-only";

import DodoPayments from "dodopayments";
import { getAppUrl } from "@/lib/supabase/config";
import type { BillingPeriod } from "@/types/app-preferences";

export type DodoEnvironment = "test_mode" | "live_mode";

export interface DodoBillingConfig {
  apiKey: string;
  webhookKey: string;
  environment: DodoEnvironment;
  monthlyProductId: string;
  annualProductId: string | null;
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for Dodo Payments.`);
  return value;
}

export function getDodoBillingConfig(): DodoBillingConfig {
  const environment = required("DODO_PAYMENTS_ENVIRONMENT");
  if (environment !== "test_mode" && environment !== "live_mode") {
    throw new Error("DODO_PAYMENTS_ENVIRONMENT must be test_mode or live_mode.");
  }
  return {
    apiKey: required("DODO_PAYMENTS_API_KEY"),
    webhookKey: required("DODO_PAYMENTS_WEBHOOK_KEY"),
    environment,
    monthlyProductId: required("DODO_PAYMENTS_PRODUCT_ID_MONTHLY"),
    annualProductId: process.env.DODO_PAYMENTS_PRODUCT_ID_ANNUAL?.trim() || null,
  };
}

export function createDodoClient(config = getDodoBillingConfig()): DodoPayments {
  return new DodoPayments({
    bearerToken: config.apiKey,
    webhookKey: config.webhookKey,
    environment: config.environment,
    timeout: 30_000,
    maxRetries: 2,
  });
}

export function dodoProductId(
  billingPeriod: BillingPeriod,
  config = getDodoBillingConfig(),
): string {
  if (billingPeriod === "annual") {
    if (!config.annualProductId) {
      throw new Error("DODO_PAYMENTS_PRODUCT_ID_ANNUAL is not configured.");
    }
    return config.annualProductId;
  }
  return config.monthlyProductId;
}

export function billingPeriodForProduct(
  productId: string,
  config = getDodoBillingConfig(),
): BillingPeriod | null {
  if (productId === config.monthlyProductId) return "monthly";
  if (config.annualProductId && productId === config.annualProductId) return "annual";
  return null;
}

export function billingReturnUrl(kind: "success" | "cancelled" | "portal"): string {
  const configured = process.env.DODO_PAYMENTS_RETURN_URL?.trim();
  if (kind === "success" && configured) {
    const url = new URL(configured);
    if (url.protocol !== "https:" && url.hostname !== "localhost") {
      throw new Error("DODO_PAYMENTS_RETURN_URL must use HTTPS.");
    }
    return url.toString();
  }
  const url = new URL("/subscription", getAppUrl());
  if (kind !== "portal") url.searchParams.set("checkout", kind);
  return url.toString();
}
