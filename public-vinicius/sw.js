/**
 * sw.js — Service Worker que mantém o modelo WebLLM carregado entre as
 * páginas do site (index.php ⇄ filme.php).
 *
 * O modelo roda aqui dentro, e não na página: quando o usuário troca de
 * página, a página antiga é descartada, mas o Service Worker continua
 * vivo (as páginas mandam um sinal "keepAlive" a cada 10 s), então a nova
 * página só se reconecta ao modelo que já está na memória da GPU.
 *
 * Este arquivo não intercepta nenhuma requisição (sem evento "fetch").
 *
 * IMPORTANTE: mantenha a versão igual à de WEBLLM_CDN em js/ai.js.
 */
import { ServiceWorkerMLCEngineHandler } from "https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.85/+esm";

// Precisa ser criado já na avaliação inicial do script: o navegador pode
// reiniciar o Service Worker sem disparar "activate" de novo.
new ServiceWorkerMLCEngineHandler();

// Assume o controle das páginas logo na primeira visita (sem precisar recarregar)
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));
