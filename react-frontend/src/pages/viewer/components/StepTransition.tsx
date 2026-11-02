import type { ReactNode } from "react";
import { AnimatePresence, LazyMotion, domAnimation, useIsPresent } from "motion/react";
import * as m from "motion/react-m";
import type { Variants } from "motion/react";

/** Напрямок переходу: 1 - вперед (Далі), -1 - назад (Назад, "Змінити відповідь"). */
export type StepDirection = 1 | -1;

const OFFSET_PX = 32;

/**
 * Екран, що йде, виїжджає у бік, протилежний до напрямку, а новий приїжджає
 * зі сторони напрямку - як гортання сторінок. `custom` передає напрямок і
 * екрану, що вже виходить (його власні пропси застарілі, тому AnimatePresence
 * підставляє свіже значення). Виїзд коротший за в'їзд: користувач не чекає.
 * При prefers-reduced-motion (MotionConfig у App) зміщення вимикається,
 * лишається лише прозорість.
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
  // Екран, що виходить, ще в DOM, але вже не "живий": його кнопки тримають
  // ЗАСТАРІЛІ замикання (старий currentIndex), тож повторний клік по "Далі"
  // під час виходу переставляв би крок двічі. inert прибирає його з фокусу,
  // кліків і дерева доступності.
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
 * Анімована зміна кроку покрокової форми. `stepKey` має змінюватись разом із
 * кроком (id питання / "review"): нова відмінна key і є сигналом до переходу.
 * mode="wait": старий екран повністю виходить, потім з'являється новий, тож
 * два екрани ніколи не стоять разом і розмітка не стрибає по висоті.
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
    <LazyMotion features={domAnimation} strict>
      {/* initial={false}: перший екран з'являється без анімації */}
      <AnimatePresence mode="wait" initial={false} custom={direction}>
        <StepCard key={stepKey} direction={direction}>
          {children}
        </StepCard>
      </AnimatePresence>
    </LazyMotion>
  );
}
