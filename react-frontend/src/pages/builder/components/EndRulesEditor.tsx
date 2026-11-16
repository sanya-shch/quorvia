import { useId } from "react";
import { useTranslation } from "react-i18next";
import { END_RULE_LIMITS, SCREEN_LIMITS, isHttpUrl, type FormEndRule } from "@quorvia/shared-types";
import type { Question } from "../../../types/formBuilder";
import ConditionEditor from "./editors/ConditionEditor";
import {
  canAddEndRule,
  endRuleTargets,
  createEndRule,
  findBrokenEndRules,
  hasEmptyConditionValue,
  moveEndRule,
} from "../endRules";

interface EndRulesEditorProps {
  rules: FormEndRule[] | null | undefined;
  questions: Question[];
  // Scoring is on: a rule may look at the score, which then shows up among the questions to choose.
  scoringEnabled?: boolean;
  onChange: (rules: FormEndRule[] | null) => void;
}

const inputClass =
  "w-full rounded-xl border px-3 py-2 text-sm text-slate-800 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

const labelClass = "block text-xs font-semibold text-slate-600";

const iconButtonClass =
  "h-7 w-7 rounded-lg border border-slate-200 bg-white text-xs text-slate-500 transition-colors hover:border-slate-300 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer";

// Conditional end screens: "if the answers look like this, end with this message (and redirect)".
// Rules are checked from top to bottom on the server and the first match wins, which is why the order
// is editable. A rule that is not finished is not saved (the card says so), a rule that looks at a
// deleted question blocks saving (the server would refuse it).
export default function EndRulesEditor({
  rules,
  questions,
  scoringEnabled = false,
  onChange,
}: EndRulesEditorProps) {
  const { t } = useTranslation();
  const id = useId();

  const list = rules ?? [];
  // The score is not a question but is chosen like one: two stand-ins that sort before the real ones.
  const choices: Question[] = scoringEnabled
    ? [
        ...(["$score", "$percent"] as const).map((key, i) => ({
          id: key,
          text: t(
            key === "$score" ? "builder.scoring.scoreTarget" : "builder.scoring.percentTarget",
          ),
          type: "NUMBER" as const,
          required: false,
          order: -2 + i,
          options: [],
          config: null,
        })),
        ...questions,
      ]
    : questions;

  const broken = new Set(findBrokenEndRules(list, questions, scoringEnabled));
  const hasTargets = endRuleTargets(choices).length > 0;

  const emit = (next: FormEndRule[]) => onChange(next.length > 0 ? next : null);

  const patchRule = (index: number, patch: Partial<FormEndRule>) =>
    emit(list.map((rule, i) => (i === index ? { ...rule, ...patch } : rule)));

  const addRule = () => {
    const rule = createEndRule(choices);

    if (rule) emit([...list, rule]);
  };

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-semibold text-slate-700">{t("builder.screens.rules.title")}</p>
        <p className="mt-0.5 text-xs text-slate-500">{t("builder.screens.rules.hint")}</p>
      </div>

      {list.map((rule, index) => {
        const redirectUrl = rule.screen.redirectUrl ?? "";
        const redirectInvalid = redirectUrl.trim() !== "" && !isHttpUrl(redirectUrl.trim());
        const textMissing = rule.screen.text.trim() === "";
        const isBroken = broken.has(index);

        return (
          <div
            key={rule.id}
            className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4"
            role="group"
            aria-label={t("builder.screens.rules.ruleTitle", { number: index + 1 })}
          >
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
                {t("builder.screens.rules.ruleTitle", { number: index + 1 })}
              </span>

              <div className="ml-auto flex items-center gap-1">
                <button
                  type="button"
                  className={iconButtonClass}
                  disabled={index === 0}
                  onClick={() => emit(moveEndRule(list, index, index - 1))}
                  title={t("builder.screens.rules.moveUp")}
                  aria-label={t("builder.screens.rules.moveUp")}
                >
                  <span aria-hidden="true">↑</span>
                </button>
                <button
                  type="button"
                  className={iconButtonClass}
                  disabled={index === list.length - 1}
                  onClick={() => emit(moveEndRule(list, index, index + 1))}
                  title={t("builder.screens.rules.moveDown")}
                  aria-label={t("builder.screens.rules.moveDown")}
                >
                  <span aria-hidden="true">↓</span>
                </button>
                <button
                  type="button"
                  className={`${iconButtonClass} hover:border-rose-300 hover:text-rose-600`}
                  onClick={() => emit(list.filter((_, i) => i !== index))}
                  title={t("builder.screens.rules.remove")}
                  aria-label={t("builder.screens.rules.remove")}
                >
                  <span aria-hidden="true">✕</span>
                </button>
              </div>
            </div>

            <ConditionEditor
              mandatory
              allowCalculations
              condition={rule.condition}
              currentOrder={Infinity}
              allQuestions={choices}
              emptyHint={t("builder.screens.rules.noTargets")}
              onChange={(condition) => {
                if (condition) patchRule(index, { condition });
              }}
            />

            {isBroken && (
              <p role="alert" className="text-xs font-medium text-rose-600">
                {t("builder.screens.rules.broken")}
              </p>
            )}
            {!isBroken && hasEmptyConditionValue(rule) && (
              <p role="alert" className="text-xs font-medium text-amber-700">
                {t("builder.screens.rules.valueRequired")}
              </p>
            )}

            <div>
              <label htmlFor={`${id}-${rule.id}-text`} className={labelClass}>
                {t("builder.screens.rules.text")}
              </label>
              <textarea
                id={`${id}-${rule.id}-text`}
                rows={3}
                value={rule.screen.text}
                maxLength={SCREEN_LIMITS.text}
                aria-invalid={textMissing}
                onChange={(e) =>
                  patchRule(index, { screen: { ...rule.screen, text: e.target.value } })
                }
                className={`${inputClass} mt-1 border-slate-200`}
              />
              {textMissing && (
                <p role="alert" className="mt-1 text-xs font-medium text-amber-700">
                  {t("builder.screens.rules.textRequired")}
                </p>
              )}
            </div>

            <div>
              <label htmlFor={`${id}-${rule.id}-redirect`} className={labelClass}>
                {t("builder.screens.end.redirect")}
              </label>
              <input
                id={`${id}-${rule.id}-redirect`}
                type="url"
                inputMode="url"
                spellCheck={false}
                value={redirectUrl}
                maxLength={SCREEN_LIMITS.redirectUrl}
                placeholder="https://example.com/thanks"
                aria-invalid={redirectInvalid}
                onChange={(e) =>
                  patchRule(index, { screen: { ...rule.screen, redirectUrl: e.target.value } })
                }
                className={`${inputClass} mt-1 ${redirectInvalid ? "border-rose-500" : "border-slate-200"}`}
              />
              {redirectInvalid && (
                <p role="alert" className="mt-1 text-xs font-medium text-rose-600">
                  {t("builder.screens.end.redirectInvalid")}
                </p>
              )}
            </div>
          </div>
        );
      })}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={addRule}
          disabled={!canAddEndRule(list, choices)}
          className="rounded-lg border border-indigo-200 bg-white px-3 py-1.5 text-xs font-semibold text-indigo-600 transition-colors hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
        >
          {t("builder.screens.rules.add")}
        </button>

        {!hasTargets && (
          <p className="text-xs text-slate-500">{t("builder.screens.rules.noQuestions")}</p>
        )}
        {hasTargets && list.length >= END_RULE_LIMITS.rules && (
          <p className="text-xs text-slate-500">
            {t("builder.screens.rules.limit", { count: END_RULE_LIMITS.rules })}
          </p>
        )}
      </div>
    </div>
  );
}
