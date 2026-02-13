import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import { getDemoMode } from "./demoStore";
import { MOCK_LOG_GROUPS, generateMockLogs } from "./mockData";

const DEMO_AWS_INFO = { profile: "demo", region: "us-east-1" };

function handleDemoCommand<T>(
  cmd: string,
  args?: Record<string, unknown>,
): T | Promise<T> {
  if (cmd === "init_aws_client" || cmd === "reconnect_aws") {
    return DEMO_AWS_INFO as T;
  } else if (cmd === "list_log_groups") {
    return MOCK_LOG_GROUPS as T;
  } else if (cmd === "list_aws_profiles") {
    return ["demo"] as T;
  } else if (cmd === "fetch_logs") {
    const logGroupName = (args?.logGroupName as string) ?? "";
    const startTime = args?.startTime as number | undefined;
    const endTime = args?.endTime as number | undefined;
    return generateMockLogs(logGroupName, startTime, endTime) as T;
  } else if (
    cmd === "cancel_fetch" ||
    cmd === "start_live_tail" ||
    cmd === "stop_live_tail"
  ) {
    return undefined as T;
  } else {
    // Pass through for commands that still need the real backend (e.g., sync_theme_menu)
    return tauriInvoke<T>(cmd, args);
  }
}

/**
 * Drop-in replacement for `@tauri-apps/api/core` invoke.
 * When demo mode is active, returns mock data instead of calling Rust.
 */
export async function invoke<T>(
  cmd: string,
  args?: Record<string, unknown>,
): Promise<T> {
  if (getDemoMode()) {
    return handleDemoCommand<T>(cmd, args);
  }
  return tauriInvoke<T>(cmd, args);
}
