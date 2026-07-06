(() => {
  const $ = (selector) => document.querySelector(selector);

  function ensureDesktopIcons() {
    if ($('.win98-desktop-icons')) return;
    const icons = document.createElement('div');
    icons.className = 'win98-desktop-icons';
    icons.setAttribute('aria-hidden', 'true');
    icons.innerHTML = `
      <div class="win98-desktop-icon"><div class="win98-icon-img"></div><div>Arbeitsplatz</div></div>
      <div class="win98-desktop-icon"><div class="win98-icon-img folder"></div><div>ATOSS<br>Import</div></div>
      <div class="win98-desktop-icon"><div class="win98-icon-img doc"></div><div>Zeitrechner</div></div>
    `;
    document.body.prepend(icons);
  }

  function ensureMenuAndToolbar() {
    const win = $('.machine');
    const title = $('.machine-label');
    if (!win || !title || $('.win98-menubar')) return;

    title.textContent = 'Zeitrechner.exe // Local Shift Mode';

    const menu = document.createElement('nav');
    menu.className = 'win98-menubar';
    menu.setAttribute('aria-label', 'Menueleiste');
    menu.innerHTML = '<span>Datei</span><span>Bearbeiten</span><span>Ansicht</span><span>Hilfe</span>';

    const toolbar = document.createElement('div');
    toolbar.className = 'win98-toolbar';
    toolbar.setAttribute('aria-label', 'Symbolleiste');
    toolbar.innerHTML = `
      <button class="win98-tool-btn" id="win98Calc" type="button"><span class="win98-tool-icon calc"></span>Berechnen</button>
      <button class="win98-tool-btn" id="win98Pause" type="button"><span class="win98-tool-icon pause"></span>Pause</button>
      <button class="win98-tool-btn" id="win98Reset" type="button"><span class="win98-tool-icon reset"></span>Reset</button>
      <button class="win98-tool-btn" id="win98Atoss" type="button"><span class="win98-tool-icon atoss"></span>ATOSS</button>
    `;

    title.after(menu, toolbar);

    $('#win98Calc')?.addEventListener('click', () => $('#calculateButton')?.click());
    $('#win98Pause')?.addEventListener('click', () => $('#addPauseButton')?.click());
    $('#win98Reset')?.addEventListener('click', () => $('#resetButton')?.click());
    $('#win98Atoss')?.addEventListener('click', () => {
      const feedback = $('#feedback');
      if (!feedback) return;
      feedback.textContent = 'ATOSS-Import kommt automatisch ueber das Tampermonkey-Script per #atoss= URL.';
      feedback.className = 'feedback show warning';
    });
  }

  function ensureStatusbar() {
    const win = $('.machine');
    if (!win || $('.win98-statusbar')) return;
    const bar = document.createElement('div');
    bar.className = 'win98-statusbar';
    bar.innerHTML = `
      <div class="win98-status-cell">Bereit</div>
      <div class="win98-status-cell" id="win98AtossStatus">ATOSS: kein Import</div>
      <div class="win98-status-cell">Letzte Berechnung: live</div>
    `;
    win.appendChild(bar);
  }

  function ensureTaskbar() {
    if ($('.win98-taskbar')) return;
    const taskbar = document.createElement('div');
    taskbar.className = 'win98-taskbar';
    taskbar.setAttribute('aria-hidden', 'true');
    taskbar.innerHTML = `
      <div class="win98-start">Start</div>
      <div class="win98-task">Zeitrechner.exe</div>
      <div class="win98-spacer"></div>
      <div class="win98-tray" id="win98TaskClock">--:--</div>
    `;
    document.body.appendChild(taskbar);
  }

  function syncChrome() {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const taskClock = $('#win98TaskClock');
    if (taskClock) taskClock.textContent = `${hh}:${mm}`;

    const atossText = $('#atossStatus')?.textContent || 'ATOSS: kein Import';
    const atossStatus = $('#win98AtossStatus');
    if (atossStatus) atossStatus.textContent = atossText;
  }

  function init() {
    ensureDesktopIcons();
    ensureMenuAndToolbar();
    ensureStatusbar();
    ensureTaskbar();
    syncChrome();
    setInterval(syncChrome, 1000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();