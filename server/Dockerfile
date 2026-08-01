# syntax=docker/dockerfile:1

# Keep this tag equal to the Playwright version locked in package-lock.json.
# The image supplies Chromium and its Linux runtime libraries; npm supplies the
# project's JavaScript packages.
FROM mcr.microsoft.com/playwright:v1.60.0-noble

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8787 \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

WORKDIR /app

COPY --chown=pwuser:pwuser package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund \
    && npm cache clean --force

COPY --chown=pwuser:pwuser server ./server
COPY --chown=pwuser:pwuser index.html styles.css build-profile.js multiplayer-protocol.js online-config.js localization.js ./
COPY --chown=pwuser:pwuser game.js progression.js hordeheart-model.js land-eater-model.js ./
COPY --chown=pwuser:pwuser locales ./locales
COPY --chown=pwuser:pwuser vendor ./vendor

# The server only loads its own bundled page. Running Node as the image's
# unprivileged user still keeps the public process away from root privileges;
# Playwright launches Chromium with its standard container flags.
USER pwuser

EXPOSE 8787

HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=4 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 8787) + '/readyz').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"]

CMD ["node", "server/index.js"]
