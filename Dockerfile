ARG NODE_VERSION=18
ARG RUFF_VERSION=0.5.7

FROM node:${NODE_VERSION}-bookworm AS deps
WORKDIR /app/app-server
COPY app-server/package.json app-server/package-lock.json ./
RUN npm ci

FROM deps AS build
COPY app-server/ ./
RUN npm run build

FROM node:${NODE_VERSION}-bookworm-slim AS prod-deps
WORKDIR /app/app-server
COPY app-server/package.json app-server/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM node:${NODE_VERSION}-bookworm-slim AS runtime
ARG RUFF_VERSION
ENV NODE_ENV=production

WORKDIR /app/app-server

# 1) 必須ツール: git + curl + ca-certificates
# 2) ruff は pip ではなく公式バイナリを取得して配置（PEP668回避）
RUN apt-get update \
  && apt-get install -y --no-install-recommends git curl ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && curl -LsSf https://github.com/astral-sh/ruff/releases/download/v${RUFF_VERSION}/ruff-x86_64-unknown-linux-gnu.tar.gz \
    | tar -xz -C /tmp \
  && mv /tmp/ruff-*/ruff /usr/local/bin/ruff \
  && chmod +x /usr/local/bin/ruff \
  && ruff --version

COPY --from=prod-deps /app/app-server/node_modules ./node_modules
COPY --from=build /app/app-server/dist ./dist
COPY app-server/package.json ./

EXPOSE 3000
CMD ["node", "dist/index.js"]
