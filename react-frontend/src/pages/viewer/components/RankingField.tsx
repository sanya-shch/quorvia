import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { QuestionOption } from "../../../types/formBuilder";
import type { AnswerValue } from "../../../types/formViewer";

interface RankingFieldProps {
  options: QuestionOption[];
  value: AnswerValue | undefined;
  onChange: (value: AnswerValue) => void;
  required: boolean;
  labelledBy?: string;
  describedBy?: string;
}

type Direction = "up" | "down";

/**
 * Ранжування кнопками "вище/нижче" (а не лише перетягуванням): це працює з
 * клавіатури, на дотик і зі скрінрідерами, а бібліотека drag-and-drop не
 * потрапляє в бандл публічної форми.
 *
 * Відповідь з'являється лише після взаємодії (перша зміна порядку або
 * "Підтвердити цей порядок"): початковий порядок на екрані - не відповідь
 * респондента, інакше необов'язкове питання завжди мало б відповідь, а
 * обов'язкове - не вимагало б жодної дії.
 */
export default function RankingField({
  options,
  value,
  onChange,
  required,
  labelledBy,
  describedBy,
}: RankingFieldProps) {
  const { t } = useTranslation();
  const [announcement, setAnnouncement] = useState("");
  const buttonRefs = useRef(new Map<string, HTMLButtonElement>());
  const pendingFocus = useRef<{ id: string; direction: Direction } | null>(null);

  const defaultOrder = options.map((option) => option.id);
  const textById = new Map(options.map((option) => [option.id, option.text]));

  // Відповідь вважаємо наявною, лише якщо це повна перестановка поточних
  // варіантів (старий стан після зміни варіантів не показуємо як відповідь).
  const answered =
    Array.isArray(value) &&
    value.length === defaultOrder.length &&
    new Set(value).size === value.length &&
    value.every((id) => textById.has(id));
  const order = answered ? (value as string[]) : defaultOrder;
  const orderKey = order.join("|");

  // Після переміщення елемент у DOM міняє місце - повертаємо фокус на ту саму
  // кнопку (або на сусідню, якщо ця стала недоступною на краю списку).
  useEffect(() => {
    const pending = pendingFocus.current;
    if (!pending) return;
    pendingFocus.current = null;

    const index = order.indexOf(pending.id);
    let direction = pending.direction;
    if (direction === "down" && index === order.length - 1) direction = "up";
    if (direction === "up" && index === 0) direction = "down";

    buttonRefs.current.get(`${pending.id}:${direction}`)?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderKey]);

  const move = (index: number, direction: Direction) => {
    const target = direction === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= order.length) return;

    const next = [...order];
    [next[index], next[target]] = [next[target], next[index]];

    pendingFocus.current = { id: order[index], direction };
    setAnnouncement(
      t("viewer.ranking.moved", {
        option: textById.get(order[index]),
        position: target + 1,
        total: order.length,
      }),
    );
    onChange(next);
  };

  const buttonClass =
    "flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 cursor-pointer";

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-400">{t("viewer.ranking.hint")}</p>

      <ol aria-labelledby={labelledBy} aria-describedby={describedBy} className="space-y-2">
        {order.map((id, index) => (
          <li
            key={id}
            className="flex items-center gap-3 rounded-xl border border-slate-200/60 bg-slate-50 p-2 pl-3"
          >
            <span
              aria-hidden="true"
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                answered
                  ? "bg-indigo-600 text-white"
                  : "border border-dashed border-slate-300 text-slate-400"
              }`}
            >
              {index + 1}
            </span>
            <span className="min-w-0 flex-1 break-words text-sm font-medium text-slate-700">
              {textById.get(id)}
            </span>
            <button
              type="button"
              ref={(el) => {
                if (el) buttonRefs.current.set(`${id}:up`, el);
                else buttonRefs.current.delete(`${id}:up`);
              }}
              disabled={index === 0}
              onClick={() => move(index, "up")}
              aria-label={t("viewer.ranking.moveUp", { option: textById.get(id) })}
              className={buttonClass}
            >
              <span aria-hidden="true">↑</span>
            </button>
            <button
              type="button"
              ref={(el) => {
                if (el) buttonRefs.current.set(`${id}:down`, el);
                else buttonRefs.current.delete(`${id}:down`);
              }}
              disabled={index === order.length - 1}
              onClick={() => move(index, "down")}
              aria-label={t("viewer.ranking.moveDown", { option: textById.get(id) })}
              className={buttonClass}
            >
              <span aria-hidden="true">↓</span>
            </button>
          </li>
        ))}
      </ol>

      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>

      {!answered && (
        <button
          type="button"
          onClick={() => onChange(defaultOrder)}
          className="text-xs font-semibold text-indigo-600 underline hover:text-indigo-500 cursor-pointer"
        >
          {t("viewer.ranking.confirm")}
        </button>
      )}

      {answered && !required && (
        <button
          type="button"
          onClick={() => {
            setAnnouncement("");
            onChange("");
          }}
          className="text-xs font-medium text-slate-400 underline hover:text-slate-600 cursor-pointer"
        >
          {t("viewer.ranking.clear")}
        </button>
      )}
    </div>
  );
}
