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
ENV NODE_ENV=production \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app/app-server

# 必須: git（spawn git ENOENT 対策）
# 必須: python3 + pip（ruff 実行用）
# PEP668 対策: --break-system-packages を付けて ruff を pip で入れる
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-pip git ca-certificates \
  && python3 -m pip install --no-cache-dir --break-system-packages "ruff==${RUFF_VERSION}" \
  && ruff --version \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*

COPY --from=prod-deps /app/app-server/node_modules ./node_modules
COPY --from=build /app/app-server/dist ./dist
COPY app-server/package.json ./

EXPOSE 3000
CMD ["node", "dist/index.js"]
