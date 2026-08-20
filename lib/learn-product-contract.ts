import type { SupabaseClient } from "@supabase/supabase-js";

export const LEARN_PRODUCT_CONTRACT_VERSION = "20260820023100";

function isMissingContractRpc(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const message = error.message ?? "";
  return (
    (error.code === "PGRST202" || error.code === "42883") &&
    message.includes("learn_product_contract_version")
  );
}

/**
 * Returns false only when the activation RPC genuinely does not exist yet.
 * Any other database error is surfaced so callers can fail closed rather than
 * accidentally opening protected Translation practice.
 */
export async function learnProductContractIsActive(
  client: SupabaseClient,
): Promise<boolean> {
  const { data, error } = await client.rpc("learn_product_contract_version");
  if (error) {
    if (isMissingContractRpc(error)) return false;
    throw error;
  }
  return data === LEARN_PRODUCT_CONTRACT_VERSION;
}
