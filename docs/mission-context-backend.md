# Contexto da missão: posição da nave e fontes externas

O cartão **Contexto da missão** mostra de onde o trecho parte, onde a nave está agora e para onde vai. O banco, as tabelas, a sessão e a missão demo estão em [Cadastro da missão — banco e API](missions-database.md). Este documento cobre a **posição**, que nunca é gravada: a rota consulta na hora.

## De onde vem cada posição

| Ponto | Fonte | Cache |
| --- | --- | --- |
| **ISS** (lugar `tracked`, partida ou destino) | `GET https://api.wheretheiss.at/v1/satellites/25544`, calculada a partir do TLE da ISS (NORAD) | 5 s por instância |
| **Nave acoplada** (`in_orbit`) | A mesma posição da ISS | 5 s |
| **Nave na volta** (`return_to_earth`) | Se `missions.norad_id` estiver preenchido: os elementos orbitais da nave em `GET https://celestrak.org/NORAD/elements/gp.php?CATNR={norad}&FORMAT=json`, propagados com SGP4 (`satellite.js`). Senão, o ponto simulado da config. | Elementos por 2 h, a posição é calculada a cada requisição |
| **Lugares `fixed`** (plataforma, splashdown) | Como estão em `mission_places` | — |

A missão demo `demo-crew-12` não tem `norad_id`, então a volta usa o ponto simulado (`31.2, -121.4`, 180 km). As posições são **calculadas** a partir de dados públicos, com precisão de alguns km. A telemetria de bordo não é pública, e o cartão deve sempre mostrar `label` e `asOf`.

## Configuração por fase (`web/src/lib/mission/mission-config.ts`)

| Fase | `position.kind` | Comportamento |
| --- | --- | --- |
| `in_orbit` | `iss_live` | A posição da nave é a da ISS |
| `return_to_earth` | `tle_or_simulated` | TLE da CelesTrak se a missão tiver `norad_id`. Sem `norad_id`, ou se a CelesTrak falhar, usa o ponto simulado guardado na própria config. |

## Falhas

Nenhuma falha de fonte externa derruba a rota:

- **wheretheiss.at fora do ar ou com `429`:** a rota devolve a última posição boa, com o `asOf` original, e espera 30 s antes de tentar de novo. Sem nenhuma posição boa, usa o snapshot `web/src/data/iss-position-snapshot.json`, com `source: "wheretheiss_snapshot"`.
- **CelesTrak fora do ar:** a rota continua usando os últimos elementos baixados, enquanto tiverem menos de 3 dias, e tenta de novo a cada 10 min. Sem elementos, usa o ponto simulado e registra um aviso no log.
- **Banco fora do ar:** a rota usa a missão demo embutida (ver [missions-database.md](missions-database.md)).

## Contrato (campos de posição)

- **`location.source`:** `wheretheiss`, `wheretheiss_snapshot`, `celestrak_tle` ou `simulated`.
- **`departure.coordinates.source` e `destination.coordinates.source`:** `wheretheiss` ou `wheretheiss_snapshot` para a ISS; `ll2`, `mission_registration` ou `manual` para pontos fixos; `simulated` para pontos inventados.
- **`sourceUrl`:** a URL da wheretheiss.at, a da CelesTrak com o NORAD ou a da origem do lugar fixo.

Antes, as fontes da ISS eram `nasa_iss_oem` e `nasa_iss_oem_snapshot`. O arquivo OEM da NASA e o parser dele foram removidos.

Exemplo de `location` em `in_orbit`:

```json
{
  "latitude": 18.86, "longitude": -107.319, "altitudeKm": 413.8,
  "asOf": "2026-11-14T22:51:32.000Z",
  "source": "wheretheiss", "label": "Live ISS position from wheretheiss.at",
  "sourceUrl": "https://api.wheretheiss.at/v1/satellites/25544"
}
```

Com `norad_id = 100882` (Crew Dragon da Crew-13, acoplada hoje), a volta devolveu `source: "celestrak_tle"`, com a posição a poucos km da ISS, como esperado para uma nave acoplada.

## Código

| Arquivo | O que faz |
| --- | --- |
| `web/src/lib/mission/wheretheiss.ts` | Valida a resposta da API e lê a posição da ISS (cache de 5 s, timeout de 5 s, fallback) |
| `web/src/lib/mission/celestrak.ts` | Baixa o OMM da nave e calcula a posição com SGP4. Recusa elementos com mais de 3 dias. |
| `web/src/lib/mission/cached-source.ts` | Cache em memória com deduplicação, espera depois de falha e última posição boa |
| `web/src/lib/mission/live-position.ts` | Instâncias compartilhadas dos dois leitores |
| `web/src/lib/mission/mission-context.ts` | Escolhe a fonte da posição por fase e monta a resposta |
| `web/src/lib/mission/mission-registry.ts`, `mission-store.ts` | Leem `missions.norad_id` junto com o trecho |

**Dependência nova:** `satellite.js@7.1.0`. **Rede:** o servidor precisa de saída HTTPS para `api.wheretheiss.at` e `celestrak.org`. Não há variáveis de ambiente novas.

## Submissão (campo NASA Data)

As posições vêm de dados do NORAD (wheretheiss.at e CelesTrak), e a partida vem da Launch Library 2, um catálogo comunitário. Essas fontes **não contam como dados da NASA** e devem ser citadas em **Space Agency Partner Data and Other References**.

Continuam contando como recursos da NASA a pesquisa do Human Research Program sobre sono e fadiga, o perfil da missão Crew-12 e a temperatura da cabine (Environmental Data App). **`web/src/data/iss-cabin-temperature.json` ainda está vazio**, e preenchê-lo reforça o uso de dados da NASA.

## Como testar

```bash
cd web
npm test        # wheretheiss, CelesTrak/SGP4, cache, cadastro, sessão e distância
npx tsc --noEmit -p . && npx eslint src && npx next build
npm run dev     # sem DATABASE_URL, a rota usa a missão demo embutida
curl "http://localhost:3000/api/mission-context?phase=in_orbit"         # location.source: "wheretheiss"
curl "http://localhost:3000/api/mission-context?phase=return_to_earth"  # location.source: "simulated"
```
