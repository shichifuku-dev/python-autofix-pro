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
    PYTHONUNBUFFERED=1

WORKDIR /app/app-server

# ★ ここが重要：git を追加
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        python3 \
        python3-pip \
        git \
    && python3 -m pip install --no-cache-dir "ruff==${RUFF_VERSION}" \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

COPY --from=prod-deps /app/app-server/node_modules ./node_modules
COPY --from=build /app/app-server/dist ./dist
COPY app-server/package.json ./

EXPOSE 3000
CMD ["node", "dist/index.js"]
