# Live Tail Streaming + Follow Mode Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace polling-based live tail with CloudWatch `StartLiveTail` streaming API (polling fallback), and add explicit follow mode with "Jump to latest" button and transport indicator.

**Architecture:** Three-layer design: `LiveTailManager` orchestrates transport selection between `StreamTransport` (Rust `StartLiveTail` via Tauri events) and `PollTransport` (existing `TailPoller`). Sampling detection (500 events/update) triggers fallback to polling from last clean timestamp. Follow mode is formalized as store state with floating UI button.

**Tech Stack:** Tauri 2.x, Rust AWS SDK (`aws-sdk-cloudwatchlogs` v1.111.0 — `StartLiveTail`), React 19, TypeScript, Zustand, react-window v2, Tailwind CSS v4

---

## Task 1: Rust Backend — `start_live_tail` and `stop_live_tail` Commands

**Files:**

- Modify: `src-tauri/src/lib.rs` (AppState struct ~line 52, new commands, invoke_handler ~line 1353)

**Step 1: Add `JoinHandle` to `AppState`**

Add a field to hold the spawned live tail task so it can be cancelled:

```rust
// In AppState struct (after fetch_cancelled field, ~line 55)
pub live_tail_handle: Arc<Mutex<Option<tokio::task::JoinHandle<()>>>>,
```

Update `Default` impl (~line 84):

```rust
live_tail_handle: Arc::new(Mutex::new(None)),
```

**Step 2: Add event payload structs**

Add after the existing `LogsTruncated` struct:

```rust
/// Payload for live-tail-event
#[derive(Debug, Clone, Serialize)]
struct LiveTailEventPayload {
    logs: Vec<LogEvent>,
    count: usize,
}

/// Payload for live-tail-error
#[derive(Debug, Clone, Serialize)]
struct LiveTailErrorPayload {
    message: String,
}
```

**Step 3: Add `start_live_tail` command**

Add before the `pub fn run()` function:

```rust
#[tauri::command]
async fn start_live_tail(
    log_group_name: String,
    filter_pattern: Option<String>,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    // Stop any existing live tail first
    let mut handle_lock = state.live_tail_handle.lock().await;
    if let Some(handle) = handle_lock.take() {
        handle.abort();
    }

    let client_lock = state.client.lock().await;
    let client = client_lock.as_ref().ok_or("AWS client not initialized")?.clone();
    drop(client_lock);

    let live_tail_handle = state.live_tail_handle.clone();

    let handle = tokio::spawn(async move {
        let mut request = client.start_live_tail()
            .log_group_identifiers(&log_group_name);

        if let Some(ref pattern) = filter_pattern {
            if !pattern.is_empty() {
                request = request.log_event_filter_pattern(pattern);
            }
        }

        match request.send().await {
            Ok(output) => {
                let mut stream = output.response_stream;
                loop {
                    match stream.recv().await {
                        Ok(Some(event)) => {
                            match event {
                                aws_sdk_cloudwatchlogs::types::StartLiveTailResponseStream::SessionUpdate(update) => {
                                    let results = update.session_results.unwrap_or_default();
                                    let count = results.len();
                                    let logs: Vec<LogEvent> = results.into_iter().map(|e| LogEvent {
                                        timestamp: e.timestamp.unwrap_or(0),
                                        message: e.message.unwrap_or_default(),
                                        log_stream_name: e.log_stream_name,
                                        event_id: None,
                                    }).collect();

                                    if !logs.is_empty() {
                                        app.emit("live-tail-event", LiveTailEventPayload { logs, count }).ok();
                                    }
                                }
                                aws_sdk_cloudwatchlogs::types::StartLiveTailResponseStream::SessionStart(_) => {
                                    log::info!("Live tail session started for {}", log_group_name);
                                }
                                _ => {}
                            }
                        }
                        Ok(None) => {
                            // Stream ended (3-hour timeout)
                            log::info!("Live tail stream ended for {}", log_group_name);
                            app.emit("live-tail-ended", serde_json::json!({})).ok();
                            break;
                        }
                        Err(e) => {
                            let error_msg = format!("{}", e);
                            log::error!("Live tail stream error: {}", error_msg);
                            app.emit("live-tail-error", LiveTailErrorPayload { message: error_msg }).ok();
                            break;
                        }
                    }
                }
            }
            Err(e) => {
                let error_msg = format!("{}", e);
                log::error!("Failed to start live tail: {}", error_msg);
                app.emit("live-tail-error", LiveTailErrorPayload { message: error_msg }).ok();
            }
        }

        // Clear handle when done
        let mut handle_lock = live_tail_handle.lock().await;
        *handle_lock = None;
    });

    *handle_lock = Some(handle);
    Ok(())
}

#[tauri::command]
async fn stop_live_tail(state: State<'_, AppState>) -> Result<(), String> {
    let mut handle_lock = state.live_tail_handle.lock().await;
    if let Some(handle) = handle_lock.take() {
        handle.abort();
        log::info!("Live tail stopped");
    }
    Ok(())
}
```

**Step 4: Register commands in invoke_handler**

Add `start_live_tail` and `stop_live_tail` to the `generate_handler!` macro (~line 1353):

```rust
.invoke_handler(tauri::generate_handler![
    init_aws_client,
    reconnect_aws,
    list_aws_profiles,
    trigger_sso_login,
    open_sso_url,
    get_app_version,
    list_log_groups,
    fetch_logs,
    fetch_logs_paginated,
    cancel_fetch,
    sync_theme_menu,
    start_live_tail,
    stop_live_tail,
])
```

**Step 5: Build and verify Rust compiles**

Run: `cd src-tauri && cargo check 2>&1 | tail -5`
Expected: Successful compilation with no errors.

**Step 6: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "feat: add start_live_tail and stop_live_tail Rust commands

Add CloudWatch StartLiveTail streaming support to the Tauri backend:
- start_live_tail spawns tokio task reading event stream
- Emits live-tail-event, live-tail-error, live-tail-ended to frontend
- stop_live_tail aborts the spawned task
- JoinHandle stored in AppState for lifecycle management"
```

---

## Task 2: Frontend Types — Event Payloads

**Files:**

- Modify: `src/types/index.ts`

**Step 1: Add event payload types**

Append to `src/types/index.ts`:

```typescript
export interface LiveTailEventPayload {
  logs: LogEvent[];
  count: number;
}

export interface LiveTailErrorPayload {
  message: string;
}
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | tail -5`
Expected: No errors.

**Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "feat: add LiveTailEventPayload and LiveTailErrorPayload types"
```

---

## Task 3: Transport Interface and TailPoller Refactor

**Files:**

- Create: `src/stores/TailTransport.ts`
- Modify: `src/stores/TailPoller.ts`

**Step 1: Create transport interface**

Create `src/stores/TailTransport.ts`:

```typescript
export interface TailTransport {
  start(): void;
  stop(): void;
  isActive(): boolean;
  resetStartTimestamp(): void;
}
```

**Step 2: Implement interface on TailPoller**

In `src/stores/TailPoller.ts`, add the import and `implements` clause:

```typescript
import type { TailTransport } from "./TailTransport";
```

Change class declaration:

```typescript
export class TailPoller implements TailTransport {
```

No other changes needed — `TailPoller` already has `start()`, `stop()`, `isActive()`, and `resetStartTimestamp()`.

**Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | tail -5`
Expected: No errors.

**Step 4: Commit**

```bash
git add src/stores/TailTransport.ts src/stores/TailPoller.ts
git commit -m "refactor: extract TailTransport interface, implement on TailPoller"
```

---

## Task 4: LiveTailManager — Transport Orchestrator

**Files:**

- Create: `src/stores/LiveTailManager.ts`

**Step 1: Create LiveTailManager**

Create `src/stores/LiveTailManager.ts`:

```typescript
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { TailPoller } from "./TailPoller";
import type { TailTransport } from "./TailTransport";
import type {
  LogEvent,
  LiveTailEventPayload,
  LiveTailErrorPayload,
} from "../types";

export type TransportType = "stream" | "poll";

const SAMPLING_THRESHOLD = 500;

export class LiveTailManager {
  private transport: TailTransport | null = null;
  private transportType: TransportType | null = null;
  private lastCleanTimestamp: number | null = null;
  private unlisteners: UnlistenFn[] = [];
  private logGroupName: string;
  private onNewLogs: (logs: LogEvent[]) => void;
  private onError: (error: unknown) => void;
  private onTransportChange: (type: TransportType) => void;
  private onToast: (message: string) => void;
  private getLastLogTimestamp: () => number | null;

  constructor(options: {
    logGroupName: string;
    onNewLogs: (logs: LogEvent[]) => void;
    onError: (error: unknown) => void;
    onTransportChange: (type: TransportType) => void;
    onToast: (message: string) => void;
    getLastLogTimestamp: () => number | null;
  }) {
    this.logGroupName = options.logGroupName;
    this.onNewLogs = options.onNewLogs;
    this.onError = options.onError;
    this.onTransportChange = options.onTransportChange;
    this.onToast = options.onToast;
    this.getLastLogTimestamp = options.getLastLogTimestamp;
  }

  async start(): Promise<void> {
    // Try streaming first, fall back to polling
    try {
      await this.startStream();
    } catch {
      console.log(
        "[LiveTailManager] Streaming unavailable, falling back to polling",
      );
      this.startPolling(null);
    }
  }

  stop(): void {
    if (this.transportType === "stream") {
      invoke("stop_live_tail").catch((e) =>
        console.debug("[LiveTailManager] stop_live_tail:", e),
      );
    }
    if (this.transport) {
      this.transport.stop();
    }
    this.cleanup();
  }

  isActive(): boolean {
    return this.transport?.isActive() ?? false;
  }

  getTransportType(): TransportType | null {
    return this.transportType;
  }

  resetStartTimestamp(): void {
    this.transport?.resetStartTimestamp();
  }

  private async startStream(): Promise<void> {
    // Set up event listeners before starting the stream
    const unlistenEvent = await listen<LiveTailEventPayload>(
      "live-tail-event",
      (event) => {
        const { logs, count } = event.payload;

        // Sampling detection: if we receive exactly 500 events, sampling is likely
        if (count >= SAMPLING_THRESHOLD) {
          console.log(
            "[LiveTailManager] Sampling detected (count:",
            count,
            "), switching to polling",
          );
          this.switchToPolling();
          return;
        }

        // Track last clean timestamp for sampling fallback
        if (logs.length > 0) {
          this.lastCleanTimestamp = Math.max(...logs.map((l) => l.timestamp));
        }

        if (logs.length > 0) {
          this.onNewLogs(logs);
        }
      },
    );

    const unlistenError = await listen<LiveTailErrorPayload>(
      "live-tail-error",
      (event) => {
        console.error("[LiveTailManager] Stream error:", event.payload.message);
        this.handleStreamError(event.payload.message);
      },
    );

    const unlistenEnded = await listen<Record<string, never>>(
      "live-tail-ended",
      () => {
        console.log("[LiveTailManager] Stream ended (timeout), reconnecting");
        this.handleStreamEnded();
      },
    );

    this.unlisteners = [unlistenEvent, unlistenError, unlistenEnded];

    // Start the stream on the backend
    await invoke("start_live_tail", {
      logGroupName: this.logGroupName,
      filterPattern: null,
    });

    // Create a minimal transport wrapper for stream (start/stop/isActive/resetStartTimestamp)
    this.transport = {
      start: () => {},
      stop: () => {},
      isActive: () => true,
      resetStartTimestamp: () => {},
    };
    this.transportType = "stream";
    this.onTransportChange("stream");
  }

  private startPolling(fromTimestamp: number | null): void {
    // Clean up any existing stream listeners
    this.cleanupListeners();

    const getTimestamp = fromTimestamp
      ? (() => {
          let used = false;
          return () => {
            if (!used) {
              used = true;
              return fromTimestamp;
            }
            return this.getLastLogTimestamp();
          };
        })()
      : this.getLastLogTimestamp;

    const poller = new TailPoller(
      this.logGroupName,
      this.onNewLogs,
      this.onError,
      getTimestamp,
    );
    poller.start();

    this.transport = poller;
    this.transportType = "poll";
    this.onTransportChange("poll");
  }

  private async switchToPolling(): Promise<void> {
    // Stop the stream
    invoke("stop_live_tail").catch((e) =>
      console.debug("[LiveTailManager] stop_live_tail:", e),
    );

    // Start polling from last clean timestamp to backfill sampled gaps
    const replayFrom = this.lastCleanTimestamp
      ? this.lastCleanTimestamp + 1
      : null;

    this.startPolling(replayFrom);
    this.onToast(
      "High log volume \u2014 switched to polling for complete results",
    );
  }

  private async handleStreamError(message: string): Promise<void> {
    // Check if SSO expired
    const isSsoError =
      message.toLowerCase().includes("expired") ||
      message.toLowerCase().includes("sso") ||
      message.toLowerCase().includes("token");

    if (isSsoError) {
      // Let the existing SSO refresh flow handle it
      this.onError(new Error(message));
      this.stop();
      return;
    }

    // Try to reconnect streaming
    try {
      this.cleanupListeners();
      await this.startStream();
      this.onToast("Live stream reconnected");
    } catch {
      // Fall back to polling
      console.log(
        "[LiveTailManager] Reconnect failed, falling back to polling",
      );
      this.startPolling(null);
      this.onToast("Stream unavailable \u2014 using polling");
    }
  }

  private async handleStreamEnded(): Promise<void> {
    // 3-hour timeout — auto-reconnect
    try {
      this.cleanupListeners();
      await this.startStream();
      this.onToast("Live stream reconnected");
    } catch {
      this.startPolling(null);
      this.onToast("Stream unavailable \u2014 using polling");
    }
  }

  private cleanupListeners(): void {
    for (const unlisten of this.unlisteners) {
      unlisten();
    }
    this.unlisteners = [];
  }

  private cleanup(): void {
    this.cleanupListeners();
    this.transport = null;
    this.transportType = null;
    this.lastCleanTimestamp = null;
  }
}
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | tail -5`
Expected: No errors.

**Step 3: Commit**

```bash
git add src/stores/LiveTailManager.ts
git commit -m "feat: add LiveTailManager with stream/poll transport orchestration

Manages transport selection for live tail:
- Attempts StartLiveTail streaming first
- Falls back to polling on failure or unsupported region
- Detects sampling (500 events/update) and switches to polling
- Replays from lastCleanTimestamp to avoid gaps
- Auto-reconnects on stream error or 3-hour timeout"
```

---

## Task 5: Integrate LiveTailManager into logStore

**Files:**

- Modify: `src/stores/logStore.ts`

**Step 1: Update imports**

Replace `TailPoller` import with `LiveTailManager` and `TransportType`:

```typescript
import { LiveTailManager, type TransportType } from "./LiveTailManager";
```

Remove: `import { TailPoller } from "./TailPoller";`

**Step 2: Update LogStore interface**

Replace in the interface:

```typescript
// Replace these lines:
//   isTailing: boolean;
//   tailPoller: TailPoller | null;
// With:
isTailing: boolean;
tailManager: LiveTailManager | null;
activeTransport: TransportType | null;
isFollowing: boolean;
tailToast: string | null;
```

Add new actions:

```typescript
  setIsFollowing: (following: boolean) => void;
  setTailToast: (message: string | null) => void;
```

**Step 3: Update initial state**

Replace in the store creation:

```typescript
// Replace:
//   isTailing: false,
//   tailPoller: null,
// With:
  isTailing: false,
  tailManager: null,
  activeTransport: null,
  isFollowing: false,
  tailToast: null,
```

**Step 4: Update `startTail` action**

Replace the entire `startTail` action body:

```typescript
  startTail: () => {
    const { isTailing, selectedLogGroup, tailManager: existingManager } = get();
    if (!selectedLogGroup) return;
    if (isTailing) return;

    // Cancel any in-flight fetch requests
    currentFetchId++;
    invoke("cancel_fetch").catch((e) => {
      console.debug("[Backend Activity] cancel_fetch:", e);
    });

    // Stop any existing manager (defensive, survives HMR)
    if (existingManager) {
      existingManager.stop();
    }

    // Clear existing logs - live tail starts fresh from now
    set({
      isLoading: false,
      logs: [],
      filteredLogs: [],
      expandedLogIndex: null,
      selectedLogIndex: null,
      isFollowing: true,
    });

    const manager = new LiveTailManager({
      logGroupName: selectedLogGroup,
      onNewLogs: (newLogs: LogEvent[]) => {
        const { logs, filterText, disabledLevels } = get();

        // Deduplicate
        const existingIds = new Set(logs.map((l) => l.event_id).filter(Boolean));
        const existingKeys = new Set(
          logs.map((l) => `${l.timestamp}:${l.message.slice(0, 100)}`),
        );
        const uniqueNewLogs = newLogs.filter((log) => {
          if (log.event_id && existingIds.has(log.event_id)) return false;
          const key = `${log.timestamp}:${log.message.slice(0, 100)}`;
          return !existingKeys.has(key);
        });

        if (uniqueNewLogs.length === 0) return;

        const mergedNew = mergeFragmentedLogs(uniqueNewLogs);
        const parsedNew = mergedNew.map(parseLogEvent);
        const allLogs = [...logs, ...parsedNew];
        const trimmedLogs = allLogs.slice(-50000);
        const filtered = getFilteredLogs(trimmedLogs, filterText, disabledLevels);

        set({ logs: trimmedLogs, filteredLogs: filtered });
      },
      onError: (error: unknown) => {
        console.error("[Backend Activity] Tail error:", error);
      },
      onTransportChange: (type: TransportType) => {
        set({ activeTransport: type });
      },
      onToast: (message: string) => {
        set({ tailToast: message });
        setTimeout(() => {
          const { tailToast } = get();
          if (tailToast === message) {
            set({ tailToast: null });
          }
        }, 5000);
      },
      getLastLogTimestamp: () => {
        const { logs } = get();
        return logs.length > 0 ? logs[logs.length - 1].timestamp : null;
      },
    });

    manager.start();

    set({ isTailing: true, tailManager: manager });
  },
```

**Step 5: Update `stopTail` action**

```typescript
  stopTail: () => {
    const { tailManager } = get();
    if (tailManager) {
      tailManager.stop();
    }
    set({ isTailing: false, tailManager: null, activeTransport: null, isFollowing: false });
  },
```

**Step 6: Update `clearLogs` action**

Replace `tailPoller` references with `tailManager`:

```typescript
  clearLogs: () => {
    console.log("[User Activity] Clear logs");
    const { selectedLogGroup, fetchLogs, timeRange, isTailing, tailManager } = get();

    if (isTailing && tailManager) {
      tailManager.resetStartTimestamp();
    }

    set({
      logs: [],
      filteredLogs: [],
      expandedLogIndex: null,
      selectedLogIndex: null,
      selectedLogIndices: new Set(),
    });

    if (selectedLogGroup && !isTailing) {
      fetchLogs(timeRange?.start, timeRange?.end ?? undefined);
    }
  },
```

**Step 7: Add new actions**

```typescript
  setIsFollowing: (following: boolean) => {
    set({ isFollowing: following });
  },

  setTailToast: (message: string | null) => {
    set({ tailToast: message });
  },
```

**Step 8: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | tail -5`
Expected: No errors (or errors only in components not yet updated — fix in next tasks).

**Step 9: Commit**

```bash
git add src/stores/logStore.ts
git commit -m "feat: integrate LiveTailManager into logStore

Replace TailPoller with LiveTailManager:
- startTail now uses LiveTailManager (stream-first, poll fallback)
- Add activeTransport, isFollowing, tailToast state
- Toast auto-dismisses after 5 seconds
- Dedup and merge logic unchanged"
```

---

## Task 6: Follow Mode in LogViewer

**Files:**

- Modify: `src/components/LogViewer.tsx`

**Step 1: Add `isFollowing` and `setIsFollowing` from store**

In the destructured `useLogStore()` call (~line 177), add:

```typescript
const {
  // ... existing ...
  isFollowing,
  setIsFollowing,
} = useLogStore();
```

**Step 2: Replace ref-based auto-scroll with store-driven follow mode**

Remove the `shouldAutoScroll` and `userScrolledAway` refs (~line 187-188). Keep `prevLogCount`.

Replace the auto-scroll `useEffect` (~line 299-316) with:

```typescript
// Auto-scroll to bottom when following and new logs arrive
useEffect(() => {
  const hasNewLogs = filteredLogs.length > prevLogCount.current;
  prevLogCount.current = filteredLogs.length;

  if (
    isTailing &&
    hasNewLogs &&
    isFollowing &&
    listRef.current &&
    filteredLogs.length > 0
  ) {
    listRef.current.scrollToRow({
      index: filteredLogs.length - 1,
      align: "end",
    });
  }
}, [filteredLogs.length, isTailing, isFollowing]);
```

Replace the tail start/stop `useEffect` (~line 318-330) with:

```typescript
// Scroll to bottom when starting tail
useEffect(() => {
  if (isTailing && listRef.current && filteredLogs.length > 0) {
    listRef.current.scrollToRow({
      index: filteredLogs.length - 1,
      align: "end",
    });
  }
}, [isTailing, filteredLogs.length]);
```

Replace `handleRowsRendered` (~line 332-347) with:

```typescript
const handleRowsRendered = useCallback(
  (visibleRows: { startIndex: number; stopIndex: number }) => {
    if (!isTailing) return;

    const isAtBottom = visibleRows.stopIndex >= rowCount - 3;

    if (isAtBottom && !isFollowing) {
      setIsFollowing(true);
    } else if (!isAtBottom && isFollowing) {
      setIsFollowing(false);
    }
  },
  [rowCount, isTailing, isFollowing, setIsFollowing],
);
```

**Step 3: Add "Jump to latest" button**

Add after the `</List>` closing tag and before the maximized log view section:

```tsx
{
  /* Jump to latest button */
}
{
  isTailing && !isFollowing && (
    <button
      onClick={() => {
        setIsFollowing(true);
        if (listRef.current && filteredLogs.length > 0) {
          listRef.current.scrollToRow({
            index: filteredLogs.length - 1,
            align: "end",
          });
        }
      }}
      className={`absolute bottom-4 right-4 px-3 py-1.5 rounded-full text-xs font-medium shadow-lg transition-all z-10 flex items-center gap-1.5 ${
        isDark
          ? "bg-blue-600 hover:bg-blue-500 text-white"
          : "bg-blue-500 hover:bg-blue-400 text-white"
      }`}
    >
      <svg
        className="w-3 h-3"
        viewBox="0 0 12 12"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M6 2v8M2 6l4 4 4-4" />
      </svg>
      Jump to latest
    </button>
  );
}
```

**Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | tail -5`
Expected: No errors.

**Step 5: Commit**

```bash
git add src/components/LogViewer.tsx
git commit -m "feat: add follow mode with Jump to latest button

Formalize follow mode in LogViewer:
- Follow is ON by default when tailing starts
- Turns OFF when user scrolls away from bottom
- Turns ON when user scrolls back to bottom
- Floating 'Jump to latest' button appears when follow is off
- Driven by store state instead of local refs"
```

---

## Task 7: Status Bar — Follow Indicator

**Files:**

- Modify: `src/components/StatusBar.tsx`

**Step 1: Add store state**

Add `isTailing` and `isFollowing` to the destructured `useLogStore()` call:

```typescript
const {
  // ... existing ...
  isTailing,
  isFollowing,
} = useLogStore();
```

**Step 2: Add follow indicator to left side**

After the log count display (after the closing `</span>` of the count section, before the closing `</div>` of the left side), add:

```tsx
{
  isTailing && (
    <span
      className={`flex items-center gap-1 ${
        isFollowing
          ? isDark
            ? "text-green-400"
            : "text-green-600"
          : isDark
            ? "text-yellow-400"
            : "text-yellow-600"
      }`}
    >
      <span className="text-[10px]">{isFollowing ? "\u25CF" : "\u25CB"}</span>
      Follow: {isFollowing ? "ON" : "OFF"}
    </span>
  );
}
```

**Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | tail -5`
Expected: No errors.

**Step 4: Commit**

```bash
git add src/components/StatusBar.tsx
git commit -m "feat: show Follow: ON/OFF indicator in status bar during live tail"
```

---

## Task 8: App.tsx — Transport Indicator and Toast

**Files:**

- Modify: `src/components/App.tsx`

**Step 1: Add store state**

Add `activeTransport` and `tailToast` to the store usage in `App.tsx`. Find where `useLogStore()` is destructured and add:

```typescript
const { /* existing */ activeTransport, tailToast, isTailing } = useLogStore();
```

(Note: `isTailing` may already be destructured — check first.)

**Step 2: Add transport indicator**

Find the header/toolbar area where the live tail toggle exists. Add a transport pill next to it, visible only when tailing:

```tsx
{
  isTailing && activeTransport && (
    <span
      className={`px-2 py-0.5 rounded text-[10px] font-medium ${
        activeTransport === "stream"
          ? isDark
            ? "bg-green-900/50 text-green-400 border border-green-700"
            : "bg-green-100 text-green-700 border border-green-300"
          : isDark
            ? "bg-yellow-900/50 text-yellow-400 border border-yellow-700"
            : "bg-yellow-100 text-yellow-700 border border-yellow-300"
      }`}
    >
      {activeTransport === "stream" ? "Streaming" : "Polling"}
    </span>
  );
}
```

**Step 3: Add toast notification**

Find the existing truncation warning display (the `truncationWarning &&` block). Add a similar block for `tailToast` nearby:

```tsx
{
  tailToast && (
    <div
      className={`absolute top-12 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg shadow-lg text-sm flex items-center gap-2 ${
        isDark
          ? "bg-gray-700 text-gray-100 border border-gray-600"
          : "bg-white text-gray-800 border border-gray-300"
      }`}
    >
      <span>{tailToast}</span>
      <button
        onClick={() => useLogStore.getState().setTailToast(null)}
        className={`ml-2 ${isDark ? "text-gray-400 hover:text-gray-200" : "text-gray-500 hover:text-gray-700"}`}
      >
        ✕
      </button>
    </div>
  );
}
```

**Step 4: Remove old live-tail polling interval references from App.tsx (if any)**

Check if App.tsx has any listeners for the old polling events that need updating. The `logs-truncated` listener should still work for non-tail fetches.

**Step 5: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | tail -5`
Expected: No errors.

**Step 6: Commit**

```bash
git add src/components/App.tsx
git commit -m "feat: add transport indicator pill and tail toast notifications

Show 'Streaming' or 'Polling' pill in toolbar during live tail.
Add dismissible toast for transport switch and reconnect messages."
```

---

## Task 9: Update CLAUDE.md and DESIGN.md

**Files:**

- Modify: `CLAUDE.md`
- Modify: `DESIGN.md` (if exists)

**Step 1: Update CLAUDE.md**

Add to Key Files section:

```markdown
- `src/stores/LiveTailManager.ts` - Stream/poll transport orchestrator for live tail
- `src/stores/TailTransport.ts` - Transport interface
```

Update Notes section — replace the "Live tail polls every 2 seconds" line with:

```markdown
- Live tail uses CloudWatch StartLiveTail streaming API (1-second updates from AWS)
- Falls back to 1-second polling if streaming is unavailable or sampling detected
- Sampling detection: if 500 events in one update, switches to polling from last clean timestamp
```

Add to Keyboard Shortcuts or UI section:

```markdown
- Follow mode: auto-scrolls to latest during live tail, pauses when scrolled up, "Jump to latest" button to resume
- Transport indicator shows "Streaming" or "Polling" during live tail
```

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md with streaming live tail and follow mode"
```

---

## Task 10: Full Build and Manual Verification

**Step 1: Format and lint**

Run: `npm run fmt && npm run lint`
Expected: No errors.

**Step 2: TypeScript check**

Run: `npx tsc --noEmit`
Expected: No errors.

**Step 3: Full build**

Run: `npm start`
Expected: App launches with no errors.

**Step 4: Manual verification checklist**

1. Select a log group, start live tail
2. Verify "Streaming" indicator appears (or "Polling" if streaming fails)
3. Verify logs flow in real-time
4. Verify "Follow: ON" shows in status bar
5. Scroll up — verify "Follow: OFF" and "Jump to latest" button appears
6. Click "Jump to latest" — verify scroll to bottom and "Follow: ON" restores
7. Scroll back to bottom manually — verify follow re-enables
8. Stop live tail — verify indicators disappear

**Step 5: Final commit (if any fixes needed)**

```bash
git add -A
git commit -m "fix: address issues found during manual verification"
```
