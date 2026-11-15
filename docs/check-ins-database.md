# Especificação de dados — Check-ins diários

**Status:** synchronized with the inspected Supabase schema; executable SQL lives in `supabase/migrations`.
**Banco:** PostgreSQL (Supabase)
**Objetivo:** armazenar um check-in de saúde por dia e por sessão de demonstração, permitindo consultar os registros em um calendário e alimentar o histórico de indicadores.

Os nomes de tabelas, colunas e valores técnicos estão em inglês. As informações usadas na demonstração são simuladas.

## Current model

Tabela: `check_ins`

| Coluna | Tipo PostgreSQL | Obrigatório | Descrição |
| --- | --- | --- | --- |
| `id` | `uuid` | Sim | Identificador único do registro, gerado pelo banco. |
| `session_id` | `uuid` | Sim | Identificador da sessão de demonstração à qual o registro pertence. |
| `check_in_date` | `date` | Sim | Dia de referência do check-in, sem horário. |
| `sleep_hours` | `numeric(4,2)` | Sim | Horas de sono informadas, de 0 a 24; aceita valores decimais. |
| `stress_level` | `smallint` | Sim | Nível de estresse, de 1 a 5. |
| `mood_level` | `smallint` | Sim | Estado emocional, de 1 a 5. |
| `team_conflict_level` | `smallint` | Sim | Nível de conflito na equipe, de 1 a 5. |
| `fatigue` | `smallint` | Sim | Nível de fadiga, de 1 a 7. |
| `description` | `text` | No | Optional free-text description, limited to 2,000 characters by the API. |
| `created_at` | `timestamptz` | Sim | Momento de criação do registro. |
| `updated_at` | `timestamptz` | Sim | Momento da última alteração; atualizado pelo backend. |

`sleep_hours` uses decimal hours: `7.50` means 7 hours and 30 minutes. The database and API enforce a range of 0–24 and a precision of two decimal places.

### Escalas de humor

Cada dimensão é registrada independentemente, usando números inteiros de 1 a 5. Os valores 2, 3 e 4 representam posições intermediárias entre os extremos.

| Coluna | Valor 1 | Valor 5 |
| --- | --- | --- |
| `stress_level` | Very calm | Very stressed |
| `mood_level` | Very happy / positive | Very sad / negative |
| `team_conflict_level` | No team conflict | High team conflict |

Em todas essas dimensões, valores maiores representam mais estresse, estado emocional mais negativo ou mais conflito, respectivamente.

### Escala de fadiga

| Valor | Descrição para a interface |
| --- | --- |
| 1 | Fully alert and wide awake |
| 2 | Very active and responsive, but not at peak alertness |
| 3 | Feeling well and ready |
| 4 | A little tired and less energetic |
| 5 | Moderately tired and fatigued |
| 6 | Extremely tired, with great difficulty concentrating |
| 7 | Completely exhausted and unable to function effectively |

## Regras de integridade e acesso

- Existe **no máximo um registro por `session_id` e `check_in_date`**. Uma nova gravação para a mesma combinação atualiza o registro existente.
- Todos os indicadores são obrigatórios no check-in completo. As restrições do banco também impedem valores fora das escalas definidas.
- A sessão é identificada pelo backend a partir do cookie emitido pelo servidor. O cliente não escolhe o `session_id` do registro; todas as consultas e alterações devem ser filtradas pela sessão identificada.
- Esta proposta não cria tabela de sessões nem chave estrangeira para `session_id`. O mecanismo de emissão e persistência das sessões deve ser definido na implementação; caso exista uma tabela de sessões, o relacionamento poderá ser acrescentado.
- `check_in_date` é uma data de calendário, não um instante. **UTC é a proposta** para determinar o dia atual; o fuso da missão ainda precisa ser confirmado.
- A permissão para criar ou alterar check-ins de datas passadas ainda está em aberto e deve ser aplicada pelo backend depois da decisão de produto.
- `created_at` e `updated_at` representam instantes. Nesta proposta, o backend deve atualizar `updated_at` em cada alteração; o banco não o atualiza automaticamente.

## Canonical SQL history

Use [`supabase/migrations`](../supabase/migrations), rather than copying a second table definition from this document:

- [`20261114000000_baseline_check_ins.sql`](../supabase/migrations/20261114000000_baseline_check_ins.sql) reconstructs check-ins and scale options, including descriptions, labels, foreign keys, constraints and access rules.
- [`20261114192439_create_check_in_actions.sql`](../supabase/migrations/20261114192439_create_check_in_actions.sql) adds the existing action history.
- [`20261114220000_create_missions.sql`](../supabase/migrations/20261114220000_create_missions.sql) is the recovered original mission registry migration.

The recovered baseline is for fresh databases, not a pending change to the existing Supabase project. See the [safe replay and history guidance](../backend/README.md#database-schema-synchronization). Prisma maps the complete public schema but cannot replace the SQL-only CHECK constraints, RLS, grants or partial demo-mission index.

## Exemplos de operações

### Criar ou atualizar um check-in

Os valores posicionais são parâmetros fornecidos pelo backend; `$1` é o identificador da sessão obtido no servidor.

```sql
INSERT INTO check_ins (
    session_id, check_in_date, sleep_hours, stress_level,
    mood_level, team_conflict_level, fatigue
)
VALUES ($1, $2, $3, $4, $5, $6, $7)
ON CONFLICT (session_id, check_in_date)
DO UPDATE SET
    sleep_hours = EXCLUDED.sleep_hours,
    stress_level = EXCLUDED.stress_level,
    mood_level = EXCLUDED.mood_level,
    team_conflict_level = EXCLUDED.team_conflict_level,
    fatigue = EXCLUDED.fatigue,
    updated_at = now()
RETURNING *;
```

### Consultar um mês no calendário

Usar intervalo com início inclusivo e fim exclusivo. Por exemplo, para novembro de 2026, `$2` é `2026-11-01` e `$3` é `2026-12-01`.

```sql
SELECT check_in_date, sleep_hours, stress_level, mood_level,
       team_conflict_level, fatigue
FROM check_ins
WHERE session_id = $1
  AND check_in_date >= $2
  AND check_in_date < $3
ORDER BY check_in_date;
```

Dias sem registro não aparecem no resultado; a interface pode representá-los como dias sem check-in.

## Exemplo de registro

| Campo | Valor fictício |
| --- | --- |
| `id` | `e14510ab-9d7f-4dc3-b166-10e77900ce21` |
| `session_id` | `2c03cc75-f572-4e85-a96d-26fa60dc8e1b` |
| `check_in_date` | `2026-11-14` |
| `sleep_hours` | `7.50` |
| `stress_level` | `2` |
| `mood_level` | `1` |
| `team_conflict_level` | `1` |
| `fatigue` | `3` |

## Confirmed implementation decisions

- All numeric indicators are required; only `description` is optional.
- The server uses UTC and accepts writes only for the current date.
- Signed anonymous demo cookies last 30 days; every health query filters by the validated session.
- Mission tables are mapped without adding a mandatory mission relationship to check-ins.
- The [API specification](specs/check-ins-spec.md) and [backend README](../backend/README.md) describe the implemented contracts and isolated migration replay.

