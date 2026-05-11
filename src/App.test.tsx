import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act } from "@testing-library/react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import App from "./App";

const mockListen = vi.mocked(listen);
const mockGetCurrentWindow = vi.mocked(getCurrentWindow);
const mockInvoke = vi.mocked(invoke);

describe("App - Tauri event listeners", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Each listen call returns a cleanup function
    mockListen.mockImplementation(() => Promise.resolve(() => {}));
  });

  it("should register menu event listeners only once", async () => {
    await act(async () => {
      render(<App />);
    });

    // Count how many times listen was called for menu events
    const menuEvents = [
      "open-settings",
      "open-about",
      "refresh-logs",
      "logs-truncated",
      "logs-progress",
      "live-tail-event",
      "live-tail-error",
      "live-tail-ended",
      "debug-log",
      "aws-session-refreshed",
      "aws-session-expired",
      "clear-logs",
      "set-theme",
      "check-for-updates",
      "open-find",
      "toggle-demo-mode",
    ];

    for (const event of menuEvents) {
      const calls = mockListen.mock.calls.filter((c) => c[0] === event);
      expect(calls).toHaveLength(1);
    }
  });
});

// Issue #106: Window close button (X) does nothing on Windows.
//
// Root cause: in Tauri v2 on Windows, calling `window.close()` from inside
// an `onCloseRequested` handler after `preventDefault()` is silently
// dropped. The Exit menu works because it goes through Rust's quit path.
// Fix: route the final exit through a `quit_app` Tauri command that calls
// `app.exit(0)`, matching the Exit menu's working path.
describe("App - issue #106 X-button close", () => {
  let closeRequestedHandler:
    | ((event: { preventDefault: () => void }) => Promise<void> | void)
    | null;
  let closeMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockListen.mockImplementation(() => Promise.resolve(() => {}));
    mockInvoke.mockImplementation(() => Promise.resolve([]));
    closeRequestedHandler = null;
    closeMock = vi.fn(() => Promise.resolve());

    mockGetCurrentWindow.mockReturnValue({
      startDragging: vi.fn(),
      listen: vi.fn(() => Promise.resolve(() => {})),
      setTitle: vi.fn(() => Promise.resolve()),
      onCloseRequested: vi.fn((cb) => {
        closeRequestedHandler = cb;
        return Promise.resolve(() => {});
      }),
      close: closeMock,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
  });

  it("invokes quit_app and does NOT call win.close() when X fires onCloseRequested", async () => {
    await act(async () => {
      render(<App />);
    });

    expect(closeRequestedHandler).not.toBeNull();

    let defaultPrevented = false;
    const fakeEvent = {
      preventDefault: () => {
        defaultPrevented = true;
      },
    };

    await act(async () => {
      await closeRequestedHandler!(fakeEvent);
    });

    expect(defaultPrevented).toBe(true);
    // Fix for #106: finalize via Rust quit_app (works on Windows), not
    // win.close() (silently dropped on Windows from inside the handler).
    expect(mockInvoke).toHaveBeenCalledWith("quit_app");
    expect(closeMock).not.toHaveBeenCalled();
  });
});
