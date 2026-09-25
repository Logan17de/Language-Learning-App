type RpcErrorLike = {
  code?: string;
  message?: string;
};

export type PhaseAtomicRpcName =
  | "commit_lesson_phase"
  | "reset_incomplete_lesson_phase";

/**
 * The legacy fallback is allowed only when the requested phase-atomic RPC itself
 * is absent. An error inside an existing RPC must remain a hard failure.
 */
export function isMissingPhaseAtomicRpc(
  error: unknown,
  rpcName: PhaseAtomicRpcName,
): boolean {
  if (!error || typeof error !== "object") return false;
  const value = error as RpcErrorLike;
  const message = value.message ?? "";

  if (value.code === "PGRST202") {
    return message === "" || message.includes(rpcName);
  }

  if (value.code === "42883") {
    return message.includes(rpcName);
  }

  return (
    message.includes(rpcName) &&
    (message.includes("Could not find the function") ||
      message.includes("does not exist"))
  );
}
