# Pin updates and verification procedure: deploy/RELEASES.md.
FROM node:24.22.0-bookworm-slim@sha256:a5f4366e834695d5f363b920c104953a535d3a9864d1bdf74566a0ebe01daee5 AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/types/package.json packages/types/package.json
COPY packages/state/package.json packages/state/package.json
COPY packages/lib/package.json packages/lib/package.json
COPY packages/mail/package.json packages/mail/package.json
COPY packages/calendar/package.json packages/calendar/package.json
COPY packages/notes/package.json packages/notes/package.json
COPY packages/tasks/package.json packages/tasks/package.json
COPY packages/home-server/package.json packages/home-server/package.json
# npm has no --no-cache switch; a disposable cache keeps it out of the image.
RUN --mount=type=tmpfs,target=/tmp/npm-cache npm ci --cache /tmp/npm-cache --no-audit --no-fund

FROM dependencies AS build
ENV NEXT_TELEMETRY_DISABLED=1
COPY . .
RUN mkdir -p apps/web/public && npm run build

FROM node:24.22.0-bookworm-slim@sha256:a5f4366e834695d5f363b920c104953a535d3a9864d1bdf74566a0ebe01daee5 AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /app/apps/web/public ./apps/web/public
# Feature discovery reads cwd/package.json, not the standalone generated manifest.
COPY --from=build --chown=node:node /app/apps/web/package.json ./apps/web/package.json
WORKDIR /app/apps/web
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.status < 500 ? 0 : 1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
