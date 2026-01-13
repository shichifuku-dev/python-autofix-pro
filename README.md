# Python Autofix Pro (GitHub App)

Python Autofix Pro is a production-ready GitHub App that runs on pull request events and automatically fixes Python formatting/lint issues using **ruff** (and optional **black**). It always reports two required check runs, even when skipping, so repositories never get stuck waiting for pending statuses.

## What it does

- Listens to pull request events (`opened`, `synchronize`, `reopened`, `ready_for_review`).
- Detects whether Python files are present in the PR diff.
- Always reports the required check runs:
  - `CI/check`
  - `CI/autofix`
- When Python files are present:
  - Runs `ruff format`, then `ruff check --fix`.
  - Optionally runs `black` when a black configuration is detected.
  - Commits fixes to the PR **head** branch only (never the default branch, never force-pushes).
  - Reports check results and posts a PR comment only when fixes were committed or failures occurred.

## What it does *not* do

- It does not guarantee mergeability, correctness, or availability.
- It does not block merges when tools fail; it still reports `CI/check` as a failure with a concise summary and `CI/autofix` as neutral.
- It does not touch the default branch.
- It does not run arbitrary code beyond formatting/linting the PR head branch.

## Safety guarantees

- **Never force-pushes**.
- **Never commits to the default branch**.
- **Only commits to PR head branches** when fixes are applied.
- Always completes check runs so CI does not stall.

## Required check runs

This app always reports two required checks:

- `CI/check`
- `CI/autofix`

When there are no Python changes, both are marked as `success` with the output: `Skipped: no Python changes.`

## Limitations

- Results depend on the availability of `ruff`/`black` in the runtime environment.
- Linting failures or syntax errors are reported but do not block merges automatically.
- Fork permissions may limit the ability to push changes to PR branches.

## Configuration

### Environment variables

| Variable | Description |
| --- | --- |
| `APP_ID` | GitHub App ID |
| `PRIVATE_KEY` | GitHub App private key (PEM) |
| `WEBHOOK_SECRET` | Webhook secret configured in GitHub App |
| `PORT` | Server port (default: 3000) |
| `DOCS_URL` | Optional URL to include in PR comments |

### GitHub App permissions

Recommended permissions for the GitHub App:

- **Checks**: Read & Write
- **Contents**: Read & Write (for PR head branch commits)
- **Pull requests**: Read
- **Issues**: Write (for PR comments)
- **Metadata**: Read

## Deployment notes

The server is a minimal Express app with:

- `GET /health` for readiness checks.
- `POST /webhooks` for GitHub webhook payloads.

Example (Render/Fly/Cloud Run):

- Set the environment variables above.
- Run `npm --prefix app-server install`.
- Build via `npm --prefix app-server run build`.
- Start via `npm --prefix app-server start`.

## Local development

```bash
npm --prefix app-server install
npm --prefix app-server run dev
```

## Testing

```bash
npm --prefix app-server test
npm --prefix app-server run build
```

## Examples

Sample files for local testing are provided in the `examples/` directory.

## Support

For support, open an issue or contact the maintainers through GitHub Marketplace support channels.

## Disclaimer

**This tool does not guarantee mergeability, correctness, or availability. It provides best-effort CI reporting only. Not responsible for production outages, lost revenue, or damages.**
