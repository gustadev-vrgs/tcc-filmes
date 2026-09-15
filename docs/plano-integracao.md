# Plano de integração do AskFilmX

> Documento vivo. Toda etapa seguinte deve confirmar o estado real da aplicação e atualizar as seções **Concluído** e **Pendências**; itens planejados não devem ser descritos como integrações prontas.

## 1. Escopo definitivo

O AskFilmX é uma aplicação web bilíngue (PT-BR e inglês), responsiva, para busca de filmes e séries, recomendações e conteúdo assistido por IA. Não haverá cadastro, login, perfil, comentários públicos, avaliações de usuários nem banco de dados da aplicação.

- **Minha lista e preferências:** somente no `localStorage` do navegador. Os dados não sincronizam entre dispositivos e podem ser apagados pelo usuário/navegador.
- **Catálogo e metadados:** OMDb como busca/base atual; TMDB para dados complementares em etapa posterior.
- **IA:** OpenAI pelo backend Next.js. WebLLM pode ser oferecido depois como alternativa local opcional, com indicação explícita de download, compatibilidade e consumo de recursos.
- **Segurança:** chaves de OMDb, TMDB e OpenAI ficam em variáveis de ambiente do servidor e nunca são recebidas do navegador, gravadas no `localStorage`, exibidas em logs ou incluídas no bundle cliente.
- **Entrega:** Next.js na Vercel. Os arquivos PHP do protótipo são apenas fonte de análise e não fazem parte da aplicação publicada.

## 2. Diagnóstico da versão atual

### Aplicação principal

- Branch de trabalho: `work`, separada de `main`.
- Stack instalada pelo lockfile: Next.js 16.2.6, React/React DOM 19.2.6, TypeScript 6.0.3, Tailwind CSS 4.3.0, PostCSS 8.5.15 e Autoprefixer 10.5.0.
- Rotas: `/` (`app/page.tsx`) e `GET /api/omdb` (`app/api/omdb/route.ts`), com operações `search` e `details`.
- A página atual já oferece alternância PT-BR/EN, busca OMDb real, paginação, filtros filme/série e modal de detalhes. A preferência de idioma já persiste localmente.
- O formulário de recomendação por IA é apenas um estado informativo: não existe rota OpenAI e nenhum resultado de IA é apresentado. “Minha lista” no cabeçalho ainda é apenas um link para a seção de resultados.
- As rotas OMDb e TMDB protegem as respectivas chaves no servidor, restringem operações, validam parâmetros/respostas e aplicam cache técnico limitado a dados públicos. Não existe rota OpenAI nem integração WebLLM na aplicação Next.js.
- A configuração de imagens libera somente `m.media-amazon.com`; imagens TMDB exigirão configuração explícita quando forem integradas.

### Scripts, CI e testes

- Scripts npm: `dev`, `build`, `start`, `lint` e `test`. O script chamado `lint` executa somente `tsc --noEmit --incremental false`; os testes de catálogo usam o executor nativo do Node, sem dependência adicional.
- O workflow `.github/workflows/ci.yml` roda `npm ci`, verificação TypeScript e build em Node 22 para pushes e pull requests direcionados à `main`, além de execução manual.
- Não há código de autenticação ou banco na aplicação Next.js e as dependências instaladas não incluem SDK de autenticação ou banco. Portanto, não houve remoção especulativa de arquivos ou pacotes.

## 3. Inventário do protótipo `public-vinicius`

O protótipo é uma aplicação PHP independente. Ele não é servido automaticamente pela pasta `public` do Next.js e deve continuar apenas como referência temporária durante a migração.

### Caminho modular ativo do protótipo

- `index.php` + `filme.php`: entradas de página.
- `includes/layout-top.php` + `includes/layout-bottom.php`: estrutura comum; o rodapé carrega o módulo definido por cada página.
- `js/home.js`: busca, destaques e recomendação na página inicial.
- `js/movie.js`: detalhes, trailer, provedores, elenco, favorito e resumo.
- `js/common.js`, `js/ui.js`, `js/i18n.js`, `js/storage.js`, `js/api.js` e `js/ai.js`: infraestrutura compartilhada.
- `omdb.php`, `tmdb.php`, `youtube.php` e `openai.php`: proxies PHP dependentes de `includes/env.php`.
- `FilmesCss.css`, `logo.png`, placeholders e `sw.js`: aparência/ativos e suporte ao WebLLM.

### Arquivos antigos ou fora do caminho ativo

- `filmes.js` é a implementação monolítica anterior: nenhuma entrada PHP atual o carrega e suas funções foram repartidas nos módulos em `js/`.
- `filmes_2_0.html` somente redireciona para `index.php` e não implementa funcionalidade.
- Os PHP, o service worker e o CSS completo não são compatíveis para cópia direta ao Next.js. Devem ser usados para identificar comportamentos e decisões visuais, não publicados ou importados em bloco.

### Partes incompatíveis com o escopo definitivo

O protótipo permite salvar chaves pessoais de APIs no navegador e chamar alguns provedores de IA diretamente do cliente. Isso não será migrado: contraria a proteção de segredos e o backend Next.js obrigatório. Favoritos, idioma, região, aparência, layout e escolha do WebLLM são conceitos locais reaproveitáveis; seus formatos devem passar por validação e migração deliberada.

## 4. Estrutura alvo simples

```text
app/
  api/                 # handlers finos, validação de entrada e respostas HTTP
  page.tsx             # composição da experiência (decompor gradualmente)
components/            # interface reutilizável e acessível
lib/
  catalog.ts           # modelo normalizado e mapeamento de provedores
  validation.ts        # validação em limites externos
  local-storage.ts     # Minha lista e preferências, exclusivamente no cliente
  server/              # clientes OMDb/TMDB/OpenAI e configuração somente servidor
docs/plano-integracao.md
```

Nesta etapa, `lib/catalog.ts`, `lib/validation.ts` e `lib/local-storage.ts` iniciam essas fronteiras. A página já consome o modelo/mapeamento, valida a resposta de busca antes de renderizar e centraliza a preferência de idioma. A API de Minha lista está preparada com leitura tolerante a dados inválidos, deduplicação por IMDb ID e sem dependência de backend; a interface será conectada na etapa própria.

## 5. Sequência de implementação

1. **Preparação estrutural (concluída):** inventário, escopo, tipos de catálogo, validação da busca e módulo seguro de persistência local.
2. **Catálogo e detalhes (base concluída):** clientes server-only OMDb/TMDB, contratos normalizados, erros e operações de catálogo estão disponíveis. A apresentação dos complementos TMDB na tela de detalhes ainda precisa ser implementada com fallbacks.
3. **Minha lista:** conectar controles em cards/detalhes, criar visualização vazia/preenchida e sincronizar a mesma aba pelo evento de storage/custom event. Nunca enviar a lista ao servidor.
4. **IA hospedada (base concluída, interface pendente):** serviço e rota OpenAI validados, desativados por padrão e com operações restritas. Ainda é preciso transformar recomendações em títulos reais resolvidos pelo catálogo e conectá-las à interface; nunca exibir cards simulados.
5. **WebLLM opcional:** avaliar compatibilidade/browser, consentimento para download e fallback. Não bloquear a experiência principal nem armazenar chaves.
6. **Interface e i18n:** decompor a página em componentes, completar traduções, navegação/modal/acessibilidade e adequar os recursos escolhidos do protótipo à identidade atual sem importar seu CSS integral.
7. **Qualidade e entrega:** adicionar testes unitários para validação/storage, testes de rotas com serviços simulados, fluxo E2E essencial, documentação de ambiente e verificação em viewport desktop/celular.

## 6. Concluído

- [x] Inventário de versões, rotas, configuração, scripts, CI e cobertura de testes atual.
- [x] Mapeamento do caminho ativo e dos artefatos antigos do protótipo.
- [x] Confirmação de ausência de autenticação, banco e respectivas dependências na aplicação principal.
- [x] Separação inicial entre catálogo, validação e persistência local.
- [x] Validação defensiva da resposta de busca OMDb antes do mapeamento para a interface.
- [x] Centralização da preferência de idioma sem quebrar a chave já utilizada (`askfilm-language`).
- [x] Contrato local de Minha lista preparado e deduplicado; ainda não conectado visualmente.
- [x] Serviço OMDb HTTPS com timeout, busca paginada, filtro por tipo, detalhes, normalização, validação e erros classificados.
- [x] Serviço TMDB HTTPS restrito a busca, descoberta, relacionados, destaques, elenco, vídeos, provedores e resolução IMDb/TMDB.
- [x] Busca da interface conectada ao contrato normalizado, com filtro aplicado pelo provedor antes da paginação e cancelamento/descarte de respostas antigas.
- [x] Testes automatizados com provedores simulados para paginação, pôster ausente, erros, timeout, resposta inválida, dados parciais e pesquisas concorrentes.
- [x] Serviço OpenAI reutilizável e rota específica com prompts no servidor, Structured Outputs, allowlist de modelo, limites, timeout, cancelamento, uma única tentativa adicional e erros classificados.
- [x] Guia de ativação e regra de rate limit no Vercel Firewall, com limitações de IP/região/domínios e registro separado da validação real.

## 7. Pendências reais e dependências externas

- [ ] Reconfirmar online a documentação, disponibilidade/preço do modelo e regras/plano reais da Vercel; o ambiente de desenvolvimento bloqueou as consultas oficiais em 15/09/2026.
- [ ] Conectar a base de IA à interface e resolver recomendações pelo catálogo.
- [ ] Conectar Minha lista aos cards, ao modal e à navegação.
- [ ] Decidir e documentar se YouTube Data API é necessária; trailers TMDB devem ser o primeiro caminho.
- [ ] Avaliar WebLLM como melhoria opcional, não como requisito para concluir catálogo/IA hospedada.
- [ ] Migrar seletivamente detalhes, provedores, trailer, elenco e recursos de acessibilidade do protótipo.
- [ ] Confirmar as quotas, chaves válidas e variáveis da Vercel para OMDb, TMDB e OpenAI. Builds validam estrutura, mas não comprovam chamadas aos serviços sem credenciais.

## 8. Dependência e degradação dos provedores

| Recurso | Provedor necessário | Comportamento sem configuração ou dado complementar |
| --- | --- | --- |
| Busca por título, paginação e detalhes atuais | OMDb | A API responde `configuration` e HTTP 503; a interface mostra configuração pendente e não cria resultados. |
| Busca e descoberta por filtros, relacionados e destaques | TMDB | A API responde `configuration` e HTTP 503. A busca OMDb continua disponível independentemente. |
| Elenco com fotos, vídeos e onde assistir | TMDB | O título OMDb não é descartado. A seção complementar pode explicar que o recurso está indisponível ou que não houve correspondência. |
| Resolução de IDs | TMDB | IDs IMDb e TMDB permanecem campos separados. Uma resolução sem correspondência retorna `null`, sem invalidar o título original. |

Respostas normalizadas carregam `source`, `mediaType`, `ids.imdb`, `ids.tmdb` e o marcador `partial`. Pôster e sinopse ausentes são `null`, não títulos fictícios. A cache é a revalidação do `fetch` do Next.js (cinco minutos na OMDb de busca, uma hora em detalhes; dez minutos para listas TMDB, uma hora para complementos e um dia para resolução), sem banco ou cache de usuário.
