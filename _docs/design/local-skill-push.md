---
title: Local Skill Push
status: draft
updated: 2026-09-30
---

# Local Skill Push

## Purpose

Let a developer author skills in this repository with their own agent harness and model subscription, prove them locally, and push them to a production Workshop as themselves. It is the Draft, Qualify, and Publish stages of the [Revision Loop](revision-loop.md) for one artifact kind.

## Relationship to Upstream

Upstream already provides blueprint archives, `importBlueprint`, and sign-in through Cloudflare Access. It provides no command-line path to author, test, pack, and push a blueprint from a repository, and no way to connect a local agent harness to a local Workshop. This is fork-specific because it serves the fork's authoring workflow. Upstream's blueprint model is described in [`../../docs/blueprints.md`](../../docs/blueprints.md).

## Requirements

- A skill must be a directory in the bundled-blueprint layout, with its logic in pure functions and tests that compare output against committed expected values.
- Packing a skill must be byte-deterministic, so the content hash identifies exactly the code that passed its tests.
- A push must run the skill's tests first and must be refused if they fail.
- A push must act under the pusher's own identity. In production that identity must come from the deployment's Cloudflare Access policy; removing a person from the policy must revoke their ability to push.
- After a push, the tool must download the stored blueprint and confirm its content hash matches the local pack.
- The developer's model subscription credential must never be sent to any Workshop.
- A local agent harness must receive a Workshop session only after the signed-in developer confirms the pairing, and only for a Workshop on a loopback address.
- The whole flow must be provable locally, without any cloud account.
- No backend package may be changed.

## Behavior

A developer writes or edits a skill, runs its tests, and packs it. Locally, they connect their harness from the Workshop by confirming a one-time code, after which the harness can list, test, pack, install, and push skills. To push to production, they sign in through Cloudflare Access and push; the Workshop records them as the blueprint's owner and adds it to their library only.

A push with failing tests stops before anything is sent. A push from an identity outside the Access policy, or with a forged token, is refused. A pairing request from a non-loopback Workshop is refused.

## Non-Goals

- A scoped or revocable harness session. That needs a kernel change and belongs upstream.
- Deduplicating repeated pushes of the same content.
- Registering revisions, pinning dependencies, or recording who published; those belong to the [Revision Loop](revision-loop.md).

## Open Questions

- Should the archive's `author` be the pusher rather than the manifest's placeholder? (Calvin)

## Related

- Architecture: [`../architecture/local-skill-push.md`](../architecture/local-skill-push.md)
- Design: [Revision Loop](revision-loop.md)
