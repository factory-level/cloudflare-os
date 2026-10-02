# Fork Documentation

Documentation for what this fork adds to or changes in upstream [`cloudflare/cloudflare-os`](https://github.com/cloudflare/cloudflare-os). It follows the organization's documentation starter template, adapted so that every file it needs is net-new and the fork keeps syncing cleanly.

Upstream's own documentation stays where upstream put it and is not edited here:

| Location | Owner | Purpose |
| --- | --- | --- |
| [`../AGENTS.md`](../AGENTS.md), [`../README.md`](../README.md), [`../docs/`](../docs/), [`../plans/`](../plans/) | Upstream | The platform as upstream ships it |
| `_docs/` | Fork | What the fork adds, changes, or depends on |

Link to upstream documents rather than restating them. When upstream behavior matters to a fork topic, record the dependency in that topic's documents so an upstream sync knows what to re-check.

## Structure

```text
_docs/
  AGENTS.md         Fork documentation rules and the documentation agent procedure
  CLAUDE.md         Imports AGENTS.md for Claude Code
  README.md         This overview
  check-docs.sh     Documentation structure and link validation
  design/           Intended behavior and requirements of fork features
  architecture/     Current implementation of fork features
  adr/              Rationale for significant fork design changes
  wiki/             Fork setup, upstream-sync workflow, and shared knowledge
.claude/rules/fork-docs.md              Loads the fork rules into every Claude Code session
.github/PULL_REQUEST_TEMPLATE/fork.md   Documentation checklist for fork pull requests
```

Each documentation folder contains a `README.md` index and a template.

## Where the Fork Layout Differs from the Template

| Template | Fork | Reason |
| --- | --- | --- |
| `docs/` | `_docs/` | Upstream owns `docs/` |
| Root `AGENTS.md` and `CLAUDE.md` | `_docs/AGENTS.md`, `_docs/CLAUDE.md`, `.claude/rules/fork-docs.md` | Upstream owns the root `AGENTS.md` |
| Root `README.md` | `_docs/README.md` | Upstream owns the root `README.md` |
| `scripts/check-docs.sh` | `_docs/check-docs.sh` | Upstream owns `scripts/` |
| `.github/pull_request_template.md` | `.github/PULL_REQUEST_TEMPLATE/fork.md` | Upstream's default template carries its contribution policy |

## The Documentation Loop

| Location | Purpose | When to update |
| --- | --- | --- |
| [`design/`](design/) | Intended behavior and requirements | When the intended design changes |
| [`architecture/`](architecture/) | Current implementation and system structure | In the same commit or merge to the fork's default branch as the functionality change it documents |
| [`adr/`](adr/) | Architectural decision records explaining significant design changes | Only when the intended design changes and the decision needs a durable rationale |
| [`wiki/`](wiki/) | Setup instructions, conventions, and shared knowledge | When a workflow or reusable lesson emerges |

Design and architecture files share topic names, such as `local-skill-push.md`.

Changes to intended behavior must include the corresponding design update. Add an ADR only when the intended design changes and the decision needs a durable rationale; implementation-only changes do not warrant an ADR.

Every functionality change to fork-owned code that is committed or merged to the fork's default branch must include the corresponding architecture documentation update in that same commit or merge. Changes that arrive from an upstream sync are documented by upstream and are out of scope, except where they affect a recorded upstream dependency or touchpoint.

### Fork Additions to the Loop

The fork tracks two things the template does not, because both decide how costly an upstream sync is:

- **Upstream touchpoints.** Every upstream-owned file the fork edits. Each one is a potential merge conflict, so architecture documents list them with the reason the edit could not live in a net-new file.
- **Upstream dependencies.** Upstream exports, RPC interfaces, and behaviors a fork feature relies on. An upstream change to one of these can break the fork without a conflict, so architecture documents list them for review during a sync.

### Automating the Loop

- **Front matter.** Every document starts with YAML front matter. Architecture documents list the repository paths they `covers`, so an agent can map a diff to the documents it affects.
- **Design is intent, architecture is fact.** Agents update architecture documents to match the code, but change design documents only when a change's stated intent says intended behavior changed. Unexplained differences are recorded under "Divergences from Design" for a human to resolve.
- **Deterministic validation.** `_docs/check-docs.sh` checks front matter, design/architecture pairing, covered paths, folder indexes, and relative links, and exits non-zero on errors. With `UPSTREAM_REF` set, it also fails on an edit to an upstream-owned file that no architecture document lists as a touchpoint, and warns about fork-added paths no architecture document covers.

The full step-by-step procedure is in [AGENTS.md](AGENTS.md#documentation-agent-procedure).

## Validation

```sh
_docs/check-docs.sh                           # structure, pairing, links, indexes, covered paths
UPSTREAM_REF=origin/main _docs/check-docs.sh  # also: unlisted upstream edits are errors, uncovered fork paths are warnings
git diff --cached --check                     # whitespace errors in staged changes
```

Set `UPSTREAM_REF` to whichever ref tracks `cloudflare/cloudflare-os` in your clone.
