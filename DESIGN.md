---
name: Vesper Agentic
colors:
  surface: "#171310"
  surface-dim: "#171310"
  surface-bright: "#3e3834"
  surface-container-lowest: "#110d0b"
  surface-container-low: "#1f1b18"
  surface-container: "#231f1b"
  surface-container-high: "#2e2926"
  surface-container-highest: "#393430"
  on-surface: "#ebe1db"
  on-surface-variant: "#d5c3b7"
  inverse-surface: "#ebe1db"
  inverse-on-surface: "#352f2c"
  outline: "#9d8e83"
  outline-variant: "#50453c"
  surface-tint: "#f2bc8e"
  primary: "#ffebdd"
  on-primary: "#492807"
  primary-container: "#ffc799"
  on-primary-container: "#7a512c"
  inverse-primary: "#7f5530"
  secondary: "#73d9b2"
  on-secondary: "#003828"
  secondary-container: "#008260"
  on-secondary-container: "#e3fff0"
  tertiary: "#d6f3ff"
  on-tertiary: "#003543"
  tertiary-container: "#aad9ec"
  on-tertiary-container: "#316070"
  error: "#ffb4ab"
  on-error: "#690005"
  error-container: "#93000a"
  on-error-container: "#ffdad6"
  primary-fixed: "#ffdcc1"
  primary-fixed-dim: "#f2bc8e"
  on-primary-fixed: "#2e1500"
  on-primary-fixed-variant: "#643e1b"
  secondary-fixed: "#8ff6cd"
  secondary-fixed-dim: "#73d9b2"
  on-secondary-fixed: "#002116"
  on-secondary-fixed-variant: "#00513b"
  tertiary-fixed: "#baeafd"
  tertiary-fixed-dim: "#9fcee0"
  on-tertiary-fixed: "#001f28"
  on-tertiary-fixed-variant: "#1b4c5c"
  background: "#171310"
  on-background: "#ebe1db"
  surface-variant: "#393430"
typography:
  h2:
    fontFamily: Inter
    fontSize: 26px
    fontWeight: "600"
    lineHeight: 32px
    letterSpacing: -0.02em
  h3:
    fontFamily: Inter
    fontSize: 19px
    fontWeight: "500"
    lineHeight: 24px
    letterSpacing: -0.01em
  body:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: "400"
    lineHeight: 22px
    letterSpacing: "0"
  body-sm:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: "400"
    lineHeight: 18px
    letterSpacing: "0"
  caption:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: "400"
    lineHeight: 14px
    letterSpacing: 0.05em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 48px
---

## Brand & Style

The design system is engineered for high-focus productivity, serving as a sophisticated entry point for a browser-based workflow. It targets developers, knowledge workers, and power users who require a low-friction, distraction-free environment.

The aesthetic is "Obsidian Tech"—a blend of deep minimalism and precision engineering. By utilizing a dark-first approach, the system reduces eye strain while allowing small pops of vibrant, organic color to signal status and intent. The emotional response is one of calm, focused control. Surfaces are layered with subtle depth, avoiding traditional skeuomorphism in favor of clear, architectural hierarchy.

## Colors

This design system uses a curated palette of deep neutrals punctuated by two specific accent roles.

- **Primary (Accent):** A warm orange used sparingly for focus states, highlights, and primary calls to action.
- **Secondary (Mint):** Reserved for success states, read indicators, and active utility signals.
- **Surface Hierarchy:**
  - `Surface-0` is the absolute base, the "void" of the new tab.
  - `Surface-1` serves as the container for widgets and panels.
  - `Surface-2` provides contrast for interactive elements like inputs and skeletons.

The background should feature a subtle radial gradient: a warm `#FFC799` glow at 5% opacity anchored top-left, and a cool `#98FFD5` glow at 5% opacity anchored top-right, creating a sense of atmospheric depth without compromising legibility.

## Typography

Typography is systematic and utilitarian. **Inter** provides high legibility for the primary interface, while **JetBrains Mono** is utilized for technical data, metadata, and captions to reinforce the "agentic" and developer-friendly nature of the system.

- **Headlines:** Use tight letter-spacing and medium-to-semibold weights to maintain a strong presence on the dark background.
- **Mono Captions:** Always rendered in JetBrains Mono, typically using `Text-Tertiary` or `Text-Secondary` to provide technical context without cluttering the visual hierarchy.
- **Body Text:** Standardized at 15px to ensure comfort during prolonged reading of dashboard widgets.

## Layout & Spacing

The layout is centered and structured. The primary workflow revolves around a fixed-width central column (1040px), ensuring content remains digestible and predictable.

- **Omnibox:** The central interaction point is a 620px wide search/command bar, floating with prominence.
- **The Topbar:** A slim, fixed 52px header handles global navigation and profile settings.
- **Grid:** Use a 4px baseline grid. Content within cards should typically follow a 16px (md) or 24px (lg) padding rule depending on the density required.
- **Adaptive Behavior:** On mobile/tablet, the 1040px container becomes fluid with 16px side margins. Panels should transition to full-screen or bottom-sheets.

## Elevation & Depth

This design system avoids heavy drop shadows. Depth is communicated through **Tonal Layering** and **Subtle Outlines**:

- **Level 0 (Base):** `Surface-0`. The deepest layer.
- **Level 1 (Cards):** `Surface-1` with a 1px border of `#262626`. This creates a crisp, architectural separation.
- **Level 2 (Interaction):** `Surface-2` is used for elements that sit "inside" cards, like input fields or button backgrounds.
- **Overlays:** Modals or dropdowns use `Surface-1` but add a soft, low-opacity (20%) black shadow with a 20px blur to lift them visually above the dashboard grid.

## Shapes

The shape language is generous and modern, utilizing soft "squircle-like" corners to offset the technical coldness of the dark palette.

- **Large Elements (Containers):** Use `radius_xl` (24px) for the main outer containers or prominent feature areas.
- **Medium Elements (Cards):** Use `radius_lg` (16px) for standard dashboard widgets and panels.
- **Small Elements (Inputs/Buttons):** Use `radius_md` (12px) for interactive components, ensuring they feel tactile and approachable.

## Components

- **Buttons:** Primary buttons use a ghost style with an `Accent` border and text, or a solid `Surface-2` fill for secondary actions. Hover states should introduce a subtle 0.1 opacity tint of the accent color.
- **Omnibox:** A large, `Surface-1` element with `radius_xl`. It features a 1px `Border` that glows slightly (low-spread `Accent` shadow) when focused.
- **Cards:** Defined by `Surface-1`, `radius_lg`, and a 1px `Border`. Content within cards should use `Text-Secondary` for descriptions and `Text-Primary` for titles.
- **Inputs:** `Surface-2` background, `radius_md`, with `Text-Secondary` placeholder text. Focus state changes border color to `Accent`.
- **Chips:** Small, `Surface-2` pill shapes with `caption` typography (Mono). Used for tags and status indicators.
- **Skeletons:** Use `Surface-2` with a linear-gradient shimmer moving from left to right, transitioning through a slightly lighter grey to simulate loading state.
- **Animations:** Fades should be `200ms ease-out`. Panel slide-ins should use a `cubic-bezier(0.16, 1, 0.3, 1)` for a "snappy yet smooth" feel.
