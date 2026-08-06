# Подключение SDK Яндекс Игр

Основные источники:

- [SDK](https://yandex.ru/dev/games/doc/ru/sdk)
- [Подключение и использование](https://yandex.ru/dev/games/doc/ru/sdk/sdk-about)
- [Загрузка игры и разметка геймплея](https://yandex.ru/dev/games/doc/ru/sdk/sdk-game-events)
- [События](https://yandex.ru/dev/games/doc/ru/sdk/sdk-events)
- [Данные игрока](https://yandex.ru/dev/games/doc/ru/sdk/sdk-player)

SDK обязателен для публикации. Реклама и покупки являются лишь частью SDK: даже немонетизируемая игра должна корректно загрузить библиотеку, инициализироваться, сообщить о готовности и выполнить платформенные требования.

Полное описание ярлыка, всех полей окружения, промо-диплинков, серверного времени, специальных событий, ссылок на другие игры, fullscreen, clipboard и `deviceInfo` вынесено в [дополнительные возможности SDK](07-sdk-platform-features.md).

## 1. Возможности SDK

- реклама и инап-покупки;
- профиль, гостевой режим и авторизация Яндекс ID;
- облачный прогресс и числовая статистика;
- лидерборды;
- удалённая конфигурация без обновления билда;
- серверное время;
- язык, ID игры, тип устройства и параметры запуска;
- события паузы/возобновления;
- разметка окончания загрузки и активного геймплея;
- полноэкранный режим, оценка игры, ярлык и другие платформенные функции.

Официальные интеграции существуют для Unity, Cocos Creator, Construct 3, Defold и TypeScript. Для любого HTML5-движка, умеющего обращаться к JavaScript, базовые методы одинаковы.

## 2. Подключение скрипта

### Игра загружается архивом

Используйте относительный официальный путь:

```html
<!-- Yandex Games SDK -->
<script src="/sdk.js"></script>
```

Это рекомендуемый вариант. Не скачивайте `sdk.js` и не кладите копию в билд.

### Игра работает на собственном домене

После согласования такого размещения используйте абсолютный официальный адрес:

```html
<script src="https://sdk.games.s3.yandex.net/sdk.js"></script>
```

### Асинхронная загрузка

```html
<script async src="/sdk.js" onload="initYandexGames()"></script>
<script>
  async function initYandexGames() {
    try {
      const ysdk = await YaGames.init();
      // Методы SDK разрешено вызывать только здесь и позже.
    } catch (error) {
      console.error('Не удалось инициализировать SDK', error);
    }
  }
</script>
```

Динамический эквивалент:

```js
const script = document.createElement('script');
script.src = '/sdk.js';
script.async = true;
script.onload = initYandexGames;
script.onerror = () => showSdkLoadError();
document.body.append(script);
```

Критический порядок:

```text
загрузка sdk.js
→ появление YaGames
→ завершение YaGames.init()
→ вызовы рекламы, Player, платежей и других API
```

## 3. Инициализация

Клиентский режим:

```js
const ysdk = await YaGames.init();
```

или явно:

```js
const ysdk = await YaGames.init({ signed: false });
```

Серверная проверка подписанных данных:

```js
const ysdk = await YaGames.init({ signed: true });
```

`signed: true` нужен, если платежи проверяются доверенным сервером. В этом режиме результаты `payments.purchase()` и `payments.getPurchases()` приходят в подписанном поле `signature`; подпись проверяется на сервере секретным ключом. Секрет нельзя хранить в клиентском JavaScript.

## 4. Рекомендуемый жизненный цикл запуска

```text
1. Загрузить sdk.js.
2. Дождаться YaGames.init().
3. Рекомендуется сразу подписаться на game_api_pause / game_api_resume.
4. Определить язык через environment.i18n.lang.
5. Параллельно начать загрузку Player, нужного сохранения, удалённых флагов с fallback и проверку покупок.
6. Загрузить ресурсы и данные, без которых первое взаимодействие невозможно.
7. Построить интерактивный UI и убрать загрузочные экраны.
8. Вызвать LoadingAPI.ready().
9. Необязательные сетевые операции продолжить в фоне с таймаутами/fallback, не задерживая готовый интерфейс.
10. При реальном старте геймплея вызвать GameplayAPI.start().
```

События `game_api_pause`/`game_api_resume` формально опциональны, но это рекомендуемый и наиболее надёжный способ обработать автоматическую стартовую рекламу, окна покупок и потерю фокуса. Если игра подписывается на них, логика обязана соответствовать документации.

Не вызывайте `LoadingAPI.ready()` сразу после `YaGames.init()`, если текстуры, сцены, необходимое стартовое сохранение или интерактивный UI ещё не готовы. Одновременно не задерживайте Game Ready из-за необязательного Remote Config или другой сети: используйте локальные значения, таймаут и фоновое завершение.

## 5. Game Ready

```js
const ysdk = await YaGames.init();

await loadGameAssets();
await loadInitialSave();
mountInteractiveMainMenu();
hideAllLoadingScreens();

ysdk.features.LoadingAPI?.ready();
```

В момент вызова:

- все необходимые для начала элементы загружены;
- интерфейс реагирует на действия;
- пользователь больше не видит внутренний экран загрузки;
- игра действительно может перейти к меню или игровому процессу.

Game Ready обязателен. Debug-панель ожидает его ограниченное время; отсутствие или слишком ранний вызов является частой причиной отклонения.

## 6. Разметка активного геймплея

Методы опциональны, но если они подключены, события должны быть точными.

### Начало или возобновление

```js
ysdk.features.GameplayAPI?.start();
```

Подходящие моменты:

- старт уровня;
- закрытие блокирующего меню;
- снятие пользовательской паузы;
- возвращение после рекламы;
- возвращение в активную вкладку.

### Остановка

```js
ysdk.features.GameplayAPI?.stop();
```

Подходящие моменты:

- победа или поражение;
- открытие блокирующего меню;
- пользовательская пауза;
- начало полноэкранной/rewarded-рекламы;
- уход в другую вкладку.

Сразу после `start()` игра должна быть активной, а после `stop()` — остановленной.

## 7. Платформенная пауза и стартовая реклама

Платформа автоматически показывает полноэкранную рекламу на старте игр. У этого показа нет callback-функций вашей игры, поэтому события SDK являются основным каналом управления состоянием.

```js
let platformPaused = false;
let userPaused = false;
let menuPaused = false;
let userMuted = false;

function applyRuntimeState() {
  const mustPause = platformPaused || userPaused || menuPaused;

  if (mustPause) {
    pauseGameLoop();
    pauseAllGameAudio();
  } else {
    resumeGameLoop();
    if (!userMuted) {
      resumeAllowedGameAudio();
    }
  }
}

function onPlatformPause() {
  platformPaused = true;
  applyRuntimeState();
}

function onPlatformResume() {
  platformPaused = false;
  applyRuntimeState();
}

ysdk.on('game_api_pause', onPlatformPause);
ysdk.on('game_api_resume', onPlatformResume);

// При уничтожении приложения/сцены:
// ysdk.off('game_api_pause', onPlatformPause);
// ysdk.off('game_api_resume', onPlatformResume);
```

События возникают при:

- автоматической рекламе на старте;
- полноэкранной и rewarded-рекламе;
- открытии/закрытии окна покупки;
- переключении вкладок;
- сворачивании/разворачивании браузера.

Обработчики должны быть идемпотентными. `resume` не должен:

- запускать игру, если игрок находится в меню;
- снимать пользовательскую паузу;
- включать звук, отключённый игроком;
- повторно запускать уже работающий цикл.

События согласованы с `GameplayAPI`: если геймплей был остановлен по другой причине, платформенный `resume` не должен ошибочно превращать меню в активный уровень.

Полный контракт `ysdk.EVENTS`, TV-события `HISTORY_BACK`/`EXIT` и диалог выбора аккаунта собраны в [отдельном разделе](07-sdk-platform-features.md).

## 8. Язык и окружение

```js
const ysdk = await YaGames.init();
const language = ysdk.environment.i18n.lang; // ISO 639-1: ru, en, tr...
```

Использование `i18n.lang` для автоматического выбора языка обязательно. Ручной переключатель может переопределить выбор позже, но не заменяет стартовое автоопределение.

Другие поля:

```js
const appId = ysdk.environment.app.id;
const payload = ysdk.environment.payload;
const referrer = ysdk.environment.referrer;
```

`payload` передаётся через параметр URL:

```text
https://yandex.ru/games/app/123?payload=campaign-a
```

Переход из промоакции:

```js
const { referrer } = ysdk.environment;

if (referrer?.type === 'promo') {
  if (referrer.inappId) {
    openPurchaseScreen(referrer.inappId);
  } else if (referrer.intent) {
    openInternalScreen(referrer.intent);
  }
}
```

У `referrer` могут быть:

- `type: "promo"`;
- `promoId`;
- `intent` — действие внутри игры;
- `inappId` — товар акции.

Полная структура `environment`, точное сопоставление query-параметров, настройка и проверка промоакций описаны в [дополнительных возможностях SDK](07-sdk-platform-features.md).

## 9. Тип устройства и полноэкранный режим

Сведения об устройстве:

```js
ysdk.deviceInfo.type; // "desktop" | "mobile" | "tablet" | "tv"

ysdk.deviceInfo.isMobile();
ysdk.deviceInfo.isDesktop();
ysdk.deviceInfo.isTablet();
ysdk.deviceInfo.isTV();
```

Не используйте тип устройства как замену адаптивной вёрстке: он помогает выбрать управление и UI, но игру всё равно нужно проверять при разных фактических размерах.

Документация обозначает полноэкранный объект как `screen.fullscreen`. Браузер может разрешить переход только после пользовательского действия. Кроме того, на странице платформы есть собственная кнопка полного экрана.

Точная таблица членов fullscreen-объекта, `clipboard`, ярлык и `GamesAPI` приведены в [дополнительных возможностях SDK](07-sdk-platform-features.md).

## 10. Объект Player

```js
let player;

try {
  player = await ysdk.getPlayer();
} catch (error) {
  showRecoverablePlayerError(error);
}
```

Доступ:

- идентификатор есть у всех игроков;
- имя и аватар доступны авторизованным игрокам, если они разрешили передачу;
- нельзя строить обязательную логику на наличии имени или фотографии.

Лимит `ysdk.getPlayer()` — 20 запросов за 5 минут. Кэшируйте объект и не запрашивайте его на каждом кадре/экране.

### Гостевой режим и авторизация

```js
let player = await ysdk.getPlayer();

if (!player.isAuthorized()) {
  // Сначала покажите собственный понятный экран:
  // «Войдите, чтобы продолжить прогресс на другом устройстве».
  if (await userPressedSignInButton()) {
    try {
      await ysdk.auth.openAuthDialog();
      player = await ysdk.getPlayer();
    } catch (error) {
      // Отказ не должен лишать пользователя гостевого режима.
    }
  }
}
```

Требования:

- вход только после отдельного осознанного действия;
- до системного диалога объясняется польза;
- отказ не блокирует основную игру;
- гостевой прогресс сохраняется.

`player.getMode()` устарел; используйте `player.isAuthorized()`.

### Постоянный идентификатор

```js
const playerId = player.getUniqueID();
```

`player.getID()` устарел и может возвращать другое значение. Старым проектам нужно мигрировать привязки на `getUniqueID()`.

## 11. Сохранение обычных данных

```js
const saved = await player.getData(['progress', 'settings']);

await player.setData({
  progress: {
    level: 12,
    unlockedItems: ['sword', 'shield']
  },
  settings: {
    sound: true
  }
}, true);
```

Сигнатуры:

```ts
player.setData(data: object, flush?: boolean): Promise<void>
player.getData(keys?: string[]): Promise<object>
```

Ограничения:

- до 200 КБ обычных данных на игрока;
- `setData()` и `getData()` — не более 100 запросов за 5 минут.

`flush`:

- `true` — попытаться немедленно отправить на сервер;
- `false` или отсутствие — поставить запись в очередь.

При `flush: false` успешный `Promise` подтверждает прежде всего валидность объекта, а не окончание серверной записи. Для критических точек — покупка, завершённый уровень, получение редкой награды — используйте продуманную немедленную запись и обработку ошибки. Не отправляйте весь save после каждого кадра.

## 12. Числовая статистика

Для часто меняющихся чисел:

```js
await player.setStats({
  score: 1500,
  gold: 200
});

const updated = await player.incrementStats({
  score: 50,
  gold: -20
});

const stats = await player.getStats(['score', 'gold']);
```

Сигнатуры:

```ts
player.setStats(stats: object): Promise<void>
player.incrementStats(increments: object): Promise<object>
player.getStats(keys?: string[]): Promise<object>
```

Ограничения:

- до 10 КБ числовых данных;
- каждый метод — до 60 запросов в минуту.

Если данных больше лимитов или нужна сильная защита от накруток, используйте согласованный собственный сервер.

## 13. Смена гостевого и авторизованного прогресса

У гостя и вошедшего пользователя могут существовать разные сохранения. Платформа показывает диалог выбора, а SDK отправляет события:

```js
ysdk.on(ysdk.EVENTS.ACCOUNT_SELECTION_DIALOG_OPENED, () => {
  stopPeriodicCloudSync();
});

ysdk.on(ysdk.EVENTS.ACCOUNT_SELECTION_DIALOG_CLOSED, async () => {
  const freshPlayer = await ysdk.getPlayer();
  const freshData = await freshPlayer.getData();
  restartFromSelectedProgress(freshData);
});
```

После закрытия диалога безопаснее:

- остановить старую синхронизацию;
- выйти в главное меню или перезапустить сессию;
- заново получить `Player`;
- заново загрузить прогресс.

## 14. Надёжное хранилище на iOS

При размещении на собственном домене `localStorage` в новых iOS может очищаться. Используйте:

```js
const safeStorage = await ysdk.getStorage();
safeStorage.setItem('key', 'value');
const value = safeStorage.getItem('key');
```

При необходимости можно подменить глобальный `localStorage`, но строго до его первого использования:

```js
const safeStorage = await ysdk.getStorage();

Object.defineProperty(window, 'localStorage', {
  get: () => safeStorage
});
```

Для архива на сервере Яндекса платформа уже предоставляет защищённую оболочку. Облачные данные `Player` всё равно предпочтительнее для межустройственного прогресса.

## 15. Удалённая конфигурация

```js
const flags = await ysdk.getFlags({
  defaultFlags: {
    difficulty: 'normal',
    seasonalEvent: 'off'
  }
});
```

Правила:

- получить флаги один раз на запуск, если нет причины обновлять их чаще;
- все значения являются строками;
- обязательно иметь локальные значения для офлайн-режима и ошибки;
- удалённые значения имеют приоритет над `defaultFlags`.

Можно передать признаки клиента:

```js
const flags = await ysdk.getFlags({
  defaultFlags: { starterOffer: 'default' },
  clientFeatures: [
    {
      name: 'payingStatus',
      value: player.getPayingStatus()
    }
  ]
});
```

Источник: [Удалённая конфигурация](https://yandex.ru/dev/games/doc/ru/sdk/sdk-config).

## 16. Серверное время

```js
const now = ysdk.serverTime();
```

Возвращается timestamp в миллисекундах, совместимый с `Date.now()`, но синхронизированный с сервером. Подходит для ежедневных наград, сезонов и защиты от перевода часов.

Запрашивайте актуальное значение в момент проверки, а не храните одно стартовое значение весь сеанс.

Источник: [Серверное время](https://yandex.ru/dev/games/doc/ru/sdk/sdk-server-time).

Оба официальных сценария ежедневной награды — через 24 часа и один раз в календарные сутки UTC — разобраны в [дополнительных возможностях SDK](07-sdk-platform-features.md).

## 17. Лидерборды: краткая схема

1. Создать лидерборд в Консоли.
2. Использовать его точное техническое имя.
3. Для записи результата авторизовать пользователя.
4. Проверять доступность метода.

```js
if (await ysdk.isAvailableMethod('leaderboards.setScore')) {
  await ysdk.leaderboards.setScore(
    'main_score',
    12500,
    'Level 24'
  );
}
```

Список:

```js
const result = await ysdk.leaderboards.getEntries(
  'main_score',
  {
    quantityTop: 10,
    includeUser: true,
    quantityAround: 3
  }
);
```

Важное:

- старый `ysdk.getLeaderboards()` устарел; используйте `ysdk.leaderboards`;
- отрицательный `score` недопустим;
- для типа `time` значение задаётся в миллисекундах;
- `setScore` — не чаще одного раза в секунду;
- список — до 20 запросов за 5 минут;
- персональная запись — до 60 запросов за 5 минут.

Источники: [SDK лидербордов](https://yandex.ru/dev/games/doc/ru/sdk/sdk-leaderboard), [настройка лидербордов](https://yandex.ru/dev/games/doc/ru/concepts/leaderboards).

## 18. Инап-покупки: обязательный минимум

Платежи выполняются только через SDK. Полная инструкция находится в [файле о монетизации](04-ads-and-monetization.md).

Базовый поток расходуемого товара:

```js
const payments = await ysdk.getPayments();
const purchase = await payments.purchase({ id: 'gold500' });

// 1. Сначала надёжно начислить и сохранить.
await player.incrementStats({ gold: 500 });

// 2. Только затем необратимо поглотить покупку.
await payments.consumePurchase(purchase.purchaseToken);
```

Проверка необработанных покупок обязательна; рекомендуемый момент — запуск игры. Получите `getPurchases()`, идемпотентно начислите незавершённые расходуемые товары и консумируйте только их. Постоянные покупки, например no-ads, не консумируются. Повторная обработка одного токена не должна начислять ценность дважды; надёжнее хранить обработанные токены на сервере.

## 19. Локальная разработка

Официальный proxy:

```bash
npm install -g @yandex-games/sdk-dev-proxy
```

Раздать папку билда:

```bash
npx @yandex-games/sdk-dev-proxy \
  -p <путь-к-билду> \
  --app-id=<ID-игры>
```

Dev-режим:

```bash
npx @yandex-games/sdk-dev-proxy \
  -p <путь-к-билду> \
  --dev-mode=true
```

В dev-режиме реклама, авторизация, данные, лидерборды и покупки заменяются моками; CSP не эквивалентна публикации. Финальную проверку проводите на странице платформы в prod-окружении или режиме черновика.

Источник: [Локальный запуск](https://yandex.ru/dev/games/doc/ru/concepts/local-launch).

## 20. Debug-панель

Открытие:

```text
https://yandex.ru/games/app/XXXX?debug-mode=16
```

Индикатор загрузчика:

- `W` — ожидается инициализация;
- `IT` — актуальный загрузчик инициализирован;
- `IF` — старый или неправильный загрузчик.

Проверьте:

- Game Ready;
- автоопределение языка;
- `game_api_pause` и `game_api_resume`;
- `GameplayAPI.start()` и `stop()`;
- медленную сеть;
- очистку облачных данных;
- мок портальной валюты.

При изменении мока валюты название и иконка в магазине должны браться из SDK и меняться вместе с ним. Если валюта зашита в UI вручную, модерация это обнаружит.

Источник: [Debug-панель](https://yandex.ru/dev/games/doc/ru/console/debug-panel).

## 21. Типичные ошибки

### `YaGames is not defined`

Причина: `YaGames.init()` вызван до загрузки `/sdk.js`.

Исправление: перенести инициализацию в `onload` или подключить SDK синхронно раньше игрового кода.

### `ysdk is not defined`

Причины:

- метод вызван до разрешения `YaGames.init()`;
- `ysdk` объявлен только в локальной области и недоступен вызывающему коду.

Исправление: хранить Promise готовности SDK или передавать объект явно.

```js
// Выполняется после успешной загрузки /sdk.js.
const yandexSdkReady = YaGames.init();

async function showAdSafely() {
  const ysdk = await yandexSdkReady;
  let finished = false;

  const finishOnce = () => {
    if (finished) return;
    finished = true;
    continueGameFlow();
  };

  ysdk.adv.showFullscreenAdv({
    callbacks: {
      onClose: finishOnce,
      onError: (error) => {
        console.error(error);
        finishOnce();
      }
    }
  });
}
```

### Игра зависает после рекламы

Причина: продолжение уровня зависит только от `onOpen`, отсутствует завершающая ветка или обработка ошибки выполняется дважды.

Исправление:

- завершать поток по `onClose`/`onError`;
- делать завершение одноразовым;
- также поддерживать глобальные `game_api_pause`/`resume`.

### Потеря прогресса

Причины:

- сохранение только в памяти;
- запись выполняется слишком поздно;
- лимит запросов превышен;
- на своём домене используется нестабильный `localStorage` iOS.

Исправление: сохранять в значимых точках, обрабатывать ошибки, использовать `Player`/`safeStorage` и не превышать лимиты.
