---
name: Vibrant Bharat AI
colors:
  surface: '#0b1326'
  surface-dim: '#0b1326'
  surface-bright: '#31394d'
  surface-container-lowest: '#060e20'
  surface-container-low: '#131b2e'
  surface-container: '#171f33'
  surface-container-high: '#222a3d'
  surface-container-highest: '#2d3449'
  on-surface: '#dae2fd'
  on-surface-variant: '#c7c4d7'
  inverse-surface: '#dae2fd'
  inverse-on-surface: '#283044'
  outline: '#908fa0'
  outline-variant: '#464554'
  surface-tint: '#c0c1ff'
  primary: '#c0c1ff'
  on-primary: '#1000a9'
  primary-container: '#8083ff'
  on-primary-container: '#0d0096'
  inverse-primary: '#494bd6'
  secondary: '#ffb95f'
  on-secondary: '#472a00'
  secondary-container: '#ee9800'
  on-secondary-container: '#5b3800'
  tertiary: '#4fdbc8'
  on-tertiary: '#003731'
  tertiary-container: '#00a392'
  on-tertiary-container: '#00302a'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#e1e0ff'
  primary-fixed-dim: '#c0c1ff'
  on-primary-fixed: '#07006c'
  on-primary-fixed-variant: '#2f2ebe'
  secondary-fixed: '#ffddb8'
  secondary-fixed-dim: '#ffb95f'
  on-secondary-fixed: '#2a1700'
  on-secondary-fixed-variant: '#653e00'
  tertiary-fixed: '#71f8e4'
  tertiary-fixed-dim: '#4fdbc8'
  on-tertiary-fixed: '#00201c'
  on-tertiary-fixed-variant: '#005048'
  background: '#0b1326'
  on-background: '#dae2fd'
  surface-variant: '#2d3449'
typography:
  display-lg:
    fontFamily: Outfit
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  display-lg-mobile:
    fontFamily: Outfit
    fontSize: 36px
    fontWeight: '700'
    lineHeight: 44px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Outfit
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Outfit
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
    letterSpacing: 0.05em
  label-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.08em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 8px
  xs: 4px
  sm: 12px
  md: 24px
  lg: 40px
  xl: 64px
  gutter: 24px
  margin-mobile: 16px
  margin-desktop: 80px
---

## Brand & Style

The design system is centered on the narrative of "Digital Heritage"—merging India’s rich cultural tapestry with cutting-edge artificial intelligence. It targets tech-savvy travelers and government stakeholders who value precision, luxury, and cultural authenticity.

The aesthetic follows a **Modern Glassmorphic** style with **Corporate/Modern** precision. It utilizes deep, ink-like backgrounds to provide a canvas for vibrant, "intelligent" accents. The emotional response is one of calm reliability and high-tech sophistication. Visual depth is achieved through translucent surfaces, soft glows that mimic the "aura" of an AI, and refined geometric shapes.

## Colors

The palette is anchored in **Deep Slate (#0F172A)** to provide a premium, stable foundation. 

- **Primary (Electric Indigo):** Used for high-action components, active AI states, and primary brand markers. It signifies intelligence and the digital future.
- **Secondary (Warm Amber):** Inspired by marigolds and sunset over the Ganges, this color provides cultural warmth and is used sparingly for highlights, ratings, and "special discovery" moments.
- **Tertiary (Vibrant Teal):** Represents nature and tranquility; used for success states and travel-specific categories like eco-tourism.
- **Surface & Background:** Layers are built using variations of Slate, with semi-transparent overlays (Glassmorphism) used to create hierarchy without losing the sense of depth.

## Typography

This design system utilizes a dual-font strategy. **Outfit** is used for headings to provide a modern, geometric, and friendly tech feel. **Inter** is used for body text and labels to ensure maximum readability and a systematic, functional appearance.

Generous tracking is applied to labels (uppercase) to enhance the "premium" feel. For mobile, display sizes are scaled down to ensure content density remains high while maintaining the impactful nature of the geometric sans-serif.

## Layout & Spacing

The layout utilizes a **12-column fluid grid** for desktop and a **4-column grid** for mobile. The rhythm is based on an 8px linear scale to ensure mathematical harmony across all components.

- **Desktop:** 80px side margins with 24px gutters. Content is centered with a max-width of 1440px to prevent excessive line lengths in AI chat responses.
- **Mobile:** 16px side margins. Cards and buttons typically span the full width of the safe area.
- **Vertical Spacing:** Generous whitespace (40px+) is encouraged between major sections to emphasize the premium nature of the AI assistant.

## Elevation & Depth

Hierarchy is established through **Tonal Layering** and **Glassmorphism**. 

1. **Floor:** Deep Slate (#0F172A) for the main application background.
2. **Surface:** Elevated Slate (#1E293B) with a 1px subtle border (#334155) for primary cards.
3. **Overlay:** Semi-transparent glass (Background Blur: 20px) for navigation bars and modal overlays.
4. **Interactive Glow:** Active components (like the AI input field or selected travel cards) should feature a subtle outer glow using the Primary color at 20% opacity to simulate "energy" and focus.

Shadows are used sparingly; when used, they are large, soft, and tinted with the background color to avoid "dirty" grey shadows.

## Shapes

The design system employs a "soft-geometric" shape language. Standard components use a **0.5rem (8px)** radius. However, container-level components and cards use **rounded-2xl (1.5rem/24px)** to create a welcoming, modern silhouette.

Buttons and chips are either fully pill-shaped (for primary actions) or use the standard 8px radius. Subtle patterns—inspired by Indian "Jaali" (latticework) but rendered in ultra-thin, low-contrast lines—can be used as background decorations on major landing sections.

## Components

- **Buttons:** Primary buttons are solid Electric Indigo with white text. Secondary buttons are outlined with a 1px glass border. Use high-horizontal padding (24px) for a luxury feel.
- **AI Chat Input:** A floating glassmorphic bar with a Primary color glow when focused. Include a prominent "Voice" icon using the Secondary Amber color.
- **Travel Cards:** Use `rounded-2xl`. Feature high-quality imagery with a subtle gradient overlay at the bottom for text legibility. Labels (Price/Rating) should use the Secondary color.
- **Chips/Tags:** Small, pill-shaped elements with low-opacity backgrounds of the tag's semantic color (e.g., Teal for "Nature", Amber for "Heritage").
- **Glass Overlays:** Bottom sheets and modals must use a background blur of at least 16px to maintain context of the underlying map or content.
- **Icons:** Use clean, 2px stroke-width icons. For cultural sites, use custom-drawn geometric line icons of landmarks (like the Taj Mahal or India Gate).