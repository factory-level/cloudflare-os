// Recording one scheduled occurrence exactly once. The deterministic results are stored, and the
// occurrence claimed, before the model is called: a retry after a crash or a failed write then finds
// the claim and stops, instead of paying for a second review of the same occurrence.
import { reviewPrompt, type NamedRun, type ReviewPrompt } from "./review.ts";

/** The firing a Scheduled Tasks callback receives (see gatekeeper-scheduler's `ScheduledFiring`). */
export type ScheduledFiring = { scheduleId: string; runId: string; scheduledTime: number; actualTime: number; timeZone: string };

/** What one scheduled occurrence recorded. */
export type ScheduledRunRecord = {
  scheduleId: string;
  runId: string;
  scheduledTime: number;
  runs: NamedRun[];
  /** The model's note on the runs that acted; `null` when none acted or no model is bound. */
  review: string | null;
  /** Why the review is missing although a model is bound and a run acted. */
  reviewError?: string;
};

/** The part of Durable Object storage an occurrence needs. */
export type OccurrenceStorage = {
  get(key: string): Promise<unknown>;
  put(entries: Record<string, unknown>): Promise<void>;
};

export const RUN_PREFIX = "run:";
export const SEEN_PREFIX = "seen:";
export const REVIEW_INTERRUPTED = "The review was started but never recorded; it is not retried.";

/**
 * Records `firing` once per `runId`. `review`, when given, is called at most once per occurrence,
 * and only after the occurrence is durably claimed.
 */
export async function recordOccurrence(
    storage: OccurrenceStorage, firing: ScheduledFiring, runs: NamedRun[],
    review: ((prompt: ReviewPrompt) => Promise<string>) | undefined): Promise<void> {
  if (await storage.get(SEEN_PREFIX + firing.runId)) return;

  const key = `${RUN_PREFIX}${String(firing.scheduledTime).padStart(16, "0")}:${firing.runId}`;
  const record: ScheduledRunRecord = {
    scheduleId: firing.scheduleId, runId: firing.runId, scheduledTime: firing.scheduledTime, runs, review: null,
  };
  const prompt = review ? reviewPrompt(runs) : null;
  // Until the review's outcome is written, the stored record says it was interrupted.
  await storage.put({
    [key]: prompt ? { ...record, reviewError: REVIEW_INTERRUPTED } : record,
    [SEEN_PREFIX + firing.runId]: key,
  });
  if (!prompt || !review) return;

  try {
    record.review = await review(prompt);
  } catch (err) {
    // The deterministic results stand on their own; keep them rather than retrying the occurrence.
    record.reviewError = err instanceof Error ? err.message : String(err);
  }
  await storage.put({ [key]: record });
}
