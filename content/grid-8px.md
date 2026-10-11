---
title: The 8px grid
description: "Why spacing and sizes use multiples of 8px and how the kit enforces it."
order: 5
---
Tailwind's spacing step is 4px (`p-1`). The kit uses **even steps only**, so every padding, gap and height is a multiple of 8px:

| Class | Size |
|---|---|
| `p-2`, `gap-2` | 8px |
| `p-4`, `gap-4` | 16px |
| `p-6` | 24px |
| `h-8`, `h-10`, `h-12` | 32, 40, 48px (controls) |

Odd steps (`p-3`, `p-5`, `gap-x-3`) are rewritten to the neighbouring even step in the generated specs.
Text sizes keep a baseline of 8px: `leading-6` (24px) and `leading-8` (32px) for body copy.
