# Momentum Signal

A deterministic moving-average momentum rule. `server.js` exposes:

- `evaluate(closesCents, params?)` -- the verdict for one price series (integer cents, oldest first).
- `runFixtures()` -- the verdict for each built-in fixture.

The client renders the fixtures' verdicts as a table. There is no clock, randomness or I/O, so the
same input always produces the same output.
