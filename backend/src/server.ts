import "dotenv/config";
import { isPortfolioMode, validateEnv } from "./config/env.js";

const env = validateEnv();

const { default: app } = await import("./app.js");

app.listen(env.PORT, () => {
  console.log(`Server running on port ${env.PORT}`);
});

// A free web host has no separate worker process, so the portfolio deployment runs the (few) cleanup
// jobs it needs inside the API process. Without a worker there is no queue and no Redis.
if (isPortfolioMode()) {
  const { startMaintenance } = await import("./modules/maintenance/maintenance.scheduler.js");
  const { cleanupExpiredDemoUsers } = await import("./modules/demo/demo.service.js");
  const { cleanupRefreshTokens } = await import("./modules/auth/auth.service.js");
  const HOUR_MS = 60 * 60 * 1000;

  startMaintenance([
    {
      name: "demo-cleanup",
      intervalMs: HOUR_MS,
      run: async () => {
        const { users } = await cleanupExpiredDemoUsers();
        return users > 0 ? `deleted expired demo accounts: ${users}` : undefined;
      },
    },
    {
      name: "token-cleanup",
      intervalMs: HOUR_MS,
      run: async () => {
        const count = await cleanupRefreshTokens();
        return count > 0 ? `deleted refresh tokens: ${count}` : undefined;
      },
    },
  ]);
}
