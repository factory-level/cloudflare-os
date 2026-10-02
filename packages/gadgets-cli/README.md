# `gadgets` — local authoring, identity-bound push

Lets a developer author skills in this repository with their own agent harness (Claude Code, on
their own subscription), prove them locally, and push them to a production Workshop **as
themselves**, gated by the deployment's Cloudflare Access policy.

Everything here lives in new files (this package, `packages/skills`,
`workshop-frontend/src/features/local-harness`, `workshop-frontend/vite.harness.config.ts`), so the
fork keeps syncing with upstream. No backend (kernel) change is needed: a push is the existing
`AuthenticatedApi.importBlueprint`, reached through the existing Access-mode authentication.

## How identity and authority flow

| Hop | Credential | Who obtained it | What it grants |
| --- | --- | --- | --- |
| Harness → model | the harness's own subscription | the developer, in Claude Code | nothing in any Workshop; never leaves Claude Code |
| Harness → local Workshop | the developer's local session, handed over by pairing | the signed-in developer, clicking **Connect** | acting as them in the **local** Workshop only (loopback URLs only) |
| CLI / harness → production | Cloudflare Access token (`gadgets login`) | the human, through the IdP (`cloudflared access login`) | `/api` as the token's email, while the Access policy allows it |

The production Workshop resolves the pusher from the Access JWT's `email` claim, creates the
blueprint with that user as owner, and adds it to their library only. Revoking the person in the
Access policy revokes their pushes. Credentials are stored in `~/.config/gadgets/credentials.json`
(mode 0600; `GADGETS_CONFIG_DIR` overrides).

Every push re-downloads the blueprint and compares the SHA-256 of the archive's content section
(the gzip'd file snapshot, which the Workshop stores verbatim) with the local pack. Packing is
byte-deterministic, so the hash identifies exactly the code that passed its tests.

## The development loop

```
gadgets new my-rule --kind workflow      # copy a working skill, renamed, at version 1
gadgets dev my-rule                      # on every save: decisions, what changed, golden, tests
gadgets run my-rule --explain            # one replay with each step of the evidence chain
gadgets run my-rule --bars bars.csv --walk   # one session per bar, portfolio carried forward
gadgets compare breakout-workflow my-rule    # same inputs, where the results differ
gadgets golden my-rule --update          # accept an intended change (a person runs this)
gadgets try my-rule --to <workshop-url>  # test, push, fresh workspace, call it, compare with local
gadgets call my-rule replay --args '[[...bars]]'
gadgets clean --to <workshop-url>        # delete what try created
gadgets status
```

The inner loop (`new`, `dev`, `run`, `compare`, `golden`) needs no server: it calls the skill's
`files/lib/harness.ts` in a child process. The middle loop (`try`, `call`, `runs`, `clean`) acts in
the Workshop named with `--to`, or in the paired local one. Add `--json` for machine-readable
output. See `_docs/architecture/agent-dev-loop.md`.

## Commands

```
node packages/gadgets-cli/src/bin.ts skill list | test <skill> | pack <skill>
node packages/gadgets-cli/src/bin.ts qualify <skill>               # every check, bound to the content hash
node packages/gadgets-cli/src/bin.ts publish <skill> --lab <lab-url>  # qualify, then register the revision
node packages/gadgets-cli/src/bin.ts login <workshop-url>          # real deployments: cloudflared
node packages/gadgets-cli/src/bin.ts push <skill> --to <workshop-url>
node packages/gadgets-cli/src/bin.ts verify <blueprint-id> --to <url> --sha256 <hash>
node packages/gadgets-cli/src/bin.ts mcp [--pair <code>]           # started by the harness
```

`qualify` checks the skill's `files/revision.json` (its kind and exact pins), that packing is
byte-identical, that every pin matches the local skill it names, that no shipped file holds a
credential, and that the tests pass. `publish` sends the qualified bytes to the trading lab's
registry under the Access identity from `gadgets login <lab-url>`; the lab recomputes the hash and
records who published. See `_docs/architecture/revision-loop.md`.

## Connecting Claude Code (local mode)

1. `pnpm dev-server`, and in place of `pnpm dev-client`: `pnpm --filter @gadgets/cli dev:client`
   (the Workshop's Vite server plus the launcher; not present in production builds or Access mode).
2. Sign in, click **Connect local agent harness**, run the shown
   `claude mcp add gadgets -- node packages/gadgets-cli/src/bin.ts mcp --pair <code>` from the repo
   root, and start Claude Code there.
3. The dialog names the waiting harness; click **Connect**. Claude Code now has the `gadgets` tools:
   `workshop_status`, `list_skills`, `test_skill`, `pack_skill`, `qualify_skill`,
   `publish_revision`, `install_skill_locally`, `push_skill`. The skill-authoring rules are in `.claude/skills/author-gadget-skill/SKILL.md`.

The bridge listens on `127.0.0.1:47821` only until paired, answers only `http://localhost:3000`,
only for its code, and accepts a session only for a loopback Workshop.

## Fully local demo

```
pnpm --filter @gadgets/cli demo:prod-sim   # Access-mode Workshop on :18791 behind a mock Access edge on :18790
pnpm --filter @gadgets/cli demo            # scripted, deterministic proof (another terminal)
```

The prod-sim is the real workshop-backend in the mode every release runs in, with the mock edge as
its `CF_ACCESS_ISS`. The edge's IAM policy is `packages/gadgets-cli/policy.json` (created from
`src/demo/policy.example.json`; re-read per request). Its identity provider is a picker, which is
the only part real Access adds. The demo checks: tests pass; packing is byte-identical; alice's push
is attributed to alice and hash-verified; it is in alice's library and not bob's; an identity
outside the policy, a forged token, and a forged assertion sent straight to the Workshop are
refused; dropping bob from the policy revokes his existing token. Ports: `GADGETS_DEMO_*_PORT`.

The same CLI then works against a real deployment: `gadgets login https://<prod>` (cloudflared)
and `gadgets push <skill> --to https://<prod>`.

## Known limits

- The local session handed to a harness is the browser's own full session token: the Workshop has
  no scoped or revocable session yet. It is confined to loopback Workshops, but unpairing means
  deleting the `harness` entry from the credentials file. A scoped, revocable harness session is a
  kernel change and belongs in its own upstream PR.
- In production, a token the edge issued would also be accepted by the Worker if it were reachable
  without passing through Access (e.g. a `workers.dev` route). Keep the Workshop reachable only
  through the Access-protected hostname.
- Each push creates a new blueprint id; re-pushing the same hash is not deduplicated.
- `pnpm dev-server` needs a free inotify instance per watcher; on a machine at
  `fs.inotify.max_user_instances` (default 128) it fails with `EMFILE`. Raise it with
  `sudo sysctl fs.inotify.max_user_instances=512`.
