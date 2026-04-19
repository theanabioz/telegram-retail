# Telegram Mini App Capabilities

Этот файл нужен как постоянный reference для проекта `telegram-retail`.

Когда мы проектируем новый функционал, нужно сверяться с этим списком и проверять:
- можно ли сделать UX нативнее через Telegram Mini Apps API;
- можно ли убрать лишние кастомные костыли;
- можно ли использовать системные возможности Telegram вместо собственного решения.

## Уже доступно в проекте

После корректного подключения официального Telegram WebApp runtime у нас доступны нативные возможности Mini App:

- `HapticFeedback`
- `BackButton`
- `safeAreaInset`
- `contentSafeAreaInset`
- `requestFullscreen()`
- `exitFullscreen()`
- `lockOrientation()`
- `unlockOrientation()`
- `disableVerticalSwipes()`
- `enableVerticalSwipes()`
- `setHeaderColor()`
- `setBackgroundColor()`
- `setBottomBarColor()`
- `showPopup()`
- `showAlert()`
- `showConfirm()`
- `openLink()`
- `openTelegramLink()`
- `shareToStory()`
- `shareMessage()`
- `readTextFromClipboard()`
- `downloadFile()`
- `hideKeyboard()`
- `CloudStorage`
- `DeviceStorage`
- `SecureStorage`
- `requestContact()`
- `requestWriteAccess()`
- `LocationManager`
- `BiometricManager`
- `addToHomeScreen()`
- `checkHomeScreenStatus()`
- `requestEmojiStatusAccess()`
- `setEmojiStatus()`
- `requestChat()`

## Что особенно полезно для нашего retail app

### 1. Haptic Feedback

Использовать для:
- тапов по товарам;
- изменения количества;
- применения скидки;
- успешной продажи;
- ошибок и отказов.

Почему это важно:
- интерфейс ощущается быстрее;
- Mini App становится ближе к нативному приложению;
- действия продавца лучше подтверждаются без визуальной перегрузки.

### 2. BackButton

Использовать для:
- всех secondary screens;
- чеков;
- отчетов по смене;
- деталей товаров;
- вложенных экранов админки.

Правило:
- root screen раздела не показывает `BackButton`;
- вложенные экраны показывают `BackButton`;
- внутренние `Back` кнопки в карточках лучше не дублировать без необходимости.

### 3. Safe Area

Использовать для:
- верхней зоны около `Close`;
- fullscreen режима;
- нижней навигации;
- нижних шторок и draft cart.

Почему это важно:
- интерфейс не залезает под системные элементы Telegram и iPhone;
- приложение выглядит аккуратно в `Full Size` и `Fullscreen`.

### 4. Fullscreen

Использовать для:
- более иммерсивного режима работы продавца;
- удобного checkout flow;
- dense админских экранов и графиков.

Рекомендация:
- включать осознанно, там где это реально помогает задаче.

### 5. Orientation Lock

Использовать для:
- закрепления portrait UX;
- предотвращения поломки мобильной композиции;
- экранов кассы и продавца.

Важно:
- всегда иметь fallback, потому что Telegram client и iOS могут вести себя нестабильно в разных режимах.

### 6. Vertical Swipes Control

Очень полезно для:
- `Draft Cart`;
- нижних шторок;
- модалок скидки;
- длинных внутренних scroll-контейнеров.

Использовать, когда:
- жесты Telegram конфликтуют с нашими кастомными sheet/panel жестами.

### 7. Native Colors

Использовать для:
- синхронизации хедера Telegram с нашим интерфейсом;
- подстройки background и bottom bar под визуальный стиль приложения.

Это помогает:
- сделать Mini App визуально монолитным;
- уменьшить ощущение, что приложение "живет отдельно" от Telegram chrome.

### 8. Native Popup / Alert / Confirm

Использовать для:
- подтверждения удаления;
- writeoff/restock действий;
- подтверждения опасных действий;
- служебных ошибок.

Когда применять:
- когда нужно короткое системное подтверждение;
- когда не нужен собственный кастомный modal.

Когда не применять:
- если нужен branded rich UI;
- если действие требует много контекста.

### 9. hideKeyboard()

Очень полезно для:
- checkout;
- discount screen;
- inventory inputs;
- форм админки.

Причина:
- системная клавиатура в Mini App часто ломает композицию;
- особенно важно на iPhone и внутри Telegram.

### 10. CloudStorage / DeviceStorage / SecureStorage

Использовать для:
- локальных черновиков;
- временных UI preferences;
- сохранения состояния фильтров;
- безопасного хранения чувствительных client-side данных, если появятся такие сценарии.

Практические идеи:
- восстановление draft cart;
- локальная память последнего раздела;
- сохранение фильтров админки;
- feature flags на клиенте.

### 11. addToHomeScreen()

Использовать позже для:
- power users;
- продавцов, которые работают с приложением ежедневно.

Это может дать:
- более быстрый вход;
- ощущение отдельного рабочего инструмента.

### 12. requestContact / requestWriteAccess

Полезно для:
- будущих CRM-сценариев;
- разрешений на сообщения;
- работы с клиентскими данными, если этот функционал появится.

### 13. LocationManager

Пока не является core feature, но может пригодиться для:
- привязки к магазину;
- геопроверки торговой точки;
- аналитики по локациям.

### 14. BiometricManager

Пока не является обязательным, но может пригодиться для:
- защиты админ-действий;
- подтверждения чувствительных операций;
- быстрого повторного входа.

### 15. shareMessage / shareToStory / openTelegramLink

Это уже больше growth / promo-инструменты.

Могут пригодиться для:
- маркетинга магазина;
- referral flow;
- отправки чека, ссылки, акции или promo code.

## Что внедрять в первую очередь

Если мы добавляем новый функционал, сначала проверяем вот эти пункты:

1. `HapticFeedback`
2. `BackButton`
3. `safeAreaInset` и `contentSafeAreaInset`
4. `disableVerticalSwipes()` / `enableVerticalSwipes()`
5. `hideKeyboard()`
6. `showConfirm()` / `showPopup()`
7. `CloudStorage` / `DeviceStorage`

Это самый полезный набор для ежедневного retail UX.

## Практическое правило для новых фич

Для каждой новой функции спрашиваем:

1. Можно ли сделать ее нативнее через Telegram API?
2. Можно ли уменьшить количество нашего кастомного UI?
3. Есть ли тут системный Telegram gesture, popup, button или feedback?
4. Можно ли улучшить мобильную ergonomics через safe area, fullscreen, keyboard control, haptics?
5. Можно ли сохранить состояние через Telegram storage вместо временного локального костыля?

## Что предлагать автоматически при будущей разработке

Если появляется новый экран, сразу проверять:
- нужен ли `BackButton`;
- нужны ли haptics;
- не конфликтует ли скролл с vertical swipes;
- нужно ли скрывать клавиатуру;
- нужен ли safe-area override;
- можно ли использовать native confirm вместо кастомного modal.

Если появляется новая форма или sheet:
- проверить `hideKeyboard()`;
- проверить haptics;
- проверить safe area;
- проверить блокировку вертикальных свайпов.

Если появляется важное действие:
- проверить `showConfirm()`;
- проверить success/error haptic;
- проверить, нужен ли защищенный flow.

## Источник

Официальная документация Telegram Mini Apps:
- https://core.telegram.org/bots/webapps

Этот файл нужно считать рабочим reference-документом проекта.
