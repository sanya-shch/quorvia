/**
 * The portfolio deployment: a public demo on free hosting (docs/deployment.md). One flag, set at
 * build time (VITE_IS_FOR_PORTFOLIO=true), for everything the demo switches off or adds: exports,
 * file and image uploads, registration/login pages, the "Try the demo" button. The backend has its
 * own switch (IS_FOR_PORTFOLIO) and refuses the same features, so hiding them here is only about
 * not offering what would fail.
 */
export const IS_FOR_PORTFOLIO = import.meta.env.VITE_IS_FOR_PORTFOLIO === "true";
