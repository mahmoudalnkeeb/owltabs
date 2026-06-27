---
id: 0001
title: Minimal homepage new-tab extension for software engineers
labels: [done]
status: done
created: 2026-06-19
---

# PRD: Minimal Homepage New-Tab Extension

## Problem Statement

When I open a new browser tab, I land on a blank page or a cluttered portal full of
news, ads, and widgets I never use. As a software engineer, what I actually want is a
clean, fast homepage that gives me immediate access to the small set of navigation and
capture tools I reach for dozens of times a day: jump to a dev site, run a search, save
the tabs I have open, grab something I copied a minute ago, or jot down a quick note.
Existing "new tab" extensions are either bloated dashboards or purely cosmetic, and none
put the handful of browser-native tools I need one keystroke away.

## Solution

A minimal browser extension that overrides the new-tab page with a clean, single-screen
homepage. It surfaces a small, deliberately chosen set of tools that lean on browser
APIs rather than reimplementing standalone apps:

- A **search bar** that behaves like the omnibox — type a URL, a domain, or a query and
  it routes you correctly.
- **Quick links** — a customizable grid of shortcut tiles to frequently visited dev
  sites.
- **Tab stash** — save the tabs you currently have open under a name and restore that
  working set later.
- **Clipboard history** — a lightweight list of your recent copies, re-copyable with one
  click.
- **Custom saved lists** — generic named lists for grouping related items (links,
  commands, resources) for quick reuse.
- A **notes/scratchpad** for quick text that autosaves.
- A **clock** with timezone, and a **dark/light theme toggle** that remembers your
  preference.

The interface is a single screen with no nested menus, no settings labyrinth, and no
external accounts. Everything persists locally via the extension storage API.

## User Stories

### General / Homepage shell

1. As a software engineer, I want a clean homepage when I open a new tab, so that I am
   not distracted by clutter or external content.
2. As a user, I want the homepage to render in under 100ms, so that I never wait on my
   new-tab page.
3. As a user, I want all tools visible on a single screen without scrolling, so that
   everything is one glance away.
4. As a user, I want my data to persist locally on my machine, so that my homepage is
   the same every time I open it.
5. As a user, I want no external accounts or sign-in required, so that I can use the
   extension immediately after install.

### Search bar

6. As a user, I want a search bar at the top of my homepage, so that I can search the
   web without first navigating to a search engine.
7. As a user, I want to type a full URL like `https://github.com` and be navigated
   directly to it, so that I don't get a search-results page for a URL.
8. As a user, I want to type a domain without a protocol like `github.com` and be
   navigated to the site, so that I reach it with minimal typing.
9. As a user, I want `localhost:3000` and `127.0.0.1:8080` to be treated as URLs, so
   that I can jump to local dev servers.
10. As a user, I want multi-word input like `react hooks` to be treated as a search
    query, so that I get search results.
11. As a user, I want a single word with no TLD like `react` to be treated as a search
    query, so that I'm not sent to a non-existent domain.
12. As a user, I want to press Enter in the search bar to navigate, so that it feels
    like the browser omnibox.
13. As a user, I want to configure my default search engine, so that searches go to my
    preferred provider.
14. As a user, I want the search bar to be focused automatically when I open a new tab,
    so that I can start typing immediately.

### Quick links

15. As a user, I want a grid of shortcut tiles to my most-used dev sites, so that I can
    navigate in one click.
16. As a user, I want to add a new quick link with a title and URL, so that I can
    customize my shortcuts.
17. As a user, I want to edit an existing quick link, so that I can fix a wrong URL or
    rename it.
18. As a user, I want to remove a quick link, so that I can keep my shortcuts relevant.
19. As a user, I want to reorder quick links via drag-and-drop, so that the most
    important ones come first.
20. As a user, I want quick links to persist across browser sessions, so that I don't
    reconfigure them each time.
21. As a user, I want a sensible default set of dev-focused quick links on first
    install, so that the homepage is useful before I customize it.

### Tab stash

22. As a user, I want to save all currently open tabs as a named stash, so that I can
    close them and return to that working set later.
23. As a user, I want to restore a saved stash, so that all its tabs reopen at once.
24. As a user, I want to see a list of my saved stashes, so that I can pick one to
    restore.
25. As a user, I want to see how many tabs are in each stash, so that I know what I'm
    restoring.
26. As a user, I want to delete a saved stash, so that I can clean up old working sets.
27. As a user, I want stashes to persist across browser restarts, so that they survive
    closing the browser.

### Clipboard history

28. As a user, I want to see my recent clipboard copies, so that I can find something I
    copied a moment ago.
29. As a user, I want to click a clipboard entry to copy it back to my clipboard, so
    that I can reuse it.
30. As a user, I want to remove a single clipboard entry, so that I can delete a
    sensitive item without clearing the rest.
31. As a user, I want to clear my entire clipboard history, so that I can wipe it when
    needed.
32. As a user, I want clipboard history to persist across sessions, so that useful
    copies aren't lost.
33. As a user, I want clipboard history capped to a reasonable size, so that it doesn't
    grow unbounded.

### Custom saved lists

34. As a user, I want to create a named list, so that I can group related items such as
    "Learning resources" or "Useful commands".
35. As a user, I want to add a text item to a list, so that I can build up a collection.
36. As a user, I want to remove an item from a list, so that I can keep it tidy.
37. As a user, I want to reorder items within a list, so that I can prioritize.
38. As a user, I want to delete an entire list, so that I can remove one I no longer
    need.
39. As a user, I want to copy a list item to my clipboard, so that I can paste it
    elsewhere.
40. As a user, I want my lists to persist across sessions, so that they're available
    when I return.

### Notes / scratchpad

41. As a user, I want a scratchpad for quick notes, so that I can jot down ideas,
    commands, or snippets.
42. As a user, I want my notes to autosave as I type, so that I don't lose text if I
    close the tab.
43. As a user, I want notes to persist across sessions, so that they're still there
    next time I open a tab.

### Theme

44. As a user, I want a dark/light mode toggle, so that I can match my working
    environment.
45. As a user, I want my theme preference remembered, so that I don't re-toggle it every
    session.
46. As a user, I want the theme to default to my system color-scheme preference, so
    that it matches without any configuration.

### Clock

47. As a user, I want to see the current time, so that I can track my session.
48. As a user, I want to see my timezone, so that I know the context of the displayed
    time.

## Implementation Decisions

- **Tech stack:** Plain HTML, CSS, and JavaScript. Manifest V3. No frameworks, no build
  step, no bundler. The extension loads static assets directly.
- **New-tab override:** The extension uses `chrome_url_overrides.newtab` to replace the
  new-tab page with the homepage.
- **Persistence:** All data is stored locally via `chrome.storage.local` under
  namespaced keys per feature (`links`, `stashes`, `clipboard`, `lists`, `notes`,
  `theme`).
- **Modules and their interfaces:**
  - **Storage layer** — a deep module wrapping `chrome.storage.local`. Interface:
    `get(key)`, `set(key, value)`, `remove(key)`, `onChange(callback, key?)`. All
    async. Every feature module depends on this, so it is the single seam through which
    persistence flows.
  - **Navigation router** — a pure module, no browser dependencies. Interface:
    `routeInput(text, { searchEngineUrl }) → { type: 'url' | 'search', target: string }`.
    Detects full URLs (with protocol), bare domains with known TLDs, `host:port`
    patterns including `localhost` and IP addresses, and falls back to search for
    everything else. Because it is pure, it is trivially unit-testable.
  - **Tab stash** — uses `chrome.tabs`/`chrome.tabGroups` APIs. Interface:
    `stashCurrentTabs(name)`, `restoreStash(name)`, `listStashes()`,
    `removeStash(name)`. Serializes tabs into `{ id, name, createdAt, tabs: [{ url,
    title, groupId }] }`.
  - **Quick links** — CRUD over the `links` storage key. Interface: `getLinks()`,
    `addLink({ title, url })`, `updateLink(id, patch)`, `removeLink(id)`,
    `reorderLinks(orderedIds)`.
  - **Clipboard history** — tracks recent copies. Interface: `getHistory()`,
    `addEntry(text)`, `removeEntry(id)`, `clearHistory()`. Capped to a configurable max
    (default 50).
  - **Custom saved lists** — generic named-list manager. Interface: `getLists()`,
    `createList(name)`, `addListItem(listId, text)`, `removeListItem(listId, itemId)`,
    `reorderListItems(listId, orderedItemIds)`, `removeList(listId)`,
    `copyListItem(listId, itemId)`.
  - **Notes** — persisted scratchpad. Interface: `getNotes()`, `setNotes(text)` with
    debounced autosave.
  - **Theme** — interface: `getTheme()`, `setTheme(mode)`, `toggleTheme()`. On first
    run reads `prefers-color-scheme`; thereafter persists the explicit choice.
  - **Clock** — renders time via a timer and displays timezone via
    `Intl.DateTimeFormat`. Shallow module.
- **Default quick links on first install:** a small dev-focused set (e.g., GitHub, MDN,
  Stack Overflow, DevDocs) seeded only when storage is empty.
- **Search engine:** single configurable provider URL, defaulting to DuckDuckGo. The
  navigation router appends the URL-encoded query to this base.
- **UI layout:** single screen, no routing. Search bar at top, quick-link grid below,
  tab-stash / clipboard / lists / notes arranged in a compact panel region. Theme toggle
  and clock in a header corner.

## Testing Decisions

- **What makes a good test here:** tests assert external behavior — given an input, the
  module returns the expected output — and never reach into private implementation
  details or internal state. A good test survives refactors.
- **Navigation router** is the primary test target. It is a pure module with no browser
  dependencies, making it ideal for fast, deterministic unit tests. Test cases to cover:
  - Full URL with protocol (`https://github.com`) → navigates to that URL.
  - Bare domain with known TLD (`github.com`) → prepends `https://` and navigates.
  - `localhost:3000` and `127.0.0.1:8080` → treated as URLs.
  - IPv4 address (`8.8.8.8`) → treated as a URL.
  - Multi-word query (`react hooks`) → search.
  - Single word without a TLD (`react`) → search.
  - Empty/whitespace input → no navigation (returns a neutral result).
  - Query with a path but no protocol (`github.com/torvalds/linux`) → URL.
- **Test runner:** Vitest (or Node's built-in `node:test`) — chosen because the
  navigation router is plain JS with no browser globals, so it runs in Node without
  jsdom or a browser shim.
- **Prior art:** none — this is a greenfield repo, so the navigation-router tests become
  the reference pattern for any future tests.

## Out of Scope

- Cross-device sync (`chrome.storage.sync`) — local-only for this iteration.
- Importing or syncing with the browser's native bookmarks.
- Weather, news, stock, calendar, or any external-data widgets.
- AI-assisted features (summarization, smart suggestions, etc.).
- Multiple search-engine switching UI — a single configurable engine only.
- Cloud backup or export/import of homepage data.
- Sharing stashes or lists with other users.
- Custom backgrounds, wallpapers, or widget layout editing.
- Marketplace publication and store assets (icons, listings) — the extension is
  loadable as an unpacked extension for development.

## Further Notes

- The extension should be installable as an unpacked extension during development via
  `chrome://extensions`.
- The new-tab page should render in under 100ms with no network requests; everything is
  local and synchronous-to-first-paint.
- Accessibility: the search bar and all interactive controls must be keyboard-navigable,
  and the theme toggle must respect `prefers-color-scheme` on first run.
- The storage layer is deliberately the single deep seam for persistence; keeping all
  features routed through it means a future migration to `storage.sync` or IndexedDB
  touches one module.
