# Infosys InvestKing Design System

## Direction

- Overall genre: modern-minimal
- Theme: Cobalt
- Home macrostructure: Split Studio
- Participant and operator macrostructure: Workbench
- Broadcast macrostructure: Stat-Led with an editorial news desk
- Navigation: N1b-derived task rail; every item is a real route, never a decorative menu
- Footer: Ft2 inline rule
- Enrichment: none; live game data is the visual proof

The shared language is engineered paper, cobalt emphasis, hairline rules and tabular data. Participant screens add controlled play through score-like labels and quicker state contrast. Operator screens stay utilitarian, with danger and availability stated in text as well as colour. Broadcast screens use a darker editorial variant so they remain legible across a classroom.

## Accessibility and responsive rules

- Minimum interactive target: 44 × 44 CSS pixels.
- Focus indicators use `--color-focus` and never animate.
- Colour is never the only indicator for status or market direction.
- Mobile is verified at 320, 375, 414 and 768 CSS pixels.
- Navigation remains one line and scrolls in normal flow instead of wrapping.
- Motion is limited to button press, dialog entrance and live state feedback; reduced motion removes spatial movement.

## Source tokens

The canonical source is [`client/tokens.css`](client/tokens.css). Application CSS must consume those roles rather than inventing local colour, type, spacing, radius or motion values.

## Exports

### Tailwind v4 `@theme`

```css
@theme {
  --color-paper: oklch(98% 0.008 250);
  --color-paper-2: oklch(95.5% 0.014 250);
  --color-paper-3: oklch(92% 0.022 250);
  --color-ink: oklch(20% 0.035 255);
  --color-ink-2: oklch(31% 0.04 255);
  --color-rule: oklch(86% 0.025 250);
  --color-rule-2: oklch(71% 0.04 250);
  --color-muted: oklch(49% 0.035 255);
  --color-accent: oklch(53% 0.22 260);
  --color-focus: oklch(65% 0.18 75);
  --font-display: "Space Grotesk", "Pretendard", ui-sans-serif, system-ui, sans-serif;
  --font-body: "Pretendard", "Noto Sans KR", ui-sans-serif, system-ui, sans-serif;
  --font-outlier: "JetBrains Mono", Consolas, ui-monospace, monospace;
  --spacing-3xs: 0.25rem;
  --spacing-2xs: 0.5rem;
  --spacing-xs: 0.75rem;
  --spacing-sm: 1rem;
  --spacing-md: 1.5rem;
  --spacing-lg: 2rem;
  --spacing-xl: 3rem;
  --spacing-2xl: 4.5rem;
  --radius-card: 0.75rem;
  --radius-pill: 999px;
  --radius-input: 0.5rem;
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-in: cubic-bezier(0.7, 0, 0.84, 0);
  --ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);
}
```

### DTCG `tokens.json`

```json
{
  "$schema": "https://design-tokens.github.io/community-group/format/",
  "color": {
    "paper": { "$value": "oklch(98% 0.008 250)", "$type": "color" },
    "paper-2": { "$value": "oklch(95.5% 0.014 250)", "$type": "color" },
    "ink": { "$value": "oklch(20% 0.035 255)", "$type": "color" },
    "accent": { "$value": "oklch(53% 0.22 260)", "$type": "color" },
    "focus": { "$value": "oklch(65% 0.18 75)", "$type": "color" }
  },
  "font": {
    "display": { "$value": "Space Grotesk, Pretendard, ui-sans-serif, system-ui, sans-serif", "$type": "fontFamily" },
    "body": { "$value": "Pretendard, Noto Sans KR, ui-sans-serif, system-ui, sans-serif", "$type": "fontFamily" },
    "outlier": { "$value": "JetBrains Mono, Consolas, ui-monospace, monospace", "$type": "fontFamily" }
  },
  "space": {
    "xs": { "$value": "0.75rem", "$type": "dimension" },
    "sm": { "$value": "1rem", "$type": "dimension" },
    "md": { "$value": "1.5rem", "$type": "dimension" },
    "lg": { "$value": "2rem", "$type": "dimension" },
    "xl": { "$value": "3rem", "$type": "dimension" }
  },
  "duration": {
    "micro": { "$value": "120ms", "$type": "duration" },
    "short": { "$value": "200ms", "$type": "duration" },
    "long": { "$value": "420ms", "$type": "duration" }
  }
}
```

### shadcn/ui variables

```css
:root {
  --background: 98% 0.008 250;
  --foreground: 20% 0.035 255;
  --card: 95.5% 0.014 250;
  --card-foreground: 20% 0.035 255;
  --popover: 98% 0.008 250;
  --popover-foreground: 20% 0.035 255;
  --primary: 53% 0.22 260;
  --primary-foreground: 98% 0.008 250;
  --secondary: 92% 0.022 250;
  --secondary-foreground: 31% 0.04 255;
  --muted: 86% 0.025 250;
  --muted-foreground: 49% 0.035 255;
  --accent: 53% 0.22 260;
  --accent-foreground: 98% 0.008 250;
  --destructive: 49% 0.19 27;
  --destructive-foreground: 98% 0.008 250;
  --border: 86% 0.025 250;
  --input: 86% 0.025 250;
  --ring: 65% 0.18 75;
  --radius: 0.75rem;
}
```

### Plain CSS

Use `@import "./tokens.css";` from the client entry stylesheet, then reference `var(--color-paper)`, `var(--font-body)` and the matching role tokens. Raw palette values belong only in `client/tokens.css` and export examples in this document.
