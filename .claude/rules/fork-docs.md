# Fork documentation

This repository is a fork of `cloudflare/cloudflare-os`. The root `AGENTS.md` is upstream's; the fork's own rules are in `_docs/AGENTS.md`. Read that file before changing fork-owned code or editing any upstream-owned file.

- Put fork changes in net-new files and packages. Do not edit upstream documentation to describe fork behavior.
- A functionality change to fork-owned code ships with its `_docs/architecture/` update in the same commit.
- An edit to an upstream-owned file is recorded in `touchpoints` front matter and under "Upstream Touchpoints" in the covering architecture document; an unrecorded one fails the check.
- Run `UPSTREAM_REF=origin/main _docs/check-docs.sh` before finishing.
