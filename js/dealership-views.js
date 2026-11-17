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
    { bg: '#EEF2FF', fg: '#3730A3' },
    { bg: '#FFF7ED', fg: '#C2410C' },
    { bg: '#ECFDF5', fg: '#047857' },
    { bg: '#EFF6FF', fg: '#1D4ED8' },
    { bg: '#F5F3FF', fg: '#6D28D9' },
    { bg: '#FEF3C7', fg: '#B45309' }
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
    this.inboxTab = 'needs_reply';
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

    if (!this._loadedDashHealth && this.svc && this.svc.fetchZernioHealth) {
      this._loadedDashHealth = true;
      this.svc.fetchZernioHealth().then(h => {
        this.zernioHealthCache = h;
        if (this.currentRoute === 'dashboard') this.renderDashboard();
      }).catch(() => {});
    }
    if (!this._fetchedServerConvs && this.svc && this.svc.fetchRemoteConversations) {
      this._fetchedServerConvs = true;
      this.svc.fetchRemoteConversations().then(() => {
        if (this.currentRoute === 'dashboard') this.renderDashboard();
      }).catch(() => {});
    }

    const isAdmin = this.user.role === 'admin' || this.user.role === 'super_admin';
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

    const zHealth = this.zernioHealthCache || null;
    const webhookPaused = Boolean(zHealth && zHealth.webhookHealth && !zHealth.webhookHealth.active);

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

    this.el.content.innerHTML = `
      <div style="max-width:1360px;margin:0 auto;">
        <div style="display:flex;align-items:flex-end;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:16px;">
          <div>
            <h2 style="font-size:20px;font-weight:700;letter-spacing:-0.02em;margin:0 0 3px;color:var(--ds-ink);">
              ${greeting}, ${esc(this.user.displayName || this.user.name || 'Team')}
            </h2>
            <p style="font-size:13px;color:var(--ds-ink-muted);margin:0;">
              ${isAdmin ? `Monitoring ${availablePages.length} authorised dealership pages · New Zealand time (Pacific/Auckland)` : `Your assigned pages & daily priorities · New Zealand time (Pacific/Auckland)`}
            </p>
          </div>
          ${webhookPaused && isAdmin ? `
            <button type="button" class="ds-pill ds-pill-warning" style="cursor:pointer;padding:5px 12px;" onclick="window.app.adsActiveTab='health';window.app.navigate('meta-ads');">
              ${this._dsIcon('alert', 13)}<span>Live Lead Ad webhook paused — Inspect</span>
            </button>
          ` : ''}
        </div>

        <!-- 4 COMPACT OPERATIONAL METRICS -->
        <div class="ds-metric-strip">
          <button type="button" class="ds-metric-tile ${waitingConvs.length > 0 ? 'is-urgent' : ''}" onclick="window.app.inboxTab='needs_reply';window.app.navigate('inbox');">
            <div class="ds-metric-label"><span>Waiting for Reply</span>${this._dsIcon('message', 15)}</div>
            <div class="ds-metric-value">${waitingConvs.length}</div>
            <div class="ds-metric-sub">${waitingConvs.length > 0 ? 'Customers sent the last message' : 'All conversations answered'}</div>
          </button>

          <button type="button" class="ds-metric-tile ${dueOrOverdueTasks.length > 0 ? 'is-urgent' : ''}" onclick="window.app.navigate('tasks');">
            <div class="ds-metric-label"><span>Follow-ups &amp; Visits Due</span>${this._dsIcon('calendar', 15)}</div>
            <div class="ds-metric-value">${dueOrOverdueTasks.length}</div>
            <div class="ds-metric-sub">${todayVisits.length > 0 ? `${todayVisits.length} yard visit${todayVisits.length > 1 ? 's' : ''} booked today` : 'No yard visits scheduled today'}</div>
          </button>

          <button type="button" class="ds-metric-tile ${unassignedLeads.length > 0 ? 'is-urgent' : ''}" onclick="window.app.leadSavedView='unassigned';window.app.navigate('leads');">
            <div class="ds-metric-label"><span>${isAdmin ? 'Unassigned Enquiries' : 'Active Enquiries'}</span>${this._dsIcon('user', 15)}</div>
            <div class="ds-metric-value">${isAdmin ? unassignedLeads.length : activeDeals.length}</div>
            <div class="ds-metric-sub">${isAdmin ? `${activeDeals.length} open enquiries total` : 'Assigned to your pages'}</div>
          </button>

          <button type="button" class="ds-metric-tile" onclick="window.app.navigate('pipeline');">
            <div class="ds-metric-label"><span>Open Pipeline Value</span>${this._dsIcon('layers', 15)}</div>
            <div class="ds-metric-value">${pipelineValueNzd > 0 ? this.formatMoney(pipelineValueNzd) : (activeDeals.length > 0 ? `${activeDeals.length} deals` : 'No data')}</div>
            <div class="ds-metric-sub">${activeDeals.length} active vehicle enquiries (NZD)</div>
          </button>
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
                    ${allLeads.length === 0 ? 'Convert a customer conversation from Inbox, sync Meta Lead Ads, or add an enquiry manually.' : 'Great work keeping your pipeline moving.'}
                  </div>
                  <div style="display:flex;justify-content:center;gap:8px;flex-wrap:wrap;">
                    ${isAdmin ? `<button type="button" class="btn btn-secondary btn-sm" onclick="window.app.syncZernioLeadsFromMarketing()">${this._dsIcon('refresh', 13)}<span>Sync Meta Leads</span></button>` : ''}
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
                ${isAdmin ? `<button type="button" class="btn btn-ghost btn-xs" onclick="window.app.navigate('connections')">Manage</button>` : ''}
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
    const activeTab = this.inboxTab || 'needs_reply';
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

    this.el.content.innerHTML = `
      <div class="inbox-layout ${this.mobileInboxView === 'chat' ? 'view-chat' : 'view-list'} ${detailsCollapsed ? 'details-collapsed' : ''}">
        <!-- COLUMN 0: DEALERSHIP PAGE SELECTOR RAIL -->
        <aside class="inbox-page-rail" aria-label="Dealership pages">
          <div class="inbox-rail-header">
            <span class="inbox-rail-title">Pages (${accessiblePages.length})</span>
            ${isAdmin ? `<button type="button" class="btn btn-ghost btn-xs" style="height:24px;padding:0 6px;font-size:11px;" onclick="window.app.navigate('connections')">Manage</button>` : ''}
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
              <div class="inbox-thread" id="inbox-thread">
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
                  return `
                    <div class="msg msg-out ${isSending ? 'msg-sending' : ''} ${isFailed ? 'msg-failed' : ''}" data-msg-id="${esc(m.id || '')}">
                      <div class="msg-bubble">
                        ${this._renderAttachmentInBubble(m, true)}
                        ${esc(m.text || '')}
                      </div>
                      <span class="msg-time">
                        ${esc(m.time || 'Just now')}
                        ${isSending ? ' · Sending…' : isFailed ? ` · Failed <button type="button" class="btn-msg-retry" onclick="window.app.retryInboxMessage('${esc(m.id)}')">Retry</button>` : ' · Delivered'}
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
      </div>`;
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
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:14px;">
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
            <p class="ds-empty-desc">${hasFilters ? 'Clear or adjust your filters to view other enquiries across your authorised dealership pages.' : 'Sync real Meta Lead Ads from Zernio, convert an active Inbox conversation, or log a walk-in enquiry.'}</p>
            <div style="display:flex;justify-content:center;gap:8px;flex-wrap:wrap;">
              ${hasFilters ? `<button type="button" class="btn btn-secondary btn-sm" onclick="window.app.clearLeadFilters()">Clear Filters</button>` : ''}
              ${isAdmin && !hasFilters ? `<button type="button" class="btn btn-secondary btn-sm" onclick="window.app.syncZernioLeadsFromMarketing()">${this._dsIcon('refresh', 13)}<span>Sync Meta Leads</span></button>` : ''}
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
      { id: 'New Lead', label: 'New', dot: '#2563EB' },
      { id: 'Contacted', label: 'Contacted', dot: '#D97706' },
      { id: 'Qualified', label: 'Qualified', dot: '#7C3AED' },
      { id: 'Follow-up', label: 'Visit / Follow-up', dot: '#EA580C' },
      { id: 'Won', label: 'Sold', dot: '#059669' },
      { id: 'Lost', label: 'Lost', dot: '#DC2626' }
    ];
    const leads = this._getFilteredLeads ? this._getFilteredLeads(false) : [];

    this.el.content.innerHTML = `
      <div class="ds-kanban-board">
        ${stages.map(st => {
          const cards = leads.filter(d => d.status === st.id || (st.id === 'New Lead' && d.status === 'New') || (st.id === 'Won' && ['Converted', 'Sold'].includes(d.status)));
          const totalVal = cards.reduce((s, c) => s + Number(c.sale_value_nzd || c.budget_nzd || c.value || c.dealValue || 0), 0);
          return `
            <div class="ds-kanban-col" data-stage="${st.id}" ondragover="event.preventDefault()" ondrop="window.app.onKanbanDrop(event, '${st.id}')">
              <div class="ds-kanban-col-head">
                <div style="display:flex;align-items:center;gap:7px;">
                  <span style="width:8px;height:8px;border-radius:50%;background:${st.dot};display:inline-block;"></span>
                  <span style="font-size:13px;font-weight:700;color:var(--ds-ink);">${st.label}</span>
                  <span class="ds-pill ds-pill-neutral" style="padding:0 6px;font-size:11px;">${cards.length}</span>
                </div>
                ${totalVal > 0 ? `<span style="font-size:11.5px;font-weight:600;color:var(--ds-ink-secondary);">${this.formatMoney(totalVal)}</span>` : ''}
              </div>
              ${cards.length === 0 ? `
                <div style="padding:20px 10px;text-align:center;font-size:12px;color:var(--ds-ink-subtle);border:1px dashed var(--ds-border-strong);border-radius:8px;">
                  No deals in ${st.label}
                </div>
              ` : cards.map(c => {
                const days = Math.max(0, Math.floor((Date.now() - new Date(c.updated_at || c.created_at || Date.now()).getTime()) / 86400000));
                const nextDt = c.next_action_at || c.follow_up_date || c.followUpDate;
                const overdue = nextDt && new Date(nextDt) < new Date() && st.id !== 'Won' && st.id !== 'Lost';
                const val = Number(c.sale_value_nzd || c.budget_nzd || c.value || c.dealValue || 0);
                const pName = this._pageName(c.page_id || c.pageId);
                return `
                  <article class="ds-kanban-card" draggable="true" ondragstart="window.app.onKanbanDragStart(event, '${esc(c.id)}')" onclick="window.app.openLeadDrawer('${esc(c.id)}')">
                    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:6px;">
                      <div style="font-size:13.5px;font-weight:700;color:var(--ds-ink);line-height:1.3;">${esc(c.name || c.full_name || 'Customer')}</div>
                      <span class="ds-pill ${overdue ? 'ds-pill-danger' : (days >= 3 ? 'ds-pill-warning' : 'ds-pill-neutral')}" style="font-size:10.5px;padding:1px 6px;">${overdue ? 'Overdue' : `${days}d`}</span>
                    </div>
                    <div style="display:flex;align-items:center;gap:5px;margin-top:6px;font-size:12.5px;font-weight:600;color:var(--ds-ink-secondary);">
                      ${this._dsIcon('car', 13)}<span>${esc(c.vehicle_interest || 'Vehicle TBC')}</span>
                    </div>
                    <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;margin-top:6px;font-size:12px;">
                      <span style="color:var(--ds-ink-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(pName)}</span>
                      <span style="font-weight:700;color:var(--ds-ink);white-space:nowrap;">${val > 0 ? this.formatMoney(val) : 'Value TBC'}</span>
                    </div>
                    ${(c.finance_status || c.payment_preference) ? `<div style="margin-top:7px;">${this._dsFinancePill(c.finance_status, c.payment_preference)}</div>` : ''}
                    <div style="display:flex;align-items:center;justify-content:space-between;margin-top:8px;padding-top:8px;border-top:1px solid #F3F4F6;font-size:11.5px;color:var(--ds-ink-muted);">
                      <span>${esc(this._staffName(c.assigned_staff_id || c.assignedStaffId || c.assigned_to))}</span>
                      <span>${nextDt ? new Date(nextDt).toLocaleDateString('en-NZ', { timeZone: 'Pacific/Auckland', day: 'numeric', month: 'short' }) : 'No next date'}</span>
                    </div>
                    <div class="kanban-card-stage-bar" onclick="event.stopPropagation()">
                      <select class="kanban-stage-select" aria-label="Move stage for ${esc(c.name || 'deal')}" onchange="window.app.moveLeadStage('${esc(c.id)}', this.value)">
                        ${stages.map(opt => `<option value="${opt.id}" ${(c.status === opt.id || (opt.id === 'New Lead' && c.status === 'New')) ? 'selected' : ''}>Stage: ${opt.label}</option>`).join('')}
                      </select>
                    </div>
                  </article>`;
              }).join('')}
            </div>`;
        }).join('')}
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
  // 6. MARKETING / META — PLAIN-ENGLISH 3-AREA HUB (NO TECH JARGON IN MAIN UI)
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
          <p class="ds-empty-desc">Advertising budgets, lead forms, and integration settings are available only to dealership managers.</p>
          <button type="button" class="btn btn-secondary btn-sm" onclick="window.app.navigate('dashboard')">Return to Overview</button>
        </div>`;
      return;
    }

    this.adsActiveTab = this.adsActiveTab || 'campaigns';
    this.adsDateRange = this.adsDateRange || 'last_30d';
    this.adsPageFilter = this.adsPageFilter || 'all';
    this.adsSearchQuery = this.adsSearchQuery || '';

    this.el.actions.innerHTML = `
      <button type="button" class="btn btn-secondary btn-sm" onclick="window.app.syncZernioLeadsFromMarketing()">${this._dsIcon('refresh', 13)}<span>Sync Meta Leads</span></button>
      <button type="button" class="btn btn-primary btn-sm" onclick="window.app.syncLiveAds()">${this._dsIcon('refresh', 13)}<span>Sync Ad Insights</span></button>`;

    if (!this._loadedZernioMarketing && this.svc) {
      this._loadedZernioMarketing = true;
      Promise.all([
        this.svc.syncZernioAds ? this.svc.syncZernioAds(this.adsDateRange, this.adsPageFilter, false).catch(() => null) : null,
        this.svc.fetchZernioLeadForms ? this.svc.fetchZernioLeadForms().then(r => { this.zernioLeadForms = r?.forms || []; }).catch(() => null) : null,
        this.svc.fetchZernioHealth ? this.svc.fetchZernioHealth().then(h => { this.zernioHealthCache = h; }).catch(() => null) : null
      ]).then(() => {
        if (this.currentRoute === 'meta-ads') this.renderMetaAds();
      });
    }

    const adsState = this.svc?.zernioAdsState || null;
    const campaigns = adsState?.campaigns || (this.svc ? (this.svc.campaigns || []) : []);
    const totals = adsState?.totals || null;
    const nzdAccounts = adsState?.adAccounts || [];
    const excludedNonNzd = adsState?.excludedNonNzdAccounts || [];
    const leadForms = this.zernioLeadForms || [];
    const health = this.zernioHealthCache || null;
    const pages = this._getAccessiblePages ? this._getAccessiblePages() : [];
    const webhookBlocked = Boolean(health?.webhookHealth && !health.webhookHealth.active);

    const lastSyncTxt = adsState?.lastSuccessfulSync
      ? new Date(adsState.lastSuccessfulSync).toLocaleString('en-NZ', { timeZone: 'Pacific/Auckland', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) + ' NZ'
      : 'Not synced yet';

    const maxCampSpend = Math.max(1, ...campaigns.slice(0, 6).map(c => Number(c.spend || 0)));

    this.el.content.innerHTML = `
      <div style="max-width:1360px;margin:0 auto;">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:16px;">
          <div>
            <h2 style="font-size:19px;font-weight:700;margin:0 0 3px;color:var(--ds-ink);">Meta Lead Capture &amp; Advertising</h2>
            <p style="font-size:12.5px;color:var(--ds-ink-muted);margin:0;">
              ${pages.length} connected dealership pages · Currency: <strong>NZD</strong> · Last ad sync: <strong>${esc(lastSyncTxt)}</strong>
            </p>
          </div>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <select class="input" style="width:auto;min-width:165px;" aria-label="Filter by page" onchange="window.app.adsPageFilter=this.value;window.app.syncLiveAds();">
              <option value="all">All Connected Pages (${pages.length})</option>
              ${pages.map(p => `<option value="${esc(p.id || p.page_id)}" ${String(this.adsPageFilter) === String(p.id || p.page_id) ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
            </select>
            <select class="input" style="width:auto;min-width:140px;" aria-label="Date range" onchange="window.app.changeAdsDateRange(this.value)">
              <option value="last_7d" ${this.adsDateRange === 'last_7d' ? 'selected' : ''}>Last 7 Days (NZ)</option>
              <option value="last_14d" ${this.adsDateRange === 'last_14d' ? 'selected' : ''}>Last 14 Days (NZ)</option>
              <option value="last_30d" ${this.adsDateRange === 'last_30d' ? 'selected' : ''}>Last 30 Days (NZ)</option>
              <option value="this_month" ${this.adsDateRange === 'this_month' ? 'selected' : ''}>This Month (NZ)</option>
            </select>
          </div>
        </div>

        <!-- Plain-English Status Banner (Technical Details tucked into expandable disclosure) -->
        ${webhookBlocked ? `
          <div style="margin-bottom:16px;padding:13px 16px;background:var(--ds-warning-bg);border:1px solid var(--ds-warning-border);border-radius:10px;">
            <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">
              <div style="display:flex;align-items:center;gap:10px;">
                <span style="color:var(--ds-warning);">${this._dsIcon('alert', 18)}</span>
                <div>
                  <div style="font-size:13px;font-weight:700;color:var(--ds-warning);">Automatic real-time lead delivery is paused</div>
                  <div style="font-size:12.5px;color:#78350F;">Your pages and lead forms are connected, and manual <strong>Sync Meta Leads</strong> works now. Update the live webhook destination after deployment to resume instant lead delivery.</div>
                </div>
              </div>
              <button type="button" class="btn btn-secondary btn-xs" onclick="window.app.switchAdsTab('health')">View Readiness</button>
            </div>
            <details class="ds-diagnostics-disclosure">
              <summary>Technical Diagnostics (for Admin / IT)</summary>
              <pre class="ds-diagnostics-pre">${esc(health.webhookHealth.actionRequired || '')}</pre>
            </details>
          </div>
        ` : ''}

        <!-- 3 Clear Area Tabs -->
        <div style="margin-bottom:18px;">
          <div class="ds-tabs" role="tablist">
            <button type="button" role="tab" aria-selected="${this.adsActiveTab === 'lead_capture'}" class="ds-tab-btn ${this.adsActiveTab === 'lead_capture' ? 'active' : ''}" onclick="window.app.switchAdsTab('lead_capture')">
              <span>Lead Capture</span><span class="ds-tab-count">${leadForms.length}</span>
            </button>
            <button type="button" role="tab" aria-selected="${this.adsActiveTab === 'campaigns'}" class="ds-tab-btn ${this.adsActiveTab === 'campaigns' ? 'active' : ''}" onclick="window.app.switchAdsTab('campaigns')">
              <span>Campaign Performance</span><span class="ds-tab-count">${campaigns.length}</span>
            </button>
            <button type="button" role="tab" aria-selected="${this.adsActiveTab === 'health'}" class="ds-tab-btn ${this.adsActiveTab === 'health' ? 'active' : ''}" onclick="window.app.switchAdsTab('health')">
              <span>Connection Health</span><span class="ds-tab-count">${health?.pages?.length || pages.length}</span>
            </button>
          </div>
        </div>

        ${this.adsActiveTab === 'campaigns' ? `
          <div class="ds-metric-strip">
            <div class="ds-metric-tile" style="cursor:default;">
              <div class="ds-metric-label"><span>Ad Spend (NZD)</span></div>
              <div class="ds-metric-value">${adsState?.insightsRetrievedSuccessfully ? this.formatMoney(totals.spendNzd) : 'Not synced'}</div>
              <div class="ds-metric-sub">${nzdAccounts.length} NZD ad account${nzdAccounts.length === 1 ? '' : 's'}</div>
            </div>
            <div class="ds-metric-tile" style="cursor:default;">
              <div class="ds-metric-label"><span>Meta Platform Leads</span></div>
              <div class="ds-metric-value">${adsState?.insightsRetrievedSuccessfully ? totals.platformLeads.toLocaleString('en-NZ') : '—'}</div>
              <div class="ds-metric-sub">${totals ? totals.messagingConnections.toLocaleString('en-NZ') : 0} Messenger starts</div>
            </div>
            <div class="ds-metric-tile" style="cursor:default;">
              <div class="ds-metric-label"><span>CRM Attributed Enquiries</span></div>
              <div class="ds-metric-value" style="color:var(--ds-success);">${totals ? totals.crmAttributedLeads : 0}</div>
              <div class="ds-metric-sub">Matched by campaign ID</div>
            </div>
            <div class="ds-metric-tile" style="cursor:default;">
              <div class="ds-metric-label"><span>Cost per Platform Lead</span></div>
              <div class="ds-metric-value">${totals && totals.cplPlatformNzd !== null ? this.formatMoney(totals.cplPlatformNzd) : 'No data'}</div>
              <div class="ds-metric-sub">${totals ? `CTR ${totals.ctr}% · ${this._formatNum(totals.impressions)} impressions` : 'Sync insights to calculate'}</div>
            </div>
          </div>

          ${excludedNonNzd.length > 0 ? `
            <div style="margin-bottom:14px;padding:10px 14px;background:var(--ds-surface);border:1px solid var(--ds-border);border-radius:8px;font-size:12px;color:var(--ds-ink-secondary);">
              <strong>NZD Currency Safeguard:</strong> Excluded ${excludedNonNzd.map(a => `${esc(a.name)} (${esc(a.currency)})`).join(', ')} from NZD totals so foreign spend is never mixed in.
            </div>
          ` : ''}

          ${campaigns.length > 0 ? `
            <div class="ds-card" style="margin-bottom:16px;">
              <div class="ds-card-header">
                <div>
                  <h3 class="ds-card-title">Top Campaigns by Spend (NZD)</h3>
                  <div class="ds-card-subtitle">Click any campaign below to filter its captured CRM enquiries.</div>
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
                          <span style="font-weight:600;white-space:nowrap;">${this.formatMoney(c.spend || 0)} · ${c.platformLeads || 0} Meta leads</span>
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
                <h3 class="ds-card-title">All NZD Campaigns (${campaigns.length})</h3>
                <div class="ds-card-subtitle">Click any row to view CRM enquiries linked to that campaign.</div>
              </div>
              <input type="text" class="input" style="width:220px;" placeholder="Filter campaigns…" value="${esc(this.adsSearchQuery)}" oninput="window.app.searchAds(this.value)">
            </div>
            <div id="ads-table-container">${this._renderAdsTable('campaigns', campaigns, [], [])}</div>
          </div>
        ` : this.adsActiveTab === 'lead_capture' ? `
          <div class="ds-card">
            <div class="ds-card-header">
              <div>
                <h3 class="ds-card-title">Connected Meta Instant Lead Forms (${leadForms.length})</h3>
                <div class="ds-card-subtitle">Active lead forms across your dealership pages.</div>
              </div>
              <div style="display:flex;gap:8px;">
                <button type="button" class="btn btn-secondary btn-sm" onclick="window.app.runGuidedTestLead('${esc(pages[0] ? (pages[0].page_id || pages[0].id) : '')}', '${esc(pages[0] ? pages[0].name : 'Connected Page')}')">Run Local Test Lead</button>
                <button type="button" class="btn btn-primary btn-sm" onclick="window.app.syncZernioLeadsFromMarketing()">${this._dsIcon('refresh', 13)}<span>Sync Meta Leads</span></button>
              </div>
            </div>
            <div class="ds-table-wrap">
              <table class="ds-table">
                <thead>
                  <tr>
                    <th>Dealership Page</th>
                    <th>Lead Form</th>
                    <th>Status</th>
                    <th style="text-align:right;">Platform Submissions</th>
                    <th style="text-align:right;">Enquiries</th>
                  </tr>
                </thead>
                <tbody>
                  ${leadForms.length === 0 ? `
                    <tr><td colspan="5" style="text-align:center;padding:28px;color:var(--ds-ink-muted);">Loading connected lead forms…</td></tr>
                  ` : leadForms.map(f => `
                    <tr>
                      <td>
                        <div style="display:flex;align-items:center;gap:8px;">
                          ${this._dsPageAvatar(f.pageName, f.platform, 'sm')}
                          <span style="font-weight:600;">${esc(f.pageName)}</span>
                        </div>
                      </td>
                      <td>
                        <div style="font-weight:600;">${esc(f.name)}</div>
                        <div style="font-size:11.5px;color:var(--ds-ink-muted);">ID: ${esc(f.id)}</div>
                      </td>
                      <td><span class="ds-pill ${f.status === 'ACTIVE' ? 'ds-pill-success' : 'ds-pill-neutral'}">${esc(f.status)}</span></td>
                      <td style="text-align:right;font-weight:700;">${f.leadsCount ?? 0}</td>
                      <td style="text-align:right;">
                        <button type="button" class="btn btn-ghost btn-xs" onclick="window.app.leadPageFilter='${esc(f.pageId)}';window.app.navigate('leads');">View Page Enquiries</button>
                      </td>
                    </tr>`).join('')}
                </tbody>
              </table>
            </div>
          </div>
        ` : `
          <div class="ds-card">
            <div class="ds-card-header">
              <div>
                <h3 class="ds-card-title">Dealership Integration Readiness</h3>
                <div class="ds-card-subtitle">Each step is checked independently against live connected services.</div>
              </div>
              <button type="button" class="btn btn-secondary btn-sm" onclick="window.app.refreshMarketingHealth()">${this._dsIcon('refresh', 13)}<span>Re-check Status</span></button>
            </div>
            <div class="ds-table-wrap">
              <table class="ds-table">
                <thead>
                  <tr>
                    <th>Dealership Page</th>
                    <th>Account</th>
                    <th>Permissions</th>
                    <th>Instant Delivery</th>
                    <th>Leads Captured</th>
                    <th>Ad Reporting</th>
                    <th>Next Step</th>
                  </tr>
                </thead>
                <tbody>
                  ${!health || !Array.isArray(health.pages) || health.pages.length === 0 ? `
                    <tr><td colspan="7" style="text-align:center;padding:24px;color:var(--ds-ink-muted);">Checking live integration health…</td></tr>
                  ` : health.pages.map(p => `
                    <tr>
                      <td>
                        <div style="display:flex;align-items:center;gap:8px;">
                          ${this._dsPageAvatar(p.pageName, p.platform, 'sm')}
                          <span style="font-weight:600;">${esc(p.pageName)}</span>
                        </div>
                      </td>
                      <td><span class="ds-pill ${p.accountConnected ? 'ds-pill-success' : 'ds-pill-danger'}">${p.accountConnected ? 'Connected' : 'Reconnect'}</span></td>
                      <td><span class="ds-pill ${p.permissionsVerified?.allCoreGranted ? 'ds-pill-success' : 'ds-pill-warning'}">${p.permissionsVerified?.allCoreGranted ? 'Verified' : 'Incomplete'}</span></td>
                      <td><span class="ds-pill ${p.subscriptionVerified?.verified ? 'ds-pill-success' : 'ds-pill-warning'}">${p.subscriptionVerified?.verified ? 'Active' : 'Webhook Paused'}</span></td>
                      <td><span class="ds-pill ${p.leadReceivedSuccessfully ? 'ds-pill-success' : 'ds-pill-neutral'}">${p.leadReceivedSuccessfully ? 'Receiving' : 'None yet'}</span></td>
                      <td><span class="ds-pill ${p.adReportingReady ? 'ds-pill-success' : (p.adAccountConnected ? 'ds-pill-info' : 'ds-pill-neutral')}">${p.adReportingReady ? 'Synced' : (p.adAccountConnected ? 'Ready to sync' : 'No NZD account')}</span></td>
                      <td style="font-size:12px;color:var(--ds-ink-secondary);">${esc(p.adReportingReady && p.subscriptionVerified?.verified ? 'All working' : (p.subscriptionVerified?.verified ? 'Sync ad insights' : 'Enable live webhook after deploy'))}</td>
                    </tr>`).join('')}
                </tbody>
              </table>
            </div>
            ${health ? `
              <div style="padding:0 18px 14px;">
                <details class="ds-diagnostics-disclosure">
                  <summary>Technical Diagnostics (Page IDs, Scopes &amp; Webhook Config)</summary>
                  <pre class="ds-diagnostics-pre">${esc(JSON.stringify({ webhookHealth: health.webhookHealth, adsSyncState: health.adsSyncState, pagesCount: health.pages?.length || 0 }, null, 2))}</pre>
                </details>
              </div>
            ` : ''}
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
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
          <div>
            <h2 style="font-size:19px;font-weight:700;margin:0 0 3px;color:var(--ds-ink);">${isAdmin ? 'Dealership Performance Reports' : 'My Sales Results'}</h2>
            <p style="font-size:12.5px;color:var(--ds-ink-muted);margin:0;">
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
                  <tr><td colspan="7" style="text-align:center;padding:24px;color:var(--ds-ink-muted);">No campaign insights synced for this window. Sync in Marketing / Meta to view real NZD spend &amp; CPL.</td></tr>
                ` : campaignBreakdown.slice(0, 10).map(c => `
                  <tr class="clickable-row" onclick="window.app.leadCampaignFilter='${esc(c.campaignId || '')}';window.app.navigate('leads');">
                    <td style="font-weight:600;">${esc(c.campaignName || 'Campaign')}</td>
                    <td style="font-size:12px;color:var(--ds-ink-muted);">${esc(c.pageName || '—')}</td>
                    <td style="text-align:right;font-weight:600;">${c.spend !== null && c.spend !== undefined ? this.formatMoney(c.spend) : 'Not synced'}</td>
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
          <strong>Methodology:</strong> ${esc(meta.cohortExplanation || 'Enquiries received within the selected Pacific/Auckland date range. Missing ad spend or sale values are explicitly shown as No data or Not synced.')}
        </div>
      </div>`;
  };
})();
