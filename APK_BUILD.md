# Сборка APK

Игра остается обычным статическим сайтом: `index.html`, `styles.css`, `game.js` и `vendor/three.min.js` запускаются напрямую через браузер без сервера. APK собирается как Android-обертка Capacitor вокруг этих файлов.

## Окружение

Все локальные инструменты лежат внутри проекта:

- Node.js: `.tools\node\extracted\node-v22.22.3-win-x64`
- JDK 21: `.tools\jdk\extracted\jdk-21.0.11+10`
- Android SDK: `.tools\android-sdk`

Чтобы открыть PowerShell с готовым `PATH`, запустите из корня проекта:

```powershell
.\dev-shell.cmd
```

Разовый запуск команд также работает через npm-скрипты, потому что они сами используют `-ExecutionPolicy Bypass`.

## Проверки

```powershell
npm run check
npm test
npm run verify:apk
```

`npm test` запускает синтаксическую проверку JavaScript и Playwright smoke-тест через `file://`.

## Сборка

Из корня проекта `C:\MyProjects\TestProject`:

```powershell
npm run sync:android
npm run build:apk
```

`npm run build:apk` синхронизирует `index.html`, `styles.css`, `game.js` и `vendor\three.min.js` в `www`, выполняет `cap sync android`, собирает debug APK через Gradle, копирует результат в `DustAndDead-debug.apk` и проверяет подпись.

## Ручная проверка подписи

```powershell
npm run verify:apk
```

`DustAndDead-debug.apk` нужен только для локальной проверки и установки на телефон. В GitHub он не добавляется.
