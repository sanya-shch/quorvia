import type {
  FormJourneysDto,
  JourneyLink,
  JourneyNode,
  JourneyStatus,
} from "@quorvia/shared-types";

/**
 * The journey map: how respondents move through the form, built from attempts (finished or not),
 * so it shows where people leave, which the older "paths" view (submitted responses only) cannot.
 *
 * An attempt's path is the questions it reached in form order (both completion modes walk the
 * form top to bottom, and a branch only skips questions), so the n-th reached question is the
 * n-th step of that respondent. Respondents who saw different questions at the same step end up
 * in the same column as different nodes: that is how a branch shows up.
 *
 * Kept pure (no Prisma), like buildFormPaths, so it is tested without mocking the database.
 */
export type JourneyAttempt = {
  reachedQuestionIds?: unknown;
  visibleQuestionIds: unknown;
  completedAt: Date | null;
};

type OrderedQuestion = { id: string; text: string; order: number };

const START = "start";
const MORE = "more";
const SUBMITTED = "submitted";

export const createJourneyAccumulator = (
  orderedQuestions: OrderedQuestion[],
  options: { status: JourneyStatus; steps: number },
) => {
  const { status, steps } = options;
  const byId = new Map(orderedQuestions.map((q) => [q.id, q]));
  const nodes = new Map<string, JourneyNode>();
  const links = new Map<string, JourneyLink>();
  let totalAttempts = 0;

  const bump = (node: Omit<JourneyNode, "count">): JourneyNode => {
    const existing = nodes.get(node.id);
    if (existing) {
      existing.count++;
      return existing;
    }

    const created = { ...node, count: 1 };
    nodes.set(node.id, created);
    return created;
  };

  const link = (source: string, target: string) => {
    const key = `${source}>${target}`;
    const existing = links.get(key);
    if (existing) existing.count++;
    else links.set(key, { source, target, count: 1 });
  };

  return {
    add(attempt: JourneyAttempt) {
      const completed = attempt.completedAt !== null;
      if (status === "completed" && !completed) return;
      if (status === "abandoned" && completed) return;

      totalAttempts++;

      // Rows from before reachedQuestionIds existed fall back to visibleQuestionIds (as the
      // funnel does); it is less precise but better than dropping their journeys.
      const source = attempt.reachedQuestionIds ?? attempt.visibleQuestionIds;
      const reached = new Set(Array.isArray(source) ? (source as string[]) : []);
      const path = orderedQuestions.filter((q) => reached.has(q.id));

      let previous = bump({
        id: START,
        kind: "start",
        column: 0,
        questionId: null,
        text: null,
        order: null,
      });

      path.slice(0, steps).forEach((question, index) => {
        const node = bump({
          id: `q${index + 1}:${question.id}`,
          kind: "question",
          column: index + 1,
          questionId: question.id,
          text: question.text,
          order: question.order,
        });
        link(previous.id, node.id);
        previous = node;
      });

      if (path.length > steps) {
        const more = bump({
          id: MORE,
          kind: "more",
          column: steps + 1,
          questionId: null,
          text: null,
          order: null,
        });
        link(previous.id, more.id);
        previous = more;
      }

      if (completed) {
        // The column is fixed in result(), when the longest path is known.
        const done = bump({
          id: SUBMITTED,
          kind: "submitted",
          column: -1,
          questionId: null,
          text: null,
          order: null,
        });
        link(previous.id, done.id);
      } else {
        const exit = bump({
          id: `exit:${previous.id}`,
          kind: "exit",
          column: previous.column + 1,
          questionId: previous.questionId,
          text: previous.text,
          order: previous.order,
        });
        link(previous.id, exit.id);
      }
    },

    result(): FormJourneysDto {
      const all = [...nodes.values()];
      const lastStepColumn = Math.max(
        0,
        ...all.filter((n) => n.kind !== "submitted").map((n) => n.column),
      );
      // An exit sits one column after the node it leaves, so it can be the last column itself.
      const outcomeColumn = lastStepColumn + (all.some((n) => n.kind === "submitted") ? 1 : 0);

      for (const node of all) {
        if (node.kind === "submitted") node.column = outcomeColumn;
      }

      all.sort(
        (a, b) =>
          a.column - b.column ||
          (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER) ||
          a.id.localeCompare(b.id),
      );

      return {
        status,
        steps,
        totalAttempts,
        columns: outcomeColumn + 1,
        nodes: all,
        links: [...links.values()],
      };
    },
  };
};

export const buildFormJourneys = (
  orderedQuestions: OrderedQuestion[],
  attempts: JourneyAttempt[],
  options: { status: JourneyStatus; steps: number },
): FormJourneysDto => {
  const acc = createJourneyAccumulator(orderedQuestions, options);
  for (const attempt of attempts) acc.add(attempt);
  return acc.result();
};
