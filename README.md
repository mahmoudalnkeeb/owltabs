# OwlTabs

A focused new-tab page for software engineers. RSS feeds, quick links, and an built-in AI assistant — all in a dark, minimal interface.

## Features

- **RSS Feed Reader** — aggregate feeds from Hacker News, GitHub Trending, tech blogs, and any RSS/Atom source
- **Quick Links** — drag-and-drop favicon tiles for your most-used sites
- **AI Assistant** — Gemini-powered chat that can summarize articles, search your feed, and manage saved items
- **Keyboard-first** — `Cmd+K` to search, `Cmd+/` for AI, `Cmd+,` for settings
- **Vesper dark theme** — warm, low-contrast palette inspired by the Vesper VS Code theme
- **Staggered card animations** — entrance animations and hover effects
- **Freshness indicators** — pulsing dot on recent articles, age-based border tints
- **Ambient background** — subtle, slowly-shifting dark gradient
- **Saved articles** — bookmark articles for later, filter by saved
- **Customizable** — feed columns, font scale, accent color, 12/24h clock, grayscale mode

## Install from source

```bash
pnpm install
pnpm run build
```

Then load the `dist/` folder as an unpacked extension:

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** and select the `dist/` folder
4. Open a new tab to see OwlTabs

## Keyboard shortcuts

| Key | Action |
|-----|--------|
| `Cmd+K` / `Ctrl+K` | Focus search |
| `Cmd+/` / `Ctrl+/` | Toggle AI panel |
| `Cmd+,` / `Ctrl+,` | Toggle settings |
| `/` or `Space` | Focus search (when not in an input) |
| `F` | Focus feed search |
| `1`-`9` | Open quick link by index |
| `Escape` | Close active panel / blur search |

## Tech stack

- TypeScript + Vite (Manifest V3)
- No runtime framework — vanilla DOM rendering
- CSS custom properties with the Vesper design token system
- Gemini API for AI assistant
- SortableJS for drag-and-drop quick links

## License

[MIT](LICENSE)
