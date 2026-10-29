FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN DATABASE_URL=mysql://build:build@127.0.0.1:4000/build npm run db:generate
RUN npm run ocr:prepare
RUN DATABASE_URL=mysql://build:build@127.0.0.1:4000/build AUTH_SECRET=build-placeholder-only npm run build
FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=build --chown=node:node /app /app
RUN mkdir -p /app/backups && chown node:node /app/backups
RUN groupadd --system --gid 1001 medishop-receipt && useradd --system --uid 1001 --gid 1001 --home-dir /nonexistent --shell /usr/sbin/nologin medishop-receipt
EXPOSE 10000
CMD ["/bin/sh", "-c", "exec su -s /bin/sh node -c 'exec node node_modules/next/dist/bin/next start --hostname 0.0.0.0 --port ${PORT:-3000}'"]
