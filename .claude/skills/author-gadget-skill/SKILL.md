---
name: author-gadget-skill
description: Use when creating, changing, testing, or shipping a skill under packages/skills/skills/ — a deterministic gadget (blueprint) authored locally and pushed to a Workshop with the `gadgets` CLI or the `gadgets` MCP tools.
---

# Authoring a skill

A **skill** is a blueprint authored in this repository rather than in a Workshop: a directory
`packages/skills/skills/<name>/` in the bundled-blueprint layout, packed into the same `.gadget`
archive a Workshop exports and imports. You author it here, prove it locally, then push it to a
deployed Workshop, where it is attributed to the human whose Cloudflare Access login performed the
push.

## Layout

```
packages/skills/skills/<name>/
  blueprint.json      blueprintId ("skill.<name>"), title, description, output, author,
                      revision, created, version, lastUpdated, bindings ({} unless needed)
  files/
    README.md         what the gadget exposes
    revision.json     {"kind": "skill" | "workflow" | ..., "pins": [...]} -- the revision manifest
    server.ts         `export class Gadget extends DurableObject` -- its public methods are the API
    client.ts         builds the UI with DOM calls; `gadget` is the injected RPC stub
    lib/*.ts          pure modules both sides import (`./lib/name.ts`)
    lib/harness.ts    the replay contract: `harness.scenarios`, `harness.run(input)`,
                      `harness.session(bars, state?)` -- the tools, the tests and server.ts call it
  __tests__/          vitest, never shipped: tests of lib/ against fixed fixtures + golden output
```

`packages/bundled-blueprints/README.md` is the reference for what `files/` may contain (TypeScript
entries bundled to `client.js`/`server.js`, imports only of own files or bundled libraries,
`cloudflare:workers` only on the server).

## Revision manifest (required)

`files/revision.json` states the artifact's `kind` and the other revisions it depends on. A pin is
exact: `{"kind", "name", "number", "sha256"}`, where `number` is the pinned skill's `version` and
`sha256` the hash `skill pack` prints for it. Never write a range or "latest". Because the file is
shipped, changing a pin changes this skill's own content hash, so bump `version` too.

## Determinism rules (required)

The point of a skill is that what was tested is exactly what runs. So the decision logic lives in
pure `lib/` functions and must not read:

- the clock (`Date.now()`, `new Date()` without an argument, `performance.now()`),
- randomness (`Math.random()`, `crypto.getRandomValues`),
- the network or any binding,
- floating-point money: use integer minor units (cents) and integer arithmetic where results are
  compared or stored.

Inputs (prices, timestamps, parameters) are arguments. Tests pin results with a committed
`__tests__/golden.json`; regenerate it only when a behaviour change is intended, and say so.

## Workflow

Run from the repository root.

1. Start from a working skill: `gadgets new <name>` (MCP: `new_skill`). Then write or change it.
   Bump `version` in `blueprint.json` when the code changes.
   While iterating, `replay_skill` (or `gadgets run <name> --explain`) shows each scenario's
   decision and evidence chain in under a second with no Workshop; `compare_skills` shows where a
   variant differs from the original; `check_golden` lists scenarios whose result changed. Do not
   edit `__tests__/golden.json` yourself: say which scenarios changed and why, and the human
   accepts them with `gadgets golden <name> --update`.
2. `node packages/gadgets-cli/src/bin.ts skill test <name>` — must pass.
3. `node packages/gadgets-cli/src/bin.ts qualify <name>` (MCP: `qualify_skill`) — runs every check
   (manifest, deterministic pack, pins, secret scan, tests) and prints the record bound to the
   content hash. It must pass before anything is published.
4. Try it in a Workshop: `try_skill` (or `gadgets try <name>`) tests, pushes, creates a fresh
   workspace and calls it, and reports whether the Workshop's results equal the local replay.
   `call_gadget` reaches that workspace again; `clean_workspaces` removes what was created.
5. Ship it: a **human** runs `node packages/gadgets-cli/src/bin.ts login <workshop-url>` once; then
   `push_skill` (MCP) or `gadgets push <name> --to <workshop-url>` tests, packs, pushes and verifies
   the Workshop serves back the same hash.

6. Register the revision with the lab: after a **human** has run `gadgets login <lab-url>`,
   `publish_revision` (MCP) or `gadgets publish <name> --lab <lab-url>`. A published
   `<kind>/<name>@<version>` is immutable: the lab refuses the same number with different content, so
   a change is always a new `version`.

Never try to obtain or forward credentials yourself: `gadgets login` is for the human to run, and
the Workshop never receives this harness's own model credentials.

## Type checks

`packages/skills` type-checks each skill's `client.ts` (DOM), `server.ts` (Workers types) and tests
(Node) separately: `node_modules/.bin/vp run -F @gadgets/skills build`.
