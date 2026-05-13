const STORAGE_KEY = 'zeitrechner_dark_atoss_v1';

const elements = {
  startTime: document.getElementById('startTime'),
  targetTime: document.getElementById('targetTime'),
  fridayMode: document.getElementById('fridayMode'),
  addPauseButton: document.getElementById('addPauseButton'),
  calculateButton: document.getElementById('calculateButton'),
  importAtossButton: document.getElementById('importAtossButton'),
  resetButton: document.getElementById('resetButton'),
  pauseList: document.getElementById('pauseList'),
  pauseHint: document.getElementById('pauseHint'),
  importFeedback: document.getElementById('importFeedback'),
  pauseValidation: document.getElementById('pauseValidation'),
  pauseRowTemplate: document.getElementById('pauseRowTemplate'),
  modePill: document.getElementById('modePill'),
  fixedBreakChip: document.getElementById('fixedBreakChip'),
  toggleCopy: document.getElementById('toggleCopy'),
  heroClock: document.getElementById('heroClock'),
  heroLeave: document.getElementById('heroLeave'),
  heroRemaining: document.getElementById('heroRemaining'),
  liveBadge: document.getElementById('liveBadge'),
  liveWorked: document.getElementById('liveWorked'),
  liveMissing: document.getElementById('liveMissing'),
  liveOvertime: document.getElementById('liveOvertime'),
  liveUntilLeave: document.getElementById('liveUntilLeave'),
  targetProductive: document.getElementById('targetProductive'),
  totalBreaks: document.getElementById('totalBreaks'),
  deltaLabel: document.getElementById('deltaLabel'),
  deltaValue: document.getElementById('deltaValue'),
  deltaNote: document.getElementById('deltaNote'),
  deltaCard: document.getElementById('deltaCard'),
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
        ? parsed.pauses.map((p) => ({
            id: p.id || makeId(),
            from: typeof p.from === 'string' ? p.from : '',
            to: typeof p.to === 'string' ? p.to : ''
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

function makeId() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function getConfig() {
  return state.fridayMode
    ? { label: 'Freitag', targetMinutes: 300, fixedBreak: { start: 720, end: 735 }, fixedBreakLabel: '12:00 bis 12:15' }
    : { label: 'Standard', targetMinutes: 495, fixedBreak: { start: 720, end: 750 }, fixedBreakLabel: '12:00 bis 12:30' };
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
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

function formatDuration(minutes, signed = false) {
  if (minutes === null || minutes === undefined || Number.isNaN(minutes)) return '--:-- h';
  const sign = minutes < 0 ? '-' : signed && minutes > 0 ? '+' : '';
  const abs = Math.abs(Math.round(minutes));
  const hours = Math.floor(abs / 60);
  const mins = abs % 60;
  return `${sign}${hours}:${String(mins).padStart(2, '0')} h`;
}

function mergeIntervals(intervals) {
  if (!intervals.length) return [];
  const sorted = [...intervals].sort((a, b) => a.start - b.start || a.end - b.end);
  const merged = [{ ...sorted[0] }];
  for (const interval of sorted.slice(1)) {
    const last = merged[merged.length - 1];
    if (interval.start <= last.end) {
      last.end = Math.max(last.end, interval.end);
    } else {
      merged.push({ ...interval });
    }
  }
  return merged;
}

function overlapMinutes(interval, rangeStart, rangeEnd) {
  return Math.max(0, Math.min(interval.end, rangeEnd) - Math.max(interval.start, rangeStart));
}

function sumOverlap(intervals, rangeStart, rangeEnd) {
  return intervals.reduce((sum, interval) => sum + overlapMinutes(interval, rangeStart, rangeEnd), 0);
}

function getPauseAnalysis() {
  const valid = [];
  const invalid = [];
  state.pauses.forEach((pause, index) => {
    const from = parseTimeToMinutes(pause.from);
    const to = parseTimeToMinutes(pause.to);

    if (!pause.from && !pause.to) {
      invalid.push({ index, reason: 'Bitte Start und Ende der Pause eintragen.' });
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
    valid.push({ start: from, end: to, index });
  });
  return { valid, invalid };
}

function getAllBreakIntervals(config) {
  const { valid, invalid } = getPauseAnalysis();
  const fixed = [{ start: config.fixedBreak.start, end: config.fixedBreak.end }];
  const merged = mergeIntervals([...fixed, ...valid]);
  return { valid, invalid, fixed, merged };
}

function calculateProductive(rangeStart, rangeEnd, config) {
  if (rangeStart === null || rangeEnd === null || rangeEnd <= rangeStart) {
    const info = getPauseAnalysis();
    return {
      presence: 0,
      productive: 0,
      fixedBreakMinutes: 0,
      customBreakMinutes: 0,
      totalBreakMinutes: 0,
      invalidPauses: info.invalid
    };
  }
  const { invalid, fixed, merged } = getAllBreakIntervals(config);
  const presence = rangeEnd - rangeStart;
  const fixedBreakMinutes = sumOverlap(fixed, rangeStart, rangeEnd);
  const totalBreakMinutes = sumOverlap(merged, rangeStart, rangeEnd);
  const customBreakMinutes = Math.max(0, totalBreakMinutes - fixedBreakMinutes);
  const productive = Math.max(0, presence - totalBreakMinutes);
  return { presence, productive, fixedBreakMinutes, customBreakMinutes, totalBreakMinutes, invalidPauses: invalid };
}

function calculateLeaveTime(startMinutes, config) {
  if (startMinutes === null) return null;
  const { merged } = getAllBreakIntervals(config);
  const relevant = merged.filter((interval) => interval.end > startMinutes);
  let current = startMinutes;
  let remaining = config.targetMinutes;

  for (const interval of relevant) {
    if (interval.end <= current) continue;
    if (interval.start <= current) {
      current = Math.max(current, interval.end);
      continue;
    }
    const workChunk = interval.start - current;
    if (remaining <= workChunk) return current + remaining;
    remaining -= workChunk;
    current = interval.end;
  }
  return current + remaining;
}

function setText(node, value) {
  node.textContent = value;
}

function setStatus(tone, text) {
  elements.statusLine.className = `status-line ${tone}`;
  elements.statusLine.textContent = text;
}

function clearImportFeedback() {
  elements.importFeedback.textContent = '';
  elements.importFeedback.className = 'inline-note hidden';
}

function setImportFeedback(message, tone) {
  elements.importFeedback.textContent = message;
  elements.importFeedback.className = `inline-note import-${tone}`;
}

function getCurrentTimeString() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

async function readAtossImportText() {
  if (window.isSecureContext && navigator.clipboard?.readText) {
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (text) return text;
    } catch {}
  }
  const manual = window.prompt('ATOSS-JSON hier einfügen:');
  return typeof manual === 'string' ? manual.trim() : '';
}

function normalizeAtossImport(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('Kein gültiges JSON gefunden.');
  if (typeof payload.startTime !== 'string' || parseTimeToMinutes(payload.startTime) === null) {
    throw new Error('Startzeit fehlt oder ist ungültig.');
  }

  const closeOpenPauseAtNow = payload.currentState === 'Pause';
  const pauses = Array.isArray(payload.breaks) ? payload.breaks : [];

  return {
    startTime: payload.startTime,
    pauses: pauses.map((pause) => {
      const from = typeof pause?.from === 'string' ? pause.from : '';
      const to = typeof pause?.to === 'string' ? pause.to : '';
      if (parseTimeToMinutes(from) === null) {
        throw new Error('Mindestens eine Pause hat keine gültige Startzeit.');
      }
      const normalizedTo = parseTimeToMinutes(to) !== null ? to : closeOpenPauseAtNow ? getCurrentTimeString() : '';
      return { id: makeId(), from, to: normalizedTo };
    }),
    closeOpenPauseAtNow
  };
}

async function importAtossFromClipboard() {
  clearImportFeedback();
  try {
    const text = await readAtossImportText();
    if (!text) throw new Error('Kein Importtext vorhanden.');
    const payload = JSON.parse(text);
    const imported = normalizeAtossImport(payload);

    state.startTime = imported.startTime;
    state.pauses = imported.pauses;
    renderAll();

    const count = imported.pauses.length;
    setImportFeedback(`ATOSS-Import übernommen: Start ${imported.startTime}, ${count} ${count === 1 ? 'Pause' : 'Pausen'}.`, 'success');
  } catch (error) {
    setImportFeedback(error?.message || 'ATOSS-Import fehlgeschlagen.', 'error');
  }
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

  elements.pauseHint.classList.toggle('hidden', state.pauses.length > 0);

  state.pauses.forEach((pause, index) => {
    const node = elements.pauseRowTemplate.content.cloneNode(true);
    const row = node.querySelector('.pause-row');
    const from = node.querySelector('.pause-from');
    const to = node.querySelector('.pause-to');
    const remove = node.querySelector('.pause-remove');
    const note = node.querySelector('.pause-row-note');

    row.dataset.id = pause.id;
    from.value = pause.from;
    to.value = pause.to;
    remove.dataset.id = pause.id;

    if (invalidMap.has(index)) {
      row.classList.add('invalid');
      note.textContent = invalidMap.get(index);
    } else if (pause.from && pause.to) {
      note.textContent = `Pause wird von ${pause.from} bis ${pause.to} abgezogen.`;
    } else {
      note.textContent = 'Start und Ende eintragen oder die Pause löschen.';
    }

    elements.pauseList.appendChild(node);
  });

  if (invalid.length) {
    elements.pauseValidation.classList.remove('hidden');
    elements.pauseValidation.textContent = `${invalid.length} ungültige Pause${invalid.length > 1 ? 'n werden' : ' wird'} aktuell ignoriert.`;
  } else {
    elements.pauseValidation.classList.add('hidden');
    elements.pauseValidation.textContent = '';
  }
}

function renderMeta(config) {
  setText(elements.modePill, `${config.label} · ${formatDuration(config.targetMinutes)}`);
  setText(elements.fixedBreakChip, `Feste Pause: ${config.fixedBreakLabel}`);
  setText(elements.toggleCopy, state.fridayMode
    ? '5:00 h Sollzeit, feste Pause 12:00 bis 12:15.'
    : '8:15 h Sollzeit, feste Pause 12:00 bis 12:30.');
}

function renderHero(now, startMinutes, leaveTime) {
  setText(elements.heroClock, formatClockWithSeconds(now));
  setText(elements.heroLeave, formatClock(leaveTime));

  if (startMinutes === null) {
    setText(elements.heroRemaining, '--:-- h');
    return;
  }

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const remaining = leaveTime - nowMinutes;
  setText(elements.heroRemaining, formatDuration(Math.abs(remaining), remaining < 0));
}

function renderLive(now, startMinutes, leaveTime, config) {
  setText(elements.liveBadge, formatClockWithSeconds(now));

  if (startMinutes === null) {
    setText(elements.liveWorked, '--:-- h');
    setText(elements.liveMissing, '--:-- h');
    setText(elements.liveOvertime, '+0:00 h');
    setText(elements.liveUntilLeave, '--:-- h');
    return;
  }

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const workedNow = calculateProductive(startMinutes, Math.max(startMinutes, nowMinutes), config);
  const missing = Math.max(0, config.targetMinutes - workedNow.productive);
  const overtime = Math.max(0, workedNow.productive - config.targetMinutes);
  const untilLeave = leaveTime - nowMinutes;

  setText(elements.liveWorked, formatDuration(workedNow.productive));
  setText(elements.liveMissing, formatDuration(missing));
  setText(elements.liveOvertime, formatDuration(overtime, true));
  setText(elements.liveUntilLeave, formatDuration(Math.abs(untilLeave), untilLeave < 0));
}

function renderResult(startMinutes, targetMinutes, config) {
  if (startMinutes === null) {
    setText(elements.targetProductive, '--:-- h');
    setText(elements.totalBreaks, '--:-- h');
    setText(elements.deltaValue, '±0:00 h');
    setText(elements.deltaLabel, 'Differenz zur Sollzeit');
    setText(elements.deltaNote, 'Überschuss oder Fehlzeit');
    setStatus('danger', 'Bitte gib eine gültige Einstempelzeit ein.');
    setText(elements.detailText, 'Sobald eine gültige Startzeit eingetragen ist, erscheint hier die komplette Erklärung.');
    return;
  }

  const leaveTime = calculateLeaveTime(startMinutes, config);

  if (targetMinutes === null || targetMinutes <= startMinutes) {
    const now = new Date();
    const live = calculateProductive(startMinutes, Math.max(startMinutes, now.getHours() * 60 + now.getMinutes()), config);
    const delta = live.productive - config.targetMinutes;

    setText(elements.targetProductive, '--:-- h');
    setText(elements.totalBreaks, formatDuration(live.totalBreakMinutes));
    setText(elements.deltaValue, formatDuration(delta, true));
    setText(elements.deltaLabel, delta > 0 ? 'Schon drüber' : 'Noch fehlend');
    setText(elements.deltaNote, 'Live gegen Sollzeit');
    setStatus('neutral', `Dein berechneter Feierabend liegt bei ${formatClock(leaveTime)}.`);
    setText(elements.detailText, `Mit Start um ${formatClock(startMinutes)} und allen hinterlegten Pausen liegt dein Feierabend bei ${formatClock(leaveTime)}.`);
    return;
  }

  const result = calculateProductive(startMinutes, targetMinutes, config);
  const difference = result.productive - config.targetMinutes;

  setText(elements.targetProductive, formatDuration(result.productive));
  setText(elements.totalBreaks, formatDuration(result.totalBreakMinutes));
  setText(elements.deltaValue, formatDuration(difference, true));
  setText(elements.deltaLabel, 'Differenz zur Sollzeit');
  setText(elements.deltaNote, 'Überschuss oder Fehlzeit');

  if (difference > 0) {
    setStatus('warning', `Bis ${state.targetTime} arbeitest du ${formatDuration(difference)} über deiner Sollzeit.`);
  } else if (difference < 0) {
    setStatus('danger', `Bis ${state.targetTime} fehlen dir noch ${formatDuration(Math.abs(difference))} bis zur Sollzeit.`);
  } else {
    setStatus('success', `Bis ${state.targetTime} triffst du deine Sollzeit genau.`);
  }

  const invalidCount = result.invalidPauses.length;
  const invalidText = invalidCount ? ` ${invalidCount} ungültige Zusatzpause${invalidCount > 1 ? 'n wurden' : ' wurde'} ignoriert.` : '';
  const ending = difference > 0
    ? ` Du liegst damit ${formatDuration(difference)} über deiner Sollzeit.`
    : difference < 0
      ? ` Es fehlen noch ${formatDuration(Math.abs(difference))} bis zur Sollzeit.`
      : ' Damit erreichst du exakt deine Sollzeit.';

  setText(
    elements.detailText,
    `Von ${formatClock(startMinutes)} bis ${formatClock(targetMinutes)} sind es ${formatDuration(result.presence)} Anwesenheit. Nach Abzug von ${formatDuration(result.fixedBreakMinutes)} fester Pause und ${formatDuration(result.customBreakMinutes)} zusätzlicher Pause bleiben ${formatDuration(result.productive)} Arbeitszeit.${ending}${invalidText}`
  );
}

function renderAll() {
  syncFormFromState();
  renderPauseRows();

  const config = getConfig();
  const startMinutes = parseTimeToMinutes(state.startTime);
  const targetMinutes = parseTimeToMinutes(state.targetTime);
  const leaveTime = calculateLeaveTime(startMinutes, config);
  const now = new Date();

  renderMeta(config);
  renderHero(now, startMinutes, leaveTime);
  renderLive(now, startMinutes, leaveTime, config);
  renderResult(startMinutes, targetMinutes, config);

  saveState();
}

function addPause() {
  clearImportFeedback();
  state.pauses.push({ id: makeId(), from: '', to: '' });
  renderAll();
}

function resetAll() {
  state = { ...defaultState, pauses: [] };
  clearImportFeedback();
  renderAll();
}

function handlePauseListInput(event) {
  const row = event.target.closest('.pause-row');
  if (!row) return;
  const pause = state.pauses.find((item) => item.id === row.dataset.id);
  if (!pause) return;

  if (event.target.classList.contains('pause-from')) pause.from = event.target.value;
  if (event.target.classList.contains('pause-to')) pause.to = event.target.value;

  clearImportFeedback();
  renderAll();
}

function handlePauseListClick(event) {
  const button = event.target.closest('.pause-remove');
  if (!button) return;
  state.pauses = state.pauses.filter((item) => item.id !== button.dataset.id);
  clearImportFeedback();
  renderAll();
}

function bindEvents() {
  elements.startTime.addEventListener('input', (event) => {
    state.startTime = event.target.value;
    clearImportFeedback();
    renderAll();
  });
  elements.targetTime.addEventListener('input', (event) => {
    state.targetTime = event.target.value;
    clearImportFeedback();
    renderAll();
  });
  elements.fridayMode.addEventListener('change', (event) => {
    state.fridayMode = event.target.checked;
    clearImportFeedback();
    renderAll();
  });
  elements.addPauseButton.addEventListener('click', addPause);
  elements.calculateButton.addEventListener('click', renderAll);
  elements.importAtossButton.addEventListener('click', importAtossFromClipboard);
  elements.resetButton.addEventListener('click', resetAll);
  elements.pauseList.addEventListener('input', handlePauseListInput);
  elements.pauseList.addEventListener('click', handlePauseListClick);
}

bindEvents();
renderAll();
setInterval(() => {
  const config = getConfig();
  const startMinutes = parseTimeToMinutes(state.startTime);
  const leaveTime = calculateLeaveTime(startMinutes, config);
  const now = new Date();
  renderHero(now, startMinutes, leaveTime);
  renderLive(now, startMinutes, leaveTime, config);
}, 1000);
