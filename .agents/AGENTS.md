# Handover do Projeto: Non-Uber (Dashboard Inteligente para Motoristas)

Este arquivo documenta o status atual do projeto, a arquitetura recém-implementada e, principalmente, **as regras e o padrão de exigência do usuário** que você (o próximo agente) deve obrigatoriamente seguir.

## 1. O que é o projeto?
Um painel inteligente rodando no navegador do celular (salvando estado em `localStorage`) que evoluiu de um monitor passivo para um **Assistente Ativo de Recomendação**. Ele consolida diversas "âncoras" de demanda na cidade (Cinema, Escolas, Hospitais, Lancha, Ônibus) e ajuda o motorista a decidir "Pra onde vou agora?" usando geolocalização e pontuação de eventos.

## 2. Status Atual da Implementação
Acabamos de finalizar as **Fases 1 e 2**:
- **Fase 1:** Criação do Motor de Recomendação Ativa. Usamos um cálculo simples com a fórmula de Haversine + velocidade média urbana (35km/h) para estimar tempo/distância até a âncora. *(Nota: O cálculo viaja pela água em alguns cenários. Isso é uma dívida técnica documentada. No futuro, será substituído por OSRM/Google Maps Directions).*
- **Fase 2:** Refatoração Estrutural (Taxonomia Única). Extirpamos o código legado de renderização que tratava Lanchas, Ônibus, e Cinemas de forma separada. Criamos o agregador `buildUnifiedAnchors()`, que unifica todos os eventos num array padronizado (`todasAncoras`) contendo { nome, local, tipo, horario_previsto, forca_sinal, etc }.

## 3. Próximo Passo: Fase 3
O próximo passo previsto (Fase 3) é o **Mapa de Calor de Destino**. Hoje o app lida bem com origens de fluxo (eventos). A Fase 3 tratará de mapear o destino dos passageiros, correlacionando o histórico de corridas (onde ele foi deixado) com os lugares que constam no `places-config.json` para prever rotas habituais.

---

## 🛑 REGRAS CRÍTICAS DE INTERAÇÃO COM O USUÁRIO 🛑

O usuário é extremamente técnico e exige um processo de revisão inquebrável. Siga essas regras sob pena de comprometer a relação de confiança:

1. **Aprovação Explícita é Lei:**
   Nunca inicie a geração ou alteração massiva de código baseando-se apenas num bypass automatizado ("Auto-Approve Policy" do IDE). Para mudanças de arquitetura (Fases), elabore o plano (`implementation_plan.md`) e **Aguarde o usuário aprovar**. Essa aprovação pode vir tanto por um clique seu no botão 'Approve/Proceed' da interface do IDE, quanto pela digitação da palavra 'Aprovado' no chat. Ausência de ação (só ler sem aprovar ou vetar) não significa aprovação.

2. **Apresente Dados Brutos, Não Apenas Resumos:**
   Se você executar um refactor ou um teste (como scraper de OCR, logs de extração de PDF, ou comparações), não confie apenas em apresentar uma tabela markdown resumida ou dizer "tudo correu bem". **O usuário exige ver o log bruto (stdout/stderr)** ou hashes/diffs exatos que provem que a alteração funcionou. (Ex: em refatores do DOM, validamos com snapshot byte-a-byte via Puppeteer/JSDOM).

3. **Não Mascare Estimativas:**
   Se você inferir ou chutar um dado (ex: tempo de travessia de lancha de +30 min), não esconda isso no código. Transforme em variável explícita e rotule na Interface ("Tempo estimado"). O usuário prefere saber o que está incompleto (Dívida Técnica) do que descobrir "dados mágicos" escondidos.

4. **Trato Rígido contra Regressões Visuais:**
   Refatorações no core de HTML/UI não devem alterar uma única vírgula do que é exibido sem que seja explicitamente combinado. Use scripts de snapshot (`scripts/test-refactor-snapshot.js`) para validar diffs entre pré-refactor e pós-refactor congelando relógios mockados.

Boa sorte na Fase 3!
