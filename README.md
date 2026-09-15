# SmartSeek AI

Protótipo web para TCC de Engenharia de Software.

O sistema permite buscar filmes e séries pela OMDb e usar IA generativa para gerar recomendações, resumos e respostas sobre conteúdos audiovisuais.

## Tecnologias

- Next.js
- TypeScript
- Tailwind CSS
- API Routes
- OMDb API
- OpenAI API
- WebLLM 0.2.85 (opcional, carregado sob demanda no navegador)

## Como rodar localmente

1. Instale as dependências:

```bash
npm install
```

2. Crie o arquivo `.env.local` na raiz do projeto:

```env
OMDB_API_KEY=sua_chave_omdb
TMDB_API_KEY=sua_chave_tmdb
OPENAI_API_KEY=sua_chave_openai
```

3. Rode o projeto:

```bash
npm run dev
```

4. Acesse:

```txt
http://localhost:3000
```

## Deploy na Vercel

1. Suba o projeto no GitHub.
2. Importe o repositório na Vercel.
3. Cadastre as variáveis de ambiente:
   - `OMDB_API_KEY`
   - `TMDB_API_KEY`
   - `OPENAI_API_KEY`
4. Faça o deploy.

## Observação de segurança

Nunca envie `.env` ou `.env.local` para o GitHub. Use apenas `.env.example` como modelo.

## IA local (WebLLM)

O visitante precisa abrir **IA: nuvem**, escolher um modelo e confirmar **Usar e baixar este modelo**. A biblioteca e os pesos não fazem parte do carregamento inicial. O modo local exige WebGPU, HTTPS (ou localhost), internet no primeiro download e espaço para o cache técnico administrado pelo navegador/WebLLM. Uma falha local é exibida e **não** troca silenciosamente para OpenAI.

A integração fixa a versão `0.2.85`, seguindo a [documentação oficial de uso](https://webllm.mlc.ai/docs/user/basic_usage.html) e os IDs do [`prebuiltAppConfig` oficial](https://github.com/mlc-ai/web-llm/blob/main/src/config.ts). Foram mantidos apenas os modelos menores conferidos nessa lista: `Llama-3.2-1B-Instruct-q4f16_1-MLC` (~0,9 GB) e `SmolLM2-1.7B-Instruct-q4f16_1-MLC` (~1,8 GB).

Os testes automatizados simulam seleção explícita, ausência de WebGPU, download interrompido, troca/liberação do mecanismo, inicialização duplicada e operações simultâneas. A execução real do modelo permanece **pendente em ambiente com GPU/WebGPU**, pois o ambiente de CI não disponibiliza GPU. As consultas OMDb/TMDB continuam exclusivamente nas rotas protegidas do backend; somente interpretação, resumo e conversa podem ocorrer localmente.
