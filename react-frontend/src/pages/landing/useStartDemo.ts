import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { authApi } from "../../api/auth";
import { getApiErrorCode } from "../../i18n/errorCodes";
import { IS_FOR_PORTFOLIO } from "../../config/portfolio";
import { useAuthStore } from "../../store/useAuthStore";

export type DemoStatus = "idle" | "starting" | "waking" | "failed";

// A free web service sleeps when idle and needs up to a minute to wake: ~12 tries, 6 s apart.
const MAX_ATTEMPTS = 12;
const RETRY_DELAY_MS = 6000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// A response WITHOUT an API error code (a network error, or the host's own 502/503/504 page while
// the instance boots) means the server is not up yet. A real API answer (for example
// DEMO_CAPACITY_REACHED) is final: retrying would not change it.
const isServerNotReady = (error: unknown) => getApiErrorCode(error) === undefined;

/**
 * "Try the demo": creates a temporary account, signs in and opens the dashboard. Also wakes the
 * backend as soon as the landing page opens, so by the time the visitor clicks it is often up.
 */
export function useStartDemo() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((state) => state.setAuth);
  const [status, setStatus] = useState<DemoStatus>("idle");
  const [errorCode, setErrorCode] = useState<string | undefined>();
  const running = useRef(false);

  useEffect(() => {
    if (IS_FOR_PORTFOLIO) void authApi.warmUp().catch(() => undefined);
  }, []);

  const start = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setStatus("starting");
    setErrorCode(undefined);

    try {
      for (let attempt = 1; ; attempt++) {
        try {
          const data = await authApi.demo();
          setAuth(data.user, data.accessToken);
          navigate("/dashboard");
          return;
        } catch (error) {
          if (!isServerNotReady(error) || attempt >= MAX_ATTEMPTS) {
            setErrorCode(getApiErrorCode(error));
            setStatus("failed");
            return;
          }

          setStatus("waking");
          await sleep(RETRY_DELAY_MS);
        }
      }
    } finally {
      running.current = false;
    }
  }, [navigate, setAuth]);

  return { status, errorCode, start };
}
