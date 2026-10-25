---
name: Expo workspace quirks
description: Environment-specific facts for the daily-tracker Expo app — icon imports, test runner, node types, Metro path aliases, image tooling, web pitfalls.
---

## Phosphor icons must be deep-required
`phosphor-react-native`'s `exports` map only allows `.` and `./src/icons/*` (TypeScript source). Importing the
root bundles ~1,500 icons; importing `src/icons/X` with `import` makes tsc type-check the vendor source,
which fails against react-native-svg 15.15 (`className` on Svg). Working pattern (all in one file):
`require('phosphor-react-native/src/icons/X').XIcon as Icon` with `import type { Icon } from 'phosphor-react-native'`.
**Why:** tried `paths` aliases to the `.d.ts` and a pnpm patch first; Expo's Metro resolver applies tsconfig
`paths` to bare specifiers from project files, so the alias leaked into the bundle.
**How to apply:** add icons only in the central icons module; never import Phosphor elsewhere.

## Tests: node --test + tsx, not Vitest
`vitest` cannot be installed here (`ERR_PNPM_FETCH_403` on `tinypool` — registry firewall). Tests run with
`node --import tsx --test tests/*.test.ts` using `node:assert/strict`. Node globals/types are not in Expo's
tsconfig base, so each test file starts with `/// <reference types="node" />` (with `@types/node` installed);
do not add `"types": ["node"]` globally — it would leak Node's timer types into RN code.

## Image tooling
No PIL, no sharp. ImageMagick `magick` is available and was used for app icons (icon/adaptive/splash/favicon).

## Web preview pitfalls (react-native-web)
- Nested `Pressable`s render as nested `<button>`s → React error overlay. Keep action buttons as siblings of
  the pressable area, never children.
- react-native-svg's `G origin=` prop emits an invalid `transform-origin` DOM attribute; use
  `transform={\`rotate(-90 cx cy)\`}` instead.
- `StyleSheet.absoluteFillObject` is missing from RN 0.86 types; use `absoluteFill`.
- RN `TextProps` already has `role` (ARIA), so a custom `role` prop needs `Omit<TextProps, 'role'>`.
