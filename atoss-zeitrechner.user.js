// ==UserScript==
// @name         Sonplas ATOSS Zeitrechner Handoff
// @namespace    local-zeitrechner
// @version      1.0
// @match        https://sonplas.atoss.com/atc/client*
// @run-at       document-end
// @allFrames    true
// ==/UserScript==

(function () {
  'use strict';
  const TARGET = 'https://gtowncity.github.io/Zeitrechner/';
  let auto = false;
  let last = '';

  function enc(data) {
    const json = JSON.stringify(data);
    const bytes = new TextEncoder().encode(json);
    let bin = '';
    bytes.forEach((b) => { bin += String.fromCharCode(b); });
    return encodeURIComponent(btoa(bin));
  }

  function events() {
    const out = [];
    const seen = new Set();
    for (const el of [...document.querySelectorAll('*')]) {
      const txt = (el.innerText || '').replace(/\s+/g, ' ').trim();
      const m = txt.match(/(\d{2}\.\d{2}\.\d{4})\s+(\d{2}:\d{2})\s+(Anwesenheit|Pausen|Pause)\b/i);
      if (!m) continue;
      const type = /^pausen?$/i.test(m[3]) ? 'Pause' : 'Anwesenheit';
      const key = `${m[1]}|${m[2]}|${type}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ date: m[1], time: m[2], type });
    }
    return out.sort((a, b) => `${a.date.split('.').reverse().join('-')} ${a.time}`.localeCompare(`${b.date.split('.').reverse().join('-')} ${b.time}`));
  }

  function payload() {
    const rawEvents = events();
    const date = rawEvents[0]?.date || null;
    const sameDay = rawEvents.filter((e) => e.date === date);
    let startTime = null;
    const breaks = [];
    sameDay.forEach((e, i) => {
      if (e.type === 'Anwesenheit' && !startTime) startTime = e.time;
      if (e.type === 'Pause') {
        const next = sameDay.slice(i + 1).find((x) => x.type === 'Anwesenheit');
        breaks.push({ from: e.time, to: next ? next.time : null });
      }
    });
    return { source: 'ATOSS visible list', exportedAt: new Date().toISOString(), date, startTime, breaks, currentState: sameDay.at(-1)?.type || null, rawEvents: sameDay };
  }

  function toast(msg) {
    let t = document.getElementById('zr-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'zr-toast';
      t.style.cssText = 'position:fixed;right:20px;bottom:20px;z-index:2147483647;background:#ffb000;color:#111;padding:10px 14px;border:2px solid #fff;font:700 13px Courier New,monospace;';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.display = 'block';
    clearTimeout(t._h);
    t._h = setTimeout(() => { t.style.display = 'none'; }, 2200);
  }

  function send() {
    const p = payload();
    if (!p.startTime) { toast('Keine Zeitdaten gefunden'); return; }
    last = JSON.stringify(p.rawEvents);
    window.open(`${TARGET}#atoss=${enc(p)}`, 'zeitrechner_window');
    toast('Zeitrechner aktualisiert');
  }

  function tick() {
    if (!auto) return;
    const p = payload();
    const sig = JSON.stringify(p.rawEvents);
    if (p.startTime && sig !== last) {
      last = sig;
      window.open(`${TARGET}#atoss=${enc(p)}`, 'zeitrechner_window');
      toast('Auto aktualisiert');
    }
  }

  function btn(id, text, top) {
    if (document.getElementById(id)) return;
    const b = document.createElement('button');
    b.id = id;
    b.textContent = text;
    b.style.cssText = `position:fixed;right:20px;top:${top}px;z-index:2147483647;background:#bdbdbd;color:#111;border:2px solid #fff;padding:9px 12px;font:700 13px Courier New,monospace;cursor:pointer;`;
    document.body.appendChild(b);
    return b;
  }

  function ui() {
    const sendBtn = btn('zr-send', 'ZEITRECHNER SENDEN', 20);
    if (sendBtn) sendBtn.addEventListener('click', send);
    const autoBtn = btn('zr-auto', 'AUTO: AUS', 62);
    if (autoBtn) autoBtn.addEventListener('click', () => { auto = !auto; autoBtn.textContent = auto ? 'AUTO: AN' : 'AUTO: AUS'; autoBtn.style.background = auto ? '#ffb000' : '#bdbdbd'; if (auto) tick(); });
  }

  ui();
  setInterval(() => { ui(); tick(); }, 2500);
}());
