# Сборка Android APK

Репозиторий содержит всё необходимое для продолжения разработки на другом устройстве: исходники игры, локализации, процедурные модели, тесты, Capacitor-конфигурацию, нативный Android-код и скрипты сборки. Скопированные web-ресурсы, Gradle output и готовые APK намеренно не публикуются — они создаются заново командами ниже.

## Требования

Для сборки на Windows нужны:

- Git;
- PowerShell 5.1 или новее;
- Node.js 22 и npm;
- JDK 21;
- Android SDK с Platform 36, Build Tools 36.0.0, Platform Tools и Command-line Tools.

Android SDK можно установить через Android Studio. Для системных установок задайте `JAVA_HOME` и `ANDROID_HOME` (или `ANDROID_SDK_ROOT`) и добавьте Node.js в `PATH`.

Скрипт `dev-shell.ps1` также распознаёт необязательное локальное окружение, если оно расположено так:

```text
.tools/node/extracted/node-v*-win-x64
.tools/jdk/extracted/jdk-*
.tools/android-sdk
```

Каталог `.tools` не хранится в Git. Это только удобная локальная альтернатива системным установкам.

## Подготовка чистого клона

```powershell
git clone https://github.com/SlegOimkin/dust-and-dead.git
cd dust-and-dead
npm ci
npx playwright install chromium
npm run sync:android
```

`sync:android` создаёт `www`, копирует актуальные web-ресурсы, выполняет `cap sync android` и сверяет SHA-256 исходных и упаковываемых файлов.

Чтобы открыть интерактивный PowerShell с найденными инструментами разработки:

```powershell
.\dev-shell.cmd
```

## Проверки

После синхронизации выполните:

```powershell
npm run check
npm test
```

`check` проверяет синтаксис JavaScript и совпадение синхронизированных ресурсов. `test` дополнительно запускает Playwright-набор; браузер Chromium устанавливается отдельной командой на этапе подготовки.

## Адрес онлайн-сервера

Для APK укажите публичный `wss://`-адрес развёрнутого сервера в `online-config.js`, например `url: "wss://play.example.com"`. Затем выполняйте синхронизацию и сборку как обычно. Сервер должен разрешать origin `https://localhost` (и `capacitor://localhost` для сборок с такой схемой). Полная инструкция по Docker/TLS находится в [docs/ONLINE_SERVER.md](docs/ONLINE_SERVER.md).

Если онлайн-режим в конкретной сборке не нужен, пустой `url` можно оставить: одиночный режим и Nearby продолжат работать, а онлайн-лобби сообщит, что адрес сервера не настроен.

## Сборка APK

Обычная debug-сборка:

```powershell
npm run build:apk
```

Результат: `DustAndDead-debug.apk` в корне проекта.

Одновременная сборка обычного и playtest-варианта с разблокированным тестовым доступом:

```powershell
npm run build:apks
```

Результаты:

- `DustAndDead-debug.apk`;
- `DustAndDead-playtest.apk`.

Скрипты выполняют чистую Gradle-сборку и автоматически проверяют package id, версию, build profile, содержимое APK и debug-подпись. Текущие параметры Android-приложения: `versionCode 52`, `versionName 1.51`, package id `com.testproject.dustanddead`.

Повторная проверка уже собранных файлов:

```powershell
npm run verify:apk
npm run verify:apks
```

## Что восстанавливается автоматически

В репозиторий не включаются:

- `node_modules` — восстанавливается через `npm ci`;
- `www` и `android/app/src/main/assets/public` — через `npm run sync:android`;
- `.gradle`, Android `build` и сгенерированные Capacitor-файлы — через Capacitor/Gradle;
- Chromium для Playwright — через `npx playwright install chromium`;
- APK, тестовые отчёты, временные каталоги и локальные SDK/JDK/Node toolchains.

При переносе проекта достаточно клонировать репозиторий, установить перечисленные инструменты и выполнить команды подготовки чистого клона.
