# Localization Audit: Russian and Portuguese

## Scope

This audit covers the current local browser build of the app outside Telegram WebView.

Verified locally:
- frontend runs in a regular browser at `http://127.0.0.1:5173`
- backend runs locally at `http://127.0.0.1:4000`
- Playwright walkthrough completed successfully across the main admin and seller flows

Audited locales:
- Russian (`ru`)
- Portuguese (`pt`)

Reference screenshots used during the audit are stored in:
- `/Users/theanabioz/Documents/telegram-retail/test-results`

## General Assessment

Overall the localization quality is already strong:
- there are no catastrophic overflows or broken layouts in the main flows
- Russian and Portuguese both feel much more product-oriented than machine-translated
- the app remains usable and visually consistent in both languages

Main remaining problems are not about missing translation coverage anymore. They are mostly:
- wording that is technically translated but not yet UI-optimal
- a few places where long labels are close to their width limits
- terminology that is understandable but could feel more natural for a retail product
- some places where English product names are naturally mixed with localized UI, which is acceptable but should stay intentional

## High Priority Findings

### 1. Seller orders screen in Russian still feels too verbose

Screen:
- `Seller -> Orders`

Current pattern:
- `Завершенная продажа`
- `Открыть чек`

Issue:
- The wording is clear, but visually heavier than the surrounding minimalist UI.
- Repeating `Завершенная продажа` on every row creates visual noise.

Recommendation:
- Consider shortening the row title to `Продажа`.
- Keep status implied by the fact that the row is in the orders history.

Why:
- This would reduce vertical heaviness and align better with the cleaner admin sales cards.

### 2. Seller stock actions in Russian are understandable but not yet fully product-polished

Screen:
- `Seller -> My Stock`

Current wording:
- `Пополнить`
- `Списать`
- `Изменить на`

Issue:
- These labels fit, but the composition still reads slightly mechanical.
- `Изменить на` especially feels more like a system phrase than a retail action label.

Recommendation:
- Review whether the current language should be simplified or made more operational.
- This is not a layout bug, but it is a UX wording opportunity.

### 3. Portuguese seller stock wording is readable but slightly mixed in tone

Screen:
- `Seller -> Meu stock`

Current wording:
- `Repor`
- `Abater`
- `Ajustar em`

Issue:
- The screen is readable, but the terminology mix feels slightly uneven.
- `Stock atual` and `Meu stock` are fine for Portuguese retail context, but action phrasing should be reviewed together to ensure one consistent tone.

Recommendation:
- Do a dedicated Portuguese wording pass on stock operation verbs as one group instead of one-by-one edits.

## Medium Priority Findings

### 4. Russian seller checkout bottom cart bar is readable, but second line is all-caps action text in Portuguese only

Screens:
- `ru-seller-checkout`
- `pt-seller-checkout`

Current pattern:
- Russian: `ОТКРЫТЬ КОРЗИНУ`
- Portuguese: `VER CARRINHO`

Issue:
- Both fit, but the all-caps micro-label style draws more attention than necessary.
- Portuguese feels slightly harsher visually because the words are longer.

Recommendation:
- Consider reducing visual aggression of the secondary label rather than changing the translation itself.

### 5. Admin team tabs are near their width limit in Russian

Relevant screens:
- store details
- seller details

Current tab labels include:
- `Обзор`
- `Профиль`
- `Смены`
- `События`

Issue:
- The current shortened labels are much better than before, but the detail-screen tab row is still width-sensitive.
- Any future copy growth here will likely break again.

Recommendation:
- Keep these labels frozen unless the layout changes.
- If future additions are needed, tab width or typography should change before text grows.

### 6. Russian inventory summary labels are valid, but slightly formal

Screen:
- `Admin -> Inventory -> Stock`

Current wording:
- `Всего единиц`
- `Малый остаток`

Issue:
- Both are readable and fit well.
- `Малый остаток` is cleaner than the old wording, but it still sounds slightly more formal than the rest of the product tone.

Recommendation:
- Keep as-is for now unless a stronger product phrase emerges.
- No urgent UI change required.

### 7. Portuguese sales terminology is solid but should stay intentionally compact

Screen:
- `Admin -> Sales`

Current labels:
- `Hoje`
- `Semana`
- `Mês`
- `Período`

Issue:
- `Período` works much better than `Personalizado` for the tab width.
- This is a good compact solution, but should be documented as intentional product copy, not a temporary shortening.

Recommendation:
- Keep `Período`.
- Treat it as the canonical Portuguese label for the custom range tab in this UI.

### 8. Mixed English store and product names are acceptable, but they make Russian and Portuguese screens feel partially bilingual

Examples:
- `Central Mall Store`
- `North Point Store`
- `CBD Sleep Oil 15%`

Issue:
- UI chrome is localized, but product/store naming remains English.
- This is not a translation bug, but it changes the perception of polish in localized screens.

Recommendation:
- Decide whether product and store naming is intentionally brand-level English.
- If yes, keep it consistently English everywhere.
- If not, this should be handled as separate content localization later.

## Low Priority Findings

### 9. Russian settings descriptions are readable, but slightly long for such a minimal screen

Screen:
- `Admin -> Settings`

Examples:
- `Выберите язык интерфейса. Приложение запомнит его после перезапуска.`
- `Переключайтесь между админом и продавцом без перезапуска.`

Issue:
- They fit in desktop-width mobile layout used during testing.
- On denser devices, they may feel text-heavy relative to the rest of the product.

Recommendation:
- Could be shortened later if the settings screen is simplified further.

### 10. Seller shift screen in Portuguese is in good shape, but the tone is slightly more formal than the Russian one

Screen:
- `Seller -> Turno`

Examples:
- `Vendas desbloqueadas`
- `Histórico de turnos`
- `Terminar turno`

Issue:
- Everything fits and reads well.
- No layout issues found.
- This is only a style note: Portuguese sounds slightly more formal and operational than the Russian equivalent.

Recommendation:
- No urgent change.
- Revisit only if doing a tone-unification pass later.

## Screen-by-Screen Notes

### Admin Overview
- No major localization breakage observed.
- Russian and Portuguese headings fit well.
- Metric labels remain compact enough for the current card sizes.

### Admin Sales
- Good overall quality after recent polish.
- Payment badges are readable.
- Russian counts now read correctly.
- Portuguese period selector now fits correctly.

### Admin Inventory
- Stock tab is visually stable.
- Russian `Товар продается в N магазинах` is much more user-friendly than the older wording.
- No visible overflow problems found in the core list states reviewed.

### Admin Team
- This area remains the most width-sensitive in Russian.
- Current wording is acceptable, but should be treated as tightly constrained UI copy.
- Detail screens are much better after shortening headings.

### Seller Checkout
- Russian and Portuguese are both readable.
- Product rows remain clean.
- Cart bar fits in both languages.

### Seller Orders
- Functional and readable in both languages.
- Russian could still be made lighter stylistically.

### Seller Stock
- No layout breakage found.
- Russian and Portuguese both fit, but action terminology could still be refined.

### Seller Shift
- One of the strongest localized screens overall.
- Russian and Portuguese both fit well after recent status shortening.

## Recommended Next Discussion Topics

If we continue refining, the best order would be:

1. Decide whether seller order rows should keep `Завершенная продажа / Venda concluída` or move to shorter titles.
2. Review Russian and Portuguese stock operation verbs as one bundle.
3. Decide whether English product/store names are intentional brand content or future localization targets.
4. Do one final micro-pass over `Admin Team`, since it is still the most space-sensitive module.

## Conclusion

The localization is already at a strong product level.

Current status:
- no major overflow defects found in the main audited flows
- no obvious machine-translation disasters in the reviewed Russian or Portuguese screens
- the remaining work is mostly high-quality editorial polish, not rescue work

This is a good point to switch from broad localization implementation to selective copy refinement.
