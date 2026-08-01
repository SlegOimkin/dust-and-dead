# Онлайн-сервер Dust and Dead

Этот документ описывает воспроизводимое развёртывание текущего авторитетного
multiplayer-сервера. Node.js принимает HTTP и WebSocket-соединения, а каждый
активный матч выполняется в отдельном Playwright/Chromium-контексте. Caddy
завершает TLS, автоматически получает сертификат и проксирует WebSocket по
пути `/online`.

## Важные ограничения

- Комнаты, сессии и активные матчи хранятся в памяти одного процесса. Не
  запускайте несколько реплик `game` за балансировщиком без общего session
  store и маршрутизации соединений по комнате.
- Перезапуск контейнера `game` завершает текущие матчи. Обновляйте сервер в
  окно обслуживания или после опустошения комнат.
- Один матч использует отдельный Chromium-контекст. Значение `MAX_MATCHES`
  следует повышать только после нагрузочного теста на целевом сервере.
- `RESUME_TOKEN_SECRET` обязан быть случайным, секретным и постоянным.
  Ротация значения делает ранее выданные reconnect-токены недействительными.
- Сервер ограничивает одновременно открытые соединения и число живых сессий.
  Подключённая одноигроковая lobby-комната удаляется после периода бездействия;
  отключённый игрок вместо этого сохраняется на весь `RECONNECT_GRACE_MS`.

## Требования

- Linux-сервер с Docker Engine и Docker Compose v2;
- домен с `A`/`AAAA`-записью на этот сервер;
- открытые входящие порты `80/tcp`, `443/tcp` и, для HTTP/3, `443/udp`;
- достаточно RAM и CPU для заданного числа одновременных Chromium-контекстов.

Порт Node.js `8787` наружу публиковать не нужно: он доступен только Caddy во
внутренней сети Compose.

## Первое развёртывание

Клонируйте репозиторий на сервер и создайте локальный конфиг:

```bash
git clone https://github.com/SlegOimkin/dust-and-dead.git
cd dust-and-dead
cp .env.example .env
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Последняя команда только печатает секрет. Впишите результат в `.env` как
`RESUME_TOKEN_SECRET`, затем заполните адреса, например:

```dotenv
SITE_ADDRESS=play.example.com
PUBLIC_ORIGIN=https://play.example.com
ALLOWED_ORIGINS=https://play.example.com,https://localhost,capacitor://localhost
RESUME_TOKEN_SECRET=replace-with-generated-64-hex-character-value
```

Защитные лимиты по умолчанию задаются через `MAX_CONNECTIONS=256`,
`MAX_CONNECTIONS_PER_IP=32`, `MAX_SESSIONS=512` и
`IDLE_LOBBY_TTL_MS=600000`. Уменьшайте их только с учётом одновременных
переподключений: новое WebSocket-соединение открывается до того, как сервер
проверит resume-token старой сессии. Лимит сессий предотвращает накопление
disconnect-churn внутри reconnect grace, а idle TTL не применяется к уже
отключённому игроку до истечения этого grace-периода.

У `PUBLIC_ORIGIN` не должно быть завершающего `/`. Если разрешено несколько
источников, перечислите их в `ALLOWED_ORIGINS` через запятую. Origin
`https://localhost` используется Android WebView, а `capacitor://localhost`
оставлен для совместимости с другими Capacitor-клиентами. Без них сервер может
отклонить APK-клиент до открытия WebSocket. Не добавляйте `.env` в Git.

Проверьте Compose-конфигурацию без вывода секретов, соберите образ и запустите
сервисы:

```bash
docker compose --env-file .env -f deploy/compose.yml config --quiet
docker compose --env-file .env -f deploy/compose.yml build --pull
docker compose --env-file .env -f deploy/compose.yml up -d
docker compose --env-file .env -f deploy/compose.yml ps
```

Dockerfile использует образ Playwright `v1.60.0-noble`; эта версия должна
оставаться равной версии `playwright` в `package-lock.json`. `.dockerignore`
передаёт в build context только runtime-исходники, поэтому локальные APK,
Android SDK, отчёты, референсы и `node_modules` в образ не попадают.
Версия Caddy также зафиксирована в `deploy/compose.yml`; обновляйте её
осознанно вместе с проверкой конфигурации и WebSocket-переподключения.

## Проверка после запуска

Проверьте HTTP-готовность снаружи:

```bash
curl --fail --show-error https://play.example.com/healthz
curl --fail --show-error https://play.example.com/readyz
```

Откройте `https://play.example.com/` в двух браузерах и проверьте подбор
игроков, готовность, старт матча и переподключение. Публичный `/metrics`
намеренно закрыт Caddy; получить диагностический JSON можно внутри контейнера:

```bash
docker compose --env-file .env -f deploy/compose.yml exec -T game \
  node -e "fetch('http://127.0.0.1:8787/metrics').then(async r => { console.log(await r.text()); process.exit(r.ok ? 0 : 1); }).catch(() => process.exit(1))"
```

Логи обоих сервисов:

```bash
docker compose --env-file .env -f deploy/compose.yml logs -f --tail=200
```

## Локальная проверка Compose

Для проверки без публичного домена задайте в `.env`:

```dotenv
SITE_ADDRESS=http://localhost
PUBLIC_ORIGIN=http://localhost
ALLOWED_ORIGINS=http://localhost,https://localhost,capacitor://localhost
```

После `docker compose ... up -d` игра будет доступна по
`http://localhost`. Этот режим предназначен только для локальной машины;
Android и публичное размещение должны использовать доверенный `wss://`.

## Web- и Android-клиенты

При загрузке игры с того же домена пустое поле `url` в `online-config.js`
правильно выбирает same-origin WebSocket. Для Android/file-сборки укажите в
`online-config.js` полный публичный адрес:

```js
url: "wss://play.example.com"
```

После изменения повторите синхронизацию и сборку:

```powershell
npm run sync:android
npm run build:apk
```

Полная подготовка чистого Windows-устройства, версии JDK/Android SDK, команды
проверки и расположение результата описаны в
[APK_BUILD.md](../APK_BUILD.md).

## Обновление и остановка

Перед обновлением убедитесь, что активных матчей нет, затем:

```bash
git pull --ff-only
docker compose --env-file .env -f deploy/compose.yml build --pull
docker compose --env-file .env -f deploy/compose.yml up -d --remove-orphans
docker compose --env-file .env -f deploy/compose.yml ps
```

Остановка без удаления сертификатов Caddy:

```bash
docker compose --env-file .env -f deploy/compose.yml down
```

Не добавляйте `--volumes`, если не намерены удалить локальное хранилище
сертификатов Caddy. Игровой базы данных сейчас нет: для восстановления нужны
Git-репозиторий и отдельно сохранённый `.env`.

## Что публиковать в Git

Для продолжения проекта на другом устройстве должны быть tracked:

- браузерные исходники игры и интерфейса, multiplayer protocol/config;
- `localization.js` и весь каталог `locales`;
- процедурные модели `hordeheart-model.js` и `land-eater-model.js`;
- `vendor/three.min.js`, необходимый автономному клиенту;
- `server/*.js`, серверные тесты и deployment-файлы;
- Playwright- и Node-тесты, конфиги и `package-lock.json`;
- нативные Android/Capacitor-исходники, Gradle wrapper и PowerShell-скрипты;
- `README.md`, `APK_BUILD.md` и документация.

Не должны публиковаться, поскольку восстанавливаются или являются локальными:

- `node_modules`, Playwright Chromium и каталоги локальных SDK/JDK/Node;
- `www`, скопированные Android web-assets, Gradle/build output;
- APK/AAB, отчёты тестов, coverage, временные логи и preview-изображения;
- `output`, `publish`, рабочие `artifacts` и музыкальные референсы;
- `.env`, keystore, signing passwords и другие секреты.

Debug APK собирается без переносимого ключа. Для продолжения публикации уже
подписанного release-приложения keystore и пароли нужно передать отдельно через
защищённое хранилище; в публичный Git их добавлять нельзя.
