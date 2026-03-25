import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ContextMenu } from "./ContextMenu";

function renderContextMenu(overrides: Record<string, unknown> = {}) {
  const defaults = {
    x: 100,
    y: 100,
    onClose: vi.fn(),
    isDark: true,
    onCopy: vi.fn(),
    onRefresh: vi.fn(),
    onClear: vi.fn(),
    onFindBy: vi.fn(),
    onFilterBySelection: vi.fn(),
    onFilterByRequestId: vi.fn(),
    onFilterByTraceId: vi.fn(),
    onFilterByClientIP: vi.fn(),
    hasTextSelection: false,
    selectedText: "",
    requestId: null,
    traceId: null,
    clientIP: null,
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return render(<ContextMenu {...(defaults as any)} {...overrides} />);
}

describe("ContextMenu", () => {
  it("should render 'Copy All' when onCopyAll is provided", () => {
    renderContextMenu({ onCopyAll: vi.fn(), copyAllCount: 42 });
    expect(screen.getByText("Copy All (42)")).toBeDefined();
  });

  it("should not render 'Copy All' when onCopyAll is not provided", () => {
    renderContextMenu();
    expect(screen.queryByText(/Copy All/)).toBeNull();
  });

  it("should call onCopyAll and onClose when 'Copy All' is clicked", () => {
    const onCopyAll = vi.fn();
    const onClose = vi.fn();
    renderContextMenu({ onCopyAll, copyAllCount: 10, onClose });
    fireEvent.click(screen.getByText("Copy All (10)"));
    expect(onCopyAll).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });
});
