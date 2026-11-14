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

Para gerar um segredo local:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

O banco do Supabase já foi provisionado. Não é necessário executar `db push` para iniciar a API nele. As restrições SQL e o RLS existentes complementam o schema Prisma.

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

Os testes HTTP usam banco real e exigem `TEST_DATABASE_URL` apontando para um PostgreSQL **local** chamado `mittus_test`. O setup gera a estrutura nesse banco e insere as opções de escala. A limpeza remove apenas registros das sessões criadas pela suíte.

Exemplo de banco local com Docker (execute a criação do contêiner uma vez):

```bash
docker run --name mittus-check-ins-test -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=mittus_test -p 127.0.0.1:55439:5432 -d postgres:17
```

Após o PostgreSQL ficar pronto:

```bash
TEST_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:55439/mittus_test' pnpm test:e2e
psql 'postgresql://postgres:postgres@127.0.0.1:55439/mittus_test' -v ON_ERROR_STOP=1 -f test/database/check-ins.sql
```

O setup local reproduz as restrições das escalas e habilita RLS. Não constitui uma migração nem uma cópia completa das regras de `check_in_actions`, que não são usadas neste recorte.

Os testes cobrem gravação/substituição, concorrência, isolamento entre sessões, cookies adulterados e expirados, UTC, calendário, validação, CORS e a resposta padrão do NestJS para falhas inesperadas.
