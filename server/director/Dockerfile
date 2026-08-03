# syntax=docker/dockerfile:1

# The region director is pure Node: it routes players to regional matchmaking
# servers and never runs a match, so it needs neither Playwright nor Chromium
# and can run on the smallest box in the fleet. Keep the Node major equal to the
# one in the Playwright image used by server/Dockerfile.
FROM node:22-alpine

ENV NODE_ENV=production \
    DIRECTOR_HOST=0.0.0.0 \
    DIRECTOR_PORT=8686

WORKDIR /app

# The director has no runtime dependencies at all; package.json is copied only so
# the process reports a version and "type": "commonjs" resolves as expected.
COPY package.json ./
COPY multiplayer-protocol.js ./
COPY server/rate-limit.js server/http-util.js server/service-main.js ./server/
COPY server/director ./server/director

USER node

EXPOSE 8686

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=4 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.DIRECTOR_PORT || 8686) + '/healthz').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"]

CMD ["node", "server/director/index.js"]
