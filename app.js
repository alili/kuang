// 「第六届狂喜播客节·叁狂+」核心交互与规划系统逻辑

const STORAGE_KEY = 'kuangxi_2026_personal_plan_v1';

const SESSIONS = window.SESSIONS_DATA || [];
const SPEAKERS = window.SPEAKERS_DATA || [];
const META = window.FESTIVAL_META || {};
const SPEAKER_TITLES = window.SPEAKER_TITLES || {};
const TOPICS = window.FESTIVAL_TOPICS || [];

// ==================== SPEAKER PINYIN ENGINE ====================
const SPEAKER_PINYIN_BREAKPOINTS = {
  'A': '艾利', 'B': '白玫瑰', 'C': '草头方', 'D': '大巴', 'F': '发条张',
  'G': '高蕾', 'H': '韩欣', 'J': '江东猫草', 'K': '孔老师', 'L': '拉帝',
  'M': '马兔', 'N': '宁家宇', 'P': '潘玮', 'Q': '麒姐Fiona', 'S': '桑尼',
  'T': '台卿悦', 'W': '蛙哥', 'X': '西西C2H4', 'Y': '羊行', 'Z': '张浩'
};

function getSpeakerInitial(name) {
  if (!name) return '#';
  const first = name.trim().charAt(0);
  if (/[a-zA-Z]/.test(first)) return first.toUpperCase();
  const keys = Object.keys(SPEAKER_PINYIN_BREAKPOINTS);
  for (let i = keys.length - 1; i >= 0; i--) {
    const k = keys[i];
    if (name.localeCompare(SPEAKER_PINYIN_BREAKPOINTS[k], 'zh-Hans-CN') >= 0) {
      return k;
    }
  }
  return '#';
}
const getSpeakerPinyinInitial = getSpeakerInitial;

function compareSpeakersByPinyin(a, b) {
  const initA = getSpeakerInitial(a.name);
  const initB = getSpeakerInitial(b.name);
  if (initA !== initB) {
    if (initA === '#') return 1;
    if (initB === '#') return -1;
    return initA.localeCompare(initB);
  }
  return a.name.localeCompare(b.name, 'zh-Hans-CN', { numeric: true });
}

// 确保嘉宾列表按姓名拼音排序
SPEAKERS.sort(compareSpeakersByPinyin);

const TOPIC_BY_ID = {};
const TOPIC_BY_NAME = {};
TOPICS.forEach(t => {
  TOPIC_BY_ID[t.id] = t;
  TOPIC_BY_NAME[t.name] = t;
  TOPIC_BY_NAME[t.fullName] = t;
});

const SESSION_BY_SEQ = {};
const SESSION_BY_ID = {};
SESSIONS.forEach(s => {
  SESSION_BY_SEQ[s.seq] = s;
  SESSION_BY_ID[s.id] = s;
});

const SPEAKER_BY_NAME = {};
SPEAKERS.forEach(sp => {
  SPEAKER_BY_NAME[sp.name] = sp;
  sp.aliases.forEach(a => {
    SPEAKER_BY_NAME[a.toLowerCase()] = sp;
  });
});

function getSpeakerTitle(name) {
  if (!name) return '';
  if (SPEAKER_TITLES[name]) return SPEAKER_TITLES[name];
  const sp = SPEAKER_BY_NAME[name] || SPEAKER_BY_NAME[name.toLowerCase()];
  if (sp && sp.title) return sp.title;
  return '';
}

function formatSpeakerWithTitle(name) {
  const title = getSpeakerTitle(name);
  return title ? `${name}（${title}）` : name;
}

// Application State
const state = {
  currentView: 'matrix', // 'matrix' | 'timeline' | 'speakers'
  searchQuery: '',
  selectedSpeaker: null, // canonical speaker name
  periodFilter: 'all',
  venueFilter: 'all',
  tagFilter: 'all',
  onlyNoConflict: false,
  onlyPlanned: false,
  onlyOpenSlots: false,
  speakerFreqFilter: 'all',
  expandedSpeakers: new Set(),
  timelineGroupBy: 'time', // 'time' | 'topic'
  // plan: { [seq]: { seq, role: 'primary' | 'backup', note: '', addedAt: number } }
  plan: {},
  pendingConflictSeq: null
};

// ==================== INITIALIZATION ====================
function initApp() {
  initPosterAssets();
  loadPlanFromStorage();
  try {
    if (localStorage.getItem('kuangxi_fullwidth_mode') === '1') {
      toggleFullwidthMode(true);
    }
  } catch(e) {}
  bindSearchEvents();
  bindScrollEvents();
  bindKeyboardEvents();
  refreshAllViews();
}

function toggleFullwidthMode(forceState) {
  const isFull = typeof forceState === 'boolean'
    ? forceState
    : !document.body.classList.contains('fullwidth-mode');

  document.body.classList.toggle('fullwidth-mode', isFull);
  try {
    localStorage.setItem('kuangxi_fullwidth_mode', isFull ? '1' : '0');
  } catch(e) {}

  const txt = document.getElementById('txtFullwidth');
  const btn = document.getElementById('btnToggleFullwidth');
  if (txt) {
    txt.textContent = isFull ? '🔲 恢复标准宽度' : '🖥️ 满屏自适应';
  }
  if (btn) {
    btn.classList.toggle('btn-primary', isFull);
    btn.classList.toggle('btn-secondary', !isFull);
  }
}

function bindKeyboardEvents() {
  window.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      const customDialog = document.getElementById('customDialogBackdrop');
      if (customDialog && customDialog.classList.contains('open')) {
        e.preventDefault();
        handleCustomDialogResponse(false);
        return;
      }
      const matrixPopup = document.getElementById('matrixConflictPopupBackdrop');
      if (matrixPopup && matrixPopup.classList.contains('open')) {
        e.preventDefault();
        closeMatrixConflictPopup();
        return;
      }
      const conflictModal = document.getElementById('conflictModalBackdrop');
      if (conflictModal && conflictModal.classList.contains('open')) {
        e.preventDefault();
        closeConflictModal();
        return;
      }
      const exportStudio = document.getElementById('exportStudioBackdrop');
      if (exportStudio && exportStudio.classList.contains('open')) {
        e.preventDefault();
        closeExportStudio();
        return;
      }
      const planDrawer = document.getElementById('planDrawerBackdrop');
      if (planDrawer && planDrawer.classList.contains('open')) {
        e.preventDefault();
        closePlanDrawer();
        return;
      }
    } else if (e.key === 'Enter') {
      if (e.target && (e.target.tagName === 'TEXTAREA' || e.target.isContentEditable)) return;

      const customDialog = document.getElementById('customDialogBackdrop');
      if (customDialog && customDialog.classList.contains('open')) {
        e.preventDefault();
        handleCustomDialogResponse(true);
        return;
      }
      const conflictModal = document.getElementById('conflictModalBackdrop');
      if (conflictModal && conflictModal.classList.contains('open')) {
        e.preventDefault();
        confirmConflictResolution();
        return;
      }
      const exportStudio = document.getElementById('exportStudioBackdrop');
      if (exportStudio && exportStudio.classList.contains('open')) {
        if (!e.target || e.target.tagName !== 'INPUT') {
          e.preventDefault();
          downloadPosterJpg();
        }
        return;
      }
    }
  });
}

function bindScrollEvents() {
  const backBtn = document.getElementById('btnBackToTop');
  if (!backBtn) return;
  window.addEventListener('scroll', () => {
    backBtn.classList.toggle('visible', window.scrollY > 420);
  }, { passive: true });
}

function scrollToTopSmooth() {
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function toggleMobileFilterDrawer(forceState) {
  const row = document.getElementById('scheduleFilterRow');
  const btn = document.getElementById('btnMobileFilterToggle');
  if (!row) return;
  const nextOpen = typeof forceState === 'boolean' ? forceState : !row.classList.contains('mobile-open');
  row.classList.toggle('mobile-open', nextOpen);
  if (btn) {
    btn.classList.toggle('is-open', nextOpen);
  }
}

function syncBodyScrollLock() {
  const anyOpen =
    document.getElementById('planDrawerBackdrop')?.classList.contains('open') ||
    document.getElementById('conflictModalBackdrop')?.classList.contains('open') ||
    document.getElementById('exportStudioBackdrop')?.classList.contains('open') ||
    document.getElementById('customDialogBackdrop')?.classList.contains('open') ||
    document.getElementById('matrixConflictPopupBackdrop')?.classList.contains('open');
  document.body.classList.toggle('modal-scroll-lock', !!anyOpen);
}

// ==================== CUSTOM ALERT & CONFIRM DIALOG SYSTEM ====================
let customDialogResolver = null;

function showCustomDialog(options) {
  const {
    title = '提示',
    message = '',
    icon = '💬',
    confirmText = '确定',
    cancelText = '取消',
    isConfirm = true,
    confirmBtnClass = 'btn-primary'
  } = (typeof options === 'string' ? { message: options, isConfirm: false } : options);

  const backdrop = document.getElementById('customDialogBackdrop');
  const titleEl = document.getElementById('customDialogTitle');
  const msgEl = document.getElementById('customDialogMessage');
  const iconEl = document.getElementById('customDialogIcon');
  const confirmBtn = document.getElementById('customDialogConfirmBtn');
  const cancelBtn = document.getElementById('customDialogCancelBtn');

  if (titleEl) titleEl.textContent = title;
  if (msgEl) msgEl.innerHTML = escapeHtml(message).replace(/\n/g, '<br/>');
  if (iconEl) iconEl.textContent = icon;

  if (confirmBtn) {
    confirmBtn.textContent = confirmText;
    confirmBtn.className = `btn btn-sm ${confirmBtnClass}`;
  }

  if (cancelBtn) {
    cancelBtn.textContent = cancelText;
    cancelBtn.style.display = isConfirm ? 'inline-flex' : 'none';
  }

  if (backdrop) backdrop.classList.add('open');
  syncBodyScrollLock();

  return new Promise(resolve => {
    customDialogResolver = resolve;
  });
}

function handleCustomDialogResponse(result) {
  const backdrop = document.getElementById('customDialogBackdrop');
  if (backdrop) backdrop.classList.remove('open');
  syncBodyScrollLock();
  if (customDialogResolver) {
    const fn = customDialogResolver;
    customDialogResolver = null;
    fn(result);
  }
}

function customAlert(message, title = '提示') {
  return showCustomDialog({
    title,
    message,
    icon: 'ℹ️',
    isConfirm: false,
    confirmText: '我知道了'
  });
}

function customConfirm(message, options = {}) {
  return showCustomDialog({
    title: options.title || '请确认',
    message,
    icon: options.icon || '⚠️',
    isConfirm: true,
    confirmText: options.confirmText || '确定',
    cancelText: options.cancelText || '取消',
    confirmBtnClass: options.danger ? 'btn-danger' : 'btn-primary'
  });
}

// Redirect native alert to custom modal
window.alert = function(msg) {
  return customAlert(String(msg || ''));
};

function loadPlanFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        state.plan = parsed;
      }
    }
  } catch (e) {
    console.warn('Failed to load plan from localStorage:', e);
  }
}

function savePlanToStorage() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.plan));
  } catch (e) {
    console.warn('Failed to save plan to localStorage:', e);
  }
}

function showToast(message) {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const el = document.createElement('div');
  el.className = 'toast-msg';
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style. transition = 'opacity 0.25s ease';
    setTimeout(() => el.remove(), 260);
  }, 2800);
}

// ==================== TIME & CONFLICT ENGINE ====================
function minToTimeStr(m) {
  const hh = String(Math.floor(m / 60)).padStart(2, '0');
  const mm = String(m % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

function getOverlapMinutes(a, b) {
  const start = Math.max(a.startMin, b.startMin);
  const end = Math.min(a.endMin, b.endMin);
  return Math.max(0, end - start);
}

function getOverlapWindowStr(a, b) {
  const start = Math.max(a.startMin, b.startMin);
  const end = Math.min(a.endMin, b.endMin);
  if (end <= start) return '';
  return `${minToTimeStr(start)}–${minToTimeStr(end)}`;
}

/**
 * Returns planned sessions that overlap in time with target session `seq`.
 * By default checks against 'primary' planned sessions.
 */
function getConflictsWithPlan(seq, checkRole = 'primary') {
  const target = SESSION_BY_SEQ[seq];
  if (!target) return [];
  const conflicts = [];
  Object.values(state.plan).forEach(item => {
    if (item.seq === seq) return;
    if (checkRole && checkRole !== 'all' && item.role !== checkRole) return;
    const other = SESSION_BY_SEQ[item.seq];
    if (!other) return;
    const overlap = getOverlapMinutes(target, other);
    if (overlap > 0) {
      conflicts.push({
        session: other,
        planItem: item,
        overlapMin: overlap,
        overlapWindow: getOverlapWindowStr(target, other)
      });
    }
  });
  conflicts.sort((a, b) => a.session.startMin - b.session.startMin);
  return conflicts;
}

/**
 * Returns planned primary sessions that have a tight transfer (0 <= gap <= 10 min) with `seq`.
 */
function getTightTransfersWithPlan(seq) {
  const target = SESSION_BY_SEQ[seq];
  if (!target) return [];
  const transfers = [];
  Object.values(state.plan).forEach(item => {
    if (item.seq === seq || item.role !== 'primary') return;
    const other = SESSION_BY_SEQ[item.seq];
    if (!other) return;
    if (getOverlapMinutes(target, other) > 0) return;
    const gapBefore = target.startMin - other.endMin;
    const gapAfter = other.startMin - target.endMin;
    if (gapBefore >= 0 && gapBefore <= 10) {
      transfers.push({ session: other, gapMin: gapBefore, direction: 'after' });
    } else if (gapAfter >= 0 && gapAfter <= 10) {
      transfers.push({ session: other, gapMin: gapAfter, direction: 'before' });
    }
  });
  return transfers;
}

/**
 * Checks all pairs of planned 'primary' sessions for active conflicts.
 */
function getActivePrimaryConflicts() {
  const primaryItems = Object.values(state.plan)
    .filter(i => i.role === 'primary')
    .map(i => SESSION_BY_SEQ[i.seq])
    .filter(Boolean)
    .sort((a, b) => a.startMin - b.startMin || a.seq - b.seq);

  const pairs = [];
  for (let i = 0; i < primaryItems.length; i++) {
    for (let j = i + 1; j < primaryItems.length; j++) {
      const a = primaryItems[i];
      const b = primaryItems[j];
      const overlap = getOverlapMinutes(a, b);
      if (overlap > 0) {
        pairs.push({
          a,
          b,
          overlapMin: overlap,
          overlapWindow: getOverlapWindowStr(a, b)
        });
      }
    }
  }
  return pairs;
}

// ==================== SEARCH & FILTER LOGIC ====================
function bindSearchEvents() {
  const input = document.getElementById('searchInput');
  const clearBtn = document.getElementById('searchClearBtn');
  input.addEventListener('input', e => {
    state.searchQuery = e.target.value.trim();
    clearBtn.classList.toggle('visible', state.searchQuery.length > 0 || !!state.selectedSpeaker);
    // Check if search query matches a speaker name
    const qLower = state.searchQuery.toLowerCase().replace(/\s+/g, '');
    const exactSp = SPEAKERS.find(sp =>
      sp.name.toLowerCase().replace(/\s+/g, '') === qLower ||
      sp.aliases.some(a => a.toLowerCase().replace(/\s+/g, '') === qLower)
    );
    if (exactSp) {
      state.selectedSpeaker = exactSp.name;
    } else if (!state.searchQuery) {
      state.selectedSpeaker = null;
    }
    refreshAllViews();
  });
}

function clearSearch() {
  state.searchQuery = '';
  state.selectedSpeaker = null;
  const input = document.getElementById('searchInput');
  if (input) input.value = '';
  document.getElementById('searchClearBtn').classList.remove('visible');
  refreshAllViews();
}

function selectSpeakerSpotlight(speakerName) {
  if (state.selectedSpeaker === speakerName && state.searchQuery === speakerName && state.currentView === 'speakers') {
    clearSearch();
    return;
  }
  state.selectedSpeaker = speakerName;
  state.searchQuery = speakerName;
  const input = document.getElementById('searchInput');
  if (input) input.value = speakerName;
  document.getElementById('searchClearBtn')?.classList.add('visible');

  if (!state.expandedSpeakers) state.expandedSpeakers = new Set();
  state.expandedSpeakers.add(speakerName);

  if (state.currentView !== 'speakers') {
    switchView('speakers');
  } else {
    refreshAllViews();
  }
  window.scrollTo({ top: 140, behavior: 'smooth' });
}

function setPeriodFilter(period) {
  state.periodFilter = period;
  document.querySelectorAll('[data-period]').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-period') === period);
  });
  refreshAllViews();
}

function setVenueFilter(val) {
  state.venueFilter = val;
  refreshAllViews();
}

function setTagFilter(val) {
  if (state.tagFilter === val) {
    state.tagFilter = 'all';
  } else {
    state.tagFilter = val;
  }
  refreshAllViews();
}

function toggleFilterCheck(key, checked) {
  state[key] = checked;
  refreshAllViews();
}

function setSpeakerFreqFilter(freq) {
  state.speakerFreqFilter = freq;
  if (!state.expandedSpeakers) state.expandedSpeakers = new Set();
  state.expandedSpeakers.clear();
  document.querySelectorAll('[data-spfilter]').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-spfilter') === freq);
  });
  renderSpeakersDirectory();
}

function resetAllFilters() {
  state.searchQuery = '';
  state.selectedSpeaker = null;
  state.periodFilter = 'all';
  state.venueFilter = 'all';
  state.tagFilter = 'all';
  state.onlyNoConflict = false;
  state.onlyPlanned = false;
  state.onlyOpenSlots = false;

  const searchEl = document.getElementById('searchInput');
  if (searchEl) searchEl.value = '';
  document.getElementById('searchClearBtn')?.classList.remove('visible');

  refreshAllViews();
}

function switchView(viewName) {
  state.currentView = viewName;
  document.getElementById('tabTimeline').classList.toggle('active', viewName === 'timeline');
  document.getElementById('tabMatrix').classList.toggle('active', viewName === 'matrix');
  document.getElementById('tabSpeakers').classList.toggle('active', viewName === 'speakers');

  document.getElementById('viewTimeline').style.display = viewName === 'timeline' ? 'block' : 'none';
  document.getElementById('viewMatrix').style.display = viewName === 'matrix' ? 'block' : 'none';
  document.getElementById('viewSpeakers').style.display = viewName === 'speakers' ? 'block' : 'none';

  const filterRow = document.getElementById('scheduleFilterRow');
  if (filterRow) {
    filterRow.classList.toggle('hidden-for-speakers', viewName === 'speakers');
  }
  const mobileFilterBtn = document.getElementById('btnMobileFilterToggle');
  if (mobileFilterBtn) {
    mobileFilterBtn.classList.toggle('hidden-for-speakers', viewName === 'speakers');
  }

  refreshAllViews();
}

function getFilteredSessions() {
  const q = state.searchQuery.toLowerCase().trim();
  const qClean = q.replace(/\s+/g, '');

  return SESSIONS.filter(s => {
    // 1. Period filter
    if (state.periodFilter !== 'all' && s.period !== state.periodFilter) {
      return false;
    }

    // 2. Venue filter
    if (state.venueFilter !== 'all') {
      if (state.venueFilter.startsWith('floor:')) {
        const fl = state.venueFilter.split(':')[1];
        if (s.floor !== fl) return false;
      } else if (state.venueFilter === 'type:roundtable') {
        if (!s.isRoundtable) return false;
      } else if (s.venue !== state.venueFilter) {
        return false;
      }
    }

    // 3. Tag / Topic filter
    if (state.tagFilter !== 'all') {
      const matchTag = (s.tags && s.tags.includes(state.tagFilter)) ||
                       s.topicName === state.tagFilter ||
                       s.topicCategory === state.tagFilter ||
                       s.topicId === state.tagFilter;
      if (!matchTag) return false;
    }

    // 4. Only no conflict
    if (state.onlyNoConflict) {
      const inPlan = !!state.plan[s.seq];
      if (!inPlan && getConflictsWithPlan(s.seq, 'primary').length > 0) {
        return false;
      }
    }

    // 5. Only planned
    if (state.onlyPlanned && !state.plan[s.seq]) {
      return false;
    }

    // 6. Only open slots
    if (state.onlyOpenSlots && !s.hasOpenSlots) {
      return false;
    }

    // 7. Search query / speaker filter (only active in speakers view; timeline and timetable do not filter by speaker search)
    if (q && state.currentView === 'speakers') {
      if (state.selectedSpeaker && s.speakers.includes(state.selectedSpeaker)) {
        return true;
      }
      const matchTopic = s.topic.toLowerCase().includes(q);
      const matchCode = s.code.toLowerCase().includes(q) || s.id.toLowerCase() === q;
      const matchVenue = s.venue.toLowerCase().includes(q);
      const matchSpeaker = s.speakers.some(sp => {
        const spObj = SPEAKER_BY_NAME[sp];
        const title = getSpeakerTitle(sp);
        return sp.toLowerCase().replace(/\s+/g, '').includes(qClean) ||
               (spObj && spObj.aliases.some(a => a.toLowerCase().replace(/\s+/g, '').includes(qClean))) ||
               (title && title.toLowerCase().replace(/\s+/g, '').includes(qClean));
      }) || s.rawSpeakers.some(sp => sp.toLowerCase().replace(/\s+/g, '').includes(qClean));
      if (!matchTopic && !matchCode && !matchVenue && !matchSpeaker) {
        return false;
      }
    }

    return true;
  });
}

function renderHotSpeakersBar() {
  const container = document.getElementById('hotSpeakerPills');
  if (!container) return;
  const hotSpeakers = [...SPEAKERS].filter(sp => sp.count >= 3).sort((a, b) => b.count - a.count).slice(0, 15);
  container.innerHTML = hotSpeakers.map(sp => `
    <button class="speaker-mini-pill" onclick="selectSpeakerSpotlight('${escapeAttr(sp.name)}')">
      <span>🎙️ ${escapeHtml(sp.name)}</span>
      <span class="sp-count">${sp.count}场</span>
    </button>
  `).join('');
}

// ==================== RENDER VIEWS ====================
function refreshAllViews() {
  const activeFilterItems = [
    state.periodFilter !== 'all',
    state.venueFilter !== 'all',
    state.tagFilter !== 'all',
    state.onlyNoConflict,
    state.onlyPlanned,
    state.onlyOpenSlots
  ].filter(Boolean).length;

  const hasActiveFilter = state.searchQuery !== '' || activeFilterItems > 0;

  const resetBtn = document.getElementById('btnResetFilters');
  if (resetBtn) {
    resetBtn.style.display = hasActiveFilter ? 'inline-flex' : 'none';
  }

  const mobileBadge = document.getElementById('mobileFilterCountBadge');
  const mobileBtn = document.getElementById('btnMobileFilterToggle');
  if (mobileBadge) {
    mobileBadge.textContent = activeFilterItems;
    mobileBadge.style.display = activeFilterItems > 0 ? 'inline-flex' : 'none';
  }
  if (mobileBtn) {
    mobileBtn.classList.toggle('has-active-filters', activeFilterItems > 0);
  }

  const searchClearBtn = document.getElementById('searchClearBtn');
  if (searchClearBtn) {
    searchClearBtn.classList.toggle('visible', (state.searchQuery || state.selectedSpeaker || '').length > 0);
  }

  renderSpeakerSpotlightBanner();
  renderTimelineView();
  renderMatrixView();
  renderSpeakersDirectory();
  updatePlanIndicators();
}

function renderSpeakerSpotlightBanner() {
  const container = document.getElementById('speakerSpotlightContainer');
  if (container) {
    container.innerHTML = '';
  }
}

function getFloorClass(floor) {
  if (floor === '一楼') return 'floor-1';
  if (floor === '二楼') return 'floor-2';
  return 'floor-3';
}

function jumpToTopicSlot(topicId) {
  const el = document.getElementById(`topic-group-${topicId}`);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function jumpToSessionCard(seq) {
  const el = document.getElementById(`session-card-${seq}`);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.classList.add('flash-highlight');
  setTimeout(() => {
    el.classList.remove('flash-highlight');
  }, 1600);
}

function toggleBatchPlanTopic(topicName) {
  const top = TOPICS.find(t => t.name === topicName || t.fullName === topicName || t.id === topicName);
  if (!top) return;

  const targetSessions = SESSIONS.filter(s =>
    (s.tags && s.tags.includes(top.name)) ||
    s.topicName === top.name ||
    s.topicCategory === top.name ||
    s.topicId === top.id
  );

  const allInPlan = targetSessions.every(s => !!state.plan[s.seq]);

  if (allInPlan) {
    targetSessions.forEach(s => {
      delete state.plan[s.seq];
    });
    savePlanToStorage();
    refreshAllViews();
    showToast(`🗑️ 已将「${top.name}」相关场次从收听计划中移出`);
  } else {
    targetSessions.forEach(s => {
      if (!state.plan[s.seq]) {
        const conflicts = getConflictsWithPlan(s.seq, 'primary');
        const role = conflicts.length > 0 ? 'backup' : 'primary';
        state.plan[s.seq] = {
          seq: s.seq,
          role: role,
          addedAt: Date.now()
        };
      }
    });
    savePlanToStorage();
    refreshAllViews();
    showToast(`✨ 已成功将「${top.name}」全部 ${targetSessions.length} 场对话加入收听计划！`);
  }
}

function toggleTimelineGroupBy() {
  state.timelineGroupBy = state.timelineGroupBy === 'topic' ? 'time' : 'topic';
  renderTimelineView();
}

function renderTopicFilterBar() {
  const container = document.getElementById('topicFilterScroll');
  if (!container) return;

  const totalCount = SESSIONS.length;
  const isAllActive = state.tagFilter === 'all';

  let html = `
    <button
      type="button"
      class="topic-filter-chip ${isAllActive ? 'active' : ''}"
      onclick="setTagFilter('all')"
      title="查看全部 88 场对话"
    >
      <span>全部话题</span>
      <span class="chip-count">(${totalCount})</span>
    </button>
  `;

  TOPICS.forEach(top => {
    const isActive = state.tagFilter === top.name ||
                     state.tagFilter === top.fullName ||
                     state.tagFilter === top.id;
    const activeStyle = isActive
      ? `background:${top.color}; color:#fff; border-color:${top.color}; box-shadow:0 2px 8px ${top.color}40;`
      : `border-color:${top.border}; color:${top.color}; background:${top.bg};`;

    html += `
      <button
        type="button"
        class="topic-filter-chip ${isActive ? 'active' : ''}"
        style="${activeStyle}"
        onclick="setTagFilter('${escapeAttr(top.name)}')"
        title="${escapeAttr(top.desc)}"
      >
        <span>${top.icon}</span>
        <span>${escapeHtml(top.fullName)}</span>
        <span class="chip-count">(${top.count})</span>
      </button>
    `;
  });

  container.innerHTML = html;

  const toggleBtnTxt = document.getElementById('txtGroupByLabel');
  if (toggleBtnTxt) {
    toggleBtnTxt.textContent = state.timelineGroupBy === 'topic' ? '🕒 按时间段分组' : '📑 按9大话题分组';
  }
}

function jumpToTimeSlot(startTime) {
  const safeId = `time-group-${startTime.replace(':', '-')}`;
  const el = document.getElementById(safeId);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderTimelineView() {
  renderTopicFilterBar();

  const filtered = getFilteredSessions();
  document.getElementById('badgeFilteredCount').textContent = filtered.length;

  const summaryEl = document.getElementById('timelineSummaryText');
  if (summaryEl) {
    const activeTopic = TOPICS.find(t => t.name === state.tagFilter || t.fullName === state.tagFilter);
    if (activeTopic) {
      summaryEl.innerHTML = `当前筛选：<strong>${activeTopic.icon} ${activeTopic.fullName}</strong>（共 ${filtered.length} 场对话） · ${activeTopic.desc}`;
    } else {
      summaryEl.innerHTML = `当前筛选共找到 <strong>${filtered.length}</strong> 场节目（全天共 88 场）`;
    }
  }

  const container = document.getElementById('timelineGroupsContainer');
  const jumpBar = document.getElementById('timeSlotJumpBar');
  if (!container) return;

  if (filtered.length === 0) {
    if (jumpBar) jumpBar.style.display = 'none';
    container.innerHTML = `
      <div style="background:var(--bg-surface); border:1px dashed var(--border-strong); border-radius:var(--radius-lg); padding:48px 24px; text-align:center;">
        <div style="font-size:36px; margin-bottom:10px;">🔍</div>
        <h3 style="font-size:17px; font-weight:700; margin-bottom:6px;">没有找到符合当前筛选条件的节目场次</h3>
        <p style="font-size:13px; color:var(--text-secondary); margin-bottom:16px;">你可以尝试清空搜索关键词或重置筛选条件。</p>
        <button class="btn btn-primary" onclick="resetAllFilters()">重置全部筛选条件</button>
      </div>
    `;
    return;
  }

  // Branch 1: Single Topic Category Selected (Flattened Multi-Column Grid Flow)
  if (state.tagFilter !== 'all') {
    const activeTopic = TOPICS.find(t => t.name === state.tagFilter || t.fullName === state.tagFilter || t.id === state.tagFilter) || {
      name: state.tagFilter,
      fullName: state.tagFilter,
      icon: '🏷️',
      desc: '当前分类对话专场',
      color: '#E84324',
      bg: '#FFF5F2',
      border: '#FED7AA'
    };

    filtered.sort((a, b) => a.startMin - b.startMin || a.venueOrder - b.venueOrder);

    // Quick Jump Pills for each session time in this topic
    if (jumpBar) {
      if (filtered.length > 1) {
        jumpBar.style.display = 'flex';
        const pillsHtml = filtered.map(s => {
          const inPlan = !!state.plan[s.seq];
          return `
            <button
              type="button"
              class="time-jump-pill ${inPlan ? 'has-planned' : ''}"
              onclick="jumpToSessionCard(${s.seq})"
              title="速跳至 ${s.code} ${s.time} ${s.venueShort}"
            >
              <span>🕒 ${s.start}</span>
              <span class="jump-count">${s.code}</span>
            </button>
          `;
        }).join('');
        jumpBar.innerHTML = `<span class="time-jump-label">⏱️ 场次速跳：</span><div class="time-jump-scroll">${pillsHtml}</div>`;
      } else {
        jumpBar.style.display = 'none';
      }
    }

    const allInPlan = filtered.every(s => !!state.plan[s.seq]);
    const plannedCount = filtered.filter(s => !!state.plan[s.seq]).length;

    const html = `
      <div class="topic-track-section">
        <div class="topic-track-hero-card" style="background:${activeTopic.bg}; border:1.5px solid ${activeTopic.border};">
          <div class="topic-track-info">
            <div class="topic-track-badge-row">
              <span class="topic-track-icon">${activeTopic.icon}</span>
              <span class="topic-track-name" style="color:${activeTopic.color};">${escapeHtml(activeTopic.fullName)}</span>
              <span class="topic-track-count-pill" style="background:${activeTopic.color}; color:#fff;">共 ${filtered.length} 场对话</span>
              <span class="topic-track-planned-pill">已选 ${plannedCount}/${filtered.length} 场</span>
            </div>
            <div class="topic-track-desc" style="color:var(--text-secondary);">${escapeHtml(activeTopic.desc)} · 全天时段动线排列，支持横向并排对比</div>
          </div>
          <div class="topic-track-actions">
            <button
              type="button"
              class="btn btn-sm ${allInPlan ? 'btn-secondary' : 'btn-primary'}"
              onclick="toggleBatchPlanTopic('${escapeAttr(activeTopic.name)}')"
            >
              ${allInPlan ? '✓ 已全选该话题场次' : '✨ 一键将本话题全部加入计划'}
            </button>
            <button
              type="button"
              class="btn btn-secondary btn-sm"
              onclick="setTagFilter('all')"
              title="清除话题筛选，查看全部 88 场对话"
            >
              ✕ 查看全部 88 场
            </button>
          </div>
        </div>

        <div class="sessions-grid">
          ${filtered.map(s => renderSessionCardHtml(s)).join('')}
        </div>
      </div>
    `;

    container.innerHTML = html;
    return;
  }

  // Branch 2: Group by 9 Official Topics
  if (state.timelineGroupBy === 'topic') {
    const topicGroups = [];
    TOPICS.forEach(top => {
      const groupSessions = filtered.filter(s => s.topicId === top.id || s.topicName === top.name);
      if (groupSessions.length > 0) {
        groupSessions.sort((a, b) => a.startMin - b.startMin);
        topicGroups.push({ topic: top, sessions: groupSessions });
      }
    });

    if (jumpBar) {
      if (topicGroups.length > 1) {
        jumpBar.style.display = 'flex';
        const pillsHtml = topicGroups.map(({ topic, sessions }) => {
          const hasPlanned = sessions.some(s => !!state.plan[s.seq]);
          return `<button type="button" class="time-jump-pill ${hasPlanned ? 'has-planned' : ''}" onclick="jumpToTopicSlot('${topic.id}')">${topic.icon} ${topic.name}<span class="jump-count">${sessions.length}</span></button>`;
        }).join('');
        jumpBar.innerHTML = `<span class="time-jump-label">📑 话题速跳：</span><div class="time-jump-scroll">${pillsHtml}</div>`;
      } else {
        jumpBar.style.display = 'none';
      }
    }

    let html = '';
    topicGroups.forEach(({ topic: top, sessions: groupSessions }) => {
      const safeId = `topic-group-${top.id}`;
      html += `
        <div class="topic-group-section" id="${safeId}">
          <div class="topic-group-header" style="background:${top.bg}; border:1.5px solid ${top.border}; color:${top.color};">
            <div>
              <div class="topic-group-title">
                <span>${top.icon}</span>
                <span>${escapeHtml(top.fullName)}</span>
                <span class="topic-group-badge-count">共 ${groupSessions.length} 场</span>
              </div>
              <div class="topic-group-desc" style="color:var(--text-secondary);">${escapeHtml(top.desc)}</div>
            </div>
            <div style="font-size:12px; color:${top.color}; font-weight:700;">
              ✨ 栏内按开场时间排序
            </div>
          </div>
          <div class="sessions-grid">
            ${groupSessions.map(s => renderSessionCardHtml(s)).join('')}
          </div>
        </div>
      `;
    });

    container.innerHTML = html;
    return;
  }

  // Branch 3: Group by Start Time (Default when showing all topics)
  const groupsMap = new Map();
  filtered.forEach(s => {
    const key = s.start;
    if (!groupsMap.has(key)) {
      groupsMap.set(key, []);
    }
    groupsMap.get(key).push(s);
  });

  // If every group has only 1 session (sparse search result), flatten into multi-column grid
  const maxInGroup = Math.max(0, ...Array.from(groupsMap.values()).map(g => g.length));
  if (groupsMap.size > 1 && maxInGroup === 1) {
    if (jumpBar) {
      jumpBar.style.display = 'flex';
      const pillsHtml = filtered.map(s => {
        const inPlan = !!state.plan[s.seq];
        return `
          <button
            type="button"
            class="time-jump-pill ${inPlan ? 'has-planned' : ''}"
            onclick="jumpToSessionCard(${s.seq})"
          >
            <span>🕒 ${s.start}</span>
            <span class="jump-count">${s.code}</span>
          </button>
        `;
      }).join('');
      jumpBar.innerHTML = `<span class="time-jump-label">⏱️ 场次速跳：</span><div class="time-jump-scroll">${pillsHtml}</div>`;
    }

    container.innerHTML = `
      <div class="time-group-section">
        <div class="time-slot-header">
          <span class="time-slot-badge">🕒 按时间连续排列</span>
          <span class="time-slot-sub">共找到 ${filtered.length} 场对话 · 已按全天时间动线横向平铺展示</span>
        </div>
        <div class="sessions-grid">
          ${filtered.map(s => renderSessionCardHtml(s)).join('')}
        </div>
      </div>
    `;
    return;
  }

  if (jumpBar) {
    if (groupsMap.size > 1) {
      jumpBar.style.display = 'flex';
      const pillsHtml = Array.from(groupsMap.entries()).map(([startTime, groupSessions]) => {
        const hasPlanned = groupSessions.some(s => !!state.plan[s.seq]);
        return `<button type="button" class="time-jump-pill ${hasPlanned ? 'has-planned' : ''}" onclick="jumpToTimeSlot('${escapeAttr(startTime)}')">${startTime}<span class="jump-count">${groupSessions.length}</span></button>`;
      }).join('');
      jumpBar.innerHTML = `<span class="time-jump-label">⏱️ 开场速跳：</span><div class="time-jump-scroll">${pillsHtml}</div>`;
    } else {
      jumpBar.style.display = 'none';
    }
  }

  let html = '';
  for (const [startTime, groupSessions] of groupsMap.entries()) {
    const endTimes = Array.from(new Set(groupSessions.map(g => g.end))).sort();
    const periodLabel = groupSessions[0].periodLabel;
    const safeId = `time-group-${startTime.replace(':', '-')}`;

    html += `
      <div class="time-group-section" id="${safeId}">
        <div class="time-slot-header">
          <span class="time-slot-badge">🕒 ${startTime} 开场</span>
          <span class="time-slot-sub">${periodLabel} · 本时段共 ${groupSessions.length} 场平行对话（结束于 ${endTimes.join(' / ')}）</span>
        </div>
        <div class="sessions-grid">
          ${groupSessions.map(s => renderSessionCardHtml(s)).join('')}
        </div>
      </div>
    `;
  }

  container.innerHTML = html;
}

function handleSessionCardClick(event, seq) {
  if (event.target.closest('button, a, input, select, textarea, .speaker-chip, .topic-badge-btn')) {
    return;
  }
  handleSessionAction(seq, event);
}

function renderSessionCardHtml(s) {
  const planItem = state.plan[s.seq];
  const isPrimary = planItem && planItem.role === 'primary';
  const isBackup = planItem && planItem.role === 'backup';
  const primaryConflicts = getConflictsWithPlan(s.seq, 'primary');
  const allConflicts = getConflictsWithPlan(s.seq, 'all');
  const tightTransfers = getTightTransfersWithPlan(s.seq);

  let cardClass = 'session-card';
  if (isPrimary) cardClass += ' in-plan-primary';
  else if (isBackup) cardClass += ' in-plan-backup';
  else if (allConflicts.length > 0) cardClass += ' has-conflict';

  // Conflict / Status alert box inside card
  let statusAlertHtml = '';
  if (isPrimary) {
    if (primaryConflicts.length > 0) {
      const cNames = primaryConflicts.map(c => `${c.session.code}(${c.session.time})`).join('、');
      statusAlertHtml = `
        <div class="card-conflict-alert conflict">
          <span>⚡ 已设为主选，但与同为主选的 ${cNames} 重叠 ${primaryConflicts[0].overlapMin} 分钟</span>
          <button class="btn btn-secondary btn-sm" style="padding:2px 8px; font-size:11px;" onclick="setSessionRole(${s.seq}, 'backup')">转为待选</button>
        </div>
      `;
    } else {
      statusAlertHtml = `
        <div class="card-conflict-alert selected-primary">
          <span>✅ 已加入个人计划【必听主选】</span>
          <button class="btn btn-secondary btn-sm" style="padding:2px 8px; font-size:11px;" onclick="setSessionRole(${s.seq}, 'backup')">改为待选</button>
        </div>
      `;
    }
  } else if (isBackup) {
    statusAlertHtml = `
      <div class="card-conflict-alert selected-backup">
        <span>📌 已加入个人计划【待选日程】</span>
        <button class="btn btn-secondary btn-sm" style="padding:2px 8px; font-size:11px;" onclick="promoteBackupToPrimary(${s.seq})">升为主选</button>
      </div>
    `;
  } else if (allConflicts.length > 0) {
    const firstC = allConflicts[0];
    const roleTxt = firstC.planItem?.role === 'primary' ? '主选' : '待选';
    statusAlertHtml = `
      <div class="card-conflict-alert conflict">
        <span>⚡ 与已选${roleTxt} ${firstC.session.code} ${firstC.session.time} 时间冲突（重叠 ${firstC.overlapMin} 分钟）</span>
      </div>
    `;
  } else if (tightTransfers.length > 0) {
    const firstT = tightTransfers[0];
    statusAlertHtml = `
      <div class="card-conflict-alert tight">
        <span>🏃 与已选主选 ${firstT.session.code} 仅间隔 ${firstT.gapMin} 分钟（${firstT.session.venueShort} ↔ ${s.venueShort}）</span>
      </div>
    `;
  }

  // Speakers HTML
  const speakersHtml = s.speakers.length > 0
    ? s.speakers.map(sp => {
        const spInfo = SPEAKER_BY_NAME[sp];
        const spTitle = getSpeakerTitle(sp);
        const qLower = state.searchQuery ? state.searchQuery.toLowerCase().trim() : '';
        const isHighlighted = state.selectedSpeaker === sp ||
          (qLower && (
            sp.toLowerCase().includes(qLower) ||
            (spTitle && spTitle.toLowerCase().includes(qLower))
          ));
        const countBadge = spInfo && spInfo.count > 1 ? `<span class="sp-chip-count">(${spInfo.count})</span>` : '';
        const titleBadge = spTitle ? `<span class="speaker-chip-title">${escapeHtml(spTitle)}</span>` : '';
        const tipText = spTitle ? `点击查看 ${sp}（${spTitle}）的全天节目单` : `点击查看 ${sp} 的全天节目单`;
        return `<button class="speaker-chip ${isHighlighted ? 'highlighted' : ''}" onclick="selectSpeakerSpotlight('${escapeAttr(sp)}')" title="${escapeAttr(tipText)}"><span class="speaker-chip-name">🎙️ ${escapeHtml(sp)}${countBadge}</span>${titleBadge}</button>`;
      }).join('')
    : `<span style="font-size:12px; color:var(--text-muted);">暂无公开嘉宾名单（虚位以待）</span>`;

  // Action button
  let actionBtnHtml = '';
  if (planItem) {
    if (planItem.role === 'backup') {
      actionBtnHtml = `
        <button class="btn-plan-toggle active-backup" onclick="showMatrixSessionPopup(event, ${s.seq}, 'manage_backup')">
          📌 已在备选（点击改为主选 / 管理）
        </button>
      `;
    } else {
      actionBtnHtml = `
        <button class="btn-plan-toggle active-primary" onclick="showMatrixSessionPopup(event, ${s.seq}, 'manage_primary')">
          ✓ 已在主选（点击管理 / 移出）
        </button>
      `;
    }
  } else if (allConflicts.length > 0) {
    actionBtnHtml = `
      <button class="btn-plan-toggle btn-plan-conflict" onclick="handleSessionAction(${s.seq}, event)">
        ⚡ 存在时间冲突 · 点击查看时间轴与决策
      </button>
    `;
  } else {
    actionBtnHtml = `
      <button class="btn-plan-toggle" onclick="handleSessionAction(${s.seq}, event)">
        ＋ 加入我的收听计划
      </button>
    `;
  }

  return `
    <article class="${cardClass}" id="session-card-${s.seq}" onclick="handleSessionCardClick(event, ${s.seq})" style="cursor:pointer;">
      <div class="session-card-body">
        <div class="session-card-top">
          <div class="session-meta-left">
            <span class="session-code">${s.code}</span>
            <span class="session-time-pill">${s.time} (${s.durationMin}m)</span>
          </div>
          <span class="venue-badge ${getFloorClass(s.floor)}">📍 ${escapeHtml(s.venue)}</span>
        </div>

        <h3 class="session-topic">${escapeHtml(s.topic)}</h3>

        <div class="session-tags-row">
          <button
            type="button"
            class="topic-badge-btn"
            style="color:${s.topicColor || 'var(--brand-primary)'}; background:${s.topicBg || '#FFF5F2'}; border-color:${s.topicBorder || 'rgba(232,67,36,0.3)'};"
            onclick="setTagFilter('${escapeAttr(s.topicName || s.tags[0])}')"
            title="点击筛选「${escapeAttr(s.topicCategory || s.topicName || s.tags[0])}」官方话题全部场次"
          >
            <span>${s.topicIcon || '🏷️'}</span>
            <span>${escapeHtml(s.topicCategory || s.topicName || s.tags[0])}</span>
          </button>
          ${s.hasOpenSlots ? `<span class="open-slot-tag" title="按每场4人计，本场尚有可增补嘉宾位置">🪑 可增补席位 ×${Math.max(1, 4 - s.speakers.length)}</span>` : ''}
        </div>

        <div class="session-speakers">
          <span class="speaker-label">主播/嘉宾：</span>
          ${speakersHtml}
        </div>
      </div>

      <div class="session-card-bottom">
        ${statusAlertHtml}
        <div class="session-card-footer">
          ${actionBtnHtml}
        </div>
      </div>
    </article>
  `;
}

// ==================== VIEW 2: 11-HALL MATRIX TIMETABLE ====================
function renderMatrixView() {
  const container = document.getElementById('matrixScrollInner');
  if (!container) return;

  const dayStartMin = 8 * 60 + 30; // 08:30 (510)
  const dayEndMin = 21 * 60;       // 21:00 (1260)
  const totalSpan = dayEndMin - dayStartMin; // 750 mins

  // Ruler marks every 30 mins with sticky left header corner
  let rulerMarksHtml = '';
  for (let m = dayStartMin; m <= dayEndMin; m += 30) {
    const leftPct = ((m - dayStartMin) / totalSpan) * 100;
    rulerMarksHtml += `<span class="ruler-mark" style="left:${leftPct.toFixed(3)}%;">${minToTimeStr(m)}</span>`;
  }
  const rulerHtml = `
    <div class="matrix-time-ruler">
      <div class="matrix-corner-col">场地 / 时间</div>
      <div class="matrix-ruler-track">${rulerMarksHtml}</div>
    </div>
  `;

  // Rows by venue
  let rowsHtml = '';
  const venues = META.venues || [];
  venues.forEach(v => {
    const venueSessions = SESSIONS.filter(s => s.venue === v.name);
    let blocksHtml = '';
    venueSessions.forEach(s => {
      const leftPct = ((s.startMin - dayStartMin) / totalSpan) * 100;
      const widthPct = (s.durationMin / totalSpan) * 100;
      const pItem = state.plan[s.seq];
      const conflicts = getConflictsWithPlan(s.seq, 'primary');

      let blockClass = 'matrix-block';
      if (pItem && pItem.role === 'primary') blockClass += ' in-plan-primary';
      else if (pItem && pItem.role === 'backup') blockClass += ' in-plan-backup';
      else if (conflicts.length > 0) blockClass += ' conflict-block';

      const spText = s.speakers.length > 0 ? s.speakers.join(' / ') : '虚位以待';

      blocksHtml += `
        <div
          class="${blockClass}"
          style="left:${leftPct.toFixed(3)}%; width:${widthPct.toFixed(3)}%;"
          onclick="hideMatrixTooltip(); handleMatrixBlockClick(event, ${s.seq})"
          onmouseenter="showMatrixTooltip(event, ${s.seq})"
          onmousemove="moveMatrixTooltip(event)"
          onmouseleave="hideMatrixTooltip()"
        >
          <div class="matrix-block-title">${escapeHtml(s.topic)}</div>
          <div class="matrix-block-speakers">
            🎙️ ${escapeHtml(spText)}
          </div>
        </div>
      `;
    });

    rowsHtml += `
      <div class="matrix-row">
        <div class="matrix-venue-col">
          <div class="matrix-venue-name">${escapeHtml(v.short)}</div>
          <div class="matrix-venue-floor">${escapeHtml(v.name)}</div>
        </div>
        <div class="matrix-track">
          ${blocksHtml}
        </div>
      </div>
    `;
  });

  container.innerHTML = rulerHtml + rowsHtml;
}

function showMatrixTooltip(e, seq) {
  const tooltip = document.getElementById('matrixHoverTooltip');
  const s = SESSION_BY_SEQ[seq];
  if (!tooltip || !s) return;

  const pItem = state.plan[s.seq];
  const conflicts = getConflictsWithPlan(s.seq, 'primary');

  let speakersListHtml = '';
  if (s.speakers.length > 0) {
    speakersListHtml = s.speakers.map(sp => {
      const spInfo = SPEAKER_BY_NAME[sp];
      const spTitle = getSpeakerTitle(sp);
      const countBadge = spInfo && spInfo.count > 1 ? `<span class="m-tip-sp-count">(${spInfo.count}场)</span>` : '';
      return `
        <div class="m-tip-speaker-row">
          <div class="m-tip-sp-left">
            <span class="m-tip-sp-icon">🎙️</span>
            <span class="m-tip-sp-name">${escapeHtml(sp)}</span>
            ${countBadge}
          </div>
          ${spTitle ? `<div class="m-tip-sp-title" title="${escapeAttr(spTitle)}">${escapeHtml(spTitle)}</div>` : ''}
        </div>
      `;
    }).join('');
  } else {
    speakersListHtml = `<div class="m-tip-speaker-empty">暂无公开名单（虚位以待）</div>`;
  }

  if (s.hasOpenSlots) {
    speakersListHtml += `<div class="m-tip-open-slot">🪑 待增补席位 ×${Math.max(1, 4 - s.speakers.length)}</div>`;
  }

  let statusHtml = '';
  if (pItem && pItem.role === 'primary') {
    statusHtml = `<span class="m-tip-status primary">✅ 已在必听主选（点击移除）</span>`;
  } else if (pItem && pItem.role === 'backup') {
    statusHtml = `<span class="m-tip-status backup">📌 已在备选计划（点击移除）</span>`;
  } else if (conflicts.length > 0) {
    statusHtml = `<span class="m-tip-status conflict">⚡ 与已选 ${conflicts[0].session.code} 重叠 ${conflicts[0].overlapMin} 分钟（点击处理）</span>`;
  } else {
    statusHtml = `<span class="m-tip-status ok">＋ 点击加入我的收听计划</span>`;
  }

  tooltip.innerHTML = `
    <div class="m-tip-top">
      <span class="m-tip-code">${s.code} ${s.time} (${s.durationMin}m)</span>
      <span class="m-tip-venue">📍 ${escapeHtml(s.venue)}</span>
    </div>
    <div style="margin-bottom:6px;">
      <span style="display:inline-flex; align-items:center; gap:4px; padding:2px 8px; border-radius:4px; font-size:11px; font-weight:600; color:var(--text-secondary); background:var(--bg-muted); border:1px solid var(--border-subtle);">
        ${s.topicIcon || '🏷️'} ${escapeHtml(s.topicCategory || s.topicName || '')}
      </span>
    </div>
    <div class="m-tip-topic">${escapeHtml(s.topic)}</div>
    <div class="m-tip-speakers-box">
      <div class="m-tip-speakers-header">🎙️ 对话主播与嘉宾（共 ${s.speakers.length} 位）：</div>
      <div class="m-tip-speakers-rows">
        ${speakersListHtml}
      </div>
    </div>
    <div class="m-tip-footer">${statusHtml}</div>
  `;
  tooltip.classList.add('visible');
  moveMatrixTooltip(e);
}

function moveMatrixTooltip(e) {
  const tooltip = document.getElementById('matrixHoverTooltip');
  if (!tooltip || !tooltip.classList.contains('visible')) return;

  const pad = 14;
  const tipRect = tooltip.getBoundingClientRect();
  let left = e.clientX + 14;
  let top = e.clientY + 16;

  if (left + tipRect.width + pad > window.innerWidth) {
    left = Math.max(pad, e.clientX - tipRect.width - 12);
  }
  if (top + tipRect.height + pad > window.innerHeight) {
    top = Math.max(pad, e.clientY - tipRect.height - 12);
  }

  tooltip.style.transform = `translate3d(${Math.round(left)}px, ${Math.round(top)}px, 0)`;
}

function hideMatrixTooltip() {
  const tooltip = document.getElementById('matrixHoverTooltip');
  if (tooltip) {
    tooltip.classList.remove('visible');
  }
}

// ==================== MATRIX QUICK ACTION & CONFLICT POPUP SYSTEM ====================
function handleMatrixBlockClick(event, seq) {
  if (event) {
    event.stopPropagation();
  }
  const existing = state.plan[seq];
  if (existing) {
    // Already in plan - open refined action popup to allow changing to primary or removing
    showMatrixSessionPopup(event, seq, existing.role === 'backup' ? 'manage_backup' : 'manage_primary');
    return;
  }

  const conflicts = getConflictsWithPlan(seq, 'all');
  if (conflicts.length === 0) {
    addSessionToPlan(seq, 'primary');
  } else {
    showMatrixSessionPopup(event, seq, 'conflict', conflicts);
  }
}

function buildConflictTimelineAndList(target, targetRole, conflicts) {
  if (!conflicts || conflicts.length === 0) {
    return { timelineHtml: '', conflictsListHtml: '' };
  }

  const allSessions = [target, ...conflicts.map(c => c.session)];
  const minStart = Math.min(...allSessions.map(s => s.startMin));
  const maxEnd = Math.max(...allSessions.map(s => s.endMin));

  // Snap ruler to 15-min or 30-min boundaries
  const rulerStart = Math.floor((minStart - 5) / 15) * 15;
  const rulerEnd = Math.ceil((maxEnd + 5) / 15) * 15;
  const totalSpan = Math.max(30, rulerEnd - rulerStart);
  const step = totalSpan <= 120 ? 15 : 30;

  let rulerTicksHtml = '';
  for (let m = rulerStart; m <= rulerEnd; m += step) {
    const pct = ((m - rulerStart) / totalSpan) * 100;
    rulerTicksHtml += `
      <div class="mini-ruler-tick" style="left:${pct.toFixed(2)}%;">
        <div class="mini-tick-line"></div>
        <div class="mini-tick-text">${minToTimeStr(m)}</div>
      </div>
    `;
  }

  // Overlap zones (red shaded vertical stripes)
  const overlapZonesHtml = conflicts.map(c => {
    const ovStart = Math.max(target.startMin, c.session.startMin);
    const ovEnd = Math.min(target.endMin, c.session.endMin);
    const ovSpan = Math.max(0, ovEnd - ovStart);
    if (ovSpan <= 0) return '';
    const leftPct = ((ovStart - rulerStart) / totalSpan) * 100;
    const widthPct = (ovSpan / totalSpan) * 100;
    return `
      <div class="mini-overlap-zone" style="left:${leftPct.toFixed(2)}%; width:${widthPct.toFixed(2)}%;">
        <span class="mini-overlap-tag">重叠 ${ovSpan}m</span>
      </div>
    `;
  }).join('');

  // Target track lane
  const targetLeft = ((target.startMin - rulerStart) / totalSpan) * 100;
  const targetWidth = ((target.endMin - target.startMin) / totalSpan) * 100;

  let targetLabel = '待选场次';
  let targetBarClass = 'bar-target';
  let targetLabelClass = '';
  if (targetRole === 'primary') {
    targetLabel = '当前主选';
    targetBarClass = 'bar-primary';
    targetLabelClass = 'label-primary';
  } else if (targetRole === 'backup') {
    targetLabel = '当前待选';
    targetBarClass = 'bar-backup';
    targetLabelClass = 'label-backup';
  }

  const targetRowHtml = `
    <div class="mini-timeline-row">
      <div class="mini-track-label ${targetLabelClass}">${targetLabel}</div>
      <div class="mini-track-lane">
        <div class="mini-track-bar ${targetBarClass}" style="left:${targetLeft.toFixed(2)}%; width:${targetWidth.toFixed(2)}%;">
          <span class="mini-bar-code">${target.code}</span>
          <span class="mini-bar-time">${target.time}</span>
        </div>
      </div>
    </div>
  `;

  // Conflicting tracks
  const conflictingTracksHtml = conflicts.map(c => {
    const isPrim = c.planItem?.role === 'primary';
    const label = isPrim ? '已选主选' : '已选待选';
    const labelClass = isPrim ? 'label-primary' : 'label-backup';
    const barClass = isPrim ? 'bar-primary' : 'bar-backup';
    const cLeft = ((c.session.startMin - rulerStart) / totalSpan) * 100;
    const cWidth = ((c.session.endMin - c.session.startMin) / totalSpan) * 100;
    return `
      <div class="mini-timeline-row">
        <div class="mini-track-label ${labelClass}">${label}</div>
        <div class="mini-track-lane">
          <div class="mini-track-bar ${barClass}" style="left:${cLeft.toFixed(2)}%; width:${cWidth.toFixed(2)}%;">
            <span class="mini-bar-code">${c.session.code}</span>
            <span class="mini-bar-time">${c.session.time}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');

  const maxOverlapMin = Math.max(...conflicts.map(c => c.overlapMin));

  const timelineHtml = `
    <div class="mini-timeline-widget">
      <div class="mini-timeline-header">
        <span class="mini-timeline-title">
          <span>⏱️</span>
          <span>重叠时间轴对照</span>
        </span>
        <span class="mini-overlap-pill">⚡ 重叠 ${maxOverlapMin} 分钟</span>
      </div>
      <div class="mini-timeline-trackbox">
        <div class="mini-lanes-container">
          <div class="mini-timeline-ruler">
            ${rulerTicksHtml}
          </div>
          ${overlapZonesHtml}
          ${targetRowHtml}
          ${conflictingTracksHtml}
        </div>
      </div>
    </div>
  `;

  // Full conflicting sessions detail list
  const conflictCardsHtml = conflicts.map(c => {
    const isPrim = c.planItem?.role === 'primary';
    const roleTagClass = isPrim ? 'primary' : 'backup';
    const roleText = isPrim ? '★ 必听主选' : '📌 待选日程';
    const cardClass = isPrim ? 'is-primary' : 'is-backup';
    return `
      <div class="m-conflict-card ${cardClass}">
        <div class="m-conflict-card-top">
          <span class="m-conflict-role-tag ${roleTagClass}">${roleText}</span>
          <span class="m-conflict-code">${c.session.code}</span>
          <span class="m-conflict-time">${c.session.time}</span>
          <span class="m-conflict-venue">📍 ${escapeHtml(c.session.venue)}</span>
          <span class="m-conflict-overlap-pill">⚡ 重叠 ${c.overlapMin} 分钟</span>
        </div>
        <div class="m-conflict-topic">${escapeHtml(c.session.topic)}</div>
      </div>
    `;
  }).join('');

  const conflictsListHtml = `
    <div class="m-conflicts-section-label">重叠日程清单（共 ${conflicts.length} 场）：</div>
    <div class="m-conflicts-list">
      ${conflictCardsHtml}
    </div>
  `;

  return { timelineHtml, conflictsListHtml };
}

function showMatrixSessionPopup(event, seq, mode, conflicts = []) {
  const target = SESSION_BY_SEQ[seq];
  const container = document.getElementById('matrixConflictPopupContent');
  const popup = document.getElementById('matrixConflictPopup');
  const backdrop = document.getElementById('matrixConflictPopupBackdrop');
  if (!target || !container || !popup || !backdrop) return;

  let badgeHtml = '';
  let hintHtml = '';
  let actionsHtml = '';
  let timelineHtml = '';
  let conflictsListHtml = '';

  if (mode === 'manage_backup') {
    badgeHtml = '<span class="m-popup-badge badge-backup">📌 当前状态：待选日程</span>';
    const allConflicts = getConflictsWithPlan(seq, 'all');
    if (allConflicts.length > 0) {
      const built = buildConflictTimelineAndList(target, 'backup', allConflicts);
      timelineHtml = built.timelineHtml;
      conflictsListHtml = built.conflictsListHtml;
    } else {
      hintHtml = '<div class="m-popup-hint-box ok">✓ 行程顺畅，此时段与其他日程无冲突</div>';
    }

    const hasPrimaryConflict = allConflicts.some(c => c.planItem?.role === 'primary');
    const upgradeAction = hasPrimaryConflict ? 'backup_to_primary_resolve' : 'backup_to_primary_direct';
    const upgradeLabel = hasPrimaryConflict ? '⭐ 改为主选' : '⭐ 升为主选';

    actionsHtml = `
      <div class="m-decision-actions">
        <button type="button" class="m-decision-btn btn-primary" onclick="resolveMatrixAction(${seq}, '${upgradeAction}')">
          ${upgradeLabel}
        </button>
        <button type="button" class="m-decision-btn btn-danger" onclick="resolveMatrixAction(${seq}, 'remove')">
          🗑️ 移出计划
        </button>
        <button type="button" class="m-decision-btn btn-cancel" onclick="closeMatrixConflictPopup()">
          ✕ 保持待选
        </button>
      </div>
    `;
  } else if (mode === 'manage_primary') {
    badgeHtml = '<span class="m-popup-badge badge-primary">★ 当前状态：必听主选</span>';
    const allConflicts = getConflictsWithPlan(seq, 'all');
    if (allConflicts.length > 0) {
      const built = buildConflictTimelineAndList(target, 'primary', allConflicts);
      timelineHtml = built.timelineHtml;
      conflictsListHtml = built.conflictsListHtml;
    } else {
      hintHtml = '<div class="m-popup-hint-box ok">✓ 行程顺畅，此时段与其他已选日程无冲突</div>';
    }

    actionsHtml = `
      <div class="m-decision-actions">
        <button type="button" class="m-decision-btn btn-backup" onclick="resolveMatrixAction(${seq}, 'primary_to_backup')">
          📌 转为待选
        </button>
        <button type="button" class="m-decision-btn btn-danger" onclick="resolveMatrixAction(${seq}, 'remove')">
          🗑️ 移出计划
        </button>
        <button type="button" class="m-decision-btn btn-cancel" onclick="closeMatrixConflictPopup()">
          ✕ 保持主选
        </button>
      </div>
    `;
  } else {
    // Conflict mode (not in plan yet)
    badgeHtml = '<span class="m-popup-badge badge-conflict">⚡ 发现时间重叠冲突</span>';
    if (!conflicts || conflicts.length === 0) {
      conflicts = getConflictsWithPlan(seq, 'all');
    }
    const built = buildConflictTimelineAndList(target, 'target', conflicts);
    timelineHtml = built.timelineHtml;
    conflictsListHtml = built.conflictsListHtml;

    actionsHtml = `
      <div class="m-decision-actions">
        <button type="button" class="m-decision-btn btn-primary" onclick="resolveMatrixAction(${seq}, 'join_primary')">
          ⭐ 替换主选
        </button>
        <button type="button" class="m-decision-btn btn-backup" onclick="resolveMatrixAction(${seq}, 'join_backup')">
          📌 加入待选
        </button>
        <button type="button" class="m-decision-btn btn-cancel" onclick="closeMatrixConflictPopup()">
          ✕ 放弃
        </button>
      </div>
    `;
  }

  container.innerHTML = `
    <div class="m-popup-card">
      <div class="m-popup-header">
        <div class="m-popup-title-row">
          <span class="m-popup-code">${target.code}</span>
          <span class="m-popup-time">${target.time} (${target.durationMin}m)</span>
          <span class="m-popup-venue">📍 ${escapeHtml(target.venue)}</span>
        </div>
        <div class="m-popup-topic">${escapeHtml(target.topic)}</div>
        <div class="m-popup-status-row">
          ${badgeHtml}
        </div>
        ${hintHtml}
      </div>
      ${timelineHtml}
      ${conflictsListHtml}
      <div class="m-popup-actions">
        ${actionsHtml}
      </div>
    </div>
  `;

  backdrop.classList.add('open');
  syncBodyScrollLock();

  if (window.innerWidth > 640) {
    const pad = 16;
    let targetX = window.innerWidth / 2;
    let targetY = window.innerHeight / 2;

    if (event && event.clientX) {
      targetX = event.clientX;
      targetY = event.clientY + 8;
    }

    popup.style.left = '0px';
    popup.style.top = '0px';
    popup.style.visibility = 'hidden';

    requestAnimationFrame(() => {
      const popupRect = popup.getBoundingClientRect();
      let left = targetX - (popupRect.width / 2);
      let top = targetY;

      if (left < pad) left = pad;
      if (left + popupRect.width > window.innerWidth - pad) {
        left = window.innerWidth - popupRect.width - pad;
      }

      if (top + popupRect.height > window.innerHeight - pad) {
        if (targetY - popupRect.height - 18 > pad) {
          top = targetY - popupRect.height - 18;
        } else {
          top = Math.max(pad, window.innerHeight - popupRect.height - pad);
        }
      }

      popup.style.left = `${Math.round(left)}px`;
      popup.style.top = `${Math.round(top)}px`;
      popup.style.visibility = 'visible';
    });
  } else {
    popup.style.left = '';
    popup.style.top = '';
    popup.style.visibility = 'visible';
  }
}

const showMatrixConflictPopup = (e, seq, conflicts) => showMatrixSessionPopup(e, seq, 'conflict', conflicts);

function closeMatrixConflictPopup() {
  const backdrop = document.getElementById('matrixConflictPopupBackdrop');
  if (backdrop) backdrop.classList.remove('open');
  syncBodyScrollLock();
}

function resolveMatrixAction(targetSeq, action) {
  const s = SESSION_BY_SEQ[targetSeq];
  if (!s) return;

  const conflicts = getConflictsWithPlan(targetSeq, 'primary');

  if (action === 'backup_to_primary_direct') {
    state.plan[targetSeq].role = 'primary';
    savePlanToStorage();
    showToast(`⭐ 已将 ${s.code} 设为必听主选！`);
  } else if (action === 'backup_to_primary_resolve' || action === 'replace_primary' || action === 'join_primary') {
    conflicts.forEach(c => {
      if (state.plan[c.session.seq] && state.plan[c.session.seq].role === 'primary') {
        state.plan[c.session.seq].role = 'backup';
      }
    });
    state.plan[targetSeq] = {
      seq: targetSeq,
      role: 'primary',
      note: state.plan[targetSeq]?.note || '',
      addedAt: Date.now()
    };
    savePlanToStorage();
    const confCodes = conflicts.map(c => c.session.code).join('、');
    showToast(`⭐ 已将 ${s.code} 设为主选${confCodes ? `，冲突主选 ${confCodes} 已转为待选` : ''}！`);
  } else if (action === 'primary_to_backup') {
    state.plan[targetSeq].role = 'backup';
    savePlanToStorage();
    showToast(`📌 已将 ${s.code} 转为待选日程`);
  } else if (action === 'add_backup' || action === 'join_backup') {
    state.plan[targetSeq] = {
      seq: targetSeq,
      role: 'backup',
      note: state.plan[targetSeq]?.note || '',
      addedAt: Date.now()
    };
    savePlanToStorage();
    showToast(`📌 已将 ${s.code} 加入待选日程`);
  } else if (action === 'remove') {
    removeSessionFromPlan(targetSeq);
  }

  closeMatrixConflictPopup();
  refreshAllViews();
  if (document.getElementById('planDrawerBackdrop')?.classList.contains('open')) {
    renderPlanDrawerContent();
  }
}

const resolveMatrixConflict = resolveMatrixAction;

// ==================== VIEW 3: SPEAKERS DIRECTORY ====================
function renderSpeakersDirectory() {
  const container = document.getElementById('speakersDirectoryGrid');
  if (!container) return;

  const q = state.searchQuery.toLowerCase().trim();
  const qClean = q.replace(/\s+/g, '');

  const filteredSpeakers = SPEAKERS.filter(sp => {
    if (state.speakerFreqFilter === '3plus' && sp.count < 3) return false;
    if (state.speakerFreqFilter === '2' && sp.count !== 2) return false;
    if (state.speakerFreqFilter === '1' && sp.count !== 1) return false;

    if (q) {
      const spTitle = getSpeakerTitle(sp.name);
      const matchName = sp.name.toLowerCase().replace(/\s+/g, '').includes(qClean) ||
                        sp.aliases.some(a => a.toLowerCase().replace(/\s+/g, '').includes(qClean)) ||
                        (spTitle && spTitle.toLowerCase().replace(/\s+/g, '').includes(qClean));
      const matchTopic = sp.sessionSeqs.some(seq => SESSION_BY_SEQ[seq].topic.toLowerCase().includes(q));
      if (!matchName && !matchTopic) return false;
    }
    return true;
  });

  filteredSpeakers.sort(compareSpeakersByPinyin);

  document.getElementById('badgeSpeakersCount').textContent = filteredSpeakers.length;

  if (filteredSpeakers.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1; background:var(--bg-surface); padding:40px; text-align:center; border-radius:var(--radius-md);">
        未找到匹配「${escapeHtml(state.searchQuery)}」的主播或嘉宾
      </div>
    `;
    updateToggleAllSpeakersBtn();
    return;
  }

  // 是否处于搜索/筛选状态（输入了关键词或选定了具体主播）
  const isFiltering = !!(q || state.selectedSpeaker);
  // 是否仅筛选出唯一一位主播
  const isSingleResult = filteredSpeakers.length === 1;

  container.innerHTML = filteredSpeakers.map(sp => {
    const spSessions = sp.sessionSeqs.map(seq => SESSION_BY_SEQ[seq]).filter(Boolean);
    const primarySessions = spSessions.filter(s => state.plan[s.seq]?.role === 'primary');
    const backupSessions = spSessions.filter(s => state.plan[s.seq]?.role === 'backup');
    const plannedCount = primarySessions.length + backupSessions.length;
    const allPlanned = plannedCount === spSessions.length && spSessions.length > 0;
    const spTitle = getSpeakerTitle(sp.name);

    // 核心规则：筛选时（输入搜索词或选定主播）或仅有1个结果时默认自动展开；平时全量浏览按用户折叠状态
    const isExpanded = isFiltering || isSingleResult || !!(state.expandedSpeakers && state.expandedSpeakers.has(sp.name));
    const pinyinInitial = getSpeakerPinyinInitial(sp.name);

    // 检测主播自身场次是否有串场时间冲突
    const selfOverlaps = [];
    for (let i = 0; i < spSessions.length; i++) {
      for (let j = i + 1; j < spSessions.length; j++) {
        if (getOverlapMinutes(spSessions[i], spSessions[j]) > 0) {
          selfOverlaps.push(`${spSessions[i].code} 与 ${spSessions[j].code}`);
        }
      }
    }

    // 主选 / 备选状态与颜色标注
    let planCardClass = '';
    let planBadgeHtml = '';
    if (primarySessions.length > 0 && backupSessions.length > 0) {
      planCardClass = 'has-planned-both';
      planBadgeHtml = `
        <span class="sp-plan-status-pill pill-primary" title="已主选 ${primarySessions.length} 场">⭐ 主选 ${primarySessions.length}</span>
        <span class="sp-plan-status-pill pill-backup" title="已备选 ${backupSessions.length} 场">📌 备选 ${backupSessions.length}</span>
      `;
    } else if (primarySessions.length > 0) {
      planCardClass = 'has-planned-primary';
      planBadgeHtml = `
        <span class="sp-plan-status-pill pill-primary" title="已主选 ${primarySessions.length} 场">⭐ 已主选${primarySessions.length > 1 ? ` (${primarySessions.length})` : ''}</span>
      `;
    } else if (backupSessions.length > 0) {
      planCardClass = 'has-planned-backup';
      planBadgeHtml = `
        <span class="sp-plan-status-pill pill-backup" title="已备选 ${backupSessions.length} 场">📌 已备选${backupSessions.length > 1 ? ` (${backupSessions.length})` : ''}</span>
      `;
    }

    const singleResultCardClass = isSingleResult ? 'single-result-card' : '';

    return `
      <div class="speaker-dir-card ${isExpanded ? '' : 'collapsed'} ${planCardClass} ${singleResultCardClass}" data-speaker="${escapeAttr(sp.name)}">
        <div
          class="speaker-dir-top"
          onclick="toggleSpeakerCollapse('${escapeAttr(sp.name)}', event)"
          onkeydown="if(event.key==='Enter'||event.key===' '){toggleSpeakerCollapse('${escapeAttr(sp.name)}', event);event.preventDefault();}"
          role="button"
          tabindex="0"
          aria-expanded="${isExpanded ? 'true' : 'false'}"
          title="点击${isExpanded ? '收起' : '展开'}场次列表"
        >
          <div class="speaker-header-info">
            <div class="speaker-name-row">
              <span class="speaker-pinyin-badge" title="拼音首字母 ${pinyinInitial}">${pinyinInitial}</span>
              <span class="speaker-name-text">${escapeHtml(sp.name)}</span>
              ${planBadgeHtml}
            </div>
            ${spTitle ? `<div class="speaker-title-text" title="${escapeAttr(spTitle)}">🏷️ ${escapeHtml(spTitle)}</div>` : ''}
            <div class="speaker-tags-text">${sp.tags.join(' · ')}</div>
            ${selfOverlaps.length > 0 ? `<div style="font-size:11.5px; color:#DC2626; font-weight:700; margin-top:3px;">⚠️ 串场提醒：该嘉宾自身场次重叠（${selfOverlaps.join('、')}）</div>` : ''}
          </div>
          <div class="speaker-session-count ${sp.count >= 2 ? 'multi' : ''} ${isExpanded ? 'expanded' : ''}">
            <span>${sp.count} 场对话</span>
            <span class="speaker-toggle-icon">▼</span>
          </div>
        </div>

        <div class="speaker-dir-collapse-body" style="${isExpanded ? 'display: flex;' : 'display: none;'}">
          <div class="speaker-sessions-list speaker-sessions-grid">
            ${spSessions.map(s => {
              const pItem = state.plan[s.seq];
              const conflicts = getConflictsWithPlan(s.seq, 'primary');
              const coSpeakers = s.speakers.filter(name => name !== sp.name);
              const coSpeakersHtml = coSpeakers.length > 0
                ? coSpeakers.map(coSp => {
                    const spInfo = SPEAKER_BY_NAME[coSp];
                    const coTitle = getSpeakerTitle(coSp);
                    const countBadge = spInfo && spInfo.count > 1 ? `<span style="opacity:0.65; font-size:10px;">(${spInfo.count})</span>` : '';
                    return `<button class="co-speaker-chip" onclick="selectSpeakerSpotlight('${escapeAttr(coSp)}')" title="点击查看 ${escapeAttr(coSp)}${coTitle ? `（${escapeAttr(coTitle)}）` : ''} 的场次">🎙️ ${escapeHtml(coSp)}${coTitle ? `<span class="co-chip-title">· ${escapeHtml(coTitle)}</span>` : ''}${countBadge}</button>`;
                  }).join('')
                : `<span class="co-speaker-empty">${s.hasOpenSlots ? `暂无其他同场主播（🪑 可增补×${Math.max(1, 4 - s.speakers.length)}）` : '单人专场'}</span>`;

              let itemPlanClass = '';
              let statusLabel = '🟢 时间无冲突';
              let statusColor = 'var(--text-secondary)';
              if (pItem) {
                if (pItem.role === 'primary') {
                  itemPlanClass = 'planned-primary';
                  statusLabel = '✅ 已在主选计划';
                  statusColor = '#15803D';
                } else {
                  itemPlanClass = 'planned-backup';
                  statusLabel = '📌 已在备选计划';
                  statusColor = '#92400E';
                }
              } else if (conflicts.length > 0) {
                statusLabel = `⚡ 与已选【${conflicts[0].session.code}】冲突`;
                statusColor = '#DC2626';
              }

              return `
                <div class="spotlight-session-item ${itemPlanClass}">
                  <div class="spotlight-item-header">
                    <span class="spotlight-session-code-time">${s.code} ${s.time}</span>
                    <span class="venue-badge ${getFloorClass(s.floor)}">${escapeHtml(s.venueShort)}</span>
                  </div>
                  <div class="spotlight-session-topic" title="${escapeAttr(s.topic)}">${escapeHtml(s.topic)}</div>
                  <div class="spotlight-co-speakers">
                    <span class="co-speaker-label">🤝 同场主播：</span>
                    ${coSpeakersHtml}
                    ${coSpeakers.length > 0 && s.hasOpenSlots ? `<span class="open-slot-tag" style="font-size:10px; padding:1px 6px;">🪑 可增补×${Math.max(1, 4 - s.speakers.length)}</span>` : ''}
                  </div>
                  <div class="spotlight-session-bottom">
                    <span class="spotlight-session-status" style="color: ${statusColor}; font-weight: 600;">
                      ${statusLabel}
                    </span>
                    <button
                      class="btn ${pItem ? (pItem.role === 'primary' ? 'btn-primary' : 'btn-secondary') : 'btn-secondary'} btn-sm"
                      style="padding: 3px 9px; font-size: 11.5px; border-radius: 6px; white-space: nowrap;"
                      onclick="handleSessionAction(${s.seq})"
                    >
                      ${pItem ? (pItem.role === 'primary' ? '✓ 主选 (管理)' : '📌 备选 (管理)') : '+ 规划'}
                    </button>
                  </div>
                </div>
              `;
            }).join('')}
          </div>

          <div class="speaker-dir-actions">
            <button
              class="btn ${allPlanned ? 'btn-secondary' : 'btn-primary'} btn-sm"
              onclick="planAllForSpeaker('${escapeAttr(sp.name)}')"
              style="width: 100%; justify-content: center;"
            >
              ${allPlanned ? '✓ 已全部加入计划' : `✨ 一键规划全部 (${sp.count}场)`}
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  updateToggleAllSpeakersBtn();
}

function toggleSpeakerCollapse(speakerName, e) {
  if (e && e.stopPropagation) {
    e.stopPropagation();
  }
  if (!state.expandedSpeakers) {
    state.expandedSpeakers = new Set();
  }
  const isNowExpanded = !state.expandedSpeakers.has(speakerName);
  if (isNowExpanded) {
    state.expandedSpeakers.add(speakerName);
  } else {
    state.expandedSpeakers.delete(speakerName);
  }

  // 就地局部更新 DOM，体验极致丝滑且无整表重排与页面跳动
  const card = document.querySelector(`.speaker-dir-card[data-speaker="${CSS.escape(speakerName)}"]`);
  if (card) {
    const body = card.querySelector('.speaker-dir-collapse-body');
    const badge = card.querySelector('.speaker-session-count');
    const topBar = card.querySelector('.speaker-dir-top');
    if (isNowExpanded) {
      card.classList.remove('collapsed');
      if (body) body.style.display = 'flex';
      if (badge) badge.classList.add('expanded');
      if (topBar) {
        topBar.setAttribute('aria-expanded', 'true');
        topBar.setAttribute('title', '点击收起场次列表');
      }
    } else {
      card.classList.add('collapsed');
      if (body) body.style.display = 'none';
      if (badge) badge.classList.remove('expanded');
      if (topBar) {
        topBar.setAttribute('aria-expanded', 'false');
        topBar.setAttribute('title', '点击展开场次列表');
      }
    }
  } else {
    renderSpeakersDirectory();
  }
  updateToggleAllSpeakersBtn();
}

function toggleAllSpeakersExpand() {
  if (!state.expandedSpeakers) {
    state.expandedSpeakers = new Set();
  }
  const visibleCards = Array.from(document.querySelectorAll('.speaker-dir-card[data-speaker]'));
  if (visibleCards.length === 0) return;
  const allExpanded = visibleCards.every(card => state.expandedSpeakers.has(card.dataset.speaker));

  if (allExpanded) {
    state.expandedSpeakers.clear();
  } else {
    visibleCards.forEach(card => {
      if (card.dataset.speaker) state.expandedSpeakers.add(card.dataset.speaker);
    });
  }
  renderSpeakersDirectory();
}

function updateToggleAllSpeakersBtn() {
  const btn = document.getElementById('btnToggleAllSpeakers');
  if (!btn) return;
  const visibleCards = Array.from(document.querySelectorAll('.speaker-dir-card[data-speaker]'));
  if (visibleCards.length === 0) {
    btn.style.display = 'none';
    return;
  }
  btn.style.display = 'inline-block';
  const allExpanded = visibleCards.length > 0 && visibleCards.every(card => state.expandedSpeakers?.has(card.dataset.speaker));
  btn.textContent = allExpanded ? '收起全部场次 ▴' : '展开全部场次 ▾';
}

// ==================== PLANNING & CONFLICT RESOLUTION ACTIONS ====================
function handleSessionAction(seq, event) {
  const existing = state.plan[seq];
  if (existing) {
    showMatrixSessionPopup(event, seq, existing.role === 'backup' ? 'manage_backup' : 'manage_primary');
    return;
  }

  const conflicts = getConflictsWithPlan(seq, 'all');
  if (conflicts.length === 0) {
    addSessionToPlan(seq, 'primary');
  } else {
    showMatrixSessionPopup(event, seq, 'conflict', conflicts);
  }
}

function addSessionToPlan(seq, role = 'primary', silent = false) {
  const s = SESSION_BY_SEQ[seq];
  if (!s) return;
  state.plan[seq] = {
    seq,
    role,
    note: state.plan[seq]?.note || '',
    addedAt: Date.now()
  };
  savePlanToStorage();
  if (!silent) {
    showToast(`${role === 'primary' ? '✅ 已加入必听主选' : '📌 已加入待选日程'}：${s.code} ${s.topic.slice(0, 18)}...`);
  }
  refreshAllViews();
  if (document.getElementById('planDrawerBackdrop').classList.contains('open')) {
    renderPlanDrawerContent();
  }
}

function removeSessionFromPlan(seq, silent = false) {
  const s = SESSION_BY_SEQ[seq];
  if (!state.plan[seq]) return;
  delete state.plan[seq];
  savePlanToStorage();
  if (!silent && s) {
    showToast(`🗑️ 已从收听计划移除：${s.code}`);
  }
  refreshAllViews();
  if (document.getElementById('planDrawerBackdrop').classList.contains('open')) {
    renderPlanDrawerContent();
  }
}

function setSessionRole(seq, role) {
  if (!state.plan[seq]) return;
  state.plan[seq].role = role;
  savePlanToStorage();
  showToast(`已将 ${SESSION_BY_SEQ[seq].code} 设为${role === 'primary' ? '「必听主选」' : '「待选日程」'}`);
  refreshAllViews();
  renderPlanDrawerContent();
}

function promoteBackupToPrimary(seq) {
  const conflicts = getConflictsWithPlan(seq, 'primary');
  if (conflicts.length > 0) {
    openConflictModal(seq, conflicts);
  } else {
    setSessionRole(seq, 'primary');
  }
}

function updateSessionNote(seq, noteText) {
  if (!state.plan[seq]) return;
  state.plan[seq].note = noteText;
  savePlanToStorage();
}

// Conflict Resolution Modal (Side-by-Side Left/Right Comparison with Card Checkboxes)
function openConflictModal(targetSeq, conflicts) {
  state.pendingConflictSeq = targetSeq;
  state.pendingConflicts = conflicts;

  // Default selections:
  // First conflict session on left: 'primary'
  // Target session on right: 'backup'
  // Any extra conflict sessions on left: 'backup'
  state.conflictSelections = {};
  conflicts.forEach((c, idx) => {
    state.conflictSelections[c.session.seq] = idx === 0 ? 'primary' : 'backup';
  });
  state.conflictSelections[targetSeq] = 'backup';

  renderConflictModalContent();
  document.getElementById('conflictModalBackdrop').classList.add('open');
  syncBodyScrollLock();
}

function closeConflictModal() {
  state.pendingConflictSeq = null;
  state.pendingConflicts = [];
  state.conflictSelections = {};
  document.getElementById('conflictModalBackdrop').classList.remove('open');
  syncBodyScrollLock();
}

function setConflictRole(seq, role) {
  if (!state.conflictSelections) state.conflictSelections = {};

  if (role === 'primary') {
    // 规则：主选只能有一个。其他卡片原本为主选的自动解除，转为备选
    Object.keys(state.conflictSelections).forEach(k => {
      const kNum = Number(k);
      if (kNum !== seq && state.conflictSelections[kNum] === 'primary') {
        state.conflictSelections[kNum] = 'backup';
      }
    });
  }

  state.conflictSelections[seq] = role;
  renderConflictModalContent();
}

function renderConflictModalContent() {
  const targetSeq = state.pendingConflictSeq;
  const conflicts = state.pendingConflicts || [];
  const modalBody = document.getElementById('conflictModalBody');
  if (!targetSeq || !modalBody) return;

  const target = SESSION_BY_SEQ[targetSeq];
  if (!target) return;

  const totalOverlapMin = conflicts.reduce((acc, c) => acc + c.overlapMin, 0);
  const overlapWindowsText = conflicts.map(c => c.overlapWindow).join('、');

  const allSeqs = [...conflicts.map(c => c.session.seq), targetSeq];
  const tRole = state.conflictSelections[target.seq] || 'none';

  // Build Left Cards
  const leftCardsHtml = conflicts.map(c => {
    const s = c.session;
    const cRole = state.conflictSelections[s.seq] || 'none';
    return `
      <div class="conflict-side-card card-role-${cRole}">
        <div class="conflict-side-header header-role-${cRole}">
          <span class="side-badge badge-role-${cRole}">
            ${cRole === 'primary' ? '⭐ 必听主选' : (cRole === 'backup' ? '📌 备选赶场' : '⚪ 未选 / 移出计划')}
          </span>
          <span class="side-sub">原已选场次</span>
        </div>
        <div class="conflict-side-body">
          <div class="conflict-sess-detail">
            <div class="conflict-sess-meta-top">
              <span class="conflict-code-time">${s.code} ${s.time}</span>
              <span class="venue-badge ${getFloorClass(s.floor)}">${escapeHtml(s.venue)}</span>
            </div>
            <div class="conflict-overlap-pill">
              ⚡ 与新场次重叠 ${c.overlapMin} 分钟（${c.overlapWindow}）
            </div>
            <div class="conflict-sess-topic">${escapeHtml(s.topic)}</div>
            <div class="conflict-sess-speakers">
              <span>🎙️ 嘉宾：</span>${escapeHtml(s.speakers.map(sp => formatSpeakerWithTitle(sp)).join('、') || '虚位以待')}
            </div>
          </div>

          <div class="conflict-card-selector-wrap">
            <div class="conflict-role-title">勾选本场规划角色：</div>
            <div class="conflict-role-btn-group">
              <button
                type="button"
                class="conflict-role-pill role-pill-primary ${cRole === 'primary' ? 'active' : ''}"
                onclick="setConflictRole(${s.seq}, 'primary')"
              >
                <span class="pill-check">${cRole === 'primary' ? '✓' : ''}</span>
                <span>⭐ 设为主选</span>
              </button>
              <button
                type="button"
                class="conflict-role-pill role-pill-backup ${cRole === 'backup' ? 'active' : ''}"
                onclick="setConflictRole(${s.seq}, 'backup')"
              >
                <span class="pill-check">${cRole === 'backup' ? '✓' : ''}</span>
                <span>📌 设为备选</span>
              </button>
              <button
                type="button"
                class="conflict-role-pill role-pill-none ${cRole === 'none' ? 'active' : ''}"
                onclick="setConflictRole(${s.seq}, 'none')"
              >
                <span class="pill-check">${cRole === 'none' ? '✓' : ''}</span>
                <span>✕ 都不选</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');

  // Build Right Card
  const rightCardHtml = `
    <div class="conflict-side-card card-role-${tRole}">
      <div class="conflict-side-header header-role-${tRole}">
        <span class="side-badge badge-role-${tRole}">
          ${tRole === 'primary' ? '⭐ 必听主选' : (tRole === 'backup' ? '📌 备选赶场' : '⚪ 未选 / 移出计划')}
        </span>
        <span class="side-sub">待规划新场次</span>
      </div>
      <div class="conflict-side-body">
        <div class="conflict-sess-detail">
          <div class="conflict-sess-meta-top">
            <span class="conflict-code-time">${target.code} ${target.time}</span>
            <span class="venue-badge ${getFloorClass(target.floor)}">${escapeHtml(target.venue)}</span>
          </div>
          <div class="conflict-new-pill">
            🕒 全长 ${target.durationMin} 分钟 · ${escapeHtml(target.tags.join(' / '))}
          </div>
          <div class="conflict-sess-topic">${escapeHtml(target.topic)}</div>
          <div class="conflict-sess-speakers">
            <span>🎙️ 嘉宾：</span>${escapeHtml(target.speakers.map(sp => formatSpeakerWithTitle(sp)).join('、') || '虚位以待')}
          </div>
        </div>

        <div class="conflict-card-selector-wrap">
          <div class="conflict-role-title">勾选本场规划角色：</div>
          <div class="conflict-role-btn-group">
            <button
              type="button"
              class="conflict-role-pill role-pill-primary ${tRole === 'primary' ? 'active' : ''}"
              onclick="setConflictRole(${target.seq}, 'primary')"
            >
              <span class="pill-check">${tRole === 'primary' ? '✓' : ''}</span>
              <span>⭐ 设为主选</span>
            </button>
            <button
              type="button"
              class="conflict-role-pill role-pill-backup ${tRole === 'backup' ? 'active' : ''}"
              onclick="setConflictRole(${target.seq}, 'backup')"
            >
              <span class="pill-check">${tRole === 'backup' ? '✓' : ''}</span>
              <span>📌 设为备选</span>
            </button>
            <button
              type="button"
              class="conflict-role-pill role-pill-none ${tRole === 'none' ? 'active' : ''}"
              onclick="setConflictRole(${target.seq}, 'none')"
            >
              <span class="pill-check">${tRole === 'none' ? '✓' : ''}</span>
              <span>✕ 都不选</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  `;

  // Summary preview text
  const summaryParts = [];
  allSeqs.forEach(seq => {
    const s = SESSION_BY_SEQ[seq];
    const r = state.conflictSelections[seq] || 'none';
    if (s) {
      if (r === 'primary') summaryParts.push(`<strong>${s.code}</strong> 设为「⭐必听主选」`);
      else if (r === 'backup') summaryParts.push(`<strong>${s.code}</strong> 设为「📌备选赶场」`);
      else summaryParts.push(`<strong>${s.code}</strong>「不选/移出计划」`);
    }
  });

  modalBody.innerHTML = `
    <div class="conflict-intro-bar">
      <span>发现时间冲突！可在左右两张场次卡片上<strong>直接勾选「主选」或「备选」</strong>（也可以两者都不选）。<br/>
      <span style="color:#C2410C; font-weight:700;">⚠️ 规则提示：同一时段「主选」只能保留一个（勾选一场为主选时，另一场将自动转为备选）。</span></span>
    </div>

    <div class="conflict-compare-grid">
      <!-- Left Column: Existing Planned Session(s) -->
      <div class="conflict-left-col">
        ${leftCardsHtml}
      </div>

      <!-- Center VS Divider -->
      <div class="conflict-vs-col">
        <div class="vs-line"></div>
        <div class="vs-circle">VS</div>
        <div class="vs-overlap-tag">${overlapWindowsText}</div>
        <div class="vs-line"></div>
      </div>

      <!-- Right Column: New Target Session -->
      <div class="conflict-right-col">
        ${rightCardHtml}
      </div>
    </div>

    <div class="conflict-resolution-footer">
      <div class="conflict-summary-preview">
        <div class="preview-title">📋 当前规划设定：</div>
        <div class="preview-text">${summaryParts.join(' ； ')}</div>
      </div>
      <div class="conflict-footer-actions">
        <button type="button" class="btn btn-secondary" onclick="closeConflictModal()">取消</button>
        <button type="button" class="btn btn-primary" onclick="confirmConflictResolution()">✓ 确认应用此规划</button>
      </div>
    </div>
  `;
}

function confirmConflictResolution() {
  const targetSeq = state.pendingConflictSeq;
  const conflicts = state.pendingConflicts || [];
  if (!targetSeq) return;

  const allSeqs = [...conflicts.map(c => c.session.seq), targetSeq];
  let primaryCodes = [];
  let backupCodes = [];
  let removedCodes = [];

  allSeqs.forEach(seq => {
    const role = state.conflictSelections[seq] || 'none';
    const s = SESSION_BY_SEQ[seq];
    if (role === 'primary') {
      state.plan[seq] = {
        seq,
        role: 'primary',
        note: state.plan[seq]?.note || '',
        addedAt: Date.now()
      };
      if (s) primaryCodes.push(s.code);
    } else if (role === 'backup') {
      state.plan[seq] = {
        seq,
        role: 'backup',
        note: state.plan[seq]?.note || '',
        addedAt: Date.now()
      };
      if (s) backupCodes.push(s.code);
    } else {
      delete state.plan[seq];
      if (s) removedCodes.push(s.code);
    }
  });

  savePlanToStorage();
  closeConflictModal();
  refreshAllViews();
  if (document.getElementById('planDrawerBackdrop')?.classList.contains('open')) {
    renderPlanDrawerContent();
  }

  const parts = [];
  if (primaryCodes.length > 0) parts.push(`主选 ${primaryCodes.join('、')}`);
  if (backupCodes.length > 0) parts.push(`备选 ${backupCodes.join('、')}`);
  if (removedCodes.length > 0) parts.push(`不选 ${removedCodes.join('、')}`);
  showToast(`⚡ 冲突规划已更新：${parts.join(' · ') || '已保存'}`);
}

/**
 * One-click plan all sessions of a speaker!
 */
function planAllForSpeaker(speakerName) {
  const sp = SPEAKER_BY_NAME[speakerName];
  if (!sp) return;
  const spSessions = sp.sessionSeqs.map(seq => SESSION_BY_SEQ[seq]).filter(Boolean);

  let addedPrimary = 0;
  let addedBackup = 0;

  spSessions.forEach(s => {
    if (state.plan[s.seq]) return; // already in plan
    const conflicts = getConflictsWithPlan(s.seq, 'primary');
    if (conflicts.length === 0) {
      state.plan[s.seq] = {
        seq: s.seq,
        role: 'primary',
        note: `追更主播：${speakerName}`,
        addedAt: Date.now()
      };
      addedPrimary++;
    } else {
      state.plan[s.seq] = {
        seq: s.seq,
        role: 'backup',
        note: `追更主播：${speakerName}（与${conflicts[0].session.code}时段重叠，设为备选/赶场）`,
        addedAt: Date.now()
      };
      addedBackup++;
    }
  });

  savePlanToStorage();
  refreshAllViews();

  if (addedPrimary === 0 && addedBackup === 0) {
    showToast(`🎙️ 「${speakerName}」的全部 ${spSessions.length} 场节目已在你的计划表中！`);
  } else if (addedBackup > 0) {
    showToast(`🎙️ 已规划「${speakerName}」：${addedPrimary} 场设为主选，${addedBackup} 场因时间重叠自动设为备选！`);
  } else {
    showToast(`🎙️ 已将「${speakerName}」全部 ${addedPrimary} 场节目无冲突加入必听主选！`);
  }
}

// ==================== PRESET ROUTES ====================
const PRESET_ROUTES = {
  ai: {
    name: '🤖 AI与科技狂飙线',
    seqs: [6, 18, 31, 45, 62, 74, 84] // 【06】09:00-10:30, 【08】10:50-12:20, 【16】12:40-14:10, 【20】14:30-16:30, 【50】17:00-18:00, 【60】18:20-19:20, 【39】19:50-20:50
  },
  biz: {
    name: '💼 商业投资与搞钱线',
    seqs: [1, 16, 23, 38, 50, 66, 77, 86] // 【01】08:50-09:50, 【72】10:20-11:20, 【13】11:30-12:30, 【74】13:00-14:00, 【25】14:30-16:00, 【86】17:00-18:00, 【87】18:20-19:20, 【41】19:50-20:50
  },
  women: {
    name: '🌷 女性成长与关系线',
    seqs: [2, 20, 33, 41, 52, 63, 72, 88] // 【02】09:00-10:30, 【10】10:50-12:20, 【18】12:40-14:10, 【57】14:20-15:20, 【58】15:40-16:40, 【59】17:00-18:00, 【37】18:10-19:40, 【43】19:50-20:50
  },
  mind: {
    name: '🧠 身心能量与自救线',
    seqs: [5, 22, 30, 49, 60, 67, 81] // 【05】09:00-10:30, 【12】10:50-12:20, 【15】12:40-14:10, 【24】14:30-16:00, 【30】16:20-17:50, 【32】18:10-19:40, 【79】19:40-20:40
  },
  culture: {
    name: '🎬 城市文化与罪案线',
    seqs: [8, 14, 28, 29, 46, 56, 70, 87] // 【53】09:00-10:00, 【54】10:20-11:20, 【82】11:40-12:40, 【14】12:40-14:10, 【21】14:30-16:00, 【26】16:20-17:50, 【35】18:10-19:40, 【42】19:50-20:50
  }
};

async function applyPresetRoute(routeKey) {
  const route = PRESET_ROUTES[routeKey];
  if (!route) return;

  const existingCount = Object.keys(state.plan).length;
  if (existingCount > 0) {
    const ok = await customConfirm(`是否应用「${route.name}」（共 ${route.seqs.length} 场全天无冲突行程）？\n应用后将替换当前已选的 ${existingCount} 场次。`, {
      title: '灵感路线切换确认',
      icon: '✨',
      confirmText: '确认应用',
      cancelText: '暂不应用'
    });
    if (!ok) return;
  }

  state.plan = {};
  route.seqs.forEach(seq => {
    state.plan[seq] = {
      seq,
      role: 'primary',
      note: `${route.name}推荐`,
      addedAt: Date.now()
    };
  });
  savePlanToStorage();
  refreshAllViews();
  showToast(`✨ 已为你一键规划「${route.name}」全天 ${route.seqs.length} 场无冲突行程！`);
}

// ==================== PLAN INDICATORS & DRAWER ====================
function updatePlanIndicators() {
  const items = Object.values(state.plan);
  const primaryItems = items.filter(i => i.role === 'primary');
  const backupItems = items.filter(i => i.role === 'backup');
  const totalMinutes = primaryItems.reduce((acc, i) => acc + (SESSION_BY_SEQ[i.seq]?.durationMin || 0), 0);
  const hoursStr = totalMinutes >= 60
    ? `${(totalMinutes / 60).toFixed(1)} 小时 (${totalMinutes}m)`
    : `${totalMinutes} 分钟`;

  const elHeroCount = document.getElementById('heroPlannedCount');
  if (elHeroCount) elHeroCount.textContent = items.length;
  const elTopCount = document.getElementById('topPlanCount');
  if (elTopCount) elTopCount.textContent = items.length;

  const elFloatCount = document.getElementById('floatStatCount');
  if (elFloatCount) elFloatCount.textContent = `主选 ${primaryItems.length} 场 · 备选 ${backupItems.length} 场`;
  const elFloatHours = document.getElementById('floatStatHours');
  if (elFloatHours) elFloatHours.textContent = `主选累计 ${hoursStr}`;

  // Control clear buttons on main page
  const btnMainClear = document.getElementById('btnMainClearPlan');
  if (btnMainClear) {
    btnMainClear.style.display = items.length > 0 ? 'inline-flex' : 'none';
  }
  const btnFloatClear = document.getElementById('btnFloatClearPlan');
  if (btnFloatClear) {
    btnFloatClear.style.display = items.length > 0 ? 'inline-flex' : 'none';
  }

  const activeConflicts = getActivePrimaryConflicts();
  const statusEl = document.getElementById('floatConflictStatus');
  if (statusEl) {
    if (activeConflicts.length > 0) {
      statusEl.className = 'floating-conflict-pill';
      statusEl.textContent = `⚡ 存在 ${activeConflicts.length} 处主选冲突`;
    } else if (items.length === 0) {
      statusEl.className = 'floating-ok-pill';
      statusEl.textContent = '💡 尚未添加场次';
    } else {
      statusEl.className = 'floating-ok-pill';
      statusEl.textContent = '✓ 主选行程无时间冲突';
    }
  }

  // Update Mobile Sticky Bottom Plan Bar
  const elMobileStats = document.getElementById('mobileBottomPlanStats');
  const elMobileBadge = document.getElementById('mobileBottomPlanBadge');
  if (elMobileStats) {
    if (items.length === 0) {
      elMobileStats.textContent = '0 场已选 · 点击查看';
    } else if (activeConflicts.length > 0) {
      elMobileStats.innerHTML = `<span style="color:#F87171; font-weight:700;">⚡ ${activeConflicts.length}处冲突</span> · 主${primaryItems.length} 备${backupItems.length}`;
    } else {
      elMobileStats.textContent = `主选 ${primaryItems.length} · 备选 ${backupItems.length}`;
    }
  }
  if (elMobileBadge) {
    elMobileBadge.textContent = items.length;
    elMobileBadge.style.display = items.length > 0 ? 'inline-flex' : 'none';
  }
}

function handleMobileExportClick() {
  const count = Object.keys(state.plan).length;
  if (count === 0) {
    showToast('💡 你的个人计划表还是空的，请先挑选感兴趣的场次！');
    openPlanDrawer();
    return;
  }
  openExportStudio();
}

function switchMobileExportTab(tabName) {
  const grid = document.getElementById('exportStudioGrid');
  const tabPrev = document.getElementById('tabMobilePreview');
  const tabSet = document.getElementById('tabMobileSettings');

  if (tabName === 'settings') {
    grid?.classList.remove('mobile-show-preview');
    grid?.classList.add('mobile-show-settings');
    tabPrev?.classList.remove('active');
    tabSet?.classList.add('active');
  } else {
    grid?.classList.remove('mobile-show-settings');
    grid?.classList.add('mobile-show-preview');
    tabSet?.classList.remove('active');
    tabPrev?.classList.add('active');
    renderSchedulePosterCanvas();
  }
}

function openPlanDrawer() {
  renderPlanDrawerContent();
  document.getElementById('planDrawerBackdrop').classList.add('open');
  syncBodyScrollLock();
}

function closePlanDrawer() {
  document.getElementById('planDrawerBackdrop').classList.remove('open');
  syncBodyScrollLock();
}

async function clearAllPlan() {
  const count = Object.keys(state.plan).length;
  if (count === 0) return;
  const ok = await customConfirm(`确定要清空个人收听计划表中的全部 ${count} 场节目吗？\n清空后需重新挑选。`, {
    title: '清空计划确认',
    icon: '🗑️',
    danger: true,
    confirmText: '确认清空',
    cancelText: '取消'
  });
  if (!ok) return;
  state.plan = {};
  savePlanToStorage();
  refreshAllViews();
  renderPlanDrawerContent();
  showToast('🗑️ 已清空个人收听计划表');
}

function autoResolvePlanConflicts() {
  const conflicts = getActivePrimaryConflicts();
  if (conflicts.length === 0) return;
  let demoted = 0;
  conflicts.forEach(pair => {
    // Demote the later-added or second session to backup
    if (state.plan[pair.b.seq] && state.plan[pair.b.seq].role === 'primary') {
      state.plan[pair.b.seq].role = 'backup';
      demoted++;
    }
  });
  savePlanToStorage();
  refreshAllViews();
  renderPlanDrawerContent();
  showToast(`🛠️ 已自动将 ${demoted} 场重叠场次转为「备选/赶场」，主选时间轴已无冲突！`);
}

function renderPlanDrawerContent() {
  const container = document.getElementById('drawerTimelineContainer');
  const alertBox = document.getElementById('drawerAlertBox');
  const btnAutoResolve = document.getElementById('btnAutoResolve');
  const topClearBtn = document.querySelector('.btn-drawer-clear-top');

  const items = Object.values(state.plan)
    .map(item => ({ ...item, session: SESSION_BY_SEQ[item.seq] }))
    .filter(item => !!item.session)
    .sort((a, b) => a.session.startMin - b.session.startMin || (a.role === 'primary' ? -1 : 1));

  if (topClearBtn) {
    topClearBtn.style.display = items.length > 0 ? 'inline-flex' : 'none';
  }

  const activeConflicts = getActivePrimaryConflicts();
  btnAutoResolve.style.display = activeConflicts.length > 0 ? 'inline-flex' : 'none';

  if (items.length === 0) {
    alertBox.innerHTML = '';
    container.innerHTML = `
      <div style="text-align:center; padding:48px 20px; background:var(--bg-surface); border-radius:var(--radius-md); border:1px dashed var(--border-strong);">
        <div style="font-size:36px; margin-bottom:10px;">🎧</div>
        <h4 style="font-size:16px; font-weight:700; margin-bottom:6px;">你的个人收听计划表还是空的</h4>
        <p style="font-size:13px; color:var(--text-secondary); margin-bottom:16px;">
          可以在 11 厅全景时刻表中挑选感兴趣的场次、或搜索喜欢的主播与话题一键加入计划！
        </p>
        <div style="display:flex; justify-content:center; gap:8px; flex-wrap:wrap;">
          <button class="btn btn-primary btn-sm" onclick="closePlanDrawer();">去浏览 88 场节目</button>
        </div>
      </div>
    `;
    return;
  }

  // Summary box
  const primaryCount = items.filter(i => i.role === 'primary').length;
  const backupCount = items.filter(i => i.role === 'backup').length;
  const uniqueSpeakers = new Set();
  items.forEach(i => i.session.speakers.forEach(sp => uniqueSpeakers.add(sp)));

  alertBox.innerHTML = `
    <div style="background:var(--bg-surface); border:1px solid var(--border-subtle); border-radius:var(--radius-md); padding:12px 14px; display:flex; flex-direction:column; gap:8px;">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; font-size:13px;">
        <span>已规划：<strong>${primaryCount}</strong> 场主选 · <strong>${backupCount}</strong> 场备选</span>
        <span>覆盖主播/嘉宾：<strong>${uniqueSpeakers.size}</strong> 位</span>
      </div>
      ${activeConflicts.length > 0 ? `
        <div style="background:var(--conflict-bg); border:1px solid var(--conflict-border); color:var(--conflict-red); padding:8px 10px; border-radius:6px; font-size:12px; font-weight:600;">
          ⚡ 当前有 ${activeConflicts.length} 组「必听主选」场次时间重叠！建议点击下方「一键将冲突场次转为备选」或手动调整。
        </div>
      ` : `
        <div style="background:var(--success-bg); border:1px solid var(--success-border); color:var(--success-green); padding:7px 10px; border-radius:6px; font-size:12px; font-weight:600;">
          ✓ 所有「必听主选」场次时间衔接顺畅，无时间重叠冲突！
        </div>
      `}
    </div>
  `;

  // Build timeline with connectors between consecutive items
  let html = '';
  for (let idx = 0; idx < items.length; idx++) {
    const curr = items[idx];
    const s = curr.session;

    if (idx > 0) {
      const prev = items[idx - 1].session;
      const overlap = getOverlapMinutes(prev, s);
      if (overlap > 0) {
        html += `
          <div class="plan-transfer-connector conflict-connector">
            <span>⚡ 与上一场 ${prev.code} 时间重叠 ${overlap} 分钟 (${getOverlapWindowStr(prev, s)})</span>
            <span>${prev.venueShort} ↔ ${s.venueShort}</span>
          </div>
        `;
      } else {
        const gap = s.startMin - prev.endMin;
        const sameVenue = prev.venue === s.venue;
        const sameFloor = prev.floor === s.floor;
        if (gap <= 15) {
          html += `
            <div class="plan-transfer-connector tight-connector">
              <span>🏃 换场间隔 ${gap} 分钟 · ${sameVenue ? '同厅连场（无需换座）' : (sameFloor ? `同楼层换厅 (${prev.venueShort} → ${s.venueShort})` : `跨楼层换场 (${prev.venueShort} → ${s.venueShort})`)}</span>
            </div>
          `;
        } else {
          html += `
            <div class="plan-transfer-connector">
              <span>☕ 空闲间歇 ${gap} 分钟 (${prev.end}–${s.start}) · 可休息/用餐/逛展</span>
              <span>下一场前往：${s.venueShort}</span>
            </div>
          `;
        }
      }
    }

    html += `
      <div class="plan-item-card ${curr.role}">
        <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap;">
          <div style="display:flex; align-items:center; gap:6px;">
            <span class="session-code">${s.code}</span>
            <span class="session-time-pill">${s.time}</span>
            <span class="venue-badge ${getFloorClass(s.floor)}">${escapeHtml(s.venue)}</span>
          </div>
          <div style="display:flex; align-items:center; gap:6px;">
            <button
              class="btn btn-secondary btn-sm plan-role-switch-btn"
              style="padding:3px 8px; font-size:11px; white-space:nowrap;"
              onclick="setSessionRole(${s.seq}, '${curr.role === 'primary' ? 'backup' : 'primary'}')"
            >
              ${curr.role === 'primary' ? '★ 主选 (切备选)' : '📌 备选 (切主选)'}
            </button>
            <button
              class="btn btn-secondary btn-sm btn-remove-session"
              style="padding:3px 8px; font-size:11px; color:#DC2626; white-space:nowrap;"
              onclick="removeSessionFromPlan(${s.seq})"
              title="从收听计划中移除该场次"
            >
              ✕ 移除
            </button>
          </div>
        </div>

        <div style="font-weight:700; font-size:14.5px; color:var(--text-primary);">${escapeHtml(s.topic)}</div>

        <div style="font-size:12px; color:var(--text-secondary); display:flex; flex-wrap:wrap; align-items:center; gap:2px;">
          <span style="white-space:nowrap; flex-shrink:0;">🎙️ 主播/嘉宾：</span>
          ${s.speakers.length > 0
            ? s.speakers.map(sp => `<strong class="speaker-name-unbreakable">${escapeHtml(sp)}</strong>`).join('<span class="speaker-separator">、</span>')
            : '<span style="color:var(--text-muted);">虚位以待</span>'}
        </div>

        <div>
          <input
            type="text"
            class="plan-item-note-input"
            placeholder="添加个人听会备注（如：前半场必听、提问问题、约朋友碰头）..."
            value="${escapeAttr(curr.note || '')}"
            oninput="updateSessionNote(${s.seq}, this.value)"
          />
        </div>
      </div>
    `;
  }

  container.innerHTML = html;
}

// ==================== PERSONAL SCHEDULE GENERATOR & DOWNLOAD STUDIO ====================
function openExportStudio() {
  if (Object.keys(state.plan).length === 0) {
    showToast('💡 你的个人计划表还是空的，请先在节目表中选择想要收听的场次！');
    openPlanDrawer();
    return;
  }
  document.getElementById('exportStudioBackdrop').classList.add('open');
  syncBodyScrollLock();
  switchMobileExportTab('preview');
  const theme = document.getElementById('posterThemeSelect')?.value || 'punk';
  syncStyleChips(theme);
  renderSchedulePosterCanvas();
}

function closeExportStudio() {
  document.getElementById('exportStudioBackdrop').classList.remove('open');
  syncBodyScrollLock();
}

function getPlannedItemsForExport() {
  const showBackup = document.getElementById('chkPosterShowBackup')?.checked ?? true;
  return Object.values(state.plan)
    .filter(item => showBackup || item.role === 'primary')
    .map(item => ({ ...item, session: SESSION_BY_SEQ[item.seq] }))
    .filter(item => !!item.session)
    .sort((a, b) => a.session.startMin - b.session.startMin || (a.role === 'primary' ? -1 : 1));
}

// 通用 Canvas 文字换行：支持中英文词法边界保护，尽量不打碎英文单词与标点
function wrapCanvasText(ctx, text, maxWidth) {
  if (!text) return [];
  const tokens = String(text).match(/[\w]+|[^\w]/g) || Array.from(String(text));
  const lines = [];
  let currentLine = '';

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const testLine = currentLine + token;
    if (ctx.measureText(testLine).width > maxWidth && currentLine.length > 0) {
      lines.push(currentLine);
      if (ctx.measureText(token).width > maxWidth) {
        const subChars = Array.from(token);
        currentLine = '';
        for (let j = 0; j < subChars.length; j++) {
          if (ctx.measureText(currentLine + subChars[j]).width > maxWidth && currentLine.length > 0) {
            lines.push(currentLine);
            currentLine = subChars[j];
          } else {
            currentLine += subChars[j];
          }
        }
      } else {
        currentLine = token;
      }
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}

// 海报生成专用：确保每个主播/嘉宾的名字作为不可分割的独立整体换行，绝不从人名中间拆断
function wrapCanvasSpeakersText(ctx, prefix, speakers, maxWidth) {
  const spList = (speakers || []).map(s => String(s).trim()).filter(Boolean);
  if (spList.length === 0) {
    return [prefix + '虚位以待'];
  }
  const lines = [];
  let currentLine = prefix;

  for (let i = 0; i < spList.length; i++) {
    const sp = spList[i];
    const isFirstInLine = (currentLine === prefix || currentLine === '');
    const candidatePart = (isFirstInLine ? '' : '、') + sp;
    const testLine = currentLine + candidatePart;

    if (ctx.measureText(testLine).width <= maxWidth || isFirstInLine) {
      currentLine = testLine;
    } else {
      lines.push(currentLine);
      currentLine = sp;
    }
  }
  if (currentLine) {
    lines.push(currentLine);
  }
  return lines;
}

function drawRoundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawTicketPath(ctx, x, y, w, h, stubW, notchR = 9, cornerR = 8, sawtooth = true) {
  const dividerX = x + stubW;
  ctx.beginPath();

  // Top edge: from top-left to divider notch
  ctx.moveTo(x + cornerR, y);
  ctx.lineTo(dividerX - notchR, y);
  // Top notch (curves inward into the card)
  ctx.arc(dividerX, y, notchR, Math.PI, 0, true);
  // Top edge to top-right
  ctx.lineTo(x + w - cornerR, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + cornerR);

  // Right edge
  ctx.lineTo(x + w, y + h - cornerR);
  ctx.quadraticCurveTo(x + w, y + h, x + w - cornerR, y + h);

  // Bottom edge: from bottom-right to divider notch
  ctx.lineTo(dividerX + notchR, y + h);
  // Bottom notch (curves inward into the card)
  ctx.arc(dividerX, y + h, notchR, 0, Math.PI, true);
  // Bottom edge to bottom-left
  ctx.lineTo(x + cornerR, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - cornerR);

  // Left edge: sawtooth zigzag torn edge
  if (sawtooth) {
    const teeth = 8;
    const toothH = (h - 2 * cornerR) / teeth;
    for (let i = teeth; i >= 1; i--) {
      const baseY = y + cornerR + i * toothH;
      const midY = baseY - toothH / 2;
      const topY = baseY - toothH;
      ctx.lineTo(x + 5, midY);
      ctx.lineTo(x, topY);
    }
  } else {
    ctx.lineTo(x, y + cornerR);
  }

  ctx.quadraticCurveTo(x, y, x + cornerR, y);
  ctx.closePath();
}

// ==================== NONINSURANCE CREATIVE POSTER HELPERS & RENDERERS ====================

function syncPosterImagePreview(canvas) {
  const previewImg = document.getElementById('schedulePosterImg');
  if (previewImg) {
    try {
      previewImg.src = canvas.toDataURL('image/png');
    } catch (e) {
      console.warn('Failed to sync poster image preview:', e);
    }
  }
}

function setPosterTheme(themeKey) {
  if (themeKey === 'clean') themeKey = 'punk';
  const sel = document.getElementById('posterThemeSelect');
  if (sel) sel.value = themeKey;
  syncStyleChips(themeKey);
  renderSchedulePosterCanvas();
}

function onPosterThemeSelectChange(themeKey) {
  syncStyleChips(themeKey);
  renderSchedulePosterCanvas();
}

function syncStyleChips(themeKey) {
  document.querySelectorAll('.btn-style-chip').forEach(btn => {
    const s = btn.getAttribute('data-style');
    const isMatch = (s === themeKey) ||
      (s === 'noninsurance' && (themeKey === 'filmset' || themeKey === 'caution')) ||
      (s === 'filmset' && themeKey === 'noninsurance');
    btn.classList.toggle('active', isMatch);
  });
}

function drawBarcode(ctx, x, y, width, height, text) {
  const pattern = [2, 1, 3, 1, 2, 4, 1, 2, 1, 3, 2, 1, 4, 1, 2, 3, 1, 2, 1, 4, 2, 1, 3, 1, 2, 4, 1, 2, 3, 1, 1, 4, 2, 1, 2, 3, 1, 4, 1, 2, 1, 3, 2, 1, 4, 2, 1, 3, 2, 1, 2, 4, 1, 3, 2, 1, 4];
  const totalUnits = pattern.reduce((a, b) => a + b, 0);
  const unitW = width / totalUnits;
  let curX = x;
  ctx.fillStyle = '#141414';
  pattern.forEach((w, idx) => {
    if (idx % 2 === 0) {
      ctx.fillRect(curX, y, w * unitW, height);
    }
    curX += w * unitW;
  });
  if (text) {
    ctx.font = 'bold 12px "JetBrains Mono", Courier, monospace';
    ctx.fillStyle = '#262626';
    ctx.textAlign = 'center';
    ctx.fillText(text, x + width / 2, y + height + 16);
    ctx.textAlign = 'left';
  }
}

function drawHazardStripes(ctx, x, y, w, h, stripeW = 14, color1 = '#FED700', color2 = '#141414') {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = color1;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color2;
  const numStripes = Math.ceil((w + h) / stripeW) + 2;
  for (let i = -numStripes; i < numStripes; i++) {
    ctx.beginPath();
    ctx.moveTo(x + i * stripeW * 2, y);
    ctx.lineTo(x + i * stripeW * 2 + stripeW, y);
    ctx.lineTo(x + i * stripeW * 2 + stripeW - h, y + h);
    ctx.lineTo(x + i * stripeW * 2 - h, y + h);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawRubberStamp(ctx, cx, cy, textTop, textCenter, textBottom, color = '#DC2626', angle = -0.15) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, 0, 50, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(0, 0, 44, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.font = 'bold 10px -apple-system, sans-serif';
  ctx.fillText(textTop, 0, -25);
  ctx.font = '900 13px -apple-system, "PingFang SC", sans-serif';
  ctx.fillText(textCenter, 0, 4);
  ctx.font = 'bold 9.5px -apple-system, sans-serif';
  ctx.fillText(textBottom, 0, 27);
  ctx.restore();
}

// 1. 狂喜超市小票风格（纯正热敏纸无干扰 · 零遮挡）
function renderKuanivalReceiptPoster(canvas, ctx, items, userName, customSub, showTransfer, showPartners) {
  const scale = 2;
  const width = 720;
  const padX = 42;
  const contentW = width - padX * 2;

  const primaryCount = items.filter(i => i.role === 'primary').length;
  const backupCount = items.filter(i => i.role === 'backup').length;
  const totalMins = items.filter(i => i.role === 'primary').reduce((acc, i) => acc + i.session.durationMin, 0);
  const uniqueSpeakers = new Set();
  items.forEach(i => i.session.speakers.forEach(sp => uniqueSpeakers.add(sp)));

  // Pre-calculate items layout - strictly monospaced dot-matrix receipt layout
  ctx.font = 'bold 16px "JetBrains Mono", Courier, monospace';
  const cardLayouts = items.map((item, idx) => {
    const s = item.session;
    const topicLines = wrapCanvasText(ctx, s.topic, contentW - 20);
    ctx.font = '13.5px "JetBrains Mono", Courier, monospace';
    const spLines = wrapCanvasSpeakersText(ctx, '主讲: ', s.speakers.length > 0 ? s.speakers : ['特邀主讲'], contentW - 20);

    let transferText = '';
    if (showTransfer && idx > 0) {
      const prev = items[idx - 1].session;
      const overlap = getOverlapMinutes(prev, s);
      if (overlap > 0) {
        transferText = `! 换场冲突: 与上一场 ${prev.code} 重叠 ${overlap}m (${prev.venueShort} ↔ ${s.venueShort})`;
      } else {
        const gap = s.startMin - prev.endMin;
        if (gap <= 15) {
          transferText = `! 紧凑换场: 距上一场仅 ${gap}m (${prev.venueShort} → ${s.venueShort})`;
        }
      }
    }

    const noteLine = item.note ? `* 顾客备忘: ${item.note}` : '';
    const itemH = 28 + topicLines.length * 24 + spLines.length * 20 + 24 + (noteLine ? 22 : 0) + (transferText ? 24 : 0) + 16;
    return { item, s, topicLines, spLines, noteLine, transferText, itemH };
  });

  const headerH = 330;
  const itemsH = cardLayouts.length > 0 ? cardLayouts.reduce((sum, l) => sum + l.itemH, 0) : 90;
  const summaryH = 260;
  const barcodeH = 100;
  const footerH = 140;
  const totalH = Math.max(920, headerH + itemsH + summaryH + barcodeH + footerH);

  canvas.width = width * scale;
  canvas.height = totalH * scale;
  ctx.scale(scale, scale);

  // Background
  ctx.fillStyle = '#E6E3D8';
  ctx.fillRect(0, 0, width, totalH);

  // Thermal paper with saw-tooth tear edge top and bottom
  const paperX = 18;
  const paperW = width - paperX * 2;
  const toothW = 12;
  const toothH = 7;
  const paperTop = 22;

  ctx.save();
  ctx.fillStyle = '#FAF9F2';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.1)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 3;

  ctx.beginPath();
  ctx.moveTo(paperX, paperTop);
  for (let x = paperX; x < paperX + paperW; x += toothW) {
    ctx.lineTo(x + toothW / 2, paperTop + toothH);
    ctx.lineTo(Math.min(x + toothW, paperX + paperW), paperTop);
  }
  ctx.lineTo(paperX + paperW, totalH - 16);
  for (let x = paperX + paperW; x > paperX; x -= toothW) {
    ctx.lineTo(x - toothW / 2, totalH - 16 - toothH);
    ctx.lineTo(Math.max(x - toothW, paperX), totalH - 16);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  ctx.strokeStyle = 'rgba(0, 0, 0, 0.04)';
  ctx.lineWidth = 1;
  ctx.strokeRect(paperX + 4, paperTop + 8, paperW - 8, totalH - (paperTop + 32));

  // --- HEADER ---
  let curY = 70;

  ctx.fillStyle = '#141414';
  ctx.textAlign = 'center';
  ctx.font = '900 24px "PingFang SC", "JetBrains Mono", sans-serif';
  ctx.fillText('★ 第六届狂喜播客节 · 声音超级市场 ★', width / 2, curY);

  curY += 26;
  ctx.font = 'bold 12px "JetBrains Mono", Courier, monospace';
  ctx.fillStyle = '#404040';
  ctx.fillText('KUANIVAL SOUND SUPERMARKET · CASH REGISTER RECEIPT', width / 2, curY);

  curY += 26;
  ctx.font = 'bold 12px "JetBrains Mono", Courier, monospace';
  ctx.fillStyle = '#141414';
  ctx.fillText('[ 凭此收银小票全日畅听 · 欢迎光临狂喜播客节 ]', width / 2, curY);
  ctx.textAlign = 'left';

  curY += 24;

  ctx.font = '12.5px "JetBrains Mono", Courier, monospace';
  ctx.fillStyle = '#262626';
  ctx.fillText(`门店编号：KX-CMG-20261025`, padX, curY);
  ctx.fillText(`机号：POS-088`, padX + contentW - 120, curY);
  curY += 20;
  ctx.fillText(`交易单号：TX20261025-${items.length}TALKS-VIP`, padX, curY);
  ctx.fillText(`收银员：${userName}`, padX + contentW - 120, curY);
  curY += 20;
  ctx.fillText(`开单时间：2026-10-25 08:30 (全日营业)`, padX, curY);
  ctx.fillText(`状态：已开单锁定`, padX + contentW - 120, curY);

  curY += 22;

  ctx.strokeStyle = '#141414';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  ctx.moveTo(padX, curY);
  ctx.lineTo(padX + contentW, curY);
  ctx.stroke();

  curY += 16;
  ctx.font = 'bold 12px "JetBrains Mono", Courier, monospace';
  ctx.fillStyle = '#141414';
  ctx.fillText('【时段 / 展厅】', padX, curY);
  ctx.fillText('【单品名称与主讲阵容】', padX + 160, curY);
  ctx.fillText('【小计】', padX + contentW - 60, curY);

  curY += 8;
  ctx.beginPath();
  ctx.moveTo(padX, curY);
  ctx.lineTo(padX + contentW, curY);
  ctx.stroke();
  ctx.setLineDash([]);

  curY += 18;

  // --- ITEMS LIST ---
  cardLayouts.forEach((layout, idx) => {
    const { item, s, topicLines, spLines, noteLine, transferText, itemH } = layout;
    let itemY = curY;

    ctx.font = 'bold 13.5px "JetBrains Mono", Courier, monospace';
    ctx.fillStyle = '#141414';
    const seqStr = `[${String(idx + 1).padStart(2, '0')}] ${s.time}  📍 ${s.venue}`;
    ctx.fillText(seqStr, padX, itemY + 12);

    const roleStr = item.role === 'primary' ? '[★必选]' : '[·备选]';
    ctx.font = 'bold 12px "JetBrains Mono", Courier, monospace';
    ctx.fillStyle = '#141414';
    ctx.fillText(roleStr, padX + contentW - 60, itemY + 12);

    itemY += 24;

    ctx.font = '900 16px "PingFang SC", "JetBrains Mono", sans-serif';
    ctx.fillStyle = '#141414';
    topicLines.forEach(line => {
      ctx.fillText(line, padX, itemY + 14);
      itemY += 22;
    });

    ctx.font = '13px "JetBrains Mono", "PingFang SC", monospace';
    ctx.fillStyle = '#404040';
    spLines.forEach(line => {
      ctx.fillText(line, padX, itemY + 13);
      itemY += 19;
    });

    ctx.font = '12px "JetBrains Mono", Courier, monospace';
    ctx.fillStyle = '#525252';
    ctx.fillText(`数量: 1 场  |  狂喜度: 100%  |  单价: ¥0.00`, padX, itemY + 13);
    ctx.fillStyle = '#141414';
    ctx.fillText(`小计: ¥0.00`, padX + contentW - 80, itemY + 13);
    itemY += 22;

    if (transferText) {
      ctx.font = 'bold 11.5px "JetBrains Mono", "PingFang SC", monospace';
      ctx.fillStyle = '#262626';
      ctx.fillText(transferText, padX, itemY + 12);
      itemY += 20;
    }

    if (noteLine) {
      ctx.font = 'italic 12px "JetBrains Mono", "PingFang SC", monospace';
      ctx.fillStyle = '#404040';
      ctx.fillText(noteLine, padX, itemY + 12);
      itemY += 18;
    }

    ctx.strokeStyle = '#A3A3A3';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.moveTo(padX, itemY + 6);
    ctx.lineTo(padX + contentW, itemY + 6);
    ctx.stroke();
    ctx.setLineDash([]);

    curY += itemH;
  });

  // --- SUMMARY / TOTALS ---
  curY += 8;
  ctx.strokeStyle = '#141414';
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 3]);
  ctx.beginPath();
  ctx.moveTo(padX, curY);
  ctx.lineTo(padX + contentW, curY);
  ctx.stroke();
  ctx.setLineDash([]);

  curY += 22;
  ctx.font = 'bold 13px "JetBrains Mono", Courier, monospace';
  ctx.fillStyle = '#141414';
  
  const sumLines = [
    [`选购场次小计 (TOTAL SESSIONS):`, `${items.length} 场`],
    [`  - 必听主选清单 (PRIMARY):`, `${primaryCount} 场`],
    [`  - 备选赶场席位 (BACKUP):`, `${backupCount} 场`],
    [`累计收听时长 (TOTAL HOURS):`, `${(totalMins / 60).toFixed(1)} 小时 (${totalMins} 分钟)`],
    [`捕获主讲嘉宾 (GUEST TALENTS):`, `${uniqueSpeakers.size} 位`],
  ];

  sumLines.forEach(([label, val]) => {
    ctx.fillText(label, padX, curY);
    const vW = ctx.measureText(val).width;
    ctx.fillText(val, padX + contentW - vW, curY);
    curY += 22;
  });

  ctx.strokeStyle = '#525252';
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(padX, curY);
  ctx.lineTo(padX + contentW, curY);
  ctx.stroke();
  ctx.setLineDash([]);

  curY += 24;
  ctx.font = '900 14px "JetBrains Mono", Courier, monospace';
  ctx.fillStyle = '#141414';
  ctx.fillText('应付精神抚慰金 (NET PAYABLE):', padX, curY);
  ctx.fillText('¥ 0.00', padX + contentW - 55, curY);
  curY += 22;
  ctx.fillText('实付门票凭据 (TICKET APPLIED):', padX, curY);
  ctx.fillText('狂喜通票已兑现', padX + contentW - 110, curY);
  curY += 22;
  ctx.fillText('找零心情狂喜 (CHANGE):', padX, curY);
  ctx.fillText('∞ 满格快乐', padX + contentW - 85, curY);

  curY += 22;
  ctx.strokeStyle = '#141414';
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 3]);
  ctx.beginPath();
  ctx.moveTo(padX, curY);
  ctx.lineTo(padX + contentW, curY);
  ctx.stroke();
  ctx.setLineDash([]);

  // --- BARCODE SECTION ---
  curY += 24;
  drawBarcode(ctx, padX + 35, curY, contentW - 70, 48, `KX2026-KUANIVAL-${items.length}TALKS-088`);
  curY += 80;

  // --- MONOCHROME FOOTER ---
  ctx.font = '12px "JetBrains Mono", "PingFang SC", monospace';
  ctx.fillStyle = '#404040';
  ctx.textAlign = 'center';
  ctx.fillText('※ 凭此收据提前 5 分钟就座 · 观点辛辣属正常生理反应 ※', width / 2, curY);
  curY += 18;
  ctx.fillText('※ 纯正热敏纸收据凭单 · 狂喜播客节组委会授权出单 ※', width / 2, curY);
  curY += 18;
  ctx.fillText('※ 感谢光临第六届狂喜播客节 · 2026.10.25 上海·CMG融媒影城 ※', width / 2, curY);
  ctx.textAlign = 'left';

  syncPosterImagePreview(canvas);
}

const renderNoninsuranceReceiptPoster = renderKuanivalReceiptPoster;

// 2. 不太保险 · 声音食堂特调菜单风格
function renderNoninsuranceMenuPoster(canvas, ctx, items, userName, customSub, showTransfer, showPartners) {
  const scale = 2;
  const width = 800;
  const padX = 46;
  const contentW = width - padX * 2;

  const primaryCount = items.filter(i => i.role === 'primary').length;
  const backupCount = items.filter(i => i.role === 'backup').length;
  const totalMins = items.filter(i => i.role === 'primary').reduce((acc, i) => acc + i.session.durationMin, 0);
  const uniqueSpeakers = new Set();
  items.forEach(i => i.session.speakers.forEach(sp => uniqueSpeakers.add(sp)));

  ctx.font = 'bold 20px "PingFang SC", "Microsoft YaHei", sans-serif';
  const cardLayouts = items.map((item, idx) => {
    const s = item.session;
    const topicLines = wrapCanvasText(ctx, s.topic, contentW - 140);
    ctx.font = '14px "PingFang SC", sans-serif';
    const spLines = wrapCanvasSpeakersText(ctx, '主料配菜：', s.speakers.length > 0 ? s.speakers : ['特邀主厨'], contentW - 40);

    let transferText = '';
    if (showTransfer && idx > 0) {
      const prev = items[idx - 1].session;
      const overlap = getOverlapMinutes(prev, s);
      if (overlap > 0) {
        transferText = `⚡ 传菜动线冲突：与前道菜 ${prev.code} 重叠 ${overlap} 分钟 · ${prev.venueShort} ↔ ${s.venueShort}`;
      } else {
        const gap = s.startMin - prev.endMin;
        if (gap <= 15) {
          transferText = `🏃 疾速传菜：距上道菜仅 ${gap} 分钟 (${prev.venueShort} → ${s.venueShort})`;
        }
      }
    }

    const noteLine = item.note ? `🍴 顾客口味偏好：${item.note}` : '';
    const itemH = 34 + topicLines.length * 28 + spLines.length * 22 + (noteLine ? 24 : 0) + (transferText ? 26 : 0) + 20;
    return { item, s, topicLines, spLines, noteLine, transferText, itemH };
  });

  const headerH = 360;
  const itemsH = cardLayouts.length > 0 ? cardLayouts.reduce((sum, l) => sum + l.itemH, 0) : 120;
  const footerH = showPartners ? 260 : 170;
  const totalH = Math.max(900, headerH + itemsH + footerH);

  canvas.width = width * scale;
  canvas.height = totalH * scale;
  ctx.scale(scale, scale);

  ctx.fillStyle = '#FFFDF5';
  ctx.fillRect(0, 0, width, totalH);

  // Borders
  ctx.strokeStyle = '#18181B';
  ctx.lineWidth = 4;
  ctx.strokeRect(14, 14, width - 28, totalH - 28);

  ctx.strokeStyle = '#FFD500';
  ctx.lineWidth = 4;
  ctx.strokeRect(22, 22, width - 44, totalH - 44);

  // Top clip
  const clipW = 160;
  const clipH = 32;
  const clipX = width / 2 - clipW / 2;
  drawRoundedRect(ctx, clipX, 8, clipW, clipH, 6);
  ctx.fillStyle = '#27272A';
  ctx.fill();
  ctx.strokeStyle = '#71717A';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(width / 2, 24, 5, 0, Math.PI * 2);
  ctx.fillStyle = '#A1A1AA';
  ctx.fill();

  let curY = 54;

  if (posterAssets.noninsuranceLogo && posterAssets.noninsuranceLogo.complete && posterAssets.noninsuranceLogo.naturalWidth > 0) {
    ctx.drawImage(posterAssets.noninsuranceLogo, padX, curY, 70, 70);
    ctx.fillStyle = '#18181B';
    ctx.font = '900 28px "PingFang SC", sans-serif';
    ctx.fillText('🍽️ 不太保险 · 声音食堂', padX + 86, curY + 34);

    ctx.font = 'bold 13px "JetBrains Mono", monospace';
    ctx.fillStyle = '#B45309';
    ctx.fillText('NONINSURANCE SOUND BISTRO · TODAY’S SPECIAL MENU', padX + 86, curY + 58);
  } else {
    ctx.fillStyle = '#18181B';
    ctx.font = '900 30px "PingFang SC", sans-serif';
    ctx.fillText('🍽️ 不太保险 · 声音食堂', padX, curY + 36);

    ctx.font = 'bold 13px "JetBrains Mono", monospace';
    ctx.fillStyle = '#B45309';
    ctx.fillText('NONINSURANCE SOUND BISTRO · TODAY’S SPECIAL MENU', padX, curY + 60);
  }

  curY += 84;

  // Reservation Bar
  drawRoundedRect(ctx, padX, curY, contentW, 40, 8);
  ctx.fillStyle = '#18181B';
  ctx.fill();
  ctx.fillStyle = '#FFD500';
  ctx.font = 'bold 13.5px "PingFang SC", sans-serif';
  ctx.fillText(`🍷 贵宾席位：${userName}    |    📅 用餐日期：2026年10月25日    |    📍 上海·CMG融媒影城`, padX + 16, curY + 25);

  curY += 52;

  // Warning Box
  drawRoundedRect(ctx, padX, curY, contentW, 42, 8);
  ctx.fillStyle = '#FEF08A';
  ctx.fill();
  ctx.strokeStyle = '#EAB308';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = '#854D0E';
  ctx.font = 'bold 13px "PingFang SC", sans-serif';
  ctx.fillText('⚠️ 主厨告诫：本食堂所有对话均为现场大火慢炖，观点滚烫辛辣，不提供保修，趁热即刻品尝！', padX + 16, curY + 26);

  curY += 56;

  ctx.fillStyle = '#3F3F46';
  ctx.font = 'bold 13px "PingFang SC", sans-serif';
  ctx.fillText(`【本席品鉴大纲】招牌主选：${primaryCount} 道  ·  佐餐备选：${backupCount} 道  ·  慢炖时长：${(totalMins / 60).toFixed(1)} 小时  ·  当值主厨：${uniqueSpeakers.size} 位`, padX, curY);

  curY += 12;
  ctx.strokeStyle = '#D4D4D8';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padX, curY);
  ctx.lineTo(padX + contentW, curY);
  ctx.stroke();

  curY += 24;

  cardLayouts.forEach((layout, idx) => {
    const { item, s, topicLines, spLines, noteLine, transferText, itemH } = layout;
    let itemY = curY;

    ctx.font = 'bold 13px "JetBrains Mono", monospace';
    ctx.fillStyle = item.role === 'primary' ? '#DC2626' : '#2563EB';
    const courseTag = `COURSE ${String(idx + 1).padStart(2, '0')} · ${s.time}  📍 ${s.venue}`;
    ctx.fillText(courseTag, padX, itemY + 14);

    const priceText = item.role === 'primary' ? '★ 招牌主选 · 时价(免费)' : '📌 佐餐备选 · 随时入座';
    ctx.font = 'bold 12.5px "PingFang SC", sans-serif';
    ctx.fillStyle = item.role === 'primary' ? '#991B1B' : '#1E40AF';
    const pW = ctx.measureText(priceText).width;
    ctx.fillText(priceText, padX + contentW - pW, itemY + 14);

    itemY += 26;

    ctx.font = '900 19px "PingFang SC", -apple-system, sans-serif';
    ctx.fillStyle = '#18181B';
    topicLines.forEach(line => {
      ctx.fillText(line, padX, itemY + 18);
      itemY += 26;
    });

    ctx.font = '14px "PingFang SC", sans-serif';
    ctx.fillStyle = '#52525B';
    spLines.forEach(line => {
      ctx.fillText(line, padX, itemY + 16);
      itemY += 22;
    });

    if (noteLine) {
      ctx.font = 'italic 12.5px "PingFang SC", sans-serif';
      ctx.fillStyle = '#D97706';
      ctx.fillText(noteLine, padX, itemY + 15);
      itemY += 22;
    }

    if (transferText) {
      drawRoundedRect(ctx, padX, itemY, contentW, 22, 4);
      ctx.fillStyle = '#FFF1F2';
      ctx.fill();
      ctx.fillStyle = '#E11D48';
      ctx.font = 'bold 11.5px "PingFang SC", sans-serif';
      ctx.fillText(transferText, padX + 8, itemY + 15);
      itemY += 24;
    }

    ctx.strokeStyle = '#E4E4E7';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(padX, itemY + 8);
    ctx.lineTo(padX + contentW, itemY + 8);
    ctx.stroke();
    ctx.setLineDash([]);

    curY += itemH;
  });

  curY += 16;
  drawRubberStamp(ctx, width - padX - 60, curY + 45, '2026 KUANIVAL', '不太保险主厨特供', '米其林狂喜推荐', '#DC2626', -0.12);

  ctx.font = 'bold 13px "PingFang SC", sans-serif';
  ctx.fillStyle = '#3F3F46';
  ctx.fillText('🏛️ 传菜动线速查：1F (1-5号厅、狂喜圆桌A) ｜ 2F (圆桌B/C) ｜ 3F (6-8号厅)', padX, curY + 20);

  ctx.font = '12px "PingFang SC", sans-serif';
  ctx.fillStyle = '#71717A';
  ctx.fillText('所有菜品观点纯属主讲嘉宾现场发挥，不太保险但包痛快 · 祝您用餐尽兴！', padX, curY + 44);

  if (showPartners) {
    curY += 76;
    const footerImgH = Math.round(135 * (width / 576));
    if (posterAssets.footer && posterAssets.footer.complete && posterAssets.footer.naturalWidth > 0) {
      ctx.drawImage(posterAssets.footer, padX, curY, contentW, footerImgH);
    }
  }

  syncPosterImagePreview(canvas);
}

// 3. 不太保险 · 调查局行动信纸风格
function renderNoninsuranceLetterPoster(canvas, ctx, items, userName, customSub, showTransfer, showPartners) {
  const scale = 2;
  const width = 800;
  const padX = 46;
  const contentW = width - padX * 2;

  const primaryCount = items.filter(i => i.role === 'primary').length;
  const backupCount = items.filter(i => i.role === 'backup').length;
  const totalMins = items.filter(i => i.role === 'primary').reduce((acc, i) => acc + i.session.durationMin, 0);
  const uniqueSpeakers = new Set();
  items.forEach(i => i.session.speakers.forEach(sp => uniqueSpeakers.add(sp)));

  ctx.font = 'bold 19px "PingFang SC", -apple-system, sans-serif';
  const cardLayouts = items.map((item, idx) => {
    const s = item.session;
    const topicLines = wrapCanvasText(ctx, s.topic, contentW - 50);
    ctx.font = '14px "PingFang SC", sans-serif';
    const spLines = wrapCanvasSpeakersText(ctx, '涉案线人：', s.speakers.length > 0 ? s.speakers : ['身份保密'], contentW - 50);

    let transferText = '';
    if (showTransfer && idx > 0) {
      const prev = items[idx - 1].session;
      const overlap = getOverlapMinutes(prev, s);
      if (overlap > 0) {
        transferText = `⚡ 潜伏路线重叠：与目标 ${prev.code} 冲突 ${overlap} 分钟 · ${prev.venueShort} ↔ ${s.venueShort}`;
      } else {
        const gap = s.startMin - prev.endMin;
        if (gap <= 15) {
          transferText = `🏃 紧急转移阵地：间隔仅 ${gap} 分钟 (${prev.venueShort} → ${s.venueShort})`;
        }
      }
    }

    const noteLine = item.note ? `📝 特工侦察便签：${item.note}` : '';
    const itemH = 34 + topicLines.length * 28 + spLines.length * 22 + (noteLine ? 24 : 0) + (transferText ? 26 : 0) + 18;
    return { item, s, topicLines, spLines, noteLine, transferText, itemH };
  });

  const headerH = 360;
  const itemsH = cardLayouts.length > 0 ? cardLayouts.reduce((sum, l) => sum + l.itemH, 0) : 120;
  const footerH = showPartners ? 280 : 180;
  const totalH = Math.max(900, headerH + itemsH + footerH);

  canvas.width = width * scale;
  canvas.height = totalH * scale;
  ctx.scale(scale, scale);

  ctx.fillStyle = '#FAF7EE';
  ctx.fillRect(0, 0, width, totalH);

  // Graph paper grid
  ctx.strokeStyle = 'rgba(180, 160, 130, 0.1)';
  ctx.lineWidth = 1;
  for (let x = 0; x < width; x += 24) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, totalH);
    ctx.stroke();
  }
  for (let y = 0; y < totalH; y += 24) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  // Top hazard strip
  drawHazardStripes(ctx, 0, 0, width, 14, 12, '#FFD500', '#18181B');

  let curY = 32;

  if (posterAssets.noninsuranceLogo && posterAssets.noninsuranceLogo.complete && posterAssets.noninsuranceLogo.naturalWidth > 0) {
    ctx.drawImage(posterAssets.noninsuranceLogo, padX, curY, 68, 68);
    ctx.fillStyle = '#18181B';
    ctx.font = '900 24px "PingFang SC", sans-serif';
    ctx.fillText('【不太保险调查局 · 声音情报窃听手记】', padX + 82, curY + 30);
    ctx.font = 'bold 12.5px "JetBrains Mono", Courier, monospace';
    ctx.fillStyle = '#71717A';
    ctx.fillText(`DOSSIER NO: KX-INS-2026-088  |  SECURITY: TOP SECRET`, padX + 82, curY + 54);
  } else {
    ctx.fillStyle = '#18181B';
    ctx.font = '900 26px "PingFang SC", sans-serif';
    ctx.fillText('【不太保险调查局 · 声音情报窃听手记】', padX, curY + 32);
    ctx.font = 'bold 12.5px "JetBrains Mono", Courier, monospace';
    ctx.fillStyle = '#71717A';
    ctx.fillText(`DOSSIER NO: KX-INS-2026-088  |  SECURITY: TOP SECRET`, padX, curY + 56);
  }

  drawRubberStamp(ctx, width - padX - 45, curY + 35, 'TOP SECRET', '不太保险·已核准', '绝密行动', '#DC2626', -0.18);

  curY += 86;

  // Metadata Box
  drawRoundedRect(ctx, padX, curY, contentW, 90, 8);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.fill();
  ctx.strokeStyle = '#D4D4D8';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.font = '13.5px "JetBrains Mono", "PingFang SC", monospace';
  ctx.fillStyle = '#18181B';
  ctx.fillText(`特工代号 (AGENT)：${userName}`, padX + 16, curY + 28);
  ctx.fillText(`行动代号：第六届狂喜播客节·潜伏手记`, padX + 320, curY + 28);

  ctx.fillText(`行动坐标：上海 · CMG融媒影城 11空间`, padX + 16, curY + 54);
  ctx.fillText(`执行时间：2026.10.25 (周日) 全天`, padX + 320, curY + 54);

  ctx.font = 'bold 12.5px "PingFang SC", sans-serif';
  ctx.fillStyle = '#BE123C';
  ctx.fillText(`🎯 侦察指标：部署 ${primaryCount} 处主要目标 · 备选 ${backupCount} 处 · 窃听 ${(totalMins/60).toFixed(1)}h · 锁定 ${uniqueSpeakers.size} 位涉案主播`, padX + 16, curY + 78);

  curY += 106;

  ctx.font = 'bold 14px "PingFang SC", sans-serif';
  ctx.fillStyle = '#18181B';
  ctx.fillText('📋 【行动目标与侦听计划清单】', padX, curY);

  curY += 12;
  ctx.strokeStyle = '#27272A';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(padX, curY);
  ctx.lineTo(padX + contentW, curY);
  ctx.stroke();

  curY += 22;

  cardLayouts.forEach((layout, idx) => {
    const { item, s, topicLines, spLines, noteLine, transferText, itemH } = layout;
    let itemY = curY;

    // Checkbox
    ctx.strokeStyle = '#18181B';
    ctx.lineWidth = 1.8;
    ctx.strokeRect(padX, itemY + 2, 16, 16);
    ctx.fillStyle = '#16A34A';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText('✓', padX + 3, itemY + 15);

    ctx.font = 'bold 14px "JetBrains Mono", monospace';
    ctx.fillStyle = '#18181B';
    ctx.fillText(`任务 #${String(idx + 1).padStart(2, '0')} ｜ ${s.code} ｜ ⏰ ${s.time} ｜ 📍 ${s.venue}`, padX + 26, itemY + 15);

    const badgeText = item.role === 'primary' ? '★ 必听主选' : '📌 备选赶场';
    ctx.font = 'bold 12px "PingFang SC", sans-serif';
    ctx.fillStyle = item.role === 'primary' ? '#DC2626' : '#2563EB';
    const bW = ctx.measureText(badgeText).width;
    ctx.fillText(badgeText, padX + contentW - bW, itemY + 15);

    itemY += 26;

    ctx.font = '900 18px "PingFang SC", -apple-system, sans-serif';
    ctx.fillStyle = '#09090B';
    topicLines.forEach(line => {
      ctx.fillText(line, padX + 26, itemY + 16);
      itemY += 26;
    });

    ctx.font = '13.5px "PingFang SC", sans-serif';
    ctx.fillStyle = '#52525B';
    spLines.forEach(line => {
      ctx.fillText(line, padX + 26, itemY + 14);
      itemY += 22;
    });

    if (noteLine) {
      ctx.font = 'italic 12.5px "PingFang SC", sans-serif';
      ctx.fillStyle = '#B45309';
      ctx.fillText(noteLine, padX + 26, itemY + 14);
      itemY += 22;
    }

    if (transferText) {
      drawRoundedRect(ctx, padX + 26, itemY, contentW - 26, 22, 4);
      ctx.fillStyle = '#FEF2F2';
      ctx.fill();
      ctx.fillStyle = '#DC2626';
      ctx.font = 'bold 11.5px "PingFang SC", sans-serif';
      ctx.fillText(transferText, padX + 34, itemY + 15);
      itemY += 24;
    }

    ctx.strokeStyle = '#D4D4D8';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padX, itemY + 6);
    ctx.lineTo(padX + contentW, itemY + 6);
    ctx.stroke();

    curY += itemH;
  });

  curY += 20;
  drawRoundedRect(ctx, padX, curY, contentW, 64, 6);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.fill();
  ctx.strokeStyle = '#A1A1AA';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.font = '13px "PingFang SC", sans-serif';
  ctx.fillStyle = '#18181B';
  ctx.fillText('特工签署 (AGENT SIGNATURE)：_______________________', padX + 16, curY + 28);
  ctx.fillText('核准官：不太保险非官方保障处', padX + 420, curY + 28);

  ctx.font = '12px "PingFang SC", sans-serif';
  ctx.fillStyle = '#71717A';
  ctx.fillText('特别指令：若遇观点激烈碰撞，请保持冷静继续收听；概不太保险，但保证狂喜。', padX + 16, curY + 50);

  if (showPartners) {
    curY += 80;
    const footerImgH = Math.round(135 * (width / 576));
    if (posterAssets.footer && posterAssets.footer.complete && posterAssets.footer.naturalWidth > 0) {
      ctx.drawImage(posterAssets.footer, padX, curY, contentW, footerImgH);
    }
  }

  syncPosterImagePreview(canvas);
}

// 4. 不太保险（原片场计划）· 专属 Logo 元素绘制辅助函数与警示黄黑特别风格

// 辅助函数：绘制不太保险 Logo 标志性的三阶音频声波竖线条 (▎ ▍ ▎)
function drawNoninsuranceWaveBars(ctx, cx, cy, h = 24, color = '#141414') {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = color;
  const barW = Math.max(3, Math.round(h * 0.16));
  const gap = Math.max(3, Math.round(h * 0.14));
  const heights = [h * 0.55, h, h * 0.72];
  const totalW = barW * 3 + gap * 2;
  let startX = -totalW / 2;

  heights.forEach(barH => {
    drawRoundedRect(ctx, startX, -barH / 2, barW, barH, barW / 2);
    ctx.fill();
    startX += barW + gap;
  });
  ctx.restore();
}

// 辅助函数：绘制不太保险 Logo 标志性的开锁挂锁与向下三角箭头
function drawNoninsuranceLock(ctx, cx, cy, size = 26, bodyColor = '#141414', arrowColor = '#FED700') {
  ctx.save();
  ctx.translate(cx, cy);
  const bodyW = size * 0.78;
  const bodyH = size * 0.62;
  const bodyX = -bodyW / 2;
  const bodyY = -bodyH / 2 + size * 0.16;

  // 1. 弹开的锁梁 (Shackle)
  const shackleR = size * 0.22;
  const shackleThick = Math.max(2.5, size * 0.12);
  ctx.lineWidth = shackleThick;
  ctx.strokeStyle = bodyColor;
  ctx.lineCap = 'round';
  ctx.beginPath();
  const leftX = -shackleR;
  const rightX = shackleR;
  ctx.moveTo(leftX, bodyY + 3);
  ctx.lineTo(leftX, bodyY - size * 0.08);
  ctx.arc(0, bodyY - size * 0.08, shackleR, Math.PI, 0, false);
  ctx.lineTo(rightX, bodyY - size * 0.22); // 右端向上弹开
  ctx.stroke();

  // 2. 锁体
  drawRoundedRect(ctx, bodyX, bodyY, bodyW, bodyH, Math.max(3, size * 0.12));
  ctx.fillStyle = bodyColor;
  ctx.fill();

  // 3. 锁身中央向下实心等边三角箭头 (Logo 经典符号)
  const arrowW = bodyW * 0.42;
  const arrowH = bodyH * 0.42;
  const arrowCenterY = bodyY + bodyH * 0.5;
  ctx.fillStyle = arrowColor;
  ctx.beginPath();
  ctx.moveTo(-arrowW / 2, arrowCenterY - arrowH / 2);
  ctx.lineTo(arrowW / 2, arrowCenterY - arrowH / 2);
  ctx.lineTo(0, arrowCenterY + arrowH / 2);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

// 辅助函数：绘制不太保险 Logo 标志性的双斜向交叉警戒胶带 (Dual Diagonal Tapes)
function drawNoninsuranceDualTapes(ctx, yCenter, width) {
  ctx.save();

  // 底层胶带：向左微倾 (-2.8°)，高亮黄色底色 + 粗黑字
  ctx.save();
  ctx.translate(width / 2, yCenter);
  ctx.rotate(-0.046);
  ctx.shadowColor = 'rgba(0, 0, 0, 0.28)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 3;

  const tape1H = 34;
  ctx.fillStyle = '#FED700';
  ctx.fillRect(-width * 0.65, -tape1H / 2, width * 1.3, tape1H);
  ctx.lineWidth = 1.8;
  ctx.strokeStyle = '#141414';
  ctx.strokeRect(-width * 0.65, -tape1H / 2, width * 1.3, tape1H);

  ctx.shadowColor = 'transparent';
  ctx.fillStyle = '#141414';
  ctx.font = '900 13px "JetBrains Mono", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const text1 = '⚠️ NONINSURANCE ⚠️ NONINSURANCE ⚠️ NONINSURANCE ⚠️ NONINSURANCE ⚠️ NONINSURANCE ⚠️';
  ctx.fillText(text1, 0, 1);
  ctx.restore();

  // 顶层胶带：向右倾斜 (+2.3°)，酷黑底色 + 警示黄色粗字
  ctx.save();
  ctx.translate(width / 2, yCenter + 4);
  ctx.rotate(0.038);
  ctx.shadowColor = 'rgba(0, 0, 0, 0.38)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 4;

  const tape2H = 36;
  ctx.fillStyle = '#141414';
  ctx.fillRect(-width * 0.65, -tape2H / 2, width * 1.3, tape2H);
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#FED700';
  ctx.strokeRect(-width * 0.65, -tape2H / 2, width * 1.3, tape2H);

  ctx.shadowColor = 'transparent';
  drawHazardStripes(ctx, -width * 0.65, -tape2H / 2, 45, tape2H, 8, '#FED700', '#141414');
  drawHazardStripes(ctx, width * 0.65 - 45, -tape2H / 2, 45, tape2H, 8, '#FED700', '#141414');

  ctx.fillStyle = '#FED700';
  ctx.font = '900 14.5px "PingFang SC", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const text2 = '🚧 不太保险 · NON-INSURANCE · 现场特别调度 · 保证狂喜 🚧';
  ctx.fillText(text2, 0, 1);
  ctx.restore();

  ctx.restore();
}

// 主渲染函数：不太保险 · 警示黄黑特别风格
function renderNoninsurancePoster(canvas, ctx, items, userName, customSub, showTransfer, showPartners) {
  const scale = 2;
  const width = 800;
  const padX = 40;
  const contentW = width - padX * 2;

  const primaryCount = items.filter(i => i.role === 'primary').length;
  const backupCount = items.filter(i => i.role === 'backup').length;
  const totalMins = items.filter(i => i.role === 'primary').reduce((acc, i) => acc + i.session.durationMin, 0);
  const uniqueSpeakers = new Set();
  items.forEach(i => i.session.speakers.forEach(sp => uniqueSpeakers.add(sp)));

  ctx.font = '900 20px "PingFang SC", -apple-system, sans-serif';
  const cardLayouts = items.map((item, idx) => {
    const s = item.session;
    const topicLines = wrapCanvasText(ctx, s.topic, contentW - 46);
    ctx.font = '14.5px "PingFang SC", sans-serif';
    const spLines = wrapCanvasSpeakersText(ctx, '🎙️ 出镜嘉宾：', s.speakers.length > 0 ? s.speakers : ['特邀嘉宾'], contentW - 46);

    let transferText = '';
    if (showTransfer && idx > 0) {
      const prev = items[idx - 1].session;
      const overlap = getOverlapMinutes(prev, s);
      if (overlap > 0) {
        transferText = `⚡ 通告冲突：与上一场 ${prev.code} 重叠 ${overlap} 分钟 · ${prev.venueShort} ↔ ${s.venueShort}`;
      } else {
        const gap = s.startMin - prev.endMin;
        if (gap <= 15) {
          transferText = `🏃 转场候场：间隔 ${gap} 分钟 (${prev.venueShort} → ${s.venueShort})`;
        }
      }
    }

    const noteLine = item.note ? `📝 个人备忘：${item.note}` : '';
    const itemH = 52 + topicLines.length * 28 + spLines.length * 22 + (noteLine ? 24 : 0) + (transferText ? 30 : 0) + 16;
    return { item, s, topicLines, spLines, noteLine, transferText, itemH };
  });

  const headerH = 390;
  const itemsH = cardLayouts.length > 0 ? cardLayouts.reduce((sum, l) => sum + l.itemH + 16, 0) : 130;
  const footerH = showPartners ? 260 : 130;
  const totalH = Math.max(920, headerH + itemsH + footerH);

  canvas.width = width * scale;
  canvas.height = totalH * scale;
  ctx.scale(scale, scale);

  // 1. 全局警戒黄色底色
  ctx.fillStyle = '#FED700';
  ctx.fillRect(0, 0, width, totalH);

  // 2. 顶部黄黑斑马警示带
  drawHazardStripes(ctx, 0, 0, width, 14, 12, '#FED700', '#141414');

  let curY = 32;

  // 3. Header 头部设计：Logo + 标题 + 声波竖条 + 开锁小锁
  let titleX = padX;
  const logoSize = 78;
  if (posterAssets.noninsuranceLogo && posterAssets.noninsuranceLogo.complete && posterAssets.noninsuranceLogo.naturalWidth > 0) {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.18)';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 2;
    drawRoundedRect(ctx, padX, curY + 8, logoSize, logoSize, 12);
    ctx.fillStyle = '#141414';
    ctx.fill();
    ctx.drawImage(posterAssets.noninsuranceLogo, padX, curY + 8, logoSize, logoSize);
    ctx.restore();
    titleX = padX + logoSize + 18;
  }

  // 绘制标题左侧小声波
  drawNoninsuranceWaveBars(ctx, titleX + 8, curY + 34, 20, '#141414');

  ctx.fillStyle = '#141414';
  ctx.font = '900 32px "PingFang SC", sans-serif';
  const mainTitleText = `🛡️ ${userName} 的不太保险计划`;
  ctx.fillText(mainTitleText, titleX + 24, curY + 42);

  // 标题右侧加上开锁图标徽章
  const titleTextW = ctx.measureText(mainTitleText).width;
  drawNoninsuranceLock(ctx, titleX + 24 + titleTextW + 22, curY + 32, 28, '#141414', '#FED700');

  ctx.font = 'bold 15px "PingFang SC", sans-serif';
  ctx.fillStyle = '#18181B';
  ctx.fillText('第六届狂喜播客节 · 现场非官方收听通告 (NON-INSURANCE PLAN)', titleX, curY + 70);

  ctx.font = 'bold 12.5px "JetBrains Mono", monospace';
  ctx.fillStyle = '#3F3F46';
  ctx.fillText('2026.10.25 (SUN) · 上海 CMG 融媒影城 · 概不太保险，但保证狂喜', titleX, curY + 92);

  curY += 122;

  // 4. 双斜向交叉警戒胶带 (复刻 Logo 经典胶带剪影)
  drawNoninsuranceDualTapes(ctx, curY + 16, width);

  curY += 56;

  // 5. 行动指标数据栏 (黑底黄字胶囊 + 左右融入声波与开锁图腾)
  drawRoundedRect(ctx, padX, curY, contentW, 52, 12);
  ctx.fillStyle = '#141414';
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#3F3F46';
  ctx.stroke();

  // 左侧内嵌微型开锁图标
  drawNoninsuranceLock(ctx, padX + 24, curY + 26, 20, '#FED700', '#141414');

  ctx.fillStyle = '#FED700';
  ctx.font = 'bold 13.5px "PingFang SC", monospace';
  ctx.fillText(
    `必听主选：${primaryCount} 场  |  备选赶场：${backupCount} 场  |  累计收听：${(totalMins / 60).toFixed(1)} 小时  |  重点嘉宾：${uniqueSpeakers.size} 位`,
    padX + 42,
    curY + 31
  );

  // 右侧内嵌微型三阶声波条
  drawNoninsuranceWaveBars(ctx, padX + contentW - 24, curY + 26, 18, '#FED700');

  curY += 74;

  // 6. 节目日程卡片
  cardLayouts.forEach(layout => {
    const { item, s, topicLines, spLines, noteLine, transferText, itemH } = layout;

    if (transferText) {
      drawRoundedRect(ctx, padX, curY, contentW, 28, 6);
      ctx.fillStyle = '#141414';
      ctx.fill();
      ctx.fillStyle = '#FBBF24';
      ctx.font = 'bold 12px "PingFang SC", sans-serif';
      ctx.fillText(transferText, padX + 16, curY + 18);
      curY += 32;
    }

    drawRoundedRect(ctx, padX, curY, contentW, itemH, 12);
    ctx.fillStyle = '#141414';
    ctx.fill();
    ctx.lineWidth = item.role === 'primary' ? 2.5 : 1.5;
    ctx.strokeStyle = item.role === 'primary' ? '#FED700' : '#52525B';
    ctx.stroke();

    // 卡片左侧斑马警示纹
    drawHazardStripes(ctx, padX, curY, 10, itemH, 8, '#FED700', '#141414');

    let innerY = curY + 28;

    // 时间与编号
    ctx.fillStyle = item.role === 'primary' ? '#FED700' : '#38BDF8';
    ctx.font = 'bold 17px "JetBrains Mono", monospace';
    ctx.fillText(`${s.time}`, padX + 24, innerY);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 16px "JetBrains Mono", monospace';
    ctx.fillText(`${s.code}`, padX + 140, innerY);

    // 必听 / 备选胶囊
    const roleText = item.role === 'primary' ? '★ 必听主选' : '📌 备选赶场';
    drawRoundedRect(ctx, padX + 205, innerY - 16, 92, 22, 6);
    ctx.fillStyle = item.role === 'primary' ? '#FED700' : 'rgba(255,255,255,0.15)';
    ctx.fill();
    ctx.fillStyle = item.role === 'primary' ? '#141414' : '#F1F5F9';
    ctx.font = 'bold 12px "PingFang SC", sans-serif';
    ctx.fillText(roleText, padX + 214, innerY - 1);

    // 卡片右侧地点
    ctx.font = 'bold 14px "PingFang SC", sans-serif';
    ctx.fillStyle = '#E4E4E7';
    const vStr = `📍 ${s.venue}`;
    const vW = ctx.measureText(vStr).width;
    ctx.fillText(vStr, padX + contentW - vW - 20, innerY);

    innerY += 32;

    // 主题
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '900 20px "PingFang SC", sans-serif';
    topicLines.forEach(line => {
      ctx.fillText(line, padX + 24, innerY);
      innerY += 28;
    });

    innerY += 2;

    // 嘉宾
    ctx.fillStyle = '#A1A1AA';
    ctx.font = '14.5px "PingFang SC", sans-serif';
    spLines.forEach(line => {
      ctx.fillText(line, padX + 24, innerY);
      innerY += 22;
    });

    // 个人备忘
    if (noteLine) {
      innerY += 4;
      ctx.fillStyle = '#FED700';
      ctx.font = 'bold 13px "PingFang SC", sans-serif';
      ctx.fillText(noteLine, padX + 24, innerY);
    }

    curY += itemH + 16;
  });

  // 7. 底部警示条与双侧声波图腾标语
  drawHazardStripes(ctx, 0, totalH - 24, width, 14, 12, '#FED700', '#141414');

  const footerText = '※ 本计划由「不太保险」联合呈献 · 概不太保险，但保证狂喜 ※';
  ctx.fillStyle = '#141414';
  ctx.font = 'bold 13px "PingFang SC", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(footerText, width / 2, totalH - 42);
  const footerTextW = ctx.measureText(footerText).width;

  // 底部两翼增加声波条
  drawNoninsuranceWaveBars(ctx, (width - footerTextW) / 2 - 20, totalH - 46, 16, '#141414');
  drawNoninsuranceWaveBars(ctx, (width + footerTextW) / 2 + 20, totalH - 46, 16, '#141414');
  ctx.textAlign = 'left';

  if (showPartners) {
    const footerImgH = Math.round(135 * (width / 576));
    if (posterAssets.footer && posterAssets.footer.complete && posterAssets.footer.naturalWidth > 0) {
      ctx.drawImage(posterAssets.footer, padX, totalH - footerImgH - 60, contentW, footerImgH);
    }
  }

  syncPosterImagePreview(canvas);
}

const renderFilmsetPoster = renderNoninsurancePoster;
const renderNoninsuranceCautionPoster = renderNoninsurancePoster;

// ==================== CRIME SCENE (探案现场 · 侦探线索案卷) POSTER RENDERER ====================

function drawWarmDetectiveDeskBackground(ctx, width, height) {
  // Rich warm mahogany/walnut wood base tone
  ctx.fillStyle = '#221309';
  ctx.fillRect(0, 0, width, height);

  // Horizontal wood planks
  const plankH = 110;
  for (let y = 0; y < height; y += plankH) {
    // Plank dark groove
    ctx.strokeStyle = '#0F0703';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();

    // Plank subtle top highlight
    ctx.strokeStyle = 'rgba(245, 180, 120, 0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, y + 2.5);
    ctx.lineTo(width, y + 2.5);
    ctx.stroke();

    // Wood grain lines
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.14)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(0, y + 36);
    ctx.bezierCurveTo(width * 0.35, y + 24, width * 0.65, y + 46, width, y + 32);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(251, 191, 36, 0.035)';
    ctx.beginPath();
    ctx.moveTo(0, y + 72);
    ctx.bezierCurveTo(width * 0.25, y + 84, width * 0.75, y + 62, width, y + 78);
    ctx.stroke();
  }

  // Warm Detective Desk Lamp Illumination (Golden radial glow centered near top)
  const lampGlow = ctx.createRadialGradient(width / 2, 220, 80, width / 2, height / 2, width * 0.85);
  lampGlow.addColorStop(0, 'rgba(251, 191, 36, 0.09)');
  lampGlow.addColorStop(0.4, 'rgba(217, 119, 6, 0.04)');
  lampGlow.addColorStop(0.8, 'rgba(0, 0, 0, 0.35)');
  lampGlow.addColorStop(1, 'rgba(0, 0, 0, 0.72)');
  ctx.fillStyle = lampGlow;
  ctx.fillRect(0, 0, width, height);

  // Heavy dark walnut desk border moulding
  ctx.strokeStyle = '#120803';
  ctx.lineWidth = 16;
  ctx.strokeRect(8, 8, width - 16, height - 16);

  ctx.strokeStyle = 'rgba(245, 190, 120, 0.12)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(16, 16, width - 32, height - 32);
}

function drawTapeStrip(ctx, x, y, width = 72, height = 22, angle = 0, color = 'rgba(254, 252, 232, 0.74)') {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);

  // Soft tape shadow
  ctx.shadowColor = 'rgba(0, 0, 0, 0.18)';
  ctx.shadowBlur = 5;
  ctx.shadowOffsetY = 2;

  // Base tape polygon with torn jagged ends
  ctx.fillStyle = color;
  ctx.beginPath();
  // Jagged left edge
  ctx.moveTo(-width / 2, -height / 2);
  ctx.lineTo(-width / 2 + 2, -height / 4);
  ctx.lineTo(-width / 2, 0);
  ctx.lineTo(-width / 2 + 3, height / 4);
  ctx.lineTo(-width / 2, height / 2);
  // Bottom edge
  ctx.lineTo(width / 2, height / 2);
  // Jagged right edge
  ctx.lineTo(width / 2 - 2, height / 4);
  ctx.lineTo(width / 2, 0);
  ctx.lineTo(width / 2 - 3, -height / 4);
  ctx.lineTo(width / 2, -height / 2);
  ctx.closePath();
  ctx.fill();

  // Subtle frosted crinkle reflection highlight
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.48)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(-width / 2 + 5, -height / 2 + 2);
  ctx.lineTo(width / 2 - 5, -height / 2 + 2);
  ctx.stroke();

  ctx.restore();
}

function drawVintageMagnifyingGlass(ctx, cx, cy, radius = 38, angle = Math.PI / 4) {
  ctx.save();
  ctx.translate(cx, cy);

  // Warm soft drop shadow of the entire instrument onto the desk/paper
  ctx.shadowColor = 'rgba(0, 0, 0, 0.42)';
  ctx.shadowBlur = 18;
  ctx.shadowOffsetX = 8;
  ctx.shadowOffsetY = 12;

  // 1. Turned Dark Mahogany Handle
  const handleLen = 58;
  const handleW = 11;
  ctx.save();
  ctx.rotate(angle);

  // Brass ferrule connecting ring
  const ferruleGrad = ctx.createLinearGradient(-handleW / 2, 0, handleW / 2, 0);
  ferruleGrad.addColorStop(0, '#D97706');
  ferruleGrad.addColorStop(0.5, '#FDE68A');
  ferruleGrad.addColorStop(1, '#92400E');
  ctx.fillStyle = ferruleGrad;
  ctx.fillRect(-handleW / 2 + 1, radius - 2, handleW - 2, 10);

  // Wooden grip
  drawRoundedRect(ctx, -handleW / 2, radius + 8, handleW, handleLen, 5);
  const handleGrad = ctx.createLinearGradient(-handleW / 2, 0, handleW / 2, 0);
  handleGrad.addColorStop(0, '#1A1009');
  handleGrad.addColorStop(0.3, '#3B1A0E');
  handleGrad.addColorStop(0.7, '#4E2413');
  handleGrad.addColorStop(1, '#150C07');
  ctx.fillStyle = handleGrad;
  ctx.fill();

  // Brass end pommel
  drawRoundedRect(ctx, -handleW / 2 - 1, radius + handleLen + 4, handleW + 2, 6, 3);
  ctx.fillStyle = ferruleGrad;
  ctx.fill();

  ctx.restore();

  // 2. Brass Bezel / Rim
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  const rimGrad = ctx.createLinearGradient(-radius, -radius, radius, radius);
  rimGrad.addColorStop(0, '#FEF08A');
  rimGrad.addColorStop(0.25, '#F59E0B');
  rimGrad.addColorStop(0.5, '#D97706');
  rimGrad.addColorStop(0.75, '#B45309');
  rimGrad.addColorStop(1, '#78350F');
  ctx.lineWidth = 5.5;
  ctx.strokeStyle = rimGrad;
  ctx.stroke();

  // Inner brass lip
  ctx.beginPath();
  ctx.arc(0, 0, radius - 2.5, 0, Math.PI * 2);
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
  ctx.stroke();

  // 3. Clear Glass Lens with optical tint
  ctx.shadowColor = 'transparent';
  ctx.beginPath();
  ctx.arc(0, 0, radius - 3, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(219, 234, 254, 0.16)';
  ctx.fill();

  // Magnified subtle focal text watermark inside lens
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, radius - 3, 0, Math.PI * 2);
  ctx.clip();

  // Subtle magnification vignette inside lens edge
  const lensVignette = ctx.createRadialGradient(0, 0, radius * 0.35, 0, 0, radius - 3);
  lensVignette.addColorStop(0, 'rgba(255, 255, 255, 0)');
  lensVignette.addColorStop(1, 'rgba(180, 83, 9, 0.12)');
  ctx.fillStyle = lensVignette;
  ctx.fill();

  ctx.restore();

  // 4. Specular Curved Gleam Highlights (realistic optical glass reflection)
  ctx.beginPath();
  ctx.arc(0, 0, radius - 6, -Math.PI * 0.8, -Math.PI * 0.2);
  ctx.lineWidth = 2.4;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(0, 0, radius - 8, Math.PI * 0.35, Math.PI * 0.55);
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.stroke();

  ctx.restore();
}

function drawPushpin(ctx, x, y, color = '#EF4444') {
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
  ctx.beginPath();
  ctx.ellipse(x + 3, y + 6, 7, 3.5, Math.PI / 6, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#991B1B';
  ctx.beginPath();
  ctx.arc(x, y + 2, 7, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y - 1, 6.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
  ctx.beginPath();
  ctx.arc(x - 2, y - 3, 2, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function renderCrimeScenePoster(canvas, ctx, items, userName, customSub, showTransfer, showPartners) {
  const scale = 2;
  const width = 800;
  const padX = 46;
  const contentW = width - padX * 2;

  const primaryCount = items.filter(i => i.role === 'primary').length;
  const backupCount = items.filter(i => i.role === 'backup').length;
  const totalMins = items.filter(i => i.role === 'primary').reduce((acc, i) => acc + i.session.durationMin, 0);
  const uniqueSpeakers = new Set();
  items.forEach(i => i.session.speakers.forEach(sp => uniqueSpeakers.add(sp)));

  const topicLineHeight = 34; // 舒展的话题行距
  const spLineHeight = 28;    // 舒展的涉案人行距

  // Pre-calculate heights with comfortable spacing & unified fonts
  const cardLayouts = items.map((item, idx) => {
    const s = item.session;
    ctx.font = 'bold 18px "PingFang SC", "Microsoft YaHei", sans-serif';
    const topicLines = wrapCanvasText(ctx, s.topic, contentW - 56);
    ctx.font = '14px "PingFang SC", sans-serif';
    const spLines = wrapCanvasSpeakersText(ctx, '🎙️ 关键涉案人：', s.speakers.length > 0 ? s.speakers : ['特邀涉案嘉宾'], contentW - 56);

    let transferText = '';
    if (showTransfer && idx > 0) {
      const prev = items[idx - 1].session;
      const overlap = getOverlapMinutes(prev, s);
      if (overlap > 0) {
        transferText = `⚡ 路线重叠预警：与上一现场 ${prev.code} 冲突 ${overlap} 分钟 · ${prev.venueShort} ↔ ${s.venueShort}`;
      } else {
        const gap = s.startMin - prev.endMin;
        if (gap <= 15) {
          transferText = `🏃 疾速赶往下一现场：相距仅 ${gap} 分钟 (${prev.venueShort} → ${s.venueShort})`;
        }
      }
    }

    const noteLine = item.note ? `🕵️ 现场侦查笔记：${item.note}` : '';
    const noteH = noteLine ? 38 : 0;
    const transferH = transferText ? 38 : 0;
    // 舒展的卡片高度精确计算：顶部内边距 + 头栏到标题 + 话题总高 + 段落空隙 + 涉案人总高 + 笔记便签 + 换场提示 + 底部留白
    const itemH = 34 + 34 + (topicLines.length - 1) * topicLineHeight + 14 + spLines.length * spLineHeight + noteH + transferH + 30;

    const angles = [-0.012, 0.012, -0.014, 0.01, -0.012, 0.014];
    const angle = angles[idx % angles.length];
    const pinColors = ['#DC2626', '#D97706', '#2563EB', '#059669', '#E11D48'];
    const pinColor = pinColors[idx % pinColors.length];

    return { item, s, topicLines, spLines, noteLine, transferText, itemH, angle, pinColor };
  });

  const headerH = 370;
  const itemsH = cardLayouts.length > 0 ? cardLayouts.reduce((sum, l) => sum + l.itemH + 32, 0) : 150;
  const footerH = showPartners ? 290 : 170;
  const totalH = Math.max(980, headerH + itemsH + footerH);

  canvas.width = width * scale;
  canvas.height = totalH * scale;
  ctx.scale(scale, scale);

  // 1. Warm atmospheric detective desk background
  drawWarmDetectiveDeskBackground(ctx, width, totalH);

  // 2. Case Dossier Header (Pinned Manila Case Folder on Detective Desk)
  const headerCardY = 36;
  const headerCardH = 260;

  // Manila Folder Tab at top left
  drawRoundedRect(ctx, padX + 8, headerCardY - 14, 190, 22, 6);
  ctx.fillStyle = '#E8DEC8';
  ctx.fill();
  ctx.strokeStyle = '#B8A892';
  ctx.lineWidth = 1.2;
  ctx.stroke();

  ctx.font = 'bold 11px "JetBrains Mono", Courier, monospace';
  ctx.fillStyle = '#78350F';
  ctx.fillText('DOSSIER // KX-2026-SH', padX + 20, headerCardY - 1);

  // Folder Main Body
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.52)';
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 8;
  drawRoundedRect(ctx, padX, headerCardY, contentW, headerCardH, 8);
  ctx.fillStyle = '#F8F4EA'; // Aged case file paper
  ctx.fill();
  ctx.strokeStyle = '#C9BAA3';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();

  // Translucent Tape Strips holding header corners onto the desk
  drawTapeStrip(ctx, padX + 32, headerCardY + 2, 64, 22, -0.14);
  drawTapeStrip(ctx, padX + contentW - 32, headerCardY + 2, 64, 22, 0.14);

  // Top two pushpins pinning tape to the desk
  drawPushpin(ctx, padX + 32, headerCardY + 4, '#DC2626');
  drawPushpin(ctx, padX + contentW - 32, headerCardY + 4, '#DC2626');

  // Header Content with comfortable line spacing
  let curY = headerCardY + 34;

  // Case Dossier Label
  ctx.font = 'bold 12px "JetBrains Mono", Courier, monospace';
  ctx.fillStyle = '#991B1B';
  ctx.fillText('CRIME SCENE INVESTIGATION // CLASSIFIED DOSSIER', padX + 28, curY);

  curY += 30;

  // Title
  ctx.fillStyle = '#18181B';
  ctx.font = '900 27px "PingFang SC", sans-serif';
  ctx.fillText('🔍 探案现场 · 声音侦查卷宗', padX + 28, curY);

  curY += 30;

  // Subtitle / Banner（现场通报框：印章描线风格，双层朱砂红描边 + 增大下边距 margin-bottom）
  const noticeBoxX = padX + 28;
  const noticeBoxY = curY;
  const noticeBoxW = contentW - 175;
  const noticeBoxH = 28;

  // 1. 半透明印泥浅底
  drawRoundedRect(ctx, noticeBoxX, noticeBoxY, noticeBoxW, noticeBoxH, 3);
  ctx.fillStyle = 'rgba(220, 38, 38, 0.04)';
  ctx.fill();

  // 2. 外层印章边框（外粗线）
  ctx.strokeStyle = '#B91C1C';
  ctx.lineWidth = 1.6;
  ctx.stroke();

  // 3. 内层印章细线（双线描边印章规制）
  drawRoundedRect(ctx, noticeBoxX + 2.5, noticeBoxY + 2.5, noticeBoxW - 5, noticeBoxH - 5, 2);
  ctx.strokeStyle = 'rgba(185, 28, 28, 0.65)';
  ctx.lineWidth = 0.8;
  ctx.stroke();

  // 4. 印章文字（深朱砂红，带警示与公文印章质感）
  ctx.fillStyle = '#991B1B';
  ctx.font = '900 12px "PingFang SC", sans-serif';
  ctx.fillText('⚠️ 现场通报：', noticeBoxX + 10, noticeBoxY + 18.5);

  ctx.font = 'bold 11.5px "PingFang SC", sans-serif';
  ctx.fillStyle = '#B91C1C';
  ctx.fillText('全天 88 场对话线索已锁定，请依破案动线准时潜伏入座', noticeBoxX + 86, noticeBoxY + 18.5);

  // 增加显著的 margin-bottom（框高 28px，下移 54px，留出 26px 舒适呼吸间距）
  curY += 54;

  // 执案侦探姓名防重叠截断
  const safeUserName = (userName || '声音特派探员').length > 12 
    ? (userName || '声音特派探员').slice(0, 11) + '…' 
    : (userName || '声音特派探员');

  // Metadata Grid with comfortable spacing & no overlap
  ctx.font = '13.5px "JetBrains Mono", "PingFang SC", monospace';
  ctx.fillStyle = '#27272A';
  ctx.fillText(`🕵️ 执案侦探：${safeUserName}`, padX + 28, curY);
  ctx.fillText(`📅 案发日期：2026年10月25日 全天`, padX + 310, curY);

  curY += 26;
  ctx.fillText(`📍 锁定现场：上海·CMG融媒影城`, padX + 28, curY);
  ctx.fillText(`📁 归档状态：已确证立案 (${items.length} 处案发点)`, padX + 310, curY);

  curY += 28;
  ctx.font = 'bold 12.5px "PingFang SC", sans-serif';
  ctx.fillStyle = '#BE123C';
  ctx.fillText(`🎯 侦查指标：锁定 ${primaryCount} 处核心主线 · 备选 ${backupCount} 处 · 侦查 ${(totalMins/60).toFixed(1)}h · 涉案 ${uniqueSpeakers.size} 位重点人`, padX + 28, curY);

  // Red Rubber Stamp on header (挪到右上内侧，绝不盖住文本)
  drawRubberStamp(ctx, width - padX - 90, headerCardY + 142, 'CRIME SCENE', '探案现场·案情锁定', 'EVIDENCE VERIFIED', '#DC2626', -0.16);

  // Harmonious Vintage Magnifying Glass
  drawVintageMagnifyingGlass(ctx, width - padX - 44, headerCardY + 56, 36, Math.PI / 4 + 0.12);

  curY = headerCardY + headerCardH + 36;

  // 3. Clue Cards with Red String Connections
  const pinPositions = [];
  let tempY = curY;
  cardLayouts.forEach(layout => {
    const pinX = width / 2;
    const pinY = tempY + 14;
    pinPositions.push({ x: pinX, y: pinY });
    tempY += layout.itemH + 32;
  });

  // Draw Glowing Crimson Connecting Threads between evidence pins
  if (pinPositions.length > 1) {
    ctx.save();
    ctx.strokeStyle = '#DC2626';
    ctx.lineWidth = 2.4;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 4;

    for (let i = 0; i < pinPositions.length - 1; i++) {
      const p1 = pinPositions[i];
      const p2 = pinPositions[i + 1];
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      const midX = (p1.x + p2.x) / 2 + (i % 2 === 0 ? 32 : -32);
      const midY = (p1.y + p2.y) / 2 + 10;
      ctx.quadraticCurveTo(midX, midY, p2.x, p2.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Draw each Evidence Clue Note (便签 / 案卷卡)
  if (cardLayouts.length === 0) {
    ctx.save();
    drawRoundedRect(ctx, padX, curY, contentW, 110, 8);
    ctx.fillStyle = '#FAF6ED';
    ctx.fill();
    ctx.strokeStyle = '#D4C5B0';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.font = 'bold 16px "PingFang SC", sans-serif';
    ctx.fillStyle = '#78350F';
    ctx.fillText('🔍 暂无立案线索：请先返回节目表勾选你感兴趣的场次加入收听计划', padX + 32, curY + 48);

    ctx.font = '13px "PingFang SC", sans-serif';
    ctx.fillStyle = '#9CA3AF';
    ctx.fillText('支持在全景时刻表、时间轴或主播检索中心一键添加必听主选或备选场次。', padX + 32, curY + 76);
    ctx.restore();

    curY += 136;
  }

  cardLayouts.forEach((layout, idx) => {
    const { item, s, topicLines, spLines, noteLine, transferText, itemH, angle, pinColor } = layout;

    ctx.save();
    ctx.translate(width / 2, curY + itemH / 2);
    ctx.rotate(angle);

    const cardW = contentW;
    const cardH = itemH;
    const cardX = -cardW / 2;
    const cardY = -cardH / 2;

    // Deep shadow on desk
    ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
    ctx.shadowBlur = 15;
    ctx.shadowOffsetY = 8;

    // Card background (Aged clue memo note)
    drawRoundedRect(ctx, cardX, cardY, cardW, cardH, 8);
    ctx.fillStyle = item.role === 'primary' ? '#FAF6ED' : '#F4EEE1';
    ctx.fill();

    // Border
    ctx.lineWidth = item.role === 'primary' ? 2 : 1.2;
    ctx.strokeStyle = item.role === 'primary' ? '#DC2626' : '#C7B9A3';
    ctx.stroke();

    ctx.shadowColor = 'transparent';

    // Left Evidence Stripe
    drawRoundedRect(ctx, cardX, cardY, 8, cardH, 4);
    ctx.fillStyle = item.role === 'primary' ? '#DC2626' : '#D97706';
    ctx.fill();

    // Translucent tape strip on the top edge of each clue card
    drawTapeStrip(ctx, cardX + 48, cardY + 2, 56, 18, -0.06);

    let innerY = cardY + 30;

    // Line 1: Header Row (Zero Overlap Guaranteed)
    // 1) 右侧放置角色角标 (Role Tag)
    const roleStr = item.role === 'primary' ? '★ 核心主线' : '📌 分支线索';
    const roleTagW = 86;
    const roleTagX = cardX + cardW - 24 - roleTagW;
    drawRoundedRect(ctx, roleTagX, innerY - 16, roleTagW, 22, 5);
    ctx.fillStyle = item.role === 'primary' ? '#FEE2E2' : '#FEF3C7';
    ctx.fill();
    ctx.fillStyle = item.role === 'primary' ? '#DC2626' : '#D97706';
    ctx.font = 'bold 12px "PingFang SC", sans-serif';
    ctx.fillText(roleStr, roleTagX + 9, innerY - 1);

    // 2) 左侧放置线索编号 + 场号 + 开场时间
    ctx.font = 'bold 14px "JetBrains Mono", Courier, monospace';
    ctx.fillStyle = '#18181B';
    const leftText = `[线索 #${String(idx + 1).padStart(2, '0')}] ${s.code} ｜ ⏰ ${s.time}`;
    ctx.fillText(leftText, cardX + 24, innerY);
    const leftW = ctx.measureText(leftText).width;

    // 3) 中间放置案发厅室 (Venue)，动态计算绝对无重叠
    ctx.font = 'bold 13px "PingFang SC", sans-serif';
    let venueText = `📍 案发：${s.venue}`;
    let venueW = ctx.measureText(venueText).width;
    if (cardX + 24 + leftW + 20 > roleTagX - 14 - venueW) {
      venueText = `📍 ${s.venueShort || s.venue}`;
      venueW = ctx.measureText(venueText).width;
    }
    const venueX = roleTagX - 14 - venueW;
    ctx.fillStyle = '#4B5563';
    ctx.fillText(venueText, venueX, innerY);

    innerY += 34;

    // Topic with comfortable line spacing (34px line height)
    ctx.font = 'bold 18px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillStyle = '#09090B';
    topicLines.forEach(line => {
      ctx.fillText(line, cardX + 24, innerY);
      innerY += topicLineHeight;
    });

    innerY += 6; // 舒适的段落空隙

    // Suspects / Speakers with comfortable line spacing (28px line height)
    ctx.font = '14px "PingFang SC", sans-serif';
    ctx.fillStyle = '#4B5563';
    spLines.forEach(line => {
      ctx.fillText(line, cardX + 24, innerY);
      innerY += spLineHeight;
    });

    // Detective Note (Styled as yellow sticky tape memo)
    if (noteLine) {
      innerY += 4;
      drawRoundedRect(ctx, cardX + 20, innerY - 14, cardW - 40, 28, 5);
      ctx.fillStyle = 'rgba(254, 240, 138, 0.55)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(234, 179, 8, 0.45)';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.font = 'bold 12.5px "PingFang SC", sans-serif';
      ctx.fillStyle = '#92400E';
      ctx.fillText(noteLine, cardX + 32, innerY + 5);
      innerY += 34;
    }

    // Transfer Alert
    if (transferText) {
      innerY += 4;
      drawRoundedRect(ctx, cardX + 20, innerY - 14, cardW - 40, 28, 5);
      ctx.fillStyle = '#FEF2F2';
      ctx.fill();
      ctx.strokeStyle = '#FCA5A5';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = '#DC2626';
      ctx.font = 'bold 12px "PingFang SC", sans-serif';
      ctx.fillText(transferText, cardX + 32, innerY + 5);
      innerY += 34;
    }

    ctx.restore();

    // Top Pushpin holding the clue card onto the board
    drawPushpin(ctx, width / 2, curY + 6, pinColor);

    curY += itemH + 32;
  });

  // 4. Footer Section (Desk Memo Strip)
  curY += 12;
  const footerCardH = 78;
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 6;
  drawRoundedRect(ctx, padX, curY, contentW, footerCardH, 8);
  ctx.fillStyle = '#F8F4EA';
  ctx.fill();
  ctx.strokeStyle = '#C9BAA3';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();

  drawTapeStrip(ctx, padX + 22, curY + 4, 52, 18, -0.08);
  drawTapeStrip(ctx, padX + contentW - 22, curY + 4, 52, 18, 0.08);

  drawPushpin(ctx, padX + 22, curY + 6, '#DC2626');
  drawPushpin(ctx, padX + contentW - 22, curY + 6, '#DC2626');

  ctx.font = 'bold 13px "PingFang SC", sans-serif';
  ctx.fillStyle = '#27272A';
  ctx.fillText('🏛️ 现场搜查动线：1F (1-5号厅、狂喜圆桌A) ｜ 2F (圆桌B/C) ｜ 3F (6-8号厅)', padX + 38, curY + 32);

  ctx.font = '12px "PingFang SC", sans-serif';
  ctx.fillStyle = '#71717A';
  ctx.fillText('本案卷线索由狂喜播客节「探案现场」侦破组联合整理 · 案情曲折但包精彩 · 祝您听会愉快！', padX + 38, curY + 56);

  if (showPartners) {
    curY += 86;
    const footerImgH = Math.round(135 * (width / 576));
    if (posterAssets.footer && posterAssets.footer.complete && posterAssets.footer.naturalWidth > 0) {
      ctx.drawImage(posterAssets.footer, padX, curY, contentW, footerImgH);
    }
  }

  syncPosterImagePreview(canvas);
}

const renderYidiDengluPoster = renderCrimeScenePoster;


// ==================== POSTER VISUAL ASSETS (OFFICIAL KUANIVAL DESIGN) ====================
const posterAssets = {
  topBanner: null,
  footer: null,
  qr: null,
  noninsuranceLogo: null,
  yididengluLogo: null,
  isInitialized: false
};

function initPosterAssets() {
  if (posterAssets.isInitialized) return;
  posterAssets.isInitialized = true;

  posterAssets.topBanner = new Image();
  posterAssets.topBanner.crossOrigin = 'anonymous';
  posterAssets.topBanner.src = 'assets/kuanival-top-full.png';

  posterAssets.footer = new Image();
  posterAssets.footer.crossOrigin = 'anonymous';
  posterAssets.footer.src = 'assets/kuanival-footer-full.png';

  posterAssets.qr = new Image();
  posterAssets.qr.crossOrigin = 'anonymous';
  posterAssets.qr.src = 'assets/kuanival-qr-only.png';

  posterAssets.noninsuranceLogo = new Image();
  posterAssets.noninsuranceLogo.crossOrigin = 'anonymous';
  posterAssets.noninsuranceLogo.src = 'assets/noninsurance-logo.png';

  posterAssets.yididengluLogo = new Image();
  posterAssets.yididengluLogo.crossOrigin = 'anonymous';
  posterAssets.yididengluLogo.src = 'assets/yididenglu-logo.png';

  const triggerRerender = () => {
    if (document.getElementById('exportStudioBackdrop')?.classList.contains('open')) {
      renderSchedulePosterCanvas();
    }
  };

  posterAssets.topBanner.onload = triggerRerender;
  posterAssets.footer.onload = triggerRerender;
  posterAssets.qr.onload = triggerRerender;
  posterAssets.noninsuranceLogo.onload = triggerRerender;
  posterAssets.yididengluLogo.onload = triggerRerender;
}

function renderSchedulePosterCanvas() {
  const canvas = document.getElementById('schedulePosterCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  initPosterAssets();

  const userName = (document.getElementById('posterUserName')?.value || '狂喜听友').trim();
  const customSub = (document.getElementById('posterTitleInput')?.value || '在CMG融媒影城，打捞一整天的声音奇遇').trim();
  const themeKey = document.getElementById('posterThemeSelect')?.value || 'punk';
  const showTransfer = document.getElementById('chkPosterShowTransfer')?.checked ?? true;
  const showPartners = document.getElementById('chkPosterShowPartners')?.checked ?? true;

  const items = getPlannedItemsForExport();

  if (themeKey === 'crimescene' || themeKey === 'yididenglu') {
    renderCrimeScenePoster(canvas, ctx, items, userName, customSub, showTransfer, showPartners);
    return;
  }
  if (themeKey === 'receipt') {
    renderKuanivalReceiptPoster(canvas, ctx, items, userName, customSub, showTransfer, showPartners);
    return;
  }
  if (themeKey === 'filmset' || themeKey === 'caution' || themeKey === 'noninsurance') {
    renderFilmsetPoster(canvas, ctx, items, userName, customSub, showTransfer, showPartners);
    return;
  }
  if (themeKey === 'menu') {
    renderNoninsuranceMenuPoster(canvas, ctx, items, userName, customSub, showTransfer, showPartners);
    return;
  }
  if (themeKey === 'letter') {
    renderNoninsuranceLetterPoster(canvas, ctx, items, userName, customSub, showTransfer, showPartners);
    return;
  }

  const themes = {
    punk: {
      name: '狂喜粉蓝朋克 · 官方主视觉',
      isPunk: true,
      bg: '#0A1128',
      headerBg: '#E6007A',
      cardBg: '#FFFFFF',
      cardBackupBg: '#0D1B3E',
      cardBorder: '#F43F5E',
      primaryAccent: '#E6007A',
      secondaryAccent: '#00D2FF',
      textMain: '#0F172A',
      textSub: '#475569',
      textMuted: '#94A3B8',
      badgeBg: '#FFE4F1',
      badgeText: '#C20062'
    },
    festival: {
      name: '狂喜黑金',
      bg: '#141413',
      headerBg: '#1F1B18',
      cardBg: '#21201D',
      cardBackupBg: '#1D1B16',
      cardBorder: '#35322D',
      primaryAccent: '#22C55E',
      secondaryAccent: '#F59E0B',
      textMain: '#FAF8F5',
      textSub: '#B8B2A8',
      textMuted: '#78716C',
      badgeBg: 'rgba(34, 197, 94, 0.18)',
      badgeText: '#4ADE80'
    },
    paper: {
      name: '暖米手账',
      bg: '#F5F0E6',
      headerBg: '#26231F',
      cardBg: '#FFFDF9',
      cardBackupBg: '#FDF8EC',
      cardBorder: '#DCD3C2',
      primaryAccent: '#15803D',
      secondaryAccent: '#B45309',
      textMain: '#1C1917',
      textSub: '#57534E',
      textMuted: '#8A847C',
      badgeBg: '#DCFCE7',
      badgeText: '#166534'
    }
  };

  const th = themes[themeKey] || themes.punk;
  const isPunk = themeKey === 'punk';

  const scale = 2; // Retina 2x
  const width = 800;
  const padX = 40;
  const contentW = width - padX * 2;
  const stubW = 132;
  const ticketTextW = contentW - stubW - 46;

  // Pre-calculate height of each card
  const cardLayouts = items.map((item, idx) => {
    const s = item.session;
    const textAvailableW = isPunk ? ticketTextW : (contentW - 44);
    ctx.font = '900 19px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
    const topicLines = wrapCanvasText(ctx, s.topic, textAvailableW);
    ctx.font = '14px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
    const spLines = wrapCanvasSpeakersText(ctx, '🎙️ 主播/嘉宾：', s.speakers, textAvailableW);

    let transferText = '';
    let isConflict = false;
    if (showTransfer && idx > 0) {
      const prev = items[idx - 1].session;
      const overlap = getOverlapMinutes(prev, s);
      if (overlap > 0) {
        isConflict = true;
        transferText = `⚡ 时间重叠提醒：与上一场 ${prev.code} 重叠 ${overlap} 分钟 (${getOverlapWindowStr(prev, s)}) · ${prev.venueShort} ↔ ${s.venueShort}`;
      } else {
        const gap = s.startMin - prev.endMin;
        if (gap <= 15) {
          transferText = `🏃 紧凑换场：距上一场间隔 ${gap} 分钟 (${prev.venueShort} → ${s.venueShort})`;
        }
      }
    }

    const noteLine = item.note ? `📝 备注：${item.note}` : '';
    let cardH = 68 + topicLines.length * 28 + spLines.length * 22 + (noteLine ? 26 : 0) + 24;
    if (isPunk) {
      cardH = Math.max(140, cardH);
    }
    const connectorH = transferText ? 34 : 0;

    return {
      item,
      s,
      topicLines,
      spLines,
      noteLine,
      transferText,
      isConflict,
      cardH,
      connectorH
    };
  });

  // Top banner from reference poster (576 x 250)
  const topBannerH = Math.round(250 * (width / 576)); // 347px
  const userBarH = 145;
  const headerH = isPunk ? (topBannerH + userBarH) : 250;
  
  const footerImgH = Math.round(164 * (width / 576)); // 228px
  const footerH = showPartners ? (footerImgH + 46) : 115;

  const cardsTotalH = cardLayouts.length > 0
    ? cardLayouts.reduce((sum, l) => sum + l.cardH + l.connectorH + 18, 0)
    : 140;
  const totalHeight = Math.max(860, headerH + cardsTotalH + footerH + 30);

  canvas.width = width * scale;
  canvas.height = totalHeight * scale;
  ctx.scale(scale, scale);

  // 1. Background
  if (isPunk) {
    // Top header background
    ctx.fillStyle = '#E8177B';
    ctx.fillRect(0, 0, width, headerH);

    // Middle background: Pure white as requested by user ("中间部分可以用白色底")
    const middleH = (totalHeight - footerH) - headerH;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, headerH, width, middleH);

    // Bottom footer background
    ctx.fillStyle = '#060A18';
    ctx.fillRect(0, totalHeight - footerH, width, footerH);
  } else {
    ctx.fillStyle = th.bg;
    ctx.fillRect(0, 0, width, totalHeight);
  }

  // 2. Header
  const primaryCount = items.filter(i => i.role === 'primary').length;
  const backupCount = items.filter(i => i.role === 'backup').length;
  const totalMins = items.filter(i => i.role === 'primary').reduce((acc, i) => acc + i.session.durationMin, 0);
  const uniqueSpeakers = new Set();
  items.forEach(i => i.session.speakers.forEach(sp => uniqueSpeakers.add(sp)));

  if (isPunk) {
    // Official Top Banner from reference design (unclipped)
    if (posterAssets.topBanner && posterAssets.topBanner.complete && posterAssets.topBanner.naturalWidth > 0) {
      ctx.drawImage(posterAssets.topBanner, 0, 0, width, topBannerH);
    } else {
      const bannerGrad = ctx.createLinearGradient(0, 0, 0, topBannerH);
      bannerGrad.addColorStop(0, '#FF2E93');
      bannerGrad.addColorStop(1, '#E6007A');
      ctx.fillStyle = bannerGrad;
      ctx.fillRect(0, 0, width, topBannerH);
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '900 48px -apple-system, sans-serif';
      ctx.fillText('POD KUANIVAL 狂喜播客节', padX, 120);
    }

    // User Schedule Meta Bar (strictly below top banner so subtitle is NEVER covered)
    const userBarGrad = ctx.createLinearGradient(0, topBannerH, 0, headerH);
    userBarGrad.addColorStop(0, '#C20F63');
    userBarGrad.addColorStop(1, '#990747');
    ctx.fillStyle = userBarGrad;
    ctx.fillRect(0, topBannerH, width, userBarH);

    const userBarY = topBannerH + 6;
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '900 30px -apple-system, "PingFang SC", sans-serif';
    ctx.fillText(`${userName} 的个人收听计划表`, padX, userBarY + 28);

    ctx.fillStyle = '#FCE7F3';
    ctx.font = '14.5px -apple-system, "PingFang SC", sans-serif';
    ctx.fillText(customSub, padX, userBarY + 54);

    ctx.fillStyle = '#38BDF8';
    ctx.font = 'bold 13px -apple-system, "PingFang SC", sans-serif';
    ctx.fillText('📅 2026年10月25日（周日）08:50–20:50   📍 上海 · CMG融媒影城（1F–3F）', padX, userBarY + 78);

    // Stats Box
    drawRoundedRect(ctx, padX, userBarY + 92, contentW, 42, 8);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.stroke();

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 13px -apple-system, "PingFang SC", sans-serif';
    ctx.fillText(
      `🎧 已选：${items.length} 场对话   |   ⏱️ 累计时长：${(totalMins / 60).toFixed(1)} 小时   |   🎙️ 覆盖主播：${uniqueSpeakers.size} 人`,
      padX + 16,
      userBarY + 118
    );
  } else {
    // Standard themes header
    ctx.fillStyle = th.headerBg;
    ctx.fillRect(0, 0, width, headerH);
    ctx.fillStyle = th.primaryAccent;
    ctx.fillRect(0, headerH - 4, width, 4);

    ctx.save();
    ctx.font = '900 110px -apple-system, "PingFang SC", sans-serif';
    ctx.fillStyle = 'rgba(232, 67, 36, 0.08)';
    ctx.fillText('叁狂+', width - 290, 145);
    ctx.restore();

    drawRoundedRect(ctx, padX, 28, 250, 28, 14);
    ctx.fillStyle = th.primaryAccent;
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 13px -apple-system, "PingFang SC", sans-serif';
    ctx.fillText('第六届狂喜播客节 · 叁狂+ 2026', padX + 14, 47);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = '900 32px -apple-system, "PingFang SC", sans-serif';
    ctx.fillText(`${userName} 的个人收听计划表`, padX, 98);

    ctx.fillStyle = '#D6D3CD';
    ctx.font = '15px -apple-system, "PingFang SC", sans-serif';
    ctx.fillText(customSub, padX, 128);

    ctx.fillStyle = '#F59E0B';
    ctx.font = 'bold 14px -apple-system, "PingFang SC", sans-serif';
    ctx.fillText('📅 2026年10月25日（周日）08:50–20:50   📍 上海 · CMG融媒影城（1F–3F）', padX, 160);

    drawRoundedRect(ctx, padX, 180, contentW, 46, 10);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 14px -apple-system, "PingFang SC", sans-serif';
    ctx.fillText(
      `🎧 必听主选：${primaryCount} 场   |   📌 备选赶场：${backupCount} 场   |   ⏱️ 累计时长：${(totalMins / 60).toFixed(1)} 小时   |   🎙️ 覆盖主播：${uniqueSpeakers.size} 人`,
      padX + 18,
      208
    );
  }

  // 3. Draw Cards
  let curY = headerH + 24;

  if (cardLayouts.length === 0) {
    drawRoundedRect(ctx, padX, curY, contentW, 110, 12);
    ctx.fillStyle = isPunk ? 'rgba(0, 0, 0, 0.05)' : 'rgba(0, 0, 0, 0.06)';
    ctx.fill();
    ctx.fillStyle = isPunk ? '#0F172A' : '#1C1917';
    ctx.font = 'bold 16px -apple-system, sans-serif';
    ctx.fillText('💡 你还没有加入任何场次，可以在主页添加场次或一键规划嘉宾节目单！', padX + 28, curY + 60);
    curY += 130;
  }

  cardLayouts.forEach((layout, idx) => {
    const { item, s, topicLines, spLines, noteLine, transferText, isConflict, cardH, connectorH } = layout;

    if (transferText) {
      drawRoundedRect(ctx, padX + 16, curY, contentW - 32, 26, 6);
      ctx.fillStyle = isConflict ? 'rgba(220, 38, 38, 0.12)' : 'rgba(217, 119, 6, 0.12)';
      ctx.fill();
      ctx.fillStyle = isConflict ? '#DC2626' : '#B45309';
      ctx.font = 'bold 12px -apple-system, "PingFang SC", sans-serif';
      ctx.fillText(transferText, padX + 28, curY + 17);
      curY += connectorH;
    }

    if (isPunk) {
      // ==================== TICKET STUB CARD (狂喜票据样式：锯齿边框 / 副联设计) ====================
      const notchR = 9;
      const cornerR = 8;
      const dividerX = padX + stubW;

      // 1. Draw outer shadow & card base on white background
      ctx.save();
      ctx.shadowColor = 'rgba(15, 23, 42, 0.1)';
      ctx.shadowBlur = 10;
      ctx.shadowOffsetY = 3;
      drawTicketPath(ctx, padX, curY, contentW, cardH, stubW, notchR, cornerR, true);
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();
      ctx.restore();

      // 2. Stroke ticket outer border
      ctx.save();
      drawTicketPath(ctx, padX, curY, contentW, cardH, stubW, notchR, cornerR, true);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = item.role === 'primary' ? '#E8177B' : '#0284C7';
      ctx.stroke();
      ctx.restore();

      // 3. Stub background (clipped to stub region)
      ctx.save();
      ctx.save();
      ctx.beginPath();
      ctx.rect(padX, curY, stubW, cardH);
      ctx.clip();
      drawTicketPath(ctx, padX, curY, contentW, cardH, stubW, notchR, cornerR, true);
      ctx.clip();

      if (item.role === 'primary') {
        const stubGrad = ctx.createLinearGradient(padX, curY, padX + stubW, curY + cardH);
        stubGrad.addColorStop(0, '#FF2E93');
        stubGrad.addColorStop(1, '#C20062');
        ctx.fillStyle = stubGrad;
      } else {
        const stubGrad = ctx.createLinearGradient(padX, curY, padX + stubW, curY + cardH);
        stubGrad.addColorStop(0, '#0284C7');
        stubGrad.addColorStop(1, '#0369A1');
        ctx.fillStyle = stubGrad;
      }
      ctx.fillRect(padX, curY, stubW, cardH);
      ctx.restore();

      // 4. Perforated dashed line at divider
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.22)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(dividerX, curY + notchR + 2);
      ctx.lineTo(dividerX, curY + cardH - notchR - 2);
      ctx.stroke();
      ctx.restore();

      // 5. Left Stub (副联) Content
      const stubCenterX = padX + (stubW / 2);
      ctx.textAlign = 'center';

      // Top: Stub tag
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.font = 'bold 11px "JetBrains Mono", sans-serif';
      ctx.fillText('★ 狂喜票根', stubCenterX, curY + 22);

      // Venue in Left Stub (Handled cleanly for roundtables & halls)
      ctx.fillStyle = '#FFFFFF';
      if (s.isRoundtable || s.venueShort.includes('圆桌')) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.font = 'bold 12px -apple-system, "PingFang SC", sans-serif';
        ctx.fillText(`${s.floor} · ${s.code}`, stubCenterX, curY + 44);

        const rtName = s.venue.includes('狂喜圆桌')
          ? s.venue.replace(/^(一楼|二楼|三楼|二楼休息室)/, '').replace(/[「」]/g, '')
          : s.venueShort;
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '900 16.5px -apple-system, "PingFang SC", sans-serif';
        ctx.fillText(rtName, stubCenterX, curY + 64);

        ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
        ctx.font = 'bold 14px "JetBrains Mono", Menlo, monospace';
        ctx.fillText(s.start, stubCenterX, curY + 86);
      } else {
        ctx.font = '900 20px -apple-system, "PingFang SC", sans-serif';
        ctx.fillText(s.venueShort, stubCenterX, curY + 48);

        ctx.fillStyle = 'rgba(255, 255, 255, 0.88)';
        ctx.font = 'bold 13px -apple-system, "PingFang SC", sans-serif';
        ctx.fillText(`${s.floor} · ${s.code}`, stubCenterX, curY + 70);

        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 15px "JetBrains Mono", Menlo, monospace';
        ctx.fillText(s.start, stubCenterX, curY + 92);
      }

      // Barcode decoration at bottom of stub
      const barY = curY + cardH - 18;
      const barStartX = padX + 15;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
      const barWidths = [3, 1.5, 4, 1.5, 2.5, 4, 1.5, 3, 2, 4, 1.5, 3];
      barWidths.forEach((bw, bi) => {
        ctx.fillRect(barStartX + bi * 7.5, barY, bw, 10);
      });
      ctx.textAlign = 'left'; // Reset

      // 6. Right Main Body (主联) Content
      const mainX = dividerX + 18;
      let innerY = curY + 26;

      // Time range + Duration pill
      ctx.fillStyle = item.role === 'primary' ? '#E8177B' : '#0284C7';
      ctx.font = 'bold 16px "JetBrains Mono", Menlo, monospace';
      ctx.fillText(`${s.time} (${s.durationMin}m)`, mainX, innerY);

      // Venue full text right aligned
      const venueStr = `📍 ${s.venue}`;
      ctx.font = 'bold 13px -apple-system, "PingFang SC", sans-serif';
      const vWidth = ctx.measureText(venueStr).width;
      ctx.fillStyle = '#64748B';
      ctx.fillText(venueStr, padX + contentW - vWidth - 18, innerY);

      // Topic title
      innerY += 30;
      ctx.fillStyle = '#0F172A';
      ctx.font = '900 19px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
      topicLines.forEach(line => {
        ctx.fillText(line, mainX, innerY);
        innerY += 28;
      });

      // Speakers
      innerY += 3;
      ctx.fillStyle = '#475569';
      ctx.font = '14px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
      spLines.forEach(line => {
        ctx.fillText(line, mainX, innerY);
        innerY += 22;
      });

      // Personal note (if present)
      if (noteLine) {
        innerY += 4;
        ctx.fillStyle = '#E8177B';
        ctx.font = 'bold 12.5px -apple-system, "PingFang SC", sans-serif';
        ctx.fillText(noteLine.slice(0, 56), mainX, innerY);
      }

      // Ticket serial number at bottom right of card
      const serialStr = `TICKET NO. 2026-KUAN-${String(idx + 1).padStart(2, '0')}`;
      ctx.font = 'bold 10.5px "JetBrains Mono", Menlo, monospace';
      const sWidth = ctx.measureText(serialStr).width;
      ctx.fillStyle = '#94A3B8';
      ctx.fillText(serialStr, padX + contentW - sWidth - 18, curY + cardH - 10);
    } else {
      // Standard Cards for festival, paper
      drawRoundedRect(ctx, padX, curY, contentW, cardH, 12);
      ctx.fillStyle = item.role === 'primary' ? th.cardBg : th.cardBackupBg;
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = item.role === 'primary' ? th.cardBorder : th.secondaryAccent;
      ctx.stroke();

      drawRoundedRect(ctx, padX, curY, 6, cardH, 3);
      ctx.fillStyle = item.role === 'primary' ? th.primaryAccent : th.secondaryAccent;
      ctx.fill();

      let innerY = curY + 28;
      ctx.fillStyle = item.role === 'primary' ? th.primaryAccent : th.secondaryAccent;
      ctx.font = 'bold 17px "JetBrains Mono", Menlo, monospace';
      ctx.fillText(`${s.time}`, padX + 20, innerY);

      ctx.fillStyle = th.textMain;
      ctx.font = 'bold 16px "JetBrains Mono", Menlo, monospace';
      ctx.fillText(`${s.code}`, padX + 135, innerY);

      const roleText = item.role === 'primary' ? '★ 必听主选' : '📌 备选/赶场';
      drawRoundedRect(ctx, padX + 195, innerY - 16, 88, 22, 6);
      ctx.fillStyle = item.role === 'primary' ? th.badgeBg : 'rgba(245, 158, 11, 0.2)';
      ctx.fill();
      ctx.fillStyle = item.role === 'primary' ? th.badgeText : th.secondaryAccent;
      ctx.font = 'bold 12px -apple-system, "PingFang SC", sans-serif';
      ctx.fillText(roleText, padX + 204, innerY - 1);

      const venueStr = `📍 ${s.venue}`;
      ctx.font = 'bold 14px -apple-system, "PingFang SC", sans-serif';
      const vWidth = ctx.measureText(venueStr).width;
      ctx.fillStyle = th.textSub;
      ctx.fillText(venueStr, padX + contentW - vWidth - 20, innerY);

      innerY += 32;
      ctx.fillStyle = th.textMain;
      ctx.font = 'bold 20px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
      topicLines.forEach(line => {
        ctx.fillText(line, padX + 20, innerY);
        innerY += 28;
      });

      innerY += 2;
      ctx.fillStyle = th.textSub;
      ctx.font = '15px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
      spLines.forEach(line => {
        ctx.fillText(line, padX + 20, innerY);
        innerY += 22;
      });

      if (noteLine) {
        innerY += 4;
        ctx.fillStyle = th.secondaryAccent;
        ctx.font = 'bold 13px -apple-system, "PingFang SC", sans-serif';
        ctx.fillText(noteLine.slice(0, 56), padX + 20, innerY);
      }
    }

    curY += cardH + 18;
  });

  // 4. Footer Section (Partners & Ticket QR Code)
  if (showPartners) {
    const venueBarY = totalHeight - footerH + 10;
    
    // Floor quick guide line
    drawRoundedRect(ctx, padX, venueBarY, contentW, 32, 8);
    ctx.fillStyle = (isPunk || themeKey === 'festival') ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)';
    ctx.fill();

    ctx.fillStyle = (isPunk || themeKey === 'festival') ? '#E2E8F0' : '#475569';
    ctx.font = 'bold 12.5px -apple-system, "PingFang SC", sans-serif';
    ctx.fillText('🏛️ 场馆速查：一楼 (1–5号厅、狂喜圆桌A) ｜ 二楼 (狂喜圆桌B、圆桌C) ｜ 三楼 (6–8号厅)', padX + 14, venueBarY + 21);

    // Official Footer Image with partners and QR code
    const footerImgY = totalHeight - footerImgH;
    if (posterAssets.footer && posterAssets.footer.complete && posterAssets.footer.naturalWidth > 0) {
      ctx.drawImage(posterAssets.footer, 0, footerImgY, width, footerImgH);
    } else {
      ctx.fillStyle = '#060A18';
      ctx.fillRect(0, footerImgY, width, footerImgH);
    }
  } else {
    // Simple minimalist footer
    const footerY = totalHeight - footerH + 15;
    ctx.strokeStyle = th.cardBorder || 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padX, footerY);
    ctx.lineTo(width - padX, footerY);
    ctx.stroke();

    ctx.fillStyle = isPunk ? '#94A3B8' : th.textSub;
    ctx.font = 'bold 13px -apple-system, "PingFang SC", sans-serif';
    ctx.fillText('🏛️ 场馆楼层速查：一楼 (1–5号厅、狂喜圆桌A) ｜ 二楼 (狂喜圆桌B、休息室圆桌C) ｜ 三楼 (6–8号厅)', padX, footerY + 30);

    ctx.fillStyle = isPunk ? '#64748B' : th.textMuted;
    ctx.font = '12px -apple-system, "PingFang SC", sans-serif';
    ctx.fillText('由「第六届狂喜播客节·叁狂+ 个人收听规划系统」生成 · 2026年10月25日 上海·CMG融媒影城不见不散', padX, footerY + 56);
  }

  // Sync canvas to <img> for mobile long-press save support
  const previewImg = document.getElementById('schedulePosterImg');
  if (previewImg) {
    try {
      previewImg.src = canvas.toDataURL('image/png');
    } catch (e) {
      console.warn('Failed to sync poster image preview:', e);
    }
  }
}

// ==================== DOWNLOAD / EXPORT FUNCTIONS ====================

// 1. Download High-DPI JPG Poster (Default Recommended)
function downloadPosterJpg(quality = 0.95) {
  renderSchedulePosterCanvas();
  const canvas = document.getElementById('schedulePosterCanvas');
  const userName = (document.getElementById('posterUserName')?.value || '狂喜听友').trim();
  const link = document.createElement('a');
  link.download = `第六届狂喜播客节_叁狂+_${userName}_个人收听计划表.jpg`;
  link.href = canvas.toDataURL('image/jpeg', quality);
  link.click();
  showToast('🖼️ 高清收听计划表长图 (.JPG) 已开始下载！手机端亦可长按图片保存到相册。');
}

// 2. Download High-DPI PNG Poster
function downloadPosterPng() {
  renderSchedulePosterCanvas();
  const canvas = document.getElementById('schedulePosterCanvas');
  const userName = (document.getElementById('posterUserName')?.value || '狂喜听友').trim();
  const link = document.createElement('a');
  link.download = `第六届狂喜播客节_叁狂+_${userName}_个人收听计划表.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
  showToast('🖼️ 无损收听计划表长图 (.PNG) 已开始下载！');
}

// 2. Download ICS Calendar File
function downloadIcsCalendar() {
  const items = getPlannedItemsForExport();
  if (items.length === 0) {
    showToast('请先添加至少一场节目到计划表');
    return;
  }

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//KuangXi Podcast Festival 2026//CN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:第六届狂喜播客节·叁狂+ 个人收听计划',
    'X-WR-TIMEZONE:Asia/Shanghai'
  ];

  items.forEach(({ role, note, session: s }) => {
    const startCompact = s.start.replace(':', '') + '00';
    const endCompact = s.end.replace(':', '') + '00';
    const rolePrefix = role === 'primary' ? '【必听】' : '【备选】';
    const summary = `${rolePrefix}${s.code} ${s.topic}`;
    const descParts = [
      `场号：${s.code}`,
      `时间：2026年10月25日 ${s.time}`,
      `地点：上海·CMG融媒影城 ${s.venue}`,
      `嘉宾：${s.speakers.join('、') || '虚位以待'}`,
      `类型：${role === 'primary' ? '必听主选' : '备选/赶场'}`
    ];
    if (note) descParts.push(`个人备注：${note}`);

    lines.push(
      'BEGIN:VEVENT',
      `UID:kuangxi2026-session-${s.seq}@podcastfestival.cn`,
      `DTSTAMP:20261022T000000Z`,
      `DTSTART;TZID=Asia/Shanghai:20261025T${startCompact}`,
      `DTEND;TZID=Asia/Shanghai:20261025T${endCompact}`,
      `SUMMARY:${escapeIcsText(summary)}`,
      `LOCATION:${escapeIcsText('上海·CMG融媒影城 ' + s.venue)}`,
      `DESCRIPTION:${escapeIcsText(descParts.join('\\n'))}`,
      'BEGIN:VALARM',
      'TRIGGER:-PT10M',
      'ACTION:DISPLAY',
      'DESCRIPTION:狂喜播客节场次即将开始',
      'END:VALARM',
      'END:VEVENT'
    );
  });

  lines.push('END:VCALENDAR');

  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = '第六届狂喜播客节_叁狂+_个人收听日历.ics';
  a.click();
  URL.revokeObjectURL(url);
  showToast('📅 日历文件 (.ICS) 已下载，可直接导入手机/电脑日历！');
}

// 3. Download Personal CSV Spreadsheet
function downloadPersonalCsv() {
  const items = getPlannedItemsForExport();
  if (items.length === 0) {
    showToast('请先添加至少一场节目到计划表');
    return;
  }

  const headers = ['规划类型', '场号', '时间', '时长(分钟)', '楼层', '地点', '话题', '主播与嘉宾', '时间冲突与换场提醒', '个人备注'];
  const rows = [headers];

  items.forEach((item, idx) => {
    const s = item.session;
    let transferNote = '无冲突';
    if (idx > 0) {
      const prev = items[idx - 1].session;
      const overlap = getOverlapMinutes(prev, s);
      if (overlap > 0) {
        transferNote = `⚡ 与 ${prev.code} 重叠 ${overlap} 分钟 (${getOverlapWindowStr(prev, s)})`;
      } else if (s.startMin - prev.endMin <= 15) {
        transferNote = `🏃 距上一场间隔 ${s.startMin - prev.endMin} 分钟 (${prev.venueShort} -> ${s.venueShort})`;
      }
    }

    rows.push([
      item.role === 'primary' ? '必听主选' : '备选/赶场',
      s.code,
      s.time,
      String(s.durationMin),
      s.floor,
      s.venue,
      s.topic,
      s.speakers.join(' / ') || '虚位以待',
      transferNote,
      item.note || ''
    ]);
  });

  const csvContent = '\uFEFF' + rows.map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = '第六届狂喜播客节_叁狂+_个人收听计划表.csv';
  a.click();
  URL.revokeObjectURL(url);
  showToast('📊 个人收听计划表 (.CSV) 已下载！');
}

// 4. Copy Formatted Share Text
function copyShareText() {
  const items = getPlannedItemsForExport();
  const userName = (document.getElementById('posterUserName')?.value || '狂喜听友').trim();
  const lines = [
    `🎧 【第六届狂喜播客节·叁狂+】${userName} 的个人收听计划表`,
    `📅 2026年10月25日（周日）｜📍 上海·CMG融媒影城`,
    `----------------------------------------`
  ];

  items.forEach(({ role, note, session: s }) => {
    const tag = role === 'primary' ? '★[必听]' : '📌[备选]';
    lines.push(`${tag} ${s.time} ${s.code}｜📍${s.venue}`);
    lines.push(`   《${s.topic}》`);
    lines.push(`   🎙️ 嘉宾：${s.speakers.join('、') || '虚位以待'}${note ? ` ｜ 📝 ${note}` : ''}`);
    lines.push('');
  });

  const text = lines.join('\n');
  navigator.clipboard.writeText(text).then(() => {
    showToast('📋 已复制文字版计划表到剪贴板，可直接粘贴分享！');
  }).catch(() => {
    showToast('复制失败，请手动选择复制');
  });
}

// 5. Print / Save as PDF
function printPersonalSchedule() {
  window.print();
}

// ==================== UTILITIES ====================
function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(str) {
  return String(str || '')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '&quot;');
}

function escapeIcsText(str) {
  return String(str || '')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

document.addEventListener('DOMContentLoaded', initApp);
