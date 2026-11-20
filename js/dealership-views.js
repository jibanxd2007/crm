   /**
 * MetaCRM — Nova Autos NZ Dealership Product UX Layer (v3.0)
 * Cohesive, workflow-driven screens for Overview, Flagship Inbox, Leads,
 * Pipeline, Tasks & Appointments, Marketing / Meta, and Business Reports.
 *
 * Preserves all backend APIs, RBAC isolation, sender locks, drafts, NZD
 * formatting, Pacific/Auckland dates, Zernio integration, and Electron bridge.
 */
(function () {
  'use strict';

  if (typeof MetaCRMApp === 'undefined') return;

  const esc = (str) => {
    if (typeof escapeHtml === 'function') return escapeHtml(str);
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  // Clean Lucide-style SVG icon set (zero UI emojis)
  const DS_ICONS = {
    reply: '<path d="M9 17 4 12l5-5"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/>',
    car: '<path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
    clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    filter: '<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>',
    paperclip: '<path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>',
    send: '<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>',
    message: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    sliders: '<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>',
    check: '<polyline points="20 6 9 17 4 12"/>',
    alert: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
    refresh: '<path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 21h5v-5"/>',
    plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
    arrowRight: '<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>',
    arrowLeft: '<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>',
    user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    panelRight: '<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="15" y1="3" x2="15" y2="21"/>',
    more: '<circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/><circle cx="5" cy="12" r="1.5"/>',
    phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>',
    layers: '<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>',
    bookmark: '<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/>',
    lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    external: '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>',
    checkCircle: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    inbox: '<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>'
  };

  const PAGE_PALETTES = [
    { bg: '#EEE9FC', fg: '#5B47B8' },
    { bg: '#F4F4F6', fg: '#3F3F46' },
    { bg: '#ECFDF5', fg: '#157A50' },
    { bg: '#FEF7EC', fg: '#9A5B13' },
    { bg: '#F3F0FF', fg: '#6D28D9' },
    { bg: '#EFF6FF', fg: '#1E40AF' }
  ];

  const proto = MetaCRMApp.prototype;

  proto._dsIcon = function (name, size = 15) {
    const inner = DS_ICONS[name] || DS_ICONS.message;
    return `<svg width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" aria-hidden="true">${inner}</svg>`;
  };

  proto._dsPagePalette = function (pageName) {
    const str = String(pageName || 'Page');
    let h = 0;
    for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
    return PAGE_PALETTES[Math.abs(h) % PAGE_PALETTES.length];
  };

  proto._dsPageInitials = function (pageName) {
    const words = String(pageName || 'PG').trim().split(/[\s\-_']+/).filter(Boolean);
    if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
    return String(pageName || 'PG').slice(0, 2).toUpperCase();
  };

  proto._dsPageAvatar = function (pageName, channel = 'facebook', size = 'md') {
    const pal = this._dsPagePalette(pageName);
    const initials = this._dsPageInitials(pageName);
    const isIg = String(channel || '').toLowerCase().includes('insta');
    const dotChar = isIg ? 'I' : 'f';
    return `
      <span class="ds-page-avatar ${size === 'sm' ? 'sm' : ''}" style="background:${pal.bg};color:${pal.fg};" title="${esc(pageName)} (${isIg ? 'Instagram' : 'Facebook'})">
        ${esc(initials)}
        <span class="ds-page-channel-dot ${isIg ? 'ig' : 'fb'}">${dotChar}</span>
      </span>`;
  };

  proto._dsStagePill = function (status) {
    const s = String(status || 'New Lead');
    const l = s.toLowerCase();
    let cls = 'ds-pill-neutral';
    if (l.includes('new')) cls = 'ds-pill-info';
    else if (l.includes('contact')) cls = 'ds-pill-warning';
    else if (l.includes('qual')) cls = 'ds-pill-accent';
    else if (l.includes('follow')) cls = 'ds-pill-warning';
    else if (l.includes('won') || l.includes('sold') || l.includes('convert')) cls = 'ds-pill-success';
    else if (l.includes('lost') || l.includes('invalid')) cls = 'ds-pill-danger';
    const label = (l === 'won' || l === 'converted') ? 'Sold' : s;
    return `<span class="ds-pill ${cls}">${esc(label)}</span>`;
  };

  proto._dsFinancePill = function (financeStatus, paymentPref) {
    const fs = String(financeStatus || '').trim();
    const pp = String(paymentPref || '').trim();
    if (fs) {
      const fl = fs.toLowerCase();
      const cls = fl.includes('approv') ? 'ds-pill-success'
        : fl.includes('declin') ? 'ds-pill-danger'
        : fl.includes('appli') || fl.includes('pend') ? 'ds-pill-warning'
        : 'ds-pill-neutral';
      return `<span class="ds-pill ${cls}">Finance: ${esc(fs)}</span>`;
    }
    if (pp) {
      const pl = pp.toLowerCase();
      return `<span class="ds-pill ${pl.includes('cash') ? 'ds-pill-neutral' : 'ds-pill-info'}">${esc(pp)}</span>`;
    }
    return '';
  };

  proto._dsConvNeedsReply = function (c) {
    if (!c || c.is_archived) return false;
    if (Array.isArray(c.messages) && c.messages.length > 0) {
      const last = c.messages[c.messages.length - 1];
      return last.incoming === true || last.sender_type === 'customer' || last.direction === 'inbound';
    }
    const prev = String(c.preview || c.last_message || '');
    return !prev.startsWith('You:');
  };

  proto._dsNormPage = function (id) {
    if (!id) return '';
    if (this.svc && typeof this.svc.resolveCanonicalPageId === 'function') {
      return this.svc.resolveCanonicalPageId(id);
    }
    return String(id).trim();
  };

  proto._dsConvMatchesPage = function (c, pageId) {
    if (!pageId || pageId === 'all') return true;
    const t = this._dsNormPage(pageId);
    return t === this._dsNormPage(c.page_id) || t === this._dsNormPage(c.accountId) || t === this._dsNormPage(c.pageId);
  };

  // Persistent cross-screen navigation: jump directly from Overview/Leads/Tasks to exact Inbox thread
  proto.openConversationInInbox = function (convId, pageId = null) {
    if (convId) this.activeConvId = String(convId);
    if (pageId) {
      this.selectedInboxPage = String(pageId);
      try { localStorage.setItem('metacrm_inbox_page_filter', this.selectedInboxPage); } catch (e) {}
    }
    this.mobileInboxView = 'chat';
    this.navigate('inbox');
  };

  proto.openPageInInbox = function (pageId) {
    this.selectedInboxPage = String(pageId || 'all');
    try { localStorage.setItem('metacrm_inbox_page_filter', this.selectedInboxPage); } catch (e) {}
    this.inboxTab = 'all';
    this.mobileInboxView = 'list';
    this.navigate('inbox');
  };

  // Preserve scroll positions across view switches
  const origNavigate = proto.navigate;
  proto.navigate = function (path) {
    this._scrollPositions = this._scrollPositions || {};
    if (this.currentRoute && this.el && this.el.content) {
      this._scrollPositions[this.currentRoute] = this.el.content.scrollTop || 0;
    }
    return origNavigate.call(this, path);
  };

  // ==========================================================================
  // 1. OVERVIEW — "MY DAY" (STAFF) / "DEALERSHIP PULSE" (MANAGER)
  // ==========================================================================
  proto.renderDashboard = function () {
    if (!this.user) return;
    if (this.el.content) this.el.content.classList.remove('inbox-view-container');

    const isAdmin = this.user.role === 'admin' || this.user.role === 'super_admin';
    if (isAdmin && !this._loadedBizStatus && this.svc && this.svc.fetchBusinessStatus) {
      this._loadedBizStatus = true;
      this.svc.fetchBusinessStatus().then(s => {
        this.businessStatusCache = s;
        if (this.currentRoute === 'dashboard') this.renderDashboard();
      }).catch(() => {});
    }
    if (!this._fetchedServerConvs && this.svc && this.svc.fetchRemoteConversations) {
      this._fetchedServerConvs = true;
      this.svc.fetchRemoteConversations().then(() => {
        if (this.currentRoute === 'dashboard') this.renderDashboard();
      }).catch(() => {});
    }

    const availablePages = this._getAccessiblePages ? this._getAccessiblePages() : [];
    const userPageNorms = new Set(availablePages.map(p => this._dsNormPage(p.id || p.page_id)));

    const allConvs = (this.svc ? (this.svc.conversations || []) : []).filter(c => {
      if (c.is_archived) return false;
      if (isAdmin) return true;
      const cn = this._dsNormPage(c.page_id || c.accountId || c.pageId);
      return !cn || userPageNorms.has(cn);
    });
    const waitingConvs = allConvs
      .filter(c => this._dsConvNeedsReply(c))
      .sort((a, b) => new Date(b.last_message_at || 0) - new Date(a.last_message_at || 0));

    const allLeads = this._getFilteredLeads ? this._getFilteredLeads(false) : (this.svc ? (this.svc.leads || []) : []);
    const activeDeals = allLeads.filter(l => !['Won', 'Converted', 'Sold', 'Lost', 'Invalid'].includes(l.status));
    const unassignedLeads = activeDeals.filter(l => !(l.assigned_staff_id || l.assignedStaffId || l.assigned_to));
    const pipelineValueNzd = activeDeals.reduce((s, l) => s + Number(l.sale_value_nzd || l.budget_nzd || l.value || l.dealValue || 0), 0);

    const allTasks = this._filterUserTasks ? this._filterUserTasks(this.svc ? this.svc.tasks : []) : [];
    const pendingTasks = allTasks.filter(t => t.status !== 'Done');
    const todayNZ = this._getNZDate(new Date());
    const nowMs = Date.now();
    const dueOrOverdueTasks = pendingTasks.filter(t => !t.dueDate || this._getNZDate(t.dueDate) <= todayNZ || new Date(t.dueDate).getTime() <= nowMs);
    const todayVisits = pendingTasks.filter(t => t.type === 'appointment' && t.dueDate && this._getNZDate(t.dueDate) === todayNZ);

    const dealsNeedingAction = activeDeals.filter(l => {
      const nextAt = l.next_action_at || l.follow_up_date || l.followUpDate;
      return !nextAt || new Date(nextAt).getTime() <= nowMs + 24 * 3600 * 1000;
    }).slice(0, 6);

    const bizStatus = isAdmin ? (this.businessStatusCache || null) : null;
    const businessNotice = bizStatus?.notice || null;
    const needsReconnect = Boolean(bizStatus?.needsReconnect);

    // Quiet, focused topbar
    this.el.title.innerHTML = `<h1 class="topbar-title">${isAdmin ? 'Dealership Overview' : 'My Day'}</h1>`;
    this.el.actions.innerHTML = `
      <button type="button" class="btn btn-secondary btn-sm" onclick="window.app.refreshDashboardData(true)">
        ${this._dsIcon('refresh', 14)}<span>Refresh</span>
      </button>
      <button type="button" class="btn btn-primary btn-sm" onclick="window.app.openAddLeadModal()">
        ${this._dsIcon('plus', 14)}<span>New Enquiry</span>
      </button>`;

    const avatarEl = document.getElementById('topbar-avatar');
    if (avatarEl) avatarEl.textContent = (this.user.displayName || this.user.name || 'U').charAt(0).toUpperCase();

    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    const soldDealsCount = allLeads.filter(l => ['Won', 'Converted', 'Sold'].includes(l.status)).length;
    const workloadTotal = Math.max(1, waitingConvs.length + activeDeals.length + soldDealsCount);
    const segWait = Math.round((waitingConvs.length / workloadTotal) * 100);
    const segActive = Math.round((activeDeals.length / workloadTotal) * 100);
    const segSold = Math.max(0, 100 - segWait - segActive);

    // Per-page waiting breakdown for the right-hand activity chart
    const pagePulse = availablePages.slice(0, 6).map(p => {
      const pid = p.id || p.page_id;
      const wCnt = waitingConvs.filter(c => this._dsConvMatchesPage(c, pid)).length;
      const lCnt = allLeads.filter(l => this._dsNormPage(l.page_id || l.pageId) === this._dsNormPage(pid)).length;
      return { id: pid, name: p.name, waiting: wCnt, leads: lCnt, total: wCnt + lCnt };
    });
    const maxPulse = Math.max(1, ...pagePulse.map(x => x.total));

    this.el.content.innerHTML = `
      <div style="max-width:1360px;margin:0 auto;">
        <div class="ds-page-header">
          <div>
            <h2 class="ds-page-h1">${greeting}, ${esc(this.user.displayName || this.user.name || 'Team')}</h2>
            <p class="ds-page-sub">
              ${isAdmin ? `Monitoring ${availablePages.length} authorised dealership pages · New Zealand time (Pacific/Auckland)` : `Your assigned pages & daily priorities · New Zealand time (Pacific/Auckland)`}
            </p>
          </div>
          ${businessNotice && isAdmin ? `
            <div style="display:flex;align-items:center;gap:10px;padding:8px 14px;background:var(--ds-warning-bg);border:1px solid var(--ds-warning-border);border-radius:8px;font-size:13px;color:var(--ds-warning-text);">
              ${this._dsIcon('alert', 15)}
              <span>${esc(businessNotice)}</span>
              ${needsReconnect ? `<button type="button" class="btn btn-secondary btn-xs" onclick="window.app.settingsTab='accounts';window.app.navigate('settings');">Reconnect Facebook</button>` : ''}
            </div>
          ` : ''}
        </div>

        <!-- REFERENCE-ALIGNED BENTO SUMMARY ROW -->
        <div class="ds-bento-top">
          <!-- Card 1: Enquiry Status + Lavender Segmented Strip -->
          <div class="ds-bento-card">
            <div class="ds-bento-head">
              <span class="ds-bento-title">${this._dsIcon('message', 15)}<span>Enquiry workload</span></span>
              <button type="button" class="btn btn-ghost btn-xs" onclick="window.app.inboxTab='needs_reply';window.app.navigate('inbox');">Open Inbox →</button>
            </div>
            <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-bottom:16px;">
              <div style="cursor:pointer;" onclick="window.app.inboxTab='needs_reply';window.app.navigate('inbox');">
                <div style="font-size:24px;font-weight:700;color:var(--ds-ink);letter-spacing:-0.02em;line-height:1.2;">${waitingConvs.length}</div>
                <div style="font-size:12.5px;color:var(--ds-ink-muted);margin-top:2px;">Waiting reply</div>
              </div>
              <div style="cursor:pointer;" onclick="window.app.leadSavedView='${isAdmin ? 'unassigned' : 'all'}';window.app.navigate('leads');">
                <div style="font-size:24px;font-weight:700;color:var(--ds-ink);letter-spacing:-0.02em;line-height:1.2;">${isAdmin ? unassignedLeads.length : activeDeals.length}</div>
                <div style="font-size:12.5px;color:var(--ds-ink-muted);margin-top:2px;">${isAdmin ? 'Unassigned' : 'Active deals'}</div>
              </div>
              <div style="cursor:pointer;" onclick="window.app.leadSavedView='sold';window.app.navigate('leads');">
                <div style="font-size:24px;font-weight:700;color:var(--ds-ink);letter-spacing:-0.02em;line-height:1.2;">${soldDealsCount}</div>
                <div style="font-size:12.5px;color:var(--ds-ink-muted);margin-top:2px;">Vehicles sold</div>
              </div>
            </div>
            <div>
              <div class="ds-lavender-strip" aria-hidden="true">
                ${waitingConvs.length + activeDeals.length + soldDealsCount === 0 ? `
                  <div class="ds-lavender-seg" style="width:100%;background:#EEE9FC;"></div>
                ` : `
                  ${segWait > 0 ? `<div class="ds-lavender-seg" style="width:${Math.max(12, segWait)}%;background:#7A68D8;"></div>` : ''}
                  ${segActive > 0 ? `<div class="ds-lavender-seg" style="width:${Math.max(10, segActive)}%;background:#A899EB;"></div>` : ''}
                  ${segSold > 0 ? `<div class="ds-lavender-seg" style="width:${Math.max(8, segSold)}%;background:#D5CCF8;"></div>` : ''}
                  <div class="ds-lavender-seg" style="flex:1;background:#EEE9FC;"></div>
                `}
              </div>
              <div style="display:flex;justify-content:space-between;font-size:11.5px;color:var(--ds-ink-muted);margin-top:6px;">
                <span>${waitingConvs.length > 0 ? `${waitingConvs.length} customer messages waiting` : 'All conversations answered'}</span>
                <span>${activeDeals.length} open</span>
              </div>
            </div>
          </div>

          <!-- Card 2: Stacked Follow-ups & Open Pipeline NZD -->
          <div class="ds-bento-stack">
            <div class="ds-bento-card" style="cursor:pointer;flex:1;" onclick="window.app.navigate('tasks');">
              <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
                <div>
                  <div style="display:flex;align-items:center;gap:6px;font-size:13px;font-weight:500;color:var(--ds-ink-muted);">${this._dsIcon('calendar', 14)}<span>Follow-ups &amp; visits</span></div>
                  <div style="font-size:24px;font-weight:700;color:var(--ds-ink);letter-spacing:-0.02em;margin-top:4px;">${dueOrOverdueTasks.length}</div>
                  <div style="font-size:12px;color:${todayVisits.length > 0 ? 'var(--ds-success-text)' : 'var(--ds-ink-muted)'};margin-top:2px;">${todayVisits.length > 0 ? `${todayVisits.length} yard visit${todayVisits.length > 1 ? 's' : ''} today` : 'No yard visits today'}</div>
                </div>
                <svg width="68" height="36" viewBox="0 0 68 36" fill="none" aria-hidden="true">
                  <rect x="4" y="20" width="6" height="14" rx="2" fill="#EEE9FC"/>
                  <rect x="14" y="14" width="6" height="20" rx="2" fill="#D5CCF8"/>
                  <rect x="24" y="22" width="6" height="12" rx="2" fill="#EEE9FC"/>
                  <rect x="34" y="10" width="6" height="24" rx="2" fill="#8B7AE0"/>
                  <rect x="44" y="16" width="6" height="18" rx="2" fill="#D5CCF8"/>
                  <rect x="54" y="6" width="6" height="28" rx="2" fill="#E99A36"/>
                </svg>
              </div>
            </div>

            <div class="ds-bento-card" style="cursor:pointer;flex:1;" onclick="window.app.navigate('pipeline');">
              <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
                <div>
                  <div style="display:flex;align-items:center;gap:6px;font-size:13px;font-weight:500;color:var(--ds-ink-muted);">${this._dsIcon('layers', 14)}<span>Open pipeline (NZD)</span></div>
                  <div style="font-size:22px;font-weight:700;color:var(--ds-ink);letter-spacing:-0.02em;margin-top:4px;">${pipelineValueNzd > 0 ? this.formatMoney(pipelineValueNzd) : (activeDeals.length > 0 ? `${activeDeals.length} deals` : 'No data')}</div>
                  <div style="font-size:12px;color:var(--ds-ink-muted);margin-top:2px;">${activeDeals.length} active vehicle enquir${activeDeals.length === 1 ? 'y' : 'ies'}</div>
                </div>
                <svg width="68" height="36" viewBox="0 0 68 36" fill="none" aria-hidden="true">
                  <path d="M4 28 L18 22 L32 25 L48 13 L64 9" stroke="#8B7AE0" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                  <circle cx="48" cy="13" r="3" fill="#8B7AE0"/>
                  <circle cx="64" cy="9" r="3" fill="#22A66F"/>
                </svg>
              </div>
            </div>
          </div>

          <!-- Card 3: Dealership Page Activity Chart -->
          <div class="ds-bento-card">
            <div class="ds-bento-head">
              <span class="ds-bento-title">${this._dsIcon('layers', 15)}<span>Page activity</span></span>
              ${isAdmin ? `<button type="button" class="btn btn-ghost btn-xs" onclick="window.app.settingsTab='accounts';window.app.navigate('settings');">Accounts</button>` : `<span style="font-size:12px;color:var(--ds-ink-muted);">${availablePages.length} assigned</span>`}
            </div>
            ${pagePulse.length === 0 ? `
              <div style="flex:1;display:flex;align-items:center;justify-content:center;text-align:center;color:var(--ds-ink-muted);font-size:13px;padding:12px 0;">
                No dealership pages assigned to your account yet.
              </div>
            ` : `
              <div style="display:flex;flex-direction:column;gap:9px;">
                ${pagePulse.map((p, idx) => {
                  const pct = p.total > 0 ? Math.max(8, Math.round((p.total / maxPulse) * 100)) : 4;
                  const barColor = idx === 0 ? '#8B7AE0' : (idx === 1 ? '#A799EB' : '#C8BEF6');
                  return `
                    <div style="cursor:pointer;" onclick="window.app.openPageInInbox('${esc(p.id)}')">
                      <div style="display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:3px;gap:8px;">
                        <span style="font-weight:500;color:var(--ds-ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(p.name)}</span>
                        <span style="color:var(--ds-ink-muted);white-space:nowrap;">${p.waiting} waiting</span>
                      </div>
                      <div class="ds-bar-track" style="height:6px;"><div class="ds-bar-fill" style="width:${pct}%;background:${barColor};"></div></div>
                    </div>`;
                }).join('')}
              </div>
            `}
          </div>
        </div>

        <!-- 2-COLUMN ACTION WORKBENCH -->
        <div class="ds-overview-grid">
          <!-- LEFT COLUMN: LIVE CUSTOMER WORK -->
          <div style="display:flex;flex-direction:column;gap:18px;">
            <!-- Customers Waiting for Reply -->
            <section class="ds-card">
              <div class="ds-card-header">
                <div>
                  <h3 class="ds-card-title">Customers Waiting for Reply</h3>
                  <div class="ds-card-subtitle">Reply directly from the customer's originating dealership page.</div>
                </div>
                <button type="button" class="btn btn-ghost btn-sm" onclick="window.app.inboxTab='needs_reply';window.app.navigate('inbox');">
                  <span>Open Inbox</span>${this._dsIcon('arrowRight', 14)}
                </button>
              </div>
              ${waitingConvs.length === 0 ? `
                <div style="padding:28px 18px;text-align:center;">
                  <div style="font-size:13.5px;font-weight:600;color:var(--ds-ink);margin-bottom:4px;">All caught up</div>
                  <div style="font-size:12.5px;color:var(--ds-ink-muted);">No unanswered customer conversations across your pages right now.</div>
                </div>
              ` : waitingConvs.slice(0, 6).map(c => {
                const pName = this._pageName(c.page_id || c.accountId || c.pageId);
                const isIg = c.channel && c.channel.toLowerCase().includes('insta');
                return `
                  <div class="ds-queue-row" onclick="window.app.openConversationInInbox('${esc(c.id)}', '${esc(c.page_id || c.accountId || '')}')">
                    <div style="display:flex;align-items:center;gap:12px;min-width:0;flex:1;">
                      ${this._dsPageAvatar(pName, isIg ? 'instagram' : 'facebook')}
                      <div style="min-width:0;flex:1;">
                        <div style="display:flex;align-items:center;gap:8px;">
                          <span style="font-size:13.5px;font-weight:600;color:var(--ds-ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(c.name || 'Customer')}</span>
                          <span class="ds-pill ds-pill-neutral" style="font-size:10.5px;padding:1px 7px;">${esc(pName)}</span>
                        </div>
                        <div style="font-size:12.5px;color:var(--ds-ink-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:2px;">
                          ${esc(c.preview || c.last_message || 'New message')}
                        </div>
                      </div>
                    </div>
                    <div style="display:flex;align-items:center;gap:10px;flex-shrink:0;">
                      <span style="font-size:11.5px;color:var(--ds-ink-muted);white-space:nowrap;">${esc(this._formatMessageTime(c.last_message_at || c.time))}</span>
                      <span class="btn btn-secondary btn-xs">Reply</span>
                    </div>
                  </div>`;
              }).join('')}
            </section>

            <!-- Enquiries & Deals Needing Next Action -->
            <section class="ds-card">
              <div class="ds-card-header">
                <div>
                  <h3 class="ds-card-title">Deals Needing Next Step</h3>
                  <div class="ds-card-subtitle">Active enquiries with a follow-up due or no next step scheduled.</div>
                </div>
                <button type="button" class="btn btn-ghost btn-sm" onclick="window.app.navigate('leads');">
                  <span>All Enquiries</span>${this._dsIcon('arrowRight', 14)}
                </button>
              </div>
              ${dealsNeedingAction.length === 0 ? `
                <div style="padding:28px 18px;text-align:center;">
                  <div style="font-size:13.5px;font-weight:600;color:var(--ds-ink);margin-bottom:4px;">${allLeads.length === 0 ? 'No CRM enquiries yet' : 'Every active deal has a scheduled next step'}</div>
                  <div style="font-size:12.5px;color:var(--ds-ink-muted);margin-bottom:14px;">
                    ${allLeads.length === 0 ? (isAdmin ? 'Convert a customer conversation from Inbox, check Marketing &amp; Meta, or add an enquiry manually.' : 'Convert a customer conversation from Inbox or add an enquiry manually.') : 'Great work keeping your pipeline moving.'}
                  </div>
                  <div style="display:flex;justify-content:center;gap:8px;flex-wrap:wrap;">
                    ${isAdmin ? `<button type="button" class="btn btn-secondary btn-sm" onclick="window.app.syncZernioLeadsFromMarketing()">${this._dsIcon('refresh', 13)}<span>Refresh Ad Leads</span></button>` : ''}
                    <button type="button" class="btn btn-primary btn-sm" onclick="window.app.openAddLeadModal()">${this._dsIcon('plus', 13)}<span>Add Enquiry</span></button>
                  </div>
                </div>
              ` : `
                <div class="ds-table-wrap">
                  <table class="ds-table">
                    <thead>
                      <tr>
                        <th>Customer</th>
                        <th>Vehicle &amp; Page</th>
                        <th>Stage</th>
                        <th>Next Step</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${dealsNeedingAction.map(l => `
                        <tr class="clickable-row" onclick="window.app.openLeadDrawer('${esc(l.id)}')">
                          <td>
                            <div style="font-weight:600;">${esc(l.name || l.full_name || 'Customer')}</div>
                            <div style="font-size:11.5px;color:var(--ds-ink-muted);">${esc(l.phone || l.email || 'No phone')}</div>
                          </td>
                          <td>
                            <div style="font-weight:500;">${esc(l.vehicle_interest || 'Vehicle TBC')}</div>
                            <div style="font-size:11.5px;color:var(--ds-ink-muted);">${esc(this._pageName(l.page_id || l.pageId))}</div>
                          </td>
                          <td>${this._dsStagePill(l.status)}</td>
                          <td style="font-size:12px;color:${l.next_action_at ? 'var(--ds-ink-secondary)' : 'var(--ds-warning)'};font-weight:500;">
                            ${esc(l.next_action_note || 'Set next follow-up')}
                          </td>
                        </tr>`).join('')}
                    </tbody>
                  </table>
                </div>
              `}
            </section>
          </div>

          <!-- RIGHT COLUMN: TODAY'S SCHEDULE & DEALERSHIP PAGES -->
          <div style="display:flex;flex-direction:column;gap:18px;">
            <!-- Today's Schedule -->
            <section class="ds-card">
              <div class="ds-card-header">
                <div>
                  <h3 class="ds-card-title">Today's Schedule</h3>
                  <div class="ds-card-subtitle">Booked yard visits &amp; due callbacks</div>
                </div>
                <button type="button" class="btn btn-secondary btn-xs" onclick="window.app.openBookAppointmentModal()">
                  ${this._dsIcon('calendar', 13)}<span>Book Visit</span>
                </button>
              </div>
              ${dueOrOverdueTasks.length === 0 ? `
                <div style="padding:24px 18px;text-align:center;">
                  <div style="font-size:13px;font-weight:600;color:var(--ds-ink);margin-bottom:4px;">No visits or callbacks due</div>
                  <div style="font-size:12px;color:var(--ds-ink-muted);">Book a yard visit from any customer conversation or lead drawer.</div>
                </div>
              ` : dueOrOverdueTasks.slice(0, 5).map(t => {
                const isAppt = t.type === 'appointment';
                const isOverdue = t.dueDate && new Date(t.dueDate).getTime() < nowMs;
                const dueTxt = t.dueDate ? new Date(t.dueDate).toLocaleString('en-NZ', { timeZone: 'Pacific/Auckland', day: 'numeric', month: 'short', ...(isAppt ? { hour: '2-digit', minute: '2-digit' } : {}) }) : 'Today';
                return `
                  <div class="ds-queue-row" style="cursor:default;">
                    <div style="display:flex;align-items:flex-start;gap:10px;min-width:0;flex:1;">
                      <input type="checkbox" style="margin-top:3px;cursor:pointer;" aria-label="Complete ${esc(t.title)}" onchange="window.app.completeTask('${esc(t.id)}', this)">
                      <div style="min-width:0;">
                        <div style="font-size:13px;font-weight:600;color:var(--ds-ink);">${esc(t.title)}</div>
                        <div style="display:flex;align-items:center;gap:6px;margin-top:3px;flex-wrap:wrap;">
                          <span class="ds-pill ${isAppt ? 'ds-pill-info' : (isOverdue ? 'ds-pill-danger' : 'ds-pill-neutral')}" style="font-size:10.5px;padding:1px 6px;">
                            ${isAppt ? 'Yard Visit' : (isOverdue ? 'Overdue' : 'Follow-up')}
                          </span>
                          <span style="font-size:11.5px;color:var(--ds-ink-muted);">${esc(dueTxt)}</span>
                        </div>
                      </div>
                    </div>
                    ${(t.lead_id || t.leadId) ? `<button type="button" class="btn btn-ghost btn-xs" onclick="window.app.openLeadDrawer('${esc(t.lead_id || t.leadId)}')">Open</button>` : ''}
                  </div>`;
              }).join('')}
            </section>

            <!-- Dealership Pages Directory -->
            <section class="ds-card">
              <div class="ds-card-header">
                <div>
                  <h3 class="ds-card-title">Dealership Pages (${availablePages.length})</h3>
                  <div class="ds-card-subtitle">Jump straight into a brand's inbox</div>
                </div>
                ${isAdmin ? `<button type="button" class="btn btn-ghost btn-xs" onclick="window.app.settingsTab='accounts';window.app.navigate('settings');">Accounts</button>` : ''}
              </div>
              ${availablePages.length === 0 ? `
                <div style="padding:24px 18px;text-align:center;font-size:12.5px;color:var(--ds-ink-muted);">
                  ${isAdmin ? 'Loading connected pages…' : 'No pages assigned to your account yet.'}
                </div>
              ` : availablePages.map(p => {
                const pWait = waitingConvs.filter(c => this._dsConvMatchesPage(c, p.id || p.page_id)).length;
                return `
                  <div class="ds-queue-row" onclick="window.app.openPageInInbox('${esc(p.id || p.page_id)}')">
                    <div style="display:flex;align-items:center;gap:10px;min-width:0;">
                      ${this._dsPageAvatar(p.name, p.channel || p.platform)}
                      <span style="font-size:13px;font-weight:600;color:var(--ds-ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(p.name)}</span>
                    </div>
                    <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
                      ${pWait > 0 ? `<span class="ds-pill ds-pill-accent">${pWait} waiting</span>` : `<span style="font-size:11.5px;color:var(--ds-ink-subtle);">Clear</span>`}
                      <span style="color:var(--ds-ink-subtle);">${this._dsIcon('arrowRight', 13)}</span>
                    </div>
                  </div>`;
              }).join('')}
            </section>
          </div>
        </div>
      </div>`;
  };

  // ==========================================================================
  // 2. FLAGSHIP SCREEN: MULTI-BRAND DEALERSHIP INBOX
  // ==========================================================================
  proto.renderInbox = function () {
    if (!['inbox', 'messages', 'conversations'].includes(this.currentRoute)) return;
    if (!this.user) return;

    this.el.title.innerHTML = `<h1 class="topbar-title">${this.user.role === 'staff' ? 'My Inbox' : 'Inbox'}</h1>`;

    if (!this.selectedInboxPage) {
      try { this.selectedInboxPage = localStorage.getItem('metacrm_inbox_page_filter') || 'all'; } catch (e) { this.selectedInboxPage = 'all'; }
    }
    const accessiblePages = this._getAccessiblePages ? this._getAccessiblePages() : [];
    if (this.selectedInboxPage !== 'all' && !accessiblePages.some(p => this._dsNormPage(p.id || p.page_id) === this._dsNormPage(this.selectedInboxPage))) {
      this.selectedInboxPage = 'all';
    }

    const convs = this.svc ? (this.svc.conversations || []) : [];
    if (!this._fetchedServerConvs && this.svc && this.svc.fetchRemoteConversations) {
      this._fetchedServerConvs = true;
      this.svc.fetchRemoteConversations().then(() => {
        if (this.currentRoute === 'inbox') this.renderInbox();
      });
    }

    const isAdmin = this.user.role === 'admin' || this.user.role === 'super_admin';
    const userPageNorms = new Set(accessiblePages.map(p => this._dsNormPage(p.id || p.page_id)));
    const accessibleConvs = isAdmin ? convs : convs.filter(c => {
      const cn = this._dsNormPage(c.page_id || c.accountId || c.pageId);
      return !cn || userPageNorms.has(cn);
    });

    const allActiveConvs = accessibleConvs.filter(c => !c.is_archived);
    const allUnreadCount = allActiveConvs.filter(c => (c.unread || c.unread_count || 0) > 0).length;

    const pageMetrics = accessiblePages.map(p => {
      const pConvs = allActiveConvs.filter(c => this._dsConvMatchesPage(c, p.id || p.page_id));
      const pUnread = pConvs.filter(c => (c.unread || c.unread_count || 0) > 0).length;
      return { page: p, total: pConvs.length, unread: pUnread };
    });

    // Clean topbar actions (no clutter)
    this.el.actions.innerHTML = `
      <button type="button" class="btn btn-secondary btn-sm" id="btn-inbox-refresh" onclick="window.app.refreshRealInbox()" title="Refresh conversations">
        ${this._dsIcon('refresh', 14)}<span>Refresh</span>
      </button>`;

    if (this.el.content && !this.el.content.classList.contains('inbox-view-container')) {
      this.el.content.classList.add('inbox-view-container');
    }

    let pageScopedConvs = this.selectedInboxPage === 'all'
      ? accessibleConvs
      : accessibleConvs.filter(c => this._dsConvMatchesPage(c, this.selectedInboxPage));

    const sortMode = this.inboxSortMode || 'latest';
    const activeTab = this.inboxTab || 'all';
    const activeNonArchived = pageScopedConvs.filter(c => !c.is_archived);

    const needsReplyCount = activeNonArchived.filter(c => this._dsConvNeedsReply(c)).length;
    const mineCount = activeNonArchived.filter(c => String(c.assigned_staff_id || c.assignedStaffId || c.assigned_to || '') === String(this.user.id)).length;
    const unassignedCount = activeNonArchived.filter(c => !(c.assigned_staff_id || c.assignedStaffId || c.assigned_to)).length;
    const unreadCount = activeNonArchived.filter(c => (c.unread || c.unread_count || 0) > 0).length;
    const archivedCount = pageScopedConvs.filter(c => c.is_archived === true).length;

    let filteredConvs = activeTab === 'archived' ? pageScopedConvs.filter(c => c.is_archived === true) : [...activeNonArchived];
    if (activeTab === 'needs_reply') filteredConvs = filteredConvs.filter(c => this._dsConvNeedsReply(c));
    else if (activeTab === 'mine') filteredConvs = filteredConvs.filter(c => String(c.assigned_staff_id || c.assignedStaffId || c.assigned_to || '') === String(this.user.id));
    else if (activeTab === 'unassigned') filteredConvs = filteredConvs.filter(c => !(c.assigned_staff_id || c.assignedStaffId || c.assigned_to));
    else if (activeTab === 'unread') filteredConvs = filteredConvs.filter(c => (c.unread || c.unread_count || 0) > 0);
    else if (activeTab === 'starred') filteredConvs = filteredConvs.filter(c => c.starred === true);
    else if (activeTab === 'facebook' || activeTab === 'messenger') filteredConvs = filteredConvs.filter(c => !c.channel || !c.channel.toLowerCase().includes('insta'));
    else if (activeTab === 'instagram') filteredConvs = filteredConvs.filter(c => c.channel && c.channel.toLowerCase().includes('insta'));

    if (this.inboxSearchQuery) {
      const q = this.inboxSearchQuery.toLowerCase();
      filteredConvs = filteredConvs.filter(c => `${c.name || ''} ${c.preview || ''} ${c.participantUsername || ''}`.toLowerCase().includes(q));
    }

    filteredConvs.sort((a, b) => {
      const tA = this.svc ? this.svc._resolveConvTimestamp(a) : new Date(a.last_message_at || 0).getTime();
      const tB = this.svc ? this.svc._resolveConvTimestamp(b) : new Date(b.last_message_at || 0).getTime();
      if (sortMode === 'unread') {
        const uDiff = ((b.unread || 0) > 0 ? 1 : 0) - ((a.unread || 0) > 0 ? 1 : 0);
        if (uDiff !== 0) return uDiff;
      }
      if (sortMode === 'oldest') return tA - tB;
      return tB - tA;
    });

    // Preserve currently open conversation across page filter switches (never silently change sender!)
    let activeConv = accessibleConvs.find(c => String(c.id) === String(this.activeConvId)) || null;
    if (!activeConv && filteredConvs.length > 0) {
      activeConv = filteredConvs[0];
      this.activeConvId = activeConv.id;
    }
    const activeConvOutsideFilter = Boolean(activeConv && this.selectedInboxPage !== 'all' && !this._dsConvMatchesPage(activeConv, this.selectedInboxPage));
    if (activeConv && (!activeConv.messages || activeConv.messages.length === 0) && !activeConv._fetchingMsgs) {
      activeConv._fetchingMsgs = true;
      setTimeout(() => this.fetchRealConversationMessages(activeConv), 50);
    }

    const matchingLead = (this.svc && activeConv)
      ? (this.svc.leads || []).find(l => String(l.id) === String(activeConv.lead_id) || (l.name && l.name === activeConv.name) || (activeConv.phone && l.phone === activeConv.phone))
      : null;

    const messages = activeConv
      ? ((Array.isArray(activeConv.messages) && activeConv.messages.length > 0)
        ? activeConv.messages
        : (activeConv.preview ? [{ id: 'msg_prev_' + activeConv.id, text: activeConv.preview, incoming: true, time: activeConv.time || 'Recent' }] : []))
      : [];

    const allPagesLabel = isAdmin ? 'All Pages' : 'All Assigned Pages';
    const selectedPageObj = this.selectedInboxPage !== 'all'
      ? accessiblePages.find(p => this._dsNormPage(p.id || p.page_id) === this._dsNormPage(this.selectedInboxPage))
      : null;
    const activeScopeLabel = this.selectedInboxPage === 'all' ? allPagesLabel : (selectedPageObj ? selectedPageObj.name : this._pageName(this.selectedInboxPage));

    const activePageName = activeConv ? this._pageName(activeConv.page_id || activeConv.accountId || activeConv.pageId) : '';
    const isIgActive = activeConv ? Boolean(activeConv.channel && activeConv.channel.toLowerCase().includes('insta')) : false;
    const activeInitials = activeConv ? this._getContactInitials(activeConv.name) : '?';
    const activeColor = activeConv ? this._getAvatarColor(activeConv.name) : { bg: '#F3F4F6', text: '#374151' };
    const detailsCollapsed = sessionStorage.getItem('inbox_details_collapsed') !== 'false';
    const detailTab = this.inboxDetailTab || 'summary';
    const staffList = this.svc ? (this.svc.staff || []) : [];

    const secondaryFilterLabel = {
      all: 'All Threads', unread: 'Unread', starred: 'Starred',
      facebook: 'Messenger', instagram: 'Instagram', archived: 'Archived'
    }[activeTab] || null;

    // Preserve reading scroll position if re-rendering the same conversation while user is scrolled up
    const prevThreadEl = document.getElementById('inbox-thread');
    const sameConvReRender = Boolean(prevThreadEl && activeConv && String(this._lastRenderedInboxConvId || '') === String(activeConv.id));
    const prevScrollTop = sameConvReRender ? prevThreadEl.scrollTop : 0;
    const prevWasNearBottom = !sameConvReRender || ((prevThreadEl.scrollHeight - prevThreadEl.scrollTop - prevThreadEl.clientHeight) < 90);
    const prevMsgCount = sameConvReRender ? (this._lastRenderedInboxMsgCount || 0) : 0;
    const hadNewMsgsWhileScrolledUp = Boolean(sameConvReRender && !prevWasNearBottom && messages.length > prevMsgCount);
    this._lastRenderedInboxConvId = activeConv ? String(activeConv.id) : null;
    this._lastRenderedInboxMsgCount = messages.length;

    this.el.content.innerHTML = `
      <div class="inbox-layout ${this.mobileInboxView === 'chat' ? 'view-chat' : 'view-list'} ${detailsCollapsed ? 'details-collapsed' : ''}">
        <!-- COLUMN 0: DEALERSHIP PAGE SELECTOR RAIL -->
        <aside class="inbox-page-rail" aria-label="Dealership pages">
          <div class="inbox-rail-header">
            <span class="inbox-rail-title">Pages (${accessiblePages.length})</span>
          </div>
          <div class="inbox-rail-list" role="tablist" aria-label="Filter inbox by dealership page">
            <button type="button" role="tab" aria-selected="${this.selectedInboxPage === 'all'}" class="inbox-rail-item ${this.selectedInboxPage === 'all' ? 'active' : ''}" onclick="window.app.setInboxPageFilter('all')">
              <span class="inbox-rail-item-left">
                <span class="ds-page-avatar" style="background:#111827;color:#FFFFFF;">${this._dsIcon('layers', 13)}</span>
                <span class="inbox-rail-name">${esc(allPagesLabel)}</span>
              </span>
              <span class="inbox-rail-counts">
                ${allUnreadCount > 0 ? `<span class="inbox-rail-unread">${allUnreadCount}</span>` : `<span class="inbox-rail-total">${allActiveConvs.length}</span>`}
              </span>
            </button>
            ${pageMetrics.map((pm, idx) => {
              const isSelected = this._dsNormPage(this.selectedInboxPage) === this._dsNormPage(pm.page.id || pm.page.page_id);
              return `
                <button type="button" role="tab" aria-selected="${isSelected}" class="inbox-rail-item ${isSelected ? 'active' : ''}" onclick="window.app.setInboxPageFilter('${esc(pm.page.id || pm.page.page_id)}')" title="${esc(pm.page.name)} — ${pm.total} threads (${pm.unread} unread) [Alt+${idx + 1}]">
                  <span class="inbox-rail-item-left">
                    ${this._dsPageAvatar(pm.page.name, pm.page.channel || pm.page.platform)}
                    <span class="inbox-rail-name">${esc(pm.page.name)}</span>
                  </span>
                  <span class="inbox-rail-counts">
                    ${pm.unread > 0 ? `<span class="inbox-rail-unread">${pm.unread}</span>` : `<span class="inbox-rail-total">${pm.total}</span>`}
                  </span>
                </button>`;
            }).join('')}
          </div>
          <div class="inbox-rail-footer">Viewing: <strong>${esc(activeScopeLabel)}</strong></div>
        </aside>

        <!-- COLUMN 1: CONVERSATION LIST -->
        <section class="inbox-sidebar" aria-label="Conversations">
          <div class="inbox-list-head">
            <div class="inbox-list-head-top">
              <div style="min-width:0;">
                <h2 class="inbox-scope-heading">${esc(activeScopeLabel)}</h2>
                <div class="inbox-scope-meta">${filteredConvs.length} shown · ${needsReplyCount} need reply</div>
              </div>
              <button type="button" class="btn btn-ghost btn-xs" style="height:30px;padding:0 8px;border:1px solid var(--ds-border);" onclick="window.app.toggleInboxFilterMenu(event)" aria-label="More filters and sorting" title="More filters &amp; sorting">
                ${this._dsIcon('sliders', 14)}
                ${secondaryFilterLabel ? `<span style="font-size:11px;">${esc(secondaryFilterLabel)}</span>` : ''}
              </button>
            </div>

            <!-- Compact Page Selector (shown when Page Rail collapses on narrow widths OR when Details docks open) -->
            <div class="inbox-mobile-page-bar">
              <select class="input w-full" style="height:32px;font-size:12.5px;font-weight:600;" aria-label="Switch dealership page" onchange="window.app.setInboxPageFilter(this.value)">
                <option value="all" ${this.selectedInboxPage === 'all' ? 'selected' : ''}>${esc(allPagesLabel)} (${allActiveConvs.length})</option>
                ${pageMetrics.map(pm => `<option value="${esc(pm.page.id || pm.page.page_id)}" ${this._dsNormPage(this.selectedInboxPage) === this._dsNormPage(pm.page.id || pm.page.page_id) ? 'selected' : ''}>${esc(pm.page.name)} (${pm.unread > 0 ? pm.unread + ' unread' : pm.total})</option>`).join('')}
              </select>
            </div>

            <!-- Secondary Filter & Sort Popover -->
            <div id="inbox-filter-menu-popover" class="inbox-filter-menu-popover" style="display:none;" onclick="event.stopPropagation()">
              <div class="filter-menu-section-title">MORE VIEWS</div>
              <div class="filter-menu-item ${activeTab === 'all' ? 'active' : ''}" onclick="window.app.setInboxTab('all');window.app.toggleInboxFilterMenu();"><span>All Active Threads</span><span class="filter-menu-badge">${activeNonArchived.length}</span></div>
              <div class="filter-menu-item ${activeTab === 'unread' ? 'active' : ''}" onclick="window.app.setInboxTab('unread');window.app.toggleInboxFilterMenu();"><span>Unread Only</span><span class="filter-menu-badge">${unreadCount}</span></div>
              <div class="filter-menu-item ${activeTab === 'facebook' ? 'active' : ''}" onclick="window.app.setInboxTab('facebook');window.app.toggleInboxFilterMenu();"><span>Facebook Messenger</span></div>
              <div class="filter-menu-item ${activeTab === 'instagram' ? 'active' : ''}" onclick="window.app.setInboxTab('instagram');window.app.toggleInboxFilterMenu();"><span>Instagram Direct</span></div>
              <div class="filter-menu-item ${activeTab === 'starred' ? 'active' : ''}" onclick="window.app.setInboxTab('starred');window.app.toggleInboxFilterMenu();"><span>Starred</span></div>
              <div class="filter-menu-item ${activeTab === 'archived' ? 'active' : ''}" onclick="window.app.setInboxTab('archived');window.app.toggleInboxFilterMenu();"><span>Archived</span><span class="filter-menu-badge">${archivedCount}</span></div>
              <div class="filter-menu-divider"></div>
              <div class="filter-menu-section-title">SORT ORDER</div>
              <div class="filter-menu-item ${sortMode === 'latest' ? 'active' : ''}" onclick="window.app.setInboxSort('latest');window.app.toggleInboxFilterMenu();"><span>Latest message</span>${sortMode === 'latest' ? '✓' : ''}</div>
              <div class="filter-menu-item ${sortMode === 'unread' ? 'active' : ''}" onclick="window.app.setInboxSort('unread');window.app.toggleInboxFilterMenu();"><span>Unread first</span>${sortMode === 'unread' ? '✓' : ''}</div>
              <div class="filter-menu-item ${sortMode === 'oldest' ? 'active' : ''}" onclick="window.app.setInboxSort('oldest');window.app.toggleInboxFilterMenu();"><span>Oldest waiting first</span>${sortMode === 'oldest' ? '✓' : ''}</div>
            </div>

            <!-- Compact 3-Item Primary Queue Bar -->
            <div class="inbox-queue-bar" role="tablist" aria-label="Primary work queues">
              <button type="button" role="tab" aria-selected="${activeTab === 'needs_reply'}" class="inbox-queue-seg ${activeTab === 'needs_reply' ? 'active' : ''}" onclick="window.app.setInboxTab('needs_reply')" title="Last message is from the customer">
                <span>Needs Reply</span><span class="q-cnt">${needsReplyCount}</span>
              </button>
              <button type="button" role="tab" aria-selected="${activeTab === 'mine'}" class="inbox-queue-seg ${activeTab === 'mine' ? 'active' : ''}" onclick="window.app.setInboxTab('mine')" title="Assigned to you">
                <span>Mine</span><span class="q-cnt">${mineCount}</span>
              </button>
              <button type="button" role="tab" aria-selected="${activeTab === 'unassigned'}" class="inbox-queue-seg ${activeTab === 'unassigned' ? 'active' : ''}" onclick="window.app.setInboxTab('unassigned')" title="No owner assigned yet">
                <span>Unassigned</span><span class="q-cnt">${unassignedCount}</span>
              </button>
            </div>

            <!-- Scoped Search -->
            <div class="inbox-search-wrap">
              <span class="inbox-search-icon">${this._dsIcon('search', 14)}</span>
              <input type="text" class="inbox-search-input" id="inbox-search-input" placeholder="Search in ${esc(activeScopeLabel)}…" value="${esc(this.inboxSearchQuery || '')}" oninput="window.app.searchInboxConversations(this.value)">
              ${this.inboxSearchQuery ? `<button type="button" class="inbox-search-clear" onclick="window.app.clearInboxSearch()" aria-label="Clear search">✕</button>` : ''}
            </div>
          </div>

          <div class="inbox-conv-list" id="inbox-conv-list">
            ${filteredConvs.length === 0 ? `
              <div style="padding:36px 20px;text-align:center;">
                <div style="font-size:13.5px;font-weight:600;color:var(--ds-ink);margin-bottom:4px;">No conversations in this view</div>
                <div style="font-size:12px;color:var(--ds-ink-muted);margin-bottom:14px;">Try switching to All Threads or another dealership page.</div>
                <button type="button" class="btn btn-secondary btn-xs" onclick="window.app.setInboxTab('all');window.app.setInboxPageFilter('all');">Show All Threads</button>
              </div>
            ` : filteredConvs.map(c => {
              const isIg = Boolean(c.channel && c.channel.toLowerCase().includes('insta'));
              const isUnread = (c.unread || c.unread_count || 0) > 0;
              const isActive = activeConv && String(c.id) === String(activeConv.id);
              const needsRep = this._dsConvNeedsReply(c);
              const hasDraft = Boolean(this._getConvDraft(c.id));
              const pName = this._pageName(c.page_id || c.accountId || c.pageId);
              const initials = this._getContactInitials(c.name);
              const color = this._getAvatarColor(c.name);
              const ownerId = c.assigned_staff_id || c.assignedStaffId || c.assigned_to;
              return `
                <div class="inbox-conv-item ${isActive ? 'active' : ''} ${isUnread ? 'is-unread-row' : ''}" data-conv-id="${esc(c.id)}" onclick="window.app.selectInboxConv('${esc(c.id)}')">
                  <div class="conv-avatar" style="background:${color.bg};color:${color.text};width:36px;height:36px;font-size:12px;">
                    ${esc(initials)}
                  </div>
                  <div class="conv-info" style="min-width:0;flex:1;">
                    <div class="conv-name-row">
                      <div style="display:flex;align-items:center;gap:6px;min-width:0;flex:1;">
                        ${isUnread ? `<span class="conv-unread-dot" title="Unread"></span>` : ''}
                        <span class="conv-name text-truncate">${esc(c.name || 'Customer')}</span>
                      </div>
                      <span class="conv-time">${esc(this._formatMessageTime(c.last_message_at || c.time))}</span>
                    </div>
                    <div class="conv-preview">${esc(c.preview || c.last_message || 'No messages yet')}</div>
                    <div class="conv-row-footer">
                      <span class="conv-page-tag">
                        ${this._dsPageAvatar(pName, isIg ? 'instagram' : 'facebook', 'sm')}
                        <span class="conv-page-tag-name">${esc(pName)}</span>
                      </span>
                      ${hasDraft ? `<span class="conv-state-text draft">Draft</span>`
                        : ownerId ? `<span style="font-size:11px;color:var(--ds-ink-muted);white-space:nowrap;">${esc(this._staffName(ownerId).split(' ')[0])}</span>`
                        : needsRep ? `<span class="conv-state-text">Needs reply</span>` : ''}
                    </div>
                  </div>
                </div>`;
            }).join('')}
            ${filteredConvs.length > 0 ? `
              <div style="padding:10px 14px;border-top:1px solid var(--ds-border);display:flex;align-items:center;justify-content:space-between;background:var(--ds-surface);margin-top:auto;">
                <span style="font-size:11.5px;color:var(--ds-ink-muted);">Showing ${filteredConvs.length} chat${filteredConvs.length === 1 ? '' : 's'}</span>
                <button type="button" class="btn btn-secondary btn-xs" id="btn-load-more-convs" onclick="window.app.loadMoreConversations()" style="font-size:11px;padding:3px 8px;">Load earlier chats…</button>
              </div>
            ` : ''}
          </div>
        </section>

        <!-- COLUMN 2: ACTIVE CONVERSATION WORKSPACE -->
        <section class="inbox-main" aria-label="Active conversation">
          ${activeConv ? (() => {
            const ownerId = activeConv.assigned_staff_id || activeConv.assignedStaffId || activeConv.assigned_to || (matchingLead && (matchingLead.assigned_staff_id || matchingLead.assignedStaffId || matchingLead.assigned_to));
            const isOtherOwner = ownerId && String(ownerId) !== String(this.user.id);
            const lastCust = (messages || []).slice().reverse().find(m => m.incoming === true || m.sender_type === 'customer');
            const lastCustMs = new Date((lastCust && lastCust.created_at) || activeConv.last_message_at || Date.now()).getTime();
            const windowExpired = !isNaN(lastCustMs) && ((Date.now() - lastCustMs) / 3600000) > 24;

            return `
              <!-- Thread Header -->
              <header class="inbox-thread-header">
                <button type="button" class="inbox-back-btn" onclick="window.app.closeMobileThread()" aria-label="Back to conversation list">
                  ${this._dsIcon('arrowLeft', 18)}
                </button>
                <div class="thread-avatar" style="background:${activeColor.bg};color:${activeColor.text};width:36px;height:36px;font-size:12.5px;">
                  ${esc(activeInitials)}
                </div>
                <div class="thread-meta">
                  <div class="thread-name-row">
                    <span class="thread-name">${esc(activeConv.name)}</span>
                    ${this._dsStagePill(matchingLead ? matchingLead.status : 'New Lead')}
                  </div>
                  <div class="thread-sub">
                    <span>${isIgActive ? 'Instagram Direct' : 'Facebook Messenger'}</span>
                    <span>·</span>
                    <span style="font-weight:600;color:var(--ds-ink-secondary);">${esc(activePageName)}</span>
                    ${ownerId ? `<span>·</span><span>Owner: ${esc(this._staffName(ownerId))}</span>` : ''}
                  </div>
                </div>
                <div class="thread-header-actions">
                  <button type="button" class="btn btn-ghost btn-xs" style="height:32px;padding:0 8px;border:1px solid var(--ds-border);" onclick="window.app.toggleConvMenu('${esc(activeConv.id)}', event)" aria-label="Thread actions" title="Star, Mark Read/Unread, Archive">
                    ${this._dsIcon('more', 15)}
                  </button>
                  <button type="button" class="inbox-details-toggle-btn ${!detailsCollapsed ? 'active' : ''}" onclick="window.app.toggleInboxDetails()" title="Toggle Customer &amp; Vehicle Details">
                    ${this._dsIcon('panelRight', 14)}<span>Details</span>
                  </button>
                  <div id="conv-menu-${esc(activeConv.id)}" class="conv-item-dropdown" style="display:none;right:0;top:38px;" onclick="event.stopPropagation()">
                    <div class="conv-dropdown-item" onclick="window.app.toggleStarConversation('${esc(activeConv.id)}')"><span>${activeConv.starred ? 'Unstar conversation' : 'Star conversation'}</span></div>
                    <div class="conv-dropdown-item" onclick="window.app.toggleConversationUnread('${esc(activeConv.id)}')"><span>${(activeConv.unread || 0) > 0 ? 'Mark as read' : 'Mark as unread'}</span></div>
                    <div class="conv-dropdown-item" onclick="window.app.openMetaConversation('${esc(activeConv.id)}')"><span>Open in Meta Business Suite</span></div>
                    <div class="conv-dropdown-item" onclick="window.app.toggleArchiveConversation('${esc(activeConv.id)}')"><span>${activeConv.is_archived ? 'Unarchive' : 'Archive conversation'}</span></div>
                  </div>
                </div>
              </header>

              <!-- Messages Thread -->
              <div class="inbox-thread" id="inbox-thread" onscroll="if (this.scrollTop < 40) window.app.loadOlderMessages('${esc(activeConv.id)}')">
                ${!activeConv._allHistoryLoaded ? `
                  <div style="text-align:center;padding:8px 0 4px;">
                    <button type="button" class="btn btn-ghost btn-xs" onclick="window.app.loadOlderMessages('${esc(activeConv.id)}')" style="font-size:11px;color:var(--ds-ink-muted);background:var(--ds-canvas);border:1px solid var(--ds-border);border-radius:12px;padding:2px 10px;">⟳ Load earlier messages</button>
                  </div>
                ` : ''}
                <div class="msg-date-divider"><span>${esc(this._formatMessageTime(activeConv.last_message_at || activeConv.time) || 'Today')}</span></div>
                ${messages.map(m => {
                  if (m.incoming) {
                    return `
                      <div class="msg msg-in" data-msg-id="${esc(m.id || '')}">
                        <div class="msg-in-row">
                          <div class="msg-mini-avatar" style="background:${activeColor.bg};color:${activeColor.text};">${esc(activeInitials)}</div>
                          <div class="msg-bubble">
                            ${this._renderAttachmentInBubble(m, false)}
                            ${esc(m.text || '')}
                          </div>
                        </div>
                        ${m.time ? `<span class="msg-time">${esc(m.time)}</span>` : ''}
                      </div>`;
                  }
                  const isSending = m.status === 'sending';
                  const isFailed = m.status === 'failed';
                  const isUncertain = m.status === 'uncertain';
                  const isDelivered = m.status === 'delivered';
                  const isRead = m.status === 'read';
                  const statusLabel = isSending
                    ? ' · Sending…'
                    : isUncertain
                      ? ' · Delivery status uncertain — refresh before resending'
                      : isFailed
                        ? ` · Your message wasn't sent. <button type="button" class="btn-msg-retry" onclick="window.app.retryInboxMessage('${esc(m.id)}')">Try again</button>`
                        : isRead
                          ? ' · Read'
                          : isDelivered
                            ? ' · Delivered'
                            : ' · Sent';
                  return `
                    <div class="msg msg-out ${isSending ? 'msg-sending' : ''} ${isFailed ? 'msg-failed' : ''}" data-msg-id="${esc(m.id || '')}">
                      <div class="msg-bubble">
                        ${this._renderAttachmentInBubble(m, true)}
                        ${esc(m.text || '')}
                      </div>
                      <span class="msg-time">
                        ${esc(m.time || 'Just now')}${statusLabel}
                      </span>
                    </div>`;
                }).join('')}
              </div>

              <!-- Unified Single Composer Card -->
              <div class="ds-composer-shell" ondragover="event.preventDefault()" ondrop="window.app.handleComposerDrop(event)">
                ${isOtherOwner ? `
                  <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:7px 12px;margin-bottom:8px;background:var(--ds-warning-bg);border:1px solid var(--ds-warning-border);border-radius:8px;font-size:12px;color:var(--ds-warning);">
                    <span>Assigned to <strong>${esc(this._staffName(ownerId))}</strong> — coordinate before replying.</span>
                    <button type="button" class="btn btn-ghost btn-xs" style="height:24px;color:var(--ds-warning);" onclick="window.app.assignConversation('${esc(activeConv.id)}', '${esc(this.user.id)}')">Take ownership</button>
                  </div>
                ` : ''}

                <input type="file" id="inbox-file-input" style="display:none;" accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt" onchange="window.app.handleFileSelected(event)">
                <div id="inbox-attachment-preview-bar" style="display:none;padding:8px 12px;margin-bottom:6px;background:#FFFFFF;border:1px solid var(--ds-border);border-radius:8px;align-items:center;gap:10px;"></div>

                <div class="ds-composer-card ${activeConvOutsideFilter ? 'sender-mismatch' : ''}" id="composer-sender-banner" data-sender-page-id="${esc(String(activeConv.page_id || activeConv.accountId || ''))}">
                  <div class="ds-composer-sender-strip">
                    <div style="display:flex;align-items:center;gap:7px;min-width:0;flex-wrap:wrap;">
                      ${this._dsIcon('lock', 12)}
                      <span>Replying as <strong>${esc(activePageName)}</strong></span>
                      ${activeConvOutsideFilter ? `<span class="ds-pill ds-pill-warning" style="font-size:10.5px;">List filtered to ${esc(activeScopeLabel)} — sender locked</span>` : ''}
                    </div>
                    <span style="font-size:11.5px;font-weight:600;color:${windowExpired ? 'var(--ds-warning)' : 'var(--ds-success)'};white-space:nowrap;">
                      ${windowExpired ? '24h window closed' : 'Eligible to reply'}
                    </span>
                  </div>

                  <div class="ds-composer-input-wrap">
                    <textarea class="ds-composer-textarea" id="inbox-msg-input" placeholder="Write a reply as ${esc(activePageName)}…" rows="2" onkeydown="window.app.handleComposerKeydown(event)" oninput="window.app.handleComposerInput(this)" onpaste="window.app.handleComposerPaste(event)">${esc(this._getConvDraft(activeConv.id))}</textarea>
                  </div>

                  <div id="ds-saved-replies-pop" class="ds-saved-replies-popover" style="display:none;" onclick="event.stopPropagation()">
                    <div style="font-size:11px;font-weight:700;color:var(--ds-ink-muted);padding:4px 8px 6px;text-transform:uppercase;letter-spacing:0.05em;">Saved Dealership Replies</div>
                    <button type="button" class="ds-saved-reply-opt" onclick="window.app.insertSavedReply('Kia ora! Thanks for reaching out. Which vehicle are you interested in, and would you like cash or weekly finance options?');window.app.toggleSavedRepliesMenu(false);">
                      <div style="font-size:12.5px;font-weight:600;color:var(--ds-ink);">Greeting &amp; Cash / Finance Check</div>
                      <div style="font-size:11.5px;color:var(--ds-ink-muted);">Ask which car + cash vs finance preference</div>
                    </button>
                    <button type="button" class="ds-saved-reply-opt" onclick="window.app.insertSavedReply('Yes, this vehicle is currently on our Auckland yard and ready for a test drive. Would today or tomorrow suit you to come in?');window.app.toggleSavedRepliesMenu(false);">
                      <div style="font-size:12.5px;font-weight:600;color:var(--ds-ink);">Vehicle Available — Book Yard Visit</div>
                      <div style="font-size:11.5px;color:var(--ds-ink-muted);">Confirm availability &amp; propose viewing time</div>
                    </button>
                    <button type="button" class="ds-saved-reply-opt" onclick="window.app.insertSavedReply('We offer zero-deposit and low-deposit NZ finance with quick pre-approval. Let us know your licence type and weekly budget and we can run numbers for you.');window.app.toggleSavedRepliesMenu(false);">
                      <div style="font-size:12.5px;font-weight:600;color:var(--ds-ink);">NZ Finance Options</div>
                      <div style="font-size:11.5px;color:var(--ds-ink-muted);">Zero/low deposit pre-approval details</div>
                    </button>
                  </div>

                  <div class="ds-composer-toolbar">
                    <div class="ds-composer-tools-left">
                      <button type="button" class="ds-tool-btn" onclick="window.app.handleAttachmentClick()" title="Attach photo or document">
                        ${this._dsIcon('paperclip', 14)}<span>Attach</span>
                      </button>
                      <button type="button" class="ds-tool-btn" onclick="window.app.openVehicleStockPicker('${esc(activeConv.id)}')" title="Insert vehicle details from dealership stock">
                        ${this._dsIcon('car', 14)}<span>Vehicle</span>
                      </button>
                      <button type="button" class="ds-tool-btn" onclick="window.app.toggleSavedRepliesMenu()" title="Insert saved dealership reply">
                        ${this._dsIcon('bookmark', 14)}<span>Saved Reply</span>
                      </button>
                    </div>
                    <button type="button" class="btn btn-primary btn-sm" id="inbox-send-btn" onclick="window.app.sendInboxMessage()">
                      ${this._dsIcon('send', 13)}<span>Send</span>
                    </button>
                  </div>
                </div>
              </div>
            `;
          })() : `
            <div style="margin:auto;text-align:center;padding:32px;max-width:340px;">
              <div class="ds-empty-icon">${this._dsIcon('message', 20)}</div>
              <div style="font-size:15px;font-weight:700;margin-bottom:4px;">Select a conversation</div>
              <div style="font-size:12.5px;color:var(--ds-ink-muted);">Choose a customer from the left to view their history and reply from the right dealership page.</div>
            </div>
          `}
        </section>

        <!-- COLUMN 3: DOCKED CUSTOMER & DEALERSHIP SUMMARY PANEL -->
        <aside class="inbox-details" id="inbox-details" aria-label="Customer details">
          ${activeConv ? (() => {
            const leadId = matchingLead ? matchingLead.id : '';
            const curStage = matchingLead ? (matchingLead.status || 'New Lead') : 'New Lead';
            const curOwner = activeConv.assigned_staff_id || activeConv.assignedStaffId || (matchingLead && (matchingLead.assigned_staff_id || matchingLead.assignedStaffId)) || '';
            const customEntries = matchingLead && matchingLead.custom_fields && typeof matchingLead.custom_fields === 'object'
              ? Object.entries(matchingLead.custom_fields)
              : [];
            return `
              <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid var(--ds-border);">
                <div style="font-size:13.5px;font-weight:700;color:var(--ds-ink);">Customer Context</div>
                <button type="button" class="btn btn-ghost btn-xs" onclick="window.app.toggleInboxDetails()" aria-label="Close customer details">✕</button>
              </div>
              <div style="padding:14px 16px;overflow-y:auto;flex:1;display:flex;flex-direction:column;gap:14px;">
                <!-- Summary Header -->
                <div style="display:flex;align-items:center;gap:10px;">
                  <div class="thread-avatar" style="background:${activeColor.bg};color:${activeColor.text};width:40px;height:40px;font-size:14px;">${esc(activeInitials)}</div>
                  <div style="min-width:0;flex:1;">
                    <div style="font-size:14.5px;font-weight:700;color:var(--ds-ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(activeConv.name)}</div>
                    <div style="font-size:12px;color:var(--ds-ink-muted);">${esc(activePageName)} · ${isIgActive ? 'Instagram' : 'Messenger'}</div>
                  </div>
                </div>

                <!-- Primary Dealership Actions -->
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                  <button type="button" class="btn btn-primary btn-sm" onclick="window.app.openBookAppointmentModal('${esc(leadId)}', '${esc(activeConv.name)}')">
                    ${this._dsIcon('calendar', 13)}<span>Book Visit</span>
                  </button>
                  <button type="button" class="btn btn-secondary btn-sm" onclick="window.app.openAddTaskModal('${esc(leadId)}')">
                    ${this._dsIcon('clock', 13)}<span>Follow-up</span>
                  </button>
                </div>

                ${!matchingLead ? `
                  <button type="button" class="btn btn-secondary btn-sm w-full" onclick="window.app.createLeadFromConv('${esc(activeConv.name)}', '${esc(activeConv.page_id || activeConv.accountId || '')}')">
                    ${this._dsIcon('plus', 13)}<span>Create CRM Enquiry Record</span>
                  </button>
                ` : `
                  <button type="button" class="btn btn-ghost btn-xs w-full" style="border:1px solid var(--ds-border);" onclick="window.app.openLeadDrawer('${esc(matchingLead.id)}')">
                    <span>Open Full Enquiry Record</span>${this._dsIcon('external', 12)}
                  </button>
                `}

                <!-- Summary vs Notes/History Mini-Tabs -->
                <div class="ds-tabs" style="width:100%;display:grid;grid-template-columns:1fr 1fr;">
                  <button type="button" class="ds-tab-btn ${detailTab === 'summary' ? 'active' : ''}" onclick="window.app.inboxDetailTab='summary';window.app.renderInbox();">Deal Summary</button>
                  <button type="button" class="ds-tab-btn ${detailTab === 'notes' ? 'active' : ''}" onclick="window.app.inboxDetailTab='notes';window.app.renderInbox();">Notes &amp; Answers</button>
                </div>

                ${detailTab === 'summary' ? `
                  <div style="display:flex;flex-direction:column;gap:10px;">
                    <div style="display:flex;align-items:center;justify-content:space-between;">
                      <span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:var(--ds-ink-muted);">Vehicle &amp; Deal Details</span>
                      <span id="ds-inline-save-status" style="font-size:11px;font-weight:600;color:var(--ds-success);"></span>
                    </div>
                    <div class="ds-field-group">
                      <label class="ds-field-label" for="ds-det-vehicle">Vehicle Interest</label>
                      <input type="text" id="ds-det-vehicle" class="ds-inline-input" placeholder="e.g. 2020 Toyota Aqua Hybrid" value="${esc(matchingLead?.vehicle_interest || '')}" onchange="window.app.saveInboxCustomerField('${esc(activeConv.id)}', 'vehicle_interest', this.value)">
                    </div>
                    <div class="ds-detail-summary-grid">
                      <div class="ds-field-group">
                        <label class="ds-field-label" for="ds-det-budget">Budget (NZD)</label>
                        <input type="number" id="ds-det-budget" class="ds-inline-input" placeholder="15000" value="${esc(matchingLead?.budget_nzd || matchingLead?.value || '')}" onchange="window.app.saveInboxCustomerField('${esc(activeConv.id)}', 'budget_nzd', this.value)">
                      </div>
                      <div class="ds-field-group">
                        <label class="ds-field-label" for="ds-det-payment">Buying Pref.</label>
                        <select id="ds-det-payment" class="ds-inline-input" onchange="window.app.saveInboxCustomerField('${esc(activeConv.id)}', 'payment_preference', this.value)">
                          <option value="">Not set</option>
                          <option value="Finance" ${(matchingLead?.payment_preference === 'Finance') ? 'selected' : ''}>Finance</option>
                          <option value="Cash" ${(matchingLead?.payment_preference === 'Cash') ? 'selected' : ''}>Cash</option>
                          <option value="Trade-in + Finance" ${(matchingLead?.payment_preference === 'Trade-in + Finance') ? 'selected' : ''}>Trade-in + Finance</option>
                        </select>
                      </div>
                    </div>
                    <div class="ds-detail-summary-grid">
                      <div class="ds-field-group">
                        <label class="ds-field-label" for="ds-det-stage">Sales Stage</label>
                        <select id="ds-det-stage" class="ds-inline-input" onchange="window.app.saveInboxCustomerField('${esc(activeConv.id)}', 'status', this.value)">
                          ${['New Lead', 'Contacted', 'Qualified', 'Follow-up', 'Won', 'Lost'].map(st => `<option value="${st}" ${(curStage === st || (st === 'New Lead' && curStage === 'New')) ? 'selected' : ''}>${st === 'Won' ? 'Sold' : st}</option>`).join('')}
                        </select>
                      </div>
                      <div class="ds-field-group">
                        <label class="ds-field-label" for="ds-det-finance">Finance Status</label>
                        <select id="ds-det-finance" class="ds-inline-input" onchange="window.app.saveInboxCustomerField('${esc(activeConv.id)}', 'finance_status', this.value)">
                          <option value="">Not started</option>
                          <option value="Applied" ${(matchingLead?.finance_status === 'Applied') ? 'selected' : ''}>Applied</option>
                          <option value="Approved" ${(matchingLead?.finance_status === 'Approved') ? 'selected' : ''}>Approved</option>
                          <option value="Declined" ${(matchingLead?.finance_status === 'Declined') ? 'selected' : ''}>Declined</option>
                        </select>
                      </div>
                    </div>
                    <div class="ds-field-group">
                      <label class="ds-field-label" for="ds-det-owner">Assigned Owner</label>
                      <select id="ds-det-owner" class="ds-inline-input" onchange="window.app.assignConversation('${esc(activeConv.id)}', this.value)">
                        <option value="">Unassigned</option>
                        ${staffList.map(s => `<option value="${esc(s.id)}" ${String(curOwner) === String(s.id) ? 'selected' : ''}>${esc(s.displayName || s.name)}</option>`).join('')}
                      </select>
                    </div>
                    <div class="ds-field-group">
                      <label class="ds-field-label" for="ds-det-next">Next Action Note</label>
                      <input type="text" id="ds-det-next" class="ds-inline-input" placeholder="e.g. Call back Thursday 2pm" value="${esc(matchingLead?.next_action_note || '')}" onchange="window.app.saveInboxCustomerField('${esc(activeConv.id)}', 'next_action_note', this.value)">
                    </div>
                  </div>
                ` : `
                  <div style="display:flex;flex-direction:column;gap:12px;">
                    <div class="ds-field-group">
                      <label class="ds-field-label">Internal Team Notes</label>
                      <textarea class="ds-inline-input" style="height:84px;padding:8px;resize:vertical;" placeholder="Add notes visible only to your team…" onchange="window.app.saveInboxCustomerField('${esc(activeConv.id)}', 'notes', this.value)">${esc(matchingLead?.notes || activeConv.notes || '')}</textarea>
                    </div>
                    ${customEntries.length > 0 ? `
                      <div>
                        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:var(--ds-ink-muted);margin-bottom:6px;">Lead Ad Form Answers</div>
                        <div style="display:flex;flex-direction:column;gap:6px;background:var(--ds-surface-subtle);border:1px solid var(--ds-border);border-radius:8px;padding:10px;">
                          ${customEntries.map(([k, v]) => `
                            <div style="font-size:12px;">
                              <div style="color:var(--ds-ink-muted);font-size:11px;">${esc(k.replace(/_/g, ' '))}</div>
                              <div style="font-weight:600;color:var(--ds-ink);">${esc(String(v))}</div>
                            </div>`).join('')}
                        </div>
                      </div>
                    ` : `<div style="font-size:12px;color:var(--ds-ink-muted);">No Meta Lead Ad form answers attached to this thread.</div>`}
                  </div>
                `}
              </div>`;
          })() : ''}
        </aside>
        ${hadNewMsgsWhileScrolledUp ? `
          <button type="button" class="ds-jump-latest-btn" id="ds-jump-latest-btn" onclick="const t=document.getElementById('inbox-thread'); if(t){t.scrollTop=t.scrollHeight;} this.remove();">
            ↓ New messages
          </button>
        ` : ''}
      </div>`;

    // Restore scroll position cleanly: auto-scroll only if near bottom or newly opened thread
    const nextThreadEl = document.getElementById('inbox-thread');
    if (nextThreadEl) {
      if (prevWasNearBottom) {
        nextThreadEl.scrollTop = nextThreadEl.scrollHeight;
      } else {
        nextThreadEl.scrollTop = prevScrollTop;
      }
    }
  };

  proto.toggleSavedRepliesMenu = function (forceState) {
    const el = document.getElementById('ds-saved-replies-pop');
    if (!el) return;
    const show = typeof forceState === 'boolean' ? forceState : (el.style.display === 'none');
    el.style.display = show ? 'block' : 'none';
  };

  proto.saveInboxCustomerField = function (convId, field, rawValue) {
    const statusEl = document.getElementById('ds-inline-save-status');
    try {
      if (!this.svc) return;
      const conv = (this.svc.conversations || []).find(c => String(c.id) === String(convId));
      if (!conv) return;
      let lead = (this.svc.leads || []).find(l => String(l.id) === String(conv.lead_id) || l.name === conv.name);
      if (!lead) {
        lead = {
          id: 'lead_' + Date.now(),
          name: conv.name || 'Customer',
          full_name: conv.name || 'Customer',
          page_id: this._dsNormPage(conv.page_id || conv.accountId),
          pageId: this._dsNormPage(conv.page_id || conv.accountId),
          source: conv.channel && conv.channel.includes('insta') ? 'Instagram Direct' : 'Facebook Messenger',
          status: 'Contacted',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        this.svc.leads = this.svc.leads || [];
        this.svc.leads.unshift(lead);
        conv.lead_id = lead.id;
      }
      const val = field === 'budget_nzd' ? (rawValue ? Number(rawValue) : null) : rawValue;
      lead[field] = val;
      if (field === 'budget_nzd') lead.value = val;
      lead.updated_at = new Date().toISOString();
      if (field === 'notes') conv.notes = val;
      this.svc._saveToStorage ? this.svc._saveToStorage() : this.svc.saveAll();
      if (statusEl) {
        statusEl.textContent = 'Saved';
        statusEl.style.color = 'var(--ds-success)';
        setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 2000);
      }
      if (field === 'status') this.renderInbox();
    } catch (err) {
      if (statusEl) {
        statusEl.textContent = 'Save failed';
        statusEl.style.color = 'var(--ds-danger)';
      }
    }
  };

  // ==========================================================================
  // 3. LEADS — CLEAN WORKING TABLE + SAVED VIEWS
  // ==========================================================================
  proto.renderLeads = function (tab) {
    if (!this.user) return;
    if (this.el.content) this.el.content.classList.remove('inbox-view-container');
    if (tab) this.leadSavedView = tab;
    const view = this.leadSavedView || 'all';
    const isAdmin = this.user.role === 'admin' || this.user.role === 'super_admin';
    const accessiblePages = this._getAccessiblePages ? this._getAccessiblePages() : [];
    const staffList = this.svc ? (this.svc.staff || []) : [];

    this.el.title.innerHTML = `<h1 class="topbar-title">${isAdmin ? 'Enquiries & Leads' : 'My Enquiries'}</h1>`;
    this.el.actions.innerHTML = `
      ${isAdmin ? `<button type="button" class="btn btn-secondary btn-sm" onclick="window.app.syncZernioLeadsFromMarketing()">${this._dsIcon('refresh', 13)}<span>Sync Meta Leads</span></button>` : ''}
      <button type="button" class="btn btn-secondary btn-sm" onclick="window.app.exportLeadsCsv()">Export CSV</button>
      <button type="button" class="btn btn-primary btn-sm" onclick="window.app.openAddLeadModal()">${this._dsIcon('plus', 13)}<span>Add Enquiry</span></button>`;

    const allLeads = this._getFilteredLeads ? this._getFilteredLeads(false) : [];
    const pageFilter = this.leadPageFilter || 'all';
    const ownerFilter = this.leadOwnerFilter || 'all';
    const campFilter = this.leadCampaignFilter || '';
    const sortBy = this.leadSortBy || 'newest';
    const q = (this.leadSearchQuery || '').trim().toLowerCase();

    const applySavedView = (list, v) => {
      if (v === 'needs_action') return list.filter(l => !['Won', 'Converted', 'Sold', 'Lost', 'Invalid'].includes(l.status) && (!l.next_action_at || new Date(l.next_action_at) <= new Date()));
      if (v === 'unassigned') return list.filter(l => !(l.assigned_staff_id || l.assignedStaffId || l.assigned_to));
      if (v === 'finance') return list.filter(l => String(l.payment_preference || '').toLowerCase().includes('finance') || Boolean(l.finance_status));
      if (v === 'won' || v === 'sold') return list.filter(l => ['Won', 'Converted', 'Sold'].includes(l.status));
      if (v === 'lost') return list.filter(l => ['Lost', 'Invalid'].includes(l.status));
      if (v === 'new') return list.filter(l => ['New', 'New Lead'].includes(l.status));
      return list;
    };

    const baseFiltered = allLeads.filter(l => {
      if (pageFilter !== 'all' && this._dsNormPage(l.page_id || l.pageId) !== this._dsNormPage(pageFilter)) return false;
      if (ownerFilter !== 'all' && String(l.assigned_staff_id || l.assignedStaffId || l.assigned_to || '') !== String(ownerFilter)) return false;
      if (campFilter && String(l.campaign_id || l.campaignId || '') !== String(campFilter)) return false;
      if (q) {
        const hay = `${l.name || l.full_name || ''} ${l.phone || ''} ${l.email || ''} ${l.vehicle_interest || ''} ${l.form_name || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    const rows = applySavedView(baseFiltered, view).slice().sort((a, b) => {
      if (sortBy === 'budget') return Number(b.budget_nzd || b.value || 0) - Number(a.budget_nzd || a.value || 0);
      if (sortBy === 'next_action') return new Date(a.next_action_at || '2099-01-01') - new Date(b.next_action_at || '2099-01-01');
      return new Date(b.created_at || b.createdAt || 0) - new Date(a.created_at || a.createdAt || 0);
    });

    const hasFilters = Boolean(q || pageFilter !== 'all' || ownerFilter !== 'all' || campFilter || view !== 'all');
    const savedViews = [
      { id: 'all', label: 'All Enquiries' },
      { id: 'needs_action', label: 'Needs Action' },
      { id: 'unassigned', label: 'Unassigned' },
      { id: 'finance', label: 'Finance Buyers' },
      { id: 'sold', label: 'Sold' },
      { id: 'lost', label: 'Lost' }
    ];

    this.el.content.innerHTML = `
      <div style="max-width:1360px;margin:0 auto;">
        <div class="ds-page-header" style="margin-bottom:16px;">
          <div>
            <h2 class="ds-page-h1">Leads &amp; Enquiries</h2>
            <p class="ds-page-sub">Track dealership enquiries, vehicle interest, finance readiness, and assigned salespeople.</p>
          </div>
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:16px;">
          <div class="ds-tabs" role="tablist">
            ${savedViews.map(sv => `
              <button type="button" role="tab" aria-selected="${view === sv.id}" class="ds-tab-btn ${view === sv.id ? 'active' : ''}" onclick="window.app.renderLeads('${sv.id}')">
                <span>${sv.label}</span>
                <span class="ds-tab-count">${applySavedView(baseFiltered, sv.id).length}</span>
              </button>`).join('')}
          </div>
          <span style="font-size:12px;color:var(--ds-ink-muted);">${rows.length} of ${allLeads.length} enquiries</span>
        </div>

        <div class="crm-filter-bar" style="gap:8px;margin-bottom:14px;">
          <input type="text" class="input" style="flex:1 1 220px;min-width:180px;max-width:320px;" placeholder="Filter by customer, phone, email, or vehicle…" value="${esc(this.leadSearchQuery || '')}" oninput="window.app.leadSearchQuery=this.value;window.app.renderLeads();">
          <select class="input" style="width:auto;min-width:165px;" aria-label="Filter by page" onchange="window.app.leadPageFilter=this.value;window.app.renderLeads();">
            <option value="all">${isAdmin ? 'All Dealership Pages' : 'All Assigned Pages'}</option>
            ${accessiblePages.map(p => `<option value="${esc(p.id || p.page_id)}" ${this._dsNormPage(pageFilter) === this._dsNormPage(p.id || p.page_id) ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
          </select>
          <select class="input" style="width:auto;min-width:140px;" aria-label="Filter by owner" onchange="window.app.leadOwnerFilter=this.value;window.app.renderLeads();">
            <option value="all">All Owners</option>
            ${staffList.map(s => `<option value="${esc(s.id)}" ${String(ownerFilter) === String(s.id) ? 'selected' : ''}>${esc(s.displayName || s.name)}</option>`).join('')}
          </select>
          <select class="input" style="width:auto;min-width:145px;" aria-label="Sort leads" onchange="window.app.leadSortBy=this.value;window.app.renderLeads();">
            <option value="newest" ${sortBy === 'newest' ? 'selected' : ''}>Sort: Newest</option>
            <option value="next_action" ${sortBy === 'next_action' ? 'selected' : ''}>Sort: Next Action Due</option>
            <option value="budget" ${sortBy === 'budget' ? 'selected' : ''}>Sort: Highest Budget</option>
          </select>
          ${campFilter ? `<span class="ds-pill ds-pill-warning">Campaign ${esc(campFilter)} <button type="button" style="border:none;background:none;cursor:pointer;font-weight:700;" onclick="window.app.leadCampaignFilter='';window.app.renderLeads();">✕</button></span>` : ''}
          ${hasFilters ? `<button type="button" class="btn btn-ghost btn-xs" onclick="window.app.clearLeadFilters()">Clear filters</button>` : ''}
        </div>

        ${rows.length === 0 ? `
          <div class="ds-empty-box">
            <div class="ds-empty-icon">${this._dsIcon('inbox', 20)}</div>
            <h3 class="ds-empty-title">${hasFilters ? 'No enquiries match these filters' : 'No enquiries captured yet'}</h3>
            <p class="ds-empty-desc">${hasFilters ? 'Clear or adjust your filters to view other enquiries across your authorised dealership pages.' : (isAdmin ? 'Check for new ad enquiries, convert an active Inbox conversation, or log a walk-in enquiry.' : 'Convert an active Inbox conversation or log a walk-in enquiry.')}</p>
            <div style="display:flex;justify-content:center;gap:8px;flex-wrap:wrap;">
              ${hasFilters ? `<button type="button" class="btn btn-secondary btn-sm" onclick="window.app.clearLeadFilters()">Clear Filters</button>` : ''}
              ${isAdmin && !hasFilters ? `<button type="button" class="btn btn-secondary btn-sm" onclick="window.app.syncZernioLeadsFromMarketing()">${this._dsIcon('refresh', 13)}<span>Refresh Ad Leads</span></button>` : ''}
              <button type="button" class="btn btn-primary btn-sm" onclick="window.app.openAddLeadModal()">${this._dsIcon('plus', 13)}<span>Add Enquiry</span></button>
            </div>
          </div>
        ` : `
          <div class="ds-card">
            <div class="ds-table-wrap">
              <table class="ds-table">
                <thead>
                  <tr>
                    <th style="width:36px;"><input type="checkbox" id="select-all-leads" onchange="window.app.toggleSelectAll(this)"></th>
                    <th>Customer</th>
                    <th>Page &amp; Source</th>
                    <th>Vehicle &amp; Budget (NZD)</th>
                    <th>Stage</th>
                    <th>Owner</th>
                    <th>Next Action</th>
                    <th>Last Activity</th>
                  </tr>
                </thead>
                <tbody>
                  ${rows.map(l => {
                    const pName = this._pageName(l.page_id || l.pageId);
                    const budget = Number(l.sale_value_nzd || l.budget_nzd || l.value || l.dealValue || 0);
                    const nextAt = l.next_action_at || l.follow_up_date || l.followUpDate;
                    const isOverdue = nextAt && new Date(nextAt) < new Date() && !['Won', 'Converted', 'Sold', 'Lost'].includes(l.status);
                    const nextStr = nextAt ? new Date(nextAt).toLocaleDateString('en-NZ', { timeZone: 'Pacific/Auckland', day: 'numeric', month: 'short' }) : 'Not set';
                    const isChecked = this.selectedLeadIds && this.selectedLeadIds.has(l.id);
                    return `
                      <tr class="clickable-row" onclick="window.app.openLeadDrawer('${esc(l.id)}')">
                        <td onclick="event.stopPropagation()"><input type="checkbox" class="lead-select-box" value="${esc(l.id)}" ${isChecked ? 'checked' : ''} onchange="window.app.onLeadSelect(this)"></td>
                        <td>
                          <div style="font-weight:600;color:var(--ds-ink);">${esc(l.name || l.full_name || 'Customer')}</div>
                          <div style="font-size:12px;color:var(--ds-ink-muted);">${esc(l.phone || l.email || 'No contact info')}</div>
                        </td>
                        <td>
                          <div style="display:flex;align-items:center;gap:8px;">
                            ${this._dsPageAvatar(pName, String(l.source || '').includes('Insta') ? 'instagram' : 'facebook', 'sm')}
                            <div>
                              <div style="font-size:12.5px;font-weight:600;">${esc(pName)}</div>
                              <div style="font-size:11.5px;color:var(--ds-ink-muted);">${esc(l.form_name || l.source || 'Lead Ad')}</div>
                            </div>
                          </div>
                        </td>
                        <td>
                          <div style="font-weight:500;">${esc(l.vehicle_interest || 'Vehicle TBC')}</div>
                          <div style="display:flex;align-items:center;gap:6px;margin-top:2px;flex-wrap:wrap;">
                            <span style="font-size:12px;color:var(--ds-ink-secondary);font-weight:600;">${budget > 0 ? this.formatMoney(budget) : 'Budget TBC'}</span>
                            ${this._dsFinancePill(l.finance_status, l.payment_preference)}
                          </div>
                        </td>
                        <td>${this._dsStagePill(l.status)}</td>
                        <td style="font-size:12.5px;">${esc(this._staffName(l.assigned_staff_id || l.assignedStaffId || l.assigned_to))}</td>
                        <td>
                          <div style="font-size:12.5px;font-weight:${isOverdue ? '600' : '500'};color:${isOverdue ? 'var(--ds-danger)' : 'var(--ds-ink)'};">${esc(l.next_action_note || (isOverdue ? 'Overdue follow-up' : 'Follow up'))}</div>
                          <div style="font-size:11.5px;color:${isOverdue ? 'var(--ds-danger)' : 'var(--ds-ink-muted)'};">${esc(nextStr)}</div>
                        </td>
                        <td style="font-size:12px;color:var(--ds-ink-muted);white-space:nowrap;">${esc(this._timeAgo(l.updated_at || l.created_at || l.createdAt))}</td>
                      </tr>`;
                  }).join('')}
                </tbody>
              </table>
            </div>
          </div>
        `}
      </div>`;
  };

  proto.clearLeadFilters = function () {
    this.leadSearchQuery = '';
    this.leadPageFilter = 'all';
    this.leadOwnerFilter = 'all';
    this.leadCampaignFilter = '';
    this.leadSavedView = 'all';
    this.renderLeads();
  };

  // ==========================================================================
  // 4. PIPELINE — ACTIONABLE CARDS + SEPARATE FINANCE STATUS
  // ==========================================================================
  proto.renderPipeline = function () {
    if (!this.user) return;
    if (this.el.content) this.el.content.classList.remove('inbox-view-container');
    const mode = this.pipelineView || 'kanban';
    this.el.title.innerHTML = `<h1 class="topbar-title">${this.user.role === 'staff' ? 'My Pipeline' : 'Sales Pipeline'}</h1>`;
    this.el.actions.innerHTML = `
      <div class="ds-tabs">
        <button type="button" class="ds-tab-btn ${mode === 'kanban' ? 'active' : ''}" onclick="window.app.pipelineView='kanban';window.app.renderPipeline();">Board</button>
        <button type="button" class="ds-tab-btn ${mode === 'list' ? 'active' : ''}" onclick="window.app.pipelineView='list';window.app.renderPipeline();">List</button>
      </div>
      <button type="button" class="btn btn-primary btn-sm" onclick="window.app.openAddLeadModal()">${this._dsIcon('plus', 13)}<span>Add Deal</span></button>`;

    if (mode === 'list') {
      this.renderLeads();
      return;
    }

    const stages = [
      { id: 'New Lead', label: 'New', dot: '#8B7AE0' },
      { id: 'Contacted', label: 'Contacted', dot: '#E99A36' },
      { id: 'Qualified', label: 'Qualified', dot: '#6D5BD0' },
      { id: 'Follow-up', label: 'Visit / Follow-up', dot: '#E99A36' },
      { id: 'Won', label: 'Sold', dot: '#22A66F' },
      { id: 'Lost', label: 'Lost', dot: '#DC4C64' }
    ];
    const leads = this._getFilteredLeads ? this._getFilteredLeads(false) : [];

    this.el.content.innerHTML = `
      <div style="max-width:1440px;margin:0 auto;">
        <div class="ds-page-header" style="margin-bottom:20px;">
          <div>
            <h2 class="ds-page-h1">Sales Pipeline</h2>
            <p class="ds-page-sub">Progress vehicle enquiries from first contact to yard visit and completed NZD sale.</p>
          </div>
        </div>
        <div class="ds-kanban-board">
          ${stages.map(st => {
            const cards = leads.filter(d => d.status === st.id || (st.id === 'New Lead' && d.status === 'New') || (st.id === 'Won' && ['Converted', 'Sold'].includes(d.status)));
            const totalVal = cards.reduce((s, c) => s + Number(c.sale_value_nzd || c.budget_nzd || c.value || c.dealValue || 0), 0);
            return `
              <div class="ds-kanban-col" data-stage="${st.id}" ondragover="event.preventDefault()" ondrop="window.app.onKanbanDrop(event, '${st.id}')">
                <div class="ds-kanban-col-head">
                  <div style="display:flex;align-items:center;gap:8px;">
                    <span style="width:7px;height:7px;border-radius:50%;background:${st.dot};display:inline-block;"></span>
                    <span style="font-size:13.5px;font-weight:600;color:var(--ds-ink);">${st.label}</span>
                    <span style="font-size:12.5px;font-weight:500;color:var(--ds-ink-muted);">${cards.length}</span>
                  </div>
                  ${totalVal > 0 ? `<span style="font-size:12px;font-weight:600;color:var(--ds-ink-secondary);">${this.formatMoney(totalVal)}</span>` : ''}
                </div>
                ${cards.length === 0 ? `
                  <div style="padding:24px 12px;text-align:center;font-size:13px;color:var(--ds-ink-muted);border:1px dashed var(--ds-border-strong);border-radius:10px;background:var(--ds-surface);">
                    No deals in ${st.label}
                  </div>
                ` : cards.map(c => {
                  const days = Math.max(0, Math.floor((Date.now() - new Date(c.updated_at || c.created_at || Date.now()).getTime()) / 86400000));
                  const nextDt = c.next_action_at || c.follow_up_date || c.followUpDate;
                  const overdue = nextDt && new Date(nextDt) < new Date() && st.id !== 'Won' && st.id !== 'Lost';
                  const val = Number(c.sale_value_nzd || c.budget_nzd || c.value || c.dealValue || 0);
                  const pName = this._pageName(c.page_id || c.pageId);
                  const dueTxt = nextDt ? new Date(nextDt).toLocaleDateString('en-NZ', { timeZone: 'Pacific/Auckland', day: 'numeric', month: 'short' }) : 'No next step';
                  return `
                    <article class="ds-kanban-card" draggable="true" ondragstart="window.app.onKanbanDragStart(event, '${esc(c.id)}')" onclick="window.app.openLeadDrawer('${esc(c.id)}')">
                      <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;margin-bottom:8px;">
                        <span style="font-size:12px;color:var(--ds-ink-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(pName)}</span>
                        <span class="ds-pill ${overdue ? 'ds-pill-danger' : (days >= 3 ? 'ds-pill-warning' : 'ds-pill-neutral')}" style="font-size:11px;padding:1px 7px;">${overdue ? 'Overdue' : `${days}d`}</span>
                      </div>
                      <div style="font-size:14.5px;font-weight:600;color:var(--ds-ink);line-height:1.35;">${esc(c.name || c.full_name || 'Customer')}</div>
                      <div style="display:flex;align-items:center;gap:6px;margin-top:4px;font-size:13px;color:var(--ds-ink-muted);">
                        ${this._dsIcon('car', 13)}<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(c.vehicle_interest || 'Vehicle TBC')}</span>
                      </div>
                      <div style="display:flex;align-items:center;flex-wrap:wrap;gap:6px;margin-top:10px;">
                        <span class="ds-kanban-due-chip">${this._dsIcon('calendar', 12)}<span>Next: ${esc(dueTxt)}</span></span>
                        ${val > 0 ? `<span class="ds-pill ds-pill-info" style="font-weight:600;">${this.formatMoney(val)}</span>` : ''}
                      </div>
                      ${(c.finance_status || c.payment_preference) ? `<div style="margin-top:8px;">${this._dsFinancePill(c.finance_status, c.payment_preference)}</div>` : ''}
                      <div style="display:flex;align-items:center;justify-content:space-between;margin-top:12px;padding-top:10px;border-top:1px solid var(--ds-border);font-size:12px;color:var(--ds-ink-muted);">
                        <span style="font-weight:500;color:var(--ds-ink-secondary);">${esc(this._staffName(c.assigned_staff_id || c.assignedStaffId || c.assigned_to))}</span>
                        <span>${val > 0 ? 'NZD' : 'Value TBC'}</span>
                      </div>
                      <div class="kanban-card-stage-bar" onclick="event.stopPropagation()" style="margin-top:8px;">
                        <select class="kanban-stage-select ds-inline-input" style="height:30px;font-size:12px;" aria-label="Move stage for ${esc(c.name || 'deal')}" onchange="window.app.moveLeadStage('${esc(c.id)}', this.value)">
                          ${stages.map(opt => `<option value="${opt.id}" ${(c.status === opt.id || (opt.id === 'New Lead' && c.status === 'New')) ? 'selected' : ''}>Stage: ${opt.label}</option>`).join('')}
                        </select>
                      </div>
                    </article>`;
                }).join('')}
              </div>`;
          }).join('')}
        </div>
      </div>`;
  };

  // ==========================================================================
  // 5. TASKS & APPOINTMENTS — PRACTICAL DEALERSHIP AGENDA
  // ==========================================================================
  proto.renderTasks = function (tab) {
    if (!this.user) return;
    if (this.el.content) this.el.content.classList.remove('inbox-view-container');
    if (tab) this.currentTaskTab = tab;
    const active = this.currentTaskTab || 'today';

    this.el.title.innerHTML = `<h1 class="topbar-title">Tasks &amp; Appointments</h1>`;
    this.el.actions.innerHTML = `
      <button type="button" class="btn btn-secondary btn-sm" onclick="window.app.openBookAppointmentModal()">${this._dsIcon('calendar', 13)}<span>Book Yard Visit</span></button>
      <button type="button" class="btn btn-primary btn-sm" onclick="window.app.openAddTaskModal()">${this._dsIcon('plus', 13)}<span>Add Follow-up</span></button>`;

    const now = new Date();
    const todayNZ = this._getNZDate(now);
    const tasks = this._filterUserTasks ? this._filterUserTasks(this.svc ? this.svc.tasks : []) : [];

    const tabs = [
      { id: 'today', label: 'Today (NZ)', fn: t => t.status !== 'Done' && t.dueDate && this._getNZDate(t.dueDate) === todayNZ },
      { id: 'overdue', label: 'Overdue', fn: t => t.status !== 'Done' && t.dueDate && new Date(t.dueDate) < now && this._getNZDate(t.dueDate) < todayNZ },
      { id: 'upcoming', label: 'Upcoming', fn: t => t.status !== 'Done' && t.dueDate && this._getNZDate(t.dueDate) > todayNZ },
      { id: 'appointments', label: 'Yard Visits', fn: t => t.type === 'appointment' },
      { id: 'all', label: 'All', fn: () => true }
    ];
    const currentTabObj = tabs.find(t => t.id === active) || tabs[0];
    const list = tasks.filter(currentTabObj.fn);

    this.el.content.innerHTML = `
      <div style="max-width:1120px;margin:0 auto;">
        <div class="ds-page-header" style="margin-bottom:16px;">
          <div>
            <h2 class="ds-page-h1">Tasks &amp; Appointments</h2>
            <p class="ds-page-sub">Manage daily callbacks, follow-ups, and booked yard visits in New Zealand time.</p>
          </div>
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:16px;">
          <div class="ds-tabs" role="tablist">
            ${tabs.map(t => `
              <button type="button" role="tab" aria-selected="${active === t.id}" class="ds-tab-btn ${active === t.id ? 'active' : ''}" onclick="window.app.renderTasks('${t.id}')">
                <span>${t.label}</span>
                <span class="ds-tab-count">${tasks.filter(t.fn).length}</span>
              </button>`).join('')}
          </div>
          <span style="font-size:12px;color:var(--ds-ink-muted);">All times shown in New Zealand time (Pacific/Auckland)</span>
        </div>

        ${list.length === 0 ? `
          <div class="ds-empty-box">
            <div class="ds-empty-icon">${this._dsIcon('calendar', 20)}</div>
            <h3 class="ds-empty-title">Nothing scheduled in ${esc(currentTabObj.label)}</h3>
            <p class="ds-empty-desc">Book a customer yard visit / test drive or create a callback reminder so no buyer slips through the cracks.</p>
            <div style="display:flex;justify-content:center;gap:8px;flex-wrap:wrap;">
              <button type="button" class="btn btn-secondary btn-sm" onclick="window.app.openAddTaskModal()">Add Follow-up</button>
              <button type="button" class="btn btn-primary btn-sm" onclick="window.app.openBookAppointmentModal()">Book Yard Visit</button>
            </div>
          </div>
        ` : `
          <div class="ds-card">
            ${list.map(t => {
              const isAppt = t.type === 'appointment';
              const isDone = t.status === 'Done';
              const dueLabel = t.dueDate
                ? new Date(t.dueDate).toLocaleString('en-NZ', { timeZone: 'Pacific/Auckland', weekday: 'short', day: 'numeric', month: 'short', ...(isAppt ? { hour: '2-digit', minute: '2-digit' } : {}) })
                : 'No date set';
              return `
                <div class="ds-queue-row" style="cursor:default;">
                  <div style="display:flex;align-items:flex-start;gap:12px;min-width:0;flex:1;">
                    <input type="checkbox" style="margin-top:4px;cursor:pointer;" ${isDone ? 'checked' : ''} onchange="window.app.completeTask('${esc(t.id)}', this)">
                    <div style="min-width:0;">
                      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                        <span class="ds-pill ${isAppt ? 'ds-pill-info' : 'ds-pill-neutral'}">${isAppt ? this._dsIcon('calendar', 11) + ' Yard Visit' : this._dsIcon('phone', 11) + ' Follow-up'}</span>
                        <span style="font-size:13.5px;font-weight:600;color:${isDone ? 'var(--ds-ink-subtle)' : 'var(--ds-ink)'};${isDone ? 'text-decoration:line-through;' : ''}">${esc(t.title)}</span>
                      </div>
                      <div style="font-size:12px;color:var(--ds-ink-muted);margin-top:4px;">
                        ${esc(dueLabel)} · Owner: ${esc(this._staffName(t.assigned_to || t.assignedStaffId))}
                      </div>
                    </div>
                  </div>
                  <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;flex-wrap:wrap;">
                    ${!isDone ? `
                      <button type="button" class="btn btn-ghost btn-xs" onclick="window.app.rescheduleTask('${esc(t.id)}', 1)">Tomorrow</button>
                      <button type="button" class="btn btn-ghost btn-xs" onclick="window.app.rescheduleTask('${esc(t.id)}', 3)">+3d</button>
                    ` : ''}
                    ${isAppt ? `
                      <select class="input" style="height:28px;font-size:12px;width:116px;" onchange="window.app.updateAppointmentStatus('${esc(t.id)}', this.value)">
                        <option value="scheduled" ${(t.attendance_status || 'scheduled') === 'scheduled' ? 'selected' : ''}>Scheduled</option>
                        <option value="attended" ${t.attendance_status === 'attended' ? 'selected' : ''}>Attended</option>
                        <option value="no_show" ${t.attendance_status === 'no_show' ? 'selected' : ''}>No-Show</option>
                        <option value="cancelled" ${t.attendance_status === 'cancelled' ? 'selected' : ''}>Cancelled</option>
                      </select>
                    ` : ''}
                    ${(t.lead_id || t.leadId) ? `<button type="button" class="btn btn-secondary btn-xs" onclick="window.app.openLeadDrawer('${esc(t.lead_id || t.leadId)}')">Open Customer</button>` : ''}
                  </div>
                </div>`;
            }).join('')}
          </div>
        `}
      </div>`;
  };

  // ==========================================================================
  // 6. MARKETING / META — CLIENT-FACING 2-TAB VIEW (AD LEADS & CAMPAIGN RESULTS)
  // ==========================================================================
  proto.renderMetaAds = async function () {
    if (!this.user) return;
    if (this.el.content) this.el.content.classList.remove('inbox-view-container');
    const isAdmin = this.user.role === 'admin' || this.user.role === 'super_admin';
    this.el.title.innerHTML = `<h1 class="topbar-title">Marketing &amp; Meta</h1>`;

    if (!isAdmin) {
      this.el.actions.innerHTML = '';
      this.el.content.innerHTML = `
        <div class="ds-empty-box" style="max-width:520px;margin:24px auto;">
          <div class="ds-empty-icon">${this._dsIcon('lock', 20)}</div>
          <h3 class="ds-empty-title">Manager Access Only</h3>
          <p class="ds-empty-desc">Advertising results and campaign budgets are available only to dealership managers.</p>
          <button type="button" class="btn btn-secondary btn-sm" onclick="window.app.navigate('dashboard')">Return to My Day</button>
        </div>`;
      return;
    }

    if (this.adsActiveTab !== 'ad_leads' && this.adsActiveTab !== 'campaigns') {
      this.adsActiveTab = 'ad_leads';
    }
    this.adsDateRange = this.adsDateRange || 'last_30d';
    this.adsPageFilter = this.adsPageFilter || 'all';
    this.adsSearchQuery = this.adsSearchQuery || '';

    this.el.actions.innerHTML = `
      <button type="button" class="btn btn-secondary btn-sm" onclick="window.app.syncZernioLeadsFromMarketing()">${this._dsIcon('refresh', 13)}<span>Refresh Ad Leads</span></button>
      <button type="button" class="btn btn-primary btn-sm" onclick="window.app.syncLiveAds()">${this._dsIcon('refresh', 13)}<span>Update Campaign Results</span></button>`;

    if (!this._loadedZernioMarketing && this.svc) {
      this._loadedZernioMarketing = true;
      Promise.all([
        this.svc.syncZernioAds ? this.svc.syncZernioAds(this.adsDateRange, this.adsPageFilter, false).catch(() => null) : null,
        this.svc.fetchZernioLeadForms ? this.svc.fetchZernioLeadForms().then(r => { this.zernioLeadForms = r?.forms || []; }).catch(() => null) : null,
        this.svc.fetchBusinessStatus ? this.svc.fetchBusinessStatus().then(s => { this.businessStatusCache = s; }).catch(() => null) : null
      ]).then(() => {
        if (this.currentRoute === 'meta-ads') this.renderMetaAds();
      });
    }

    const adsState = this.svc?.zernioAdsState || null;
    const campaigns = adsState?.campaigns || (this.svc ? (this.svc.campaigns || []) : []);
    const totals = adsState?.totals || null;
    const nzdAccounts = adsState?.adAccounts || [];
    const excludedNonNzd = adsState?.excludedNonNzdAccounts || [];
    const leadForms = (this.zernioLeadForms || []).filter(f => {
      if (this.adsPageFilter === 'all') return true;
      return this._dsNormPage(f.pageId) === this._dsNormPage(this.adsPageFilter);
    });
    const bizStatus = this.businessStatusCache || null;
    const pages = this._getAccessiblePages ? this._getAccessiblePages() : [];

    // Scoped CRM Ad Leads (customer details, source, campaign, next action)
    const allLeads = this._getFilteredLeads ? this._getFilteredLeads(false) : (this.svc ? (this.svc.leads || []) : []);
    const adLeads = allLeads.filter(l => {
      if (this.adsPageFilter !== 'all' && this._dsNormPage(l.page_id || l.pageId) !== this._dsNormPage(this.adsPageFilter)) return false;
      const src = String(l.source || l.lead_source || '').toLowerCase();
      return src.includes('ad') || src.includes('meta') || src.includes('facebook') || src.includes('instagram') || Boolean(l.campaign_name || l.campaign_id || l.form_name || l.form_id);
    });

    const lastUpdatedTs = adsState?.lastSuccessfulSync || bizStatus?.adsLastUpdatedAt || null;
    const lastUpdatedTime = lastUpdatedTs
      ? new Date(lastUpdatedTs).toLocaleString('en-NZ', { timeZone: 'Pacific/Auckland', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
      : null;
    const freshnessLine = lastUpdatedTime
      ? `Advertising results were last updated at ${lastUpdatedTime} (NZ time).`
      : 'Advertising results have not been updated yet today.';

    const maxCampSpend = Math.max(1, ...campaigns.slice(0, 6).map(c => Number(c.spend || 0)));

    this.el.content.innerHTML = `
      <div style="max-width:1360px;margin:0 auto;">
        <div class="ds-page-header" style="margin-bottom:20px;">
          <div>
            <h2 class="ds-page-h1">Marketing &amp; Advertising Results</h2>
            <p class="ds-page-sub">
              ${esc(freshnessLine)} · New Zealand Dollars (NZD)
            </p>
          </div>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <select class="input" style="width:auto;min-width:170px;" aria-label="Filter by dealership page" onchange="window.app.adsPageFilter=this.value;window.app.renderMetaAds();">
              <option value="all">All Dealership Pages (${pages.length})</option>
              ${pages.map(p => `<option value="${esc(p.id || p.page_id)}" ${String(this.adsPageFilter) === String(p.id || p.page_id) ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
            </select>
            <select class="input" style="width:auto;min-width:140px;" aria-label="Date range" onchange="window.app.changeAdsDateRange(this.value)">
              <option value="last_7d" ${this.adsDateRange === 'last_7d' ? 'selected' : ''}>Last 7 Days</option>
              <option value="last_14d" ${this.adsDateRange === 'last_14d' ? 'selected' : ''}>Last 14 Days</option>
              <option value="last_30d" ${this.adsDateRange === 'last_30d' ? 'selected' : ''}>Last 30 Days</option>
              <option value="this_month" ${this.adsDateRange === 'this_month' ? 'selected' : ''}>This Month</option>
            </select>
          </div>
        </div>

        ${bizStatus?.notice ? `
          <div style="margin-bottom:16px;padding:12px 16px;background:var(--ds-warning-bg);border:1px solid var(--ds-warning-border);border-radius:10px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">
            <div style="display:flex;align-items:center;gap:10px;color:var(--ds-warning);font-size:13px;font-weight:600;">
              ${this._dsIcon('alert', 16)}
              <span>${esc(bizStatus.notice)}</span>
            </div>
            ${bizStatus.needsReconnect ? `
              <button type="button" class="btn btn-secondary btn-xs" onclick="window.app.settingsTab='accounts';window.app.navigate('settings');">Reconnect Facebook</button>
            ` : `
              <button type="button" class="btn btn-secondary btn-xs" onclick="window.app.syncZernioLeadsFromMarketing()">Refresh Ad Leads</button>
            `}
          </div>
        ` : ''}

        <!-- Client-Facing 2-Tab Navigation -->
        <div style="margin-bottom:18px;">
          <div class="ds-tabs" role="tablist">
            <button type="button" role="tab" aria-selected="${this.adsActiveTab === 'ad_leads'}" class="ds-tab-btn ${this.adsActiveTab === 'ad_leads' ? 'active' : ''}" onclick="window.app.switchAdsTab('ad_leads')">
              <span>Ad Leads</span><span class="ds-tab-count">${adLeads.length}</span>
            </button>
            <button type="button" role="tab" aria-selected="${this.adsActiveTab === 'campaigns'}" class="ds-tab-btn ${this.adsActiveTab === 'campaigns' ? 'active' : ''}" onclick="window.app.switchAdsTab('campaigns')">
              <span>Campaign Results</span><span class="ds-tab-count">${campaigns.length}</span>
            </button>
          </div>
        </div>

        ${this.adsActiveTab === 'ad_leads' ? `
          <div class="ds-card" style="margin-bottom:16px;">
            <div class="ds-card-header">
              <div>
                <h3 class="ds-card-title">Recent Ad Enquiries (${adLeads.length})</h3>
                <div class="ds-card-subtitle">Customers who submitted an enquiry from your Facebook or Instagram ads.</div>
              </div>
              <button type="button" class="btn btn-ghost btn-xs" onclick="window.app.navigate('leads')">Open All Leads →</button>
            </div>
            ${adLeads.length === 0 ? `
              <div class="ds-empty-box" style="border:none;border-radius:0;padding:34px 20px;">
                <div class="ds-empty-icon">${this._dsIcon('car', 18)}</div>
                <div class="ds-empty-title">No ad enquiries recorded yet</div>
                <div class="ds-empty-desc">When customers submit one of your active Facebook or Instagram lead forms, their details and vehicle interest appear here.</div>
                <button type="button" class="btn btn-secondary btn-sm" onclick="window.app.syncZernioLeadsFromMarketing()">${this._dsIcon('refresh', 13)}<span>Check for New Ad Leads</span></button>
              </div>
            ` : `
              <div class="ds-table-wrap">
                <table class="ds-table">
                  <thead>
                    <tr>
                      <th>Customer</th>
                      <th>Vehicle Interest</th>
                      <th>Dealership Page &amp; Source</th>
                      <th>Owner</th>
                      <th>Stage</th>
                      <th style="text-align:right;">Next Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${adLeads.slice(0, 25).map(l => {
                      const pageName = this._pageName(l.page_id || l.pageId) || 'Dealership Page';
                      const vehicle = l.vehicle_interest || l.vehicleInterest || 'Vehicle not specified';
                      const owner = (l.assigned_staff_id || l.assignedStaffId || l.assigned_to) ? this._staffName(l.assigned_staff_id || l.assignedStaffId || l.assigned_to) : 'Unassigned';
                      const sourceLabel = l.campaign_name || l.form_name || 'Facebook Ad';
                      return `
                        <tr class="clickable-row" onclick="window.app.openLeadDrawer('${esc(l.id)}')">
                          <td>
                            <div style="font-weight:600;color:var(--ds-ink);">${esc(l.name || 'Customer')}</div>
                            <div style="font-size:12px;color:var(--ds-ink-muted);">${esc(l.phone || l.email || 'No contact number')}</div>
                          </td>
                          <td>
                            <div style="font-weight:500;">${esc(vehicle)}</div>
                            ${this._dsFinancePill(l.finance_status || l.financeStatus, l.payment_preference || l.paymentPreference)}
                          </td>
                          <td>
                            <div style="font-weight:500;">${esc(pageName)}</div>
                            <div style="font-size:11.5px;color:var(--ds-ink-muted);">${esc(sourceLabel)}</div>
                          </td>
                          <td>${owner === 'Unassigned' ? '<span class="ds-pill ds-pill-warning">Unassigned</span>' : esc(owner)}</td>
                          <td>${this._dsStagePill(l.status)}</td>
                          <td style="text-align:right;" onclick="event.stopPropagation()">
                            <button type="button" class="btn btn-secondary btn-xs" onclick="window.app.openLeadDrawer('${esc(l.id)}')">Open Customer</button>
                          </td>
                        </tr>`;
                    }).join('')}
                  </tbody>
                </table>
              </div>
            `}
          </div>

          <div class="ds-card">
            <div class="ds-card-header">
              <div>
                <h3 class="ds-card-title">Active Lead Forms (${leadForms.length})</h3>
                <div class="ds-card-subtitle">Facebook and Instagram enquiry forms across your dealership pages.</div>
              </div>
            </div>
            <div class="ds-table-wrap">
              <table class="ds-table">
                <thead>
                  <tr>
                    <th>Dealership Page</th>
                    <th>Lead Form</th>
                    <th>Status</th>
                    <th style="text-align:right;">Submissions</th>
                    <th style="text-align:right;">Enquiries</th>
                  </tr>
                </thead>
                <tbody>
                  ${leadForms.length === 0 ? `
                    <tr><td colspan="5" style="text-align:center;padding:26px;color:var(--ds-ink-muted);">No lead forms found for the selected dealership page.</td></tr>
                  ` : leadForms.map(f => `
                    <tr>
                      <td>
                        <div style="display:flex;align-items:center;gap:8px;">
                          ${this._dsPageAvatar(f.pageName, f.platform, 'sm')}
                          <span style="font-weight:600;">${esc(f.pageName)}</span>
                        </div>
                      </td>
                      <td style="font-weight:600;color:var(--ds-ink);">${esc(f.name)}</td>
                      <td><span class="ds-pill ${f.status === 'ACTIVE' ? 'ds-pill-success' : 'ds-pill-neutral'}">${f.status === 'ACTIVE' ? 'Active' : 'Paused'}</span></td>
                      <td style="text-align:right;font-weight:700;">${f.leadsCount ?? 0}</td>
                      <td style="text-align:right;">
                        <button type="button" class="btn btn-ghost btn-xs" onclick="window.app.leadPageFilter='${esc(f.pageId)}';window.app.navigate('leads');">View Page Leads</button>
                      </td>
                    </tr>`).join('')}
                </tbody>
              </table>
            </div>
          </div>
        ` : `
          <div class="ds-metric-strip">
            <div class="ds-metric-tile" style="cursor:default;">
              <div class="ds-metric-label"><span>Advertising Spend (NZD)</span></div>
              <div class="ds-metric-value">${adsState?.insightsRetrievedSuccessfully ? this.formatMoney(totals.spendNzd) : 'No data'}</div>
              <div class="ds-metric-sub">${nzdAccounts.length} New Zealand ad account${nzdAccounts.length === 1 ? '' : 's'}</div>
            </div>
            <div class="ds-metric-tile" style="cursor:default;">
              <div class="ds-metric-label"><span>Ad Leads Received</span></div>
              <div class="ds-metric-value">${adsState?.insightsRetrievedSuccessfully ? totals.platformLeads.toLocaleString('en-NZ') : '—'}</div>
              <div class="ds-metric-sub">${totals ? totals.messagingConnections.toLocaleString('en-NZ') : 0} Messenger enquiries</div>
            </div>
            <div class="ds-metric-tile" style="cursor:default;">
              <div class="ds-metric-label"><span>CRM Enquiries Matched</span></div>
              <div class="ds-metric-value" style="color:var(--ds-success);">${totals ? totals.crmAttributedLeads : 0}</div>
              <div class="ds-metric-sub">Tracked to a dealership campaign</div>
            </div>
            <div class="ds-metric-tile" style="cursor:default;">
              <div class="ds-metric-label"><span>Cost per Ad Lead</span></div>
              <div class="ds-metric-value">${totals && totals.cplPlatformNzd !== null ? this.formatMoney(totals.cplPlatformNzd) : 'No data'}</div>
              <div class="ds-metric-sub">${totals ? `${this._formatNum(totals.impressions)} views · ${totals.ctr}% click rate` : 'Update results to calculate'}</div>
            </div>
          </div>

          ${excludedNonNzd.length > 0 ? `
            <div style="margin-bottom:16px;padding:12px 16px;background:var(--ds-canvas);border:1px solid var(--ds-border);border-radius:10px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">
              <div style="font-size:13px;color:var(--ds-ink-secondary);">
                <strong>Non-NZD accounts visible, excluded from NZD totals:</strong>
                ${excludedNonNzd.map(a => `<span class="ds-pill ds-pill-neutral" style="margin-left:6px;">${esc(a.name)} (${esc(a.currency)})</span>`).join('')}
                <div style="font-size:12px;color:var(--ds-ink-muted);margin-top:4px;">Spending in other currencies is never converted or mixed into NZD totals. Customer enquiries remain unaffected.</div>
              </div>
              <button type="button" class="btn btn-secondary btn-xs" onclick="window.app.settingsTab='accounts';window.app.navigate('settings');">Manage Ad Accounts</button>
            </div>
          ` : ''}

          <!-- Ad Accounts Spend & Leads Breakdown -->
          ${(() => {
            const allAdAccs = adsState?.allAdAccounts || adsState?.adAccounts || [];
            if (!allAdAccs || allAdAccs.length === 0) return '';
            return `
              <div class="ds-card" style="margin-bottom:16px;">
                <div class="ds-card-header">
                  <div>
                    <h3 class="ds-card-title">Connected Meta Ad Accounts (${allAdAccs.length})</h3>
                    <div class="ds-card-subtitle">Per-account advertising spend, leads, and cost per lead without double-counting.</div>
                  </div>
                  <button type="button" class="btn btn-secondary btn-xs" onclick="window.app.syncLiveAds()">${this._dsIcon('refresh', 12)}<span style="margin-left:4px;">Refresh Ad Results</span></button>
                </div>
                <div class="ds-table-wrap">
                  <table class="ds-table">
                    <thead>
                      <tr>
                        <th>Account Name &amp; ID</th>
                        <th>Currency</th>
                        <th style="text-align:right;">Spend</th>
                        <th style="text-align:right;">Active Campaigns</th>
                        <th style="text-align:right;">Ad Leads</th>
                        <th style="text-align:right;">Cost / Lead</th>
                        <th style="text-align:center;">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${allAdAccs.map(acc => {
                        const isTarget = String(acc.id || '').includes('1708985873733763');
                        const isNzd = (acc.currency || 'NZD').toUpperCase() === 'NZD';
                        const spendFmt = isNzd ? this.formatMoney(acc.spend || 0) : `${acc.currency || 'USD'} ${Number(acc.spend || 0).toFixed(2)}`;
                        const cplFmt = acc.cplPlatform !== null && acc.cplPlatform !== undefined ? (isNzd ? this.formatMoney(acc.cplPlatform) : `${acc.currency} ${Number(acc.cplPlatform).toFixed(2)}`) : '—';
                        return `
                          <tr style="${isTarget ? 'background:rgba(139, 122, 224, 0.05);' : ''}">
                            <td>
                              <div style="font-weight:600;color:var(--ds-ink);">${esc(acc.name || 'Ad Account')}</div>
                              <div style="font-size:11.5px;color:var(--ds-ink-muted);font-family:monospace;">${esc(acc.id || 'N/A')}</div>
                            </td>
                            <td><span class="ds-pill ${isNzd ? 'ds-pill-neutral' : 'ds-pill-warning'}">${esc(acc.currency || 'NZD')}</span></td>
                            <td style="text-align:right;font-weight:600;">${spendFmt}</td>
                            <td style="text-align:right;">${acc.activeCampaignsCount !== undefined ? acc.activeCampaignsCount : '—'}</td>
                            <td style="text-align:right;font-weight:600;color:var(--ds-success);">${acc.platformLeads !== undefined ? acc.platformLeads : 0}</td>
                            <td style="text-align:right;">${cplFmt}</td>
                            <td style="text-align:center;">
                              ${acc.needsPermissions ? `
                                <span class="ds-pill ds-pill-warning" title="Requires ads_read permission in Meta Business Login">Needs Permission</span>
                              ` : `
                                <span class="ds-pill ds-pill-success">Active</span>
                              `}
                            </td>
                          </tr>`;
                      }).join('')}
                    </tbody>
                  </table>
                </div>
              </div>
            `;
          })()}

          ${campaigns.length > 0 ? `
            <div class="ds-card" style="margin-bottom:16px;">
              <div class="ds-card-header">
                <div>
                  <h3 class="ds-card-title">Top Campaigns by Spend (NZD)</h3>
                  <div class="ds-card-subtitle">Click any campaign to view enquiries received from it.</div>
                </div>
              </div>
              <div class="ds-card-body">
                <div class="ds-bar-list">
                  ${campaigns.slice(0, 6).map(c => {
                    const pct = Math.max(3, Math.round((Number(c.spend || 0) / maxCampSpend) * 100));
                    return `
                      <div class="ds-bar-row" onclick="window.app.leadCampaignFilter='${esc(c.id || '')}';window.app.navigate('leads');">
                        <div class="ds-bar-meta">
                          <span style="font-weight:600;color:var(--ds-ink);">${esc(c.name)} <span style="font-weight:400;color:var(--ds-ink-muted);">· ${esc(c.adAccountName || '')}</span></span>
                          <span style="font-weight:600;white-space:nowrap;">${this.formatMoney(c.spend || 0)} · ${c.platformLeads || 0} ad leads</span>
                        </div>
                        <div class="ds-bar-track"><div class="ds-bar-fill" style="width:${pct}%;"></div></div>
                      </div>`;
                  }).join('')}
                </div>
              </div>
            </div>
          ` : ''}

          <div class="ds-card">
            <div class="ds-card-header">
              <div>
                <h3 class="ds-card-title">All New Zealand Campaigns (${campaigns.length})</h3>
                <div class="ds-card-subtitle">Click a campaign row to view its customer enquiries. Missing a campaign? Check <a href="#settings" onclick="window.app.navigate('settings');return false;" style="color:var(--ds-accent);text-decoration:underline;">Settings → Accounts</a>.</div>
              </div>
              <input type="text" class="input" style="width:220px;" placeholder="Filter campaigns…" value="${esc(this.adsSearchQuery)}" oninput="window.app.searchAds(this.value)">
            </div>
            <div id="ads-table-container">${this._renderAdsTable('campaigns', campaigns, [], [])}</div>
          </div>
        `}
      </div>`;
  };

  // ==========================================================================
  // 7. REPORTS — ORGANISED AROUND THE 5 DEALERSHIP BUSINESS QUESTIONS + CHARTS
  // ==========================================================================
  proto.renderReports = function () {
    if (!this.user) return;
    if (this.el.content) this.el.content.classList.remove('inbox-view-container');
    const isAdmin = this.user.role === 'admin' || this.user.role === 'super_admin';
    this.reportsDateRange = this.reportsDateRange || 'last_7d';
    this.reportsPageFilter = this.reportsPageFilter || 'all';

    this.el.title.innerHTML = `<h1 class="topbar-title">${isAdmin ? 'Business Reports' : 'My Performance'}</h1>`;
    this.el.actions.innerHTML = `
      <button type="button" class="btn btn-secondary btn-sm" id="btn-generate-report" onclick="window.app.generateReport()">${this._dsIcon('refresh', 13)}<span>Refresh</span></button>
      <button type="button" class="btn btn-primary btn-sm" onclick="window.app.exportReportsCsv()">Export CSV (NZD)</button>`;

    if (!this.reportsData && !this.reportsLoading) {
      this.reportsLoading = true;
      setTimeout(() => this.generateReport(), 40);
    }

    const pages = this._getAccessiblePages ? this._getAccessiblePages() : [];
    const rep = (this.reportsData && this.reportsData.summary) ? this.reportsData : this._buildLocalAuthorisedReport();
    const sum = rep.summary || {};
    const meta = rep.metadata || {};
    const pageBreakdown = rep.pageBreakdown || [];
    const staffBreakdown = rep.staffBreakdown || [];
    const campaignBreakdown = (rep.campaignBreakdown && rep.campaignBreakdown.length > 0)
      ? rep.campaignBreakdown
      : (this.svc?.zernioAdsState?.campaigns || []).map(c => ({
          campaignId: c.id, campaignName: c.name, pageName: c.adAccountName || c.pageName,
          spend: c.spend, platformLeads: c.platformLeads, crmLeads: c.crmLeadsCount || 0, cpl: c.cplPlatform, dealsWon: c.crmWonCount || 0
        }));
    const lostReasons = Object.entries(rep.lostReasons || {});

    const fmtMin = (m) => (m === null || m === undefined) ? 'No data' : (m < 60 ? `${m}m` : `${(m / 60).toFixed(1)}h`);
    const fmtRate = (n, d) => d > 0 ? `${((n / d) * 100).toFixed(1)}% (${n}/${d})` : 'No data';
    const maxPageEnq = Math.max(1, ...pageBreakdown.map(p => Number(p.enquiries ?? p.leads ?? 0)));
    const funnelBase = Math.max(1, Number(sum.totalEnquiries || 0));

    const funnelSteps = [
      { label: 'Enquiries Received', count: sum.totalEnquiries || 0, sub: sum.totalEnquiries ? '100% baseline' : 'No data', cls: '' },
      { label: 'Contacted by Rep', count: sum.contacted || 0, sub: fmtRate(sum.contacted || 0, sum.totalEnquiries || 0), cls: 'secondary' },
      { label: 'Qualified Buyer', count: sum.qualified || 0, sub: fmtRate(sum.qualified || 0, sum.totalEnquiries || 0), cls: 'secondary' },
      { label: 'Yard Visit Booked', count: sum.booked || 0, sub: fmtRate(sum.booked || 0, sum.totalEnquiries || 0), cls: '' },
      { label: 'Attended Yard Visit', count: sum.attended || 0, sub: fmtRate(sum.attended || 0, sum.booked || 0) + (sum.booked ? ' of booked' : ''), cls: '' },
      { label: 'Vehicle Sold', count: sum.dealsWon || 0, sub: fmtRate(sum.dealsWon || 0, sum.totalEnquiries || 0), cls: 'success' }
    ];

    this.el.content.innerHTML = `
      <div style="max-width:1360px;margin:0 auto;display:flex;flex-direction:column;gap:18px;">
        <!-- Consistent Filter Header -->
        <div class="ds-page-header" style="margin-bottom:4px;">
          <div>
            <h2 class="ds-page-h1">${isAdmin ? 'Dealership Performance Reports' : 'My Sales Results'}</h2>
            <p class="ds-page-sub">
              ${esc(meta.scope || (isAdmin ? 'All Authorised Pages' : 'Assigned Pages Only'))} · Pacific/Auckland (NZ) · NZD ($)
            </p>
          </div>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <select id="reports-page-select" class="input" style="width:auto;min-width:170px;" onchange="window.app.changeReportsPageFilter(this.value)">
              <option value="all">${isAdmin ? 'All Authorised Pages' : 'All Assigned Pages'}</option>
              ${pages.map(p => `<option value="${esc(p.id || p.page_id)}" ${String(this.reportsPageFilter) === String(p.id || p.page_id) ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
            </select>
            <select id="reports-daterange-select" class="input" style="width:auto;min-width:145px;" onchange="window.app.changeReportsDateRange(this.value)">
              <option value="today" ${this.reportsDateRange === 'today' ? 'selected' : ''}>Today (NZ)</option>
              <option value="yesterday" ${this.reportsDateRange === 'yesterday' ? 'selected' : ''}>Yesterday (NZ)</option>
              <option value="last_7d" ${this.reportsDateRange === 'last_7d' ? 'selected' : ''}>Last 7 Days (NZ)</option>
              <option value="last_30d" ${this.reportsDateRange === 'last_30d' ? 'selected' : ''}>Last 30 Days (NZ)</option>
              <option value="this_month" ${this.reportsDateRange === 'this_month' ? 'selected' : ''}>This Month (NZ)</option>
            </select>
          </div>
        </div>

        <!-- Summary Strip -->
        <div class="ds-metric-strip" style="margin-bottom:0;">
          <button type="button" class="ds-metric-tile" onclick="window.app.drillDownReportToLeads({ pageId: window.app.reportsPageFilter })">
            <div class="ds-metric-label"><span>Enquiries / Unique Buyers</span></div>
            <div class="ds-metric-value">${sum.totalEnquiries ?? 0} <span style="font-size:15px;font-weight:500;color:var(--ds-ink-muted);">/ ${sum.uniqueContacts ?? 0}</span></div>
            <div class="ds-metric-sub">Repeat vehicle enquiries counted separately</div>
          </button>
          <div class="ds-metric-tile" style="cursor:default;">
            <div class="ds-metric-label"><span>Human Response (Median / p90)</span></div>
            <div class="ds-metric-value">${fmtMin(sum.medianHumanResponseMin)} <span style="font-size:15px;font-weight:500;color:var(--ds-ink-muted);">/ ${fmtMin(sum.p90HumanResponseMin)}</span></div>
            <div class="ds-metric-sub">Excludes automated replies (n=${sum.humanResponsesSampleSize || 0})</div>
          </div>
          <div class="ds-metric-tile" style="cursor:default;">
            <div class="ds-metric-label"><span>Booked / Attended Visits</span></div>
            <div class="ds-metric-value">${sum.booked ?? 0} <span style="font-size:15px;font-weight:500;color:var(--ds-ink-muted);">/ ${sum.attended ?? 0}</span></div>
            <div class="ds-metric-sub">Attendance: ${fmtRate(sum.attended || 0, sum.booked || 0)}</div>
          </div>
          <button type="button" class="ds-metric-tile" onclick="window.app.drillDownReportToLeads({ status: 'Won' })">
            <div class="ds-metric-label"><span>Vehicles Sold (NZD)</span></div>
            <div class="ds-metric-value" style="color:var(--ds-success);">${sum.dealsWon ?? 0} <span style="font-size:14px;font-weight:600;">(${sum.totalWonValue > 0 ? this.formatMoney(sum.totalWonValue) : 'No value recorded'})</span></div>
            <div class="ds-metric-sub">Sale rate: ${fmtRate(sum.dealsWon || 0, sum.totalEnquiries || 0)}</div>
          </button>
        </div>

        <!-- Q1 + Q3/Q4 SIDE BY SIDE VISUAL CHARTS -->
        <div class="ds-overview-grid" style="grid-template-columns:1fr 1fr;">
          <!-- Q1: Where are enquiries coming from? -->
          <section class="ds-card">
            <div class="ds-card-header">
              <div>
                <h3 class="ds-card-title">Where are our enquiries coming from?</h3>
                <div class="ds-card-subtitle">Click any dealership page to inspect its enquiries</div>
              </div>
            </div>
            <div class="ds-card-body">
              ${pageBreakdown.length === 0 ? `
                <div style="text-align:center;padding:24px;color:var(--ds-ink-muted);font-size:13px;">No enquiries recorded in this period.</div>
              ` : `
                <div class="ds-bar-list">
                  ${pageBreakdown.map(p => {
                    const cnt = Number(p.enquiries ?? p.leads ?? 0);
                    const pct = cnt > 0 ? Math.max(4, Math.round((cnt / maxPageEnq) * 100)) : 0;
                    return `
                      <div class="ds-bar-row" onclick="window.app.drillDownReportToLeads({ pageId: '${esc(p.pageId)}' })">
                        <div class="ds-bar-meta">
                          <span style="font-weight:600;color:var(--ds-ink);">${esc(p.pageName)}</span>
                          <span style="color:var(--ds-ink-secondary);font-weight:600;">${cnt} enquiries · ${p.dealsWon || 0} sold</span>
                        </div>
                        <div class="ds-bar-track"><div class="ds-bar-fill secondary" style="width:${pct}%;"></div></div>
                      </div>`;
                  }).join('')}
                </div>
              `}
            </div>
          </section>

          <!-- Q3 & Q4: Are enquiries becoming appointments & sales? -->
          <section class="ds-card">
            <div class="ds-card-header">
              <div>
                <h3 class="ds-card-title">Are enquiries becoming visits &amp; sales?</h3>
                <div class="ds-card-subtitle">Acquisition cohort · Every rate shows numerator / denominator</div>
              </div>
            </div>
            <div class="ds-card-body">
              <div class="ds-bar-list">
                ${funnelSteps.map(step => {
                  const pct = sum.totalEnquiries > 0 ? Math.max(step.count > 0 ? 4 : 0, Math.round((step.count / funnelBase) * 100)) : 0;
                  return `
                    <div class="ds-bar-row" style="cursor:default;">
                      <div class="ds-bar-meta">
                        <span style="font-weight:600;color:var(--ds-ink);">${step.label}</span>
                        <span style="color:var(--ds-ink-secondary);"><strong>${step.count}</strong> · ${step.sub}</span>
                      </div>
                      <div class="ds-bar-track"><div class="ds-bar-fill ${step.cls}" style="width:${pct}%;"></div></div>
                    </div>`;
                }).join('')}
              </div>
              ${lostReasons.length > 0 ? `
                <div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--ds-border);display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
                  <span style="font-size:11.5px;font-weight:600;color:var(--ds-ink-muted);">Lost Reasons:</span>
                  ${lostReasons.map(([r, c]) => `<span class="ds-pill ds-pill-neutral">${esc(r)}: ${c}</span>`).join('')}
                </div>
              ` : ''}
            </div>
          </section>
        </div>

        <!-- Q2: Are staff responding? -->
        <section class="ds-card">
          <div class="ds-card-header">
            <div>
              <h3 class="ds-card-title">Are staff responding and converting?</h3>
              <div class="ds-card-subtitle">Response speed measures first human reply only (excludes automated messages)</div>
            </div>
          </div>
          <div class="ds-table-wrap">
            <table class="ds-table">
              <thead>
                <tr>
                  <th>Salesperson</th>
                  <th style="text-align:right;">Assigned Enquiries</th>
                  <th style="text-align:right;">Median Human Response</th>
                  <th style="text-align:right;">Booked Visits</th>
                  <th style="text-align:right;">Sold</th>
                  <th style="text-align:right;">Recorded Value (NZD)</th>
                </tr>
              </thead>
              <tbody>
                ${staffBreakdown.length === 0 ? `
                  <tr><td colspan="6" style="text-align:center;padding:24px;color:var(--ds-ink-muted);">No staff activity recorded in this period.</td></tr>
                ` : staffBreakdown.map(s => `
                  <tr>
                    <td style="font-weight:600;">${esc(s.staffName || s.name || 'Staff')}</td>
                    <td style="text-align:right;font-weight:600;">${s.assigned ?? s.leads ?? 0}</td>
                    <td style="text-align:right;">${fmtMin(s.medianHumanResponseMin)}</td>
                    <td style="text-align:right;">${s.booked ?? 0}</td>
                    <td style="text-align:right;font-weight:600;color:var(--ds-success);">${s.dealsWon ?? 0}</td>
                    <td style="text-align:right;font-weight:600;">${(s.saleValueNzd || 0) > 0 ? this.formatMoney(s.saleValueNzd) : 'No value recorded'}</td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </section>

        <!-- Q5: Which campaigns produce useful outcomes? (Managers only) -->
        ${isAdmin ? `
        <section class="ds-card">
          <div class="ds-card-header">
            <div>
              <h3 class="ds-card-title">Which Meta campaigns produce useful outcomes?</h3>
              <div class="ds-card-subtitle">NZD ad spend &amp; platform leads shown alongside CRM enquiries — missing values are never fabricated</div>
            </div>
            <button type="button" class="btn btn-ghost btn-xs" onclick="window.app.navigate('meta-ads')">Open Marketing →</button>
          </div>
          <div class="ds-table-wrap">
            <table class="ds-table">
              <thead>
                <tr>
                  <th>Campaign</th>
                  <th>Ad Account / Page</th>
                  <th style="text-align:right;">Spend (NZD)</th>
                  <th style="text-align:right;">Meta Leads</th>
                  <th style="text-align:right;">CRM Enquiries</th>
                  <th style="text-align:right;">CPL (NZD)</th>
                  <th style="text-align:right;">Sold</th>
                </tr>
              </thead>
              <tbody>
                ${campaignBreakdown.length === 0 ? `
                  <tr><td colspan="7" style="text-align:center;padding:24px;color:var(--ds-ink-muted);">No campaign results updated for this period yet. Open Marketing &amp; Meta to refresh NZD campaign results.</td></tr>
                ` : campaignBreakdown.slice(0, 10).map(c => `
                  <tr class="clickable-row" onclick="window.app.leadCampaignFilter='${esc(c.campaignId || '')}';window.app.navigate('leads');">
                    <td style="font-weight:600;">${esc(c.campaignName || 'Campaign')}</td>
                    <td style="font-size:12px;color:var(--ds-ink-muted);">${esc(c.pageName || '—')}</td>
                    <td style="text-align:right;font-weight:600;">${c.spend !== null && c.spend !== undefined ? this.formatMoney(c.spend) : 'Not updated'}</td>
                    <td style="text-align:right;">${c.platformLeads ?? '—'}</td>
                    <td style="text-align:right;font-weight:600;color:var(--ds-success);">${c.crmLeads ?? c.leads ?? 0}</td>
                    <td style="text-align:right;">${c.cpl !== null && c.cpl !== undefined ? this.formatMoney(c.cpl) : 'No data'}</td>
                    <td style="text-align:right;font-weight:600;">${c.dealsWon ?? 0}</td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </section>` : ''}

        <div style="font-size:11.5px;color:var(--ds-ink-muted);padding:0 2px;">
          <strong>How figures are calculated:</strong> ${esc(meta.cohortExplanation || 'Enquiries received within the selected New Zealand date range. Missing ad spend or sale values are shown as No data.')}
        </div>
      </div>`;
  };

  // ==========================================================================
  // 8. SETTINGS & ACCOUNTS (DISCREET CLIENT-FACING ACCOUNT MANAGEMENT)
  // ==========================================================================
  proto.renderConnections = function () {
    this.settingsTab = 'accounts';
    this.renderSettings();
  };

  proto.renderSettings = function () {
    if (!this.user) return;
    if (this.el.content) this.el.content.classList.remove('inbox-view-container');
    const isAdmin = this.user.role === 'admin' || this.user.role === 'super_admin';
    this.el.title.innerHTML = `<h1 class="topbar-title">Settings</h1>`;
    this.el.actions.innerHTML = '';

    if (!isAdmin) {
      this.el.content.innerHTML = `
        <div class="ds-empty-box" style="max-width:520px;margin:24px auto;">
          <div class="ds-empty-icon">${this._dsIcon('lock', 20)}</div>
          <h3 class="ds-empty-title">Manager Access Only</h3>
          <p class="ds-empty-desc">Dealership settings and connected accounts are managed by your dealership manager.</p>
          <button type="button" class="btn btn-secondary btn-sm" onclick="window.app.navigate('dashboard')">Return to My Day</button>
        </div>`;
      return;
    }

    const tab = (this.settingsTab === 'accounts') ? 'accounts' : 'general';
    this.settingsTab = tab;

    if (tab === 'accounts' && !this._loadedBizStatusSettings && this.svc && this.svc.fetchBusinessStatus) {
      this._loadedBizStatusSettings = true;
      this.svc.fetchBusinessStatus().then(s => {
        this.businessStatusCache = s;
        if (this.currentRoute === 'settings' || this.currentRoute === 'connections' || this.currentRoute === 'integrations') {
          this.renderSettings();
        }
      }).catch(() => {});
    }

    const pages = this._getAccessiblePages ? this._getAccessiblePages() : [];
    const bizStatus = this.businessStatusCache || null;
    const statusById = new Map((bizStatus?.pages || []).map(p => [this._dsNormPage(p.pageId), p]));
    const displayPages = (bizStatus?.pages && bizStatus.pages.length > 0)
      ? bizStatus.pages
      : pages.map(p => ({
          pageId: p.id || p.page_id,
          pageName: p.name || 'Dealership Page',
          platform: p.platform || 'facebook',
          status: 'Connected',
          needsReconnect: false
        }));

    this.el.content.innerHTML = `
      <div style="max-width:980px;margin:0 auto;">
        <div style="margin-bottom:18px;">
          <div class="ds-tabs" role="tablist">
            <button type="button" role="tab" aria-selected="${tab === 'general'}" class="ds-tab-btn ${tab === 'general' ? 'active' : ''}" onclick="window.app.settingsTab='general';window.app.renderSettings();">
              <span>General</span>
            </button>
            <button type="button" role="tab" aria-selected="${tab === 'accounts'}" class="ds-tab-btn ${tab === 'accounts' ? 'active' : ''}" onclick="window.app.settingsTab='accounts';window.app.renderSettings();">
              <span>Accounts</span><span class="ds-tab-count">${displayPages.length}</span>
            </button>
          </div>
        </div>

        ${tab === 'general' ? `
          <div style="display:grid;grid-template-columns:1fr;gap:16px;max-width:600px;">
            <section class="ds-card">
              <div class="ds-card-header">
                <div>
                  <h3 class="ds-card-title">Dealership Workspace</h3>
                  <div class="ds-card-subtitle">Regional settings for your New Zealand dealership group.</div>
                </div>
              </div>
              <div class="ds-card-body" style="display:flex;flex-direction:column;gap:14px;">
                <div>
                  <label class="settings-label">Dealership Name</label>
                  <input type="text" id="ds-workspace-name" class="input" value="${esc(this.selectedWorkspace || 'Nova Autos NZ')}">
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                  <div>
                    <label class="settings-label">Business Timezone</label>
                    <input type="text" class="input" value="New Zealand (Pacific/Auckland)" disabled>
                  </div>
                  <div>
                    <label class="settings-label">Currency</label>
                    <input type="text" class="input" value="New Zealand Dollar (NZD $)" disabled>
                  </div>
                </div>
                <div>
                  <button type="button" class="btn btn-primary btn-sm" onclick="window.app.toast('Settings saved.', 'success')">Save Changes</button>
                </div>
              </div>
            </section>

            <section class="ds-card">
              <div class="ds-card-header">
                <div>
                  <h3 class="ds-card-title">Desktop App</h3>
                  <div class="ds-card-subtitle">Optional Windows &amp; macOS app synced to your dealership workspace.</div>
                </div>
                <a href="download.html" target="_blank" class="btn btn-secondary btn-sm">Download App</a>
              </div>
            </section>
          </div>
        ` : `
          <div style="display:flex;flex-direction:column;gap:16px;">
            ${bizStatus?.notice ? `
              <div style="padding:12px 16px;background:var(--ds-warning-bg);border:1px solid var(--ds-warning-border);border-radius:10px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">
                <div style="display:flex;align-items:center;gap:10px;color:var(--ds-warning);font-size:13px;font-weight:600;">
                  ${this._dsIcon('alert', 16)}
                  <span>${esc(bizStatus.notice)}</span>
                </div>
                ${bizStatus.needsReconnect ? `
                  <button type="button" class="btn btn-primary btn-xs" onclick="window.app.connectFacebookOAuth()">Reconnect Facebook</button>
                ` : ''}
              </div>
            ` : ''}

            <section class="ds-card">
              <div class="ds-card-header">
                <div>
                  <h3 class="ds-card-title">Connected Dealership Pages (${displayPages.length})</h3>
                  <div class="ds-card-subtitle">Manage which Facebook Pages and Instagram accounts send messages and enquiries into your CRM.</div>
                </div>
                <div style="display:flex;gap:8px;flex-wrap:wrap;">
                  <button type="button" id="btn-main-connect-fb" class="btn btn-primary btn-sm" onclick="window.app.connectFacebookOAuth()">
                    ${this._dsIcon('plus', 14)}<span id="connect-fb-btn-text">Add Facebook Page</span>
                  </button>
                  <button type="button" id="btn-main-connect-ig" class="btn btn-secondary btn-sm" onclick="window.app.connectInstagramOAuth()">
                    <span id="connect-ig-btn-text">Add Instagram Account</span>
                  </button>
                </div>
              </div>
              <div class="ds-table-wrap">
                <table class="ds-table">
                  <thead>
                    <tr>
                      <th>Dealership Page</th>
                      <th>Channel</th>
                      <th>Status</th>
                      <th style="text-align:right;">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${displayPages.length === 0 ? `
                      <tr>
                        <td colspan="4" style="text-align:center;padding:32px;color:var(--ds-ink-muted);">
                          No dealership pages connected yet. Click <strong>Add Facebook Page</strong> to get started.
                        </td>
                      </tr>
                    ` : displayPages.map(p => {
                      const st = statusById.get(this._dsNormPage(p.pageId)) || p;
                      const needsRe = Boolean(st.needsReconnect);
                      const isIg = String(p.platform || '').toLowerCase().includes('insta');
                      return `
                        <tr>
                          <td>
                            <div style="display:flex;align-items:center;gap:10px;">
                              ${this._dsPageAvatar(p.pageName, p.platform, 'sm')}
                              <span style="font-weight:600;color:var(--ds-ink);">${esc(p.pageName)}</span>
                            </div>
                          </td>
                          <td style="font-size:13px;color:var(--ds-ink-secondary);">${isIg ? 'Instagram' : 'Facebook'}</td>
                          <td>
                            <span class="ds-pill ${needsRe ? 'ds-pill-warning' : 'ds-pill-success'}">
                              ${needsRe ? 'Needs Reconnecting' : 'Connected'}
                            </span>
                          </td>
                          <td style="text-align:right;">
                            ${needsRe ? `
                              <button type="button" class="btn btn-primary btn-xs" onclick="${isIg ? 'window.app.connectInstagramOAuth()' : 'window.app.connectFacebookOAuth()'}">${isIg ? 'Reconnect Instagram' : 'Reconnect Facebook'}</button>
                            ` : `
                              <button type="button" class="btn btn-ghost btn-xs" onclick="window.app.openPageInInbox('${esc(p.pageId)}')">Open Inbox</button>
                            `}
                          </td>
                        </tr>`;
                    }).join('')}
                  </tbody>
                </table>
              </div>
            </section>

            <section class="ds-card">
              <div class="ds-card-header">
                <div>
                  <h3 class="ds-card-title">Meta Advertising Accounts (${(this.svc?.zernioAdsState?.allAdAccounts || this.svc?.zernioAdsState?.adAccounts || []).length})</h3>
                  <div class="ds-card-subtitle">Authorise Meta Ads accounts separately from Facebook Pages, and choose which accounts belong to your dealership.</div>
                </div>
                <div style="display:flex;gap:8px;flex-wrap:wrap;">
                  <button type="button" class="btn btn-secondary btn-sm" onclick="window.app.syncLiveAds()">${this._dsIcon('refresh', 13)}<span>Refresh Ad Accounts</span></button>
                  <button type="button" class="btn btn-primary btn-sm" onclick="window.app.connectMetaAdsOAuth()">${this._dsIcon('plus', 14)}<span>Connect Meta Ads</span></button>
                </div>
              </div>
              <div class="ds-table-wrap">
                ${(() => {
                  const allAdAccs = this.svc?.zernioAdsState?.allAdAccounts
                    || [...(this.svc?.zernioAdsState?.adAccounts || []), ...(this.svc?.zernioAdsState?.excludedNonNzdAccounts || [])];
                  const excludedByUser = this.getExcludedAdAccountIds ? this.getExcludedAdAccountIds() : new Set();
                  if (!allAdAccs || allAdAccs.length === 0) {
                    return `<div style="padding:26px 20px;text-align:center;font-size:13.5px;color:var(--ds-ink-muted);">Click <strong>Refresh Ad Accounts</strong> to view connected Meta Ads accounts, or click <strong>Connect Meta Ads</strong> to authorise a new ad account.</div>`;
                  }
                  return `
                    <table class="ds-table">
                      <thead>
                        <tr>
                          <th>Ad Account</th>
                          <th>Currency</th>
                          <th>Reporting Status</th>
                          <th style="text-align:right;">Dealership Reporting</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${allAdAccs.map(a => {
                          const isNzd = a.isNzd !== false && String(a.currency || '').toUpperCase() === 'NZD';
                          const isEnabled = isNzd && !excludedByUser.has(String(a.id));
                          return `
                            <tr>
                              <td>
                                <div style="font-weight:600;color:var(--ds-ink);">${esc(a.name || a.id)}</div>
                                <div style="font-size:12px;color:var(--ds-ink-muted);">${esc(a.primaryPageName || 'Connected Meta Ads')}</div>
                              </td>
                              <td><span class="ds-pill ${isNzd ? 'ds-pill-info' : 'ds-pill-neutral'}">${esc(a.currency || 'Unknown')}</span></td>
                              <td style="font-size:13px;color:var(--ds-ink-secondary);">
                                ${isNzd ? (isEnabled ? '<span class="ds-pill ds-pill-success">Included in NZD totals</span>' : '<span class="ds-pill ds-pill-neutral">Excluded by manager</span>') : `<span class="ds-pill ds-pill-warning">Excluded from NZD totals (${esc(a.currency)})</span>`}
                              </td>
                              <td style="text-align:right;">
                                ${isNzd ? `
                                  <label style="display:inline-flex;align-items:center;gap:6px;font-size:12.5px;color:var(--ds-ink-secondary);cursor:pointer;">
                                    <input type="checkbox" ${isEnabled ? 'checked' : ''} onchange="window.app.toggleAdAccountEnabled('${esc(a.id)}', this.checked)">
                                    <span>${isEnabled ? 'Enabled' : 'Disabled'}</span>
                                  </label>
                                ` : `<span style="font-size:12px;color:var(--ds-ink-muted);">Native currency preserved</span>`}
                              </td>
                            </tr>`;
                        }).join('')}
                      </tbody>
                    </table>`;
                })()}
              </div>
              <div style="padding:12px 16px;background:#F9F9FB;border-top:1px solid var(--ds-border);font-size:12.5px;color:var(--ds-ink-secondary);line-height:1.5;">
                <strong>Missing an ad account?</strong> If an ad account running in Meta Ads Manager (such as <code>1708985873733763</code>) is not appearing above, click <strong>Connect Meta Ads</strong> to sign in with the Facebook account that owns that ad account, or add your connected Facebook profile as an ad account administrator in Meta Business Suite.
              </div>
            </section>
          </div>
        `}
      </div>`;
  };

  // ==========================================================================
  // 9. DEVELOPER-ONLY DIAGNOSTICS (SERVER-SIDE AUTHORIZED, NEVER FOR DEALERSHIP ROLES)
  // ==========================================================================
  proto.renderDeveloperDiagnostics = async function () {
    if (!this.user) return;
    if (this.el.content) this.el.content.classList.remove('inbox-view-container');
    this.el.title.innerHTML = `<h1 class="topbar-title">Developer Diagnostics</h1>`;
    this.el.actions.innerHTML = '';

    this.el.content.innerHTML = `
      <div style="max-width:960px;margin:0 auto;padding:24px 0;">
        <div class="ds-empty-box">
          <div class="ds-empty-icon">${this._dsIcon('shield', 20)}</div>
          <div class="ds-empty-title">Verifying Developer Permissions…</div>
          <div class="ds-empty-desc">Checking server-side developer authorization.</div>
        </div>
      </div>`;

    try {
      const headers = (this.svc && this.svc.getAuthHeaders) ? this.svc.getAuthHeaders(false) : {};
      const [hRes, dRes] = await Promise.all([
        fetch('/api/zernio?path=health', { headers }),
        fetch('/api/zernio?path=diagnostics', { headers })
      ]);

      if (hRes.status === 403 || dRes.status === 403 || hRes.status === 401 || dRes.status === 401) {
        this.el.content.innerHTML = `
          <div style="max-width:540px;margin:28px auto;">
            <div class="ds-empty-box">
              <div class="ds-empty-icon">${this._dsIcon('lock', 20)}</div>
              <h3 class="ds-empty-title">Developer Access Required</h3>
              <p class="ds-empty-desc">
                System diagnostics and integration logs are restricted to authorized developers via server-side permissions. Dealership manager and staff accounts do not have developer access.
              </p>
              <button type="button" class="btn btn-secondary btn-sm" onclick="window.app.navigate('dashboard')">Return to Overview</button>
            </div>
          </div>`;
        return;
      }

      const health = await hRes.json();
      const diag = await dRes.json();

      this.el.actions.innerHTML = `
        <button type="button" class="btn btn-secondary btn-sm" onclick="window.app.renderDeveloperDiagnostics()">${this._dsIcon('refresh', 13)}<span>Refresh Diagnostics</span></button>`;

      const ing = diag.ingestion || {};
      const wh = health.webhookHealth || {};
      const pages = Array.isArray(health.pages) ? health.pages : [];

      this.el.content.innerHTML = `
        <div style="max-width:1280px;margin:0 auto;display:flex;flex-direction:column;gap:16px;">
          <div style="padding:10px 14px;background:var(--ds-surface);border:1px solid var(--ds-border);border-radius:8px;font-size:12px;color:var(--ds-ink-secondary);">
            <strong>Developer-Only Console:</strong> Protected by server-side developer authorization. Secrets, tokens, and signing keys are never returned or rendered.
          </div>

          <div class="ds-metric-strip" style="margin-bottom:0;">
            <div class="ds-metric-tile" style="cursor:default;">
              <div class="ds-metric-label"><span>Webhook Delivery</span></div>
              <div class="ds-metric-value" style="font-size:18px;">${wh.active ? 'Active' : esc(wh.status || 'Inactive')}</div>
              <div class="ds-metric-sub">HMAC: ${health.webhookSignatureEnforced ? 'Enforced' : 'Not configured'}</div>
            </div>
            <div class="ds-metric-tile" style="cursor:default;">
              <div class="ds-metric-label"><span>Webhooks Processed</span></div>
              <div class="ds-metric-value">${ing.webhooksProcessed || 0}</div>
              <div class="ds-metric-sub">${ing.duplicatesIgnored || 0} duplicate(s) ignored</div>
            </div>
            <div class="ds-metric-tile" style="cursor:default;">
              <div class="ds-metric-label"><span>Failed / Retry Queue</span></div>
              <div class="ds-metric-value">${ing.failedCount || 0} / ${ing.recoveryQueueSize || 0}</div>
              <div class="ds-metric-sub">Failed webhook events</div>
            </div>
            <div class="ds-metric-tile" style="cursor:default;">
              <div class="ds-metric-label"><span>Connected Accounts</span></div>
              <div class="ds-metric-value">${pages.length}</div>
              <div class="ds-metric-sub">Live provider accounts</div>
            </div>
          </div>

          <section class="ds-card">
            <div class="ds-card-header">
              <div>
                <h3 class="ds-card-title">Provider Connection &amp; Readiness Matrix</h3>
                <div class="ds-card-subtitle">Live status per connected account (no secrets exposed).</div>
              </div>
            </div>
            <div class="ds-table-wrap">
              <table class="ds-table">
                <thead>
                  <tr>
                    <th>Page</th>
                    <th>Connected</th>
                    <th>Permissions</th>
                    <th>Subscription</th>
                    <th>Leads Received</th>
                    <th>Ad Account</th>
                    <th>Insights</th>
                  </tr>
                </thead>
                <tbody>
                  ${pages.map(p => `
                    <tr>
                      <td style="font-weight:600;">${esc(p.pageName)}</td>
                      <td>${p.accountConnected ? 'Yes' : 'No'}</td>
                      <td>${p.permissionsVerified?.allCoreGranted ? 'Verified' : 'Incomplete'}</td>
                      <td>${p.subscriptionVerified?.verified ? 'Verified' : 'Blocked'}</td>
                      <td>${p.leadReceivedSuccessfully ? 'Yes' : 'None'}</td>
                      <td>${p.adAccountConnected ? 'Linked' : 'None'}</td>
                      <td>${p.insightsRetrievedSuccessfully ? 'Synced' : 'Not synced'}</td>
                    </tr>`).join('')}
                </tbody>
              </table>
            </div>
          </section>

          <section class="ds-card">
            <div class="ds-card-header">
              <h3 class="ds-card-title">Sanitized Diagnostic Snapshot</h3>
            </div>
            <div class="ds-card-body">
              <pre class="ds-diagnostics-pre">${esc(JSON.stringify({ webhookHealth: wh, adsSyncState: health.adsSyncState, ingestion: ing }, null, 2))}</pre>
            </div>
          </section>
        </div>`;
    } catch (e) {
      this.el.content.innerHTML = `
        <div style="max-width:540px;margin:28px auto;">
          <div class="ds-empty-box">
            <div class="ds-empty-icon">${this._dsIcon('alert', 20)}</div>
            <h3 class="ds-empty-title">Diagnostics Unavailable</h3>
            <p class="ds-empty-desc">Could not reach the diagnostics endpoint right now.</p>
          </div>
        </div>`;
    }
  };
})();
