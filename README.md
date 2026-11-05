# Quorvia

Quorvia is a full-stack survey platform for building dynamic forms, collecting responses, and analyzing how respondents move through conditional question flows.

The project focuses on a non-trivial form engine rather than plain CRUD: conditional branching, several response modes, autosaved attempts, funnel analytics, asynchronous exports, translated forms, and a React host integrated with a Vue 3 analytics micro-frontend.

## Screenshots

![Dashboard](/assets/Dashboard.png)
![BuilderEmpty](/assets/BuilderEmpty.png)
![Builder](/assets/Builder.png)
![ViewerOneAtTime](/assets/ViewerOneAtTime.png)
![ViewerAllInOne](/assets/ViewerAllInOne.png)
![Dashboard2](/assets/Dashboard2.png)
![Analytics](/assets/Analytics.png)
![AnalyticsRaw](/assets/AnalyticsRaw.png)

## Features

**Form builder**

- 11 question types: text, number, boolean, date, single and multiple choice (with an optional “Other” answer), star rating, linear scale, NPS, ranking, and matrix (including Likert statements)
- Conditional question visibility with `AND` / `OR` rules, graph validation and cycle detection
- Drag-and-drop reordering of questions and options, optimistic locking against concurrent edits
- Form content in several languages: a main language plus up to 10 translations, with missing-translation indicators

**Respondents**

- Step-by-step and all-at-once completion modes
- Autosaved attempts, a review screen before submitting
- Language chosen from `?lang=`, the browser, or a switcher

**Analytics and exports**

- Funnel analytics based on the questions respondents actually reached, plus branch/path statistics
- Per-type summaries: distributions and averages for scales, NPS breakdown, average ranking position, matrix tables
- PDF, CSV and Excel exports processed asynchronously by a BullMQ worker with retries

**Engineering**

- Server-side validation of conditional logic and submitted answers
- Dedicated framework-agnostic condition engine shared by the frontend and the backend
- React host with a Vue 3 analytics micro-frontend (Module Federation)
- Shared TypeScript contracts, exhaustive `switch` checks over question types
- Security hardening: RE2-based regex validation, rate limiting, refresh-token rotation with reuse detection, CSV-injection protection
- Vitest unit and integration tests, pnpm monorepo, Docker-based PostgreSQL and Redis

## Documentation

| Document | Contents |
| --- | --- |
| [Architecture](docs/architecture.md) | Monorepo layout, high-level diagram, data flow, design decisions, trade-offs |
| [Frontend](docs/frontend.md) | React host, Vue micro-frontend, state management, performance, motion |
| [Conditional logic](docs/conditional-logic.md) | The condition engine, dependency validation, server-side invariants |
| [Question types](docs/question-types.md) | Supported types and the checklist for adding a new one |
| [Content languages](docs/content-languages.md) | Translating forms and how respondents pick a language |
| [Analytics](docs/analytics.md) | Attempts, reached vs. visible questions, funnel and per-type analytics |
| [Exports](docs/exports.md) | The asynchronous export pipeline |
| [Security](docs/security.md) | Implemented measures, data retention, known gaps and deployment notes |
| [API](docs/API.md) | Endpoint reference |
| [Local development](docs/development.md) | Setup, environment variables, running and testing |

## Quick start

Requirements: Node.js 20+, pnpm 9+, Docker.

```bash
pnpm install
cp .env.example .env
cp backend/.env.example backend/.env

pnpm docker:up                      # PostgreSQL and Redis
(cd backend && npx prisma migrate dev)

pnpm dev:backend
pnpm dev:worker
pnpm dev:frontend
```

The Vue analytics remote needs a production build; see [Local development](docs/development.md).

## Technology stack

| Area | Technology |
| --- | --- |
| Frontend | React 19, TypeScript, React Router, TanStack Query, Zustand, React Hook Form, Zod, Tailwind CSS, Vite |
| Analytics UI | Vue 3 via Module Federation |
| Backend | Node.js, Express, Prisma, PostgreSQL, JWT |
| Background jobs | BullMQ, Redis |
| Tooling | pnpm workspaces, Vitest, Testing Library, Docker Compose |

