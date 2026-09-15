/**
 * ui.js — pequenos utilitários de interface usados por todas as páginas:
 * pôster, loader, toasts, efeito de digitação, dropdown customizado e
 * rolagem por setas das fileiras horizontais.
 */

export const escapeAttr = value => String(value ?? "")
  .replace(/&/g, "&amp;")
  .replace(/"/g, "&quot;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;");

/* ================================================
   PÔSTER — moldura "fotograma de 35mm" + imagem fixa
   de fallback quando o filme/série não tem pôster
   ================================================ */
export const POSTER_PLACEHOLDER = "poster-placeholder.svg";

export function posterFrame(filme) {
  const hasPoster = !!(filme.Poster && filme.Poster !== "N/A");
  const src   = hasPoster ? filme.Poster : POSTER_PLACEHOLDER;
  const cls   = hasPoster ? "poster-frame" : "poster-frame no-poster";
  const title = (filme.Title || "").replace(/"/g, "&quot;");
  return `<div class="${cls}">
    <img src="${src}" alt="${title}" loading="lazy"
         onload="this.classList.add('loaded')"
         onerror="this.onerror=null; this.src='${POSTER_PLACEHOLDER}'; this.closest('.poster-frame').classList.add('no-poster');" />
  </div>`;
}

/* ================================================
   LOADER
   ================================================ */
export const showLoader = () => { const l = document.getElementById("loader"); if (l) l.style.display = "block"; };
export const hideLoader = () => { const l = document.getElementById("loader"); if (l) l.style.display = "none"; };

/* ================================================
   EFEITO DE DIGITAÇÃO (texto puro — sem HTML)
   ================================================ */
export function typeWriter(element, text, delay = 20) {
  element.textContent = "";
  let i = 0;
  const interval = setInterval(() => {
    element.textContent += text.charAt(i);
    i++;
    if (i >= text.length) clearInterval(interval);
  }, delay);
}

/* ================================================
   NOTIFICAÇÕES (toast) — aviso não bloqueante
   ================================================ */
export function showToast(message, type = "error", duration = 5500) {
  let container = document.getElementById("toastContainer");
  if (!container) {
    container = document.createElement("div");
    container.id = "toastContainer";
    container.setAttribute("aria-live", "polite");
    document.body.appendChild(container);
  }

  const icons = {
    error:   "fa-circle-exclamation",
    warning: "fa-triangle-exclamation",
    info:    "fa-circle-info",
    success: "fa-circle-check"
  };

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <i class="fa-solid ${icons[type] || icons.info} toast-icon"></i>
    <span class="toast-message"></span>
    <button type="button" class="toast-close" aria-label="Close"><i class="fa-solid fa-xmark"></i></button>
  `;
  toast.querySelector(".toast-message").textContent = message; // texto seguro (sem HTML injetado)
  container.appendChild(toast);

  const remove = () => {
    toast.classList.add("toast-out");
    setTimeout(() => toast.remove(), 280);
  };
  const timer = setTimeout(remove, duration);
  toast.querySelector(".toast-close").onclick = () => { clearTimeout(timer); remove(); };
}

/* ================================================
   DROPDOWN CUSTOMIZADO — usado no lugar de <select> nativo, pra manter a
   lista de opções com a cara do resto do site. Pinta o rótulo do botão e
   o item marcado como selecionado.
   ================================================ */
export function renderCustomSelect(btnId, listId, items, selectedValue, onChange) {
  const btn  = document.getElementById(btnId);
  const list = document.getElementById(listId);
  if (!btn || !list) return;

  const labelEl = btn.querySelector(".custom-select-label");

  const paint = value => {
    const current = items.find(it => it.value === value);
    if (labelEl) labelEl.textContent = current ? current.label : (items[0]?.label || "");
    list.querySelectorAll("button[data-value]").forEach(b =>
      b.classList.toggle("selected", b.dataset.value === value));
  };

  list.innerHTML = items.map(it => `
    <button type="button" data-value="${it.value}">
      <span>${it.label}</span>${it.meta ? `<span class="csopt-meta">${it.meta}</span>` : ""}
    </button>
  `).join("");

  paint(selectedValue);

  list.querySelectorAll("button[data-value]").forEach(optBtn => {
    optBtn.onclick = () => {
      paint(optBtn.dataset.value);
      onChange(optBtn.dataset.value);
    };
  });
}

/* Navegação por setas em fileiras horizontais (Poster Row, Destaques da
   Semana...); anda uma "página" de itens por clique; ao passar do último
   item volta pro primeiro (e vice-versa), em vez de travar no fim. */
export function scrollElByPage(el, direction) {
  if (!el) return;
  const maxScroll = el.scrollWidth - el.clientWidth;
  if (maxScroll <= 1) return; // não há o que rolar

  const epsilon   = 4;
  const pageWidth = el.clientWidth * 0.9;

  if (direction > 0) {
    if (el.scrollLeft >= maxScroll - epsilon) {
      el.scrollTo({ left: 0, behavior: "smooth" });
    } else {
      el.scrollBy({ left: pageWidth, behavior: "smooth" });
    }
  } else {
    if (el.scrollLeft <= epsilon) {
      el.scrollTo({ left: maxScroll, behavior: "smooth" });
    } else {
      el.scrollBy({ left: -pageWidth, behavior: "smooth" });
    }
  }
}
