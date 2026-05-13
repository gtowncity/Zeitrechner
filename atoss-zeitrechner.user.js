// ==UserScript==
// @name         Sonplas ATOSS -> Zeitrechner Auto Handoff
// @namespace    local-sonplas-atoss-zeitrechner
// @version      1.0
// @description  Sendet sichtbare ATOSS-Daten automatisch an den Zeitrechner per direktem URL-Handoff. Kein Server, kein Clipboard nötig.
// @match        https://sonplas.atoss.com/atc/client*
// @run-at       document-end
// @allFrames    true
// ==/UserScript==

(function () {
  "use strict";

  const ZEITRECHNER_URL = "https://gtowncity.github.io/Zeitrechner/";
  const OPEN_BUTTON_ID = "atoss-zeitrechner-open-btn";
  const AUTO_BUTTON_ID = "atoss-zeitrechner-auto-btn";

  let autoSync = false;
  let lastPayloadSignature = "";

  function encodePayload(payload) {
    return encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify(payload)))));
  }

  function extractEvents() {
    const wanted = [];
    const seen = new Set();

    for (const el of [...document.querySelectorAll("*")]) {
      const text = (el.innerText || "").replace(/\s+/g, " ").trim();
      if (!text) continue;

      const match = text.match(/(\d{2}\.\d{2}\.\d{4})\s+(\d{2}:\d{2})\s+(Anwesenheit|Pausen|Pause)\b/i);
      if (!match) continue;

      const [, date, time, rawType] = match;
      const type = /^pausen?$/i.test(rawType) ? "Pause" : "Anwesenheit";
      const key = `${date}|${time}|${type}`;

      if (seen.has(key)) continue;
      seen.add(key);
      wanted.push({ date, time, type });
    }

    wanted.sort((a, b) => {
      const da = a.date.split(".").reverse().join("-") + " " + a.time;
      const db = b.date.split(".").reverse().join("-") + " " + b.time;
      return da.localeCompare(db);
    });

    return wanted;
  }

  function normalizeForZeitrechner(events) {
    if (!events.length) {
      return {
        source: "ATOSS visible list",
        exportedAt: new Date().toISOString(),
        date: null,
        startTime: null,
        breaks: [],
        currentState: null,
        rawEvents: []
      };
    }

    const date = events[0].date;
    const sameDay = events.filter((e) => e.date === date);
    let startTime = null;
    const breaks = [];

    for (let i = 0; i < sameDay.length; i++) {
      const current = sameDay[i];

      if (current.type === "Anwesenheit" && !startTime) {
        startTime = current.time;
      }

      if (current.type === "Pause") {
        const nextAttendance = sameDay.slice(i + 1).find((e) => e.type === "Anwesenheit");
        breaks.push({
          from: current.time,
          to: nextAttendance ? nextAttendance.time : null
        });
      }
    }

    return {
      source: "ATOSS visible list",
      exportedAt: new Date().toISOString(),
      date,
      startTime,
      breaks,
      currentState: sameDay[sameDay.length - 1]?.type || null,
      rawEvents: sameDay
    };
  }

  function buildPayload() {
    return normalizeForZeitrechner(extractEvents());
  }

  function openZeitrechner(payload) {
    if (!payload.rawEvents.length) {
      showToast("Keine passenden sichtbaren Einträge gefunden.", false);
      return;
    }

    const url = `${ZEITRECHNER_URL}#atoss=${encodePayload(payload)}`;
    window.open(url, "zeitrechner_window");
    showToast("ATOSS-Daten an Zeitrechner gesendet.", true);
  }

  function handoffIfChanged() {
    const payload = buildPayload();
    const signature = JSON.stringify(payload.rawEvents);

    if (!payload.rawEvents.length) return;
    if (signature === lastPayloadSignature) return;

    lastPayloadSignature = signature;
    openZeitrechner(payload);
  }

  function showToast(message, ok = true) {
    let toast = document.getElementById("atoss-zeitrechner-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "atoss-zeitrechner-toast";
      toast.style.cssText = `
        position: fixed !important;
        right: 20px !important;
        bottom: 20px !important;
        z-index: 2147483647 !important;
        padding: 10px 14px !important;
        border-radius: 10px !important;
        color: #fff !important;
        font: 700 14px Arial, sans-serif !important;
        box-shadow: 0 6px 18px rgba(0,0,0,.28) !important;
      `;
      document.body.appendChild(toast);
    }

    toast.textContent = message;
    toast.style.background = ok ? "#1f7a1f" : "#a12626";
    toast.style.display = "block";

    clearTimeout(toast._hideTimer);
    toast._hideTimer = setTimeout(() => {
      toast.style.display = "none";
    }, 2400);
  }

  function makeButton(id, label, topOffset) {
    const btn = document.createElement("button");
    btn.id = id;
    btn.type = "button";
    btn.textContent = label;
    btn.style.cssText = `
      position: fixed !important;
      right: 20px !important;
      top: ${topOffset}px !important;
      z-index: 2147483647 !important;
      padding: 10px 14px !important;
      border: 1px solid #4f78a7 !important;
      border-radius: 10px !important;
      background: #16324f !important;
      color: #fff !important;
      font: 700 14px Arial, sans-serif !important;
      cursor: pointer !important;
      box-shadow: 0 4px 12px rgba(0,0,0,.2) !important;
    `;
    btn.addEventListener("mouseenter", () => {
      btn.style.background = "#20456d";
    });
    btn.addEventListener("mouseleave", () => {
      btn.style.background = autoSync && id === AUTO_BUTTON_ID ? "#2563eb" : "#16324f";
    });
    return btn;
  }

  function ensureButtons() {
    if (!document.getElementById(OPEN_BUTTON_ID)) {
      const openBtn = makeButton(OPEN_BUTTON_ID, "Zum Zeitrechner", 20);
      openBtn.addEventListener("click", () => {
        const payload = buildPayload();
        lastPayloadSignature = JSON.stringify(payload.rawEvents);
        openZeitrechner(payload);
      });
      (document.body || document.documentElement).appendChild(openBtn);
    }

    if (!document.getElementById(AUTO_BUTTON_ID)) {
      const autoBtn = makeButton(AUTO_BUTTON_ID, "Auto-Sync: Aus", 68);
      autoBtn.addEventListener("click", () => {
        autoSync = !autoSync;
        autoBtn.textContent = `Auto-Sync: ${autoSync ? "An" : "Aus"}`;
        autoBtn.style.background = autoSync ? "#2563eb" : "#16324f";
        if (autoSync) {
          handoffIfChanged();
        }
      });
      (document.body || document.documentElement).appendChild(autoBtn);
    }
  }

  ensureButtons();
  setInterval(() => {
    ensureButtons();
    if (autoSync) handoffIfChanged();
  }, 2000);
})();
