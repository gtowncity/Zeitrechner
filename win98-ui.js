(() => {
  const $ = (selector) => document.querySelector(selector);

  function loadWorkspaceCss() {
    if (document.querySelector('link[data-workspace-css]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'workspace.css?v=20260706-1';
    link.dataset.workspaceCss = 'true';
    document.head.appendChild(link);
  }

  function showToolbarHint() {
    const feedback = $('#feedback');
    if (!feedback) return;
    feedback.textContent = 'ATOSS wird ueber den vorhandenen URL-Import uebernommen.';
    feedback.className = 'feedback show warning';
  }

  function bindToolbar() {
    $('#toolbarCalc')?.addEventListener('click', () => $('#calculateButton')?.click());
    $('#toolbarPause')?.addEventListener('click', () => $('#addPauseButton')?.click());
    $('#toolbarReset')?.addEventListener('click', () => $('#resetButton')?.click());
    $('#toolbarAtoss')?.addEventListener('click', showToolbarHint);
  }

  function syncMirrors() {
    const now = new Date();
    const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const statusClock = $('#statusClockMirror');
    if (statusClock) statusClock.textContent = time;

    const atossText = $('#atossStatus')?.textContent || 'ATOSS: kein Import';
    const atossMirror = $('#statusAtossMirror');
    if (atossMirror) atossMirror.textContent = atossText;
  }

  function init() {
    loadWorkspaceCss();
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
