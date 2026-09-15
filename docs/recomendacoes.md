# Recomendações em linguagem natural

## Fluxo e fidelidade

`POST /api/recommendations` recebe apenas `text`, `language` e a ação opcional `broaden`. O servidor usa o contrato de `AiRecommendationEngine` para interpretar o pedido, valida novamente a estrutura, consulta a TMDB e só então devolve títulos reais. Uma resposta inválida da IA encerra o fluxo: não existe fallback para títulos livres nem busca genérica silenciosa.

Gênero, período e tipo são restrições obrigatórias. Ordenação é preferência. Resultados relacionados a um título também passam pelos filtros obrigatórios. Quando não há quantidade suficiente, o servidor devolve menos itens e a interface oferece uma ação visível para remover gênero e período; esses filtros só são removidos depois dessa ação.

Referências são comparadas por título completo (inclusive títulos numéricos), ano, tipo e, quando fornecidos, identificadores. Mais de uma correspondência exata produz uma pergunta curta por ano ou tipo. Itens são deduplicados pelo par tipo/ID TMDB. Consultas de filme e série usam `Promise.allSettled`, de modo que o conjunto é aguardado e falhas parciais são informadas.

## Contrato de IA e WebLLM

O contrato compartilhado está em `lib/recommendation.ts`. `AiRecommendationEngine.interpret` é independente do provedor; hoje o adaptador do servidor usa a operação estruturada `interpret_request` da OpenAI. Um adaptador WebLLM futuro deve implementar a mesma interface e entregar exatamente `RecommendationCriteria` para a mesma validação local. Esta etapa não baixa modelos, não escolhe hardware e não implementa o ciclo de vida do WebLLM.

## Limitações observadas

- A TMDB é a fonte de candidatos e de relação entre obras; “relacionado” é um sinal do catálogo, não prova de semelhança artística.
- Humor, tom, ritmo, qualidade, idioma falado, país e disponibilidade não são tratados como restrições quando não há metadados verificáveis suficientes. A interpretação deve registrá-los como limitações em vez de prometer atendê-los.
- As justificativas enumeram somente fatos usados pelo filtro (relação do catálogo, ano, gênero e nota quando aplicável). A existência de uma justificativa não demonstra por si só a qualidade da recomendação.
- Metadados obrigatórios ausentes reprovam o candidato. Pôster e sinopse podem permanecer parciais sem impedir a exibição.
- A recomendação depende de `AI_CLOUD_ENABLED=true`, credenciais válidas da OpenAI e da TMDB e das proteções operacionais descritas em `docs/ia-nuvem.md`.
