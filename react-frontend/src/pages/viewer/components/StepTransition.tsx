import type { ReactNode } from "react";
import { AnimatePresence, LazyMotion, MotionConfig, domAnimation, useIsPresent } from "motion/react";
import * as m from "motion/react-m";
import type { Variants } from "motion/react";

// Direction of the transition: 1 is forward (Next), -1 is back (Back, "Change answer").
export type StepDirection = 1 | -1;

const OFFSET_PX = 32;

/**
 * The leaving screen slides out opposite to the direction and the new one arrives from the
 * direction's side, like turning pages. `custom` also passes the direction to the screen that is
 * already leaving (its own props are stale, so AnimatePresence injects the fresh value). The exit
 * is shorter than the entrance: the user does not wait. With prefers-reduced-motion (MotionConfig
 * below) the offset is disabled and only opacity remains.
 */
const variants: Variants = {
  enter: (direction: StepDirection) => ({ opacity: 0, x: direction * OFFSET_PX }),
  center: { opacity: 1, x: 0, transition: { duration: 0.2, ease: "easeOut" } },
  exit: (direction: StepDirection) => ({
    opacity: 0,
    x: direction * -OFFSET_PX,
    transition: { duration: 0.12, ease: "easeIn" },
  }),
};

function StepCard({ direction, children }: { direction: StepDirection; children: ReactNode }) {
  // The leaving screen is still in the DOM but no longer "live": its buttons hold STALE closures
  // (the old currentIndex), so a repeated click on "Next" during the exit would advance the step
  // twice. inert takes it out of focus, clicks and the accessibility tree.
  const isPresent = useIsPresent();

  return (
    <m.div
      custom={direction}
      variants={variants}
      initial="enter"
      animate="center"
      exit="exit"
      inert={!isPresent}
    >
      {children}
    </m.div>
  );
}

/**
 * Animated change of a step of the step-by-step form. `stepKey` must change with the step
 * (question id / "review"): a new distinct key is the signal for the transition.
 * mode="wait": the old screen fully leaves, then the new one appears, so two screens are never
 * shown together and the layout does not jump in height.
 */
export default function StepTransition({
  stepKey,
  direction,
  children,
}: {
  stepKey: string;
  direction: StepDirection;
  children: ReactNode;
}) {
  return (
    // MotionConfig lives here, not in App: motion/react is only needed by the
    // viewer, and importing it at the root put ~80 KB on every page.
    <MotionConfig reducedMotion="user">
      <LazyMotion features={domAnimation} strict>
        {/* initial={false}: the first screen appears without animation */}
        <AnimatePresence mode="wait" initial={false} custom={direction}>
          <StepCard key={stepKey} direction={direction}>
            {children}
          </StepCard>
        </AnimatePresence>
      </LazyMotion>
    </MotionConfig>
  );
}
