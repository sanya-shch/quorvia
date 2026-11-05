# Frontend

## React Host

The main application is built with React and contains:

- authentication;
- dashboard;
- form builder;
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

A render or lazy-chunk error on any page shows a localized error screen (router `errorElement`) instead of a blank page; if the Vue remote cannot be loaded the analytics page shows a fallback with a reload button (a failed dynamic `import()` is cached by the browser, so reloading is more reliable than retrying in place). Analytics requests that depend on changing input (page, selected response/question) use a *latest wins* guard with `AbortController`, so a slow old response cannot overwrite a newer one.

## Accessibility

Icon-only buttons carry accessible names, text colors meet WCAG AA contrast on their backgrounds, controls that appear on hover are also revealed on keyboard focus, and animations respect `prefers-reduced-motion`.
