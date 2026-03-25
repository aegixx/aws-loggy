# Group Header "Copy All" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Copy All" right-click context menu option to group headers that copies all log rows in the group, bypassing all active filters.

**Architecture:** The ContextMenu component gains two optional props (`onCopyAll`, `copyAllCount`) to render a "Copy All (N)" item. LogViewer wires these props only when the context menu targets a group header, reading unfiltered logs from `LogGroupSection.logs`.

**Tech Stack:** React 19, TypeScript, Vitest, React Testing Library

**Spec:** `docs/superpowers/specs/2026-03-25-group-header-copy-all-design.md`

---

## File Map

| File                                  | Action | Responsibility                                            |
| ------------------------------------- | ------ | --------------------------------------------------------- |
| `src/components/ContextMenu.tsx`      | Modify | Add `onCopyAll` / `copyAllCount` props, render menu item  |
| `src/components/ContextMenu.test.tsx` | Create | Tests for Copy All rendering and click behavior           |
| `src/components/LogViewer.tsx`        | Modify | Add `handleContextCopyAll`, pass new props to ContextMenu |

---

### Task 1: Add ContextMenu tests

**Files:**

- Create: `src/components/ContextMenu.test.tsx`

- [ ] **Step 1: Write test — renders "Copy All" when `onCopyAll` is provided**

```tsx
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --run src/components/ContextMenu.test.tsx`
Expected: FAIL — `onCopyAll` prop doesn't exist yet, "Copy All" text not found.

- [ ] **Step 3: Commit test file**

```bash
git add src/components/ContextMenu.test.tsx
git commit -m "test: add ContextMenu tests for Copy All feature"
```

---

### Task 2: Add "Copy All" to ContextMenu

**Files:**

- Modify: `src/components/ContextMenu.tsx`

- [ ] **Step 1: Add `onCopyAll` and `copyAllCount` to the props interface**

In `ContextMenuProps` (line 3), add two new optional props after `copyDisabled`:

```typescript
  onCopyAll?: () => void;
  copyAllCount?: number;
```

- [ ] **Step 2: Destructure the new props**

In the component function signature (around line 34), add `onCopyAll` and `copyAllCount` to the destructured props.

- [ ] **Step 3: Render the "Copy All" menu item below the existing Copy item**

Insert the following JSX between the existing Copy `<div>` (line 134) and the separator `<div>` (line 137):

```tsx
{
  /* Copy All (group headers only) */
}
{
  onCopyAll && (
    <div
      className={`${menuItemBase} ${menuItemEnabled}`}
      onClick={() => handleItemClick(onCopyAll)}
    >
      <span>Copy All ({copyAllCount ?? 0})</span>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --run src/components/ContextMenu.test.tsx`
Expected: PASS — all 3 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/components/ContextMenu.tsx
git commit -m "feat: add Copy All menu item to ContextMenu"
```

---

### Task 3: Wire "Copy All" in LogViewer

**Files:**

- Modify: `src/components/LogViewer.tsx`

- [ ] **Step 1: Add `handleContextCopyAll` callback**

Add the following after the existing `handleContextCopy` callback (around line 605):

```typescript
const handleContextCopyAll = useCallback(() => {
  if (contextMenu?.targetGroup) {
    try {
      const messages = contextMenu.targetGroup.logs
        .map((log) => log.message)
        .join("\n");
      navigator.clipboard.writeText(messages);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  }
  setContextMenu(null);
}, [contextMenu]);
```

- [ ] **Step 2: Pass `onCopyAll` and `copyAllCount` to ContextMenu**

In the `<ContextMenu>` JSX (around line 906), add the new props:

```tsx
          onCopyAll={
            contextMenu.targetGroup
              ? handleContextCopyAll
              : undefined
          }
          copyAllCount={contextMenu.targetGroup?.metadata.logCount}
```

- [ ] **Step 3: Run all tests to verify nothing is broken**

Run: `npm test -- --run`
Expected: All tests PASS.

- [ ] **Step 4: Run lint and format**

Run: `npm run fmt && npm run lint`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/LogViewer.tsx
git commit -m "feat: wire Copy All handler in LogViewer for group headers"
```

---

### Task 4: Update documentation

**Files:**

- Modify: `CLAUDE.md`

- [ ] **Step 1: Add "Copy All" to the Context Menu documentation table**

In the Context Menu section of `CLAUDE.md`, add a new row to the table after the existing "Copy/Copy sel." row:

```markdown
| Copy All | Copy all logs in group (ignores filters). Group headers only. |
```

- [ ] **Step 2: Run format check**

Run: `npm run fmt`
Expected: Clean.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add Copy All to context menu documentation"
```

---

### Task 5: Manual verification

- [ ] **Step 1: Start the app in demo mode**

Run: `npm start`
Toggle Demo Mode from the Loggy menu.

- [ ] **Step 2: Verify "Copy All" appears on group headers**

1. Set Group By to "Invocation" or "Stream"
2. Apply a text filter to reduce visible rows
3. Right-click a group header
4. Verify "Copy All (N)" appears below "Copy" where N is the total log count
5. Click "Copy All" and paste — confirm all logs are present, not just filtered ones

- [ ] **Step 3: Verify "Copy All" does NOT appear on regular log rows**

1. Right-click a regular log row
2. Verify only "Copy" appears, no "Copy All"

- [ ] **Step 4: Verify existing Copy still works as before**

1. Right-click a group header and click "Copy" — verify it copies visible (filtered) logs
2. Select multiple rows and right-click — verify it copies selected rows

## GSTACK REVIEW REPORT

| Review        | Trigger               | Why                             | Runs | Status | Findings                    |
| ------------- | --------------------- | ------------------------------- | ---- | ------ | --------------------------- |
| CEO Review    | `/plan-ceo-review`    | Scope & strategy                | 1    | CLEAR  | HOLD SCOPE, 0 critical gaps |
| Codex Review  | `/codex review`       | Independent 2nd opinion         | 0    | —      | —                           |
| Eng Review    | `/plan-eng-review`    | Architecture & tests (required) | 0    | —      | —                           |
| Design Review | `/plan-design-review` | UI/UX gaps                      | 0    | —      | —                           |

**VERDICT:** CEO CLEARED — eng review required before implementation.
