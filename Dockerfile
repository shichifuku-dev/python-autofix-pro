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
    PATH="/root/.local/bin:${PATH}"
WORKDIR /app/app-server

# Install Python + pipx, then install ruff into an isolated venv (avoids PEP 668)
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-venv pipx ca-certificates \
    && pipx install "ruff==${RUFF_VERSION}" \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

COPY --from=prod-deps /app/app-server/node_modules ./node_modules
COPY --from=build /app/app-server/dist ./dist
COPY app-server/package.json ./

# Render injects PORT at runtime; keep EXPOSE aligned with expected port.
# If your app listens on process.env.PORT, EXPOSE can be 3000 or omitted.
EXPOSE 3000

CMD ["node", "dist/index.js"]
