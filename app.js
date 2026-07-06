const STORAGE_KEY = 'zeitrechner_auto_atoss_v2';
const OLD_STORAGE_KEY = 'zeitrechner_auto_atoss_v1';

const defaultState = {
  startTime: '07:00',
  targetTime: '17:00',
  fridayMode: false,
  workPreset: 'standard',
  customWorkTime: '08:15',
  breakPreset: 'standard',
  customBreakFrom: '12:00',
  customBreakTo: '12:30',
  pauses: [],
  atossMeta: null
};

const els = {
  currentClock: document.getElementById('currentClock'),
  atossStatus: document.getElementById('atossStatus'),
  startTime: document.getElementById('startTime'),
  targetTime: document.getElementById('targetTime'),
  fridayMode: document.getElementById('fridayMode'),
  fridayHint: document.getElementById('fridayHint'),
  workPreset: document.getElementById('workPreset'),
  customWorkRow: document.getElementById('customWorkRow'),
  customWorkTime: document.getElementById('customWorkTime'),
  breakPreset: document.getElementById('breakPreset'),
  customBreakRow: document.getElementById('customBreakRow'),
  customBreakFrom: document.getElementById('customBreakFrom'),
  customBreakTo: document.getElementById('customBreakTo'),
  addPauseButton: document.getElementById('addPauseButton'),
  calculateButton: document.getElementById('calculateButton'),
  resetButton: document.getElementById('resetButton'),
  pauseList: document.getElementById('pauseList'),
  pauseHint: document.getElementById('pauseHint'),
  feedback: document.getElementById('feedback'),
  pauseRowTemplate: document.getElementById('pauseRowTemplate'),
  calculatedLeave: document.getElementById('calculatedLeave'),
  targetLeave: document.getElementById('targetLeave'),
  remainingToLeave: document.getElementById('remainingToLeave'),
  remainingNote: document.getElementById('remainingNote'),
  overtimeBox: document.getElementById('overtimeBox'),
  targetOvertime: document.getElementById('targetOvertime'),
  settingStart: document.getElementById('settingStart'),
  settingWork: document.getElementById('settingWork'),
  settingFixedBreak: document.getElementById('settingFixedBreak'),
  settingCustomBreaks: document.getElementById('settingCustomBreaks'),
  settingTotalBreaks: document.getElementById('settingTotalBreaks'),
  settingAtoss: document.getElementById('settingAtoss')
};

let state = loadState();

function makeId() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(OLD_STORAGE_KEY);
    if (!raw) return { ...defaultState, pauses: [] };
    const parsed = JSON.parse(raw);
    return {
      ...defaultState,
      ...parsed,
      pauses: Array.isArray(parsed.pauses)
        ? parsed.pauses.map((pause) => ({
            id: pause.id || makeId(),
            from: typeof pause.from === 'string' ? pause.from : '',
            to: typeof pause.to === 'string' ? pause.to : ''
          }))
        : []
    };
  } catch {
    return { ...defaultState, pauses: [] };
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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

function formatDuration(minutes, signed = false) {
  if (minutes === null || minutes === undefined || Number.isNaN(minutes)) return '--:-- h';
  const sign = minutes < 0 ? '-' : signed && minutes > 0 ? '+' : '';
  const abs = Math.abs(Math.round(minutes));
  const hours = Math.floor(abs / 60);
  const mins = abs % 60;
  return `${sign}${hours}:${String(mins).padStart(2, '0')} h`;
}

function formatClockWithSeconds(date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
}

function getWorkMinutes() {
  switch (state.workPreset) {
    case 'friday': return 300;
    case 'eight': return 480;
    case 'seven45': return 465;
    case 'custom': return parseTimeToMinutes(state.customWorkTime);
    case 'standard':
    default: return 495;
  }
}

function getFixedBreak() {
  if (state.breakPreset === 'none') return null;
  if (state.breakPreset === 'short') return { start: 720, end: 735, label: '12:00 - 12:15' };
  if (state.breakPreset === 'custom') {
    const start = parseTimeToMinutes(state.customBreakFrom);
    const end = parseTimeToMinutes(state.customBreakTo);
    if (start === null || end === null || end <= start) return null;
    return { start, end, label: `${state.customBreakFrom} - ${state.customBreakTo}` };
  }
  return { start: 720, end: 750, label: '12:00 - 12:30' };
}

function mergeIntervals(intervals) {
  if (!intervals.length) return [];
  const sorted = [...intervals].sort((a, b) => a.start - b.start || a.end - b.end);
  const merged = [{ ...sorted[0] }];
  for (const interval of sorted.slice(1)) {
    const last = merged[merged.length - 1];
    if (interval.start <= last.end) last.end = Math.max(last.end, interval.end);
    else merged.push({ ...interval });
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
  const validCustom = [];
  const incomplete = [];
  const invalid = [];

  state.pauses.forEach((pause, index) => {
    const from = parseTimeToMinutes(pause.from);
    const to = parseTimeToMinutes(pause.to);

    if (!pause.from && !pause.to) {
      incomplete.push({ index, reason: 'Noch nicht vollständig.' });
      return;
    }
    if (from === null || to === null) {
      incomplete.push({ index, reason: 'Noch nicht vollständig.' });
      return;
    }
    if (to <= from) {
      invalid.push({ index, reason: 'Bis muss nach Von liegen.' });
      return;
    }
    validCustom.push({ start: from, end: to, index });
  });

  return { validCustom, incomplete, invalid };
}

function getAllBreakIntervals() {
  const fixedBreak = getFixedBreak();
  const fixed = fixedBreak ? [{ start: fixedBreak.start, end: fixedBreak.end }] : [];
  const { validCustom, incomplete, invalid } = getPauseAnalysis();
  const mergedAll = mergeIntervals([...fixed, ...validCustom]);
  return { fixedBreak, fixed, validCustom, incomplete, invalid, mergedAll };
}

function calculateProductive(rangeStart, rangeEnd) {
  const { fixed, mergedAll, invalid } = getAllBreakIntervals();
  if (rangeStart === null || rangeEnd === null || rangeEnd <= rangeStart) {
    return { presence: 0, productive: 0, totalBreaks: 0, fixedBreaks: 0, customBreaks: 0, invalid };
  }
  const presence = rangeEnd - rangeStart;
  const fixedBreaks = sumOverlap(fixed, rangeStart, rangeEnd);
  const totalBreaks = sumOverlap(mergedAll, rangeStart, rangeEnd);
  const customBreaks = Math.max(0, totalBreaks - fixedBreaks);
  return { presence, productive: Math.max(0, presence - totalBreaks), totalBreaks, fixedBreaks, customBreaks, invalid };
}

function calculateLeaveTime(startMinutes) {
  const targetWork = getWorkMinutes();
  if (startMinutes === null || targetWork === null) return null;
  const { mergedAll } = getAllBreakIntervals();
  const relevantBreaks = mergedAll.filter((interval) => interval.end > startMinutes);
  let current = startMinutes;
  let remaining = targetWork;

  for (const interval of relevantBreaks) {
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

function showFeedback(message, tone = 'warning') {
  els.feedback.textContent = message;
  els.feedback.className = `feedback show ${tone}`;
}

function clearFeedback() {
  els.feedback.textContent = '';
  els.feedback.className = 'feedback';
}

function applyFridayDefaults(isFriday) {
  state.fridayMode = isFriday;
  if (isFriday) {
    state.workPreset = 'friday';
    state.breakPreset = 'short';
  } else {
    state.workPreset = 'standard';
    state.breakPreset = 'standard';
  }
}

function syncFormFromState() {
  els.startTime.value = state.startTime;
  els.targetTime.value = state.targetTime;
  els.fridayMode.checked = state.fridayMode;
  els.workPreset.value = state.workPreset;
  els.customWorkTime.value = state.customWorkTime;
  els.breakPreset.value = state.breakPreset;
  els.customBreakFrom.value = state.customBreakFrom;
  els.customBreakTo.value = state.customBreakTo;
  els.customWorkRow.hidden = state.workPreset !== 'custom';
  els.customBreakRow.hidden = state.breakPreset !== 'custom';
  els.fridayHint.textContent = state.fridayMode
    ? 'An: Standard 5:00 h und Pause 12:00 bis 12:15.'
    : 'Aus: Standard 8:15 h und Pause 12:00 bis 12:30.';
}

function updatePauseRowStatus(row, pause) {
  const note = row.querySelector('.pause-row-note');
  row.classList.remove('invalid');
  const from = parseTimeToMinutes(pause.from);
  const to = parseTimeToMinutes(pause.to);

  if (!pause.from && !pause.to) {
    note.textContent = 'Neutral: noch nicht vollständig und wird nicht berechnet.';
    return;
  }
  if (from === null || to === null) {
    note.textContent = 'Noch nicht vollständig und wird nicht berechnet.';
    return;
  }
  if (to <= from) {
    row.classList.add('invalid');
    note.textContent = 'Ungültig: Bis muss nach Von liegen. Wird ignoriert.';
    return;
  }
  note.textContent = `Pause ${pause.from} bis ${pause.to} wird abgezogen.`;
}

function renderPauseRows() {
  els.pauseList.innerHTML = '';
  els.pauseHint.style.display = state.pauses.length ? 'none' : 'block';

  state.pauses.forEach((pause) => {
    const fragment = els.pauseRowTemplate.content.cloneNode(true);
    const row = fragment.querySelector('.pause-row');
    const fromInput = fragment.querySelector('.pause-from');
    const toInput = fragment.querySelector('.pause-to');
    const deleteButton = fragment.querySelector('[data-action="remove"]');

    row.dataset.id = pause.id;
    fromInput.value = pause.from || '';
    toInput.value = pause.to || '';
    deleteButton.dataset.id = pause.id;
    updatePauseRowStatus(row, pause);
    els.pauseList.appendChild(fragment);
  });
}

function parseAtossDate(dateString) {
  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(dateString || '');
  if (!match) return null;
  const [, day, month, year] = match;
  return new Date(`${year}-${month}-${day}T12:00:00`);
}

function decodeHashPayload(hashValue) {
  const prefix = '#atoss=';
  if (!hashValue.startsWith(prefix)) return null;
  const encoded = hashValue.slice(prefix.length);
  if (!encoded) return null;
  const binary = atob(decodeURIComponent(encoded));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  const jsonText = new TextDecoder().decode(bytes);
  return JSON.parse(jsonText);
}

function getNowTimeString() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

function importAtossPayload(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('Kein gültiges ATOSS-Paket gefunden.');
  if (typeof payload.startTime !== 'string' || parseTimeToMinutes(payload.startTime) === null) throw new Error('ATOSS-Startzeit fehlt oder ist ungültig.');

  state.startTime = payload.startTime;
  const currentState = payload.currentState === 'Pause' ? 'Pause' : 'Anwesenheit';
  state.pauses = (Array.isArray(payload.breaks) ? payload.breaks : []).map((pause) => {
    const from = typeof pause?.from === 'string' ? pause.from : '';
    let to = typeof pause?.to === 'string' ? pause.to : '';
    if (parseTimeToMinutes(from) === null) throw new Error('Eine ATOSS-Pause hat keine gültige Startzeit.');
    if (parseTimeToMinutes(to) === null && currentState === 'Pause') to = getNowTimeString();
    return { id: makeId(), from, to };
  });

  const importedDate = parseAtossDate(payload.date);
  if (importedDate) applyFridayDefaults(importedDate.getDay() === 5);

  state.atossMeta = {
    date: payload.date || null,
    importedAt: new Date().toISOString(),
    eventCount: Array.isArray(payload.rawEvents) ? payload.rawEvents.length : null
  };
  showFeedback(`ATOSS übernommen: Start ${state.startTime}, ${state.pauses.length} Zusatzpause(n).`, 'success');
  renderAll({ renderPauses: true });
}

function readHashImport() {
  if (!location.hash.startsWith('#atoss=')) return;
  try {
    const payload = decodeHashPayload(location.hash);
    importAtossPayload(payload);
    history.replaceState(null, '', location.pathname + location.search);
  } catch (error) {
    showFeedback(error?.message || 'ATOSS-Import fehlgeschlagen.', 'danger');
  }
}

function updateStaticUi() {
  const targetWork = getWorkMinutes();
  const fixedBreak = getFixedBreak();
  els.atossStatus.textContent = state.atossMeta?.date ? `ATOSS: Import ${state.atossMeta.date}` : 'ATOSS: kein Import';
  els.settingAtoss.textContent = state.atossMeta?.date ? `Import ${state.atossMeta.date}` : 'kein Import';
  els.settingWork.textContent = formatDuration(targetWork);
  els.settingFixedBreak.textContent = fixedBreak ? fixedBreak.label : 'Keine feste Pause';
}

function renderResults() {
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const startMinutes = parseTimeToMinutes(state.startTime);
  const targetMinutes = parseTimeToMinutes(state.targetTime);
  const targetWork = getWorkMinutes();
  const leaveTime = calculateLeaveTime(startMinutes);
  const targetCalc = calculateProductive(startMinutes, targetMinutes);
  const leaveCalc = calculateProductive(startMinutes, leaveTime);

  els.currentClock.textContent = formatClockWithSeconds(now);
  els.calculatedLeave.textContent = formatClock(leaveTime);
  els.targetLeave.textContent = targetMinutes === null ? '--:--' : formatClock(targetMinutes);

  if (leaveTime === null) {
    els.remainingToLeave.textContent = '--:-- h';
    els.remainingNote.textContent = 'Startzeit oder Sollzeit ungültig.';
  } else {
    const remaining = leaveTime - nowMinutes;
    if (remaining >= 0) {
      els.remainingToLeave.textContent = formatDuration(remaining);
      els.remainingNote.textContent = 'Zeit bis zum berechneten Feierabend ab aktueller Uhrzeit';
    } else {
      els.remainingToLeave.textContent = `seit ${formatDuration(Math.abs(remaining))} überschritten`;
      els.remainingNote.textContent = 'Der berechnete Feierabend ist bereits vorbei.';
    }
  }

  if (targetMinutes === null || startMinutes === null || targetMinutes <= startMinutes || targetWork === null) {
    els.targetOvertime.textContent = '--:-- h';
    els.overtimeBox.className = 'meter red';
  } else {
    const overtime = targetCalc.productive - targetWork;
    els.targetOvertime.textContent = formatDuration(overtime, true);
    els.overtimeBox.className = overtime < 0 ? 'meter red' : 'meter green';
  }

  const { validCustom, invalid, incomplete } = getPauseAnalysis();
  els.settingStart.textContent = startMinutes === null ? '--:--' : formatClock(startMinutes);
  els.settingCustomBreaks.textContent = validCustom.length ? validCustom.map((p) => `${formatClock(p.start)}-${formatClock(p.end)}`).join(', ') : 'Keine gültigen Zusatzpausen';
  els.settingTotalBreaks.textContent = formatDuration(leaveCalc.totalBreaks || targetCalc.totalBreaks);

  if (invalid.length) showFeedback(`${invalid.length} ungültige Zusatzpause(n) werden ignoriert.`, 'warning');
  else if (incomplete.length && document.activeElement?.closest('.pause-row')) {}
  else if (!els.feedback.classList.contains('success')) clearFeedback();

  updateStaticUi();
  saveState();
}

function renderAll(options = {}) {
  syncFormFromState();
  if (options.renderPauses) renderPauseRows();
  renderResults();
}

function addPause() {
  clearFeedback();
  state.pauses.push({ id: makeId(), from: '', to: '' });
  renderAll({ renderPauses: true });
}

function resetAll() {
  state = { ...defaultState, pauses: [] };
  localStorage.removeItem(STORAGE_KEY);
  clearFeedback();
  renderAll({ renderPauses: true });
}

function handlePauseInput(event) {
  const row = event.target.closest('.pause-row');
  if (!row) return;
  const pause = state.pauses.find((item) => item.id === row.dataset.id);
  if (!pause) return;

  if (event.target.classList.contains('pause-from')) pause.from = event.target.value;
  if (event.target.classList.contains('pause-to')) pause.to = event.target.value;

  clearFeedback();
  updatePauseRowStatus(row, pause);
  renderResults();
}

function bindEvents() {
  els.startTime.addEventListener('input', (event) => { state.startTime = event.target.value; clearFeedback(); renderResults(); });
  els.targetTime.addEventListener('input', (event) => { state.targetTime = event.target.value; clearFeedback(); renderResults(); });
  els.fridayMode.addEventListener('change', (event) => { clearFeedback(); applyFridayDefaults(event.target.checked); renderAll(); });
  els.workPreset.addEventListener('change', (event) => { state.workPreset = event.target.value; clearFeedback(); renderAll(); });
  els.customWorkTime.addEventListener('input', (event) => { state.customWorkTime = event.target.value; clearFeedback(); renderResults(); saveState(); });
  els.breakPreset.addEventListener('change', (event) => { state.breakPreset = event.target.value; clearFeedback(); renderAll(); });
  els.customBreakFrom.addEventListener('input', (event) => { state.customBreakFrom = event.target.value; clearFeedback(); renderResults(); saveState(); });
  els.customBreakTo.addEventListener('input', (event) => { state.customBreakTo = event.target.value; clearFeedback(); renderResults(); saveState(); });
  els.addPauseButton.addEventListener('click', addPause);
  els.calculateButton.addEventListener('click', () => renderAll());
  els.resetButton.addEventListener('click', resetAll);
  els.pauseList.addEventListener('input', handlePauseInput);
  els.pauseList.addEventListener('change', handlePauseInput);
  els.pauseList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action="remove"]');
    if (!button) return;
    state.pauses = state.pauses.filter((pause) => pause.id !== button.dataset.id);
    clearFeedback();
    renderAll({ renderPauses: true });
  });
  window.addEventListener('hashchange', readHashImport);
}

bindEvents();
readHashImport();
renderAll({ renderPauses: true });
setInterval(renderResults, 1000);