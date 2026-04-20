# Optimistic UI Migration Plan

## Goal

Translate the entire application to a single interaction model:

- user action updates UI immediately
- network request runs in background
- server response reconciles local state softly
- rollback happens only for the affected entity on real failure
- full-screen or section-level loading should become rare

The target is not "no network delays exist".  
The target is "the user almost never has to wait for the interface to react".

## Core Principles

### 1. Local First
- Every user action should patch local state first whenever rollback is safe.
- UI should respond before the request completes.

### 2. Scoped Pending State
- Do not use one global `mutating` flag for large sections.
- Replace broad loading locks with entity-scoped pending markers.

Examples:
- `pendingStoreIds`
- `pendingSellerIds`
- `pendingProductIds`
- `pendingStoreProductIds`
- `pendingInventoryAdjustmentIds`
- `pendingDraftItemIds`
- `pendingShiftAction`

### 3. Background Reconciliation
- Server responses should refresh only the touched state slice.
- Avoid full `loadInventory()`, `loadProducts()`, `loadStores()`, `loadStaff()`, `bootstrap()` after every mutation.
- Use targeted reconciliation whenever the backend returns enough data.

### 4. Soft Refresh Instead Of Blocking Refresh
- Filter switches, tab switches, store switches, and date-range switches should use cached data immediately.
- Background refresh may happen silently or with a tiny local "Updating" signal.
- No central loading block should appear after the page is already visible.

### 5. Rollback Only The Changed Slice
- If a mutation fails, restore only the affected entity or list.
- Never reset the whole screen to recover from one failed action.

### 6. Shared Infrastructure
- We should not keep hand-writing ad hoc optimistic flows per screen.
- Add shared helper patterns so Seller and Admin evolve under the same rules.

## Current State Snapshot

## Seller

### Already partially optimistic
- draft cart item add
- draft cart item quantity change
- draft cart item removal
- checkout optimistic sale insertion
- startup cache hydration
- shift details prefetch cache

### Still not unified
- shift actions still rely on broad `actionLoading`
- delete sale uses blocking request + `bootstrap()`
- returns use blocking request + `bootstrap()`
- seller stock actions use blocking request + `bootstrap()`
- some optimistic flows still risk race conditions when stale server data overwrites local data

## Admin

### Current weakness
- admin store relies heavily on:
  - global `mutating`
  - global `loadingInventory`
  - global `loadingSales`
  - full reloads after mutations

### Problematic pattern used repeatedly
- send mutation
- show loading state
- call `loadInventory()`, `loadStores()`, `loadStaff()`, `loadProducts()`, or `loadSalesOverview()`
- repaint large parts of the screen

This is the main reason the admin UI still feels less immediate than seller UI.

## Target Architecture

## Layer 1. Query Cache By View Key

We need persistent in-memory caches for main query families.

### Admin
- `inventoryCacheByStoreId`
- `salesCacheByFilterKey`
- `storesCache`
- `staffCache`
- `productsCache`
- `archivedProductsCache`
- `dashboardCache`

### Seller
- `sellerStartupCache`
- `draftCache`
- `salesCache`
- `shiftHistoryCacheByParams`
- `shiftDetailsCacheById`
- `inventoryHistoryCache`

Purpose:
- instant tab/view switch
- instant filter switch
- soft refresh without visible flicker

## Layer 2. Optimistic Mutation Helpers

Create shared helper patterns for state patching.

Recommended helper families:
- `runOptimisticListMutation`
- `runOptimisticEntityMutation`
- `runOptimisticInventoryMutation`
- `runOptimisticDraftMutation`
- `runOptimisticShiftMutation`

Each helper should support:
- capture previous slice
- apply optimistic patch
- mark pending ids
- execute request
- reconcile server response
- rollback on failure
- clear pending ids

## Layer 3. Scoped Pending Maps

Replace broad boolean loading with fine-grained pending tracking.

Examples:
- `pendingStoreIds: Record<string, true>`
- `pendingSellerIds: Record<string, true>`
- `pendingProductIds: Record<string, true>`
- `pendingStoreProductIds: Record<string, true>`
- `pendingShiftIds: Record<string, true>`
- `pendingDraftItemIds: Record<string, true>`

UI effect:
- only the touched row/button shows pending feedback
- surrounding page remains interactive

## Layer 4. Reconciliation Strategy

Not every action needs the same sync behavior.

### Reconcile from server response directly
Use when mutation endpoint returns enough data.

Examples:
- draft item updates
- checkout result
- product create/update/archive/restore if endpoint payload is rich enough

### Reconcile with targeted follow-up fetch
Use when mutation result is partial.

Examples:
- load one product
- load one store product
- load one shift
- load one seller record

### Background section refresh only when necessary
Use when business effects are broad but local UI still needs to stay instant.

Examples:
- restock/write-off affecting summary counters
- shift stop affecting summaries/history
- admin dashboard cards after sales changes

## Migration Order

This order is optimized for maximum UX gain with controlled risk.

## Phase 1. Build Shared Optimistic Infrastructure

### Objective
Prepare the base primitives before mass refactoring screens.

### Files likely involved
- `frontend/src/store/useAdminManagementStore.ts`
- `frontend/src/store/useSellerHomeStore.ts`
- possibly a new helper file:
  - `frontend/src/store/optimistic.ts`
  - or `frontend/src/lib/optimistic.ts`

### Tasks
- define pending map patterns
- define rollback helper pattern
- define view-key cache pattern
- define reconciliation conventions
- document mutation categories in code comments where needed

### Done when
- both stores can use shared optimistic helpers
- new mutations no longer require full-screen reload assumptions

## Phase 2. Admin Inventory Refactor

### Why first
This area currently gives the biggest UX pain and the biggest visual loading cost.

### Scope
- inventory store switch
- stock mode data usage
- product create
- product update
- product archive
- product restore
- product delete
- store-product price/status update
- restock
- write-off
- adjust

### Specific goals

#### Store switch
- selecting another store updates view immediately from `inventoryCacheByStoreId`
- no blocking loading state
- background fetch refreshes current store data

#### Stock mutation
- current stock updates instantly
- recent movements update instantly
- summary counters update instantly
- touched row/button becomes pending, not the whole page

#### Adjust behavior
- `adjust` should mean "set exact quantity"
- optimistic patch must set stock to target quantity immediately

#### Product mutations
- product list updates immediately
- archived/active product lists update immediately
- current detail screen reconciles smoothly

### Done when
- `loadInventory()` is no longer called as a full refresh after most inventory mutations
- inventory screen feels immediate for store switch and stock actions

## Phase 3. Admin Team Refactor

### Scope
- create store
- update store
- create seller
- update seller profile data
- assign seller to store
- later: commission update and seller activity/worklog if backend is extended

### Specific goals
- new store appears instantly in list
- new seller appears instantly in list
- store/seller edits update rows instantly
- assignment updates seller/store relationship instantly
- modals close immediately after optimistic success path starts

### Done when
- `loadStores()` and `loadStaff()` stop being the default post-mutation strategy

## Phase 4. Admin Sales Refactor

### Scope
- period switch
- store filter
- seller filter
- status filter
- sales/returns mode switch

### Specific goals
- every filter switch is immediate
- previous data snapshot remains visible during refresh
- data is served first from `salesCacheByFilterKey`
- background fetch refreshes silently
- no top "Loading sales..." type shift

### Done when
- Sales screen behaves like a native dashboard filter surface

## Phase 5. Admin Overview Synchronization

### Scope
- dashboard metrics
- revenue flow chart
- recent sales
- store performance

### Specific goals
- soft polling continues to update cards quietly
- when related admin/seller mutations happen, overview can patch local counters first where reasonable
- no broad dashboard loading once data is present

### Done when
- overview never visually resets after the app is already open

## Phase 6. Seller Shift Refactor

### Why important
This is high-visibility and previously showed flicker/race issues.

### Scope
- start shift
- pause shift
- resume shift
- stop shift

### Specific goals
- status changes instantly
- worked/pause state updates instantly
- no temporary fallback to stale pre-mutation server state
- current shift card and shift history stay consistent

### Main technical risk
- stale responses overriding newer optimistic state

### Required mitigation
- mutation versioning or request sequencing per shift action
- only latest confirmed state may commit

### Done when
- no flicker on start/stop/pause/resume

## Phase 7. Seller Stock Refactor

### Scope
- restock product
- write-off product

### Specific goals
- product stock updates instantly
- local stock cards update instantly
- inventory history updates instantly
- no `bootstrap()` after each stock change

### Done when
- seller stock operations feel as immediate as draft cart actions

## Phase 8. Seller Order Mutations Refactor

### Scope
- delete sale
- create return

### Specific goals
- sale list updates instantly or near-instantly with targeted patch
- product stock effects reconcile without full app bootstrap
- admin/polling compatibility remains safe

### Note
This phase needs careful business validation because these actions affect audit state and inventory.

## Phase 9. Seller Draft Stability Hardening

### Scope
- draft add item
- draft quantity stepper
- discount add/edit/remove
- remove item
- app reopen with existing draft

### Specific goals
- eliminate race where quantity briefly changes then reverts incorrectly
- eliminate delayed draft appearance after app reopen
- ensure startup hydration and live reconciliation do not fight each other

### Required work
- inspect `draftMutationVersion` logic
- ensure cache hydration and background draft fetch merge predictably
- add deterministic "server wins only if newer than optimistic baseline" rule

## Phase 10. Global Cleanup

### Remove or reduce
- broad `mutating`
- broad `loadingInventory`
- broad `loadingSales`
- broad `actionLoading` where per-entity pending is enough
- section-wide loading banners after initial hydration

### Keep only where justified
- first boot with no cache
- critical one-shot transitions
- destructive operations that truly must block one entity

## Mutation Strategy Matrix

## Category A. Always Optimistic
- filter switch
- tab switch
- store switch
- seller/store detail sub-tab switch
- draft quantity changes
- discount editing

## Category B. Optimistic With Scoped Rollback
- product update
- store product update
- restock
- write-off
- adjust
- create seller
- create store
- assignment changes
- shift start/pause/resume/stop

## Category C. Optimistic But Audit-Sensitive
- checkout
- sale deletion
- returns
- product archive / restore / delete

These require extra caution but should still avoid full-screen waiting.

## Category D. Not Worth Full Optimism
- first app bootstrap with no cache at all
- rare admin-only flows where safety beats immediacy

Even here we should still prefer cached-first rendering if any prior data exists.

## Required Store Changes

## `useAdminManagementStore.ts`

### Must change
- replace broad `mutating` usage with scoped pending maps
- add cached snapshots by store/filter
- stop chaining full reloads after each mutation
- patch inventory/products/stores/staff locally
- keep silent refresh entry points for reconciliation

### End state
- store becomes state-first, fetch-second

## `useSellerHomeStore.ts`

### Must change
- reduce reliance on `bootstrap()` after operational actions
- add scoped pending state for shift and stock actions
- stabilize draft reconciliation against stale server data
- patch shift history and inventory locally where safe

### End state
- seller store becomes consistent across draft, shift, stock, and order mutations

## UI Changes Expected

These are architecture-driven UI adjustments, not redesign work.

### Replace broad loading states with:
- disabled current button only
- tiny row-level pending dot/spinner if needed
- "Updating" pill only on the touched block when truly helpful

### Remove:
- loading banners that push layout
- page-level lock for local row mutation
- large interaction freezes after user tap

## Testing Plan For Migration

Each phase must be verified before moving on.

## For every optimistic mutation
- action updates UI instantly
- success keeps final state correct
- server response does not visually revert to stale state
- failure rolls back only affected slice
- unrelated page regions stay interactive

## For every cached view switch
- first switch uses current cache instantly
- background refresh updates without page jump
- stale cache is replaced softly

## Special regression checks
- seller draft quantity race
- shift flicker after start/stop
- inventory totals drifting from recent movements
- admin overview not matching recent actions after local patch

## Execution Checklist

## Step 1
- create optimistic helper utilities

## Step 2
- refactor Admin Inventory

## Step 3
- refactor Admin Team

## Step 4
- refactor Admin Sales

## Step 5
- refactor Admin Overview synchronization

## Step 6
- refactor Seller Shift

## Step 7
- refactor Seller Stock

## Step 8
- refactor Seller sale deletion / returns

## Step 9
- harden Seller Draft consistency

## Step 10
- remove remaining global loading patterns

## Definition Of Success

We will consider the migration successful when:

- the app reacts instantly to almost every tap
- screen-wide loading after initial hydration becomes rare
- admin and seller follow the same optimistic design philosophy
- stale server responses no longer visibly override newer local actions
- rollback is precise and local
- the interface feels operationally fast both in Telegram and desktop browser

## Notes For Future Work

- Realtime subscriptions can later complement this architecture but should not replace it.
- Optimistic UI is the primary perceived-performance strategy.
- Realtime is a synchronization enhancer, not the core interaction model.
