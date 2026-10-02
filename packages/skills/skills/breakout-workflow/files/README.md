# Breakout Workflow

A deterministic, event-driven agent workflow for a virtual trading study. Each run:

1. **observes** a bar series (`{ t, closeCents, volume }`, oldest first),
2. **classifies** the latest bar against the prior `lookback` bars as `price.breakout` (close above
   the window's max), `price.breakdown` (below its min), `volume.anomaly` (volume >= 3x the window's
   average, only when there is no price event) or `none`,
3. **asserts** risk checks over the portfolio and policy, recording each pass/fail with a reason,
4. **decides**: breakout buys, breakdown sells the existing position, anything else holds; sized by
   policy, and `blocked` if any assertion fails,
5. **executes virtually** under execution model v1: fill at the latest close plus 5 bps slippage
   (rounded up to whole cents, against the trader) and a 1 cent per share fee,
6. returns an ordered **evidence chain** (observation, classification, assertions, decision, order,
   fill, portfolio) so a reviewer can audit why.

`server.js` exposes:

- `runWorkflow(bars, portfolio, policy, params?)` -- one run; `params` is `{ lookback, volumeMultiple }`.
- `runFixtures()` -- one run per built-in fixture.
- `scheduledRuns(limit?)` -- the recorded scheduled runs, newest first.

## Scheduled runs (the deterministic-workflow pattern)

`[restore]({ type: "scheduledRun" })` returns a Scheduled Tasks callback. Each firing runs the
fixtures in code (zero tokens), then -- only if some run bought, sold or was blocked, and only if the
optional `REVIEW_MODEL` (`aiModel`) binding is set -- asks the model for a short reviewer note. The
model never makes a decision. Each occurrence is recorded once per `runId`, so scheduler retries do
not spend tokens twice. To schedule it, ask the agent in the gadget's workspace, which runs:

```ts
const callback = await ctx.restore({ type: "scheduledRun" });
await SCHEDULER.every(15 * 60_000, callback, { title: "Breakout workflow", description: "Run and review." });
```

then enable the new hook under Connections (schedules start disabled).

The client renders the fixtures' evidence chains and the latest scheduled runs. The decision logic in
`lib/` has no clock, randomness or I/O, and money is integer cents, so the same input always produces
the same output; the model review is the only non-deterministic step and is stored, not recomputed.
