# Fork Documentation Guidelines

These instructions apply to human contributors and coding agents, including automated documentation agents, working on this fork. They add to the upstream [`../AGENTS.md`](../AGENTS.md), which still governs the code itself. `CLAUDE.md` in this folder imports this file; keep fork documentation rules here rather than duplicating them.

## Fork Rules

This repository is a fork of `cloudflare/cloudflare-os` that keeps syncing with upstream.

- Put fork changes in net-new files and packages. Build on upstream's exported functions from new modules instead of editing upstream files.
- When an edit to an upstream-owned file is unavoidable, keep it as small as possible and record it under "Upstream Touchpoints" in the architecture document that covers the feature.
- Never edit upstream documentation (`AGENTS.md`, `README.md`, `CONTRIBUTING.md`, `REVIEW.md`, `docs/`, `plans/`) to describe fork behavior. Fork documentation lives in `_docs/`.
- A path is fork-owned when it does not exist in upstream. Everything else is upstream-owned.

## Structure

- `_docs/README.md` explains the layout and the Documentation Loop.
- `_docs/design/` holds intended behavior and requirements of fork features.
- `_docs/architecture/` holds documentation of the current fork implementation.
- `_docs/adr/` holds decision records for significant fork design changes.
- `_docs/wiki/` holds fork setup instructions, the upstream-sync workflow, and shared knowledge.
- `_docs/check-docs.sh` validates documentation structure and links.
- `.github/PULL_REQUEST_TEMPLATE/fork.md` carries the documentation checklist for fork pull requests. Open a pull request with `?template=fork.md` to use it; the default template is upstream's.

Each documentation folder has a `README.md` index and a template (`_template.md`, or `0000-template.md` for ADRs).

## Validation Commands

```sh
_docs/check-docs.sh                           # front matter, design/architecture pairing, links, indexes, covered paths
UPSTREAM_REF=origin/main _docs/check-docs.sh  # also: unlisted upstream edits are errors, uncovered fork paths are warnings
git diff --check                              # whitespace errors in tracked changes
git diff --cached --check                     # whitespace errors in staged changes, including new files
```

`_docs/check-docs.sh` exits non-zero on errors and prints warnings without failing. Review Markdown rendering and factual accuracy manually. Code validation (`pnpm build`, `pnpm test`, `pnpm lint`) is described in the upstream `AGENTS.md`.

## Documentation Style and Naming

Use Markdown headings, short paragraphs, and actionable language. Use fenced code blocks for commands and relative links for repository documents. Use lowercase, hyphen-separated filenames such as `local-skill-push.md`.

Design and architecture documents covering the same topic must share filenames. Clearly distinguish planned behavior from the current implementation. Link to upstream documents instead of restating them.

Start every new document from its folder's template and keep its YAML front matter:

| Folder | Filename | Required front matter |
| --- | --- | --- |
| `_docs/design/` | `<topic>.md` | `title`, `status` (`draft`, `accepted`, `superseded`), `updated` |
| `_docs/architecture/` | `<topic>.md` | `title`, `covers` (list of repository paths), `updated`; `touchpoints` (list of upstream-owned files the topic edits) when there are any |
| `_docs/adr/` | `NNNN-<slug>.md`, numbered sequentially | `title`, `status` (`proposed`, `accepted`, `superseded`, `deprecated`), `date` |
| `_docs/wiki/` | `<topic>.md` | `title`, `updated` |

Dates use `YYYY-MM-DD`. `covers` paths are relative to the repository root. Add every new document to its folder's `README.md` index.

## Required Documentation Updates

Update the corresponding design document whenever intended behavior changes. Add an ADR only for a design change whose decision needs a durable rationale. Implementation-only changes do not warrant ADRs, and not every design change requires one.

Every functionality change to fork-owned code, and every new or changed edit to an upstream-owned file, that is committed or merged to the fork's default branch must include accurate architecture documentation in that same commit or merge. Do not defer that update.

Changes that arrive through an upstream sync need no fork documentation of their own. They do need a review of the "Upstream Touchpoints" and "Upstream Dependencies" sections they affect.

## Documentation Agent Procedure

Automated documentation agents follow this loop for each change they process, such as a commit range, branch, or pull request.

1. **Read the change.** Inspect the full diff and any linked issue, pull request description, or commit messages. Identify every changed path.
2. **Separate fork from upstream.** Classify each changed path as fork-owned, an upstream touchpoint (an upstream-owned file the fork edits), or upstream-only (arrived through a sync). Upstream-only paths need no fork documentation.
3. **Map paths to topics.** Find architecture documents whose `covers` list contains or is a parent of each fork-owned path or touchpoint. Each matched architecture document's design counterpart shares its filename.
4. **Classify the change.** Decide whether it changes functionality, changes intended behavior, or neither (for example, formatting, comments, or dependency bumps with no behavior change).
5. **Update architecture documents.** For functionality changes, revise each matched document so it describes the resulting implementation, then refresh `updated`. If no document covers a changed path, extend the closest topic's `covers` list or create a new topic from the template.
6. **Record the upstream surface.** List every upstream-owned file the change edits in the `touchpoints` front matter and under "Upstream Touchpoints" with the reason it could not be a net-new file. List upstream exports, interfaces, and behaviors the change newly relies on under "Upstream Dependencies". Remove entries the change makes obsolete.
7. **Handle design documents conservatively.** Update a design document only when the change's stated intent (issue, pull request description, commit message, or explicit instruction) says intended behavior changed. Never rewrite a design document just to match code. When the implementation diverges from the design without stated intent, record it under the architecture document's "Divergences from Design" section and report it.
8. **Decide on an ADR.** Draft one only when the intended design changed and the decision needs durable rationale. Mark agent-drafted ADRs `status: proposed`; a human accepts them.
9. **Maintain indexes and links.** Add new documents to the folder `README.md` indexes and fix links broken by moved or deleted files.
10. **Validate.** Run `_docs/check-docs.sh` and `git diff --check`, then fix every error.
11. **Report.** In the pull request or run summary, list documents changed, upstream touchpoints added or removed, divergences recorded, ADRs proposed, and open questions.

For an upstream sync, run this shorter loop instead:

1. List the upstream-owned paths the sync changed.
2. For each architecture document, check its "Upstream Touchpoints" and "Upstream Dependencies" against that list.
3. Where a touchpoint conflicted or a dependency changed, update the fork code and the architecture document together, and report what moved.

Agents must not:

- Invent behavior, requirements, or rationale that the code, diff, or stated intent does not support. Record uncertainty under "Open Questions" instead.
- Change a design document's `status` to `accepted`, or an ADR's `status` to `accepted`, without human instruction.
- Delete documents for removed functionality without also updating their design counterparts and indexes; prefer marking design documents `superseded`.
- Defer an architecture update to a later commit.
- Edit upstream documentation to describe fork behavior.

The loop is done when every changed fork-owned path and touchpoint is covered by an up-to-date architecture document, divergences and open questions are recorded, and validation passes.

## Commit and Pull Request Guidelines

Use concise, imperative subjects, such as `Clarify documentation update rules`. Keep changes focused. Pull request descriptions should explain what changed, why, and how it was validated, and complete the checklist in `.github/PULL_REQUEST_TEMPLATE/fork.md`.
