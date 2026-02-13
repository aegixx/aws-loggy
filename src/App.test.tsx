import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act } from "@testing-library/react";
import { listen } from "@tauri-apps/api/event";
import App from "./App";

const mockListen = vi.mocked(listen);

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
