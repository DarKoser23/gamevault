/* desktop.js — version PC. Dans un navigateur normal, ce fichier ne fait rien. */
(function () {
  const T = window.__TAURI__;
  if (!T || !T.core || !T.window) return;
  const core = T.core, win = T.window.getCurrentWindow();
  const APP_TITLE = "Orb";
  const NAV_SELECTOR = "nav"; // ← ta barre d'onglets (elle devient la barre latérale)
  const PROVIDERS = ["gemini", "groq", "openai", "anthropic", "openrouter"];
  const root = document.documentElement;
  root.classList.add("desktop");

  // ---------- réseau sans CORS : tout passe par Rust ----------
  function deskFetch(input, opts = {}) {
    const signal = opts.signal;
    const abortErr = () => new DOMException("La requête a été annulée.", "AbortError");
    if (signal && signal.aborted) return Promise.reject(abortErr());
    const id = crypto.getRandomValues(new Uint32Array(1))[0];
    const enc = new TextEncoder();
    let ctrl, started = false, finished = false;
    const stop = () => { if (!finished) { finished = true; core.invoke("net_abort", { id }).catch(() => {}); } };
    const body = new ReadableStream({ start(c) { ctrl = c; }, cancel() { stop(); } });
    return new Promise((resolve, reject) => {
      const fail = (err) => { finished = true; if (!started) reject(err); else { try { ctrl.error(err); } catch (x) {} } };
      if (signal) signal.addEventListener("abort", () => { stop(); fail(abortErr()); }, { once: true });
      const ch = new core.Channel();
      ch.onmessage = (m) => {
        if (m.event === "start") {
          started = true;
          const s = m.data.status;
          resolve(new Response([204, 205, 304].includes(s) ? null : body, { status: s, headers: m.data.headers }));
        } else if (m.event === "chunk") { try { ctrl.enqueue(enc.encode(m.data.text)); } catch (x) {} }
        else if (m.event === "end") { finished = true; try { ctrl.close(); } catch (x) {} }
        else if (m.event === "error") fail(new TypeError("Failed to fetch (" + m.data.message + ")"));
      };
      const headers = {};
      new Headers(opts.headers || {}).forEach((v, k) => { headers[k] = v; });
      core.invoke("net_fetch", {
        id, url: String(input), method: (opts.method || "GET").toUpperCase(), headers,
        body: opts.body == null ? null : String(opts.body), onEvent: ch,
      }).catch((err) => fail(new TypeError("Failed to fetch (" + err + ")")));
    });
  }

  // ---------- clés API dans le coffre Windows ----------
  let saved = {};
  const DESK = { fetch: deskFetch, keys: {} };
  async function persist(next) {
    for (const p of PROVIDERS) {
      const v = next[p] || "";
      if (v === (saved[p] || "")) continue;
      try { await core.invoke("secret_set", { name: p, value: v }); if (v) saved[p] = v; else delete saved[p]; }
      catch (e) { console.error("Coffre Windows :", e); }
    }
  }
  const clean = (keys) => { const o = {}; for (const p of PROVIDERS) { const v = String((keys || {})[p] || "").trim(); if (v) o[p] = v; } return o; };
  DESK.ready = (async () => {
    for (const p of PROVIDERS) {
      try { const v = await core.invoke("secret_get", { name: p }); if (v) saved[p] = v; } catch (e) { console.warn(e); }
    }
    DESK.keys = { ...saved };
    try { // déplace les anciennes clés du localStorage vers le coffre
      const raw = JSON.parse(localStorage.getItem("orb_ai_cfg") || "{}");
      if (raw && raw.keys && Object.keys(raw.keys).length) {
        DESK.keys = clean({ ...raw.keys, ...saved });
        await persist(DESK.keys);
        raw.keys = {};
        localStorage.setItem("orb_ai_cfg", JSON.stringify(raw));
      }
    } catch (e) {}
  })();
  DESK.saveKeys = (keys) => { const next = clean(keys); DESK.keys = next; return DESK.ready.then(() => persist(next)); };
  window.DESK = DESK;

  // ---------- liens externes → navigateur ----------
  document.addEventListener("click", (e) => {
    const a = e.target.closest && e.target.closest("a[href]");
    if (!a) return;
    let u; try { u = new URL(a.href, location.href); } catch (x) { return; }
    if (!/^https?:$/.test(u.protocol) || (u.host === location.host && a.target !== "_blank")) return;
    e.preventDefault();
    core.invoke("open_external", { url: u.href });
  }, true);

  // ---------- plein écran et raccourcis ----------
  async function toggleFs() {
    const fs = !(await win.isFullscreen());
    await win.setFullscreen(fs);
    root.classList.toggle("fullscreen", fs);
  }
  const navItems = () => { const n = document.querySelector(NAV_SELECTOR); return n ? [...n.children] : []; };
  addEventListener("keydown", (e) => {
    if (e.key === "F11") { e.preventDefault(); toggleFs(); return; }
    if (e.key === "Escape" && root.classList.contains("fullscreen") && !document.querySelector(".aip-ov")) { toggleFs(); return; }
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const k = e.key.toLowerCase();
    if (/^[1-9]$/.test(k)) { const it = navItems()[+k - 1]; if (it) { e.preventDefault(); it.click(); } }
    else if (k === "f" || k === "k") {
      const s = document.querySelector('input[type="search"], input[placeholder*="echerch" i]');
      if (s) { e.preventDefault(); s.focus(); s.select(); }
    } else if (k === "n" && typeof window.newConversation === "function") { e.preventDefault(); window.newConversation(); }
  });

  // ---------- interface PC ----------
  const ICON = {
    min: '<svg width="10" height="10" viewBox="0 0 10 10"><path d="M0 5.5h10" stroke="currentColor"/></svg>',
    max: '<svg width="10" height="10" viewBox="0 0 10 10"><rect x=".5" y=".5" width="9" height="9" fill="none" stroke="currentColor"/></svg>',
    restore: '<svg width="10" height="10" viewBox="0 0 10 10"><path d="M2.5 2.5V.5h7v7h-2M.5 2.5h7v7h-7z" fill="none" stroke="currentColor"/></svg>',
    close: '<svg width="10" height="10" viewBox="0 0 10 10"><path d="M0 0l10 10M10 0L0 10" stroke="currentColor"/></svg>',
  };
  const CSS = `
html.desktop{--desk-bar:36px;--desk-side:232px}
html.desktop body{padding-top:var(--desk-bar)!important;overscroll-behavior:none;-webkit-tap-highlight-color:transparent}
html.desktop.has-side body{padding-left:var(--desk-side)!important}
html.desktop.fullscreen{--desk-bar:0px}
html.desktop.fullscreen .desk-bar{display:none}
.desk-bar{position:fixed;top:0;left:0;right:0;height:var(--desk-bar);z-index:10000;display:flex;align-items:stretch;background:var(--o-deep,#04272A);border-bottom:1px solid var(--o-line,rgba(215,232,228,.1));color:var(--o-mint,#D7E8E4);user-select:none}
.desk-title{flex:1;display:flex;align-items:center;gap:10px;padding-left:14px;font-size:12.5px;letter-spacing:.03em;opacity:.85}
.desk-title *{pointer-events:none}
.desk-logo{width:14px;height:14px;border-radius:50%;background:radial-gradient(circle at 35% 30%,var(--o-coral,#FF6B5E),var(--o-teal,#17A398))}
.desk-ctl{display:flex}
.desk-ctl button{width:46px;border:0;background:none;color:inherit;display:grid;place-items:center;cursor:default;transition:background .12s}
.desk-ctl button:hover{background:rgba(215,232,228,.08)}
.desk-ctl button.x:hover{background:#C42B1C;color:#fff}
html.desktop .desk-nav{position:fixed!important;top:var(--desk-bar)!important;left:0!important;bottom:0!important;right:auto!important;width:var(--desk-side)!important;height:auto!important;max-width:none!important;margin:0!important;display:flex!important;flex-direction:column!important;justify-content:flex-start!important;align-items:stretch!important;gap:4px!important;padding:14px 10px!important;border:0!important;border-right:1px solid var(--o-line,rgba(215,232,228,.1))!important;border-radius:0!important;background:var(--o-deep,#04272A)!important;transform:none!important;z-index:50!important;overflow-y:auto!important}
html.desktop .desk-nav>*{flex:0 0 auto!important;width:auto!important;display:flex!important;flex-direction:row!important;align-items:center!important;justify-content:flex-start!important;gap:12px!important;padding:10px 12px!important;border-radius:10px!important;font-size:14px!important;transition:background .15s}
html.desktop .desk-nav>*:hover{background:rgba(215,232,228,.06)}
html.desktop .desk-nav>[data-kbd]::after{content:attr(data-kbd);margin-left:auto;font-size:11px;opacity:0;transition:opacity .15s}
html.desktop .desk-nav>[data-kbd]:hover::after{opacity:.45}
html.desktop ::-webkit-scrollbar{width:12px;height:12px}
html.desktop ::-webkit-scrollbar-track{background:transparent}
html.desktop ::-webkit-scrollbar-thumb{background:rgba(215,232,228,.18);border-radius:8px;border:3px solid transparent;background-clip:padding-box}
html.desktop ::-webkit-scrollbar-thumb:hover{background-color:rgba(215,232,228,.32)}
html.desktop :focus-visible{outline:2px solid var(--o-teal,#17A398);outline-offset:2px}
html.desktop img{-webkit-user-drag:none}
html.desktop button,html.desktop [onclick]{cursor:pointer}
html.desktop .aip-ov{top:var(--desk-bar)}`;

  function ready(fn) { document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", fn) : fn(); }
  ready(() => {
    document.head.append(Object.assign(document.createElement("style"), { textContent: CSS }));
    const bar = document.createElement("div");
    bar.className = "desk-bar";
    bar.setAttribute("data-tauri-drag-region", "");
    bar.innerHTML = `<div class="desk-title" data-tauri-drag-region><span class="desk-logo"></span><span>${APP_TITLE}</span></div>
      <div class="desk-ctl"><button data-a="min" title="Réduire">${ICON.min}</button><button data-a="max" title="Agrandir">${ICON.max}</button><button data-a="close" class="x" title="Fermer">${ICON.close}</button></div>`;
    bar.addEventListener("click", (e) => {
      const b = e.target.closest("button[data-a]");
      if (!b) return;
      if (b.dataset.a === "min") win.minimize();
      else if (b.dataset.a === "max") win.toggleMaximize();
      else win.close();
    });
    const maxBtn = bar.querySelector('[data-a="max"]');
    const syncMax = async () => {
      const m = await win.isMaximized();
      maxBtn.innerHTML = m ? ICON.restore : ICON.max;
      maxBtn.title = m ? "Restaurer" : "Agrandir";
    };
    syncMax();
    win.onResized(syncMax);

    const mark = () => {
      if (!bar.isConnected) document.body.prepend(bar);
      const nav = document.querySelector(NAV_SELECTOR);
      root.classList.toggle("has-side", !!nav);
      if (!nav) return;
      nav.classList.add("desk-nav");
      [...nav.children].forEach((c, i) => { if (i < 9 && c.dataset.kbd !== "Ctrl+" + (i + 1)) c.dataset.kbd = "Ctrl+" + (i + 1); });
    };
    let raf = 0;
    new MutationObserver(() => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; mark(); }); })
      .observe(document.body, { childList: true, subtree: true });
    mark();
  });
})();