const STORAGE_KEY = 'zeitrechner_v4';

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
  modePill: document.getElementById('modePill'),
  toggleCopy: document.getElementById('toggleCopy'),
  fixedBreakChip: document.getElementById('fixedBreakChip'),
  heroClock: document.getElementById('heroClock'),
  heroLeave: document.getElementById('heroLeave'),
  heroRemaining: document.getElementById('heroRemaining'),
  liveBadge: document.getElementById('liveBadge'),
  liveWorked: document.getElementById('liveWorked'),
  liveDelta: document.getElementById('liveDelta'),
  deltaLabel: document.getElementById('deltaLabel'),
  deltaNote: document.getElementById('deltaNote'),
  deltaCard: document.getElementById('deltaCard'),
  targetProductive: document.getElementById('targetProductive'),
  targetPresence: document.getElementById('targetPresence'),
  totalBreaks: document.getElementById('totalBreaks'),
  breakSplit: document.getElementById('breakSplit'),
  statusLine: document.getElementById('statusLine'),
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
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...defaultState };
    const parsed = JSON.parse(raw);
    return {
      startTime: typeof parsed.startTime === 'string' ? parsed.startTime : defaultState.startTime,
      targetTime: typeof parsed.targetTime === 'string' ? parsed.targetTime : defaultState.targetTime,
      fridayMode: Boolean(parsed.fridayMode),
      pauses: Array.isArray(parsed.pauses)
        ? parsed.pauses.map((pause) => ({
            id: pause.id || cryptoRandomId(),
            from: typeof pause.from === 'string' ? pause.from : '',
            to: typeof pause.to === 'string' ? pause.to : ''
          }))
        : []
    };
  } catch {
    return { ...defaultState };
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function cryptoRandomId() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function getConfig() {
  return state.fridayMode
    ? {
        modeLabel: 'Freitag',
        targetMinutes: 300,
        fixedBreak: { start: 12 * 60, end: 12 * 60 + 15 },
        fixedBreakLabel: '12:00 bis 12:15'
      }
    : {
        modeLabel: 'Standard',
        targetMinutes: 8 * 60 + 15,
        fixedBreak: { start: 12 * 60, end: 12 * 60 + 30 },
        fixedBreakLabel: '12:00 bis 12:30'
      };
}

function parseTimeToMinutes(value) {
  if (!value || !value.includes(':')) return null;
  const [hours, minutes] = value.split(':').map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  return hours * 60 + minutes;
}

function formatClock(totalMinutes) {
  if (totalMinutes === null || totalMinutes === undefined || Number.isNaN(totalMinutes)) return '--:--';
  const normalized = ((Math.round(totalMinutes) % 1440) + 1440) % 1440;
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function formatClockWithSeconds(date) {
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  const s = String(date.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function formatDuration(minutes, signed = false) {
  if (minutes === null || minutes === undefined || Number.isNaN(minutes)) return '--:-- h';
  const rounded = Math.round(minutes);
  const prefix = rounded < 0 ? '-' : signed && rounded > 0 ? '+' : '';
  const absolute = Math.abs(rounded);
  const hours = Math.floor(absolute / 60);
  const mins = absolute % 60;
  return `${prefix}${hours}:${String(mins).padStart(2, '0')} h`;
}

function mergeIntervals(intervals) {
  if (!intervals.length) return [];
  const sorted = intervals
    .map((interval) => ({ start: interval.start, end: interval.end }))
    .sort((a, b) => a.start - b.start || a.end - b.end);

  const merged = [sorted[0]];
  for (const interval of sorted.slice(1)) {
    const last = merged[merged.length - 1];
    if (interval.start <= last.end) {
      last.end = Math.max(last.end, interval.end);
    } else {
      merged.push(interval);
    }
  }
  return merged;
}

function overlap(interval, rangeStart, rangeEnd) {
  return Math.max(0, Math.min(interval.end, rangeEnd) - Math.max(interval.start, rangeStart));
}

function sumOverlap(intervals, rangeStart, rangeEnd) {
  return intervals.reduce((sum, interval) => sum + overlap(interval, rangeStart, rangeEnd), 0);
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
      invalid.push({ index, reason: 'Pause muss nach ihrer Startzeit enden.' });
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
  return { fixed, validCustom, invalid, mergedAll };
}

function calculateProductive(startMinutes, endMinutes, config) {
  if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) {
    return { presence: 0, productive: 0, fixedBreak: 0, customBreak: 0, totalBreak: 0 };
  }

  const { fixed, mergedAll } = getBreakData(config);
  const presence = endMinutes - startMinutes;
  const fixedBreak = sumOverlap(fixed, startMinutes, endMinutes);
  const totalBreak = sumOverlap(mergedAll, startMinutes, endMinutes);
  const customBreak = Math.max(0, totalBreak - fixedBreak);
  const productive = Math.max(0, presence - totalBreak);

  return { presence, productive, fixedBreak, customBreak, totalBreak };
}

function calculateLeaveTime(startMinutes, config) {
  if (startMinutes === null) return null;
  const { mergedAll } = getBreakData(config);
  const relevant = mergedAll.filter((interval) => interval.end > startMinutes);

  let cursor = startMinutes;
  let remaining = config.targetMinutes;

  for (const interval of relevant) {
    if (interval.end <= cursor) continue;

    if (interval.start <= cursor) {
      cursor = Math.max(cursor, interval.end);
      continue;
    }

    const workChunk = interval.start - cursor;
    if (remaining <= workChunk) {
      return cursor + remaining;
    }

    remaining -= workChunk;
    cursor = interval.end;
  }

  return cursor + remaining;
}

function syncFormFromState() {
  elements.startTime.value = state.startTime;
  elements.targetTime.value = state.targetTime;
  elements.fridayMode.checked = state.fridayMode;
}

function renderPauseRows() {
  const { invalid } = getPauseAnalysis();
  const invalidIndexes = new Set(invalid.map((item) => item.index));
  elements.pauseList.innerHTML = '';

  elements.pauseHint.classList.toggle('hidden', state.pauses.length > 0);

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

    if (invalidIndexes.has(index)) {
      row.style.borderColor = 'rgba(189, 78, 78, 0.34)';
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

function setStatus(text, variant) {
  elements.statusLine.textContent = text;
  elements.statusLine.className = 'status-line';
  if (variant) {
    elements.statusLine.classList.add(variant);
  }
}

function setDeltaState(deltaMinutes) {
  elements.deltaCard.classList.remove('is-danger', 'is-success');

  if (deltaMinutes < 0) {
    elements.deltaLabel.textContent = 'Noch fehlend';
    elements.deltaNote.textContent = 'bis zur Sollzeit';
    elements.liveDelta.textContent = formatDuration(Math.abs(deltaMinutes));
    elements.deltaCard.classList.add('is-danger');
    return;
  }

  if (deltaMinutes > 0) {
    elements.deltaLabel.textContent = 'Schon drüber';
    elements.deltaNote.textContent = 'über deiner Sollzeit';
    elements.liveDelta.textContent = formatDuration(deltaMinutes, true);
    elements.deltaCard.classList.add('is-success');
    return;
  }

  elements.deltaLabel.textContent = 'Genau passend';
  elements.deltaNote.textContent = 'du liegst exakt auf Soll';
  elements.liveDelta.textContent = '0:00 h';
  elements.deltaCard.classList.add('is-success');
}

function renderAll() {
  const config = getConfig();
  const startMinutes = parseTimeToMinutes(state.startTime);
  const targetMinutes = parseTimeToMinutes(state.targetTime);
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const leaveTime = calculateLeaveTime(startMinutes, config);

  elements.modePill.textContent = `${config.modeLabel} · ${formatDuration(config.targetMinutes)}`;
  elements.fixedBreakChip.textContent = `Feste Pause: ${config.fixedBreakLabel}`;
  elements.toggleCopy.textContent = state.fridayMode
    ? '5:00 h Sollzeit, feste Pause 12:00 bis 12:15.'
    : '8:15 h Sollzeit, feste Pause 12:00 bis 12:30.';

  elements.heroClock.textContent = formatClockWithSeconds(now);
  elements.liveBadge.textContent = formatClockWithSeconds(now);
  elements.heroLeave.textContent = formatClock(leaveTime);

  if (startMinutes === null) {
    elements.heroRemaining.textContent = '--:-- h';
    elements.liveWorked.textContent = '--:-- h';
    elements.targetProductive.textContent = '--:-- h';
    elements.targetPresence.textContent = 'Anwesenheit --:-- h';
    elements.totalBreaks.textContent = '--:-- h';
    elements.breakSplit.textContent = 'fix --:-- h · extra --:-- h';
    setDeltaState(-config.targetMinutes);
    setStatus('Bitte eine gültige Einstempelzeit eingeben.', 'is-warning');
    elements.detailText.textContent = 'Trage links deine Zeiten ein. Der Rechner berücksichtigt feste und eigene Pausen ohne Doppelabzug.';
    return;
  }

  const liveEnd = Math.max(startMinutes, nowMinutes);
  const live = calculateProductive(startMinutes, liveEnd, config);
  const liveDelta = live.productive - config.targetMinutes;
  const leaveRemaining = leaveTime - nowMinutes;

  elements.heroRemaining.textContent = leaveRemaining >= 0
    ? formatDuration(leaveRemaining)
    : formatDuration(Math.abs(leaveRemaining), true);

  elements.liveWorked.textContent = formatDuration(live.productive);
  setDeltaState(liveDelta);

  if (targetMinutes !== null && targetMinutes > startMinutes) {
    const target = calculateProductive(startMinutes, targetMinutes, config);
    const targetDiff = target.productive - config.targetMinutes;
    elements.targetProductive.textContent = formatDuration(target.productive);
    elements.targetPresence.textContent = `Anwesenheit ${formatDuration(target.presence)}`;
    elements.totalBreaks.textContent = formatDuration(target.totalBreak);
    elements.breakSplit.textContent = `fix ${formatDuration(target.fixedBreak)} · extra ${formatDuration(target.customBreak)}`;

    if (targetDiff > 0) {
      setStatus(`Bis ${formatClock(targetMinutes)} bist du ${formatDuration(targetDiff)} über der Sollzeit.`, 'is-success');
    } else if (targetDiff < 0) {
      setStatus(`Bis ${formatClock(targetMinutes)} fehlen noch ${formatDuration(Math.abs(targetDiff))} bis zur Sollzeit.`, 'is-warning');
    } else {
      setStatus(`Bis ${formatClock(targetMinutes)} landest du genau auf deiner Sollzeit.`, 'is-info');
    }

    elements.detailText.textContent = `Von ${formatClock(startMinutes)} bis ${formatClock(targetMinutes)} sind es ${formatDuration(target.presence)} Anwesenheit. Nach Abzug von ${formatDuration(target.fixedBreak)} fixer Pause und ${formatDuration(target.customBreak)} zusätzlichen Pausen bleiben ${formatDuration(target.productive)} Arbeitszeit.`;
  } else {
    elements.targetProductive.textContent = '--:-- h';
    elements.targetPresence.textContent = 'Solluhrzeit optional';
    elements.totalBreaks.textContent = formatDuration(live.totalBreak);
    elements.breakSplit.textContent = `fix ${formatDuration(live.fixedBreak)} · extra ${formatDuration(live.customBreak)}`;

    if (leaveRemaining > 0) {
      setStatus(`Bis zum Feierabend um ${formatClock(leaveTime)} fehlen noch ${formatDuration(leaveRemaining)}.`, 'is-info');
    } else {
      setStatus(`Der berechnete Feierabend um ${formatClock(leaveTime)} ist bereits überschritten.`, 'is-success');
    }

    elements.detailText.textContent = `Seit ${formatClock(startMinutes)} wurden ${formatDuration(live.fixedBreak)} feste Pause und ${formatDuration(live.customBreak)} zusätzliche Pausen abgezogen. Aktuell stehen ${formatDuration(live.productive)} effektive Arbeitszeit auf dem Konto.`;
  }
}

function addPause(pause = { id: cryptoRandomId(), from: '', to: '' }) {
  state.pauses.push(pause);
  saveState();
  renderPauseRows();
  renderAll();
}

function resetState() {
  state = { ...defaultState, pauses: [] };
  saveState();
  syncFormFromState();
  renderPauseRows();
  renderAll();
}

syncFormFromState();
renderPauseRows();
renderAll();

setInterval(renderAll, 1000);

elements.startTime.addEventListener('input', (event) => {
  state.startTime = event.target.value;
  saveState();
  renderAll();
});

elements.targetTime.addEventListener('input', (event) => {
  state.targetTime = event.target.value;
  saveState();
  renderAll();
});

elements.fridayMode.addEventListener('change', (event) => {
  state.fridayMode = event.target.checked;
  saveState();
  renderAll();
});

elements.addPauseBtn.addEventListener('click', () => addPause());

elements.calcBtn.addEventListener('click', () => {
  saveState();
  renderPauseRows();
  renderAll();
});

elements.resetBtn.addEventListener('click', resetState);

elements.pauseList.addEventListener('input', (event) => {
  const row = event.target.closest('.pause-row');
  if (!row) return;
  const pause = state.pauses.find((item) => item.id === row.dataset.id);
  if (!pause) return;

  if (event.target.classList.contains('pause-from')) {
    pause.from = event.target.value;
  }
  if (event.target.classList.contains('pause-to')) {
    pause.to = event.target.value;
  }

  saveState();
  renderPauseRows();
  renderAll();
});

elements.pauseList.addEventListener('click', (event) => {
  const button = event.target.closest('.pause-remove');
  if (!button) return;
  state.pauses = state.pauses.filter((pause) => pause.id !== button.dataset.id);
  saveState();
  renderPauseRows();
  renderAll();
});
