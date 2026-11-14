# Features do MVP do Mittus

O Mittus é um app web em inglês para registrar indicadores de saúde, acompanhar a fadiga e visualizar o contexto da missão. A demo usa um astronauta fictício e dados de saúde simulados.

## Banco de dados

**Supabase PostgreSQL · projeto `mittus`.** Project Ref `ynxlbpmhdfaofcyamejf`. [Dashboard do projeto Mittus](https://supabase.com/dashboard/project/ynxlbpmhdfaofcyamejf)

**Tabela proposta:** `check_ins(id, session_id, check_in_date, sleep_hours, mood, fatigue)`. Há um registro por `(session_id, check_in_date)`. A API identifica a sessão pelo cookie emitido pelo servidor. O backend acessa o banco pela `DATABASE_URL`, configurada no servidor. Os arquivos de cenário, o modelo 3D e o modelo de previsão ficam na aplicação.

## Funcionalidades e dependências

As rotas abaixo são o contrato proposto para a API do Mittus.

| Feature | O que o astronauta faz | API e dependências | Tabela |
| --- | --- | --- | --- |
| **Check-in diário** | Registra horas de sono, humor e fadiga percebida. Pode corrigir o registro do dia. | `PUT /api/check-ins/{date}` recebe `sleep_hours`, `mood` e `fatigue`. Depende do formulário, da validação no backend e da sessão de demonstração. | Grava em `check_ins`. |
| **Corpo 3D e histórico** | Abre o painel de sono e fadiga pelo corpo 3D ou por um botão acessível pelo teclado. Vê os registros recentes em um gráfico. | `GET /api/check-ins?limit=7` carrega o histórico. Depende de um arquivo `.glb` com licença de uso e de uma visualização textual dos indicadores. | Lê `check_ins`. |
| **Previsão experimental de fadiga** | Vê a estimativa de relatar fadiga elevada no próximo check-in e quando o histórico ainda é insuficiente. | `GET /api/fatigue-forecast` chama o modelo do Rodrigo no backend e pode retornar `insufficient_history`. Depende do histórico e de dados sintéticos para treinar e testar o modelo. | Lê `check_ins`. |
| **Resumo inteligente do check-in** | Clica em **Generate insight** e vê, em inglês, o que mudou no último registro em relação ao histórico. | `POST /api/check-in-insights` usa os check-ins da sessão. O backend compara o último registro a até sete anteriores e fornece ao modelo os valores calculados. Se a IA falhar, o app exibe um texto básico com esses valores. | Lê `check_ins`. |
| **Contexto da missão** | Alterna entre **Em órbita** e **Retorno à Terra**. Vê posição, destino e temperatura simulada da cabine. | `GET /api/mission-context?phase=in_orbit` serve o cenário orbital. A posição da ISS pode vir de uma amostra datada do XML da NASA convertida pelo backend. `GET /api/mission-context?phase=return_to_earth` serve o cenário de retorno simulado. | Arquivos de configuração. |

## Fontes e integrações externas

- **NASA Human Research Program.** O material sobre sono insuficiente e horários irregulares fundamenta a escolha dos indicadores de sono e fadiga e a explicação no app. Registre o uso no campo **NASA Data**. [Pesquisa da NASA sobre sono](https://www.nasa.gov/reference/risk-from-inadequate-sleep-and-irregular-schedules/)
- **Trajetória da ISS.** `GET https://nasa-public-data.s3.amazonaws.com/iss-coords/current/ISS_OEM/ISS.OEM_J2K_EPH.xml`. O backend pode converter uma amostra de coordenadas orbitais em latitude, longitude e altitude e exibir o horário da posição. Cite o arquivo no campo **NASA Data** se entrar na demo. [Spot the Station da NASA](https://www.nasa.gov/spot-the-station/)
- **Modelo de linguagem do resumo.** Giulia escolhe o provedor com a equipe e integra a geração pelo backend. O modelo redige o resumo em inglês a partir dos fatos calculados. A declaração de uso de IA deve descrever o que a versão publicada executa.

## Validação para a entrega

- [ ] Salvar um check-in e recarregar a página para verificar o histórico. Confirmar que duas sessões independentes mantêm registros separados.
- [ ] Abrir o painel pelo corpo 3D e pelo botão textual. Ver a previsão experimental, mudar a fase e conferir a atualização do contexto da missão.
- [ ] Gerar o resumo inteligente e comparar os números com o histórico. Testar um único check-in, que ainda não permite comparação, e uma falha do provedor, que deve exibir o resumo básico.
- [ ] Na aba **Project**, explicar onde a fonte da NASA foi usada, identificar os dados simulados e citar o arquivo 3D, sua licença e as demais referências. Declarar o uso efetivo de IA e identificar os materiais gerados conforme o guia.
- [ ] Testar os links públicos do app e da demo em janela anônima. Mostrar o fluxo publicado em até sete slides em inglês ou em um vídeo de até 30 segundos, com legendas em inglês se o áudio estiver em outro idioma.

[Requisitos de entrega](REQUISITOS-DE-ENTREGA.md) · [Plano do MVP e responsáveis](docs/superpowers/plans/2026-11-14-mittus-mvp.md)
