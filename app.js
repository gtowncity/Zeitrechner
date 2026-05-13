const STORAGE_KEY = 'zeitrechner_state_v1';

const elements = {
  startTime: document.getElementById('startTime'),
  targetTime: document.getElementById('targetTime'),
  fridayMode: document.getElementById('fridayMode'),
  addPauseButton: document.getElementById('addPauseButton'),
  calculateButton: document.getElementById('calculateButton'),
  resetButton: document.getElementById('resetButton'),
  pauseList: document.getElementById('pauseList'),
  pauseHint: document.getElementById('pauseHint'),
  pauseValidation: document.getElementById('pauseValidation'),
  pauseRowTemplate: document.getElementById('pauseRowTemplate'),

  modePill: document.getElementById('modePill'),
  fixedPausePill: document.getElementById('fixedPausePill'),
  heroClock: document.getElementById('heroClock'),
  heroLeaveTime: document.getElementById('heroLeaveTime'),
  heroLeaveNote: document.getElementById('heroLeaveNote'),
  heroRemaining: document.getElementById('heroRemaining'),
  heroRemainingNote: document.getElementById('heroRemainingNote'),

  liveBadge: document.getElementById('liveBadge'),
  liveWorked: document.getElementById('liveWorked'),
  liveMissing: document.getElementById('liveMissing'),
  liveOvertime: document.getElementById('liveOvertime'),
  liveUntilLeave: document.getElementById('liveUntilLeave'),
  liveUntilLeaveNote: document.getElementById('liveUntilLeaveNote'),

  resultLeaveTime: document.getElementById('resultLeaveTime'),
  resultLeaveNote: document.getElementById('resultLeaveNote'),
  resultProductive: document.getElementById('resultProductive'),
  resultPresence: document.getElementById('resultPresence'),
  resultFixedPause: document.getElementById('resultFixedPause'),
  resultFixedPauseNote: document.getElementById('resultFixedPauseNote'),
  resultCustomPause: document.getElementById('resultCustomPause'),
  resultCustomPauseNote: document.getElementById('resultCustomPauseNote'),
  resultTotalBreaks: document.getElementById('resultTotalBreaks'),
  resultDifference: document.getElementById('resultDifference'),
  resultStatus: document.getElementById('resultStatus'),
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
            id: pause.id || makeId(),
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

function makeId() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function getConfig() {
  return state.fridayMode
    ? {
        label: 'Freitag',
        targetMinutes: 5 * 60,
        fixedBreak: { start: 12 * 60, end: 12 * 60 + 15 },
        fixedBreakLabel: '12:00 – 12:15'
      }
    : {
        label: 'Standard',
        targetMinutes: 8 * 60 + 15,
        fixedBreak: { start: 12 * 60, end: 12 * 60 + 30 },
        fixedBreakLabel: '12:00 – 12:30'
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
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

function formatDuration(minutes, options = {}) {
  const { signed = false, placeholder = '--:-- h' } = options;
  if (minutes === null || minutes === undefined || Number.isNaN(minutes)) return placeholder;
  const sign = minutes < 0 ? '-' : signed && minutes > 0 ? '+' : '';
  const abs = Math.abs(Math.round(minutes));
  const hours = Math.floor(abs / 60);
  const mins = abs % 60;
  return `${sign}${hours}:${String(mins).padStart(2, '0')} h`;
}

function mergeIntervals(intervals) {
  if (!intervals.length) return [];
  const sorted = [...intervals]
    .map((interval) => ({ start: interval.start, end: interval.end }))
    .sort((a, b) => a.start - b.start || a.end - b.end);

  const merged = [sorted[0]];
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
  const validCustom = [];
  const invalidPauses = [];

  state.pauses.forEach((pause, index) => {
    const from = parseTimeToMinutes(pause.from);
    const to = parseTimeToMinutes(pause.to);

    if (!pause.from && !pause.to) {
      invalidPauses.push({ index, reason: 'Bitte Start und Ende der Pause eintragen.' });
      return;
    }
    if (from === null || to === null) {
      invalidPauses.push({ index, reason: 'Zeitformat unvollständig.' });
      return;
    }
    if (to <= from) {
      invalidPauses.push({ index, reason: 'Pause muss nach der Startzeit enden.' });
      return;
    }

    validCustom.push({ start: from, end: to, index });
  });

  return { validCustom, invalidPauses };
}

function getAllBreakIntervals(config) {
  const { validCustom, invalidPauses } = getPauseAnalysis();
  const fixed = [{ start: config.fixedBreak.start, end: config.fixedBreak.end }];
  const mergedAll = mergeIntervals([...fixed, ...validCustom]);
  return { validCustom, invalidPauses, fixed, mergedAll };
}

function calculateProductive(rangeStart, rangeEnd, config) {
  if (rangeStart === null || rangeEnd === null || rangeEnd <= rangeStart) {
    return {
      presence: 0,
      productive: 0,
      fixedBreakMinutes: 0,
      customBreakMinutes: 0,
      totalBreakMinutes: 0,
      invalidPauses: getPauseAnalysis().invalidPauses,
      validCustomCount: getPauseAnalysis().validCustom.length
    };
  }

  const { validCustom, invalidPauses, fixed, mergedAll } = getAllBreakIntervals(config);
  const presence = rangeEnd - rangeStart;
  const fixedBreakMinutes = sumOverlap(fixed, rangeStart, rangeEnd);
  const totalBreakMinutes = sumOverlap(mergedAll, rangeStart, rangeEnd);
  const customBreakMinutes = Math.max(0, totalBreakMinutes - fixedBreakMinutes);
  const productive = Math.max(0, presence - totalBreakMinutes);

  return {
    presence,
    productive,
    fixedBreakMinutes,
    customBreakMinutes,
    totalBreakMinutes,
    invalidPauses,
    validCustomCount: validCustom.length
  };
}

function calculateLeaveTime(startMinutes, config) {
  if (startMinutes === null) return null;
  const { mergedAll } = getAllBreakIntervals(config);
  const relevantBreaks = mergedAll.filter((interval) => interval.end > startMinutes);

  let current = startMinutes;
  let remaining = config.targetMinutes;

  for (const interval of relevantBreaks) {
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

function setText(node, value) {
  if (node) node.textContent = value;
}

function setStatus(element, tone, text) {
  element.className = `status-panel ${tone}`;
  element.textContent = text;
}

function syncFormFromState() {
  elements.startTime.value = state.startTime;
  elements.targetTime.value = state.targetTime;
  elements.fridayMode.checked = state.fridayMode;
}

function renderPauseRows() {
  elements.pauseList.innerHTML = '';
  const pauseAnalysis = getPauseAnalysis();
  const invalidByIndex = new Map(pauseAnalysis.invalidPauses.map((pause) => [pause.index, pause.reason]));

  if (!state.pauses.length) {
    elements.pauseHint.classList.remove('hidden');
  } else {
    elements.pauseHint.classList.add('hidden');
  }

  state.pauses.forEach((pause, index) => {
    const fragment = elements.pauseRowTemplate.content.cloneNode(true);
    const row = fragment.querySelector('.pause-row');
    const fromInput = fragment.querySelector('.pause-from');
    const toInput = fragment.querySelector('.pause-to');
    const removeButton = fragment.querySelector('[data-action="remove-pause"]');
    const note = fragment.querySelector('.pause-row-note');

    row.dataset.id = pause.id;
    fromInput.value = pause.from || '';
    toInput.value = pause.to || '';
    removeButton.dataset.id = pause.id;

    if (invalidByIndex.has(index)) {
      row.classList.add('invalid');
      note.textContent = invalidByIndex.get(index);
    } else if (pause.from && pause.to) {
      note.textContent = `Pause wird von ${pause.from} bis ${pause.to} abgezogen.`;
    } else {
      note.textContent = 'Start und Ende eintragen oder die Pause löschen.';
    }

    elements.pauseList.appendChild(fragment);
  });

  if (pauseAnalysis.invalidPauses.length) {
    elements.pauseValidation.classList.remove('hidden');
    elements.pauseValidation.textContent = `${pauseAnalysis.invalidPauses.length} ungültige Pause${pauseAnalysis.invalidPauses.length > 1 ? 'n werden' : ' wird'} aktuell ignoriert.`;
  } else {
    elements.pauseValidation.classList.add('hidden');
    elements.pauseValidation.textContent = '';
  }
}

function renderMeta(config) {
  setText(elements.modePill, `${config.label} · ${formatDuration(config.targetMinutes).replace(' h', ' h')}`);
  setText(elements.fixedPausePill, `Feste Pause · ${config.fixedBreakLabel}`);
}

function renderHero(now, startMinutes, leaveTime, config) {
  setText(elements.heroClock, formatClockWithSeconds(now));
  setText(elements.heroLeaveTime, formatClock(leaveTime));
  setText(elements.heroLeaveNote, `${config.label} · Sollzeit ${formatDuration(config.targetMinutes)}`);

  if (startMinutes === null) {
    setText(elements.heroRemaining, '--:-- h');
    setText(elements.heroRemainingNote, 'Bitte zuerst eine Startzeit eintragen.');
    return;
  }

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const remaining = leaveTime - nowMinutes;

  if (nowMinutes < startMinutes) {
    setText(elements.heroRemaining, formatDuration(Math.max(0, remaining)));
    setText(elements.heroRemainingNote, `Der Arbeitstag startet um ${formatClock(startMinutes)}.`);
  } else if (remaining > 0) {
    setText(elements.heroRemaining, formatDuration(remaining));
    setText(elements.heroRemainingNote, 'Live ab aktueller Uhrzeit berechnet.');
  } else {
    setText(elements.heroRemaining, formatDuration(Math.abs(remaining), { signed: true }));
    setText(elements.heroRemainingNote, 'Du bist bereits über deinem berechneten Feierabend.');
  }
}

function renderLive(now, startMinutes, leaveTime, config) {
  setText(elements.liveBadge, formatClockWithSeconds(now));

  if (startMinutes === null) {
    setText(elements.liveWorked, '--:-- h');
    setText(elements.liveMissing, '--:-- h');
    setText(elements.liveOvertime, '+0:00 h');
    setText(elements.liveUntilLeave, '--:-- h');
    setText(elements.liveUntilLeaveNote, 'Bitte zuerst eine Startzeit eingeben.');
    return;
  }

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const workedNow = calculateProductive(startMinutes, Math.max(startMinutes, nowMinutes), config);
  const missing = Math.max(0, config.targetMinutes - workedNow.productive);
  const overtime = Math.max(0, workedNow.productive - config.targetMinutes);
  const untilLeave = leaveTime - nowMinutes;

  setText(elements.liveWorked, formatDuration(workedNow.productive));
  setText(elements.liveMissing, formatDuration(missing));
  setText(elements.liveOvertime, formatDuration(overtime, { signed: true }));

  if (nowMinutes < startMinutes) {
    setText(elements.liveUntilLeave, formatDuration(Math.max(0, untilLeave)));
    setText(elements.liveUntilLeaveNote, `Noch nicht gestartet · Beginn ${formatClock(startMinutes)}`);
  } else if (untilLeave >= 0) {
    setText(elements.liveUntilLeave, formatDuration(untilLeave));
    setText(elements.liveUntilLeaveNote, 'berechnet mit fester und zusätzlichen Pausen');
  } else {
    setText(elements.liveUntilLeave, formatDuration(Math.abs(untilLeave), { signed: true }));
    setText(elements.liveUntilLeaveNote, 'Du bist bereits über deinem berechneten Feierabend.');
  }
}

function renderResult(startMinutes, targetMinutes, config) {
  const leaveTime = calculateLeaveTime(startMinutes, config);
  setText(elements.resultLeaveTime, formatClock(leaveTime));
  setText(elements.resultLeaveNote, `${config.label} · Feierabend inkl. aller Pausen`);
  setText(elements.resultFixedPauseNote, `Fixe Pause ${config.fixedBreakLabel}`);

  if (startMinutes === null) {
    setText(elements.resultProductive, '--:-- h');
    setText(elements.resultPresence, 'Anwesenheit: --:-- h');
    setText(elements.resultFixedPause, '--:-- h');
    setText(elements.resultCustomPause, '--:-- h');
    setText(elements.resultTotalBreaks, '--:-- h');
    setText(elements.resultDifference, '±0:00 h');
    setStatus(elements.resultStatus, 'danger', 'Bitte gib eine gültige Einstempelzeit ein.');
    setText(elements.detailText, 'Sobald eine gültige Startzeit eingetragen ist, wird hier die komplette Erklärung angezeigt.');
    return;
  }

  if (!state.targetTime) {
    setText(elements.resultProductive, '--:-- h');
    setText(elements.resultPresence, 'Anwesenheit: --:-- h');
    setText(elements.resultFixedPause, '--:-- h');
    setText(elements.resultCustomPause, '--:-- h');
    setText(elements.resultTotalBreaks, '--:-- h');
    setText(elements.resultDifference, '±0:00 h');
    setStatus(elements.resultStatus, 'neutral', 'Optional kannst du zusätzlich eine Solluhrzeit eintragen.');
    setText(elements.detailText, `Dein berechneter Feierabend liegt bei ${formatClock(leaveTime)}.`);
    return;
  }

  if (targetMinutes === null || targetMinutes <= startMinutes) {
    setText(elements.resultProductive, '--:-- h');
    setText(elements.resultPresence, 'Anwesenheit: --:-- h');
    setText(elements.resultFixedPause, '--:-- h');
    setText(elements.resultCustomPause, '--:-- h');
    setText(elements.resultTotalBreaks, '--:-- h');
    setText(elements.resultDifference, '±0:00 h');
    setStatus(elements.resultStatus, 'danger', 'Die Solluhrzeit muss nach der Einstempelzeit liegen.');
    setText(elements.detailText, 'Bitte korrigiere die Solluhrzeit. Sie muss später als die Einstempelzeit sein.');
    return;
  }

  const result = calculateProductive(startMinutes, targetMinutes, config);
  const difference = result.productive - config.targetMinutes;

  setText(elements.resultProductive, formatDuration(result.productive));
  setText(elements.resultPresence, `Anwesenheit: ${formatDuration(result.presence)}`);
  setText(elements.resultFixedPause, formatDuration(result.fixedBreakMinutes));
  setText(elements.resultCustomPause, formatDuration(result.customBreakMinutes));
  setText(elements.resultTotalBreaks, formatDuration(result.totalBreakMinutes));
  setText(elements.resultDifference, formatDuration(difference, { signed: true, placeholder: '±0:00 h' }));

  if (difference > 0) {
    setStatus(elements.resultStatus, 'warning', `Bis ${state.targetTime} arbeitest du ${formatDuration(difference)} über deiner Sollzeit.`);
  } else if (difference < 0) {
    setStatus(elements.resultStatus, 'danger', `Bis ${state.targetTime} fehlen dir noch ${formatDuration(Math.abs(difference))} bis zur Sollzeit.`);
  } else {
    setStatus(elements.resultStatus, 'success', `Bis ${state.targetTime} triffst du deine Sollzeit genau.`);
  }

  const invalidCount = result.invalidPauses.length;
  const invalidText = invalidCount
    ? ` ${invalidCount} ungültige Zusatzpause${invalidCount > 1 ? 'n wurden' : ' wurde'} ignoriert.`
    : '';

  const detailEnding = difference > 0
    ? ` Du liegst damit ${formatDuration(difference)} über deiner Sollzeit.`
    : difference < 0
      ? ` Es fehlen noch ${formatDuration(Math.abs(difference))} bis zur Sollzeit.`
      : ' Damit erreichst du exakt deine Sollzeit.';

  setText(
    elements.detailText,
    `Von ${formatClock(startMinutes)} bis ${formatClock(targetMinutes)} sind es ${formatDuration(result.presence)} Anwesenheit. ` +
      `Nach Abzug von ${formatDuration(result.fixedBreakMinutes)} fester Pause und ${formatDuration(result.customBreakMinutes)} zusätzlicher Pause bleiben ${formatDuration(result.productive)} Arbeitszeit.` +
      `${detailEnding}${invalidText}`
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
  renderHero(now, startMinutes, leaveTime, config);
  renderLive(now, startMinutes, leaveTime, config);
  renderResult(startMinutes, targetMinutes, config);
  saveState();
}

function addPause() {
  state.pauses.push({ id: makeId(), from: '', to: '' });
  renderAll();
}

function resetAll() {
  state = {
    startTime: defaultState.startTime,
    targetTime: defaultState.targetTime,
    fridayMode: defaultState.fridayMode,
    pauses: []
  };
  renderAll();
}

function handlePauseListInput(event) {
  const row = event.target.closest('.pause-row');
  if (!row) return;
  const id = row.dataset.id;
  const pause = state.pauses.find((entry) => entry.id === id);
  if (!pause) return;

  if (event.target.classList.contains('pause-from')) {
    pause.from = event.target.value;
  }

  if (event.target.classList.contains('pause-to')) {
    pause.to = event.target.value;
  }

  renderAll();
}

function handlePauseListClick(event) {
  const button = event.target.closest('[data-action="remove-pause"]');
  if (!button) return;
  const id = button.dataset.id;
  state.pauses = state.pauses.filter((pause) => pause.id !== id);
  renderAll();
}

function bindEvents() {
  elements.startTime.addEventListener('input', (event) => {
    state.startTime = event.target.value;
    renderAll();
  });

  elements.targetTime.addEventListener('input', (event) => {
    state.targetTime = event.target.value;
    renderAll();
  });

  elements.fridayMode.addEventListener('change', (event) => {
    state.fridayMode = event.target.checked;
    renderAll();
  });

  elements.addPauseButton.addEventListener('click', addPause);
  elements.calculateButton.addEventListener('click', renderAll);
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
  renderHero(now, startMinutes, leaveTime, config);
  renderLive(now, startMinutes, leaveTime, config);
}, 1000);
