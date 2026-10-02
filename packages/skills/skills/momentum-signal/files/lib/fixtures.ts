// Fixed price series (integer cents, oldest first) that exercise each branch of the rule. The
// gadget shows them, and the tests pin each one's result.

/** A named price series. */
export type Fixture = { name: string; closesCents: number[] };

/** The series the gadget and its tests evaluate. */
export const FIXTURES: Fixture[] = [
  { name: "uptrend", closesCents: [10000, 10050, 10020, 10110, 10180, 10240, 10330, 10420, 10510] },
  { name: "downtrend", closesCents: [10500, 10460, 10400, 10320, 10250, 10190, 10100, 10020, 9950] },
  { name: "sideways", closesCents: [10000, 10010, 9990, 10005, 9995, 10002, 9998, 10001, 10000] },
];
