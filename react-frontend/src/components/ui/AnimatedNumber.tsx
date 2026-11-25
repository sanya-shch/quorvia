import { useEffect, useRef, useState } from "react";
import { easeOutExpo, motionDurationMs, prefersReducedMotion } from "./motion";

interface AnimatedNumberProps {
  value: number;
  decimals?: number;
  suffix?: string;
}

const COUNT_UP_FALLBACK_MS = 800;
// The count starts a moment after the card appears, so the eye is already on it.
const START_DELAY_MS = 120;

/**
 * A number that counts up to `value` on mount and from the shown number to the new one when
 * `value` changes. The frames write straight to the DOM (no React re-render per frame), and the
 * final value is always in the document as screen-reader text: assistive technology and tests
 * never see the intermediate numbers. With prefers-reduced-motion the number simply appears.
 */
export default function AnimatedNumber({ value, decimals = 0, suffix = "" }: AnimatedNumberProps) {
  const [initialValue] = useState(() => (prefersReducedMotion() ? value : 0));
  const shown = useRef(initialValue);
  const ref = useRef<HTMLSpanElement>(null);
  const format = (n: number) => `${n.toFixed(decimals)}${suffix}`;

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const text = (n: number) => `${n.toFixed(decimals)}${suffix}`;
    const from = shown.current;

    if (from === value || prefersReducedMotion() || typeof requestAnimationFrame !== "function") {
      shown.current = value;
      element.textContent = text(value);
      return;
    }

    const duration = motionDurationMs("--motion-duration-count", COUNT_UP_FALLBACK_MS);
    const startAt = performance.now() + START_DELAY_MS;
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, Math.max(0, (now - startAt) / duration));
      const current = progress >= 1 ? value : from + (value - from) * easeOutExpo(progress);
      shown.current = current;
      element.textContent = text(current);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, decimals, suffix]);

  return (
    <>
      <span ref={ref} aria-hidden="true">
        {format(initialValue)}
      </span>
      <span className="sr-only">{format(value)}</span>
    </>
  );
}
