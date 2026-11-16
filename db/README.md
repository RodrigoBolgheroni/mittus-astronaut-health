# Carga de dados do Mittus

O `seed.mjs` carrega dados **simulados** e reproduzíveis nas tabelas `check_ins` e `check_in_actions` do banco Supabase do Mittus. As tabelas `*_options` já vêm preenchidas pela migração, e o script só as lê.

## O que é carregado

| Conjunto | `session_id` | Conteúdo |
| --- | --- | --- |
| **Astronauta da demo** | `00000000-0000-4000-8000-000000000001` | 21 check-ins escritos à mão: 10 dias de rotina em órbita, depois preparação para o retorno, com sono caindo e fadiga subindo até 5 (*Moderately tired*). O último check-in é de **ontem**, para a demo salvar o de hoje ao vivo. |
| **Astronautas sintéticos** | `00000000-0000-4000-8000-000000000100` em diante | 40 trajetórias de 30 dias, com cerca de 8% de dias faltando, nos perfis `stable`, `gradual_decline`, `pre_return_stress`, `acute_episodes` e `recovery`. Servem para treinar e testar a previsão de fadiga. |
| **Ações sugeridas** | — | Uma avaliação por check-in pela regra `seed-rules-v1`, com `forecast_snapshot` de uma heurística (`seed-heuristic-v1`) que usa apenas os check-ins até aquela data. |

Todo `session_id` da carga fica no prefixo `00000000-0000-4000-8000-`. O script só apaga ou substitui linhas desse prefixo, então os check-ins de sessões reais do app nunca são afetados. Com o mesmo `--seed` e a mesma `--end-date`, os dados gerados são sempre idênticos.

## Como rodar

```bash
cd db
npm install
node seed.mjs                                  # simulação: gera e mostra, sem conectar
node seed.mjs --env ../caminho/.env --check    # grava numa transação, valida e dá ROLLBACK
node seed.mjs --env ../caminho/.env --apply    # grava e confirma (substitui a carga anterior)
node seed.mjs --env ../caminho/.env --reset    # remove só as linhas da carga
```

Opções: `--sessions N` (0 = só a demo), `--days N`, `--end-date AAAA-MM-DD`, `--seed N` e `--csv arquivo.csv`, que exporta os check-ins com o perfil de cada sessão para o treino do modelo.

A conexão vem de `DATABASE_URL`, pela variável de ambiente ou pelo `.env` indicado em `--env`. Prefira `--env` a `node --env-file`, porque o parser do Node corta valores sem aspas no caractere `#`.

## Escalas

Em todas as escalas, um valor mais alto indica uma situação pior: `fatigue` vai de 1 a 7, e `mood_level`, `stress_level` e `team_conflict_level` vão de 1 a 5. A carga considera **fadiga elevada** a partir de `fatigue >= 5`.
