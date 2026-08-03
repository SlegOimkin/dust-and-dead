# Официальные источники

Все страницы проверены 30 июля 2026 года. Использовалась только официальная документация Яндекс Игр и официальные интерфейсы Яндекса.

Материалы в этом каталоге — подробный практический пересказ. При изменении платформы юридически и технически значимой остаётся актуальная версия официальной документации.

## Четыре исходные страницы из задания

1. [Быстрый старт](https://yandex.ru/dev/games/doc/ru/concepts/quick-start)  
   Аккаунт, РСЯ, команда, архив, SDK, черновик, модерация и действия после публикации.

2. [Требования к игре](https://yandex.ru/dev/games/doc/ru/concepts/requirements)  
   Полный нормативный перечень: техника, пользовательский опыт, контент, реклама, описание и материалы. На дату проверки страница помечена изменением от 1 июля 2026 года.

3. [SDK](https://yandex.ru/dev/games/doc/ru/sdk)  
   Назначение SDK, возможности и плагины движков.

4. [Подключение и использование SDK](https://yandex.ru/dev/games/doc/ru/sdk/sdk-about)  
   Путь `/sdk.js`, собственный домен, `YaGames.init()`, проверка загрузчика и типовые ошибки.

## Обязательный жизненный цикл SDK

- [Загрузка игры и разметка геймплея](https://yandex.ru/dev/games/doc/ru/sdk/sdk-game-events)  
  `LoadingAPI.ready()`, `GameplayAPI.start()` и `GameplayAPI.stop()`.

- [События](https://yandex.ru/dev/games/doc/ru/sdk/sdk-events)  
  `game_api_pause`, `game_api_resume`, автоматическая реклама на старте, TV-события и диалог выбора прогресса.

- [Переменные окружения](https://yandex.ru/dev/games/doc/ru/sdk/sdk-environment)  
  Язык, ID игры, payload и переходы из промоакций.

- [Другие объекты и параметры SDK](https://yandex.ru/dev/games/doc/ru/sdk/sdk-params)  
  Полноэкранный режим, запись в буфер обмена и тип устройства.

## Дополнительные платформенные возможности SDK

- [Ярлык на рабочий стол](https://yandex.ru/dev/games/doc/ru/sdk/sdk-shortcut)  
  Проверка доступности, нативный диалог, результат принятия и особенность первого ярлыка.

- [Ссылки на другие игры](https://yandex.ru/dev/games/doc/ru/sdk/sdk-other-games)  
  `GamesAPI.getAllGames()`, `getGameByID()`, доступность на текущей платформе/домене и интерфейс `IGame`.

## Игрок, данные и дополнительные возможности

- [Данные игрока](https://yandex.ru/dev/games/doc/ru/sdk/sdk-player)  
  `Player`, гостевой режим, авторизация, `setData`, `setStats`, идентификаторы, лимиты и `safeStorage`.

- [Удалённая конфигурация](https://yandex.ru/dev/games/doc/ru/sdk/sdk-config)  
  Флаги, локальные значения и клиентские признаки.

- [Серверное время](https://yandex.ru/dev/games/doc/ru/sdk/sdk-server-time)  
  Синхронизированный timestamp.

- [SDK лидербордов](https://yandex.ru/dev/games/doc/ru/sdk/sdk-leaderboard)  
  Получение описания, запись и чтение результатов.

- [Настройка лидербордов](https://yandex.ru/dev/games/doc/ru/concepts/leaderboards)  
  Создание и конфигурация в Консоли.

- [Полный пример SDK](https://yandex.ru/dev/games/doc/ru/sdk/sdk-example)  
  Сквозной пример интеграции.

## Реклама, выплаты и покупки

- [Общая монетизация](https://yandex.ru/dev/games/doc/ru/services/about-monetization)  
  Разница между подключением монетизации и необязательными собственными вызовами рекламы, автоматическое создание блоков и FAQ.

- [Реклама через SDK](https://yandex.ru/dev/games/doc/ru/sdk/sdk-adv)  
  Interstitial, rewarded video, callbacks и стики-баннер.

- [Расположение рекламы](https://yandex.ru/dev/games/doc/ru/requirements/4/4)  
  Логические паузы, типы геймплея, лимит 0,33 секунды и предупреждение в длинных real-time уровнях.

- [Рекламная монетизация в Консоли](https://yandex.ru/dev/games/doc/ru/console/adv-monetization)  
  РСЯ, блоки, подключение, выплаты и статистика.

- [Единая лицензионная схема](https://yandex.ru/dev/games/doc/ru/payments)  
  Проверка статуса, единое соглашение, документы, реквизиты и выплаты.

- [Инап-покупки в SDK](https://yandex.ru/dev/games/doc/ru/sdk/sdk-purchases)  
  Каталог, покупка, восстановление, консумирование и подписанные ответы.

- [Инап-покупки в Консоли](https://yandex.ru/dev/games/doc/ru/console/purchases)  
  Подключение, товары, тестовые логины и модерация.

## Загрузка, карточка, тестирование и модерация

- [Загрузка игры](https://yandex.ru/dev/games/doc/ru/console/add-new-game)  
  Черновик, внешние хосты, CSP, страны дистрибуции, iframe и FAQ.

- [Заполнение черновика](https://yandex.ru/dev/games/doc/ru/console/add-new-game/draft)  
  Все поля, тексты, форматы и размеры материалов.

- [Тестирование](https://yandex.ru/dev/games/doc/ru/console/test-game)  
  Окружения, инструменты и реклама/покупки в тестах.

- [Debug-панель](https://yandex.ru/dev/games/doc/ru/console/debug-panel)  
  Проверка SDK, языка, Game Ready, событий и моков.

- [Локальный запуск](https://yandex.ru/dev/games/doc/ru/concepts/local-launch)  
  Официальный proxy, dev/prod-окружения.

- [Режим черновика](https://yandex.ru/dev/games/doc/ru/console/draft-mode)  
  Финальная проверка загруженного билда.

- [Модерация](https://yandex.ru/dev/games/doc/ru/concepts/moderation)  
  Подготовка, типы, сроки, решения, повторная отправка и кулдаун.

- [Выпуск обновлений](https://yandex.ru/dev/games/doc/ru/console/update-game)  
  Новый черновик опубликованной игры и повторная модерация.

## Как поддерживать комплект актуальным

Перед каждым релизом перепроверьте минимум:

1. [Требования к игре](https://yandex.ru/dev/games/doc/ru/concepts/requirements).
2. [Расположение рекламы](https://yandex.ru/dev/games/doc/ru/requirements/4/4).
3. [Подключение SDK](https://yandex.ru/dev/games/doc/ru/sdk/sdk-about).
4. [События SDK](https://yandex.ru/dev/games/doc/ru/sdk/sdk-events).
5. [Поля черновика](https://yandex.ru/dev/games/doc/ru/console/add-new-game/draft).
6. [Модерацию](https://yandex.ru/dev/games/doc/ru/concepts/moderation).
7. Поле **Единая лицензионная схема** и подсказки актуальной Консоли.
