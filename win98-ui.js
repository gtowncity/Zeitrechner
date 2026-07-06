(() => {
  const $ = (selector) => document.querySelector(selector);

  function setFeedback(message, tone = 'warning') {
    const feedback = $('#feedback');
    if (!feedback) return;
    feedback.textContent = message;
    feedback.className = `feedback show ${tone}`;
  }

  function bindToolbar() {
    $('#toolbarCalc')?.addEventListener('click', () => $('#calculateButton')?.click());
    $('#toolbarPause')?.addEventListener('click', () => $('#addPauseButton')?.click());
    $('#toolbarReset')?.addEventListener('click', () => $('#resetButton')?.click());
    $('#toolbarAtoss')?.addEventListener('click', () => {
      setFeedback('ATOSS-Import kommt automatisch ueber das Tampermonkey-Script per #atoss= URL.', 'warning');
    });
  }

  function syncMirrors() {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const time = `${hh}:${mm}`;

    const taskClock = $('#taskClock');
    const statusClock = $('#statusClockMirror');
    if (taskClock) taskClock.textContent = time;
    if (statusClock) statusClock.textContent = time;

    const atossText = $('#atossStatus')?.textContent || 'ATOSS: kein Import';
    const atossMirror = $('#statusAtossMirror');
    if (atossMirror) atossMirror.textContent = atossText;
  }

  function init() {
    bindToolbar();
    syncMirrors();
    setInterval(syncMirrors, 1000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();