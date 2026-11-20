# Frontend

## React Host

The main application is built with React and contains:

- authentication;
- dashboard;
- form builder;
- landing page;
- public form viewer;
- response analytics;
- raw responses;
- export management.

### Main technologies

- React 19
- TypeScript
- React Router
- TanStack Query
- Zustand
- React Hook Form
- Zod
- Tailwind CSS
- Vite

### Client state architecture

Server state and client/UI state are deliberately separated.

TanStack Query is responsible for server state:

- forms;
- responses;
- analytics;
- mutations;
- cache invalidation.

Zustand is used for local application state:

- authentication;
- builder state;
- transient UI state.

This avoids duplicating server data inside a global client store.

## Landing page

`/` is a public, lazily loaded route (`pages/landing/LandingPage.tsx`). Every other route keeps its previous path; unknown paths still go to `/dashboard`.

- The text lives in the `landing` i18n bundle (`uk` and `en`, kept identical by the parity test). Numbers that depend on the product are read from the code, not typed in: the number of question types is `QUESTION_TYPES.length` and the translation limit is `MAX_ADDITIONAL_LANGUAGES`, so the page cannot drift from what the builder offers.
- The product previews (`LandingMocks.tsx`) are drawn with markup instead of screenshots: they follow the interface language, cost no image requests and are `aria-hidden` (the text beside each one says what it shows).
- A signed-in user (`useAuthStore.isAuthenticated`) sees “Dashboard” instead of “Get started”. The session is restored by `ProtectedRoute`, so after a full page reload a signed-in user sees the visitor version until they open a protected page.
- The page uses plain Tailwind palette classes: it is not part of the form theme.

## Public form viewer

All public form screens share `ViewerShell`: a sticky header (mark, form name, save status, language switcher), an optional progress bar, the content column and a footer. The shell, the question card, the review screen and the language pill use only the palette classes that `ThemeScope` re-points (`slate`, `indigo`, `surface`, `on-primary`), so a themed form keeps its colors everywhere; `viewerTheme.contract.test.ts` rejects plain `white`/`black` utilities.

- **All-at-once mode** (`FormViewer`): an intro card with the “N of M questions answered” summary, numbered question cards (the badge and border light up while a field inside has focus and turn red on an error), and a submit bar with “Submit” and “Review answers”. The progress bar is the share of answered questions; calculations are not counted (`answerProgress.ts`).
- **Step-by-step mode** (`QuestionStepper`): one numbered card per step. The total is unknown while branches can change the path, so the bar is an estimate that fills up on the review screen.
- **Review screen** (`ReviewScreen`, rows from `buildReviewItems`): used by both modes, so an answer is written the same way in both (`formatReviewAnswer`: option texts instead of ids, “Yes/No”, matrix rows, file names, computed values). “Edit” goes back to the question with its answers intact (all-at-once: scrolls to it and focuses the first control; step-by-step: opens that step). A required question without an answer is marked in red. Submitting from the review checks everything again: if something is wrong, the respondent lands on the form at the first problem with the errors shown.
- **Save status**: `useAttemptAutosave` returns `idle | saving | saved`. “Saved” means the last successful save holds exactly the current answers, so typing again drops it back until the next save lands. A failed save is not shown to the respondent (autosave stays best-effort).
- Welcome, thank-you, closed and quota-full screens are plain cards inside the same shell, so the header and footer look the same on every screen.

## Vue Analytics Micro-Frontend

The analytics Overview is implemented as a Vue 3 application and integrated into the React host using Module Federation.

```
React Host
    │
    │ Module Federation
    ▼
Vue Analytics Remote
    │
    ▼
Backend API
```

The Vue application is isolated from the React runtime: it has its own state, its own components and talks to the backend directly.

The React host mounts the Vue application when the analytics tab is activated and unmounts it when leaving the tab.

The only coupling is a small, explicit **auth bridge**. The access token lives in memory of the React host (it is not stored in `localStorage`), so the host passes two functions to the remote as props:

- `getAccessToken()` - returns the current access token;
- `refreshAccessToken()` - exchanges the httpOnly refresh cookie for a new token (it shares a single `/auth/refresh` request with the React side).

When the backend answers `401`, the Vue API client asks the host for a fresh token and retries the request once. If the session cannot be restored, the client dispatches an `AUTH_EXPIRED` browser event and the React host performs the logout.

Because a federated remote runs in the same page as the host, the remote's origin is a trusted code source - see [Security](security.md) for the CSP that restricts it.

### The overview page

`AnalyticsApp.vue` composes: a header (form title, Published/Draft badge, version and date, from `/forms/:id/admin`; if that request fails the header simply has no badge), a period picker (7 / 30 / 90 days, all time, custom), the KPI cards with their change against the previous period, the activity trend, the completion funnel, the score summary, the question cards ("Expand all insights" shows every ranked item and matrix row instead of three) and the journey panel.

- **One period for every block.** The picker owns a `from`/`to` pair that every composable receives as a ref and reloads on; `useQueryResource` gives each load a ticket so a slow earlier response cannot overwrite a newer one while someone clicks through periods. A reversed custom range is not applied (the picker explains why) and the last valid period stays on screen. The Responses tab and the export are not filtered by the period.
- **Funnel**: tiles (started, submitted, highest friction, median time), a sortable table (form order / highest drop-off) with exits per question and the "lost since the previous question" hint, collapsed to eight rows. A row opens the question's analytics when it has any.
- **Journey map**: `sankeyLayout.ts` is a pure function (columns, node heights, stacked ribbon slots) so it is unit tested; nodes are focusable buttons over SVG ribbons. Hover or focus lights up a node's paths, a click pins it and fills the inspector. Controls: all / completed / abandoned, steps, hide low-volume, counts / percentages, zoom, reset. A text "step list" shows the same data and is the default on narrow screens.
- The Vue app styles itself with scoped CSS (it has no Tailwind), using the same indigo / slate palette as the React pages.

**Why Module Federation?**

The project intentionally demonstrates cross-framework integration rather than migrating the entire application to another framework.

Only the analytics Overview was implemented as a Vue remote.

This provides:

- framework isolation;
- independent build/deployment of the analytics application;
- the ability to introduce Vue into an existing React application incrementally;
- a realistic micro-frontend boundary.

This also introduces a deliberate trade-off: the Vue runtime is shipped separately from React, increasing bundle size.

The decision was therefore limited to a single feature boundary rather than turning the entire application into micro-frontends.

## Performance

- **Route-level code splitting.** Every page is a lazy chunk. The chunk of the page in the URL starts downloading from `main.tsx`, in parallel with the session restore, instead of after it.
- **Session restore in one request.** `POST /auth/refresh` returns the user together with the access token, so a page reload costs one request and `ProtectedRoute` does not call `/auth/me`.
- **Lazy UI translations.** Each interface language (`uk`, `en`) is a separate chunk; only the active one is downloaded, and the other one on a language switch or when a public form needs it. A test keeps both bundles' keys identical because there is no fallback bundle at runtime.
- **Heavy dependencies stay off shared paths.** `zod`/React Hook Form are only needed on the login and register pages, and `motion/react` only in the public form chunk.
- **Measure production builds.** Lighthouse on the Vite dev server reports unminified code and dev-only modules; use `vite build && vite preview`, ideally in a clean browser profile without extensions.

## Motion

Animations use [`motion`](https://motion.dev) in two weights, chosen by where the code lives. Toasts (in the always-loaded bundle) use `motion/mini` (WAAPI, ~3 kB gzip): they slide in, shrink and fade out, and a toast is removed from the DOM only after its exit animation finished. The animation is a progressive enhancement - without WAAPI, or if it fails, the toast simply appears and disappears. The step-by-step question flow (in the lazy public-form chunk, so only respondents download it) uses `AnimatePresence` + `LazyMotion`/`domAnimation` (~28 kB gzip in motion 14): steps slide in the direction of travel, the outgoing step is `inert` while it leaves so a stale button cannot be clicked, and focus moves to the new step's heading when it mounts. `MotionConfig reducedMotion="user"` and a `prefers-reduced-motion` check remove the movement and keep only the fade. Tests skip animations (`MotionGlobalConfig.skipAnimations`) or mock them. `motion` is pinned to an exact version at least two weeks old.

## Failure handling in the browser

A render or lazy-chunk error on any page shows a localized error screen (router `errorElement`) instead of a blank page; if the Vue remote cannot be loaded the analytics page shows a fallback with a reload button (a failed dynamic `import()` is cached by the browser, so reloading is more reliable than retrying in place). Analytics requests that depend on changing input (page, selected response/question) use a _latest wins_ guard with `AbortController`, so a slow old response cannot overwrite a newer one.

## Accessibility

Icon-only buttons carry accessible names, text colors meet WCAG AA contrast on their backgrounds, controls that appear on hover are also revealed on keyboard focus, and animations respect `prefers-reduced-motion`.
