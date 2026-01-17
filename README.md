# Python Autofix Pro — GitHub App for safe, automatic Ruff fixes

Python Autofix Pro is a GitHub App that applies **Ruff** formatting and lint autofixes on pull requests and reports results as GitHub Checks.

> ⚠️ **Review required:** The app may push a commit to the PR branch. Always review “Files changed” before merging.

## What it does

- Runs on pull request events and creates two GitHub Check Runs: **`CI/check`** and **`CI/autofix`**.
- Uses **Ruff** for formatting and lint autofixes.
- When fixes are applied, it **pushes a commit to the PR branch** only.
- Reports clear summaries even when no changes are made.

## How it works (high-level flow)

1. A pull request is opened or updated.
2. The app inspects the PR diff to see if Python files changed.
3. It runs Ruff and creates two checks: **`CI/check`** and **`CI/autofix`**.
4. If Ruff applies fixes, the app commits them to the PR branch.
5. If **unsafe fixes** are enabled and eligible, Ruff may run with `--unsafe-fixes` (Pro only, opt-in).

## Installation

Install the GitHub App from the Marketplace and select the repositories you want it to run on. The app only runs on repositories where it is installed.

## Configuration

### Settings issue (required for unsafe fixes)

Repository settings are stored **in a GitHub Issue within the repository**. This makes settings explicit, auditable, and visible to maintainers.

Create or update the settings issue with JSON like this:

```json
{"enableUnsafeFixes": true}
```

### Admin-only verification (why it exists)

Enabling unsafe fixes requires **verification that the user making the change is a repository admin**. This is a deliberate safety control to prevent accidental or unauthorized enabling of risky changes.

## Plans: Free vs Pro

**Free**
- Ruff formatting and **safe** autofixes only.
- No unsafe fixes.

**Pro**
- Everything in Free.
- Optional **unsafe fixes** (Ruff `--unsafe-fixes`), **opt-in** only.

### Unsafe fixes eligibility (all conditions must be met)

Unsafe fixes run **only when all of the following are true**:

1. The installation plan is **Pro**.
2. The repository setting `enableUnsafeFixes` is **true**.
3. The user who enabled it is **verified as a repo admin**.

If unsafe fixes are not enabled and Ruff detects hidden fixes, the check summary will include:

> "Pro can enable Unsafe Fixes to attempt to auto-fix these."

## Safety & Transparency

- Always review “Files changed” before merging.
- **Unsafe fixes never run unless explicitly enabled by a repo admin.**
- The app **only pushes commits to the PR branch** (never the default branch).
- Checks are always reported, even when no Python files are changed.

## Permissions required (high level)

The app needs permissions to:

- Read pull requests and repository metadata.
- Create and update GitHub Check Runs.
- Push commits to PR branches when fixes are applied.
- Read and update the settings issue in the repository.

> Permissions are intentionally scoped to GitHub App capabilities and do not include user tokens.

## Troubleshooting

**“Skipped: no Python changes.”**
- The PR did not include Python file changes. The checks still complete successfully.

**“ruff format failed.”**
- Typically caused by **invalid Python syntax** in modified files. Fix syntax errors and re-run.

**“No fixes available (hidden fixes…)”**
- Ruff may have fixes that are considered unsafe. If you want the app to attempt these, enable unsafe fixes (Pro + admin opt-in).

**“Resource not accessible by integration”**
- The GitHub App token lacks permissions for the resource. Confirm the app is installed on the repo and has required access.

## FAQ

**Does it run on forks?**
- The app can only act within repositories where it is installed. For forks, permissions may prevent pushing commits.

**Can it change non-Python files?**
- No. It only formats and fixes Python files via Ruff.

**Can Free users enable Pro features via settings?**
- No. Plan gating is enforced at the installation level; settings alone do not unlock Pro behavior.

## Security / Responsible use

- This app **does not guarantee correctness**. It enforces formatting and linting only.
- Always review changes before merging.
- Keep unsafe fixes disabled unless you explicitly want them and understand the risk.

## Development / Testing

There is a temporary `PLAN_OVERRIDE=pro` environment variable used **for testing only**. It must be **removed before launch**.

## License / Contact

See `LICENSE` for licensing details. For support, open a GitHub issue or contact the maintainers through GitHub Marketplace support.
