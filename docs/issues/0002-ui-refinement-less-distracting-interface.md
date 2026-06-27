---
id: 0002
title: UI refinement for a less distracting interface
labels: [done]
status: done
created: 2026-06-23
---

# Plan: UI Refinement for a Less Distracting Interface

## Goal
Reduce visual clutter and peripheral distraction across the new-tab homepage by muting non-essential colors, softening card contrast, de-emphasizing secondary metadata, removing the unused Trending panel, and creating clearer separation around the central Zikr.

## Files Involved
- `styles.css` — all visual styling changes
- `newtab.html` — remove the Trending section markup
- `src/main.js` — remove the `renderTrending` function and its call site

---

## Task 1 — Card Thumbnails: Grayscale + Reduced Opacity by Default

**Location:** `styles.css`
**Selectors:** `.feed-article--grid .feed-thumb-img`

### Current state
```css
.feed-article--grid .feed-thumb-img {
  border-radius: var(--r-sm);
}
```

### Required changes
1. Add default filter to mute the thumbnail:
   ```css
   filter: grayscale(100%) opacity(0.65);
   transition: filter var(--dur-base) var(--ease-standard);
   ```
2. Restore full color and opacity on card hover:
   ```css
   .feed-article--grid:hover .feed-thumb-img {
     filter: grayscale(0%) opacity(1);
   }
   ```

### Notes
- Target only `.feed-thumb-img` inside `.feed-article--grid`.
- Do not apply the filter to monogram fallback text.
- Preserve the existing `.feed-thumb-img--favicon` rules.

---

## Task 2 — Card Containers: Lower Contrast Against Backdrop

**Location:** `styles.css`
**Selector:** `.feed-article--grid`

### Current state
```css
.feed-article--grid {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border-subtle);
  border-radius: var(--r-md);
  overflow: hidden;
  background: var(--surface-1);
  cursor: pointer;
  transition:
    border-color var(--dur-base) var(--ease-standard),
    transform var(--dur-base) var(--ease-standard),
    box-shadow var(--dur-base);
}
```

### Required changes
1. Change card background to blend with the dark page backdrop:
   ```css
   background: var(--surface-0);
   ```
2. Keep the border subtle; optionally reduce its opacity slightly so the card edge is quieter:
   ```css
   border-color: rgba(40, 40, 40, 0.5); /* var(--border-default) at ~50% opacity */
   ```
3. Keep the existing hover state (`border-color: var(--border-default)`, lift, shadow) so cards still feel interactive on hover.

### Notes
- Do not lower opacity on the whole card — that would reduce headline readability.
- Use `--surface-0` (#101010) so cards sit almost flush against the page background while still being bordered.

---

## Task 3 — Typography Hierarchy: Mute Secondary Metadata

**Location:** `styles.css`
**Selector:** `.feed-article-meta`

### Current state
```css
.feed-article-meta {
  font-size: 11px;
  font-family: var(--font-mono);
  color: var(--text-secondary);
}
```

### Required changes
1. Drop the meta text color to tertiary:
   ```css
   color: var(--text-tertiary);
   ```
2. Slightly reduce opacity so headlines remain dominant:
   ```css
   opacity: 0.85;
   ```

### Notes
- Keep the same font-size and font-family.
- Also apply to `.feed-article--grid .feed-article-meta` if it has any overrides.

---

## Task 4 — Quick Links Sidebar: Monochrome Favicons, Color on Hover

**Location:** `styles.css`
**Selectors:** `.link-favicon`, `.link-row:hover .link-favicon`

### Current state
Favicons are rendered as `<img class="link-favicon">` inside `.link-ico`.

### Required changes
1. Add default monochrome/low-opacity filter:
   ```css
   .link-favicon {
     filter: grayscale(100%) opacity(0.7);
     transition: filter var(--dur-base) var(--ease-standard);
   }
   ```
2. Restore native brand color on row hover:
   ```css
   .link-row:hover .link-favicon {
     filter: grayscale(0%) opacity(1);
   }
   ```

### Notes
- Apply the filter only to `img.link-favicon`.
- Do not apply to monogram text fallbacks rendered inside `.link-ico`.

---

## Task 5 — Right Panel Simplification: Remove Trending

### 5a. Remove markup
**Location:** `newtab.html`

Remove the entire block:
```html
<section class="widget widget--trending">
  <div class="panel-label">Trending</div>
  <div id="trending-list" class="trending-list"></div>
</section>
```

Update the parent sidebar label from:
```html
<aside class="sidebar sidebar-right" aria-label="Stash and trending">
```
to:
```html
<aside class="sidebar sidebar-right" aria-label="Stash">
```

### 5b. Remove JavaScript logic
**Location:** `src/main.js`

1. Delete the `renderTrending` function (lines ~519–532):
   ```js
   function renderTrending(articles) {
     const el = $('#trending-list');
     if (!el) return;
     const top = articles.slice(0, 5);
     if (!top.length) {
       el.innerHTML = '<div class="trending-empty">Nothing trending yet.</div>';
       return;
     }
     el.innerHTML = top.map((a, i) => `
       <a class="trending-item" href="${escapeHtml(a.link)}" target="_blank" rel="noopener" data-link="${escapeHtml(a.link)}" title="${escapeHtml(a.title)}">
         <span class="trending-rank">${i + 1}</span>
         <span class="trending-text">${escapeHtml(a.title)}</span>
       </a>`).join('');
   }
   ```
2. Inside `renderFeed`, remove the call:
   ```js
   renderTrending(allArticles);
   ```

### 5c. Remove orphaned CSS
**Location:** `styles.css`

Delete the entire Trending styles block (lines ~2201–2239):
```css
.trending-list { ... }
.trending-item { ... }
.trending-item:hover { ... }
.trending-rank { ... }
.trending-text { ... }
.trending-empty { ... }
```

Also update the section comment from:
```css
/* ---- Right: stash (saved) + trending ---- */
```
to:
```css
/* ---- Right: stash (saved) ---- */
```

---

## Task 6 — Zikr Isolation: Increase Vertical Margin Below Zikr

**Location:** `styles.css`
**Selector:** `.zikr-line`

### Current state
```css
.zikr-line {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  max-width: var(--search-width);
  min-height: 28px;
  padding: 0 var(--sp-8);
  background: transparent;
  border: none;
  border-radius: var(--r-md);
  cursor: pointer;
  font-family: var(--font-sans);
}
```

### Required changes
Add bottom margin to create physical separation from the feed:
```css
margin-bottom: var(--sp-6);
```

### Notes
- `var(--sp-6)` equals 24px. Use this rather than a hardcoded value to stay consistent with the design-token system.
- Keep existing hover/focus styles intact.

---

## Task 7 — Feed Filtering Tags: Reduce Visual Weight

**Location:** `styles.css`
**Selector:** `.feed-pill`

### Current state
```css
.feed-pill {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 11px;
  font-family: var(--font-mono);
  color: var(--text-secondary);
  background: transparent;
  border: 1px solid var(--border-default);
  border-radius: var(--r-full);
  padding: 2px 6px 2px 10px;
  line-height: 1;
  transition: border-color var(--dur-fast);
}
```

### Required changes
1. Lighten the border:
   ```css
   border-color: var(--border-subtle);
   ```
2. Lower text prominence:
   ```css
   color: var(--text-tertiary);
   opacity: 0.9;
   ```
3. Keep the hover state subtle:
   ```css
   .feed-pill:hover {
     border-color: var(--border-default);
   }
   ```

### Notes
- Do not change the remove-button (`×`) behavior beyond what naturally inherits.
- Ensure the tag remains readable and clickable.

---

## Verification Checklist

- [ ] Thumbnails are grayscale/65% opacity by default and colorize on card hover.
- [ ] Feed cards use `--surface-0` background and a subtler border.
- [ ] Feed meta text is tertiary and slightly transparent.
- [ ] Quick-link favicons are grayscale/70% opacity and colorize on row hover.
- [ ] The Trending section is gone from the right sidebar, JS, and CSS.
- [ ] The Zikr line has an extra 24px bottom margin.
- [ ] Feed source pills have a subtler border and lower text opacity.
- [ ] `npm test` passes.
- [ ] `newtab.html` renders without console errors and the layout still respects the 3-column dashboard.

---

## Open Decision

**Card background choice:** The plan uses `--surface-0` for maximum blending with the dark backdrop. If the cards become too indistinct in practice, the fallback is `background: rgba(22, 22, 22, 0.6)` (translucent `--surface-1`) while keeping the subtler border.
