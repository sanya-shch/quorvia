<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import type { FormPathsDto } from "@quorvia/shared-types";
import { JOURNEY_DEFAULT_STEPS, JOURNEY_MAX_STEPS } from "@quorvia/shared-types";
import type { JourneyStatus } from "@quorvia/shared-types";
import { useFormJourneys } from "../composables/useFormJourneys";
import type { QueryParams } from "../period";
import JourneyMap from "./JourneyMap.vue";
import JourneyStepList from "./JourneyStepList.vue";
import JourneyInspector from "./JourneyInspector.vue";
import PathsDiagram from "./PathsDiagram.vue";

const props = defineProps<{
  apiBaseUrl: string;
  formId: string;
  // The page's period (from/to), shared with every other block.
  periodParams: QueryParams;
  // The older "question flow" view works on submitted responses only; it keeps its own data.
  paths: FormPathsDto | null;
  pathsLoading: boolean;
  pathsError: string | null;
  inspectableIds: string[];
}>();
const emit = defineEmits<{ (e: "open-question", questionId: string): void }>();

const { t } = useI18n();

type View = "map" | "steps" | "flow";
const STEP_OPTIONS = [3, 5, 8, JOURNEY_MAX_STEPS];
const ZOOMS = [0.6, 0.8, 1, 1.25, 1.5];
const STATUSES: JourneyStatus[] = ["all", "completed", "abandoned"];

const status = ref<JourneyStatus>("all");
const steps = ref<number>(JOURNEY_DEFAULT_STEPS);
const mode = ref<"counts" | "percent">("counts");
const hideLowVolume = ref(false);
const zoomIndex = ref(2);
const selectedId = ref<string | null>(null);

// A phone gets the step list first: a wide diagram needs sideways scrolling there.
const isNarrow = () => window.matchMedia?.("(max-width: 640px)").matches ?? false;
const view = ref<View>(isNarrow() ? "steps" : "map");

const params = computed<QueryParams>(() => ({
  ...props.periodParams,
  status: status.value,
  steps: steps.value,
}));
const {
  data: journeys,
  isLoading,
  error,
} = useFormJourneys(props.apiBaseUrl, props.formId, params);

const stepOptions = computed(() =>
  STEP_OPTIONS.includes(steps.value)
    ? STEP_OPTIONS
    : [...STEP_OPTIONS, steps.value].sort((a, b) => a - b),
);
const zoom = computed(() => ZOOMS[zoomIndex.value]);

const setStatus = (value: JourneyStatus) => {
  status.value = value;
  selectedId.value = null;
};
const reset = () => {
  status.value = "all";
  steps.value = JOURNEY_DEFAULT_STEPS;
  mode.value = "counts";
  hideLowVolume.value = false;
  zoomIndex.value = 2;
  selectedId.value = null;
};

// Escape clears the selection from anywhere inside the panel.
const onKey = (e: KeyboardEvent) => {
  if (e.key === "Escape") selectedId.value = null;
};
onMounted(() => window.addEventListener("keydown", onKey));
onBeforeUnmount(() => window.removeEventListener("keydown", onKey));
</script>

<template>
  <div class="panel">
    <div class="bar">
      <div class="chips" role="group" :aria-label="t('analytics.journey.statusLabel')">
        <button
          v-for="s in STATUSES"
          :key="s"
          type="button"
          class="chip"
          :class="{ 'chip--active': status === s }"
          :aria-pressed="status === s"
          :disabled="view === 'flow'"
          @click="setStatus(s)"
        >
          {{ t(`analytics.journey.status.${s}`) }}
        </button>
      </div>

      <div class="views" role="group" :aria-label="t('analytics.journey.viewLabel')">
        <button
          v-for="v in ['map', 'steps', 'flow'] as View[]"
          :key="v"
          type="button"
          class="seg"
          :class="{ 'seg--active': view === v }"
          :aria-pressed="view === v"
          @click="view = v"
        >
          {{ t(`analytics.journey.view.${v}`) }}
        </button>
      </div>
    </div>

    <template v-if="view !== 'flow'">
      <div class="bar bar--sub">
        <div class="tools">
          <button
            type="button"
            class="toggle"
            :class="{ 'toggle--on': hideLowVolume }"
            :aria-pressed="hideLowVolume"
            @click="hideLowVolume = !hideLowVolume"
          >
            {{ t("analytics.journey.hideLowVolume") }}
          </button>
          <label class="select">
            <span class="sr-only">{{ t("analytics.journey.stepsLabel") }}</span>
            <select v-model.number="steps" :aria-label="t('analytics.journey.stepsLabel')">
              <option v-for="n in stepOptions" :key="n" :value="n">
                {{
                  n === JOURNEY_MAX_STEPS
                    ? t("analytics.journey.allSteps")
                    : t("analytics.journey.stepsCount", { count: n })
                }}
              </option>
            </select>
          </label>
        </div>

        <div class="tools">
          <div class="modes" role="group" :aria-label="t('analytics.journey.modeLabel')">
            <button
              type="button"
              class="seg"
              :class="{ 'seg--active': mode === 'counts' }"
              :aria-pressed="mode === 'counts'"
              @click="mode = 'counts'"
            >
              {{ t("analytics.journey.counts") }}
            </button>
            <button
              type="button"
              class="seg"
              :class="{ 'seg--active': mode === 'percent' }"
              :aria-pressed="mode === 'percent'"
              @click="mode = 'percent'"
            >
              {{ t("analytics.journey.percentages") }}
            </button>
          </div>
          <button type="button" class="reset" @click="reset">
            {{ t("analytics.journey.reset") }}
          </button>
        </div>
      </div>

      <div v-if="isLoading && !journeys" class="state">{{ t("analytics.journey.loading") }}</div>
      <div v-else-if="error" class="state state--error" role="alert">{{ t(error) }}</div>

      <div v-else-if="journeys" class="layout" :aria-busy="isLoading">
        <div class="main">
          <div class="legend" aria-hidden="true">
            <span><i class="dot dot--main" />{{ t("analytics.journey.legendMain") }}</span>
            <span><i class="dot dot--branch" />{{ t("analytics.journey.legendBranch") }}</span>
            <span><i class="dot dot--exit" />{{ t("analytics.journey.legendExit") }}</span>
          </div>

          <JourneyMap
            v-if="view === 'map'"
            :data="journeys"
            :mode="mode"
            :hide-low-volume="hideLowVolume"
            :zoom="zoom"
            :selected-id="selectedId"
            @select="(id) => (selectedId = id)"
          />
          <JourneyStepList
            v-else
            :data="journeys"
            :mode="mode"
            :hide-low-volume="hideLowVolume"
            :selected-id="selectedId"
            @select="(id) => (selectedId = id)"
          />

          <div v-if="view === 'map'" class="zoom">
            <span class="zoom-label">{{ t("analytics.journey.zoom") }}</span>
            <button
              type="button"
              class="zoom-btn"
              :disabled="zoomIndex === 0"
              :aria-label="t('analytics.journey.zoomOut')"
              @click="zoomIndex--"
            >
              −
            </button>
            <span class="zoom-value">{{ Math.round(zoom * 100) }}%</span>
            <button
              type="button"
              class="zoom-btn"
              :disabled="zoomIndex === ZOOMS.length - 1"
              :aria-label="t('analytics.journey.zoomIn')"
              @click="zoomIndex++"
            >
              +
            </button>
          </div>
        </div>

        <JourneyInspector
          :data="journeys"
          :selected-id="selectedId"
          :inspectable-ids="inspectableIds"
          @open-question="(id) => emit('open-question', id)"
        />
      </div>
    </template>

    <template v-else>
      <p class="flow-hint">{{ t("analytics.paths.sectionHint") }}</p>
      <div v-if="pathsLoading" class="state">{{ t("analytics.paths.loading") }}</div>
      <div v-else-if="pathsError" class="state state--error" role="alert">{{ t(pathsError) }}</div>
      <PathsDiagram
        v-else-if="paths"
        :nodes="paths.nodes"
        :edges="paths.edges"
        :total-responses="paths.totalResponses"
      />
    </template>
  </div>
</template>

<style scoped>
.bar {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}
.bar--sub {
  margin: 14px 0;
  padding-top: 14px;
  border-top: 1px solid var(--color-slate-200, #e2e8f0);
}
.chips,
.views,
.modes,
.tools {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.chip,
.seg,
.toggle,
.reset,
.zoom-btn,
.select select {
  border: 1px solid var(--color-slate-200, #e2e8f0);
  background: var(--color-white, #fff);
  color: var(--color-slate-700, #334155);
  font-size: 12px;
  font-weight: 700;
  border-radius: 10px;
  padding: 6px 12px;
  cursor: pointer;
}
.chip:hover,
.seg:hover,
.toggle:hover,
.reset:hover {
  border-color: var(--color-indigo-200, #c7d2fe);
}
.chip--active,
.seg--active {
  background: var(--color-indigo-600, #4f46e5);
  border-color: var(--color-indigo-600, #4f46e5);
  color: var(--color-on-solid, #fff);
}
.views,
.modes {
  background: var(--color-slate-100, #f1f5f9);
  padding: 3px;
  border-radius: 12px;
  gap: 2px;
}
.views .seg,
.modes .seg {
  border-color: transparent;
  background: transparent;
}
.views .seg--active,
.modes .seg--active {
  background: var(--color-white, #fff);
  color: var(--color-indigo-600, #4f46e5);
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.08);
}
.toggle--on {
  background: var(--color-indigo-50, #eef2ff);
  border-color: var(--color-indigo-400, #818cf8);
  color: var(--color-indigo-700, #4338ca);
}
.chip:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.chip:focus-visible,
.seg:focus-visible,
.toggle:focus-visible,
.reset:focus-visible,
.zoom-btn:focus-visible,
.select select:focus-visible {
  outline: 2px solid var(--color-indigo-600, #4f46e5);
  outline-offset: 2px;
}
.layout {
  display: grid;
  grid-template-columns: 1fr;
  gap: 14px;
}
@media (min-width: 1000px) {
  .layout {
    grid-template-columns: minmax(0, 1fr) 270px;
    align-items: start;
  }
}
.main {
  min-width: 0;
}
.legend {
  display: flex;
  gap: 14px;
  justify-content: flex-end;
  margin-bottom: 8px;
  font-size: 12px;
  color: var(--color-slate-500, #64748b);
}
.legend span {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
}
.dot--main {
  background: var(--color-indigo-600, #4f46e5);
}
.dot--branch {
  background: var(--color-emerald-600, #059669);
}
.dot--exit {
  background: var(--color-red-600, #dc2626);
}
.zoom {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
  font-size: 12px;
  color: var(--color-slate-500, #64748b);
}
.zoom-btn {
  width: 30px;
  padding: 4px 0;
  font-size: 15px;
  line-height: 1;
}
.zoom-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.zoom-value {
  min-width: 40px;
  text-align: center;
  font-variant-numeric: tabular-nums;
  font-weight: 700;
}
.state {
  text-align: center;
  color: var(--color-slate-400, #94a3b8);
  font-size: 14px;
  padding: 36px 0;
}
.state--error {
  color: var(--color-red-600, #dc2626);
}
.flow-hint {
  margin: 14px 0;
  font-size: 12px;
  color: var(--color-slate-400, #94a3b8);
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  var(--color-white, #fff)-space: nowrap;
}
</style>
