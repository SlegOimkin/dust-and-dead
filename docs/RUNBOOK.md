# Runbook: онлайн-инфраструктура Dust and Dead

Практическое руководство: как устроен онлайн, что развёрнуто сейчас, как поднять
новый игровой сервер и директора-матчмейкера. Архитектурные подробности —
в [ONLINE_SERVER.md](ONLINE_SERVER.md) и [REGION_DIRECTOR.md](REGION_DIRECTOR.md);
здесь то, что нужно человеку у терминала.

## 1. Как это работает

```
игрок (браузер / APK)
        │  wss://<домен>/online
        ▼
   ┌─────────┐   :80/:443        ┌──────────────────────────────┐
   │  Caddy  │──────────────────▶│  game (Node, порт 8787)      │
   │  TLS    │   reverse_proxy   │  ├─ HTTP: сама игра, /readyz │
   └─────────┘                   │  ├─ WebSocket: лобби, очередь│
                                 │  └─ worker-поток на матч ────┼──▶ jsdom + game.js
                                 └──────────────────────────────┘      (?dedicatedServer=1)
```

Ключевые решения, которые объясняют остальное:

- **Матч исполняет та же `game.js`, что и клиент**, только внутри jsdom в
  worker-потоке Node, без браузера и без WebGL. Игра не переписана под сервер,
  поэтому клиент и сервер не могут разойтись по логике.
- **Авторитет — сервер.** Клиенты шлют только ввод (30 Гц) и предсказанную
  позицию; сервер рассылает каждому игроку персональный снапшот (15 Гц),
  обрезанный по его зоне видимости.
- **Ничего не рисуется.** На сервере отключены рендер, сцена меню, прогрев
  шейдеров, HUD и анимация врагов — граф сцены при этом настоящий, потому что
  механики боссов читают из него мировые матрицы.
- **Комнаты живут в памяти одного процесса.** Горизонтальное масштабирование —
  это несколько регионов за директором, а не несколько реплик одного региона.

Цена комнаты (4 игрока, замерено): **≈0.03 ядра** на обычной волне, **≈0.3** в
худшем случае, и **≈95 МБ** при `MATCHES_PER_WORKER=2`. Трафик — ≈30 КБ/с на
игрока.

## 2. Что развёрнуто сейчас

| | |
|---|---|
| Адрес | **https://dustanddead.duckdns.org** (IP `176.12.65.242`, FirstVDS) |
| Железо | Ubuntu 24.04, 4 vCPU / 7.8 ГБ / 79 ГБ |
| Пользователь | `dust` (группы `sudo`, `docker`) |
| Каталог | `/home/dust/dust-and-dead`, ветка `codex/online-multiplayer` |
| Запуск | `docker compose --env-file .env -f deploy/compose.yml` |
| Лимиты | `MAX_MATCHES=12`, `MATCHES_PER_WORKER=2`, `WARM_SPARE_THREADS=1` |
| Директор | **не используется** (`DIRECTOR_URL` пуст, один регион) |
| Защита | ufw (22/80/443), fail2ban, автообновления безопасности |

Панель ISPmanager с сервера удалена (см. ловушку 3.1). Клиенты — и браузер, и
APK — подключаются к одному и тому же адресу: в `online-config.js` задан
`url: "wss://dustanddead.duckdns.org"`.

## 3. Как поднять новый игровой сервер (регион)

Нужны: VPS с Ubuntu 22.04/24.04 и Docker, домен с A-записью на его IP, открытые
порты 80/tcp, 443/tcp и 443/udp.

### 3.1 Ловушка: панель хостера воскрешает себя

Многие образы VPS (в частности FirstVDS) идут с ISPmanager, который занимает
порты 80/443 и **переустанавливает себя сам**: сервис `ihttpd` запускает
`pkgupgrade.sh`, тот дёргает `apt-get install` из репозиториев ISPsystem, и
обычный `apt purge` откатывается за секунды. Порядок, который работает:

```bash
systemctl mask --now ihttpd && pkill -9 -f pkgupgrade.sh && rm -f /etc/apt/sources.list.d/{ispsystem,ispsystem-base,ispmanager-repo-nginx,ispmanager-repo-roundcube,exosoft}.list
```

Затем чинится dpkg (`dpkg --configure -a --force-all`), обнуляются сломанные
maintainer-скрипты (`ispmanager-pkg-myadmin.postrm` выходит с кодом 2 и рвёт всю
очередь удаления) и только потом идёт `apt purge`. Готовый скрипт этой операции
лежал в `.tmp/remove-ispmanager.sh`; воспроизвести по шагам можно из этого
абзаца. После удаления **обязательно перезагрузитесь и проверьте**, что панель
не вернулась.

Два побочных эффекта, которые кусаются: `apt autoremove` уносит с собой
**fail2ban** (переустановите), а `ufw --force reset` оставляет systemd-юнит
выключенным — ufw молча не переживёт перезагрузку, пока не сделать
`systemctl enable ufw`.

### 3.2 Ловушка: технический домен хостера не получит сертификат

Let's Encrypt считает лимит «50 сертификатов в неделю» на **регистрируемый**
домен по [Public Suffix List](https://publicsuffix.org/list/). Поддомены вроде
`*.s.fvds.ru` делят одну квоту со всеми клиентами хостера, и она выедена
досуха — Caddy получает `HTTP 429 too many certificates`.

Подходят: **собственный домен** (200–500 ₽/год, надёжнее всего) либо бесплатные
сервисы, которые есть в PSL и потому дают каждому поддомену свою квоту —
`duckdns.org` (используется сейчас) и `freemyip.com`. Проверить кандидата:

```bash
curl -s https://publicsuffix.org/list/public_suffix_list.dat | grep -x 'duckdns.org'
```

### 3.3 Подготовка сервера

От имени root, после того как порты 80/443 освобождены:

```bash
adduser --disabled-password --gecos "" dust && usermod -aG sudo dust && install -d -m 700 -o dust -g dust /home/dust/.ssh && cp /root/.ssh/authorized_keys /home/dust/.ssh/ && chown dust:dust /home/dust/.ssh/authorized_keys && chmod 600 /home/dust/.ssh/authorized_keys && apt-get update -qq && apt-get install -y -qq git curl ufw fail2ban unattended-upgrades && ufw allow OpenSSH && ufw allow 80/tcp && ufw allow 443/tcp && ufw allow 443/udp && ufw --force enable && systemctl enable ufw fail2ban && curl -fsSL https://get.docker.com | sh && usermod -aG docker dust
```

Затем закройте парольный вход — но **только убедившись в другом окне**, что вход
по ключу работает, иначе запрёте себя снаружи. На Ubuntu 24.04 сначала найдите,
где строка реально объявлена: cloud-init часто кладёт переопределение в
`/etc/ssh/sshd_config.d/`, и правка основного конфига ни на что не влияет.

```bash
grep -rn "PasswordAuthentication" /etc/ssh/sshd_config /etc/ssh/sshd_config.d/
```

### 3.4 Развёртывание

От имени `dust`:

```bash
git clone --branch codex/online-multiplayer https://github.com/SlegOimkin/dust-and-dead.git ~/dust-and-dead && cd ~/dust-and-dead && cp .env.example .env
```

Заполните в `.env` адреса и секрет. `RESUME_TOKEN_SECRET` генерируется на самом
сервере и **не должен меняться** между перезапусками — его ротация делает
недействительными все выданные reconnect-токены:

```bash
printf 'RESUME_TOKEN_SECRET=%s\n' "$(openssl rand -hex 32)" >> .env
```

Обязательные поля: `SITE_ADDRESS` (домен без схемы), `PUBLIC_ORIGIN`
(`https://домен`), `ALLOWED_ORIGINS`. В последнем перечислите через запятую все
источники, откуда игру открывают: сам домен, `https://localhost` и
`capacitor://localhost` для APK, а после публикации — origin Яндекс Игр.

Размер под железо считается так: `MAX_MATCHES ≈ min((RAM_ГБ − 1) × 10, vCPU × 3)`.
Ограничителем почти всегда становится CPU:

```bash
CPU=$(nproc); RAM=$(awk '/MemTotal/{printf "%d",$2/1024/1024}' /proc/meminfo); echo "vCPU=$CPU RAM=${RAM}G -> MAX_MATCHES=$(( (RAM-1)*10 < CPU*3 ? (RAM-1)*10 : CPU*3 ))"
```

Запуск:

```bash
docker compose --env-file .env -f deploy/compose.yml up -d --build
```

### 3.5 Проверка

```bash
curl --fail https://<домен>/readyz && echo && echo | openssl s_client -connect <домен>:443 -servername <домен> 2>/dev/null | openssl x509 -noout -subject -dates
```

Должны быть `{"ready":true,...}` и сертификат от Let's Encrypt. Если сертификата
нет — смотрите причину в логах Caddy, это почти всегда п. 3.2:

```bash
docker compose --env-file .env -f deploy/compose.yml logs caddy | grep -iE 'obtain|error|rateLimited'
```

## 4. Как поднять директора-матчмейкера

Директор нужен, **только когда регионов больше одного**. Он не проводит матчи —
это тонкий агрегатор: регионы сами регистрируются у него heartbeat-запросами,
клиент забирает список, сам меряет задержку до каждого региона и подключается к
лучшему. Пока `DIRECTOR_URL` пуст, всё работает как один сервер.

Поднимается на отдельной (маленькой — ему хватит 1 vCPU / 1 ГБ) машине со своим
доменом:

```bash
git clone --branch codex/online-multiplayer https://github.com/SlegOimkin/dust-and-dead.git ~/dust-director && cd ~/dust-director && cp .env.example .env
```

В `.env` задайте `DIRECTOR_SITE_ADDRESS=<домен директора>` и общий секрет
`DIRECTOR_TOKEN` — его будут предъявлять все регионы:

```bash
printf 'DIRECTOR_TOKEN=%s\n' "$(openssl rand -hex 32)" >> .env
```

```bash
docker compose --env-file .env -f deploy/compose.director.yml up -d --build
```

Проверка: `curl --fail https://<домен директора>/v1/regions` — вернёт пустой
список, пока регионы не отчитались.

## 5. Как подключить регион к директору

На **каждом** игровом сервере допишите в его `.env` и перезапустите:

```dotenv
REGION_ID=eu-central
REGION_LABEL=Европа
REGION_PUBLIC_URL=wss://<домен региона>
REGION_PRIORITY=0
DIRECTOR_URL=https://<домен директора>
DIRECTOR_TOKEN=<тот же общий секрет>
```

`REGION_PUBLIC_URL` — адрес, по которому регион доступен **игрокам снаружи**, а
не внутренний порт контейнера. `REGION_PRIORITY` разрывает ничью до сравнения
задержек, меньше — приоритетнее.

Наконец, в `online-config.js` пропишите `directorUrl: "https://<домен директора>"`,
оставив `url` как запасной адрес на случай, если директор недоступен. После
правки нужен `npm run sync:android` и пересборка APK, иначе мобильные клиенты
продолжат ходить по старому адресу.

Проверка связки: `curl -s https://<домен директора>/v1/regions` должен показать
регион; heartbeat приходит раз в `REGION_HEARTBEAT_INTERVAL_MS` (10 с), и регион
становится нерабочим через `REGION_TTL_MS` (45 с) после последнего сигнала.

## 6. Обслуживание

Обновление кода (матчи при этом прервутся — делайте в окно обслуживания):

```bash
cd ~/dust-and-dead && git pull --ff-only && docker compose --env-file .env -f deploy/compose.yml up -d --build
```

Диагностика. Метрики намеренно закрыты снаружи (Caddy отдаёт на них 404), смотреть
изнутри:

```bash
docker exec dust-and-dead-online-game-1 node -e "fetch('http://127.0.0.1:8787/metrics').then(r=>r.text()).then(console.log)"
```

Полезные поля: `worker.activeMatches` / `maxMatches` (заполненность),
`worker.idleThreads` (прогретый резерв на месте), `rooms`, `sessions`.

Что смотреть, когда «игроки жалуются»:

- **Не подключается из браузера** — проверьте `ALLOWED_ORIGINS`: сервер
  отклоняет чужой origin до открытия WebSocket.
- **«Сервер заполнен»** — упёрлись в `MAX_MATCHES`; это штатный отказ, комната
  получает `room.error`, а не падение.
- **Матч завис** — родительский процесс раз в 20 с опрашивает каждый матч и
  убивает не отвечающий 15 с worker; в логах это `authority_watchdog_failed`.
- **Сертификат не продлился** — п. 3.2, почти наверняка домен из общей квоты.

Тесты перед выкладкой: `npm run test:server` (80 тестов, поднимает настоящие
матчи) и целевые Playwright-спеки `multiplayer-*` при `--workers=2`.
