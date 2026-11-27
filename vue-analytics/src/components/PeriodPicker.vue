<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { isValidRange, PERIOD_PRESETS, type PeriodPreset, type PeriodRange } from "../period";

const props = defineProps<{ preset: PeriodPreset; custom: PeriodRange }>();
const emit = defineEmits<{
  (e: "update:preset", preset: PeriodPreset): void;
  (e: "update:custom", range: PeriodRange): void;
}>();

const { t } = useI18n();

const invalid = computed(() => !isValidRange(props.custom));
const update = (key: "from" | "to", event: Event) =>
  emit("update:custom", { ...props.custom, [key]: (event.target as HTMLInputElement).value });
</script>

<template>
  <div class="picker">
    <div class="presets" role="group" :aria-label="t('analytics.period.label')">
      <button
        v-for="p in PERIOD_PRESETS"
        :key="p"
        type="button"
        class="preset"
        :class="{ 'preset--active': preset === p }"
        :aria-pressed="preset === p"
        @click="emit('update:preset', p)"
      >
        {{ t(`analytics.period.${p}`) }}
      </button>
    </div>

    <div v-if="preset === 'custom'" class="custom">
      <label class="date">
        <span>{{ t("analytics.period.from") }}</span>
        <input
          type="date"
          :value="custom.from ?? ''"
          :max="custom.to || undefined"
          @input="update('from', $event)"
        />
      </label>
      <label class="date">
        <span>{{ t("analytics.period.to") }}</span>
        <input
          type="date"
          :value="custom.to ?? ''"
          :min="custom.from || undefined"
          @input="update('to', $event)"
        />
      </label>
      <p v-if="invalid" class="invalid" role="alert">{{ t("analytics.period.invalid") }}</p>
    </div>
  </div>
</template>

<style scoped>
.picker {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
}
.presets {
  display: inline-flex;
  background: var(--color-white, #fff);
  border: 1px solid var(--color-slate-200, #e2e8f0);
  border-radius: 12px;
  padding: 3px;
  gap: 2px;
}
.preset {
  border: none;
  background: transparent;
  padding: 6px 12px;
  border-radius: 9px;
  font-size: 12px;
  font-weight: 700;
  color: var(--color-slate-500, #64748b);
  cursor: pointer;
  white-space: nowrap;
}
.preset:hover {
  color: var(--color-slate-800, #1e293b);
}
.preset--active {
  background: var(--color-indigo-600, #4f46e5);
  color: var(--color-on-solid, #fff);
}
.preset:focus-visible,
.date input:focus-visible {
  outline: 2px solid var(--color-indigo-600, #4f46e5);
  outline-offset: 2px;
}
.custom {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  align-items: center;
  gap: 8px;
}
.date {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--color-slate-500, #64748b);
}
.date input {
  border: 1px solid var(--color-slate-200, #e2e8f0);
  border-radius: 8px;
  padding: 5px 8px;
  font-size: 12px;
  color: var(--color-slate-800, #1e293b);
  background: var(--color-white, #fff);
}
.invalid {
  flex-basis: 100%;
  text-align: right;
  margin: 0;
  font-size: 12px;
  color: var(--color-red-700, #b91c1c);
}
@media (max-width: 640px) {
  .picker {
    align-items: stretch;
  }
  .presets {
    width: 100%;
    overflow-x: auto;
  }
  .preset {
    flex: 1;
  }
}
</style>
