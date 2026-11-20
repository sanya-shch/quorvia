# Response Attempts and Funnel Analytics

A regular `Response` only represents a completed submission.

That is insufficient for meaningful funnel analytics because users can abandon a form before submitting it.

Quorvia therefore separates:

```
ResponseAttempt
    ↓
Autosaved progress

Response
    ↓
Completed submission
```

`ResponseAttempt` stores the questions the respondent actually **reached** during the session.

This allows analytics to answer:

> How many respondents actually reached this question?

instead of only:

> How many completed responses contain an answer for this question?

**Funnel calculation**

```
ResponseAttempt
      │
      ├── reachedQuestionIds
      └── completedAt
              │
              ▼
        Funnel calculation
              │
              ├── total attempts
              ├── completions
              ├── completion rate
              └── reached count per question
```

An attempt is considered to have reached a question if that question appears in its `reachedQuestionIds`.

`reached` is deliberately **not** the same as `visible`:

- **visible** (`visibleQuestionIds`) - the question is logically eligible to be shown right now, given the current answers. Every question without a condition is visible from the very first autosave, even if the respondent is still on step one.
- **reached** (`reachedQuestionIds`) - the respondent really saw the question at least once. It is a grow-only set: if a respondent answers Q1 = Yes, sees Q2, then goes back and changes Q1 to No, Q2 is hidden again but stays reached.

In step-by-step mode the client sends the exact list of questions it displayed; in all-at-once mode every currently visible question is on screen, so the server uses the visible set. Unknown ids are discarded. The set is merged with the stored value atomically in one SQL statement (`INSERT ... ON CONFLICT DO UPDATE` with a `jsonb` union), so out-of-order or parallel autosave requests cannot shrink it. Submitting the form also adds every question of the final response to the attempt. The list comes from the client, so a tampered request can only skew the funnel of the respondent's own form, like a forged submission would.

Attempts created before `reachedQuestionIds` existed fall back to `visibleQuestionIds` until they are saved again.

## Analytics Model

The analytics system distinguishes between:

**Reached**
The respondent actually encountered the question.

**Answered**
The respondent provided an answer.

**Skipped**
The question was visible but no answer was provided.

**Hidden**
The question was not shown because its condition evaluated to false.

This makes analytics meaningful for branching forms instead of treating every question as if it were displayed to every respondent.

## Period

All analytics reads accept `?from=&to=` (see [API.md](API.md#analytics-owner-)). The overview page defaults to the last 30 days (the 30 days ending today, today included); "All time" removes the filter. A period is a cohort of **attempts started** in it (and of responses created in it), so an attempt started on the last day and finished the next day counts as completed, not as abandoned.

## Summary (KPI cards and trend)

`GET /analytics/summary` returns, for the period and for the period of equal length right before it:

- `responses` (submitted rows), `started` (attempts), `completed`, `abandoned` (`started - completed`), `completionRate` (`completed / started`) and `medianCompletionSeconds`;
- `daily`: attempts started and submitted per UTC day, for a closed period of at most 366 days.

"Abandoned" follows the rule of the funnel: it only means "not submitted yet" and is not told apart from "still filling in" by any time threshold. The page compares counts in percent and the completion rate in percentage points; with no earlier data it says so instead of showing an infinite change, and for "All time" there is no comparison.

## Funnel

Besides `reachedCount` every question has `exitedCount`: unfinished attempts whose **last reached question** is this one. It differs from "reached the previous question minus reached this one" in branching forms, where a skipped question is not an exit. The funnel also returns `medianCompletionSeconds` (`completedAt - startedAt` of submitted attempts). It includes time a tab sat idle, so read it as "time to finish", not "time on task".

## Journey map

`GET /analytics/journeys` builds a Sankey-style diagram from **attempts**, so unlike the older paths view (submitted responses only) it shows where people leave. An attempt's path is the questions it reached in form order; the n-th one is step n. Respondents who saw different questions at the same step end up in one column as different nodes, which is how a branch appears. Nodes: `start`, `question` (per step), `more` (everything after the last shown step), `exit` (one per node people leave after) and `submitted`.

- `status` narrows it to completed or abandoned attempts; `steps` (1-20, default 6) is how many questions of the path are drawn before "later steps".
- Conservation holds: what enters a node (except the start) equals its count, and what leaves a node that is not a final one equals its count. The tests check it, because the inspector derives "exited" and "continued" from the links.
- The page can hide nodes carrying less than 3% of the attempts, switch between counts and percentages, zoom, and show the same data as a step list (the default on a phone, and a text alternative to the diagram). Selecting a node shows where its attempts came from and went, and opens the question's analytics. The older "question flow" view stays available.

## Per-question analytics

Each question type has its own summary (full field reference: [API.md](API.md#analytics-owner-)):

- **Choice questions** - option counts; an “Other” option also returns the most frequent free-text answers.
- **`RATING` / `SCALE`** - average, min, max and a distribution that covers every value of the scale (zeros included).
- **`NPS`** - the distribution plus promoters (9-10), passives (7-8), detractors (0-6) and the NPS score (`% promoters - % detractors`).
- **`RANKING`** - average position per option and how many respondents put it at each place.
- **`MATRIX`** - a row x column table with the number of respondents per cell.
- **`CALCULATION`** - for a number result: average (two decimals), min and max over the values that were computed (a response whose value could not be computed is left out); for a text or yes/no result only a note. There is no per-answer detail view (the card is not clickable and the detail endpoint answers `ANALYTICS_UNSUPPORTED_TYPE`). The response view shows the value as the respondent read it: prefix, exactly `decimals` places, suffix, in the response's language (yes/no as “Так” / “Ні” in Ukrainian, “Yes” / “No” otherwise).
- **Text, number, boolean, date** - the usual aggregates and value lists.

Answers that no longer fit the current configuration (for example the scale was shortened after collecting) are excluded from the averages but still counted in `totalAnswers`. Analytics, exports and the response view always use the form's main language; see [content-languages.md](content-languages.md).

## Result rule outcome

A completed `Response` stores `endRuleId`: the id of the end rule that decided the respondent's end screen (see [conditional logic](conditional-logic.md#conditional-end-screens-result-rules)), or `null` when none matched. It is recorded so outcomes can be told apart; no analytics view uses it yet.

Likewise `quotaIds` records the quotas the response was counted in (see [conditional logic](conditional-logic.md#quotas)); drafts (`ResponseAttempt`) never count in a quota.

## Scores

For a form that scores (see [conditional logic](conditional-logic.md#scoring)) `GET /forms/:formId/analytics` returns `scoring`, built from what was **stored** with each response, so a later change of the points does not rewrite history:

- `scoredCount`, `average`, `min`, `max` of the raw totals (2 decimals), and `averagePercent`, the average of score / maximum in percent (`null` when no response has a positive maximum);
- `histogram`: 10 buckets of **percent of the maximum** (0-10 ... 90-100, 100 in the last one, values outside are clamped). Percent rather than raw totals, because the maximum differs between respondents (a branch they did not see is not in it);
- `categories`: the categories as they are now (current labels), each with the responses counted in it, and `uncategorizedCount` for scored responses in no category now (the total fell in none, or the category was deleted);
- `enabled`: whether scoring is on now. It may have been switched off after responses were scored; their scores are still shown.

It is accumulated one response at a time, like the other statistics. The Vue overview shows it as a "Scores" section (the numbers, the histogram and the categories), the list of responses and the details of a response show the score and the category.

## Performance notes

- **The summary and the journey map read attempts in batches too** (keyset pagination, bounded memory), the summary twice for a closed period (the period and the previous one). Journey nodes are bounded by `steps x questions`.
- **Analytics reads responses in batches, not all at once.** Overview, paths, funnel and per-question analytics walk a form's responses with keyset pagination (2,000 rows per query, ordered by `createdAt, id` and served by the `(formId, createdAt, id)` index) and aggregate incrementally, so memory is bounded by the batch size. Time is still linear in the number of responses, because every request re-scans them; for very large forms the next step is caching with a short TTL or pre-aggregated counters. Free-text questions are capped (top 5 / top 100 values and the first 1,000 raw answers, flagged by `answersTruncated`), and at most 10,000 distinct text values per question are tracked.
