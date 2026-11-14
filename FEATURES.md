# Features do MVP do Mittus

O Mittus é um app web em inglês para registrar indicadores de saúde, acompanhar a fadiga e visualizar o contexto da missão. A demo usa um astronauta fictício e dados de saúde simulados.

## Banco de dados

**Supabase PostgreSQL · projeto `mittus`.** Project Ref `ynxlbpmhdfaofcyamejf`. [Dashboard do projeto Mittus](https://supabase.com/dashboard/project/ynxlbpmhdfaofcyamejf)

- **`public.check_ins`** stores `id`, `session_id`, `check_in_date`, `sleep_hours`, `fatigue`, `mood_level`, `stress_level`, `team_conflict_level`, `description`, `created_at` and `updated_at`. The implemented API requires all numeric indicators; `description` is optional. There is one record per session and UTC date.
- **`public.check_in_actions`** guarda `id`, `check_in_id`, `evaluation_key`, `action_code`, `reason_code`, `ruleset_version`, `forecast_snapshot`, `status`, `created_at`, `acknowledged_at` e `resolved_at`. Cada ação aponta para o check-in que motivou a avaliação. [Migração SQL](supabase/migrations/20261114192439_create_check_in_actions.sql)

- **Mission registry** stores the departure and destination of each leg, not the craft's live position. [Model and decisions](docs/missions-database.md) · [SQL migration](supabase/migrations/20261114220000_create_missions.sql)
  - **`public.missions`** — mission identity, demo selection, launch identifiers and references.
  - **`public.mission_legs`** — one leg per phase, with departure place/time/source and destination place/description.
  - **`public.mission_places`** — reusable tracked objects or fixed coordinates with provenance and simulation flags.
  - **`public.session_missions`** — an optional mission link per signed demo session; unlinked sessions use the demo mission.

The server validates the session cookie and reads the database using `DATABASE_URL`. Action operations check `check_ins.session_id` through `check_in_id`; the mission-context route resolves `session_missions` using the same signed session. RLS is enabled and public API role grants are revoked on action and mission tables.

## Funcionalidades e dependências

As rotas abaixo são o contrato proposto para a API do Mittus.

**Implementation status:** daily check-ins and all three check-in action routes are implemented in NestJS/Prisma. Actions use the shared synthetic Eres model locally unless `FATIGUE_FORECAST_URL` explicitly selects an HTTP provider. The local model's `ok` result becomes `ready` at the action interface; the proposed standalone `GET /api/eres-forecast` route is not added here. Action explanations remain English rule text, not language-model output. See the [backend contract](backend/README.md#check-in-actions).

| Feature | O que o astronauta faz | API e dependências | Tabela |
| --- | --- | --- | --- |
| **Daily check-in** | Records sleep and all four numeric indicators, with an optional description. Can replace today's record. | `PUT /api/check-ins/{date}` requires `sleep_hours`, `fatigue`, `mood_level`, `stress_level` and `team_conflict_level`; `description` is optional. The backend returns the saved ID and fields. | Writes `check_ins`. |
| **Corpo 3D e histórico** | Abre o painel de sono e fadiga pelo corpo 3D ou por um botão acessível pelo teclado. Vê os registros recentes em um gráfico. | `GET /api/check-ins?limit=7` carrega o histórico. Depende de um arquivo `.glb` com licença de uso e de uma visualização textual dos indicadores. | Lê `check_ins`. |
| **Experimental fatigue forecast** | Sees the chance of reporting high fatigue at the next check-in, with an insufficient-history state. | Actions call `predictFatigue` from the shared `@mittus/fatigue-model` package with the full session history in chronological order. Fewer than three records return `insufficient_history`. Training data are synthetic; a standalone `GET /api/eres-forecast` remains proposed. | Reads `check_ins`. |
| **Resumo inteligente do check-in** | Clica em **Generate insight** e vê, em inglês, o que mudou no último registro em relação ao histórico. | `POST /api/check-in-insights` usa os check-ins da sessão. O backend compara o último registro a até sete anteriores e fornece ao modelo os valores calculados. Se a IA falhar, o app exibe um texto básico com esses valores. | Lê `check_ins`. |
| **Mission context** | Sees departure, current position, destination and cabin temperature for each phase. | The Next.js `GET /api/mission-context?phase=...` route uses the shared signed session and mission registry. Docked position comes from wheretheiss.at; free flight uses CelesTrak/SGP4 when `norad_id` exists, otherwise the labeled simulated point. Database failure uses the built-in demo; a missing phase returns `404`. | Reads mission tables; position responses identify live, snapshot, TLE or simulated provenance. |
| **Plano de mudança** | Vê a ação sugerida com base na previsão experimental. Pode reconhecer, concluir ou dispensar a ação. | `POST /api/check-ins/{id}/actions/evaluate` calcula e registra o plano. `GET /api/check-ins/{id}/actions` carrega as ações e o histórico. `PATCH /api/check-in-actions/{id}` recebe `status` e devolve a ação atualizada. | Lê `check_ins` e grava em `check_in_actions`. |

## Fluxo do plano de mudança

1. O usuário salva o check-in. O frontend atualiza o histórico e pede a avaliação do plano para o `id` do registro mais recente. Se uma correção no histórico alterar os dados da previsão, a API reavalia esse registro mais recente.
2. The backend calls the shared Eres predictor with the complete session history. Its `ok` result is adapted to `ready` for the persisted action contract, alongside `probability_high_fatigue`, `model_version` and UTC `predicted_at`. With fewer than three records, the plan is unavailable without inserting a fake probability. An explicit HTTP provider override may also report an unavailable prediction. The saved check-in remains visible.
3. Uma regra versionada escolhe `action_code` e `reason_code`. A demo usa `monitor` para acompanhar os registros e `recheck` para fazer um novo check-in. `contact_crew` e `contact_medical` ficam reservados para fluxos com procedimento da missão definido. A regra de demonstração usa uma previsão experimental, com dados sintéticos. As ações do MVP tratam do acompanhamento de registros e são exibidas para decisão do astronauta.
4. O backend monta `evaluation_key` com os dados e as revisões dos check-ins usados na previsão e as versões do modelo e das regras. Uma revisão muda quando os valores usados pelo preditor mudam. `forecast_snapshot` guarda `probability_high_fatigue` entre 0 e 1, `model_version` e `predicted_at`. A mesma avaliação reaproveita a ação registrada. Ao aceitar uma avaliação nova, o backend grava a ação e marca as anteriores pendentes do check-in como `superseded` na mesma transação. Se a previsão ficar indisponível após uma correção, a ação antiga sai do cartão atual. Serializar a atualização por sessão e conferir antes da gravação se a avaliação ainda corresponde ao histórico evita publicar uma sugestão atrasada.
5. A integração da Giulia recebe a ação já escolhida, o motivo e a saída da previsão. O modelo de linguagem explica o plano em inglês. A avaliação devolve a ação registrada e o texto para o cartão. O cartão usa o texto padrão se o provedor falhar ou ao recuperar a ação pela lista. As regras e os textos padrão ficam na configuração versionada do backend.
6. O astronauta altera o status de uma ação pendente. A API permite reconhecer, concluir ou dispensar e registra os horários no servidor. Ações concluídas, dispensadas ou substituídas ficam no histórico. Um pedido para alterar uma ação substituída pode retornar `409` e atualizar o cartão com a ação vigente.

As rotas de avaliação e de listagem identificam o check-in pelo UUID na URL e verificam a sessão. A avaliação recebe o contexto do servidor e pode aceitar um corpo vazio. A resposta inclui `status`, `action` quando disponível e `explanation` para a tela. A listagem pode devolver `actions` com os estados registrados. Para atualizar, o frontend envia, por exemplo, `{"status":"completed"}`. O servidor controla `acknowledged_at`, `resolved_at` e as transições a partir do estado atual. Um ID ausente ou de outra sessão recebe `404`.

## Responsáveis por funcionalidade

| Feature | Responsável | Entrega dos demais |
| --- | --- | --- |
| **Check-in diário** | **Luis** implementa validação, gravação por sessão e resposta da API. | **Gabi** define o formulário e os rótulos. **Luigi** implementa o formulário e conecta a rota. **Neves** configura o acesso ao banco no deploy. **Rodrigo** prepara registros fictícios. **Giulia** usa o mesmo exemplo para testar o resumo. |
| **Corpo 3D e histórico** | **Luigi** conecta o modelo 3D, o botão acessível e o gráfico à rota de histórico. | **Gabi** escolhe o modelo com licença e define o painel. **Luis** retorna dados ordenados por data. **Neves** verifica o carregamento do arquivo no deploy. **Rodrigo** valida os indicadores exibidos. **Giulia** confere a consistência com o resumo. |
| **Previsão experimental** | **Rodrigo** treina e avalia o modelo e entrega a função, a versão e exemplos de saída, incluindo histórico insuficiente. | **Luis** integra a função. **Neves** disponibiliza o modelo no ambiente publicado. **Luigi** exibe a previsão e seus estados. **Gabi** define como apresentar o caráter experimental. **Giulia** usa a saída já validada para explicar o plano. |
| **Resumo inteligente** | **Giulia** calcula as comparações do histórico e integra a geração do texto. | **Luis** fornece os check-ins da sessão e integra a rota. **Luigi** liga o botão ao cartão. **Gabi** revisa os textos e estados. **Neves** configura o provedor no servidor. **Rodrigo** fornece casos sintéticos de comparação. |
| **Contexto da missão** | **Neves** prepara as amostras da NASA e os dois cenários. | **Luis** serve o JSON da rota. **Luigi** implementa a seleção e atualiza o cartão. **Gabi** desenha os rótulos que identificam fonte, horário e dados simulados. |
| **Plano de mudança** | **Luis e Neves** implementam as regras, a gravação e as mudanças de status. | **Rodrigo** entrega previsões de teste e o contrato do modelo. **Giulia** gera a explicação e o texto de reserva. **Gabi** desenha o cartão e os estados. **Luigi** integra avaliação, lista e atualização de status. |

## Fontes e integrações externas

- **Indicadores de saúde.** O enunciado sugere pressão arterial, frequência cardíaca, glicemia, temperatura corporal, horas de sono e humor. O Mittus usa horas de sono e humor e adiciona fadiga percebida como autorrelato. O Human Research Program fundamenta a escolha de acompanhar sono e fadiga. Registre o uso no campo **NASA Data**. [Enunciado do desafio](https://www.spaceappschallenge.org/2026/challenges/health-monitoring-software/?tab=details) · [Pesquisa da NASA sobre sono](https://www.nasa.gov/reference/risk-from-inadequate-sleep-and-irregular-schedules/)
- **Posição da ISS.** `GET https://api.wheretheiss.at/v1/satellites/25544`. A API calcula a posição atual a partir do TLE mais recente da ISS (NORAD) e devolve latitude, longitude, altitude e horário. Não exige chave e pede no máximo uma requisição por segundo, por isso o backend reutiliza a resposta por 5 segundos. Cite o serviço em **Space Agency Partner Data and Other References**. [Where the ISS at? — documentação](https://wheretheiss.at/w/developer)
- **Ponto de partida.** `GET https://ll.thespacedevs.com/2.3.0/launches/{id}/` (Launch Library 2, The Space Devs) informa a plataforma de lançamento com latitude e longitude e o horário do lançamento. Esses dados são copiados uma vez para `mission_places` e `mission_legs` ao cadastrar a missão, porque o plano gratuito permite poucas chamadas por hora. Cite em **Other References**. [Documentação da Launch Library 2](https://ll.thespacedevs.com/docs/)
- **Posição da nave em voo livre.** `GET https://celestrak.org/NORAD/elements/gp.php?CATNR={norad}&FORMAT=json` devolve os elementos orbitais mais recentes da nave. O backend calcula a posição com o modelo SGP4 (`satellite.js`) e baixa os elementos no máximo a cada 2 horas, como a CelesTrak pede. Cite em **Other References**. [CelesTrak — GP data](https://celestrak.org/NORAD/documentation/gp-data-formats.php)
- **Temperatura da cabine.** O cenário orbital pode usar uma amostra histórica baixada na aba **Data Tables**. Guardar a medição com sua data e fonte no arquivo do cenário. [NASA — Environmental Data App](https://visualization.osdr.nasa.gov/eda/)
- **Modelo de linguagem do resumo e do plano.** A API proposta é Gemini `POST https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent`. Giulia confirma o provedor e a disponibilidade do modelo. Neves configura a chave no servidor. Enviar ao provedor os valores simulados necessários ao texto e a ação escolhida. A declaração de uso de IA deve descrever o que a versão publicada executa. [Referência da API Gemini](https://ai.google.dev/api)

## Validação para a entrega

- [ ] Salvar um check-in e recarregar a página para verificar o histórico. Confirmar que duas sessões independentes mantêm registros separados.
- [ ] Abrir o painel pelo corpo 3D e pelo botão textual. Ver a previsão experimental, mudar a fase e conferir a atualização do contexto da missão.
- [ ] Gerar o resumo inteligente e comparar os números com o histórico. Testar um único check-in, que ainda não permite comparação, e uma falha do provedor, que deve exibir o resumo básico.
- [ ] Repetir uma avaliação do plano e conferir que não duplica a ação. Corrigir um check-in, atualizar a previsão e verificar o histórico e a troca das ações pendentes. Conferir o isolamento por sessão ao consultar e alterar uma ação.
- [ ] Testar atualização de status, histórico insuficiente e falha no provedor de linguagem. O cartão deve exibir a ação registrada com o texto padrão se o provedor estiver indisponível.
- [ ] Na aba **Project**, explicar onde a fonte da NASA foi usada, identificar os dados simulados e citar o arquivo 3D, sua licença e as demais referências. Declarar o uso efetivo de IA e identificar os materiais gerados conforme o guia.
- [ ] Testar os links públicos do app e da demo em janela anônima. Mostrar o fluxo publicado em até sete slides em inglês ou em um vídeo de até 30 segundos, com legendas em inglês se o áudio estiver em outro idioma.

[Requisitos de entrega](REQUISITOS-DE-ENTREGA.md) · [Plano do MVP e responsáveis](docs/superpowers/plans/2026-11-14-mittus-mvp.md)
