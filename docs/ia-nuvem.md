# IA na nuvem: contrato, proteção e ativação

## Estado da implementação

A rota `POST /api/ai` e o serviço compartilhado estão implementados, porém **desativados por padrão**. Eles não usam login, banco, cookie, `localStorage`, contador em memória nem cache compartilhado. A chave é lida exclusivamente de `OPENAI_API_KEY` no servidor. O catálogo e Minha lista continuam funcionando quando `AI_CLOUD_ENABLED=false`.

Não houve chamada real à OpenAI, publicação, contratação ou alteração de plano nesta etapa. Os testes usam `fetch` simulado. A validação real da hospedagem deve ser registrada separadamente usando o checklist ao final deste documento.

## Decisões confirmadas na documentação do provedor

Referências oficiais consultadas para o contrato (revalidar antes da ativação, pois APIs e disponibilidade comercial mudam):

- [Responses API — Create a response](https://platform.openai.com/docs/api-reference/responses/create): endpoint `POST /v1/responses`, `instructions`, `input`, `max_output_tokens`, estados de resposta e cancelamento da requisição HTTP.
- [Structured Outputs](https://platform.openai.com/docs/guides/structured-outputs): formato `text.format` com `type: json_schema`, `schema` e `strict: true`; a resposta ainda é validada localmente porque transporte e conteúdo podem falhar.
- [GPT-4.1 mini](https://platform.openai.com/docs/models/gpt-4.1-mini): compatibilidade com Responses API e Structured Outputs. Foi escolhido como único padrão permitido por ser o modelo menor da família, em vez de copiar um identificador do protótipo ou adotar um modelo de ponta mais caro.
- [Erros da API](https://platform.openai.com/docs/guides/error-codes/api-errors): tratamento de 429, indisponibilidade e erros de servidor.

Em 15/09/2026, a consulta automatizada a essas páginas no ambiente de desenvolvimento recebeu bloqueio de rede (401/403). Portanto, os links e o contrato foram preparados, mas a reconfirmação online na data da ativação permanece **pendência bloqueante para tornar a rota pública**, assim como a confirmação de preço e acesso do modelo na conta responsável. O bloqueio não impede contratos e testes locais.

## Contrato controlado pelo servidor

Operações aceitas (nenhuma URL, endpoint, modelo ou limite vem do cliente):

| Operação | Finalidade | Entrada principal | Contexto | Saída máx. |
| --- | --- | ---: | ---: | ---: |
| `interpret_request` | Extrair intenção, gêneros, humores e restrições | 2.000 caracteres | não aceito | 400 tokens |
| `justify` | Justificar uma recomendação com dados fornecidos | 1.500 | 3.000 caracteres | 350 tokens |
| `summarize` | Resumir conteúdo sem acrescentar fatos | 4.000 | não aceito | 450 tokens |
| `chat` | Conversa audiovisual limitada | 1.500 | 2.000 caracteres | 500 tokens |

O histórico existe somente em `chat`: no máximo 8 mensagens, 1.500 caracteres por mensagem e 8.000 caracteres no total. O corpo HTTP anunciado é limitado a 16 KiB. Cada execução realiza no máximo **duas** chamadas ao provedor; somente falha 5xx ou de transporte recebe uma tentativa adicional. 429, recusa, resposta incompleta, JSON inválido e timeout não são repetidos. O timeout é 12 segundos e aborta o `fetch`.

Os prompts, schemas JSON, endpoint, allowlist de modelo, histórico e todos os limites residem em `lib/server/ai.ts`. A rota retorna respostas `private, no-store`, não mantém estado e não registra chave, prompts ou conversas. Como não há cache de conversa, nada é compartilhado entre visitantes; o cliente precisa reenviar apenas o histórico permitido que desejar usar.

## Firewall da Vercel (preparar antes de ativar)

Referências oficiais: [Vercel Firewall](https://vercel.com/docs/vercel-firewall) e [Rate limiting rules](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting-rules). A disponibilidade, quantidade de regras e granularidade dependem do plano vigente; **não contratar nem fazer upgrade sem autorização**.

Não existe arquivo de aplicação que comprove uma regra ativa no firewall gerenciado. Uma variável como `FIREWALL_CONFIGURED=true` seria apenas uma declaração e deliberadamente não foi criada. Antes de mudar `AI_CLOUD_ENABLED` para `true`, uma pessoa com acesso ao projeto deve:

1. Abrir **Vercel Dashboard → projeto → Firewall**, revisar regras existentes e registrar projeto, plano, ambiente, data e responsável.
2. Confirmar na documentação atual que o plano oferece uma ação real de rate limit. Se não oferecer, manter a IA desativada e solicitar decisão — não substituir por contador em processo, CORS ou checagem de origem.
3. Criar uma regra específica para **método POST** e **caminho exatamente `/api/ai`**, antes de regras amplas conflitantes. Sugestão inicial conservadora: 10 requisições por 60 segundos por endereço IP, com ação de rate limit/bloqueio e resposta 429. Ajustar somente após observar métricas sem conteúdo de conversa.
4. Garantir que a regra alcance produção e todos os domínios/aliases que servem a implantação, inclusive domínio `vercel.app`, URLs alternativas e aliases de preview se estes puderem acessar uma implantação com a IA ligada. Restringir ou proteger acessos alternativos que escapem da política pretendida.
5. Testar a partir de fora da rede administrativa: sucessos dentro da janela, 429 ao exceder e recuperação depois da janela. Confirmar no painel em quais regiões/PoPs os contadores são mantidos; limites distribuídos podem permitir rajadas acima do valor nominal quando requisições percorrem regiões diferentes.
6. Só então configurar `OPENAI_API_KEY`, conferir acesso/preço do modelo permitido, definir `AI_CLOUD_ENABLED=true` no ambiente protegido e fazer uma implantação autorizada.

Rate limit por IP reduz abuso, mas não é quota individual: pessoas no mesmo Wi-Fi/NAT compartilham endereço e podem bloquear umas às outras; atacantes distribuídos usam vários IPs; proxies e mudanças de região podem alterar a contagem. CORS e `Origin` não impedem chamadas diretas e não são usados como proteção de consumo. Sem autenticação nem armazenamento compartilhado, essas limitações são deliberadas e precisam ser aceitas pelo responsável.

## Registro da validação real (preencher na hospedagem)

Mantenha este registro separado da suíte mockada e sem colar chaves, prompts, respostas ou conversas:

```text
Data/hora UTC:
Responsável:
Projeto e ambiente Vercel:
Plano e recurso de rate limit confirmado (link da documentação vigente):
Regras preexistentes revisadas:
Regra /api/ai (critério, janela, limite e ação):
Domínios/aliases e previews verificados:
Regiões/PoPs testados e comportamento de contador:
Resultado do teste de 429 e recuperação:
Modelo permitido/acesso/preço reconfirmados na OpenAI:
Teste mínimo real (sem conteúdo sensível):
Rollback testado com AI_CLOUD_ENABLED=false:
Pendências/aprovação para publicação:
```
