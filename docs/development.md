# Local Development

## Requirements

- Node.js 20+
- pnpm 9+
- Docker

The repository uses pnpm workspaces.

```bash
git clone <repository-url>
cd Quorvia

pnpm install
```

If pnpm asks for permission to run package build scripts:

```bash
pnpm approve-builds
```

## Start Infrastructure

PostgreSQL and Redis are provided through Docker Compose.

```bash
pnpm docker:up
```

To reset the local infrastructure:

```bash
pnpm docker:reset
```

To stop it:

```bash
pnpm docker:down
```

## Environment Variables

Create the environment files from the templates (`.env.example` files are tracked in git):

```bash
cp .env.example .env                    # used by docker-compose.yml
cp backend/.env.example backend/.env
```

Backend variables:

| Variable | Required | Description |
| --- | --- | --- |
| `DATABASE_URL` | yes | PostgreSQL connection string |
| `REDIS_URL` | yes | Redis connection string (BullMQ) |
| `JWT_SECRET` | yes | Access-token signing secret. In production it must be at least 32 characters and must not be the example value (`openssl rand -base64 48`) |
| `CORS_ORIGIN` | no | Allowed frontend origin(s), comma-separated. Default `http://localhost:5173`; must not be `localhost` in production |
| `PORT` | no | API port, default `5001` |
| `TRUST_PROXY` | no | Number of reverse proxies in front of the API (`1` for one proxy). Required for correct per-IP rate limiting behind a proxy |
| `NODE_ENV` | no | `production` enables the stricter checks above and `Secure` cookies |
| `EXPORT_RETENTION_DAYS` | no | How long finished exports (file + `ExportJob` row) are kept. Default `7`, minimum `1` |
| `ATTEMPT_RETENTION_DAYS` | no | How long **unfinished** attempts are kept. Default `180`; `0` keeps them forever. See [Data retention](security.md#data-retention) |

The React application can optionally use:

```dotenv
VITE_API_URL=http://localhost:5001/api
VITE_VUE_ANALYTICS_URL=http://localhost:5174
# VITE_DISABLE_CSP=true   # turns off the production CSP <meta> tag
```

`VITE_API_URL` and `VITE_VUE_ANALYTICS_URL` are also used to build the production Content-Security-Policy, so set them at build time.

## Database

Run Prisma migrations:

```bash
cd backend

npx prisma migrate dev
npx prisma generate
```

> The `20261028000000_normalize_user_emails` migration lowercases existing user emails. If two accounts differ only by letter case it fails on the unique constraint - merge those accounts manually first.

## Start the Applications

**Backend**

```bash
pnpm dev:backend
```

**React Frontend**

```bash
pnpm dev:frontend
```

**Background Worker**

```bash
pnpm dev:worker
```

## Vue Analytics

The Vue remote requires a production build to generate `remoteEntry.js`:

```bash
pnpm --filter vue-analytics build
pnpm --filter vue-analytics preview
```

The React application can then load the remote from the configured `VITE_VUE_ANALYTICS_URL`.

## Testing

The project uses automated tests for both pure domain logic and application behavior.

### Condition engine

The conditional logic package is tested independently because it contains framework-independent business rules.

Examples include:

- empty conditions;
- equality / inequality;
- numeric comparisons;
- AND / OR rules;
- visible question resolution;
- invalid condition graphs;
- cyclic dependencies.

```bash
pnpm --filter @quorvia/condition-engine test
```

### Backend

Backend tests cover:

- authorization and ownership checks;
- response validation;
- conditional visibility;
- funnel analytics;
- export processing;
- exporter behavior;
- error handling.

```bash
pnpm test:backend
```

### Frontend

React and Vue tests cover important UI behavior and state transitions using Vitest and Testing Library.

Run the complete workspace test suite:

```bash
pnpm test
```
