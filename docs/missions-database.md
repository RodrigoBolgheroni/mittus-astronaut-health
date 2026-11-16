# Cadastro da missão — banco e API

The mission registry stores each leg's departure and destination, not the craft's current position. Docked position comes from wheretheiss.at. In free flight, a registered `norad_id` selects CelesTrak orbital elements propagated with SGP4; without them, the configured simulated point is labeled explicitly. See the [position source contract](mission-context-backend.md).

Migração: [`supabase/migrations/20261114220000_create_missions.sql`](../supabase/migrations/20261114220000_create_missions.sql)

## Tabelas

| Tabela | Papel | Colunas principais |
| --- | --- | --- |
| `missions` | Cadastro da missão. | `code` (único), `name`, `is_demo` (no máximo uma), `ll2_launch_id`, `norad_id`, `reference_label`, `reference_url`. |
| `mission_legs` | Um trecho por fase da API. Chave `(mission_id, phase)`. | `phase` (`in_orbit` \| `return_to_earth`), `departure_place_id`, `departure_at`, `departure_at_source`, `destination_place_id`, `destination_description`. |
| `mission_places` | Lugares reutilizáveis entre trechos. A ISS é destino de uma fase e partida da outra. | `code`, `name`, `label`, `kind`, `tracked_object`, `latitude`, `longitude`, `source`, `simulated`, `source_url`, `fetched_at`. |
| `session_missions` | Vínculo da sessão (cookie `mittus_session`) com a missão. `session_id` é a chave: uma missão por sessão. | `session_id`, `mission_id`. |

**Tipos de lugar.** `tracked` é um objeto que se move, com posição resolvida ao vivo pela API (hoje só `iss`). `fixed` é uma coordenada, como uma plataforma de lançamento ou uma zona de pouso. Uma restrição `CHECK` garante o formato: `tracked` exige `tracked_object` e não tem coordenadas nem `source`; `fixed` exige latitude, longitude e `source`.

**Fontes.** `source` indica a origem de uma coordenada fixa: `ll2` (Launch Library 2), `mission_registration` (anúncio oficial) ou `manual`. `simulated = true` identifica dados inventados para a demo. `departure_at_source` faz o mesmo para o horário de partida e é obrigatório quando há horário.

**Acesso.** As quatro tabelas têm RLS habilitado, sem policies, e sem privilégios para `anon` e `authenticated`. Só o servidor lê, pela `DATABASE_URL`.

## Missão demo

Baseada na NASA SpaceX Crew-12. Os dados do lançamento vêm da LL2, consultada uma vez ([lançamento `862b54e3…`](https://ll.thespacedevs.com/2.3.0/launches/862b54e3-7bf8-48e5-8cd1-d77257d5fde9/)).

| Fase | Partida | Destino |
| --- | --- | --- |
| `in_orbit` | Space Launch Complex 40, Cape Canaveral SFS (LL2), em 2026-02-13 10:15:56 UTC (LL2). | ISS (`tracked`). |
| `return_to_earth` | ISS (`tracked`), sem horário cadastrado. | Zona de pouso no Pacífico, na costa da Califórnia (`manual`, **simulada**). |

Para trocar a zona de pouso pela anunciada pela NASA, atualize o lugar `pacific_splashdown_california` com `source = 'mission_registration'`, `simulated = false` e o `source_url` do anúncio.

## Como a rota usa o cadastro

`GET /api/mission-context?phase=...` (em `web/`):

1. Valida o cookie `mittus_session` com o mesmo `SESSION_SECRET` do backend. Sem cookie válido, ou sem `SESSION_SECRET` configurado no `web`, a sessão é tratada como anônima.
2. Busca o trecho da fase na missão da sessão (`session_missions`) ou, se não houver vínculo, na missão demo.
3. Resolve as coordenadas: lugares `fixed` como estão no banco; `tracked` pela posição atual da ISS.
4. Se a missão da sessão não tiver aquela fase, responde `404 phase_not_in_mission`.
5. Se `DATABASE_URL` não estiver configurada ou o banco falhar, usa a missão demo embutida em `web/src/lib/mission/mission-registry.ts` (mesmos valores da migração) e responde `mission.registrySource = "built_in"`.

Novos blocos na resposta:

```json
{
  "mission": { "code": "demo-crew-12", "name": "Mittus demo mission", "registrySource": "database" },
  "departure": {
    "name": "Cape Canaveral",
    "departedAt": "2026-02-13T10:15:56.000Z",
    "departedAtSource": "ll2",
    "coordinates": {
      "latitude": 28.56194122, "longitude": -80.57735736, "asOf": null,
      "source": "ll2", "label": "Space Launch Complex 40, Cape Canaveral SFS, FL, USA",
      "sourceUrl": "https://ll.thespacedevs.com/2.3.0/launches/862b54e3-7bf8-48e5-8cd1-d77257d5fde9/"
    }
  }
}
```

`location`, `destination` e `cabinTemperature` mantêm o formato anterior. `destination.coordinates.source` passa a aceitar também `ll2` e `manual`, e `missionReference` pode ser `null`.

## Configuração do `web`

| Variável | Uso |
| --- | --- |
| `DATABASE_URL` | Mesma conexão do backend. Opcional: sem ela, a rota usa a missão demo embutida. |
| `SESSION_SECRET` | Mesmo valor do backend, para ler o cookie de sessão. Opcional: sem ela, toda requisição usa a missão demo. |

Both server runtimes must use the same `SESSION_SECRET` and database. The backend remains the only cookie issuer. Because its cookie is host-only, production routing must expose the backend session endpoints and the Next.js mission route on the same hostname (for example through a reverse proxy); sharing only a parent site does not share a host-only cookie. Localhost ports can differ. Without the shared cookie or secret, the web route intentionally shows the demo mission rather than a session-specific one.

Senhas com caracteres especiais (`@`, `#`, `/`, `%`) precisam estar codificadas na URL (`@` → `%40`, `#` → `%23`).

## Fora deste recorte

- **Backend Prisma.** The shared schema now maps `Mission`, `MissionPlace`, `MissionLeg` and `SessionMission`, alongside check-ins/actions. The mission-context endpoint remains in Next.js and uses its existing `pg` reader; do not create a duplicate NestJS route. Use the [canonical SQL history and replay guidance](../backend/README.md#database-schema-synchronization), not `prisma db push` or a reset against the shared Supabase project. The partial demo-mission unique index, CHECK constraints and RLS remain SQL-owned.
- **Session linking.** `POST /api/missions` now creates an ordinary mission, both legs and its `session_missions` link atomically. A valid shared signed session and JSON are required; browser Origin must match trusted configuration. Public callers cannot change the global demo mission.
