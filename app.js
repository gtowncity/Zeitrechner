const STORAGE_KEY = 'zeitrechner_compact_v2';

const elements = {
  startTime: document.getElementById('startTime'),
  targetTime: document.getElementById('targetTime'),
  fridayMode: document.getElementById('fridayMode'),
  addPauseBtn: document.getElementById('addPauseBtn'),
  calcBtn: document.getElementById('calcBtn'),
  resetBtn: document.getElementById('resetBtn'),
  pauseList: document.getElementById('pauseList'),
  pauseHint: document.getElementById('pauseHint'),
  pauseValidation: document.getElementById('pauseValidation'),
  pauseRowTemplate: document.getElementById('pauseRowTemplate'),
  modeBadge: document.getElementById('modeBadge'),
  fixedBreakInfo: document.getElementById('fixedBreakInfo'),
  heroClock: document.getElementById('heroClock'),
  heroLeave: document.getElementById('heroLeave'),
  heroRemaining: document.getElementById('heroRemaining'),
  liveBadge: document.getElementById('liveBadge'),
  liveWorked: document.getElementById('liveWorked'),
  liveMissing: document.getElementById('liveMissing'),
  liveOvertime: document.getElementById('liveOvertime'),
  liveUntilLeave: document.getElementById('liveUntilLeave'),
  targetProductive: document.getElementById('targetProductive'),
  targetBreaks: document.getElementById('targetBreaks'),
  targetDiff: document.getElementById('targetDiff'),
  statusBox: document.getElementById('statusBox'),
  detailText: document.getElementById('detailText')
};

const defaultState = {
  startTime: '07:00',
  targetTime: '17:00',
  fridayMode: false,
  pauses: []
};

let state = loadState();

function loadState() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return {
      startTime: raw.startTime || defaultState.startTime,
      targetTime: typeof raw.targetTime === 'string' ? raw.targetTime : defaultState.targetTime,
      fridayMode: !!raw.fridayMode,
      pauses: Array.isArray(raw.pauses) ? raw.pauses.map((p) => ({
        id: p.id || makeId(),
        from: typeof p.from === 'string' ? p.from : '',
        to: typeof p.to === 'string' ? p.to : ''
      })) : []
    };
  } catch {
    return { ...defaultState };
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function makeId() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function getConfig() {
  return state.fridayMode
    ? {
        label: 'Freitag',
        targetMinutes: 5 * 60,
        fixedBreak: { start: 12 * 60, end: 12 * 60 + 15 },
        fixedBreakLabel: '12:00 bis 12:15'
      }
    : {
        label: 'Standard',
        targetMinutes: 8 * 60 + 15,
        fixedBreak: { start: 12 * 60, end: 12 * 60 + 30 },
        fixedBreakLabel: '12:00 bis 12:30'
      };
}

function parseTimeToMinutes(value) {
  if (!value || !value.includes(':')) return null;
  const [h, m] = value.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

function formatClock(totalMinutes) {
  if (totalMinutes === null || totalMinutes === undefined || Number.isNaN(totalMinutes)) return '--:--';
  const normalized = ((Math.round(totalMinutes) % 1440) + 1440) % 1440;
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function formatClockWithSeconds(date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
}

function formatDuration(minutes, signed = false) {
  if (minutes === null || minutes === undefined || Number.isNaN(minutes)) return '--:-- h';
  const sign = minutes < 0 ? '-' : signed && minutes > 0 ? '+' : '';
  const abs = Math.abs(Math.round(minutes));
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${sign}${h}:${String(m).padStart(2, '0')} h`;
}

function mergeIntervals(intervals) {
  if (!intervals.length) return [];
  const sorted = intervals
    .map((i) => ({ start: i.start, end: i.end }))
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const merged = [sorted[0]];
  for (const current of sorted.slice(1)) {
    const last = merged[merged.length - 1];
    if (current.start <= last.end) {
      last.end = Math.max(last.end, current.end);
    } else {
      merged.push(current);
    }
  }
  return merged;
}

function overlap(interval, start, end) {
  return Math.max(0, Math.min(interval.end, end) - Math.max(interval.start, start));
}

function sumOverlap(intervals, start, end) {
  return intervals.reduce((sum, interval) => sum + overlap(interval, start, end), 0);
}

function getPauseAnalysis() {
  const validCustom = [];
  const invalid = [];

  state.pauses.forEach((pause, index) => {
    const from = parseTimeToMinutes(pause.from);
    const to = parseTimeToMinutes(pause.to);

    if (!pause.from && !pause.to) {
      invalid.push({ index, reason: 'Leere Pause wird ignoriert.' });
      return;
    }
    if (from === null || to === null) {
      invalid.push({ index, reason: 'Zeitformat unvollständig.' });
      return;
    }
    if (to <= from) {
      invalid.push({ index, reason: 'Pause muss nach der Startzeit enden.' });
      return;
    }

    validCustom.push({ start: from, end: to, index });
  });

  return { validCustom, invalid };
}

function getBreakData(config) {
  const { validCustom, invalid } = getPauseAnalysis();
  const fixed = [{ start: config.fixedBreak.start, end: config.fixedBreak.end }];
  const mergedAll = mergeIntervals([...fixed, ...validCustom]);
  return { validCustom, invalid, fixed, mergedAll };
}

function calculateProductive(start, end, config) {
  if (start === null || end === null || end <= start) {
    return { presence: 0, productive: 0, fixedBreak: 0, customBreak: 0, totalBreak: 0 };
  }

  const { fixed, mergedAll } = getBreakData(config);
  const presence = end - start;
  const fixedBreak = sumOverlap(fixed, start, end);
  const totalBreak = sumOverlap(mergedAll, start, end);
  const customBreak = Math.max(0, totalBreak - fixedBreak);
  const productive = Math.max(0, presence - totalBreak);

  return { presence, productive, fixedBreak, customBreak, totalBreak };
}

function calculateLeaveTime(start, config) {
  if (start === null) return null;
  const { mergedAll } = getBreakData(config);
  const relevant = mergedAll.filter((i) => i.end > start);
  let current = start;
  let remaining = config.targetMinutes;

  for (const interval of relevant) {
    if (interval.end <= current) continue;
    if (interval.start <= current) {
      current = Math.max(current, interval.end);
      continue;
    }

    const workChunk = interval.start - current;
    if (remaining <= workChunk) {
      return current + remaining;
    }

    remaining -= workChunk;
    current = interval.end;
  }

  return current + remaining;
}

function setStatus(text, type) {
  elements.statusBox.className = `notice ${type}`;
  elements.statusBox.textContent = text;
}

function syncFormFromState() {
  elements.startTime.value = state.startTime;
  elements.targetTime.value = state.targetTime;
  elements.fridayMode.checked = state.fridayMode;
}

function renderPauseRows() {
  const { invalid } = getPauseAnalysis();
  const invalidMap = new Map(invalid.map((item) => [item.index, item.reason]));
  elements.pauseList.innerHTML = '';

  if (!state.pauses.length) {
    elements.pauseHint.classList.remove('hidden');
  } else {
    elements.pauseHint.classList.add('hidden');
  }

  state.pauses.forEach((pause, index) => {
    const node = elements.pauseRowTemplate.content.cloneNode(true);
    const row = node.querySelector('.pause-row');
    const from = node.querySelector('.pause-from');
    const to = node.querySelector('.pause-to');
    const remove = node.querySelector('.pause-remove');
    row.dataset.id = pause.id;
    from.value = pause.from;
    to.value = pause.to;
    remove.dataset.id = pause.id;
    if (invalidMap.has(index)) {
      row.style.borderColor = 'rgba(255,107,107,0.25)';
    }
    elements.pauseList.appendChild(node);
  });

  if (invalid.length) {
    elements.pauseValidation.classList.remove('hidden');
    elements.pauseValidation.textContent = `${invalid.length} ungültige Pause${invalid.length > 1 ? 'n werden' : ' wird'} ignoriert.`;
  } else {
    elements.pauseValidation.classList.add('hidden');
    elements.pauseValidation.textContent = '';
  }
}

function renderAll() {
  const config = getConfig();
  const start = parseTimeToMinutes(state.startTime);
  const target = parseTimeToMinutes(state.targetTime);
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const leaveTime = calculateLeaveTime(start, config);

  elements.modeBadge.textContent = `${config.label} · ${formatDuration(config.targetMinutes)}`;
  elements.fixedBreakInfo.textContent = `Feste Pause: ${config.fixedBreakLabel}`;
  elements.heroClock.textContent = formatClockWithSeconds(now);
  elements.liveBadge.textContent = formatClockWithSeconds(now);
  elements.heroLeave.textContent = formatClock(leaveTime);

  if (start === null) {
    elements.heroRemaining.textContent = '--:-- h';
    elements.liveWorked.textContent = '--:-- h';
    elements.liveMissing.textContent = '--:-- h';
    elements.liveOvertime.textContent = '+0:00 h';
    elements.liveUntilLeave.textContent = '--:-- h';
    elements.targetProductive.textContent = '--:-- h';
    elements.targetBreaks.textContent = '--:-- h';
    elements.targetDiff.textContent = '--:-- h';
    setStatus('Bitte eine gültige Einstempelzeit eingeben.', 'notice-error');
    return;
  }

  const live = calculateProductive(start, Math.max(start, nowMinutes), config);
  const missingLive = Math.max(0, config.targetMinutes - live.productive);
  const overtimeLive = Math.max(0, live.productive - config.targetMinutes);
  const leaveRemaining = leaveTime - nowMinutes;

  elements.liveWorked.textContent = formatDuration(live.productive);
  elements.liveMissing.textContent = formatDuration(missingLive);
  elements.liveOvertime.textContent = formatDuration(overtimeLive, true);
  elements.liveUntilLeave.textContent = leaveRemaining > 0 ? formatDuration(leaveRemaining) : formatDuration(Math.abs(leaveRemaining), true);
  elements.heroRemaining.textContent = leaveRemaining > 0 ? formatDuration(leaveRemaining) : formatDuration(Math.abs(leaveRemaining), true);

  if (target !== null && target > start) {
    const result = calculateProductive(start, target, config);
    const diff = result.productive - config.targetMinutes;
    elements.targetProductive.textContent = formatDuration(result.productive);
    elements.targetBreaks.textContent = formatDuration(result.totalBreak);
    elements.targetDiff.textContent = formatDuration(diff, true);

    if (diff > 0) {
      setStatus(`Bis ${formatClock(target)} bist du ${formatDuration(diff)} über der Sollzeit.`, 'notice-warning');
    } else if (diff < 0) {
      setStatus(`Bis ${formatClock(target)} fehlen noch ${formatDuration(Math.abs(diff))} bis zur Sollzeit.`, 'notice-error');
    } else {
      setStatus(`Bis ${formatClock(target)} landest du genau auf deiner Sollzeit.`, 'notice-info');
    }

    elements.detailText.textContent = `Von ${formatClock(start)} bis ${formatClock(target)} sind es ${formatDuration(result.presence)} Anwesenheit. Nach Abzug von ${formatDuration(result.fixedBreak)} fixer Pause und ${formatDuration(result.customBreak)} zusätzlichen Pausen bleiben ${formatDuration(result.productive)} Arbeitszeit.`;
  } else {
    elements.targetProductive.textContent = '--:-- h';
    elements.targetBreaks.textContent = formatDuration(live.totalBreak);
    elements.targetDiff.textContent = formatDuration(live.productive - config.targetMinutes, true);

    if (leaveRemaining > 0) {
      setStatus(`Bis zum Feierabend um ${formatClock(leaveTime)} fehlen noch ${formatDuration(leaveRemaining)}.`, 'notice-info');
    } else {
      setStatus(`Der berechnete Feierabend um ${formatClock(leaveTime)} ist bereits überschritten.`, 'notice-warning');
    }

    elements.detailText.textContent = `Aktuell sind ${formatDuration(live.productive)} effektive Arbeitszeit erreicht. Bisher wurden ${formatDuration(live.fixedBreak)} feste Pause und ${formatDuration(live.customBreak)} zusätzliche Pausen abgezogen.`;
  }

  saveState();
}

function addPause() {
  state.pauses.push({ id: makeId(), from: '', to: '' });
  renderPauseRows();
  saveState();
}

function resetAll() {
  state = { ...defaultState, pauses: [] };
  syncFormFromState();
  renderPauseRows();
  renderAll();
  localStorage.removeItem(STORAGE_KEY);
}

function bindEvents() {
  elements.startTime.addEventListener('input', (e) => {
    state.startTime = e.target.value;
    renderAll();
  });

  elements.targetTime.addEventListener('input', (e) => {
    state.targetTime = e.target.value;
    renderAll();
  });

  elements.fridayMode.addEventListener('change', (e) => {
    state.fridayMode = e.target.checked;
    renderAll();
  });

  elements.addPauseBtn.addEventListener('click', addPause);
  elements.calcBtn.addEventListener('click', renderAll);
  elements.resetBtn.addEventListener('click', resetAll);

  elements.pauseList.addEventListener('input', (e) => {
    const row = e.target.closest('.pause-row');
    if (!row) return;
    const pause = state.pauses.find((item) => item.id === row.dataset.id);
    if (!pause) return;
    if (e.target.classList.contains('pause-from')) pause.from = e.target.value;
    if (e.target.classList.contains('pause-to')) pause.to = e.target.value;
    renderPauseRows();
    renderAll();
  });

  elements.pauseList.addEventListener('click', (e) => {
    if (!e.target.classList.contains('pause-remove')) return;
    const id = e.target.dataset.id;
    state.pauses = state.pauses.filter((item) => item.id !== id);
    renderPauseRows();
    renderAll();
  });
}

syncFormFromState();
renderPauseRows();
renderAll();
bindEvents();
setInterval(renderAll, 1000);
