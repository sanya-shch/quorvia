import { DEMO_LIMITS } from "@quorvia/shared-types";
import { useAuthStore } from "./useAuthStore";

// The limits of the signed-in user: the demo ones for a demo account, none (Infinity) for anyone
// else. The server enforces them; the UI uses them to disable what would be refused.
export const useDemoLimits = () => {
  const isDemo = useAuthStore((state) => Boolean(state.user?.demo));

  return {
    isDemo,
    maxForms: isDemo ? DEMO_LIMITS.maxForms : Infinity,
    maxQuestions: isDemo ? DEMO_LIMITS.maxQuestionsPerForm : Infinity,
  };
};
