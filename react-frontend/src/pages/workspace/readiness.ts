import type { FormState } from "../../types/formBuilder";
import { validateFormState } from "../builder/validation";
import { countMissingTranslations, getAdditionalLanguages } from "../builder/translations";

/**
 * "Form health": whether the form is ready to be published. It adds no rules of its own: every
 * blocking check is the builder's own validation (validateFormState), so the overview and the
 * builder can never disagree about what is wrong with a form.
 */
export type ReadinessLevel = "ok" | "warning" | "error";

export interface ReadinessCheck {
  id: string;
  level: ReadinessLevel;
  // i18n key under workspace.readiness.checks.* and its parameters.
  labelKey: string;
  params?: Record<string, unknown>;
}

export interface Readiness {
  checks: ReadinessCheck[];
  // Blocking problems: a form with any of these must not be published.
  errorCount: number;
  warningCount: number;
  canPublish: boolean;
}

const hasKey = (errors: Record<string, string>, test: (key: string) => boolean) =>
  Object.keys(errors).some(test);

export const computeReadiness = (form: FormState): Readiness => {
  const errors = validateFormState(form);
  const checks: ReadinessCheck[] = [];
  const add = (
    id: string,
    failed: boolean,
    okKey: string,
    failKey: string,
    level: ReadinessLevel = "error",
    params?: Record<string, unknown>,
  ) =>
    checks.push({ id, level: failed ? level : "ok", labelKey: failed ? failKey : okKey, params });

  const base = "workspace.readiness.checks";

  add("questions", form.questions.length === 0, `${base}.questionsOk`, `${base}.questionsMissing`);
  add("title", Boolean(errors.title), `${base}.titleOk`, `${base}.titleMissing`);
  add(
    "questionTitles",
    hasKey(errors, (k) => /^q-\d+$/.test(k)),
    `${base}.questionTitlesOk`,
    `${base}.questionTitlesMissing`,
  );
  add(
    "conditions",
    hasKey(errors, (k) => k.includes("condition")),
    `${base}.conditionsOk`,
    `${base}.conditionsInvalid`,
  );
  add(
    "formulas",
    hasKey(errors, (k) => k.includes("formula") || k.includes("calculation")),
    `${base}.formulasOk`,
    `${base}.formulasInvalid`,
  );
  add(
    "otherRules",
    hasKey(
      errors,
      (k) => k.startsWith("endRule") || k.startsWith("scor") || k.startsWith("quota"),
    ) ||
      // Any other validation error the builder reports and the checks above did not name.
      Object.keys(errors).some(
        (k) =>
          k !== "title" &&
          !/^q-\d+$/.test(k) &&
          !k.includes("condition") &&
          !k.includes("formula") &&
          !k.includes("calculation") &&
          !k.startsWith("endRule") &&
          !k.startsWith("scor") &&
          !k.startsWith("quota"),
      ),
    `${base}.rulesOk`,
    `${base}.rulesInvalid`,
  );

  const missing = getAdditionalLanguages(form).reduce(
    (sum, language) => sum + countMissingTranslations(form, language),
    0,
  );
  if (getAdditionalLanguages(form).length > 0) {
    add(
      "translations",
      missing > 0,
      `${base}.translationsOk`,
      `${base}.translationsMissing`,
      "warning",
      {
        count: missing,
      },
    );
  }

  const errorCount = checks.filter((c) => c.level === "error").length;

  return {
    checks,
    errorCount,
    warningCount: checks.filter((c) => c.level === "warning").length,
    canPublish: errorCount === 0,
  };
};
