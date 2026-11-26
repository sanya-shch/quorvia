<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import type { FormJourneysDto } from "@quorvia/shared-types";
import { describeNode, largestExit, nodeStats } from "./journeyStats";
import { formatPercent } from "../kpi";

const props = defineProps<{
  data: FormJourneysDto;
  selectedId: string | null;
  inspectableIds: string[];
}>();
const emit = defineEmits<{ (e: "open-question", questionId: string): void }>();

const { t } = useI18n();

const stats = computed(() =>
  props.selectedId ? nodeStats(props.data, props.selectedId, t) : null,
);
const title = computed(() => (stats.value ? describeNode(stats.value.node, t) : null));
const exitHere = computed(() => largestExit(props.data));
const share = (count: number, of: number) => (of > 0 ? count / of : 0);
const canInspect = computed(
  () =>
    !!stats.value?.node.questionId && props.inspectableIds.includes(stats.value.node.questionId),
);
</script>

<template>
  <aside class="inspector" :aria-label="t('analytics.journey.inspector')">
    <h3 class="heading">{{ t("analytics.journey.inspector") }}</h3>

    <template v-if="stats && title">
      <p class="selected">{{ title.eyebrow }} · {{ title.title }}</p>

      <dl class="facts">
        <div class="fact fact--main">
          <dt>{{ t("analytics.journey.reached", { count: stats.reached }) }}</dt>
          <dd>
            {{
              t("analytics.journey.shareOfAttempts", {
                value: formatPercent(stats.shareOfAttempts),
              })
            }}
          </dd>
        </div>
        <div v-if="stats.exited > 0 || stats.continued > 0" class="fact fact--bad">
          <dt>{{ t("analytics.journey.exitedHere", { count: stats.exited }) }}</dt>
          <dd>
            {{
              t("analytics.journey.shareOfReached", {
                value: formatPercent(share(stats.exited, stats.reached)),
              })
            }}
          </dd>
        </div>
        <div v-if="stats.exited > 0 || stats.continued > 0" class="fact fact--ok">
          <dt>{{ t("analytics.journey.continued", { count: stats.continued }) }}</dt>
          <dd>
            {{
              t("analytics.journey.shareOfReached", {
                value: formatPercent(share(stats.continued, stats.reached)),
              })
            }}
          </dd>
        </div>
      </dl>

      <section v-if="stats.inbound.length" class="flows">
        <h4>{{ t("analytics.journey.cameFrom") }}</h4>
        <ul>
          <li v-for="f in stats.inbound.slice(0, 4)" :key="f.id">
            <span class="flow-label">{{ f.label }}</span
            ><b>{{ f.count }}</b>
          </li>
        </ul>
      </section>
      <section v-if="stats.outbound.length" class="flows">
        <h4>{{ t("analytics.journey.wentTo") }}</h4>
        <ul>
          <li v-for="f in stats.outbound.slice(0, 4)" :key="f.id">
            <span class="flow-label">{{ f.label }}</span
            ><b>{{ f.count }}</b>
          </li>
        </ul>
      </section>

      <button
        v-if="canInspect"
        type="button"
        class="inspect"
        @click="emit('open-question', stats.node.questionId!)"
      >
        {{ t("analytics.journey.inspectQuestion") }}
      </button>
    </template>

    <template v-else>
      <p class="help">{{ t("analytics.journey.inspectorHelp") }}</p>
      <dl v-if="data.totalAttempts > 0" class="facts">
        <div class="fact fact--main">
          <dt>{{ t("analytics.journey.attemptsInMap", { count: data.totalAttempts }) }}</dt>
        </div>
        <div v-if="exitHere" class="fact fact--bad">
          <dt>
            {{
              t("analytics.journey.largestExit", {
                question: describeNode(exitHere, t).eyebrow,
                count: exitHere.count,
              })
            }}
          </dt>
          <dd>{{ describeNode(exitHere, t).title }}</dd>
        </div>
      </dl>
    </template>
  </aside>
</template>

<style scoped>
.inspector {
  background: var(--color-white, #fff);
  border: 1px solid var(--color-slate-200, #e2e8f0);
  border-radius: 14px;
  padding: 16px;
  min-width: 0;
}
.heading {
  margin: 0 0 10px;
  font-size: 14px;
  font-weight: 700;
  color: var(--color-slate-800, #1e293b);
}
.selected {
  margin: 0 0 12px;
  font-size: 12px;
  color: var(--color-slate-500, #64748b);
}
.help {
  margin: 0 0 12px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--color-slate-500, #64748b);
}
.facts {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.fact {
  border-left: 3px solid var(--color-indigo-600, #4f46e5);
  padding-left: 10px;
}
.fact--bad {
  border-color: var(--color-red-600, #dc2626);
}
.fact--ok {
  border-color: var(--color-emerald-600, #059669);
}
.fact dt {
  font-size: 15px;
  font-weight: 800;
  color: var(--color-slate-900, #0f172a);
}
.fact dd {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--color-slate-500, #64748b);
}
.flows {
  margin-top: 16px;
}
.flows h4 {
  margin: 0 0 6px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--color-slate-400, #94a3b8);
}
.flows ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.flows li {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  font-size: 12px;
  color: var(--color-slate-700, #334155);
}
.flow-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  var(--color-white, #fff)-space: nowrap;
}
.inspect {
  margin-top: 16px;
  width: 100%;
  border: 1px solid var(--color-indigo-200, #c7d2fe);
  background: var(--color-white, #fff);
  color: var(--color-indigo-600, #4f46e5);
  font-size: 13px;
  font-weight: 700;
  padding: 9px 12px;
  border-radius: 10px;
  cursor: pointer;
}
.inspect:hover {
  background: var(--color-indigo-50, #eef2ff);
}
</style>
