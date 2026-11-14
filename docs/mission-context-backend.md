# Contexto da missão: banco, backend e fontes externas

O astronauta abre o Mittus a bordo para registrar a saúde e acompanhar a missão. O cartão **Contexto da missão** mostra três pontos: **de onde o trecho parte**, **onde a nave está agora** e **para onde está indo**. Este documento descreve o banco, o backend e o contrato da API.

## De onde vem cada dado

| Dado | Origem | Guardado no banco? |
| --- | --- | --- |
| **Partida e destino fixos** (plataforma, zona de splashdown) | Launch Library 2 (The Space Devs) quando tem o dado, ou cadastro manual. A LL2 só dá o nome do splashdown ("Pacific Ocean"), sem coordenadas. | **Sim**, em `mission_places` (`kind = 'fixed'`). |
| **Partida ou destino na ISS** | Posição da ISS pela wheretheiss.at, ao vivo | O banco guarda só o lugar `tracked` (`tracked_object = 'iss'`). |
| **Posição atual: nave acoplada** (`in_orbit`) | Posição da ISS pela wheretheiss.at | Não. É consultada a cada requisição, com cache de 5 s. |
| **Posição atual: volta** (`return_to_earth`) | TLE da nave na CelesTrak + SGP4, se `missions.norad_id` estiver preenchido; senão, ponto simulado | Não. A regra fica em `mission-config.ts`. |

Todas as posições são **calculadas** a partir de dados públicos, com precisão de alguns km. A telemetria de bordo não é pública. O cartão deve sempre mostrar a fonte (`label`) e o horário (`asOf`).

## Banco de dados

A migração **[`supabase/migrations/20261114220000_create_missions.sql`](../supabase/migrations/20261114220000_create_missions.sql) já está aplicada** no projeto `mittus`. O arquivo do repositório é idêntico ao do histórico do Supabase: mesmo md5 (`5f5062e7…`) e 6269 bytes. **Não há migração nova a aplicar.**

### Tabelas

**`public.mission_places`**: lugares de partida e destino, reutilizáveis entre trechos.

| Coluna | Observação |
| --- | --- |
| `id` | `uuid` PK |
| `code` | Único, `^[a-z0-9_]+$`. Ex.: `cape_canaveral_slc_40`, `iss`, `pacific_splashdown_california` |
| `name`, `label` | Ex.: `Cape Canaveral` e `Space Launch Complex 40, Cape Canaveral SFS, FL, USA` |
| `kind` | `tracked` (move, resolvido ao vivo) ou `fixed` (coordenada) |
| `tracked_object` | `iss`. Obrigatório para `tracked` e nulo para `fixed`. |
| `latitude`, `longitude` | Obrigatórias para `fixed` e nulas para `tracked` |
| `source` | `ll2`, `mission_registration` ou `manual`. Obrigatória para `fixed`. |
| `simulated` | `true` para pontos inventados para a demo |
| `source_url`, `fetched_at` | De onde e quando o dado foi copiado |

A constraint `mission_places_kind_shape_check` garante o formato de cada `kind`.

**`public.missions`**

| Coluna | Observação |
| --- | --- |
| `id` | `uuid` PK |
| `code` | Único, `^[a-z0-9-]+$`. Ex.: `demo-crew-12` |
| `name` | Ex.: `Mittus demo mission` |
| `is_demo` | Missão usada por sessões sem missão própria. **No máximo uma** (`missions_single_demo_idx`). |
| `ll2_launch_id` | Lançamento na LL2 |
| `norad_id` | Número NORAD da nave. Quando preenchido, a volta usa o TLE da CelesTrak. |
| `reference_label`, `reference_url` | Página da missão |

**`public.mission_legs`**: um trecho por missão e fase. PK `(mission_id, phase)`.

| Coluna | Observação |
| --- | --- |
| `phase` | `in_orbit` ou `return_to_earth` |
| `departure_place_id` | FK para `mission_places` |
| `departure_at`, `departure_at_source` | Horário da partida e sua origem (`ll2`, `mission_registration`, `manual` ou `simulated`). Os dois são preenchidos juntos ou ficam nulos juntos. |
| `destination_place_id` | FK para `mission_places`, diferente da partida |
| `destination_description` | Texto do destino |

**`public.session_missions`**: `session_id uuid` (PK, o mesmo tipo de `check_ins.session_id`), `mission_id` (FK, `on delete cascade`) e `created_at`. Uma sessão sem registro usa a missão `is_demo`.

### Segurança e advisors

As quatro tabelas têm **RLS habilitado, sem policies e sem grants** para `public`, `anon` e `authenticated`. Só o backend acessa os dados, pela `DATABASE_URL`. Os advisors do Supabase só apontam `rls_enabled_no_policy`, de nível INFO, o que é esperado nesse modelo, e não acusam problemas de performance nas tabelas da missão. As FKs de `mission_legs` e `session_missions` têm índices.

### Dados cadastrados (missão demo)

| Fase | Partida | Destino |
| --- | --- | --- |
| `in_orbit` | `cape_canaveral_slc_40` (LL2), em 13/02/2026 10:15:56 UTC | `iss` (ao vivo) |
| `return_to_earth` | `iss` (ao vivo), sem horário | `pacific_splashdown_california`, `32.6, -118.2`, `manual`, **simulado** |

A missão `demo-crew-12` é baseada na NASA SpaceX Crew-12 e não tem `norad_id`.

### Observações sobre a migração aplicada

- O comentário do topo ainda diz que a posição vem do "NASA ISS OEM". Hoje ela vem da wheretheiss.at. É só um comentário e **não deve ser editado** numa migração já aplicada. Se quiserem corrigir, façam isso numa migração nova, com `comment on table`.
- A Crew-12 foi lançada em fevereiro. Quem está acoplada à ISS hoje é a Crew-13 (LL2 `18441371-8b2e-457c-afb5-1ec1b11ab630`, NORAD `100882`). A equipe decidiu manter a Crew-12. Para trocar, basta uma migração de dados que atualize `missions`, `mission_places` e `mission_legs`.
- Quando a NASA anunciar a zona real de retorno, atualizem o lugar com uma migração nova:

  ```sql
  update public.mission_places
  set latitude = <lat>, longitude = <lon>, label = '<nome da zona>',
      source = 'mission_registration', simulated = false,
      source_url = '<link do anúncio>', fetched_at = now()
  where code = 'pacific_splashdown_california';
  ```

## Backend

### O que fica no código (`web/src/lib/mission/mission-config.ts`)

O schema não guarda alguns dados, e eles ficam na config, por fase:

| Config | Valor |
| --- | --- |
| `VEHICLE` | `Crew Dragon` |
| `PHASE_STATUS` | `in_orbit`: `Docked to the ISS` · `return_to_earth`: `Undocked, descending to splashdown` |
| `CURRENT_POSITION` | `in_orbit`: ISS ao vivo · `return_to_earth`: TLE se `missions.norad_id` estiver preenchido, senão o ponto simulado `31.2, -121.4`, 180 km |
| `PHASE_LABELS`, `CABIN_TEMPERATURE` | Iguais aos de antes |

### Dependências (`web/package.json`)

| Pacote | Versão | Para quê |
| --- | --- | --- |
| `postgres` | `3.4.9` | Cliente do banco (postgres.js) |
| `satellite.js` | `7.1.0` | Modelo SGP4, para calcular a posição a partir do TLE/OMM |

### Arquivos

| Arquivo | O que faz |
| --- | --- |
| `web/src/lib/db.ts` | Cliente Postgres compartilhado (`getSql()`), lendo a `DATABASE_URL`. Usa `prepare: false`, que é compatível com o pooler de transação do Supabase. **Os endpoints de check-in podem reutilizar este cliente.** |
| `web/src/lib/mission/mission-repository.ts` | `loadMissionLeg(phase, sessionId)`. Faz duas consultas: (1) a missão da sessão ou a `is_demo`; (2) o trecho da fase com os dois lugares, via `to_jsonb`. Um `sessionId` que não seja UUID é tratado como sem sessão. |
| `web/src/lib/mission/mission-record.ts` | Tipos das linhas (`MissionRow`, `MissionLegRow`, `PlaceRow`) e conversão para o domínio, com validação do formato de cada lugar |
| `web/src/lib/mission/mission-context.ts` | Monta a resposta. O mesmo builder resolve a partida e o destino (ponto fixo ou ISS ao vivo). |
| `web/src/lib/mission/celestrak.ts` | OMM da CelesTrak (cache de 2 h por NORAD) + SGP4. Recusa elementos com mais de 3 dias. |
| `web/src/lib/mission/wheretheiss.ts` | Posição da ISS (cache de 5 s, timeout de 5 s, nova tentativa 30 s depois de uma falha) |
| `web/src/lib/mission/cached-source.ts` | Cache em memória com deduplicação e fallback, usado pelos dois clientes acima |
| `web/src/lib/mission/live-position.ts` | Instâncias compartilhadas dos dois leitores |
| `web/src/app/api/mission-context/route.ts` | Validação da fase e respostas de erro |

### Variáveis de ambiente e rede

- **`DATABASE_URL`** é obrigatória para esta rota. Sem ela, a rota responde `503 database_not_configured`.
- O servidor precisa de saída HTTPS para **`api.wheretheiss.at`** e **`celestrak.org`**. A LL2 não é chamada em tempo de execução.

### Sessão: falta ligar o cookie

A migração cita o cookie assinado `mittus_session`, mas **ele ainda não existe no código**. Por isso a rota chama `getMissionContext(phase, null)` e todos veem a missão demo. Quando a sessão existir, basta passar o UUID da sessão em `web/src/app/api/mission-context/route.ts`. A consulta já escolhe a missão de `session_missions` e cai para a demo quando a sessão não tem missão. Testei isso no banco: uma sessão ligada a outra missão devolve essa missão, e uma sessão sem registro ou `null` devolve `demo-crew-12`.

## Contrato da API

`GET /api/mission-context?phase=in_orbit|return_to_earth`

### Formato

- **`mission`**: `{ "code": "demo-crew-12", "name": "Mittus demo mission" }`.
- **`departure`**: `{ name, departedAt, departedAtSource, coordinates }`.
- **`destination`**: `{ name, description, coordinates, distanceKm }`.
- **`coordinates`** (da partida e do destino): `{ latitude, longitude, asOf, source, label, sourceUrl }`.
  - `source`: `ll2`, `mission_registration` ou `manual` para pontos fixos; `simulated` para pontos inventados; `wheretheiss` ou `wheretheiss_snapshot` para a ISS.
  - `asOf` só é preenchido quando o lugar é a ISS.
- **`location`** (posição atual): `{ latitude, longitude, altitudeKm, asOf, source, label, sourceUrl }`, com `source` igual a `wheretheiss`, `wheretheiss_snapshot`, `celestrak_tle` ou `simulated`.
- **`vehicle`** e **`status`** vêm da config. **`missionReference`** vem do banco e pode ser `null`.

### Respostas reais (servidor ligado a um Postgres local com a migração acima)

`phase=in_orbit`: parte de Cape Canaveral e vai para a ISS, onde a nave está.

```json
{
  "status": "Docked to the ISS",
  "vehicle": "Crew Dragon",
  "mission": { "code": "demo-crew-12", "name": "Mittus demo mission" },
  "departure": {
    "name": "Cape Canaveral",
    "departedAt": "2026-02-13T10:15:56.000Z",
    "departedAtSource": "ll2",
    "coordinates": {
      "latitude": 28.56194122, "longitude": -80.57735736, "asOf": null,
      "source": "ll2", "label": "Space Launch Complex 40, Cape Canaveral SFS, FL, USA",
      "sourceUrl": "https://ll.thespacedevs.com/2.3.0/launches/862b54e3-7bf8-48e5-8cd1-d77257d5fde9/"
    }
  },
  "location": {
    "latitude": 18.86, "longitude": -107.319, "altitudeKm": 413.8,
    "asOf": "2026-11-14T22:51:32.000Z",
    "source": "wheretheiss", "label": "Live ISS position from wheretheiss.at",
    "sourceUrl": "https://api.wheretheiss.at/v1/satellites/25544"
  },
  "destination": {
    "name": "International Space Station",
    "description": "Crew Dragon flew to the ISS and stays docked while the crew lives aboard.",
    "coordinates": {
      "latitude": 18.86, "longitude": -107.319, "asOf": "2026-11-14T22:51:32.000Z",
      "source": "wheretheiss", "label": "Live ISS position from wheretheiss.at",
      "sourceUrl": "https://api.wheretheiss.at/v1/satellites/25544"
    },
    "distanceKm": 0
  },
  "missionReference": {
    "label": "NASA SpaceX Crew-12 mission profile",
    "url": "https://www.nasa.gov/mission/nasas-spacex-crew-12/"
  }
}
```

`phase=return_to_earth`: parte da ISS ao vivo, com posição simulada na descida e destino simulado no Pacífico.

```json
{
  "status": "Undocked, descending to splashdown",
  "departure": {
    "name": "International Space Station", "departedAt": null, "departedAtSource": null,
    "coordinates": { "latitude": 18.86, "longitude": -107.319, "asOf": "2026-11-14T22:51:32.000Z", "source": "wheretheiss", "...": "..." }
  },
  "location": {
    "latitude": 31.2, "longitude": -121.4, "altitudeKm": 180, "asOf": null,
    "source": "simulated", "label": "Simulated: Point on the descent toward a Pacific splashdown zone.", "sourceUrl": null
  },
  "destination": {
    "name": "Earth",
    "description": "Crew Dragon brings the crew back to a splashdown zone in the ocean.",
    "coordinates": {
      "latitude": 32.6, "longitude": -118.2, "asOf": null,
      "source": "simulated", "label": "Simulated: Pacific splashdown zone off California", "sourceUrl": null
    },
    "distanceKm": 339.8
  }
}
```

Com `norad_id = 100882` preenchido no banco local, a mesma fase devolveu `location.source = "celestrak_tle"`, com a posição da Crew Dragon calculada pelo TLE dela.

### Respostas de erro

| Status | Corpo | Quando |
| --- | --- | --- |
| `400` | `{"error":"invalid_phase","allowed":[...]}` | `phase` inválida |
| `404` | `{"error":"mission_not_registered"}` | Não há missão demo, ou a missão não tem trecho para a fase |
| `503` | `{"error":"database_not_configured"}` | `DATABASE_URL` ausente |
| `503` | `{"error":"mission_context_unavailable"}` | Banco fora do ar, ou TLE indisponível na CelesTrak e sem cache |

Se a wheretheiss.at falhar, **não há erro**: a rota devolve a última posição boa ou o snapshot, com `source: "wheretheiss_snapshot"`.

## Submissão (campo NASA Data)

A posição da ISS e da nave vem de dados do NORAD (wheretheiss.at e CelesTrak), e a partida vem da LL2, um catálogo comunitário. Essas fontes **não contam como dados da NASA** e devem ser citadas em **Space Agency Partner Data and Other References**.

Continuam contando como recursos da NASA:

- a pesquisa do Human Research Program sobre sono e fadiga;
- o perfil da missão NASA SpaceX Crew-12;
- a temperatura da cabine (Environmental Data App). **`web/src/data/iss-cabin-temperature.json` ainda está vazio**, e preenchê-lo reforça o uso de dados da NASA.

## Como testar

```bash
cd web
npm test        # 23 testes: wheretheiss, CelesTrak/SGP4, cache, mapeamento das linhas, distância
npx tsc --noEmit -p . && npx eslint src && npx next build

# Postgres local descartável com a mesma migração do Supabase
docker run -d --rm --name mittus-pg -e POSTGRES_PASSWORD=test -p 54329:5432 postgres:17
echo "create role anon; create role authenticated;" | docker exec -i mittus-pg psql -U postgres
docker exec -i mittus-pg psql -U postgres < ../supabase/migrations/20261114220000_create_missions.sql

DATABASE_URL=postgres://postgres:test@localhost:54329/postgres npm run dev
curl "http://localhost:3000/api/mission-context?phase=in_orbit"
curl "http://localhost:3000/api/mission-context?phase=return_to_earth"
```

Para usar o banco real, defina `DATABASE_URL` com a connection string do projeto `mittus`. Ela fica em Project Settings → Database, de preferência a do pooler de transação.
