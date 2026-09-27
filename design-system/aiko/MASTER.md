# AIko Design System

## Product direction

AIko is an adaptive language-learning product. The interface should feel calm, intelligent, encouraging, and focused on the next useful learning action rather than on gamification noise.

The visual system combines **Soft UI Evolution** with a restrained **Bento-style learning dashboard**. The learner experience should remain content-first and accessible; decorative effects must never compete with reading, listening, speaking, or review tasks.

## Core UX principles

1. **One primary action per screen.** The lesson or review action should win the hierarchy immediately.
2. **Practice before vanity metrics.** Streaks and XP are supporting information, not the first thing a learner must process.
3. **Evidence over decoration.** Progress, weak items, checkpoints, and feedback should be easy to scan.
4. **Mobile first.** Primary touch targets are at least 44×44px, with 48px preferred for buttons and navigation.
5. **No hover-only behavior.** Hover can enhance an interaction but never reveal the only usable control.
6. **Accessible by default.** Maintain visible focus states, semantic controls, readable line lengths, and reduced-motion support.
7. **Dark mode is designed, not inverted.** Surfaces, muted text, borders, and states must remain distinct independently in both themes.

## Visual language

### Style

- Soft, layered surfaces with restrained elevation.
- Large rounded cards: 24px default, 32px for major feature surfaces.
- Bento composition for dashboards, but avoid dense widget walls.
- Strong dark moss feature surfaces may be used for the single primary learning action.
- Persimmon is an accent and CTA color, not a general-purpose background.
- Use Lucide icons consistently. Do not use emoji as structural icons.

### Color roles

The implementation source of truth is `tailwind.config.ts` plus semantic CSS variables in `app/globals.css`.

- `paper`: app background.
- `surface`: primary card, navigation, and form surface.
- `surface-muted`: quiet grouped regions and secondary stat blocks.
- `ink`: primary text.
- `muted`: secondary text with accessible contrast.
- `border`: dividers and surface separation.
- `moss`: primary brand/action family.
- `persimmon`: warm accent, emphasis, and selected CTA family.
- `positive`: successful answers, completed actions, and healthy states.
- `warning`: recoverable cautions and actions that need attention.
- `danger`: errors, destructive actions, and incorrect-answer emphasis.

Use the matching `*-surface` and `*-border` tokens for feedback containers so status never depends on text color alone.

Do not introduce raw per-screen hex colors when a token can express the role.

## Typography

- Body/UI: Inter → Noto Sans JP → Japanese system sans fallbacks.
- Japanese/brand accent: Yu Mincho / Hiragino Mincho / Noto Serif JP fallbacks.
- Base body text: 16px where content is meant to be read.
- Supporting labels may use 11–14px when they are not paragraph content.
- Use 600 weight for headings and important controls; avoid excessive bold text.
- Use `tabular-nums` for percentages, timers, XP, counts, and other changing numeric data.

## Spacing

Use a 4/8px rhythm.

- Tight: 4–8px
- Control/internal: 12–16px
- Card: 20–32px
- Section: 32–48px
- Major page separation: 48–80px

Prefer adaptive gutters: 20px on small screens, 32px from small/tablet breakpoints upward.

## Interaction

- Buttons: minimum 48px height.
- Bottom navigation items: minimum 56px height plus safe-area padding.
- Micro-interactions: ~180ms.
- Standard state/progress transitions: ~280ms.
- Prefer opacity, color, shadow, and transform; do not animate layout dimensions for decoration.
- Press feedback may use a subtle `scale(0.98)` without changing layout bounds.
- Disabled controls must use semantic disabled attributes and clear reduced emphasis.
- Forms pair every error with its field or a visible `role="alert"`; helper text remains available through `aria-describedby`.

## Dialogs and temporary UI

- Modal dialogs use the shared dialog primitive so focus moves inside, remains contained, and returns to the trigger on close.
- Escape and backdrop dismissal are supported unless the action is intentionally non-dismissible.
- Destructive confirmations state the consequence and use the danger action treatment.
- Inline status messages use the shared alert primitive with an icon and text, never color alone.
- Popovers that only explain selected vocabulary remain non-modal and must not announce themselves as dialogs.

## Navigation

### Desktop

Persistent left navigation is appropriate for learner routes. Active state must use more than color alone: surface treatment plus icon/indicator and `aria-current`.

### Mobile

Keep the bottom navigation to five destinations maximum:

1. Home
2. Learn
3. Review
4. Progress
5. Profile

Secondary routes live under those destinations rather than expanding the bottom navigation.

## Page hierarchy

### Home

1. Learner greeting/context.
2. Primary lesson action.
3. Daily goal.
4. Streak and XP.
5. Review needs.
6. Level progress.

### Learn

Keep the assignment screen intentionally focused. Do not expose the hidden lesson topic before the lesson starts. When resuming, the saved checkpoint is primary; starting a fresh lesson is secondary.

### Review

Make the actionable weak-item count and `Start review` control obvious. Empty state should explain the recovery path: complete another lesson.

### Progress

Show completion numerically as well as visually so color is never the only carrier of meaning. Learned vocabulary, kanji, and grammar counts should be easy to compare without chart clutter.

## Dark mode

- Background: deep green-black rather than pure black.
- Cards: visibly raised dark green surface.
- Muted copy: minimum 3:1 contrast; normal body copy should target 4.5:1.
- Keep moss/persimmon accents recognizable but reduce bright background fills with translucent treatments.
- Borders must remain visible.

## Anti-patterns

Avoid:

- AI-purple/pink gradient branding.
- Excessive glassmorphism or blur used only as decoration.
- Emoji navigation icons.
- Tiny touch targets.
- Streak/XP dominating the primary learning task.
- Multiple equally loud CTAs on one screen.
- Random shadow values or radius values per component.
- Low-contrast gray-on-gray body text.
- Hover-only actions.
- Decorative animation longer than 500ms.
- Raw color values inside React components when semantic tokens exist.

## Pre-delivery checklist

- [ ] Keyboard focus is visible on every interactive control.
- [ ] Touch targets are at least 44×44px; primary buttons are 48px high.
- [ ] Mobile bottom navigation respects safe-area insets.
- [ ] Main content is not hidden behind fixed navigation.
- [ ] Light and dark surfaces/borders/text remain distinguishable.
- [ ] Reduced-motion users do not receive unnecessary animation.
- [ ] Icons are Lucide/vector icons with consistent sizing.
- [ ] Color is not the only indicator of progress or selection.
- [ ] Loading states reserve space and explain what is happening.
- [ ] The primary task appears before secondary metrics on mobile.
