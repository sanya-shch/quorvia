import { isScaleQuestionType } from "@quorvia/shared-types";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuestionAnalyticsQuery } from "../hooks/useAnalytics";
import AnalyticsHeader from "./AnalyticsHeader";

export default function QuestionDetailsPage() {
  const { formId, questionId } = useParams<{ formId: string; questionId: string }>();
  const navigate = useNavigate();

  const { t } = useTranslation();
  const { data, isLoading, error } = useQuestionAnalyticsQuery(formId!, questionId!);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="h-7 w-7 animate-spin rounded-full border-4 border-slate-200 border-t-indigo-600" />
      </div>
    );
  }

  if (error || !data || !formId) {
    return (
      <div className="min-h-screen bg-slate-50 p-8 flex items-center justify-center">
        <div className="text-center bg-white p-6 border rounded-2xl max-w-sm">
          <p className="text-sm font-semibold text-rose-500">{t("analytics.detail.loadError")}</p>
          <button
            onClick={() => navigate(`/forms/${formId}/analytics`)}
            className="mt-4 text-xs font-bold text-indigo-600 underline"
          >
            {t("analytics.detail.goBack")}
          </button>
        </div>
      </div>
    );
  }

  const {
    question,
    totalAnswers,
    stats,
    distribution,
    answers,
    nps,
    otherAnswers,
    ranking,
    rankedCount,
    matrix,
  } = data;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <AnalyticsHeader
        formId={formId}
        currentBreadcrumb={
          question.text || t("analytics.detail.questionIdFallback", { id: question.id.slice(-6) })
        }
      />

      <main className="flex-1 max-w-3xl w-full mx-auto py-8 px-4 sm:px-6">
        <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-sm space-y-6">
          <div className="border-b pb-4 border-slate-200 flex justify-between items-start gap-4">
            <div>
              <span className="inline-flex items-center text-[10px] font-black px-2 py-0.5 rounded-md bg-slate-100 text-slate-500 uppercase tracking-wider mb-2">
                {t("analytics.detail.typeLabel", { type: question.type })}
              </span>
              <h1 className="text-xl font-bold text-slate-900">{question.text}</h1>

              <p className="text-sm text-slate-500 mt-2">
                {question.description || t("analytics.detail.noDescription")}
              </p>
            </div>

            <div className="text-right shrink-0">
              <span className="text-[10px] font-bold text-slate-500 uppercase block">
                {t("analytics.detail.responsesLabel")}
              </span>
              <span className="text-xl font-black text-slate-800">{totalAnswers}</span>
            </div>
          </div>

          {(question.type === "TEXT" || question.type === "DATE") && answers && (
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                {t("analytics.detail.allAnswers")}
              </h3>
              <div className="flex flex-col gap-2 max-h-[500px] overflow-y-auto pr-1">
                {answers.map((ans, idx) => (
                  <div
                    key={idx}
                    className="bg-slate-50/60 border border-slate-200/60 rounded-xl p-4 flex flex-col gap-2"
                  >
                    {ans}
                  </div>
                ))}
              </div>
            </div>
          )}

          {(question.type === "NUMBER" || isScaleQuestionType(question.type)) && (
            <div className="space-y-6">
              <div className="grid grid-cols-3 gap-4 bg-slate-50 p-4 rounded-xl border">
                <div className="text-center">
                  <span className="text-xs font-bold text-slate-500 uppercase">
                    {t("analytics.detail.avgValue")}
                  </span>
                  <p className="text-2xl font-black text-indigo-600 mt-1">
                    {stats?.avg.toFixed(2)}
                  </p>
                </div>
                <div className="text-center border-x">
                  <span className="text-xs font-bold text-slate-500 uppercase">
                    {t("analytics.detail.min")}
                  </span>
                  <p className="text-2xl font-black text-slate-700 mt-1">{stats?.min}</p>
                </div>
                <div className="text-center">
                  <span className="text-xs font-bold text-slate-500 uppercase">
                    {t("analytics.detail.max")}
                  </span>
                  <p className="text-2xl font-black text-slate-700 mt-1">{stats?.max}</p>
                </div>
              </div>

              {distribution && (
                <div className="space-y-3">
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    {t("analytics.detail.distribution")}
                  </h3>
                  <div className="space-y-2">
                    {distribution.map((dist, idx) => {
                      const percentage = totalAnswers > 0 ? (dist.count / totalAnswers) * 100 : 0;
                      return (
                        <div key={idx} className="flex items-center gap-4 text-xs font-semibold">
                          <span className="w-12 text-slate-500 font-mono text-right">
                            {t("analytics.detail.numberLabel", { value: dist.value })}
                          </span>
                          <div className="flex-1 h-3 bg-slate-100 rounded-md overflow-hidden">
                            <div
                              className="h-full bg-indigo-500 rounded-md"
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                          <span className="w-16 text-slate-500 text-right font-bold">
                            {dist.count}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {question.type === "NPS" && nps && (
                <div className="space-y-3">
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    {t("analytics.detail.nps.title")}
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 bg-slate-50 p-4 rounded-xl border">
                    <div className="text-center">
                      <span className="text-xs font-bold text-slate-500 uppercase">
                        {t("analytics.detail.nps.score")}
                      </span>
                      <p className="text-2xl font-black text-indigo-600 mt-1">
                        {nps.score === null ? t("analytics.detail.nps.noData") : nps.score}
                      </p>
                    </div>
                    <div className="text-center">
                      <span className="text-xs font-bold text-slate-500 uppercase">
                        {t("analytics.detail.nps.promoters")}
                      </span>
                      <p className="text-2xl font-black text-emerald-600 mt-1">{nps.promoters}</p>
                    </div>
                    <div className="text-center">
                      <span className="text-xs font-bold text-slate-500 uppercase">
                        {t("analytics.detail.nps.passives")}
                      </span>
                      <p className="text-2xl font-black text-slate-700 mt-1">{nps.passives}</p>
                    </div>
                    <div className="text-center">
                      <span className="text-xs font-bold text-slate-500 uppercase">
                        {t("analytics.detail.nps.detractors")}
                      </span>
                      <p className="text-2xl font-black text-rose-600 mt-1">{nps.detractors}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {(question.type === "CHOICE_SINGLE" || question.type === "CHOICE_MULTI") &&
            distribution && (
              <div className="space-y-4">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  {t("analytics.detail.optionsRanking")}
                </h3>

                <div className="flex flex-col gap-3">
                  {distribution.map((dist, idx) => {
                    const percentage = totalAnswers > 0 ? (dist.count / totalAnswers) * 100 : 0;

                    return (
                      <div
                        key={idx}
                        className="bg-slate-50/60 border border-slate-200/60 rounded-xl p-4 flex flex-col gap-2"
                      >
                        <div className="flex justify-between items-center text-sm font-bold text-slate-700">
                          <span className="truncate">
                            {dist.text}{" "}
                            {t("analytics.detail.optionIdSuffix", { id: dist.optionId })}
                          </span>
                          <span className="text-indigo-600 bg-white border px-2.5 py-0.5 rounded-lg text-xs shadow-sm">
                            {dist.count}
                          </span>
                        </div>
                        <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-indigo-500 rounded-full transition-all duration-500"
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {otherAnswers && otherAnswers.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                      {t("analytics.detail.otherAnswers")}
                    </h3>
                    <ul className="flex flex-col gap-1.5 text-sm text-slate-700">
                      {otherAnswers.map((item, idx) => (
                        <li key={idx} className="flex justify-between gap-4">
                          <span className="break-words">«{item.value}»</span>
                          <span className="text-slate-500 font-mono shrink-0">×{item.count}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

          {question.type === "MATRIX" && matrix && (
            <div className="space-y-4">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                {t("analytics.detail.matrix.title")}
              </h3>

              <div className="overflow-x-auto">
                <table className="w-full text-sm border-separate border-spacing-0">
                  <thead>
                    <tr>
                      <th scope="col" className="text-left p-2 font-semibold text-slate-500" />
                      {matrix.columns.map((column) => (
                        <th
                          key={column.id}
                          scope="col"
                          className="p-2 text-center text-xs font-semibold text-slate-500"
                        >
                          {column.text}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {matrix.rows.map((row) => (
                      <tr key={row.rowId}>
                        <th
                          scope="row"
                          className="text-left p-2 pr-4 font-medium text-slate-700 border-t border-slate-100"
                        >
                          {row.text}
                          <span className="block text-xs font-normal text-slate-500">
                            {t("analytics.detail.matrix.answered", { count: row.answered })}
                          </span>
                        </th>
                        {row.counts.map((count, index) => {
                          const share = row.answered > 0 ? count / row.answered : 0;

                          return (
                            <td
                              key={matrix.columns[index].id}
                              className="p-2 text-center border-t border-slate-100"
                              style={{ backgroundColor: `rgba(79, 70, 229, ${share * 0.35})` }}
                            >
                              <span className="font-semibold text-slate-800">{count}</span>
                              <span className="block text-xs text-slate-500">
                                {Math.round(share * 100)}%
                              </span>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {question.type === "RANKING" && ranking && (
            <div className="space-y-4">
              <div className="flex items-baseline justify-between">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  {t("analytics.detail.ranking.title")}
                </h3>
                <span className="text-xs text-slate-500">
                  {t("analytics.detail.ranking.ranked", { count: rankedCount ?? 0 })}
                </span>
              </div>

              {(rankedCount ?? 0) === 0 ? (
                <p className="text-sm text-slate-500">{t("analytics.detail.ranking.noData")}</p>
              ) : (
                <ol className="flex flex-col gap-3">
                  {[...ranking]
                    .sort(
                      (a, b) =>
                        (a.avgPosition ?? Number.POSITIVE_INFINITY) -
                        (b.avgPosition ?? Number.POSITIVE_INFINITY),
                    )
                    .map((item, idx) => {
                      const n = ranking.length;
                      // The best option (position 1) is a full bar, the worst is empty.
                      const score =
                        item.avgPosition === null || n < 2
                          ? 0
                          : ((n - item.avgPosition) / (n - 1)) * 100;

                      return (
                        <li
                          key={item.optionId}
                          className="bg-slate-50/60 border border-slate-200/60 rounded-xl p-4 flex flex-col gap-2"
                        >
                          <div className="flex justify-between items-center text-sm font-bold text-slate-700 gap-3">
                            <span className="truncate">
                              {idx + 1}. {item.text}
                            </span>
                            <span className="shrink-0 text-xs font-medium text-slate-500">
                              {t("analytics.detail.ranking.avg")}:{" "}
                              <b className="text-indigo-600">{item.avgPosition?.toFixed(2)}</b>
                              {" · "}
                              {t("analytics.detail.ranking.first")}: <b>{item.positions[0]}</b>
                            </span>
                          </div>
                          <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-indigo-500 rounded-full transition-all duration-500"
                              style={{ width: `${score}%` }}
                            />
                          </div>
                        </li>
                      );
                    })}
                </ol>
              )}
            </div>
          )}

          {question.type === "BOOLEAN" && (
            <div className="space-y-4">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                {t("analytics.detail.options")}
              </h3>
              <div className="flex flex-col gap-3">
                <div className="bg-emerald-50/40 border border-emerald-100 rounded-xl p-4 flex items-center justify-between">
                  <div className="space-y-1 flex-1 pr-6">
                    <span className="text-sm font-bold text-emerald-800">
                      {t("analytics.detail.booleanTrue")}
                    </span>
                    <div className="w-full h-2 bg-emerald-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-full"
                        style={{
                          width: `${totalAnswers > 0 ? ((data.trueCount || 0) / totalAnswers) * 100 : 0}%`,
                        }}
                      />
                    </div>
                  </div>
                  <span className="text-2xl font-black text-emerald-700 font-mono">
                    {data.trueCount || 0}
                  </span>
                </div>

                <div className="bg-rose-50/40 border border-rose-100 rounded-xl p-4 flex items-center justify-between">
                  <div className="space-y-1 flex-1 pr-6">
                    <span className="text-sm font-bold text-rose-800">
                      {t("analytics.detail.booleanFalse")}
                    </span>
                    <div className="w-full h-2 bg-rose-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-rose-500 rounded-full"
                        style={{
                          width: `${totalAnswers > 0 ? ((data.falseCount || 0) / totalAnswers) * 100 : 0}%`,
                        }}
                      />
                    </div>
                  </div>
                  <span className="text-2xl font-black text-rose-700 font-mono">
                    {data.falseCount || 0}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
