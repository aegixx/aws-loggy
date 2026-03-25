# Group Header "Copy All" Context Menu Option

## Summary

Add a "Copy All" right-click context menu option to group headers that copies all log rows in the group, bypassing all active filters (text and log level).

## Motivation

The existing copy mechanisms (hover copy button, context menu Copy) respect active filters, copying only visible rows. When debugging, users often need the complete unfiltered invocation or stream logs to paste into an issue or share with a teammate. Currently this requires clearing filters, copying, then re-applying filters.

## Design

### ContextMenu changes

- New optional props: `onCopyAll?: () => void`, `copyAllCount?: number`
- When `onCopyAll` is defined, render a "Copy All (N)" item directly below the existing Copy item, before the separator
- `copyAllCount` displays the total unfiltered log count in the group

### LogViewer changes

- New `handleContextCopyAll` callback:
  - Reads `contextMenu.targetGroup.logs` (the full unfiltered array from `LogGroupSection`)
  - Joins all messages with newline and writes to clipboard
- Pass `onCopyAll` and `copyAllCount` to ContextMenu only when `contextMenu.targetGroup` is set

### Data flow

```text
Right-click group header
  -> handleGroupHeaderContextMenu (already stores targetGroup)
  -> ContextMenu renders "Copy All (N)" using onCopyAll + copyAllCount
  -> handleContextCopyAll reads targetGroup.logs (unfiltered)
  -> navigator.clipboard.writeText(allMessages)
```

### Files changed

| File                             | Change                                              |
| -------------------------------- | --------------------------------------------------- |
| `src/components/ContextMenu.tsx` | Add `onCopyAll` / `copyAllCount` props, render item |
| `src/components/LogViewer.tsx`   | Add `handleContextCopyAll`, wire props              |

### Testing

- Unit test: ContextMenu renders "Copy All (N)" when `onCopyAll` is provided, does not render when omitted
- Unit test: clicking "Copy All" calls the handler
- Manual: right-click group header with active filters, verify all logs copied regardless of filters

## Decisions

- **Copy All bypasses both text and level filters** — copies every log in the group unconditionally
- **Only appears on group header right-click** — not on individual log rows
- **Existing Copy behavior unchanged** — continues to copy visible/selected content
