# ADR 0001: Implementation decisions for the homepage extension

- **Status:** Accepted
- **Date:** 2026-06-19
- **Supersedes/Refines:** PRD `docs/issues/0001-minimal-homepage-extension.md`

## Context

PRD 0001 specifies the module interfaces and testing approach for the homepage
extension. Several points left a choice to be resolved at implementation time.
This ADR records the decisions made so the rationale survives refactors.

## Decisions

### 1. Identifiers are stable IDs, not names

The PRD lists `restoreStash(name)` / `removeStash(name)`. We implement
`restoreStash(id)` / `removeStash(id)` and similarly key list items and clipboard
entries by generated `crypto.randomUUID()` ids.

**Why:** Names are not unique (two stashes could share a name) and rename would
break references. Stable ids make delete/restore/reorder unambiguous. The UI
passes ids; names remain the human label.

### 2. Test runner is Node's built-in `node:test`

The PRD offers "Vitest (or Node's built-in `node:test`)".

**Why:** The navigation router is the only test target and it is pure JS with no
browser globals. `node:test` keeps the project at zero dev-dependencies, matching
the "no frameworks, no build step" ethos. `npm test` runs `node --test`.

### 3. Clipboard capture: homepage events + manual "From clipboard"

The PRD implies recent copies from anywhere. System-wide capture would require a
content script on `<all_urls>` (a broad, scary permission) or polling
`clipboard.readText` (privacy-intrusive). Instead:

- A `copy` listener on the homepage records anything copied while on the page.
- A "From clipboard" button reads the current clipboard via
  `navigator.clipboard.readText()` (user gesture + `clipboardRead` permission).

**Why:** Captures copies from elsewhere with one click after returning to the
tab, at far lower permission cost than `<all_urls>`. Click-to-recopy uses
`navigator.clipboard.writeText()` (no permission).

### 4. Navigation scheme selection

`routeInput` prepends `https://` for domains and public IPs, but `http://` for
`localhost` and `127.0.0.0/8` loopback.

**Why:** Local dev servers (story 9) overwhelmingly serve HTTP; prepending
`https://` to `localhost:3000` would break the common case. Public targets
default to HTTPS.

### 5. No background service worker

The manifest declares no service worker. Extension pages (the new-tab override)
can call `chrome.tabs` / `chrome.storage` directly with the `tabs` and `storage`
permissions.

**Why:** Nothing in the MVP requires event-page behavior. Removing the worker
eliminates an empty file and a lifecycle surface.

## Consequences

- Stash/list operations are id-based; any future name-based API is an additive
  wrapper.
- Tests run with `node --test` and no install step; future browser-dependent
  modules would need a separate strategy if tested.
- Clipboard history is not fully automatic across all sites; a content-script
  upgrade is a documented future option.
