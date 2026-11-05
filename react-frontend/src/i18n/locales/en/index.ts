import common from "./common.json";
import errors from "./errors.json";
import conditionErrors from "./conditionErrors.json";
import auth from "./auth.json";
import dashboard from "./dashboard.json";
import builder from "./builder.json";
import viewer from "./viewer.json";
import analytics from "./analytics.json";

// One bundle per language so the bundler emits one lazy chunk per locale.
export default {
  ...common,
  errors,
  conditionErrors,
  auth,
  dashboard,
  builder,
  viewer,
  analytics,
};
