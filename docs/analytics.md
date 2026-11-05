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

## Per-question analytics

Each question type has its own summary (full field reference: [API.md](API.md#analytics-owner-)):

- **Choice questions** - option counts; an “Other” option also returns the most frequent free-text answers.
- **`RATING` / `SCALE`** - average, min, max and a distribution that covers every value of the scale (zeros included).
- **`NPS`** - the distribution plus promoters (9-10), passives (7-8), detractors (0-6) and the NPS score (`% promoters - % detractors`).
- **`RANKING`** - average position per option and how many respondents put it at each place.
- **`MATRIX`** - a row x column table with the number of respondents per cell.
- **Text, number, boolean, date** - the usual aggregates and value lists.

Answers that no longer fit the current configuration (for example the scale was shortened after collecting) are excluded from the averages but still counted in `totalAnswers`. Analytics, exports and the response view always use the form's main language; see [content-languages.md](content-languages.md).

## Performance notes

- **Analytics reads responses in batches, not all at once.** Overview, paths, funnel and per-question analytics walk a form's responses with keyset pagination (2,000 rows per query, ordered by `createdAt, id` and served by the `(formId, createdAt, id)` index) and aggregate incrementally, so memory is bounded by the batch size. Time is still linear in the number of responses, because every request re-scans them; for very large forms the next step is caching with a short TTL or pre-aggregated counters. Free-text questions are capped (top 5 / top 100 values and the first 1,000 raw answers, flagged by `answersTruncated`), and at most 10,000 distinct text values per question are tracked.
