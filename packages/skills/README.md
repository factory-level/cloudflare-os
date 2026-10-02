# Skills

Skills authored in this repository — typically by a developer's own Claude Code — and shipped to a
Workshop as blueprints with the `gadgets` CLI (`packages/gadgets-cli`). Each `skills/<name>/` uses
the bundled-blueprint layout; the authoring rules, including the determinism rules, are in
`.claude/skills/author-gadget-skill/SKILL.md`.

```
node packages/gadgets-cli/src/bin.ts skill test momentum-signal
pnpm --filter @gadgets/skills test:run
```

`momentum-signal` is the demo skill: a pure moving-average momentum rule over integer-cent prices
that yields an order intent, pinned by golden fixtures.
