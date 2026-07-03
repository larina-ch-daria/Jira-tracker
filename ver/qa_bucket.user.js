// ==UserScript==
// @name         QA: Корзина тестирования
// @namespace    qa.testing.bucket
// @version      2.19
// @description  Корзина тестирования + саппорт
// @match        *://*/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      script.google.com
// @connect      googleusercontent.com
// @connect      drive.google.com
// @connect      docs.google.com
// @connect      drive.usercontent.google.com
// @connect      raw.githubusercontent.com
// @connect      github.com
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';
  if (window.top !== window.self) return;

  const CFG = {
    // Endpoint Google Apps Script Web App (Deploy → Web app → /exec)
    WEB_APP_URL: 'YOUR_WEB_APP_URL_HERE',

    BOARD_NAMES: {
      '138': 'Регион 1',
      '35':  'Школы',
      '126': 'Педвузы',
      '158': 'Онлайн-кружки',
      '130': 'Математика',
      '121': 'Курсы',
      '40':  'Локализация',
    },

    STATUS_COLORS: {
      'Translation Testing': { bg: '#dbeafe', fg: '#1e40af' },
      'Тестирование':        { bg: '#fed7aa', fg: '#9a3412' },
      'In Testing':          { bg: '#d1fae5', fg: '#065f46' },
    },

    TRANSLATION_BOARDS:   ['40'],
    TRANSLATION_STATUSES: ['Translation Testing'],

    SUPPORT_ERROR_ORDER: [
      'Критическая', 'Средняя', 'Незначительная', 'Не ошибка',
    ],
    SUPPORT_ERROR_COLORS: {
      'Критическая':    { bg: '#fecaca', fg: '#991b1b' },
      'Средняя':        { bg: '#fed7aa', fg: '#9a3412' },
      'Незначительная': { bg: '#fef3c7', fg: '#92400e' },
      'Не ошибка':      { bg: '#e5e7eb', fg: '#374151' },
    },

    REFRESH_MIN: 5,

    MARK_SEEN_AFTER_SEC: 3,

    SOUND_PRESETS: {
      'default': { notes: [[880, 0, 0.18, 0.18], [1320, 0.10, 0.22, 0.14]], type: 'sine' },
      'bell':    { notes: [[659, 0, 0.30, 0.13], [988, 0.05, 0.40, 0.10]], type: 'triangle' },
      'ping':    { notes: [[1500, 0, 0.15, 0.16]], type: 'sine' },
      'deep':    { notes: [[330, 0, 0.25, 0.20], [440, 0.12, 0.30, 0.14]], type: 'sine' },
      'arp':     { notes: [[523, 0, 0.12, 0.12], [659, 0.10, 0.12, 0.12], [784, 0.20, 0.25, 0.13]], type: 'sine' },
      'whistle': { notes: [[1200, 0, 0.15, 0.13], [1500, 0.10, 0.18, 0.11]], type: 'triangle' },
      'support': { notes: [[440, 0, 0.10, 0.13], [440, 0.13, 0.10, 0.13], [880, 0.26, 0.28, 0.14]], type: 'sine' },
    },

    TESTER_SOUNDS_NORMAL: {
      'Общая корзина': 'default',
      'Тестировщик 1': 'whistle',
      'Тестировщик 2': 'arp',
      'Тестировщик 3': 'bell',
      'Тестировщик 4': 'deep',
      'Тестировщик 5': 'ping',
    },

    // Прямые download-ссылки на MP3 (Google Drive: "Все, у кого есть ссылка")
    TESTER_SOUNDS_EPIC: {
      'Общая корзина': 'https://drive.google.com/uc?export=download&id=YOUR_FILE_ID',
      'Тестировщик 1': 'https://drive.google.com/uc?export=download&id=YOUR_FILE_ID',
      'Тестировщик 2': 'https://drive.google.com/uc?export=download&id=YOUR_FILE_ID',
      'Тестировщик 3': 'https://drive.google.com/uc?export=download&id=YOUR_FILE_ID',
      'Тестировщик 4': 'https://drive.google.com/uc?export=download&id=YOUR_FILE_ID',
      'Тестировщик 5': 'https://drive.google.com/uc?export=download&id=YOUR_FILE_ID',
    },

    SOUND_FILE_VOLUME: 0.5,

    SUPPORT_SOUND_NORMAL: 'support',
    SUPPORT_SOUND_EPIC:   'https://drive.google.com/uc?export=download&id=YOUR_FILE_ID',
  };

  const ACTIVE_TAB_KEY    = 'qa_active_tab';
  const ACTIVE_TESTER_KEY = 'qa_active_tester';
  const FAB_POS_KEY       = 'qa_fab_pos';
  const SEEN_KEYS_KEY     = 'qa_seen_keys';
  const SOUND_ON_KEY      = 'qa_sound_on';

  const MUTED_TESTERS_KEY = 'qa_muted_testers';
  const SUPPORT_MUTED_KEY = 'qa_support_muted';
  const SOUND_MODE_KEY    = 'qa_sound_mode';
  const SOUND_DEDUP_KEY   = 'qa_sound_dedup';
  const SOUND_DEDUP_TTL_MS = 5 * 60 * 1000;
  const PENDING_SOUNDS_KEY   = 'qa_pending_sounds';
  const PENDING_SOUNDS_TTL_MS = 30 * 60 * 1000;

  let activeTab     = GM_getValue(ACTIVE_TAB_KEY, 'all');
  let activeTester  = GM_getValue(ACTIVE_TESTER_KEY, '');
  let soundEnabled  = GM_getValue(SOUND_ON_KEY, true);
  let userMutedTesters = new Set(GM_getValue(MUTED_TESTERS_KEY, []) || []);
  let userSupportMuted = !!GM_getValue(SUPPORT_MUTED_KEY, false);
  let soundMode     = GM_getValue(SOUND_MODE_KEY, 'normal');
  let inSettings     = false;
  let lastData      = null;
  let currentNewKeys = new Set();
  let markSeenTimer  = null;

  const style = document.createElement('style');
  style.textContent = `
    #qa-bucket-fab {
      position: fixed; z-index: 2147483647;
      background: #1f2937; color: #f9fafb;
      font: 600 13px/1 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      padding: 8px 12px; border-radius: 18px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.25);
      cursor: grab; user-select: none;
      touch-action: none;
      box-sizing: border-box;
    }
    #qa-bucket-fab:active { cursor: grabbing; }
    #qa-bucket-fab.qa-stale    { background: #6b7280; }
    #qa-bucket-fab.qa-zero     { background: #059669; }
    #qa-bucket-fab.qa-busy     { background: #d97706; }
    #qa-bucket-fab.qa-overload { background: #dc2626; }
    #qa-bucket-fab.qa-has-new {
      box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.7), 0 2px 8px rgba(0,0,0,0.25);
      animation: qa-fab-pulse 1.5s ease-out infinite;
    }
    @keyframes qa-fab-pulse {
      0%   { box-shadow: 0 0 0 0   rgba(245, 158, 11, 0.7), 0 2px 8px rgba(0,0,0,0.25); }
      70%  { box-shadow: 0 0 0 10px rgba(245, 158, 11, 0),  0 2px 8px rgba(0,0,0,0.25); }
      100% { box-shadow: 0 0 0 0   rgba(245, 158, 11, 0),  0 2px 8px rgba(0,0,0,0.25); }
    }

    #qa-bucket-panel {
      position: fixed; z-index: 2147483646;
      width: 460px; max-height: 70vh;
      background: white; color: #111827;
      border: 1px solid #e5e7eb; border-radius: 8px;
      box-shadow: 0 10px 25px rgba(0,0,0,0.15);
      font: 13px/1.4 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      display: none; flex-direction: column; overflow: hidden;
      box-sizing: border-box;
    }
    #qa-bucket-panel.qa-open { display: flex; }
    #qa-bucket-panel * { box-sizing: border-box; }

    #qa-bucket-panel .qa-header {
      padding: 10px 12px; border-bottom: 1px solid #e5e7eb; background: #f9fafb;
      display: flex; align-items: flex-start; justify-content: space-between; gap: 8px;
      flex-shrink: 0;
      cursor: grab;
      user-select: none;
      touch-action: none;
    }
    #qa-bucket-panel .qa-header.qa-dragging { cursor: grabbing; }
    #qa-bucket-panel .qa-header b { font-size: 14px; font-weight: 700; }
    #qa-bucket-panel .qa-meta { color: #6b7280; font-size: 11px; margin-top: 2px; }
    #qa-bucket-panel .qa-actions { display: flex; gap: 4px; flex-shrink: 0; }
    #qa-bucket-panel .qa-btn {
      background: transparent; border: 1px solid #d1d5db;
      padding: 4px 8px; border-radius: 4px; cursor: pointer;
      font-size: 12px; color: #374151; line-height: 1;
    }
    #qa-bucket-panel .qa-btn:hover { background: #f3f4f6; }

    #qa-bucket-panel .qa-tester-select {
      border: none;
      background: #1f2937;
      color: white;
      padding: 5px 8px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      border-right: 1px solid #e5e7eb;
      flex-shrink: 0;
      font-family: inherit;
      line-height: 1.4;
      max-width: 180px;
    }
    #qa-bucket-panel .qa-tester-select:focus { outline: 2px solid #2563eb; outline-offset: -2px; }

    #qa-bucket-panel .qa-tabs {
      display: flex !important;
      flex-wrap: wrap;
      background: #f9fafb;
      border-bottom: 1px solid #e5e7eb;
      flex-shrink: 0;
      min-height: 28px;
    }
    #qa-bucket-panel .qa-tab {
      padding: 5px 9px !important;
      font-size: 12px !important;
      line-height: 1.4 !important;
      color: #6b7280;
      border-right: 1px solid #e5e7eb;
      cursor: pointer;
      white-space: nowrap;
      user-select: none;
      flex-shrink: 0;
      transition: background 0.1s;
      display: flex;
      align-items: center;
      gap: 4px;
      position: relative;
      max-width: 180px;
      overflow: hidden;
    }
    #qa-bucket-panel .qa-tab .qa-tab-name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      min-width: 0;
    }
    #qa-bucket-panel .qa-tab:hover { background: #f3f4f6; color: #111827; }
    #qa-bucket-panel .qa-tab.qa-tab-active {
      background: white;
      color: #111827;
      font-weight: 600;
      box-shadow: inset 0 -2px 0 #2563eb;
    }
    #qa-bucket-panel .qa-tab-count {
      color: #9ca3af;
      font-weight: normal;
      flex-shrink: 0;
    }
    #qa-bucket-panel .qa-tab-active .qa-tab-count { color: #6b7280; }
    #qa-bucket-panel .qa-tab-new-dot {
      display: inline-block;
      width: 6px; height: 6px;
      border-radius: 50%;
      background: #f59e0b;
      animation: qa-dot-pulse 1.5s ease-in-out infinite;
      flex-shrink: 0;
    }
    @keyframes qa-dot-pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50%      { opacity: 0.5; transform: scale(0.8); }
    }

    #qa-bucket-panel .qa-body { overflow-y: auto; padding: 0; flex: 1 1 auto; min-height: 0; }

    #qa-bucket-panel .qa-board {
      padding: 8px 12px;
      background: #1f2937; color: white;
      font-weight: 700; font-size: 12px;
      display: flex; justify-content: space-between; align-items: center;
      position: sticky; top: 0; z-index: 2;
    }
    #qa-bucket-panel .qa-board .qa-count {
      background: rgba(255,255,255,0.2);
      padding: 2px 8px; border-radius: 10px; font-size: 11px;
    }
    #qa-bucket-panel .qa-epic {
      padding: 5px 12px;
      background: #f3f4f6;
      font-weight: 600; color: #374151; font-size: 11px;
      display: flex; justify-content: space-between;
      position: sticky; z-index: 1;
    }
    #qa-bucket-panel .qa-body.qa-view-all .qa-epic { top: 32px; padding-left: 20px; }
    #qa-bucket-panel .qa-body.qa-view-board .qa-epic { top: 0; }

    #qa-bucket-panel .qa-card {
      padding: 6px 12px; display: block;
      text-decoration: none; color: inherit;
      border-bottom: 1px solid #f3f4f6;
      position: relative;
    }
    #qa-bucket-panel .qa-body.qa-view-all .qa-card { padding-left: 28px; }
    #qa-bucket-panel .qa-card:hover { background: #f9fafb; }
    #qa-bucket-panel .qa-card.qa-card-new {
      background: linear-gradient(to right, #fef3c7 0%, #fffbeb 60%, white 100%);
      border-left: 3px solid #f59e0b;
    }
    #qa-bucket-panel .qa-card.qa-card-new:hover {
      background: linear-gradient(to right, #fde68a 0%, #fef3c7 60%, #f9fafb 100%);
    }
    #qa-bucket-panel .qa-new-badge {
      display: inline-block;
      padding: 1px 5px; border-radius: 3px;
      background: #f59e0b; color: white;
      font-size: 9px; font-weight: 700; letter-spacing: 0.5px;
      margin-right: 6px; vertical-align: middle;
    }

    #qa-bucket-panel .qa-card .qa-key { font-family: monospace; color: #2563eb; font-size: 11px; }
    #qa-bucket-panel .qa-card .qa-status {
      display: inline-block; padding: 1px 6px; border-radius: 3px;
      background: #e5e7eb; color: #374151; font-size: 10px; margin: 0 6px;
    }
    #qa-bucket-panel .qa-card .qa-date { color: #9ca3af; font-size: 10px; }
    #qa-bucket-panel .qa-card .qa-name { display: block; margin-top: 2px; color: #111827; }

    #qa-bucket-panel .qa-empty { padding: 24px; text-align: center; color: #6b7280; }
    #qa-bucket-panel .qa-error { padding: 12px; background: #fef2f2; color: #991b1b; font-size: 12px; white-space: pre-wrap; }

    #qa-bucket-panel .qa-btn.qa-active {
      background: #1f2937; color: white; border-color: #1f2937;
    }

    #qa-bucket-panel .qa-body.qa-view-settings { padding: 14px; }
    #qa-bucket-panel .qa-settings-title {
      font-weight: 700; font-size: 13px;
      color: #111827;
      margin-bottom: 4px;
    }
    #qa-bucket-panel .qa-settings-hint {
      font-size: 11px; color: #6b7280;
      margin-bottom: 12px;
    }
    #qa-bucket-panel .qa-settings-row {
      display: flex; align-items: center; justify-content: space-between;
      padding: 8px 4px;
      border-bottom: 1px solid #f3f4f6;
    }
    #qa-bucket-panel .qa-settings-row:last-of-type { border-bottom: none; }
    #qa-bucket-panel .qa-settings-name {
      font-size: 13px; color: #111827;
    }
    #qa-bucket-panel .qa-settings-name .qa-sound-hint {
      font-size: 10px; color: #9ca3af; margin-left: 6px;
    }
    #qa-bucket-panel .qa-settings-toggle {
      background: transparent; border: 1px solid #d1d5db;
      padding: 4px 10px; border-radius: 4px; cursor: pointer;
      font-size: 14px; line-height: 1;
      transition: background 0.1s;
    }
    #qa-bucket-panel .qa-settings-toggle:hover { background: #f3f4f6; }
    #qa-bucket-panel .qa-settings-toggle.qa-muted {
      background: #fef2f2; border-color: #fca5a5;
    }
    #qa-bucket-panel .qa-settings-divider {
      margin: 16px 0 8px;
      border-top: 2px solid #e5e7eb;
      padding-top: 12px;
      font-size: 11px; color: #6b7280; font-weight: 600;
      text-transform: uppercase; letter-spacing: 0.5px;
    }
    #qa-bucket-panel .qa-mode-switch {
      display: flex; gap: 4px;
      margin: 8px 0 4px;
      background: #f3f4f6;
      padding: 4px;
      border-radius: 6px;
    }
    #qa-bucket-panel .qa-mode-btn {
      flex: 1;
      background: transparent;
      border: none;
      padding: 6px 12px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px; font-weight: 600;
      color: #6b7280;
      transition: background 0.1s, color 0.1s;
      font-family: inherit;
    }
    #qa-bucket-panel .qa-mode-btn:hover { color: #111827; }
    #qa-bucket-panel .qa-mode-btn.qa-mode-active {
      background: white; color: #111827;
      box-shadow: 0 1px 2px rgba(0,0,0,0.05);
    }
    #qa-bucket-panel .qa-settings-actions {
      display: flex; gap: 4px; align-items: center;
    }
    #qa-bucket-panel .qa-preview-btn {
      background: transparent;
      border: 1px solid #d1d5db;
      padding: 4px 10px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 11px;
      line-height: 1;
      color: #2563eb;
      transition: background 0.1s;
    }
    #qa-bucket-panel .qa-preview-btn:hover:not(:disabled) {
      background: #eff6ff;
    }
    #qa-bucket-panel .qa-preview-btn:disabled {
      opacity: 0.3; cursor: not-allowed;
    }
  `;
  document.documentElement.appendChild(style);

  const statusStyle = document.createElement('style');
  let statusCSS = '';
  Object.entries(CFG.STATUS_COLORS).forEach(([name, c]) => {
    const safe = String(name).replace(/"/g, '\\"');
    statusCSS += `#qa-bucket-panel .qa-card .qa-status[data-status="${safe}"] { background: ${c.bg}; color: ${c.fg}; }\n`;
  });

  Object.entries(CFG.SUPPORT_ERROR_COLORS).forEach(([name, c]) => {
    const safe = String(name).replace(/"/g, '\\"');
    statusCSS += `#qa-bucket-panel .qa-body.qa-view-support .qa-epic[data-severity="${safe}"] { background: ${c.bg}; color: ${c.fg}; }\n`;
  });

  statusCSS += `
    #qa-bucket-panel .qa-onduty {
      display: inline-block; padding: 1px 6px; border-radius: 3px;
      background: #ede9fe; color: #5b21b6; font-size: 10px; margin: 0 6px;
    }
  `;
  statusStyle.textContent = statusCSS;
  document.documentElement.appendChild(statusStyle);

  const fab = document.createElement('div');
  fab.id = 'qa-bucket-fab';
  fab.textContent = 'QA: …';

  const panel = document.createElement('div');
  panel.id = 'qa-bucket-panel';
  panel.innerHTML = `
    <div class="qa-header">
      <div>
        <b>Корзина тестирования</b>
        <div class="qa-meta">—</div>
      </div>
      <div class="qa-actions">
        <button class="qa-btn qa-sound-settings" title="Настройки звуков">⚙</button>
        <button class="qa-btn qa-sound" title="Звук оповещения">${soundEnabled ? '🔔' : '🔕'}</button>
        <button class="qa-btn qa-refresh" title="Обновить">↻</button>
        <button class="qa-btn qa-close" title="Закрыть">×</button>
      </div>
    </div>
    <div class="qa-tabs"></div>
    <div class="qa-body"><div class="qa-empty">Загрузка…</div></div>
  `;

  document.body.appendChild(fab);
  document.body.appendChild(panel);

  function setFabPos(x, y) {
    fab.style.left = x + 'px';
    fab.style.top  = y + 'px';
    fab.style.right  = 'auto';
    fab.style.bottom = 'auto';
  }

  function restoreOrDefaultPos() {
    const saved = GM_getValue(FAB_POS_KEY, null);
    if (saved && typeof saved.x === 'number' && typeof saved.y === 'number') {
      const x = Math.max(8, Math.min(saved.x, window.innerWidth  - fab.offsetWidth  - 8));
      const y = Math.max(8, Math.min(saved.y, window.innerHeight - fab.offsetHeight - 8));
      setFabPos(x, y);
    } else {
      const margin = 16;
      setFabPos(
        window.innerWidth  - fab.offsetWidth  - margin,
        window.innerHeight - fab.offsetHeight - margin
      );
    }
  }
  requestAnimationFrame(restoreOrDefaultPos);

  function positionPanel() {
    const fabRect = fab.getBoundingClientRect();
    const panelW = panel.offsetWidth  || 460;
    const panelH = panel.offsetHeight || 200;
    const margin = 8;

    let left = fabRect.right - panelW;
    if (left < margin) left = margin;
    if (left + panelW > window.innerWidth - margin) left = window.innerWidth - panelW - margin;

    let top = fabRect.top - panelH - margin;
    if (top < margin) {
      top = fabRect.bottom + margin;
      if (top + panelH > window.innerHeight - margin) {
        top = Math.max(margin, window.innerHeight - panelH - margin);
      }
    }

    panel.style.left = left + 'px';
    panel.style.top = top + 'px';
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
  }

  let drag = null;
  fab.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    const r = fab.getBoundingClientRect();
    drag = {
      offsetX: e.clientX - r.left, offsetY: e.clientY - r.top,
      startX:  e.clientX,          startY:  e.clientY,
      moved: false,
    };
    try { fab.setPointerCapture(e.pointerId); } catch (_) {}
  });
  fab.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (!drag.moved && Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
    drag.moved = true;
    const x = Math.max(0, Math.min(e.clientX - drag.offsetX, window.innerWidth  - fab.offsetWidth));
    const y = Math.max(0, Math.min(e.clientY - drag.offsetY, window.innerHeight - fab.offsetHeight));
    setFabPos(x, y);
    if (panel.classList.contains('qa-open')) positionPanel();
  });
  fab.addEventListener('pointerup', () => {
    if (!drag) return;
    if (drag.moved) {
      const r = fab.getBoundingClientRect();
      GM_setValue(FAB_POS_KEY, { x: r.left, y: r.top });
    } else {
      const wasOpen = panel.classList.contains('qa-open');
      panel.classList.toggle('qa-open');
      if (!wasOpen) {
        positionPanel();
        scheduleMarkSeen();
      }
    }
    drag = null;
  });
  fab.addEventListener('pointercancel', () => { drag = null; });
  window.addEventListener('resize', () => {
    if (panel.classList.contains('qa-open')) positionPanel();
  });

  const header = panel.querySelector('.qa-header');
  let headerDrag = null;
  header.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.qa-btn')) return;
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    const r = fab.getBoundingClientRect();
    headerDrag = {
      fabStartX: r.left, fabStartY: r.top,
      startX:    e.clientX, startY: e.clientY,
      moved: false,
    };
    header.classList.add('qa-dragging');
    try { header.setPointerCapture(e.pointerId); } catch (_) {}
  });
  header.addEventListener('pointermove', (e) => {
    if (!headerDrag) return;
    const dx = e.clientX - headerDrag.startX;
    const dy = e.clientY - headerDrag.startY;
    if (!headerDrag.moved && Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
    headerDrag.moved = true;
    const x = Math.max(0, Math.min(headerDrag.fabStartX + dx, window.innerWidth  - fab.offsetWidth));
    const y = Math.max(0, Math.min(headerDrag.fabStartY + dy, window.innerHeight - fab.offsetHeight));
    setFabPos(x, y);
    positionPanel();
  });
  header.addEventListener('pointerup', () => {
    if (!headerDrag) return;
    header.classList.remove('qa-dragging');
    if (headerDrag.moved) {
      const r = fab.getBoundingClientRect();
      GM_setValue(FAB_POS_KEY, { x: r.left, y: r.top });
    }
    headerDrag = null;
  });
  header.addEventListener('pointercancel', () => {
    header.classList.remove('qa-dragging');
    headerDrag = null;
  });

  const $ = (sel) => panel.querySelector(sel);
  $('.qa-close').addEventListener('click', () => panel.classList.remove('qa-open'));
  $('.qa-refresh').addEventListener('click', () => loadData(true));
  $('.qa-sound').addEventListener('click', (e) => {
    soundEnabled = !soundEnabled;
    GM_setValue(SOUND_ON_KEY, soundEnabled);
    e.currentTarget.textContent = soundEnabled ? '🔔' : '🔕';
    if (soundEnabled) playNewCardSound();
  });
  $('.qa-sound-settings').addEventListener('click', () => {
    inSettings = !inSettings;
    if (lastData) render(lastData);
  });

  function getTesterSound(displayName) {
    const config = soundMode === 'epic'
      ? CFG.TESTER_SOUNDS_EPIC
      : CFG.TESTER_SOUNDS_NORMAL;
    if (!config) return 'default';
    const v = config[displayName];
    return (v === undefined) ? 'default' : v;
  }

  function getSupportSound() {
    const v = soundMode === 'epic'
      ? CFG.SUPPORT_SOUND_EPIC
      : CFG.SUPPORT_SOUND_NORMAL;
    return (v === undefined) ? 'support' : v;
  }

  function previewSound(soundRef) {
    const old = soundEnabled;
    soundEnabled = true;
    playNewCardSound(soundRef);
    soundEnabled = old;
  }

  function playNewCardSound(soundRef) {
    if (!soundEnabled) return;

    if (typeof soundRef === 'string' && /^https?:\/\//i.test(soundRef)) {
      playAudioFromUrl_(soundRef);
      return;
    }

    const presets = CFG.SOUND_PRESETS || {};
    const preset = presets[soundRef] || presets['default'];
    if (!preset || !Array.isArray(preset.notes)) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      if (ctx.state === 'suspended') ctx.resume();
      const now = ctx.currentTime;
      const wave = preset.type || 'sine';
      let endAt = 0;
      preset.notes.forEach(n => {
        const freq     = n[0];
        const startOff = n[1] || 0;
        const duration = n[2] || 0.2;
        const vol      = n[3] || 0.15;
        const start = now + startOff;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.value = freq;
        osc.type = wave;
        osc.connect(gain);
        gain.connect(ctx.destination);
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(vol, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
        osc.start(start);
        osc.stop(start + duration + 0.05);
        if (startOff + duration > endAt) endAt = startOff + duration;
      });
      setTimeout(() => ctx.close().catch(() => {}), (endAt + 0.2) * 1000);
    } catch (e) {
      console.warn('[QA bucket] sound failed:', e);
    }
  }

  const audioBufferCache = new Map();
  function playAudioFromUrl_(url) {
    console.log('[QA bucket] playAudioFromUrl_:', url);

    const playBuffer = (audioBuffer) => {
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) {
          console.warn('[QA bucket] no AudioContext available');
          return;
        }
        const ctx = new AC();
        if (ctx.state === 'suspended') ctx.resume();
        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        const gain = ctx.createGain();
        gain.gain.value = Math.max(0, Math.min(1, CFG.SOUND_FILE_VOLUME != null ? CFG.SOUND_FILE_VOLUME : 0.5));
        source.connect(gain);
        gain.connect(ctx.destination);
        source.start();
        console.log('[QA bucket] playback started OK (WebAudio)');
        source.onended = () => { try { ctx.close(); } catch (_) {} };
      } catch (e) {
        console.warn('[QA bucket] WebAudio playback failed:', e);
      }
    };

    if (audioBufferCache.has(url)) {
      console.log('[QA bucket] using cached AudioBuffer for', url);
      playBuffer(audioBufferCache.get(url));
      return;
    }

    console.log('[QA bucket] fetching', url);
    GM_xmlhttpRequest({
      method: 'GET', url: url, responseType: 'blob', timeout: 10000,
      onload: (resp) => {
        const blob = resp.response;
        const size = blob && blob.size;
        const type = blob && blob.type;
        console.log('[QA bucket] fetch done. status:', resp.status, 'blob size:', size, 'type:', type);
        if (resp.status >= 400 || !blob) {
          console.warn('[QA bucket] bad response, will not play. Headers:\n', resp.responseHeaders);
          return;
        }
        if (type && /^text\/html/i.test(type)) {
          console.warn('[QA bucket] Got HTML instead of audio. Скорее всего файл не расшарен (Anyone with link) или URL не download-формат. Headers:\n', resp.responseHeaders);
          return;
        }

        blob.arrayBuffer().then(arrayBuffer => {
          const AC = window.AudioContext || window.webkitAudioContext;
          if (!AC) {
            console.warn('[QA bucket] no AudioContext available');
            return;
          }
          const decodeCtx = new AC();
          decodeCtx.decodeAudioData(arrayBuffer.slice(0))
            .then(audioBuffer => {
              audioBufferCache.set(url, audioBuffer);
              try { decodeCtx.close(); } catch (_) {}
              playBuffer(audioBuffer);
            })
            .catch(e => {
              try { decodeCtx.close(); } catch (_) {}
              console.warn('[QA bucket] decodeAudioData failed (битый mp3?):', e && e.message || e);
            });
        }).catch(e => {
          console.warn('[QA bucket] blob.arrayBuffer failed:', e);
        });
      },
      onerror:   (e) => console.warn('[QA bucket] fetch error (blocked by @connect?):', e),
      ontimeout: ()  => console.warn('[QA bucket] fetch timeout for', url),
    });
  }

  try {
    const w = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
    w.qaTestSound = function (nameOrUrl) {

      const config = soundMode === 'epic' ? CFG.TESTER_SOUNDS_EPIC : CFG.TESTER_SOUNDS_NORMAL;
      const ref = (config && config[nameOrUrl] !== undefined) ? config[nameOrUrl] : nameOrUrl;
      console.log('[QA bucket] qaTestSound (mode=' + soundMode + '):', nameOrUrl, '→', ref);
      previewSound(ref);
    };
    w.qaDebug = function () {
      const seen = GM_getValue(SEEN_KEYS_KEY, null);
      const dedup = GM_getValue(SOUND_DEDUP_KEY, null);
      const pending = GM_getValue(PENDING_SOUNDS_KEY, []) || [];
      const info = {
        soundMode: soundMode,
        soundEnabled: soundEnabled,
        visibility: document.visibilityState,
        seenKeysCount: seen ? seen.length : 'null',
        seenSample: seen && seen.length ? seen.slice(0, 5) : null,
        userMutedTesters: [...userMutedTesters],
        userSupportMuted: userSupportMuted,
        dedup: dedup,
        dedupAgeSec: dedup && dedup.ts ? Math.round((Date.now() - dedup.ts) / 1000) : null,
        dedupTtlSec: SOUND_DEDUP_TTL_MS / 1000,
        currentNewKeys: [...currentNewKeys],
        currentNewKeysCount: currentNewKeys.size,
        pendingSoundsCount: pending.length,
        pendingSounds: pending,
      };
      console.log('[QA bucket] DEBUG:', info);
      return info;
    };
    w.qaResetSeen = function () {
      GM_setValue(SEEN_KEYS_KEY, null);
      GM_setValue(SOUND_DEDUP_KEY, null);
      console.log('[QA bucket] seen + dedup сброшены. Следующий фетч установит baseline.');
    };
    console.log('[QA bucket] Test helper available: window.qaTestSound("Тестировщик 1"), qaDebug(), qaResetSeen()');
  } catch (e) {
    console.warn('[QA bucket] could not expose qaTestSound:', e);
  }

  function testerScopedKey(displayName, issueKey) {
    return 't::' + (displayName || '') + '::' + issueKey;
  }
  function supportScopedKey(issueKey) {
    return 's::' + issueKey;
  }

  function diffAndAck(newCards) {
    const currentKeys = newCards.map(c => c.key);
    const seenRaw = GM_getValue(SEEN_KEYS_KEY, null);

    if (seenRaw === null) {

      GM_setValue(SEEN_KEYS_KEY, currentKeys);
      return new Set();
    }
    const seen = new Set(Array.isArray(seenRaw) ? seenRaw : []);

    if (seen.size > 0) {
      const sample = seen.values().next().value;
      if (typeof sample === 'string' && !sample.startsWith('t::') && !sample.startsWith('s::')) {
        GM_setValue(SEEN_KEYS_KEY, currentKeys);
        return new Set();
      }
    }

    const news = new Set();
    currentKeys.forEach(k => { if (!seen.has(k)) news.add(k); });

    GM_setValue(SEEN_KEYS_KEY, currentKeys);
    return news;
  }

  function claimKeysForSound(newKeys) {
    if (!newKeys || newKeys.size === 0) return new Set();
    const prev = GM_getValue(SOUND_DEDUP_KEY, null);
    const now = Date.now();
    const fresh = prev && (now - prev.ts < SOUND_DEDUP_TTL_MS);
    const alreadySounded = fresh ? new Set(prev.keys || []) : new Set();
    const toPlay = new Set();
    newKeys.forEach(k => { if (!alreadySounded.has(k)) toPlay.add(k); });
    if (toPlay.size > 0) {
      toPlay.forEach(k => alreadySounded.add(k));
      GM_setValue(SOUND_DEDUP_KEY, { keys: [...alreadySounded], ts: now });
    }
    return toPlay;
  }

  function enqueuePendingSounds(sounds) {
    if (!sounds || !sounds.length) return;
    const raw = GM_getValue(PENDING_SOUNDS_KEY, []) || [];
    const now = Date.now();
    const queue = raw.filter(it => now - it.ts < PENDING_SOUNDS_TTL_MS);
    sounds.forEach(sound => queue.push({ sound, ts: now }));
    GM_setValue(PENDING_SOUNDS_KEY, queue);
    console.log('[QA bucket] queued', sounds.length, 'sound(s) for later (tab hidden). Total in queue:', queue.length);
  }

  function flushPendingSounds() {
    if (document.visibilityState !== 'visible') return;
    const queue = GM_getValue(PENDING_SOUNDS_KEY, []) || [];
    if (!queue.length) return;
    GM_setValue(PENDING_SOUNDS_KEY, []);
    const now = Date.now();
    const fresh = queue.filter(it => now - it.ts < PENDING_SOUNDS_TTL_MS);
    if (!fresh.length) {
      console.log('[QA bucket] pending sounds all expired, skipping');
      return;
    }
    const uniqueSounds = [...new Set(fresh.map(it => it.sound))];
    console.log('[QA bucket] flushing pending sounds:', uniqueSounds.length, 'unique of', fresh.length, 'total');
    uniqueSounds.forEach((sound, i) => setTimeout(() => playNewCardSound(sound), i * 700));
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      flushPendingSounds();
    }
  });

  function scheduleMarkSeen() {
    if (markSeenTimer) clearTimeout(markSeenTimer);
    if (!panel.classList.contains('qa-open')) return;
    markSeenTimer = setTimeout(() => {
      markSeenTimer = null;
      if (!lastData) return;
      const supportCards = (lastData.support && lastData.support.cards) || [];
      const testers = Array.isArray(lastData.testers) && lastData.testers.length
        ? lastData.testers
        : [{ cards: lastData.cards || [] }];
      const keys = [];
      testers.forEach(t => {
        const dn = t.displayName || t.name || '';
        (t.cards || []).forEach(c => keys.push(testerScopedKey(dn, c.key)));
      });
      supportCards.forEach(c => keys.push(supportScopedKey(c.key)));
      GM_setValue(SEEN_KEYS_KEY, keys);
      currentNewKeys = new Set();
      render(lastData);
    }, CFG.MARK_SEEN_AFTER_SEC * 1000);
  }

  function setFabColor(count, stale) {
    fab.classList.remove('qa-stale', 'qa-zero', 'qa-busy', 'qa-overload');
    if (stale) fab.classList.add('qa-stale');
    else if (count === 0) fab.classList.add('qa-zero');
    else if (count >= 30) fab.classList.add('qa-overload');
    else if (count >= 10) fab.classList.add('qa-busy');
    fab.classList.toggle('qa-has-new', currentNewKeys.size > 0);
  }

  function fetchSnapshot() {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET', url: CFG.WEB_APP_URL, timeout: 15000,
        onload: (resp) => {
          if (resp.status >= 400) {
            reject(new Error(`HTTP ${resp.status}\n${(resp.responseText || '').slice(0, 300)}`));
            return;
          }
          try {
            const data = JSON.parse(resp.responseText);
            if (data.error) reject(new Error(data.error));
            else resolve(data);
          } catch (e) {
            reject(new Error('Не смогла распарсить ответ Web App. Возможно, URL не финальный /exec.'));
          }
        },
        onerror:   () => reject(new Error('Сетевая ошибка при запросе к Web App, перезагрузи')),
        ontimeout: () => reject(new Error('Таймаут запроса к Web App, перезагрузи')),
      });
    });
  }

  async function loadData(manual) {
    if (manual) $('.qa-body').innerHTML = '<div class="qa-empty">Загрузка…</div>';
    fab.classList.add('qa-stale');
    try {
      if (CFG.WEB_APP_URL.startsWith('YOUR_')) {
        throw new Error('Заполни WEB_APP_URL в верхушке скрипта');
      }
      const data = await fetchSnapshot();

      const supportCards = (data.support && data.support.cards) || [];
      const testers = Array.isArray(data.testers) && data.testers.length
        ? data.testers
        : [{ cards: data.cards || [] }];
      const allCardKeys = [];
      testers.forEach(t => {
        const dn = t.displayName || t.name || '';
        (t.cards || []).forEach(c => allCardKeys.push(testerScopedKey(dn, c.key)));
      });
      supportCards.forEach(c => allCardKeys.push(supportScopedKey(c.key)));
      const synthData = { cards: allCardKeys.map(k => ({ key: k })) };

      const newKeysNow = diffAndAck(synthData.cards);

      newKeysNow.forEach(k => currentNewKeys.add(k));

      const currentKeySet = new Set(allCardKeys);
      [...currentNewKeys].forEach(k => { if (!currentKeySet.has(k)) currentNewKeys.delete(k); });

      lastData = data;
      render(data);
      if (panel.classList.contains('qa-open')) positionPanel();

      const isMuted = (v) => v === 'mute' || v === 'silent' || v == null || v === false || v === '';
      if (newKeysNow.size > 0) {
        const keysToSound = claimKeysForSound(newKeysNow);
        const seenSounds = new Set();
        const queue = [];
        testers.forEach(t => {
          const dn = t.displayName || t.name || '';
          if (userMutedTesters.has(dn)) return;
          (t.cards || []).forEach(c => {
            if (!keysToSound.has(testerScopedKey(dn, c.key))) return;
            const sound = getTesterSound(dn);
            if (isMuted(sound)) return;
            if (seenSounds.has(sound)) return;
            seenSounds.add(sound);
            queue.push(sound);
          });
        });
        if (!userSupportMuted) {
          supportCards.forEach(c => {
            if (!keysToSound.has(supportScopedKey(c.key))) return;
            const sound = getSupportSound();
            if (isMuted(sound)) return;
            if (seenSounds.has(sound)) return;
            seenSounds.add(sound);
            queue.push(sound);
          });
        }
        if (queue.length) {
          if (document.visibilityState === 'visible') {
            queue.forEach((sound, i) => setTimeout(() => playNewCardSound(sound), i * 700));
          } else {
            enqueuePendingSounds(queue);
          }
        }
      }

      if (panel.classList.contains('qa-open') && currentNewKeys.size > 0) {
        scheduleMarkSeen();
      }
    } catch (e) {
      console.error('[QA bucket]', e);
      $('.qa-tabs').innerHTML = '';
      $('.qa-body').innerHTML = `<div class="qa-error">${escapeHtml(e.message || String(e))}</div>`;
      fab.textContent = 'QA: ⚠';
      fab.classList.remove('qa-stale');
    }
  }

  function groupByBoard(cards) {
    const groups = {};
    const transBoardSet  = new Set(CFG.TRANSLATION_BOARDS || []);
    const transStatusSet = new Set(CFG.TRANSLATION_STATUSES || []);

    cards.forEach(c => {
      const boardIds = String(c.boards || '').split(/[;,]/).map(s => s.trim()).filter(Boolean);
      let targets = boardIds;

      const isTranslationStatus = transStatusSet.has(c.status);
      const transBoards    = boardIds.filter(id => transBoardSet.has(id));
      const nonTransBoards = boardIds.filter(id => !transBoardSet.has(id));

      if (isTranslationStatus && transBoards.length > 0) {
        targets = transBoards;
      } else if (!isTranslationStatus && nonTransBoards.length > 0) {
        targets = nonTransBoards;
      }

      if (!targets.length) targets = ['—'];
      targets.forEach(bid => {
        const name = CFG.BOARD_NAMES[bid] || `Доска ${bid}`;
        (groups[name] = groups[name] || []).push(c);
      });
    });
    return groups;
  }

  function groupByEpic(cards) {
    const groups = {};
    cards.forEach(c => {
      const ep = c.epic || '(без эпика)';
      (groups[ep] = groups[ep] || []).push(c);
    });
    return groups;
  }

  function cardHtml(c, dn) {
    const status = c.status || '';
    const isNew = currentNewKeys.has(testerScopedKey(dn || '', c.key));
    return `
      <a class="qa-card ${isNew ? 'qa-card-new' : ''}" href="${escapeHtml(c.url || '#')}" target="_blank" rel="noopener">
        ${isNew ? '<span class="qa-new-badge">NEW</span>' : ''}<span class="qa-key">${escapeHtml(c.key)}</span>
        <span class="qa-status" data-status="${escapeHtml(status)}">${escapeHtml(status)}</span>
        <span class="qa-date">${escapeHtml(fmtLocalDateTime(c.lastChange))}</span>
        <span class="qa-name">${escapeHtml(c.summary || '')}</span>
      </a>`;
  }

  function supportCardHtml(c) {
    const isNew = currentNewKeys.has(supportScopedKey(c.key));
    return `
      <a class="qa-card ${isNew ? 'qa-card-new' : ''}" href="${escapeHtml(c.url || '#')}" target="_blank" rel="noopener">
        ${isNew ? '<span class="qa-new-badge">NEW</span>' : ''}<span class="qa-key">${escapeHtml(c.key)}</span>
        ${c.onDuty ? `<span class="qa-onduty">${escapeHtml(c.onDuty)}</span>` : ''}
        <span class="qa-date">${escapeHtml(c.created || '')}</span>
        <span class="qa-name">${escapeHtml(c.summary || '')}</span>
      </a>`;
  }

  function parseSupportDate(s) {
    if (!s) return 0;
    const parts = String(s).split('.');
    if (parts.length !== 3) return 0;
    return new Date(+parts[2], +parts[1] - 1, +parts[0]).getTime();
  }

  function renderSettings(testers, hasSupport) {
    const body = $('.qa-body');
    body.className = 'qa-body qa-view-settings';
    $('.qa-tabs').innerHTML = '';
    $('.qa-meta').textContent = 'Настройки звуков (настраивай под себя)';

    let html = '<div class="qa-settings-title">Choose your fighter</div>';
    html += '<div class="qa-settings-hint">Обычный — для профессионалов. Эпичный — для души.</div>';
    html += `
      <div class="qa-mode-switch">
        <button class="qa-mode-btn ${soundMode === 'normal' ? 'qa-mode-active' : ''}" data-mode="normal"> Обычный</button>
        <button class="qa-mode-btn ${soundMode === 'epic' ? 'qa-mode-active' : ''}" data-mode="epic"> Эпичный</button>
      </div>`;
    html += '<div class="qa-settings-hint">▶ — послушать. 🔔 — заглушить у себя.</div>';

    if (!testers.length) {
      html += '<div class="qa-empty">Нет тестировщиков в Watchlist.</div>';
    } else {
      testers.forEach(t => {
        const dn = t.displayName || t.name || '(без имени)';
        const muted = userMutedTesters.has(dn);
        const safe = escapeHtml(dn);
        const raw = getTesterSound(dn);
        let hint = '';
        if (typeof raw === 'string' && /^https?:\/\//i.test(raw)) hint = 'файл';
        else if (raw === 'mute' || raw == null || raw === '') hint = 'выкл. в скрипте';
        else hint = String(raw);
        const previewDisabled = (raw === 'mute' || raw == null || raw === '') ? 'disabled' : '';
        html += `
          <div class="qa-settings-row">
            <span class="qa-settings-name">${safe}<span class="qa-sound-hint">(${escapeHtml(hint)})</span></span>
            <span class="qa-settings-actions">
              <button class="qa-preview-btn" data-tester-preview="${safe}" title="Послушать" ${previewDisabled}>▶</button>
              <button class="qa-settings-toggle ${muted ? 'qa-muted' : ''}" data-tester="${safe}" title="${muted ? 'Включить звук' : 'Заглушить'}">${muted ? '🔕' : '🔔'}</button>
            </span>
          </div>`;
      });
    }

    if (hasSupport) {
      const supSound = getSupportSound();
      const supHint = typeof supSound === 'string' && /^https?:\/\//i.test(supSound) ? 'файл' : String(supSound);
      const supPreviewDisabled = (supSound === 'mute' || supSound == null || supSound === '') ? 'disabled' : '';
      html += `
        <div class="qa-settings-row">
          <span class="qa-settings-name">Карточки саппорта<span class="qa-sound-hint">(${escapeHtml(supHint)})</span></span>
          <span class="qa-settings-actions">
            <button class="qa-preview-btn" data-support-preview="1" title="Послушать" ${supPreviewDisabled}>▶</button>
            <button class="qa-settings-toggle ${userSupportMuted ? 'qa-muted' : ''}" data-support="1" title="${userSupportMuted ? 'Включить' : 'Заглушить'}">${userSupportMuted ? '🔕' : '🔔'}</button>
          </span>
        </div>`;
    }

    if (soundMode === 'normal') {
      html += '<div class="qa-settings-divider">Пресеты</div>';
      html += '<div class="qa-settings-hint">Послушать, какие синтезированные звуки доступны. Назначать их можно в CFG.TESTER_SOUNDS_NORMAL.</div>';
      Object.keys(CFG.SOUND_PRESETS || {}).forEach(presetName => {
        html += `
          <div class="qa-settings-row">
            <span class="qa-settings-name">${escapeHtml(presetName)}</span>
            <button class="qa-preview-btn" data-preset-preview="${escapeHtml(presetName)}" title="Послушать">▶</button>
          </div>`;
      });
    } else {
      html += '<div class="qa-settings-divider">Где брать звуки</div>';
      html += `
        <div class="qa-settings-hint">
          Папка со звуками на Drive: <a href="YOUR_DRIVE_FOLDER_URL" target="_blank" rel="noopener" style="color:#2563eb;">открыть ↗</a><br><br>
          У файла должен быть доступ <b>«Все, у кого есть ссылка»</b>. Берёшь ссылку файла вида<br>
          <code style="background:#f3f4f6;padding:1px 4px;border-radius:3px;">drive.google.com/file/d/<b>FILE_ID</b>/view</code><br>
          и переписываешь её в формат<br>
          <code style="background:#f3f4f6;padding:1px 4px;border-radius:3px;">drive.google.com/uc?export=download&id=<b>FILE_ID</b></code><br>
          Вставляешь в <code>CFG.TESTER_SOUNDS_EPIC</code> в Tampermonkey.
        </div>`;
    }

    body.innerHTML = html;

    body.querySelectorAll('.qa-mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        soundMode = btn.dataset.mode;
        GM_setValue(SOUND_MODE_KEY, soundMode);
        if (lastData) render(lastData);
      });
    });

    body.querySelectorAll('.qa-settings-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.dataset.support) {
          userSupportMuted = !userSupportMuted;
          GM_setValue(SUPPORT_MUTED_KEY, userSupportMuted);
        } else {
          const dn = btn.dataset.tester;
          if (userMutedTesters.has(dn)) userMutedTesters.delete(dn);
          else userMutedTesters.add(dn);
          GM_setValue(MUTED_TESTERS_KEY, [...userMutedTesters]);
        }
        if (lastData) render(lastData);
      });
    });

    body.querySelectorAll('.qa-preview-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.dataset.testerPreview) {
          previewSound(getTesterSound(btn.dataset.testerPreview));
        } else if (btn.dataset.supportPreview) {
          previewSound(getSupportSound());
        } else if (btn.dataset.presetPreview) {
          previewSound(btn.dataset.presetPreview);
        }
      });
    });
  }

  function render(data) {

    let testers = Array.isArray(data.testers) ? data.testers.slice() : [];
    if (!testers.length && data.cards) {
      testers = [{
        name:     'Тестировщик',
        fullName: '',
        count:    data.count || data.cards.length,
        cards:    data.cards,
        meta:     data.meta || '',
        epicLine: data.epicLine || '',
      }];
    }

    const settingsBtn = $('.qa-sound-settings');
    if (settingsBtn) settingsBtn.classList.toggle('qa-active', inSettings);

    if (inSettings) {
      renderSettings(testers, !!(data.support && data.support.cards && data.support.cards.length));
      return;
    }

    let currentTester = testers.find(t => t.name === activeTester);
    if (!currentTester && testers.length) {
      currentTester = testers[0];
      activeTester = currentTester.name;
      GM_setValue(ACTIVE_TESTER_KEY, activeTester);
    }
    const cards = currentTester ? (currentTester.cards || []) : [];

    const supportCards = (data.support && data.support.cards) || [];
    const supportCount = supportCards.length;

    const totalCount = testers.reduce((s, t) => s + (t.count || 0), 0) + supportCount;
    fab.textContent = `QA: ${totalCount}`;
    setFabColor(totalCount, false);

    if (data.updatedAtIso) {
      $('.qa-meta').textContent =
        `Обновлено: ${fmtLocalDateTime(data.updatedAtIso)} · карточек: ${totalCount}`;
    } else if (currentTester && currentTester.meta) {
      $('.qa-meta').textContent = currentTester.meta;
    } else {
      $('.qa-meta').textContent = `карточек ${totalCount}`;
    }

    if (!cards.length && !supportCount) {
      $('.qa-tabs').innerHTML = '';
      $('.qa-body').innerHTML = '<div class="qa-empty">🎉 Корзина пустая!</div>';
      return;
    }

    const boardGroups  = groupByBoard(cards);
    const sortedBoards = Object.entries(boardGroups).sort((a, b) => b[1].length - a[1].length);

    const validTabs = new Set(['all']);
    sortedBoards.forEach(([name]) => validTabs.add(name));
    if (supportCount > 0) validTabs.add('support');
    if (!validTabs.has(activeTab)) {
      activeTab = 'all';
      GM_setValue(ACTIVE_TAB_KEY, activeTab);
    }

    const dnNow = currentTester ? (currentTester.displayName || currentTester.name || '') : '';
    const newInAll = cards.filter(c => currentNewKeys.has(testerScopedKey(dnNow, c.key))).length;
    const newByBoard = {};
    sortedBoards.forEach(([name, group]) => {
      newByBoard[name] = group.filter(c => currentNewKeys.has(testerScopedKey(dnNow, c.key))).length;
    });
    const newInSupport = supportCards.filter(c => currentNewKeys.has(supportScopedKey(c.key))).length;

    const dot = (n) => n > 0 ? '<span class="qa-tab-new-dot" title="Новые карточки"></span>' : '';
    let tabsHtml = '';

    if (testers.length > 1) {
      const opts = testers.map(t => {
        const safe = escapeHtml(t.name);
        const sel = t.name === activeTester ? 'selected' : '';
        return `<option value="${safe}" ${sel}>${safe} · ${t.count || 0}</option>`;
      }).join('');
      tabsHtml += `<select class="qa-tester-select" title="Выбери тестировщика">${opts}</select>`;
    }

    tabsHtml += `<div class="qa-tab ${activeTab === 'all' ? 'qa-tab-active' : ''}" data-tab="all" title="Все"><span class="qa-tab-name">Все</span><span class="qa-tab-count">${cards.length}</span>${dot(newInAll)}</div>`;
    for (const [boardName, boardCards] of sortedBoards) {
      const cls = activeTab === boardName ? 'qa-tab-active' : '';
      const safe = escapeHtml(boardName);
      tabsHtml += `<div class="qa-tab ${cls}" data-tab="${safe}" title="${safe}"><span class="qa-tab-name">${safe}</span><span class="qa-tab-count">${boardCards.length}</span>${dot(newByBoard[boardName] || 0)}</div>`;
    }
    if (supportCount > 0) {
      const cls = activeTab === 'support' ? 'qa-tab-active' : '';
      tabsHtml += `<div class="qa-tab ${cls}" data-tab="support" title="Саппорт"><span class="qa-tab-name">Саппорт</span><span class="qa-tab-count">${supportCount}</span>${dot(newInSupport)}</div>`;
    }
    $('.qa-tabs').innerHTML = tabsHtml;
    $('.qa-tabs').querySelectorAll('.qa-tab').forEach(el => {
      el.addEventListener('click', () => {
        activeTab = el.dataset.tab;
        GM_setValue(ACTIVE_TAB_KEY, activeTab);
        if (lastData) render(lastData);
      });
    });
    const sel = $('.qa-tester-select');
    if (sel) {
      sel.addEventListener('change', (e) => {
        activeTester = e.target.value;
        GM_setValue(ACTIVE_TESTER_KEY, activeTester);
        activeTab = 'all';
        GM_setValue(ACTIVE_TAB_KEY, activeTab);
        if (lastData) render(lastData);
      });
    }

    const body = $('.qa-body');
    let html = '';

    if (activeTab === 'support') {
      body.className = 'qa-body qa-view-support';
      const sup = supportCards.slice();

      const groups = {};
      sup.forEach(c => {
        const t = c.errorType || '(без типа)';
        (groups[t] = groups[t] || []).push(c);
      });
      const order = CFG.SUPPORT_ERROR_ORDER || [];
      const sortedTypes = Object.entries(groups).sort((a, b) => {
        const ai = order.indexOf(a[0]);
        const bi = order.indexOf(b[0]);
        if (ai !== -1 && bi !== -1) return ai - bi;
        if (ai !== -1) return -1;
        if (bi !== -1) return 1;
        return a[0].localeCompare(b[0], 'ru');
      });
      for (const [typeName, items] of sortedTypes) {
        items.sort((a, b) => parseSupportDate(b.created) - parseSupportDate(a.created));
        const safe = escapeHtml(typeName);
        html += `<div class="qa-epic" data-severity="${safe}"><span>${safe}</span><span>${items.length}</span></div>`;
        for (const c of items) html += supportCardHtml(c);
      }
    } else if (activeTab === 'all') {
      body.className = 'qa-body qa-view-all';
      for (const [boardName, boardCards] of sortedBoards) {
        html += `<div class="qa-board"><span>${escapeHtml(boardName)}</span><span class="qa-count">${boardCards.length}</span></div>`;
        const epicGroups = groupByEpic(boardCards);
        const sortedEpics = Object.entries(epicGroups).sort((a, b) => b[1].length - a[1].length);
        for (const [epicName, epicCards] of sortedEpics) {
          html += `<div class="qa-epic"><span>${escapeHtml(epicName)}</span><span>${epicCards.length}</span></div>`;
          for (const c of epicCards) html += cardHtml(c, dnNow);
        }
      }
    } else {
      body.className = 'qa-body qa-view-board';
      const boardCards = boardGroups[activeTab] || [];
      const epicGroups = groupByEpic(boardCards);
      const sortedEpics = Object.entries(epicGroups).sort((a, b) => b[1].length - a[1].length);
      for (const [epicName, epicCards] of sortedEpics) {
        html += `<div class="qa-epic"><span>${escapeHtml(epicName)}</span><span>${epicCards.length}</span></div>`;
        for (const c of epicCards) html += cardHtml(c, dnNow);
      }
    }
    body.innerHTML = html;
    body.scrollTop = 0;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function fmtLocalDateTime(value) {
    if (!value) return '';
    const d = new Date(value);
    if (isNaN(d)) return String(value);
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  loadData();
  setInterval(loadData, CFG.REFRESH_MIN * 60 * 1000);
  setTimeout(flushPendingSounds, 1500);
})();
