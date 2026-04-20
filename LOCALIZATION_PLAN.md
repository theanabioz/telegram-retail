# Localization Plan

## Goal
Introduce complete, UI-friendly localization for the Telegram Retail app with:
- `en`
- `ru`
- `pt-PT`

The objective is not literal translation. The objective is a clean, compact, mobile-friendly interface in every supported language.

## Principles
- Translate by interface context, not by dictionary.
- Prefer shorter UI labels when space is tight.
- Keep separate keys for:
  - navigation
  - screen titles
  - buttons
  - statuses
  - empty states
  - notifications
  - detailed descriptions
- Avoid reusing one translation key across unrelated contexts if wording length or tone differs.
- Preserve visual balance on small screens, especially for Russian.

## Current Status

Completed:
- Added lightweight app locale store with persistence in `localStorage`
- Added language switcher in seller settings
- Added language switcher in admin settings
- Localized:
  - seller bottom nav
  - admin bottom nav
  - seller main tab titles
  - admin main tab titles
  - seller settings blocks
  - admin settings blocks

## Phase 1: Shared Shell
Status: completed

Scope:
- language storage
- locale switcher
- shell navigation
- top-level screen titles
- settings entry points

## Phase 2: Seller Main Workflow
Status: pending

Scope:
- Checkout
- Draft Cart
- Discount modal
- Orders list
- Receipt details

Tasks:
- localize product/cart actions
- localize payment labels
- localize sale statuses
- localize receipt sections
- localize search placeholders
- review tight layouts for Russian and Portuguese

## Phase 3: Seller Operations
Status: pending

Scope:
- My Stock
- Shift overview
- Shift history
- Shift report detail

Tasks:
- localize stock actions and movement language
- localize shift statuses and helper copy
- localize time/revenue/sales metric labels
- review all dense metric cards for overflow

## Phase 4: Admin Overview + Sales
Status: pending

Scope:
- Overview
- Sales

Tasks:
- localize dashboard metric cards
- localize filters and segmented controls
- localize ledger rows
- localize chart titles/subtitles
- localize recent sales and store performance blocks
- keep labels compact for pills, badges, and tabs

## Phase 5: Admin Inventory
Status: pending

Scope:
- Stock
- Product details
- Product settings
- Product archive
- Product creation flows

Tasks:
- localize stock movement wording
- localize product management forms
- localize archive actions
- review button widths and segmented controls

## Phase 6: Admin Team
Status: pending

Scope:
- Stores
- Staff
- Seller details
- Store details
- activity feeds
- profile/worklog/overview tabs

Tasks:
- localize role and status labels
- localize feed actions
- localize creation/edit flows
- verify compact list layouts under longer strings

## Phase 7: Telegram / System Text
Status: pending

Scope:
- telegram notifications
- backend-generated user-facing messages
- bot/system copy visible to operators/admins

Tasks:
- localize notification templates
- keep reports clear and natural in each language
- preserve business tone, not literal phrasing

## Phase 8: Locale-Aware Formatting
Status: pending

Scope:
- date formatting
- time formatting
- number formatting
- currency formatting

Tasks:
- route formatting through app locale instead of device default
- use `pt-PT`, `ru-RU`, `en-GB` or chosen final locale mapping
- validate 24-hour output remains correct in all languages

## Phase 9: Visual QA
Status: pending

Tasks:
- review seller UI in all 3 languages
- review admin UI in all 3 languages
- identify overflow, wrapping, truncation, and awkward wording
- shorten strings where needed instead of forcing layout hacks

## Translation Rules

### Navigation
- must always be shortest possible natural label

### Buttons
- should prefer action verbs
- must fit narrow mobile widths

### Statuses
- must be visually compact and badge-friendly

### Metrics
- should be concise nouns, not long phrases

### Notifications
- should be human-readable and slightly more descriptive

## Execution Order
1. Seller main flow
2. Seller operations
3. Admin overview and sales
4. Admin inventory
5. Admin team
6. Telegram/system texts
7. locale-aware formatting
8. visual QA pass

## Working Rule
Each phase should be:
- implemented
- built successfully
- visually checked
- committed and deployed

Only then move to the next phase.
