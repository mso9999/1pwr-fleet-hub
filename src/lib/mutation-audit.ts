import type { MutationActor } from "./record-mutation-log";

/**
 * Prefer the signed-in Firebase user; otherwise fall back to IDs/names supplied in the
 * request body (inspector, driver, reporter, etc.) so unauthenticated legacy paths still
 * record a non-empty actor in `record_mutation_log`.
 */
export function auditActorFrom(
  user:
    | { id: string; name?: string; email?: string; role?: string; department?: string }
    | null
    | undefined,
  fallback: { id?: string; name?: string } = {}
): MutationActor {
  if (user?.id) {
    return {
      id: user.id,
      name: user.name || user.email || "",
      role: user.role || "",
      department: user.department || "",
    };
  }
  return {
    id: fallback.id || "",
    name: (fallback.name || "").trim() || "unknown",
    role: "",
    department: "",
  };
}
