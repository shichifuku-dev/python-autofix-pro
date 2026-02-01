# Python Autofix Pro — GitHub App for safe, automatic Ruff fixes

Python Autofix Pro is a GitHub App that applies **Ruff** formatting and lint autofixes on pull requests and reports results as GitHub Checks.

> ⚠️ Review recommended: When autofixes are applied, the app may push a commit
> to the pull request branch. Always review “Files changed” before merging.


## What it does

- Runs on pull request and push events and creates two GitHub Check Runs: **CI/check** and **CI/autofix**
- Uses **Ruff** for formatting and lint autofixes
- When fixes are applied, it **pushes a commit to the PR branch only**
- Reports clear summaries even when no changes are made

## How it works (high-level flow)

1. A pull request is opened or updated
2. The app inspects the PR diff to see if Python files changed
3. Ruff is executed and two checks are created: **CI/check** and **CI/autofix**
4. If fixes are applied, the app commits them to the PR branch
5. If **unsafe fixes** are enabled and eligible, Ruff may run with `--unsafe-fixes` (Pro only, opt-in)

## Installation

Install the GitHub App from the Marketplace and select the repositories you want it to run on.  
The app only runs on repositories where it is installed.

## Configuration

### Settings issue (required for unsafe fixes)

Repository settings are stored **in a GitHub Issue within the repository**.  
This makes settings explicit, auditable, and visible to maintainers.

```json
{"enableUnsafeFixes": true}
```


### Admin-only verification (why it exists)

Enabling unsafe fixes requires **verification that the user making the change is a repository admin**.  
This is a deliberate safety control to prevent accidental or unauthorized risky changes.

## Plans: Free vs Pro

### Free
- Ruff formatting and **safe** autofixes only
- No unsafe fixes

### Pro
- Everything in Free
- Optional **unsafe fixes** (Ruff `--unsafe-fixes`), **opt-in** only

### Unsafe fixes eligibility (all conditions must be met)

Unsafe fixes run **only when all of the following are true**:

1. The installation plan is **Pro**
2. The repository setting `enableUnsafeFixes` is **true**
3. The user who enabled it is **verified as a repo admin**

## Safety & Transparency

- Always review “Files changed” before merging
- **Unsafe fixes never run unless explicitly enabled by a repo admin**
- The app **only pushes commits to the PR branch** (never the default branch)
- Checks are always reported, even when no Python files are changed
- This app does not guarantee code correctness and should be used as a developer productivity aid only.

## Permissions

The app requests the minimum GitHub App permissions needed:

- **Checks: read & write**
- **Contents: read & write**
- **Pull requests: read**
- **Issues: read & write**
- **Members: read**
- **Metadata: read**


## Webhooks / Events

- **pull_request** — inspects diffs, runs Ruff, updates checks
- **push** — reports check results only (no writes)
- **check_suite** — used for routing and logging


## Behavior

- The app analyzes files **only when Python files are present**
- It **always reports SUCCESS** when no target files are found
- README-only or docs-only PRs **do not fail checks**
- Users do NOT need to remove the check from Required Checks


## Troubleshooting

**“No target files found. Reporting success.”**  
No Python files were changed. This is expected behavior.

**“ruff format failed.”**  
Usually caused by invalid Python syntax.

**“No fixes available (hidden fixes…)”**  
Unsafe fixes exist but are disabled (Pro + admin opt-in required).


## Billing and Webhook Usage

This app uses GitHub Marketplace billing webhooks **only for paid plans**.

- Free plan users can install and use the app without triggering billing webhooks
- Webhooks are activated only when a paid subscription is started, updated, or cancelled
- Events are used exclusively for plan verification and access control

No billing or payment data is processed for free users.
