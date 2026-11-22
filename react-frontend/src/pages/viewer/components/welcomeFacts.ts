// About a quarter of a minute per question: a rough guide ("about 2 minutes"), shown as an
// estimate, never as a promise.
export const estimateMinutes = (questionCount: number): number =>
  Math.max(1, Math.round((questionCount * 15) / 60));
