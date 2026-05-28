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

## Como rodar localmente

1. Instale as dependências:

```bash
npm install
```

2. Crie o arquivo `.env.local` na raiz do projeto:

```env
OMDB_API_KEY=sua_chave_omdb
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
   - `OPENAI_API_KEY`
4. Faça o deploy.

## Observação de segurança

Nunca envie `.env` ou `.env.local` para o GitHub. Use apenas `.env.example` como modelo.
