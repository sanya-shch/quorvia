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

Zustand is used for authentication. The editable copy of a form (the builder's draft) is plain React state in `useFormDraft`, owned by the form workspace (below); transient UI state (selected question, collapsed panels, preview device) is local state of the page that uses it.

This avoids duplicating server data inside a global client store.

## Form workspace

Everything about one form lives under `/forms/:formId/*`: **Overview**, **Builder**, **Responses**, **Analytics**, **Settings**. Older links (`/builder/:id`, `/analytics/:id[/questions/:q]`) redirect to the new places.

- **One layout owns the form.** `FormWorkspaceLayout` loads the form once (`useFormDraft`: TanStack Query for the server copy, `useFormBuilder` for the editable draft, one save with the optimistic-lock `version`), and every section reads and edits that one draft through `useWorkspace()`. Edits made in the Builder are still there, still unsaved, when the owner opens Settings; nothing is copied between pages. Leaving the workspace with unsaved changes asks first (`useBlocker`, `beforeunload`).
- **There is no autosave of the form.** Autosave in this project is for respondents' attempts. The owner saves explicitly; the header shows the draft's real state (saved / unsaved / saving / failed / version conflict). A conflict never overwrites the other copy: the owner chooses to load the latest.
- **Publication status.** The model has one flag (`isPublished`), so "unpublished" is a form that is not published but has responses (they can only come through the public link); a form that was published and unpublished before its first response looks like a draft. Publishing is blocked in the UI when the form has blocking problems (see readiness); the server itself accepts any publish.
- **Overview** (`workspace/overview/`): KPI cards, response activity, form setup, funnel snapshot, recent responses, quick actions, form information. Every block loads on its own (a failing widget shows an error with a retry, the rest stays), a draft gets its readiness and configuration instead of cards of zeros, and a published form with no activity gets a "your form is live" message with the link. All numbers are the analytics endpoints (`/analytics/summary`, `/analytics/funnel`, `/responses`), nothing is estimated on the client; "All time" runs from the creation day so the chart has a per-day series, and then shows no comparison. Recent responses are listed by id and time (forms are anonymous) and open in the Responses section. Exports use the existing asynchronous jobs (the dialog polls only while a job is queued or running).
- **Readiness** (`workspace/readiness.ts`) adds no rules: every blocking check is the builder's own `validateFormState` (also used by the builder), so the overview and the builder cannot disagree. A missing translation is a warning, not a blocker.
- **Settings** (`workspace/settings/`) holds everything that applies to the whole form, moved out of the builder with its editors unchanged: title, description, response mode, logo; languages and translations; welcome and end screens, result rules, appearance; scoring; closing and quotas; publication; exports; delete. Question-level settings stay in the Builder.
- **Responses and Analytics** embed the Vue analytics app (`VueAnalyticsHost` with `embedded`, `initialTab`, `initialResponseId`): the workspace supplies the title and tabs, the Vue app only its period picker, export menu and content.

## Builder

A full-screen, three-column editor over the workspace draft (`builder/BuilderPage.tsx`, components in `builder/editor/`).

- **Left: the question list** (`QuestionSidebar`): number, title, type, a "Logic" mark, a red mark when the question has a validation error, a context menu (duplicate, move up/down, delete), drag and drop, a "+" between questions and "Add question" at the bottom. All **14** question types are offered (`QuestionTypePicker`: basic and advanced), not only the 11 of the first design.
- **Centre: the live preview** (`PreviewWorkspace`): the public form's own components (`FormViewer` for "all at once", `QuestionStepper` for "step by step", and `WelcomeScreen` when the author turned the welcome screen on), rendered with no shareId and no session. So the rendering, validation and branching are the published form's, and nothing is sent: the autosave and the file upload need a shareId and a submit is intercepted. The answers live in those components, so "Reset answers" remounts them; none of it is form data. Test logic opens a sandbox over the condition-engine (`resolveVisibleQuestionIds`, `validateConditionGraph`). The preview language, the device size and the selected question are UI state and are never saved. Selecting a question in the list moves the preview to it (in step mode by following the form's flow with the current preview answers), and the preview can then be used independently; if the selected question is hidden by its condition in the current answers, the preview says so.
- **Right: the inspector** (`QuestionInspector`): type, title, description, required; the type's settings and validation (the same editors the stacked cards used); scoring; conditional logic; translations of this question (the same fields as the language panel in Settings, narrowed to one question). The type can be changed only while the form has no responses (the old answers would no longer fit it); the type's own settings are then replaced by the new type's defaults after a confirmation.
- **Dependency rules** (`editor/dependencies.ts`, on `validateConditionGraph`): a condition may only look at an earlier question. A move that would break one is refused with the names of the affected questions; deleting a question other questions depend on says which, and after confirmation removes only those conditions (they become always shown). Nothing is rewritten silently.
- On a phone the three columns become three panes (Questions / Preview / Settings) switched by tabs.

## Dashboard and My forms

`/dashboard` shows totals over all forms (total, active, responses, completion rate, with the change against the previous period), the response activity and the latest forms; `/forms` is the whole list. Both use `FormsTable` (filter by status, sort, list or cards, search from the top bar, `Ctrl/Cmd+K` focuses it) inside `AppShell` (sidebar, top bar, drawer on a phone). The totals come from one endpoint, `GET /api/dashboard/summary`, which is the per-form summary summed over the user's forms, so the dashboard and a form's overview agree on every definition.

## Respondent introduction

The introduction page is the welcome screen: the author turns it on and writes its title, text and button in Settings, and without it the form opens on the first question (and the same in the builder preview). The page adds only facts read from the form: the number of questions, an _estimated_ time (about 15 seconds per question, shown as "about N minutes"), the language, and notes that depend on the response mode and on whether the form has conditions.

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
