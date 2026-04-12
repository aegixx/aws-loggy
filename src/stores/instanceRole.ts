import { invoke } from "@tauri-apps/api/core";

/**
 * Which role this process holds.
 *
 * - `Primary` — first process launched. Owns persisted workspace state
 *   (localStorage keys like `loggy-groups` and the per-window slice of
 *   settings).
 * - `Secondary` — subsequent processes. Workspace state is in-memory only;
 *   shared UI preferences still come from the on-disk `settings.json`.
 *
 * Role is resolved once at boot via the Rust `get_instance_role` command and
 * never changes for the lifetime of the process.
 */
export type InstanceRole = "Primary" | "Secondary";

let cachedRole: InstanceRole | null = null;

/**
 * Fetch and cache the instance role. Must be called once, before any
 * zustand store that depends on `getInstanceRole()` is created. Safe to call
 * repeatedly.
 *
 * If the Tauri backend is unreachable (e.g., the frontend is running in a
 * browser during development), defaults to `Primary` so the app still works.
 */
export async function initInstanceRole(): Promise<InstanceRole> {
  if (cachedRole !== null) {
    return cachedRole;
  }
  try {
    const role = await invoke<string>("get_instance_role");
    cachedRole = role === "Secondary" ? "Secondary" : "Primary";
  } catch (e) {
    console.warn(
      "instanceRole: could not determine role, defaulting to Primary:",
      e,
    );
    cachedRole = "Primary";
  }
  return cachedRole;
}

/**
 * Synchronously get the cached instance role. Returns `Primary` if
 * `initInstanceRole` has not yet completed — callers that need correct state
 * at store-construction time must await `initInstanceRole()` first.
 */
export function getInstanceRole(): InstanceRole {
  return cachedRole ?? "Primary";
}

/**
 * Is this the primary window?
 */
export function isPrimary(): boolean {
  return getInstanceRole() === "Primary";
}

/**
 * @internal Test helper — forces the cached role. Do not use outside tests.
 */
export function __setInstanceRoleForTests(role: InstanceRole | null): void {
  cachedRole = role;
}
