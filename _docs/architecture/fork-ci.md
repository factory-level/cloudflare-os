---
title: Fork CI
covers:
  - .github/workflows/fork-docs.yml
touchpoints: []
updated: 2026-10-08
---

# Fork CI

## Overview

The fork runs upstream's `CI` workflow (`.github/workflows/ci.yml`: lint, build, test) unchanged, plus one fork-owned workflow, `Fork docs`, that enforces the documentation rules in [`../AGENTS.md`](../AGENTS.md) on every pull request and push to `main`.

Upstream's other workflows need Cloudflare-owned secrets or enforce upstream's contribution process, so they are disabled in the fork's GitHub Actions settings rather than edited or deleted, keeping the files identical to upstream for syncs.

## Components

| Path | Responsibility |
| --- | --- |
| `.github/workflows/fork-docs.yml` | Fetches `cloudflare/cloudflare-os` `main` as `upstream/main`, runs `UPSTREAM_REF=upstream/main _docs/check-docs.sh`, and, on pull requests, `git diff --check` against the base branch |

## Data and Control Flow

Both `CI` and `Fork docs` trigger on `pull_request` and on pushes to `main`. `Fork docs` checks out full history so `check-docs.sh` can find the merge base with upstream. It compares against upstream rather than `origin/main`: `origin` is the fork, so every file already on the fork's `main` would count as upstream-owned and editing one (an index, say) would fail the check.

## Configuration

Workflows disabled in the fork (Actions settings, `gh workflow disable`), with the reason:

| Workflow | Reason |
| --- | --- |
| `Bonk`, `Bonk PR Review` | Need upstream's AI Gateway secrets |
| `Workshop evals`, `Workshop eval comparison` | Need upstream's AI Gateway secrets |
| `Preview` | Deploys to upstream's Cloudflare account; already gated on `repository_owner == 'cloudflare'` |
| `CLA Assistant`, `Contribution policy`, `Label PR` | Upstream's contribution process; would comment on, label, or close fork PRs |

Re-enable one with `gh workflow enable "<name>"`. An upstream sync that adds a workflow arrives enabled, so review new workflows on each sync.

## Upstream Touchpoints

None.

## Upstream Dependencies

| Upstream path | Relied on for |
| --- | --- |
| `.github/workflows/ci.yml` | Lint, build, and test on pull requests and `main` |

## Divergences from Design

None. There is no design document; this topic is infrastructure only.

## Open Questions

- Whether to require `CI` and `Fork docs` as status checks on `main` through a branch ruleset.
