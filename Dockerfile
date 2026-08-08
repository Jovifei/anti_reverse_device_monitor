# Multi-stage Next.js app image. Company Mongo stays external (URI via env).
FROM node:22-bookworm-slim AS deps
# Build proxy — only effective when --build-arg HTTP_PROXY/HTTPS_PROXY are passed.
# Required when the build host is behind a corporate proxy. Lowercase vars are
# derived from the uppercase ones so both conventions resolve.
ARG HTTP_PROXY
ARG HTTPS_PROXY
ARG NO_PROXY
WORKDIR /app
ENV HTTP_PROXY=$HTTP_PROXY HTTPS_PROXY=$HTTPS_PROXY NO_PROXY=$NO_PROXY \
    http_proxy=$HTTP_PROXY https_proxy=$HTTPS_PROXY no_proxy=$NO_PROXY
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS builder
ARG HTTP_PROXY
ARG HTTPS_PROXY
ARG NO_PROXY
WORKDIR /app
ENV HTTP_PROXY=$HTTP_PROXY HTTPS_PROXY=$HTTPS_PROXY NO_PROXY=$NO_PROXY \
    http_proxy=$HTTP_PROXY https_proxy=$HTTPS_PROXY no_proxy=$NO_PROXY
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
