<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { easeOutExpo, motionDurationMs, prefersReducedMotion } from "../motion";

// A number that counts up to `value` on mount and from the shown number to the new one when
// `value` changes. The frames write straight to the DOM (no Vue re-render per frame), and the final
// value is always in the document as screen-reader text, so assistive technology and tests never
// see the intermediate numbers. With prefers-reduced-motion the number simply appears.
const props = withDefaults(defineProps<{ value: number; decimals?: number; suffix?: string }>(), {
  decimals: 0,
  suffix: "",
});

const COUNT_UP_FALLBACK_MS = 800;
// The count starts a moment after the card appears, so the eye is already on it.
const START_DELAY_MS = 120;

const format = (n: number) => `${n.toFixed(props.decimals)}${props.suffix}`;

let shown = prefersReducedMotion() ? props.value : 0;
// Written once and never changed: Vue must not rewrite the text the frames are animating.
const initialText = format(shown);
const element = ref<HTMLElement | null>(null);
let frame = 0;

const stop = () => {
  if (frame && typeof cancelAnimationFrame === "function") cancelAnimationFrame(frame);
  frame = 0;
};

const run = () => {
  const target = element.value;
  if (!target) return;
  stop();
  const value = props.value;
  const from = shown;

  if (from === value || prefersReducedMotion() || typeof requestAnimationFrame !== "function") {
    shown = value;
    target.textContent = format(value);
    return;
  }

  const duration = motionDurationMs("--motion-duration-count", COUNT_UP_FALLBACK_MS);
  const startAt = performance.now() + START_DELAY_MS;
  const tick = (now: number) => {
    const progress = Math.min(1, Math.max(0, (now - startAt) / duration));
    shown = progress >= 1 ? value : from + (value - from) * easeOutExpo(progress);
    target.textContent = format(shown);
    frame = progress < 1 ? requestAnimationFrame(tick) : 0;
  };
  frame = requestAnimationFrame(tick);
};

onMounted(run);
watch(() => [props.value, props.decimals, props.suffix], run);
onBeforeUnmount(stop);
</script>

<template>
  <span ref="element" aria-hidden="true">{{ initialText }}</span>
  <span class="sr-only">{{ format(value) }}</span>
</template>

<style scoped>
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  var(--color-white, #fff)-space: nowrap;
  border: 0;
}
</style>
