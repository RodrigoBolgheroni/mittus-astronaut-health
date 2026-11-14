# Mittus — Backend

API NestJS de check-ins diários, com Prisma 6 e PostgreSQL/Supabase.

## Configuração

Requisitos: Node.js 24 e pnpm 10. Os comandos abaixo devem ser executados em `backend/`.

```bash
pnpm install
pnpm prisma:generate
```

Configure o `.env` usando [`.env.example`](.env.example) como referência, preservando suas credenciais existentes:

| Variável         | Uso                                                                                                                                                                    |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`   | Conexão PostgreSQL de servidor. A aplicação também aceita o nome legado `DATASOURCE_URL` se `DATABASE_URL` estiver ausente. Os comandos do Prisma usam `DATABASE_URL`. |
| `SESSION_SECRET` | Segredo aleatório com pelo menos 32 caracteres para assinar os cookies. Deve ser estável entre reinícios e igual em todas as instâncias da API.                        |
| `WEB_ORIGIN`     | Origem exata do frontend, como `http://localhost:3000`, sem barra final.                                                                                               |
| `PORT`           | Porta da API; padrão `3001`.                                                                                                                                           |
| `NODE_ENV`       | `production` habilita o atributo `Secure` do cookie; use HTTPS nesse ambiente.                                                                                         |
| `FATIGUE_FORECAST_URL` | Optional trusted inference endpoint. The server posts model inputs to this URL; without it, action evaluation returns `unavailable`. |

Para gerar um segredo local:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

The existing Supabase database is already provisioned. Starting the API does not apply migrations. Do not run `db push` or reset the shared database; use the [canonical SQL history](#database-schema-synchronization) for schema reconstruction.

```bash
pnpm start:dev
```

Produção:

```bash
pnpm build
pnpm start:prod
```

O build gera o client e copia o engine do Prisma para `dist`. Não é necessário publicar `src/generated` no Git.

## Endpoints

| Método | Rota                                           | Função                                                               |
| ------ | ---------------------------------------------- | -------------------------------------------------------------------- |
| `PUT`  | `/api/check-ins/:date`                         | Cria ou substitui o registro do dia atual em UTC.                    |
| `GET`  | `/api/check-ins/:date`                         | Consulta uma data da sessão; retorna 404 quando não existe.          |
| `GET`  | `/api/check-ins?limit=7`                       | Histórico recente, com data decrescente; limite entre 1 e 90.        |
| `GET`  | `/api/check-ins?from=2026-11-01&to=2026-12-01` | Calendário com início inclusivo e fim exclusivo; máximo de 366 dias. |
| `GET`  | `/api/check-in-options`                        | Valores e rótulos das quatro escalas, lidos do banco.                |
| `POST` | `/api/check-ins/:checkInId/actions/evaluate` | Evaluates the latest check-in and persists an experimental action. |
| `GET` | `/api/check-ins/:checkInId/actions` | Lists up to 90 actions, newest first, for an owned check-in. |
| `PATCH` | `/api/check-in-actions/:actionId` | Acknowledges, completes or dismisses an owned pending action. |

Contrato completo: [SPEC de check-ins](../docs/specs/check-ins-spec.md).

Exemplo de corpo do `PUT`:

```json
{
  "sleep_hours": 7.5,
  "stress_level": 2,
  "mood_level": 1,
  "team_conflict_level": 1,
  "fatigue": 3,
  "description": "Feeling ready for the day."
}
```

O `PUT` retorna 200 tanto para criação quanto para substituição. A omissão de `description` remove o texto anterior. Campos desconhecidos e strings numéricas são rejeitados.

### Organização das validações

Em `src/check-ins/`, os contratos dos services são interfaces sem validações em `dto/`, com sufixos `.input.ts` e `.output.ts`. As classes com decorators de `class-validator` ficam em `requests/` (corpo), `query-params/` (query) e `path-params/` (rota). O `ValidationPipe` aplica essas validações na entrada HTTP; `class-transformer` converte o limite da query e normaliza a descrição.

Verificações de existência usam consultas ao banco e avaliam o resultado. Não há filtro customizado de exceções nem tratamento baseado em códigos do Prisma/PostgreSQL. Exceções inesperadas seguem a resposta HTTP 500 padrão do NestJS.

## Check-in actions

The existing NestJS backend, signed session cookie, validation pipe, Prisma model and SQL migration are reused. No additional table or production migration is needed. Browser requests must send credentials; the existing Origin check also protects both new write routes. A missing or foreign UUID returns `404`; malformed UUIDs, unknown update fields and invalid statuses return `400`.

### Forecast integration

Configure `FATIGUE_FORECAST_URL` with a trusted inference endpoint. This repository does not contain a trained predictor; the integration never fabricates probabilities. It posts `{ "check_ins": [...] }` with up to 90 check-ins in chronological order. Each entry contains `id`, `check_in_date`, `sleep_hours`, `stress_level`, `mood_level`, `team_conflict_level` and `fatigue`. Session identifiers, cookies and free-text descriptions are not sent.

The provider must return HTTP 200 with one of these JSON responses:

```json
{
  "status": "ready",
  "probability_high_fatigue": 0.7,
  "model_version": "your-versioned-model",
  "predicted_at": "2026-11-14T12:00:00.000Z"
}
```

```json
{ "status": "insufficient_history" }
```

Probability must be finite and between 0 and 1; the model version must be nonempty and at most 128 characters; the prediction time must be a valid UTC ISO instant ending in `Z`. HTTP failures, malformed output, an unconfigured endpoint or a five-second timeout produce `unavailable`. No action is inserted for either unavailable or insufficient-history evaluations, and pending actions for that check-in become `superseded`. Existing snapshots and completed/dismissed history are retained.

### Evaluation and state

Call `POST /api/check-ins/{id}/actions/evaluate` with no body or `{}` after saving a check-in. Only the session's latest check-in is evaluable (`409 CHECK_IN_NOT_LATEST` otherwise). A successful evaluation returns `{ "status": "ready", "action": { ... }, "explanation": "..." }`; other outcomes return `status`, `action: null` and an English explanation.

The synthetic-data policy `demo-follow-up-v1` selects `recheck` for probability >= 0.5 and `monitor` below 0.5. This is a demonstration display threshold, not a validated medical threshold. `contact_crew` and `contact_medical` remain reserved; no messages or diagnoses are generated. Explanations currently use versioned English text; language-model generation is not part of these routes.

The evaluation key fingerprints model inputs, model/rule versions and probability. Prediction timestamps do not cause duplicate actions. Repeating the current evaluation preserves its ID, snapshot and user progress. After supersession, recovery creates a new historical entry instead of reviving the old action.

Session-scoped PostgreSQL transaction advisory locks coordinate check-in writes, evaluations and status changes. Inference runs outside the transaction; the backend rechecks the input fingerprint before persistence (`409 EVALUATION_OUTDATED` if the history changed). Indicator corrections immediately supersede pending actions. Description-only edits and identical saves do not invalidate an action. Creating a new day's check-in also invalidates previous pending actions; the frontend must request a new evaluation.

Send `{ "status": "acknowledged" }`, `{ "status": "completed" }` or `{ "status": "dismissed" }` to the PATCH route. Suggested actions may be acknowledged or resolved directly; acknowledged actions may be completed/dismissed. Repeating the current status is idempotent. Other changes to completed, dismissed or superseded actions return `409 ACTION_NOT_PENDING`. Timestamps are set by the server and remain monotonic; clients cannot choose them.

GET returns `{ "actions": [...] }`, including historical statuses, ordered by creation time descending. Each action exposes `id`, `check_in_id`, `evaluation_key`, `action_code`, `reason_code`, `ruleset_version`, `forecast_snapshot`, `status`, `created_at`, `acknowledged_at` and `resolved_at`; it never exposes the session ID.

## Integração com o frontend

O servidor emite o cookie `mittus_session` assinado, com validade fixa de 30 dias. O frontend não precisa ler nem guardar seu valor. Sempre envie credenciais:

```ts
const API_URL = 'http://localhost:3001';

// Estabeleça a sessão antes de disparar outras requisições em paralelo.
const response = await fetch(`${API_URL}/api/check-ins?limit=7`, {
  credentials: 'include',
});
if (!response.ok) throw new Error('Could not load check-ins.');
const { items, today, timezone } = await response.json();

// Use today retornado pelo backend, sem derivar a data do relógio local.
const saved = await fetch(`${API_URL}/api/check-ins/${today}`, {
  method: 'PUT',
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    sleep_hours: 7.5,
    stress_level: 2,
    mood_level: 1,
    team_conflict_level: 1,
    fatigue: 3,
  }),
});
if (!saved.ok) throw new Error('Could not save check-in.');
// Após salvar, refaça a consulta do intervalo visível do calendário.
```

Configure `WEB_ORIGIN` para a origem real da interface. Cookies usam `SameSite=Lax`; frontend e API devem estar no mesmo site. As respostas não são armazenadas em cache compartilhado, e as consultas sempre usam a sessão validada no backend.

## Verificações

```bash
pnpm test
pnpm lint
pnpm build
```

### Integração com PostgreSQL isolado

HTTP and schema tests require a local PostgreSQL database named `mittus_test`, selected through `TEST_DATABASE_URL`. On its first run, the setup requires an empty public schema and replays the actual versioned SQL migrations, including lookup labels and the demo mission. It refuses to drop existing tables. Cleanup removes only records created by the tests.

Exemplo de banco local com Docker (execute a criação do contêiner uma vez):

```bash
docker run --name mittus-check-ins-test -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=mittus_test -p 127.0.0.1:55439:5432 -d postgres:17
```

Após o PostgreSQL ficar pronto:

```bash
TEST_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:55439/mittus_test' pnpm test:e2e
psql 'postgresql://postgres:postgres@127.0.0.1:55439/mittus_test' -v ON_ERROR_STOP=1 -f test/database/check-ins.sql
```

The setup emulates Supabase roles locally, then applies SQL files from `supabase/migrations` in filename order. Each file and its SHA-256 checksum are recorded atomically in the test-only `mittus_test_meta.migrations` table. Repeated runs preserve existing rows and skip unchanged files; changing an applied file requires a fresh isolated database. No `db push` or duplicate hand-maintained CHECK definitions are used.

Os testes cobrem gravação/substituição, concorrência, isolamento entre sessões, cookies adulterados e expirados, UTC, calendário, validação, CORS e a resposta padrão do NestJS para falhas inesperadas.

Action coverage includes real PostgreSQL persistence, concurrent retries, cross-session access, stale inference, immediate invalidation after edits, recovery from predictor failure, status conflicts, snapshot preservation and description-only changes. Forecast/config unit tests cover invalid probabilities/timestamps, network failure and timeout handling.

## Database schema synchronization

The authoritative SQL history is [`supabase/migrations`](../supabase/migrations):

| Migration | Purpose |
| --- | --- |
| `20261114000000_baseline_check_ins.sql` | Recovered baseline for the previously untracked check-in and option tables, including `description`, constraints, foreign keys, labels, grants and RLS. |
| `20261114192439_create_check_in_actions.sql` | Existing action table and integrity rules; unchanged. |
| `20261114220000_create_missions.sql` | Original SQL recovered from Supabase migration history, including mission tables, indices, access rules and demo seed data. |

The incomplete `backend/migrations/001` and `002` scripts have been retired; do not maintain a second migration sequence there. Prisma maps all ten public tables, including `Mission`, `MissionPlace`, `MissionLeg` and `SessionMission`. The partial unique `missions_single_demo_idx` remains SQL-only: it permits multiple ordinary missions but at most one demo. Do not replace it with a full-column Prisma `@unique`.

The Next.js `GET /api/mission-context` route now reads the registered mission using its existing `pg` reader. It shares `DATABASE_URL`, `SESSION_SECRET` and the host-visible `mittus_session` cookie with this backend; proxy both API surfaces through the same hostname in production. This backend continues to own check-ins/actions and cookie issuance, without a duplicate mission route or a mandatory mission link on check-ins. Option-table grants match the inspected database; RLS without public policies still filters those tables for public API roles. Health and mission tables remain server-only.

**Existing Supabase project:** both recovered migration outputs already exist there. The recovered baseline version is not an entry in the remote migration history, and must not be blindly applied or automatically marked as applied. No remote history repair, schema write or seed replay is performed by this synchronization. Reconcile that baseline explicitly before any future Supabase CLI deployment; starting the API requires no such operation.

**Fresh local database:** run the existing `test:e2e` command against an empty, isolated `mittus_test` database with an administrative local test user. The setup creates only missing local test roles and verifies the real SQL history through API and schema tests. It never resets a populated database or targets Supabase.
