# Python Autofix Pro — GitHub App for safe, automatic Ruff fixes

Python Autofix Pro is a GitHub App that applies **Ruff** formatting and lint autofixes on pull requests and reports results as GitHub Checks.

> ⚠️ Review recommended: When autofixes are applied, the app may push a commit
to the pull request branch. Always review “Files changed” before merging.

## What it does

- Runs on pull request and push events and creates two GitHub Check Runs: **`CI/check`** and **`CI/autofix`**.
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

## Permissions

The app requests the minimum GitHub App permissions needed for its workflow:

- **Checks: read & write** — create and update GitHub Check Runs.
- **Contents: read & write** — clone the repository and push autofix commits to PR branches.
- **Pull requests: read** — list PR files and metadata to decide when to run.
- **Issues: read & write** — read/update the settings issue and post PR comments.
- **Members: read** — verify repository admin status for unsafe-fix enablement.
- **Metadata: read** — required by GitHub to access basic repository context.

## Webhooks / Events

- **pull_request** — on opened/synchronize/reopened/ready_for_review, the app inspects changed files, runs Ruff, and updates `CI/check` and `CI/autofix`. It posts a comment when fixes are applied or when checks fail.
- **push** — the app creates check runs on the pushed commit and reports results; autofix is only applied via pull requests.
- **check_suite** — used for logging and routing; the app defers to pull_request events for actual processing.

## Behavior

- The app analyzes files **only when Python files are present** in a pull request diff.
- It **creates two checks** (`CI/check` and `CI/autofix`) for every supported event.
- It **pushes a commit only to the PR branch** when autofixes are applied.
- It **does nothing beyond reporting results** when:
  - Only README/docs change,
  - No Python files match the target rules, or
  - All files are excluded by configuration.
- **If no target files are found, the app still reports SUCCESS.**
- **This means users do NOT need to remove the check from Required Checks.**

> Permissions are intentionally scoped to GitHub App capabilities and do not include user tokens.

## Troubleshooting

**“No target files found. Reporting success.”**
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

## License / Contact

See `LICENSE` for licensing details. For support, open a GitHub issue or contact the maintainers through GitHub Marketplace support.
