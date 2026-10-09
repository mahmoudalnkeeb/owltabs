---
name: Vesper Reader
colors:
  surface-0: "#101010"
  surface-1: "#161616"
  surface-2: "#1c1c1c"
  surface-3: "#202020"
  surface-selected: "#232323"
  surface-hover: "#282828"
  border-subtle: "#1d1d1d"
  border-default: "#282828"
  border-strong: "#343434"
  text-primary: "#ffffff"
  text-secondary: "#a0a0a0"
  text-tertiary: "#7e7e7e"
  text-disabled: "#505050"
  text-on-accent: "#000000"
  accent: "#ffc799"
  accent-hover: "#ffcfa8"
  mint: "#99ffe4"
  red: "#ff8080"
  favicon-tile: "#ececec"
typography:
  clock:
    fontFamily: Geist
    fontSize: 17px
    fontWeight: "500"
    letterSpacing: -0.01em
  list-title:
    fontFamily: Geist
    fontSize: 20px
    fontWeight: "600"
    letterSpacing: -0.01em
  row-title:
    fontFamily: Geist
    fontSize: 15px
    fontWeight: "600"
    lineHeight: 1.4
  row-title-read:
    fontFamily: Geist
    fontSize: 15px
    fontWeight: "500"
  body:
    fontFamily: Geist
    fontSize: 13.5px
    fontWeight: "400"
    lineHeight: 1.6
  meta:
    fontFamily: Geist
    fontSize: 12.5px
    fontWeight: "400"
  data:
    fontFamily: Geist Mono
    fontSize: 11.5px
    fontWeight: "400"
    fontVariantNumeric: tabular-nums
rounded:
  xs: 4px
  sm: 6px
  md: 10px
  lg: 14px
  xl: 20px
  full: 999px
spacing:
  base: 4px
  scale: [4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80]
layout:
  header-height: 64px
  sidebar-width: 220px
  list-width: 780px
  ai-panel-width: 420px
  settings-width: 760px
---

## What this is

OwlTabs replaces the browser's new tab with a feed reader. Most of the time it is opened to do one of three things: type a search, jump to a site, or scan what's new. The design is built for scanning: headlines first, everything else quieter.

The source of truth for values is `src/newtab/styles/tokens.css` (kept as-is, only extended) and `src/newtab/styles/newtab-tokens.css` (app geometry). This file explains how to use them.

## Principles

1. **Headlines are the interface.** Article titles carry the page. Images, sources, and times support them and never compete.
2. **One accent, used for state.** The warm accent `#ffc799` marks focus, the selected row, active counts, and saved articles. It is not decoration.
3. **Keyboard first, mouse friendly.** Every list action has a key. The search box has focus when a tab opens. Nothing requires hovering to discover; hover only reveals shortcuts to actions that also have keys.
4. **Calm by default.** No looping animation. Motion answers an action (panel opens, menu appears, toolbar reveals) and finishes within 320ms.
5. **Dark only.** The page has one theme. Surfaces step up in lightness to show elevation; borders separate, shadows only lift overlays.

## Color

- **Surfaces:** `surface-0` is the page. `surface-1` is hover and raised panels (AI panel, settings, quick-link chips). `surface-2` is inside raised things (inputs, thumbnails placeholder). `surface-3` is floating UI (menus, toolbars, dialogs).
- **Text:** primary for unread titles and headings, secondary for sources and labels, tertiary for times, counts, excerpts, and read titles. Never pure black on accent text other than `text-on-accent`.
- **Accent:** focus rings, the active filter's count, saved bookmarks, the AI button when open. Never more than a few accent marks on screen at once.
- **Mint / red:** status only (success toast, destructive hover). Never as decoration.
- **Images:** thumbnails are dimmed (`brightness(0.82)`) until the row is hovered or selected, and have a hairline inset. Bright white preview images otherwise glare against the dark page.
- **Favicons:** rendered on a small `#ececec` tile. Favicons are drawn for light browser chrome; without the tile, dark ones (GitHub, dev.to) disappear.

## Typography

One family, **Geist**, with **Geist Mono** for numbers that should align (times, counts, keyboard keys). Do not use mono for labels or prose.

- Unread titles 15px/600, read titles 15px/500 in tertiary.
- Section headings are sentence case, 12px/600 tertiary. No all-caps labels, no tracked-out eyebrows.
- Topic names are user-typed; display them in sentence case, and names of three letters or fewer as acronyms ("ai" shows as "AI").
- Copy is plain and specific. No em-dashes or en-dashes in visible text; use a period, a comma, or a line break.

## Layout

```
┌ header (fixed, 64px) ─────────────────────────────────────────────┐
│ 12:54 AM Saturday   [ Search your feed or the web   Ctrl K ]  AI ⚙ │
├────────────────────────────────────────────────────────────────────┤
│ (GitHub) (Gmail) (Calendar) (+ Add link)          quick-link strip  │
│                                                                    │
│ All articles   72 │ All articles  72 unread       Mark all as read │
│ Saved             │ Today                                          │
│ Topics            │ 4m   Title of the article, two lines max  [img]│
│   Tech         30 │      ▣ Source   excerpt, one line…             │
│ Sources           │ 5m   Next title                           [img]│
│   GitHub Blog  10 │                                                │
│ Refresh feeds     │ Yesterday                                      │
│ Keyboard shortcuts│ …loads more on scroll                          │
└───────────────────┴────────────────────────────────────────────────┘
```

- The reader is `220px sidebar + 40px gap + 780px list`, centered. The list width keeps titles under ~80 characters per line.
- The sidebar is sticky. Below 900px it becomes a horizontal strip of pills above the list.
- Rows are a grid: 52px mono time gutter, title and meta, an 84×56 thumbnail. Row actions float in a toolbar over the row on hover or selection; no column is reserved for them.
- Articles are grouped by day (Today, Yesterday, This week, Older). Group headings are not sticky.
- The AI panel docks on the right. At 1280px and wider the reader moves left to make room; narrower, the panel overlays.
- Settings is a 760px right-side sheet with a backdrop: section nav on the left (General, Feeds, Quick links, Appearance, AI assistant, Data), content on the right. Below 720px the nav becomes a horizontal strip.

## Components

- **Search (omnibox):** pill input in the header. Typing filters the list live. A menu offers "Search {engine}" (Enter) and "Ask AI" (Ctrl/⌘ Enter) and shows how many articles match. Empty and focused, it hints that ↓ moves to the list.
- **Quick links:** pill chips with a favicon. Hover shows a small remove button; removal offers Undo. Drag to reorder.
- **Sidebar item:** 32px row, label and mono count. Active item uses `surface-selected` and an accent count.
- **Row:** whole row is the link. Selected row gets `surface-2` and a 1px `border-default` outline on all sides (never a colored side stripe). Read rows dim their title and thumbnail. Saved rows show a small filled bookmark after the source.
- **Row toolbar:** `surface-3`, 1px border, soft shadow, 30px icon buttons (Ask AI, Save).
- **Menus, toolbars, dialogs:** `surface-3`, `border-default`, radius `lg` (dialogs) or `md` (toolbars), shadow `0 16px 48px rgba(0,0,0,.5)`.
- **Settings rows:** grouped in bordered cards with hairline dividers. Label and hint on the left, control on the right. Choices of two to four use a segmented control; longer lists use a select; on/off uses a switch. Changes save immediately and show a brief "Saved" in the sheet header, not a toast. Destructive actions confirm with a second click, never a browser dialog; removals offer Undo.
- **Settings forms:** labels above inputs, optional fields marked "optional", errors inline under the form.
- **Empty state:** with no feeds, a dashed card offers one-click starter feeds and a button to paste a URL. No header above it.
- **Skeletons:** row-shaped, shimmer on `surface-2`.

## Shape

Radius follows size: `xs` for keys, `sm` for thumbnails and small buttons, `md` for rows and toolbars, `lg` for dialogs and cards, `full` for pills (search, chips, the AI button). Do not round large containers fully.

## Motion

- Durations: 120ms for hover and color, 200ms for menus and dialogs, 320ms for panels.
- Easing: `--ease-out` for things appearing, `--ease-standard` for state changes.
- Only `transform` and `opacity` animate. Everything collapses under `prefers-reduced-motion`.
- No infinite animations except the loading shimmer and the refresh spinner while busy.

## Keyboard

| Key | Action |
| --- | --- |
| `/`, Ctrl/⌘ K | Focus search |
| ↓ (in empty search) | Move to the article list |
| `j` / `k`, or ↓ / ↑ in the list | Next / previous article (↑ on the first article returns to search) |
| `o` or Enter | Open |
| `s` | Save or unsave |
| `m` | Mark read or unread |
| `a` | Ask AI about the article |
| Ctrl/⌘ / | Toggle AI panel |
| Ctrl/⌘ , | Settings |
| `1` to `9` | Open quick link |
| `?` | Shortcuts dialog |
| Esc | Close the top panel, or clear search |

## New-tab focus

Chrome gives the address bar focus on new-tab override pages, and the page cannot take it back. With "Focus search on new tab" on (the default), the page replaces itself once with `index.html?focus`; as an ordinary page it can focus the search box. The trade-off is that the address bar shows the extension URL instead of being empty.
