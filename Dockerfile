# Multi-stage Next.js app image. Company Mongo stays external (URI via env).
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS builder
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Prisma client for SQLite; APP_DATABASE_URL only needed at runtime for migrate/sync.
ENV APP_DATABASE_URL=file:../data/device-monitor.db
RUN npx prisma generate && npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV APP_DATABASE_URL=file:../data/device-monitor.db
RUN mkdir -p /app/data /app/config
COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/src ./src
COPY --from=builder /app/config ./config
COPY --from=builder /app/tsconfig.json ./tsconfig.json
ENTRYPOINT ["sh", "/app/scripts/docker-entrypoint.sh"]
EXPOSE 3000
CMD ["npm", "run", "start"]
