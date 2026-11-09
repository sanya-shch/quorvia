import "dotenv/config";
import { validateEnv } from "./config/env.js";

const env = validateEnv();

const { default: app } = await import("./app.js");

app.listen(env.PORT, () => {
  console.log(`Server running on port ${env.PORT}`);
});
