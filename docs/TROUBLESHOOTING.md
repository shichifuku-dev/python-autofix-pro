# Troubleshooting

## Ruff not found / Python missing

If you see logs or check output indicating that `ruff` or Python is missing, the
server is likely running without the required tooling available at runtime. The
Render deployment should use the provided Dockerfile so the image includes:

- Node.js for the webhook server
- Python 3.11+ and pip
- `ruff` installed at build time

With the Docker deployment, `ruff` is installed during the build and the app
logs its version on startup (`ruff --version`), ensuring it is available for
every autofix run.

## Required Render settings

Use the Dockerfile in the repository root. Render will automatically start the
container and detect the port from the `PORT` environment variable.

**Environment variables**

- `APP_ID` (GitHub App ID)
- `PRIVATE_KEY` (GitHub App private key PEM)
- `WEBHOOK_SECRET` (GitHub App webhook secret)
- `WEBHOOK_PATH` (optional, defaults to `/api/webhook` with `/webhooks` fallback)
- `DOCS_URL` (optional, public docs link surfaced in check output)
- `PORT` (Render sets this automatically)

**Health check**

- `GET /health` should return `{ "status": "ok" }`
