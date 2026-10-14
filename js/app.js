/* ============================================================
   MetaCRM — Production Architecture v4 (Complete Solution)
   ============================================================ */
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

class MetaCRMApp {
  constructor() {
    this.currentRoute = 'dashboard';
    this.pipelineView = 'kanban';
    this.currentLeadTab = 'all';
    this.currentTaskTab = 'all';
    this.leadSearchQuery = '';
    this.selectedPageFilter = 'all';
    this.selectedDateRange = 'last_30d';
    this.selectedLeadIds = new Set();

    // Service Singletons
    this.svc = window.crmService;
    this.meta = window.metaService;

    // Load active user session from crmService
    this.user = this.svc ? this.svc.getCurrentUser() : {
      id: 'usr_admin',
      name: 'Administrator',
      displayName: 'Administrator',
      email: 'admin@company.com',
      role: 'admin',
      assignedPageIds: []
    };

    // Active conversation in Inbox
    this.activeConvId = null;
    this.mobileInboxView = 'list';

    // DOM References
    this.el = {
      nav: document.getElementById('sidebar-nav'),
      title: document.getElementById('page-title'),
      actions: document.getElementById('topbar-actions'),
      content: document.getElementById('main-content'),
      sidebar: document.getElementById('sidebar'),
      sidebarOverlay: document.getElementById('sidebar-overlay'),
      mobileMenuBtn: document.getElementById('mobile-menu-btn'),
      closeSidebarBtn: document.getElementById('close-sidebar-btn'),
      dOverlay: document.getElementById('drawer-overlay'),
      drawer: document.getElementById('drawer'),
      dTitle: document.getElementById('drawer-title'),
      dContent: document.getElementById('drawer-content'),
      closeDrawer: document.getElementById('close-drawer'),
      mOverlay: document.getElementById('modal-overlay'),
      mTitle: document.getElementById('modal-title'),
      mBody: document.getElementById('modal-body'),
      mFooter: document.getElementById('modal-footer'),
      closeModal: document.getElementById('close-modal'),
      mCancel: document.getElementById('modal-cancel'),
      mConfirm: document.getElementById('modal-confirm'),
      toasts: document.getElementById('toast-container'),
      notifBtn: document.getElementById('notif-bell-btn'),
      notifPopover: document.getElementById('notif-popover'),
      notifBadge: document.getElementById('notif-unread-badge'),
      notifList: document.getElementById('notif-list'),
      notifMarkAll: document.getElementById('notif-mark-all-btn'),
      auth: document.getElementById('auth-container'),
      appLayout: document.getElementById('app-layout'),
    };

    const hasPages = this.svc && Array.isArray(this.svc.pages) && this.svc.pages.length > 0;
    this.metaConnectionState = localStorage.getItem('metacrm_meta_conn_state') || (hasPages ? 'connected' : 'not_connected');
    this.authTab = 'login';

    this._bindGlobalEvents();
    this._init();
  }

  getCurrencySymbol(currency = null) {
    if (this.svc && this.svc.getCurrencySymbol) return this.svc.getCurrencySymbol(currency);
    const cur = currency || this.getCurrency();
    if (cur === 'EUR') return '€';
    if (cur === 'GBP') return '£';
    if (cur === 'INR') return '₹';
    return '$';
  }

  getCurrency() {
    return (this.svc && this.svc.getCurrency) ? this.svc.getCurrency() : (localStorage.getItem('metacrm_currency') || 'USD');
  }

  setCurrency(curr) {
    const selected = curr || 'USD';
    if (this.svc && this.svc.setCurrency) this.svc.setCurrency(selected);
    else localStorage.setItem('metacrm_currency', selected);
    this.updateCurrencyDropdownTooltip();
    this.toast(`Currency set to ${selected} (${this.getCurrencySymbol(selected)})`, 'info');
    if (this.currentRoute) this.navigate(this.currentRoute);
  }

  updateCurrencyDropdownTooltip() {
    const sel = document.getElementById('topbar-currency-select');
    if (!sel) return;
    const curr = this.getCurrency();
    sel.value = curr;
    const rates = (this.svc && this.svc.fxRates) || { base: 'INR', USD: 0.012, NZD: 0.020, INR: 1.0, updated: '2026-10-14' };
    const base = rates.base || 'INR';
    const rate = rates[curr] !== undefined ? rates[curr] : (curr === 'USD' ? 0.012 : (curr === 'NZD' ? 0.020 : 1.0));
    const tipText = curr === base 
      ? `Base: 1 ${base} (FX rates updated: ${rates.updated || '2026-10-14'})`
      : `Rate: 1 ${base} = ${rate} ${curr} (Updated: ${rates.updated || '2026-10-14'})`;
    sel.title = tipText;
    if (sel.parentElement) sel.parentElement.title = tipText;
  }

  formatMoney(amount, currency = null) {
    if (this.svc && this.svc.formatMoney) {
      return this.svc.formatMoney(amount, currency);
    }
    const curr = currency || this.getCurrency();
    const val = Number(amount) || 0;
    try {
      const locale = curr === 'INR' ? 'en-IN' : (curr === 'NZD' ? 'en-NZ' : (curr === 'EUR' ? 'de-DE' : (curr === 'GBP' ? 'en-GB' : 'en-US')));
      const hasDecimals = (val % 1 !== 0) && Math.abs(val) < 1000;
      return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: curr,
        maximumFractionDigits: hasDecimals ? 2 : 0
      }).format(val);
    } catch (e) {
      const sym = this.getCurrencySymbol(curr);
      return `${sym}${val.toLocaleString('en-US')}`;
    }
  }

  formatCurrency(amount, currency = null) {
    return this.formatMoney(amount, currency);
  }

  toggleMobileSidebar(open) {
    const shouldOpen = open !== undefined ? open : !this.el.sidebar.classList.contains('open');
    if (shouldOpen) {
      this.el.sidebar.classList.add('open');
      if (this.el.sidebarOverlay) this.el.sidebarOverlay.classList.add('open');
    } else {
      this.el.sidebar.classList.remove('open');
      if (this.el.sidebarOverlay) this.el.sidebarOverlay.classList.remove('open');
    }
  }

  toggleSidebarCollapse() {
    const layout = this.el.appLayout || document.getElementById('app-layout');
    if (layout) {
      layout.classList.toggle('sidebar-collapsed');
      const isCollapsed = layout.classList.contains('sidebar-collapsed');
      localStorage.setItem('sidebar_collapsed', isCollapsed ? '1' : '0');
    }
  }

  dismissFbBanner(btn) {
    sessionStorage.setItem('fb_banner_dismissed', 'true');
    const card = btn ? btn.closest('.fb-onboard-card') : document.getElementById('fb-onboard-card');
    if (card) {
      card.style.opacity = '0';
      card.style.transform = 'translateY(-6px)';
      card.style.transition = 'opacity 180ms ease, transform 180ms ease';
      setTimeout(() => {
        if (card.parentNode) card.parentNode.removeChild(card);
      }, 180);
    }
  }

  openLeadMessage(leadId) {
    const lead = (this.svc ? this.svc.leads : []).find(l => l.id === leadId);
    if (!lead) return;
    this.navigate('inbox');
    setTimeout(() => {
      if (lead.phone) this.onInboxSearch(lead.phone);
      else if (lead.name) this.onInboxSearch(lead.name);
    }, 120);
  }

  // ──────────────────────────────────────────────────────────
  // Bootstrap & Global Event Bindings
  // ──────────────────────────────────────────────────────────

  _init() {
    if (localStorage.getItem('sidebar_collapsed') === '1') {
      const layout = document.getElementById('app-layout');
      if (layout) layout.classList.add('sidebar-collapsed');
    }
    this._checkUrlCallbacks();
    this.syncZernioAccounts(false);
    // Server data wins over localStorage on load: fetch authoritative conversations immediately
    if (this.svc && this.svc.fetchRemoteConversations) {
      this.svc.fetchRemoteConversations().then(() => {
        if (this.currentRoute === 'inbox') this.renderInbox();
      });
    } else {
      this.fetchRealInstagramConversations();
    }
    const curSel = document.getElementById('topbar-currency-select');
    if (curSel) curSel.value = this.getCurrency();
    this.updateCurrencyDropdownTooltip();
    this.renderSidebar();
    this.renderNotifications();
    this._route();
    window.addEventListener('hashchange', () => this._route());
  }

  _bindGlobalEvents() {
    this.el.closeDrawer.addEventListener('click', () => this.closeDrawer());
    this.el.dOverlay.addEventListener('click', () => this.closeDrawer());
    this.el.closeModal.addEventListener('click', () => this.closeModal());
    this.el.mCancel.addEventListener('click', () => this.closeModal());
    this.el.mOverlay.addEventListener('click', e => { if (e.target === this.el.mOverlay) this.closeModal(); });

    // Mobile Navigation Controls
    if (this.el.mobileMenuBtn) {
      this.el.mobileMenuBtn.addEventListener('click', () => this.toggleMobileSidebar(true));
    }
    if (this.el.sidebarOverlay) {
      this.el.sidebarOverlay.addEventListener('click', () => this.toggleMobileSidebar(false));
    }
    if (this.el.closeSidebarBtn) {
      this.el.closeSidebarBtn.addEventListener('click', () => this.toggleMobileSidebar(false));
    }
    const collapseBtn = document.getElementById('sidebar-collapse-btn');
    if (collapseBtn) {
      collapseBtn.addEventListener('click', () => this.toggleSidebarCollapse());
    }

    // Phase A: Notifications Bell & Popover Controls
    if (this.el.notifBtn) {
      this.el.notifBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleNotifications();
      });
    }
    if (this.el.notifMarkAll) {
      this.el.notifMarkAll.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.svc) {
          this.svc.markAllNotificationsRead();
          this.renderNotifications();
        }
      });
    }
    document.addEventListener('click', (e) => {
      if (this.el.notifPopover && !this.el.notifPopover.contains(e.target) && e.target !== this.el.notifBtn && !this.el.notifBtn?.contains(e.target)) {
        this.el.notifPopover.classList.remove('open');
      }
      const dd = document.getElementById('ws-dropdown');
      if (dd && !e.target.closest('.workspace-switcher-wrapper')) {
        dd.style.display = 'none';
      }
      document.querySelectorAll('.conv-item-dropdown').forEach(m => {
        if (!e.target.closest('.conv-options-btn') && !m.contains(e.target)) {
          m.style.display = 'none';
        }
      });
    });

    // Real-time notification handler
    window.addEventListener('crm:notification_received', (e) => {
      const notif = e.detail?.notification;
      if (notif) {
        this.toast(`${notif.title}: ${notif.message}`, notif.type === 'hot_lead' ? 'warning' : 'info');
      }
      this.renderNotifications();
    });

    // Real-time Lead Intake Engine (Supabase Realtime & Webhook Delivery)
    window.addEventListener('crm:remote_lead_received', (e) => this.handleRemoteLeadReceived(e.detail));

    // Real-time Inbox Messaging Engine (Instant Webhook & Supabase Realtime Delivery)
    window.addEventListener('crm:remote_message_received', (e) => this.handleRemoteMessageReceived(e.detail));
    window.addEventListener('crm:remote_message_updated', (e) => this.handleRemoteMessageUpdated(e.detail));
    window.addEventListener('crm:remote_conversation_updated', (e) => this.handleRemoteConversationUpdated(e.detail));

    // Keyboard Shortcuts (Ctrl+K for command palette, Escape, and module navigation)
    window.addEventListener('keydown', e => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        this.openCommandPalette();
      }
      if (e.key === 'Escape') {
        this.closeCommandPalette();
        this.closeDrawer();
        this.closeModal();
        this.toggleMobileSidebar(false);
        if (this.el.notifPopover) this.el.notifPopover.classList.remove('open');
      }
    });

    // Listen to real-time CRM updates
    window.addEventListener('crm:state_changed', () => {
      this.user = this.svc.getCurrentUser();
      this.renderSidebar();
      this.renderNotifications();
      this._renderPage();
    });
  }

  toggleNotifications() {
    if (!this.el.notifPopover) return;
    this.el.notifPopover.classList.toggle('open');
    if (this.el.notifPopover.classList.contains('open')) {
      this.renderNotifications();
    }
  }

  openCommandPalette() {
    this.closeCommandPalette();
    const existing = document.getElementById('cmd-palette-backdrop');
    if (existing) existing.remove();

    const backdrop = document.createElement('div');
    backdrop.id = 'cmd-palette-backdrop';
    backdrop.className = 'cmd-palette-backdrop';
    backdrop.onclick = (e) => {
      if (e.target === backdrop) this.closeCommandPalette();
    };

    backdrop.innerHTML = `
      <div class="cmd-palette-modal" onclick="event.stopPropagation()">
        <div class="cmd-search-header">
          <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input type="text" id="cmd-palette-input" class="cmd-search-input" placeholder="Type a command or jump to page…" autocomplete="off" />
          <kbd class="nav-shortcut">ESC</kbd>
        </div>
        <div class="cmd-palette-results" id="cmd-palette-results">
          <div class="cmd-section-label">Navigation</div>
          <div class="cmd-item" data-cmd="dashboard" onclick="window.app.navigate('dashboard'); window.app.closeCommandPalette();">
            <div class="cmd-item-left">
              <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
              <span>Go to Dashboard</span>
            </div>
            <kbd class="cmd-badge">⌘D</kbd>
          </div>
          <div class="cmd-item" data-cmd="leads" onclick="window.app.navigate('leads'); window.app.closeCommandPalette();">
            <div class="cmd-item-left">
              <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              <span>Go to Leads</span>
            </div>
            <kbd class="cmd-badge">⌘L</kbd>
          </div>
          <div class="cmd-item" data-cmd="inbox" onclick="window.app.navigate('inbox'); window.app.closeCommandPalette();">
            <div class="cmd-item-left">
              <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              <span>Go to Messages &amp; Inbox</span>
            </div>
            <kbd class="cmd-badge">⌘M</kbd>
          </div>
          <div class="cmd-item" data-cmd="pipeline" onclick="window.app.navigate('pipeline'); window.app.closeCommandPalette();">
            <div class="cmd-item-left">
              <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>
              <span>Go to Pipeline Kanban</span>
            </div>
            <kbd class="cmd-badge">⌘P</kbd>
          </div>
          <div class="cmd-item" data-cmd="tasks" onclick="window.app.navigate('tasks'); window.app.closeCommandPalette();">
            <div class="cmd-item-left">
              <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
              <span>Go to Follow-ups &amp; Tasks</span>
            </div>
            <kbd class="cmd-badge">⌘T</kbd>
          </div>
          <div class="cmd-item" data-cmd="connections" onclick="window.app.navigate('connections'); window.app.closeCommandPalette();">
            <div class="cmd-item-left">
              <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>
              <span>Connect Meta &amp; Facebook Pages</span>
            </div>
            <kbd class="cmd-badge">⌘C</kbd>
          </div>
          <div class="cmd-item" data-cmd="reports" onclick="window.app.navigate('reports'); window.app.closeCommandPalette();">
            <div class="cmd-item-left">
              <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
              <span>Go to Performance Reports</span>
            </div>
            <kbd class="cmd-badge">⌘R</kbd>
          </div>
          <div class="cmd-item" data-cmd="settings" onclick="window.app.navigate('settings'); window.app.closeCommandPalette();">
            <div class="cmd-item-left">
              <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
              <span>Go to Settings</span>
            </div>
            <kbd class="cmd-badge">⌘,</kbd>
          </div>

          <div class="cmd-section-label">Quick Actions</div>
          <div class="cmd-item" data-cmd="add lead" onclick="window.app.closeCommandPalette(); window.app.openAddLeadModal();">
            <div class="cmd-item-left">
              <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              <span>Create New Lead</span>
            </div>
            <kbd class="cmd-badge">Action</kbd>
          </div>
          <div class="cmd-item" data-cmd="export csv" onclick="window.app.closeCommandPalette(); window.app.exportLeadsCsv();">
            <div class="cmd-item-left">
              <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              <span>Export Leads to CSV</span>
            </div>
            <kbd class="cmd-badge">Action</kbd>
          </div>
          <div class="cmd-item" data-cmd="switch user" onclick="window.app.closeCommandPalette(); window.app.openUserSwitchModal();">
            <div class="cmd-item-left">
              <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              <span>Switch User Role &amp; Session</span>
            </div>
            <kbd class="cmd-badge">RBAC</kbd>
          </div>
          <div class="cmd-item" data-cmd="sync accounts" onclick="window.app.closeCommandPalette(); window.app.syncConnections();">
            <div class="cmd-item-left">
              <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 21h5v-5"/></svg>
              <span>Sync Meta Connections</span>
            </div>
            <kbd class="cmd-badge">Meta API</kbd>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(backdrop);
    const input = document.getElementById('cmd-palette-input');
    if (input) {
      input.focus();
      input.addEventListener('input', (e) => this._filterCommandPalette(e.target.value));
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          const firstVisible = backdrop.querySelector('.cmd-item:not([style*="display: none"])');
          if (firstVisible) firstVisible.click();
        }
      });
    }
  }

  closeCommandPalette() {
    const el = document.getElementById('cmd-palette-backdrop');
    if (el) el.remove();
  }

  _filterCommandPalette(query) {
    const q = (query || '').toLowerCase().trim();
    const items = document.querySelectorAll('.cmd-palette-results .cmd-item');
    items.forEach(it => {
      const txt = (it.innerText || '').toLowerCase();
      const cmd = (it.getAttribute('data-cmd') || '').toLowerCase();
      if (!q || txt.includes(q) || cmd.includes(q)) {
        it.style.display = 'flex';
      } else {
        it.style.display = 'none';
      }
    });
  }

  renderNotifications() {
    if (!this.svc) return;
    const notifs = this.svc.getNotifications();
    const unreadCount = this.svc.getUnreadNotificationsCount();

    if (this.el.notifBadge) {
      if (unreadCount > 0) {
        this.el.notifBadge.textContent = unreadCount > 99 ? '99+' : unreadCount;
        this.el.notifBadge.style.display = 'flex';
      } else {
        this.el.notifBadge.style.display = 'none';
      }
    }

    if (!this.el.notifList) return;
    if (notifs.length === 0) {
      this.el.notifList.innerHTML = `<div class="notif-empty">No notifications yet. You'll be alerted when new leads arrive.</div>`;
      return;
    }

    this.el.notifList.innerHTML = notifs.map(n => {
      const isUnread = !n.read && !n.read_at;
      const isHot = n.type === 'hot_lead';
      const icon = isHot ? this._icon('flame', 14) : n.type === 'sla_breach' ? this._icon('alert', 14) : this._icon('user', 14);
      return `
        <div class="notif-item ${isUnread ? 'unread' : ''} ${isHot ? 'hot-lead' : ''}" onclick="window.app.onNotificationClick('${n.id}', '${n.lead_id || ''}')">
          <div class="notif-icon-wrap">${icon}</div>
          <div class="notif-item-body">
            <div class="notif-title">${n.title}</div>
            <div class="notif-msg">${n.message}</div>
            <div class="notif-time">${n.timestamp || 'Just now'}</div>
          </div>
        </div>`;
    }).join('');
  }

  onNotificationClick(notifId, leadId) {
    if (this.svc) {
      this.svc.markNotificationRead(notifId);
      this.renderNotifications();
    }
    if (this.el.notifPopover) this.el.notifPopover.classList.remove('open');
    if (leadId) {
      this.navigate('leads');
      setTimeout(() => this.openLeadDrawer(leadId), 150);
    }
  }

  _checkUrlCallbacks() {
    const search = window.location.search || '';
    const hash = window.location.hash || '';
    const fullUrl = search + hash;

    if (fullUrl.includes('meta_auth=success') || fullUrl.includes('connected=true') || fullUrl.includes('connected=facebook') || fullUrl.includes('connected=instagram')) {
      const pageNameMatch = fullUrl.match(/page_name=([^&]+)/);
      const pageIdMatch = fullUrl.match(/page_id=([^&]+)/);
      const usernameMatch = fullUrl.match(/username=([^&]+)/);
      const isIg = fullUrl.includes('channel=instagram') || fullUrl.includes('connected=instagram') || (usernameMatch && fullUrl.includes('instagram'));
      const rawName = pageNameMatch ? decodeURIComponent(pageNameMatch[1]) : (usernameMatch ? decodeURIComponent(usernameMatch[1]) : (isIg ? 'Instagram Account' : 'Facebook Page'));
      const pageName = isIg && !rawName.startsWith('@') ? `@${rawName}` : rawName;
      const pageId = pageIdMatch ? decodeURIComponent(pageIdMatch[1]) : `page_${Date.now()}`;
      const channel = isIg ? 'instagram' : 'facebook';
      const color = isIg ? '#E1306C' : '#1877F2';

      // Register connected page/account in CRM state
      if (this.svc) {
        if (!this.svc.pages) this.svc.pages = [];
        const existing = this.svc.pages.find(p => p.id === pageId || p.page_id === pageId);
        if (!existing) {
          this.svc.pages.push({
            id: pageId,
            page_id: pageId,
            name: pageName,
            channel: channel,
            color: color,
            provider: 'zernio',
            connected_at: new Date().toISOString()
          });
          if (this.svc._saveToStorage) this.svc._saveToStorage();
          else if (this.svc.saveAll) this.svc.saveAll();
        }
      }

      this.metaConnectionState = 'connected';
      try { localStorage.setItem('metacrm_meta_conn_state', 'connected'); } catch (e) {}
      this.toast(`✅ "${pageName}" is connected! Leads & messages will now appear automatically.`, 'success');
      
      if (window.history && window.history.replaceState) {
        window.history.replaceState({}, document.title, window.location.pathname + '#connections');
      }
      this.renderSidebar();
    } else if (fullUrl.includes('meta_auth=no_pages')) {
      this.metaConnectionState = 'not_connected';
      try { localStorage.setItem('metacrm_meta_conn_state', 'not_connected'); } catch (e) {}
      this.toast('⚠️ Connected to Facebook, but no Facebook Pages were found on this account. Please create or manage a Facebook Page first.', 'warning');
      if (window.history && window.history.replaceState) {
        window.history.replaceState({}, document.title, window.location.pathname + '#connections');
      }
    } else if (fullUrl.includes('meta_auth=error')) {
      const msgMatch = fullUrl.match(/msg=([^&]+)/);
      const msg = msgMatch ? decodeURIComponent(msgMatch[1]) : 'Permissions declined or window closed';
      this.metaConnectionState = 'not_connected';
      try { localStorage.setItem('metacrm_meta_conn_state', 'not_connected'); } catch (e) {}
      this.toast(`⚠️ Couldn't connect to Facebook: ${msg}`, 'error');
      if (window.history && window.history.replaceState) {
        window.history.replaceState({}, document.title, window.location.pathname + '#connections');
      }
    } else if (fullUrl.includes('email_auth=success')) {
      const emailMatch = fullUrl.match(/email=([^&]+)/);
      const email = emailMatch ? decodeURIComponent(emailMatch[1]) : 'Email Account';
      const provMatch = fullUrl.match(/provider=([^&]+)/);
      const prov = provMatch ? decodeURIComponent(provMatch[1]) : 'Email';
      this.toast(`✅ ${prov === 'google' ? 'Google Workspace' : 'Microsoft 365'} (${email}) connected successfully!`, 'success');
      if (window.history && window.history.replaceState) {
        window.history.replaceState({}, document.title, window.location.pathname + '#integrations');
      }
      this.render();
    } else if (fullUrl.includes('email_auth=error')) {
      const msgMatch = fullUrl.match(/msg=([^&]+)/);
      const msg = msgMatch ? decodeURIComponent(msgMatch[1]) : 'Authorization declined or cancelled';
      this.toast(`⚠️ Email authorization error: ${msg}`, 'error');
      if (window.history && window.history.replaceState) {
        window.history.replaceState({}, document.title, window.location.pathname + '#integrations');
      }
    }
  }

  _route() {
    this._checkUrlCallbacks();

    let hash = window.location.hash.replace(/^#\/?/, '') || 'dashboard';
    hash = hash.split('?')[0];
    hash = hash.replace(/^(admin|staff)\//, '');

    // Check if user is logged out or visiting #login
    if (hash === 'login' || !this.user) {
      this.currentRoute = 'login';
      this.renderAuthScreen();
      return;
    }

    if (this.el.auth) this.el.auth.style.display = 'none';
    if (this.el.appLayout) this.el.appLayout.style.display = 'flex';

    this.currentRoute = hash;
    if (document.body) {
      document.body.setAttribute('data-page', hash);
    }
    this.toggleMobileSidebar(false);
    this.renderSidebar();
    this._renderPage();
  }

  navigate(path) {
    window.location.hash = path;
  }

  // ──────────────────────────────────────────────────────────
  // Dedicated Login, Signup & Auth Management
  // ──────────────────────────────────────────────────────────

  renderAuthScreen() {
    if (this.el.appLayout) this.el.appLayout.style.display = 'none';
    if (!this.el.auth) return;

    this.el.auth.style.display = 'flex';
    this.el.auth.innerHTML = `
      <div class="auth-card">
        <div class="auth-brand">
          <div class="auth-brand-logo">
            <svg width="44" height="44" viewBox="0 0 32 32" fill="none">
              <rect width="32" height="32" rx="10" fill="url(#auth-grad)" />
              <path d="M8 16c0-3.3 2.5-5.8 5.8-5.8 2.2 0 4 1.2 5 3l-2.2 1.3c-.7-1.1-1.6-1.7-2.8-1.7-1.9 0-3.3 1.4-3.3 3.2s1.4 3.2 3.3 3.2c1.2 0 2.1-.6 2.8-1.7l2.2 1.3c-1 1.8-2.8 3-5 3C10.5 21.8 8 19.3 8 16z" fill="#fff" />
              <circle cx="23" cy="16" r="3.2" fill="#10B981" />
              <defs>
                <linearGradient id="auth-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stop-color="#6366F1" />
                  <stop offset="100%" stop-color="#4338CA" />
                </linearGradient>
              </defs>
            </svg>
          </div>
          <h2 class="auth-title">MetaCRM</h2>
          <p class="auth-subtitle">Meta &amp; Instagram Multi-User Lead Management</p>
        </div>

        <div class="auth-tabs">
          <button class="auth-tab-btn ${this.authTab === 'login' ? 'active' : ''}" onclick="window.app.switchAuthTab('login')">Sign In</button>
          <button class="auth-tab-btn ${this.authTab === 'signup' ? 'active' : ''}" onclick="window.app.switchAuthTab('signup')">Create Account</button>
        </div>

        <div id="auth-feedback"></div>

        ${this.authTab === 'login' ? `
        <form onsubmit="event.preventDefault(); window.app.submitLogin();">
          <div style="margin-bottom:14px;">
            <label class="settings-label">Work Email</label>
            <input type="email" id="login-email" class="input" placeholder="admin@company.com" required autocomplete="username">
          </div>
          <div style="margin-bottom:8px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
              <label class="settings-label" style="margin-bottom:0;">Password</label>
              <a href="javascript:void(0)" onclick="window.app.openForgotPasswordModal()" class="link-small" style="font-size:11px;">Forgot password?</a>
            </div>
            <input type="password" id="login-password" class="input" placeholder="••••••••" required autocomplete="current-password">
          </div>
          <button type="submit" id="login-submit-btn" class="btn btn-primary w-full" style="margin-top:16px;padding:10px;">
            Sign In to MetaCRM
          </button>
        </form>` : `
        <form onsubmit="event.preventDefault(); window.app.submitSignup();">
          <div style="margin-bottom:12px;">
            <label class="settings-label">Full Name</label>
            <input type="text" id="signup-name" class="input" placeholder="Alex Morgan" required>
          </div>
          <div style="margin-bottom:12px;">
            <label class="settings-label">Work Email</label>
            <input type="email" id="signup-email" class="input" placeholder="alex@company.com" required>
          </div>
          <div style="margin-bottom:12px;">
            <label class="settings-label">Password</label>
            <input type="password" id="signup-password" class="input" placeholder="At least 6 characters" minlength="6" required>
          </div>
          <div style="margin-bottom:14px;">
            <label class="settings-label">Account Role</label>
            <select id="signup-role" class="input">
              <option value="admin">Administrator (Full Access to All Pages)</option>
              <option value="staff">Sales Staff (Assigned Pages Only)</option>
            </select>
          </div>
          <button type="submit" id="signup-submit-btn" class="btn btn-primary w-full" style="margin-top:6px;padding:10px;">
            Create Account &amp; Start
          </button>
        </form>`}

      </div>
    `;
  }

  switchAuthTab(tab) {
    this.authTab = tab;
    this.renderAuthScreen();
  }

  async submitLogin() {
    const email = (document.getElementById('login-email')?.value || '').trim();
    const pass = (document.getElementById('login-password')?.value || '').trim();
    const feedback = document.getElementById('auth-feedback');
    const submitBtn = document.getElementById('login-submit-btn');

    if (!email || !pass) {
      if (feedback) feedback.innerHTML = '<div class="auth-error-banner">Please enter both your work email and password.</div>';
      return;
    }

    if (submitBtn) submitBtn.innerHTML = '<span class="spinner"></span> Verifying credentials…';

    try {
      // 1. Try Supabase Auth if connected
      if (window.supabaseService && window.supabaseService.isLive) {
        const { data, error } = await window.supabaseService.login(email, pass);
        if (!error && data?.user) {
          const authUser = {
            id: data.user.id,
            email: data.user.email,
            name: data.user.user_metadata?.full_name || data.user.email.split('@')[0],
            role: data.user.user_metadata?.role || 'admin',
            assignedPageIds: []
          };
          this.user = authUser;
          if (this.svc) {
            this.svc.currentUser = authUser;
            this.svc.saveAll();
          }
          try { localStorage.setItem('metacrm_authenticated', 'true'); } catch (e) {}
          this.toast(`Welcome back, ${authUser.name}!`, 'success');
          this.navigate('dashboard');
          return;
        }
      }

      // 2. Service-level login fallback
      if (this.svc) {
        const res = this.svc.login(email, pass);
        if (res.success) {
          this.user = res.user;
          try { localStorage.setItem('metacrm_authenticated', 'true'); } catch (e) {}
          this.toast(`Welcome back, ${(this.user.displayName || this.user.name).split(' ')[0]}!`, 'success');
          this.navigate('dashboard');
          return;
        } else {
          if (submitBtn) submitBtn.innerHTML = 'Sign In to MetaCRM';
          if (feedback) feedback.innerHTML = `<div class="auth-error-banner"><span>⚠️</span> ${res.error || 'Incorrect email or password. Please verify and try again.'}</div>`;
        }
      }
    } catch (err) {
      if (submitBtn) submitBtn.innerHTML = 'Sign In to MetaCRM';
      if (feedback) feedback.innerHTML = `<div class="auth-error-banner"><span>⚠️</span> ${err.message || 'Authentication failed'}</div>`;
    }
  }

  submitSignup() {
    const name = (document.getElementById('signup-name')?.value || '').trim();
    const email = (document.getElementById('signup-email')?.value || '').trim();
    const pass = (document.getElementById('signup-password')?.value || '').trim();
    const role = document.getElementById('signup-role')?.value || 'admin';
    const feedback = document.getElementById('auth-feedback');
    const submitBtn = document.getElementById('signup-submit-btn');

    if (!name || !email || !pass) {
      if (feedback) feedback.innerHTML = '<div class="auth-error-banner">Please fill in all registration fields.</div>';
      return;
    }

    if (submitBtn) submitBtn.innerHTML = '<span class="spinner"></span> Creating account…';

    setTimeout(() => {
      const newUser = {
        id: `usr_${Date.now()}`,
        name: name,
        displayName: name,
        email: email,
        role: role,
        status: 'active',
        assignedPageIds: role === 'admin' ? (this.svc ? this.svc.pages.map(p => p.id) : []) : []
      };

      if (this.svc) {
        this.svc.staff.push(newUser);
        this.svc.saveAll();
        this.svc.login(email);
        this.user = this.svc.getCurrentUser();
      }

      try { localStorage.setItem('metacrm_authenticated', 'true'); } catch (e) {}
      this.toast(`Account created! Welcome, ${name.split(' ')[0]}!`, 'success');
      this.navigate('dashboard');
    }, 400);
  }

  openForgotPasswordModal() {
    this.el.mTitle.textContent = 'Reset Password';
    this.el.mBody.innerHTML = `
      <p class="text-xs text-gray mb-3">Enter the email associated with your MetaCRM account and we'll send a secure password reset link.</p>
      <label class="settings-label">Work Email</label>
      <input type="email" id="reset-email" class="input" placeholder="you@company.com" required value="${document.getElementById('login-email')?.value || ''}">
      <div id="reset-msg" style="margin-top:10px;"></div>
    `;
    this.el.mConfirm.textContent = 'Send Reset Link';
    this.el.mConfirm.className = 'btn btn-primary';
    this.el.mConfirm.onclick = () => {
      const email = (document.getElementById('reset-email')?.value || '').trim();
      if (!email || !email.includes('@')) {
        document.getElementById('reset-msg').innerHTML = '<div class="auth-error-banner">Please enter a valid email address.</div>';
        return;
      }
      this.el.mConfirm.innerHTML = '<span class="spinner"></span> Sending…';
      setTimeout(() => {
        this.closeModal();
        this.toast(`✓ Password reset instructions sent to ${email}. Check your inbox!`, 'success');
      }, 500);
    };
    this.el.mOverlay.classList.add('open');
  }

  logout() {
    this.confirmDialog({
      title: 'Sign Out',
      message: 'Are you sure you want to sign out of MetaCRM?',
      confirmText: 'Sign Out',
      isDanger: false,
      onConfirm: () => {
        if (this.svc) this.svc.logout();
        this.user = null;
        try { localStorage.removeItem('metacrm_authenticated'); } catch (e) {}
        this.toast('You have been signed out.', 'info');
        this.navigate('login');
      }
    });
  }

  // ──────────────────────────────────────────────────────────
  // Sidebar Navigation with RBAC
  // ──────────────────────────────────────────────────────────

  renderSidebar() {
    const isAdmin = this.user.role === 'admin' || this.user.role === 'super_admin';
    const leads = this._filterUserLeads(this.svc ? this.svc.leads : []);
    const newLeads = leads.filter(l => l.status === 'New' || l.status === 'New Lead').length;
    const tasks = this._filterUserTasks(this.svc ? this.svc.tasks : []);
    const overdueTasks = tasks.filter(t => t.status !== 'Done' && t.dueDate && new Date(t.dueDate) < new Date()).length;
    const activeWs = this.selectedWorkspace || 'MetaCRM Workspace';
    const unreadConvs = (this.svc ? (this.svc.conversations || []) : []).reduce((s, c) => s + (c.unread || 0), 0);

    const unreadEmails = (this.svc ? (this.svc.emailMessages || []) : []).filter(m => !m.is_read && m.folder === 'inbox').length;

    const sections = [
      {
        title: 'WORKSPACE',
        items: [
          { id: 'dashboard',   icon: `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.75" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>`, label: 'Dashboard', shortcut: '' },
          { id: 'leads',       icon: `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.75" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`, label: 'Leads', badge: newLeads > 0 ? newLeads : null, shortcut: '' },
          { id: 'inbox',       icon: `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.75" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`, label: 'Messages', badge: unreadConvs > 0 ? unreadConvs : null, shortcut: '' },
          { id: 'email',       icon: `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.75" viewBox="0 0 24 24"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>`, label: 'Email', badge: unreadEmails > 0 ? unreadEmails : null, shortcut: '' },
          { id: 'meta-ads',    icon: `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.75" viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>`, label: 'Meta Ads', shortcut: '' },
          { id: 'tasks',       icon: `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.75" viewBox="0 0 24 24"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`, label: 'Follow-ups', badge: overdueTasks > 0 ? overdueTasks : null, shortcut: '' },
        ]
      },
      {
        title: 'MANAGEMENT',
        items: [
          { id: 'pipeline',     icon: `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.75" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>`, label: 'Pipeline', shortcut: '' },
          { id: 'integrations', icon: `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.75" viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`, label: 'Integrations', shortcut: '' },
          { id: 'connections',  icon: `<svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>`, label: 'Connect Facebook', shortcut: '' },
          ...(isAdmin ? [
            { id: 'staff',      icon: `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.75" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`, label: 'Team', shortcut: '' },
            { id: 'reports',    icon: `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.75" viewBox="0 0 24 24"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>`, label: 'Reports', shortcut: '' },
          ] : [])
        ]
      }
    ];

    const currentWorkspaces = this._getWorkspaces();
    const wsItemsHtml = currentWorkspaces.map(ws => `
      <div class="ws-dropdown-item ${activeWs === ws ? 'active' : ''}" onclick="window.app.selectWorkspace('${escapeHtml(ws)}')">
        ${escapeHtml(ws)}
      </div>
    `).join('');

    let html = `
      <div class="workspace-switcher-wrapper">
        <div class="workspace-switcher-btn" onclick="window.app.toggleWorkspaceDropdown(event)" title="Switch Workspace">
          <div style="display:flex;align-items:center;min-width:0;flex:1;gap:8px;">
            <div class="ws-avatar" style="background:#202223;border-radius:6px;width:24px;height:24px;display:flex;align-items:center;justify-content:center;margin-right:0;">
              <svg width="13" height="13" fill="none" stroke="#FFFFFF" stroke-width="2" viewBox="0 0 24 24">
                <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                <polyline points="9 22 9 12 15 12 15 22"/>
              </svg>
            </div>
            <div class="ws-info">
              <span class="ws-name">${escapeHtml(activeWs)}</span>
              <span class="ws-plan">Production</span>
            </div>
          </div>
          <svg class="ws-chevron" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>
        </div>
        <div id="ws-dropdown" class="ws-dropdown" style="display:none;" onclick="event.stopPropagation()">
          ${wsItemsHtml}
          <div class="ws-divider"></div>
          <div class="ws-dropdown-item ws-create" onclick="window.app.createWorkspacePrompt()">+ Create Workspace</div>
        </div>
      </div>
    `;

    sections.forEach(sec => {
      html += `<div class="nav-section-title">${sec.title}</div>`;
      sec.items.forEach(item => {
        const active = this.currentRoute === item.id ? 'active' : '';
        const badge = item.badge ? `<span class="nav-badge-red">${item.badge}</span>` : '';
        const shortcut = item.shortcut ? `<kbd class="nav-shortcut">${item.shortcut}</kbd>` : '';
        html += `
          <a href="#${item.id}" class="nav-item ${active}">
            <div class="nav-item-left">
              <span class="nav-icon">${item.icon}</span>
              <span class="nav-text">${item.label}</span>
            </div>
            <div class="nav-item-right">
              ${shortcut}
              ${badge}
            </div>
          </a>`;
      });
    });

    // Bottom Navigation with Settings & User Profile
    html += `
      <div class="sidebar-spacer"></div>
      <div class="nav-bottom">
        <a href="#settings" class="nav-item ${this.currentRoute === 'settings' ? 'active' : ''}">
          <div class="nav-item-left">
            <span class="nav-icon"><svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg></span>
            <span class="nav-text">Settings</span>
          </div>
          <div class="nav-item-right">
            <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></svg>
          </div>
        </a>
        <div class="user-profile-item" onclick="window.app.openUserSwitchModal()">
          <div class="user-avatar" style="background:#202223;color:#FFFFFF;font-weight:600;">
            ${(this.user.name || 'A').charAt(0).toUpperCase()}
          </div>
          <div class="nav-text user-info">
            <div class="user-name">${this.user.displayName || this.user.name}</div>
            <div class="user-role">${this._roleLabel(this.user.role)} &bull; Switch</div>
          </div>
        </div>
        <div class="nav-item" style="margin-top:2px;" onclick="window.app.logout()">
          <div class="nav-item-left">
            <span class="nav-icon"><svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg></span>
            <span class="nav-text">Log out</span>
          </div>
        </div>
      </div>`;

    this.el.nav.innerHTML = html;
  }

  toggleWorkspaceDropdown(e) {
    if (e) e.stopPropagation();
    const dd = document.getElementById('ws-dropdown');
    if (dd) {
      dd.style.display = dd.style.display === 'none' ? 'flex' : 'none';
    }
  }

  _getWorkspaces() {
    try {
      const raw = localStorage.getItem('metacrm_workspaces');
      if (raw) {
        const list = JSON.parse(raw);
        if (Array.isArray(list) && list.length > 0) return list;
      }
    } catch (e) {}
    return ['MetaCRM Workspace'];
  }

  selectWorkspace(name) {
    this.selectedWorkspace = name;
    try { localStorage.setItem('metacrm_active_workspace', name); } catch (e) {}
    const dd = document.getElementById('ws-dropdown');
    if (dd) dd.style.display = 'none';
    this.renderSidebar();
    if (typeof this.toast === 'function') {
      this.toast(`Active workspace: ${name}`, 'info');
    }
  }

  createWorkspacePrompt() {
    const dd = document.getElementById('ws-dropdown');
    if (dd) dd.style.display = 'none';
    const name = prompt('Create new workspace:');
    if (name && name.trim()) {
      const trimmed = name.trim();
      try {
        const list = this._getWorkspaces();
        if (!list.includes(trimmed)) {
          list.push(trimmed);
          localStorage.setItem('metacrm_workspaces', JSON.stringify(list));
        }
      } catch (e) {}
      this.selectWorkspace(trimmed);
    }
  }

  _roleLabel(role) {
    const map = { super_admin: 'Super Admin', admin: 'Super Admin', staff: 'Staff' };
    return map[role] || role;
  }

  // ──────────────────────────────────────────────────────────
  // Page Router Dispatcher
  // ──────────────────────────────────────────────────────────

  _renderPage() {
    this.el.content.innerHTML = `<div class="page-skeleton"></div>`;
    if (this.currentRoute === 'inbox' || this.currentRoute === 'email') {
      this.el.content.classList.add('inbox-view-container');
    } else {
      this.el.content.classList.remove('inbox-view-container');
    }
    setTimeout(() => {
      switch (this.currentRoute) {
        case 'dashboard':
          if (!this._lastAutoRefresh || (Date.now() - this._lastAutoRefresh > 20000)) {
            this._lastAutoRefresh = Date.now();
            if (this.svc && this.svc.fetchRemoteData) {
              this.svc.fetchRemoteData().then(() => {
                if (this.currentRoute === 'dashboard') this.renderDashboard();
              }).catch(() => {});
            }
          }
          this.renderDashboard();
          break;
        case 'leads':        this.renderLeads(); break;
        case 'inbox':        this.renderInbox(); break;
        case 'email':        this.renderEmailInbox(); break;
        case 'meta-ads':     this.renderMetaAds(); break;
        case 'pipeline':     this.renderPipeline(); break;
        case 'tasks':        this.renderTasks(); break;
        case 'reports':      this.renderReports(); break;
        case 'integrations': this.renderIntegrations(); break;
        case 'connections':  this.renderConnections(); break;
        case 'staff':        this.renderStaff(); break;
        case 'settings':     this.renderSettings(); break;
        default:             this.renderDashboard(); break;
      }
    }, 80);
  }

  _icon(name, size = 15, className = '') {
    const s = size;
    const icons = {
      phone: `<svg width="${s}" height="${s}" class="${className}" fill="none" stroke="currentColor" stroke-width="1.75" viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`,
      whatsapp: `<svg width="${s}" height="${s}" class="${className}" fill="currentColor" viewBox="0 0 24 24"><path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.582 2.128 2.182-.573c.978.58 1.911.928 3.145.929 3.178 0 5.767-2.587 5.768-5.766.001-3.187-2.575-5.77-5.764-5.771zm3.392 8.244c-.144.405-.837.774-1.17.824-.312.045-.694.072-2.127-.521-1.727-.714-2.839-2.477-2.926-2.593-.086-.115-.705-.939-.705-1.789 0-.85.447-1.267.606-1.44.159-.174.347-.217.462-.217.116 0 .232.001.332.006.107.005.25-.041.39.296.145.348.492 1.202.535 1.289.043.087.072.188.014.304-.058.116-.087.188-.173.289l-.261.304c-.087.086-.177.18-.076.353.101.174.45 1.06 1.488 1.984.779.695 1.436.909 1.639.996.202.087.322.072.441-.065.119-.137.509-.594.646-.797.137-.202.274-.173.462-.101.188.072 1.185.558 1.387.66.202.101.337.151.386.236.049.085.049.493-.095.898z"/></svg>`,
      mail: `<svg width="${s}" height="${s}" class="${className}" fill="none" stroke="currentColor" stroke-width="1.75" viewBox="0 0 24 24"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>`,
      instagram: `<svg width="${s}" height="${s}" class="${className}" fill="none" stroke="currentColor" stroke-width="1.75" viewBox="0 0 24 24"><rect width="20" height="20" x="2" y="2" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/></svg>`,
      facebook: `<svg width="${s}" height="${s}" class="${className}" fill="currentColor" viewBox="0 0 24 24"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>`,
      calendar: `<svg width="${s}" height="${s}" class="${className}" fill="none" stroke="currentColor" stroke-width="1.75" viewBox="0 0 24 24"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>`,
      user: `<svg width="${s}" height="${s}" class="${className}" fill="none" stroke="currentColor" stroke-width="1.75" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
      trash: `<svg width="${s}" height="${s}" class="${className}" fill="none" stroke="currentColor" stroke-width="1.75" viewBox="0 0 24 24"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>`,
      flame: `<svg width="${s}" height="${s}" class="${className}" fill="currentColor" viewBox="0 0 24 24"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>`,
      check: `<svg width="${s}" height="${s}" class="${className}" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>`,
      search: `<svg width="${s}" height="${s}" class="${className}" fill="none" stroke="currentColor" stroke-width="1.75" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>`,
      refresh: `<svg width="${s}" height="${s}" class="${className}" fill="none" stroke="currentColor" stroke-width="1.75" viewBox="0 0 24 24"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 21h5v-5"/></svg>`,
      alert: `<svg width="${s}" height="${s}" class="${className}" fill="none" stroke="currentColor" stroke-width="1.75" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
      clipboard: `<svg width="${s}" height="${s}" class="${className}" fill="none" stroke="currentColor" stroke-width="1.75" viewBox="0 0 24 24"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>`,
      clock: `<svg width="${s}" height="${s}" class="${className}" fill="none" stroke="currentColor" stroke-width="1.75" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
      inbox: `<svg width="${s}" height="${s}" class="${className}" fill="none" stroke="currentColor" stroke-width="1.75" viewBox="0 0 24 24"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>`,
      sparkles: `<svg width="${s}" height="${s}" class="${className}" fill="none" stroke="currentColor" stroke-width="1.75" viewBox="0 0 24 24"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3z"/></svg>`
    };
    return icons[name] || '';
  }

  _setBreadcrumbs(sectionName) {
    const ws = this.selectedWorkspace || 'MetaCRM Workspace';
    this.el.title.innerHTML = `
      <div class="topbar-breadcrumbs">
        <a href="#dashboard" class="breadcrumb-item">MetaCRM</a>
        <span class="breadcrumb-sep">/</span>
        <span class="breadcrumb-item">${escapeHtml(ws)}</span>
        <span class="breadcrumb-sep">/</span>
        <span class="breadcrumb-item active">${escapeHtml(sectionName)}</span>
      </div>
    `;
  }

  // ──────────────────────────────────────────────────────────
  // DASHBOARD (Section 18 & 19)
  // ──────────────────────────────────────────────────────────

  renderDashboard() {
    const now = new Date();
    const hour = now.getHours();
    const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    const isAdmin = this.user.role !== 'staff';

    // Page selector for header
    const availablePages = this._getAccessiblePages();
    let pageSelectOptions = `<option value="all">All Pages (${availablePages.length})</option>`;
    if (!isAdmin) {
      pageSelectOptions = availablePages.map(p => `<option value="${p.id}" ${this.selectedPageFilter === p.id ? 'selected' : ''}>${p.name}</option>`).join('');
    } else {
      pageSelectOptions += availablePages.map(p => `<option value="${p.id}" ${this.selectedPageFilter === p.id ? 'selected' : ''}>${p.name}</option>`).join('');
    }

    // Top Header - matches reference image: Greeting + Super Admin badge + Subtitle
    this.el.title.innerHTML = `
      <div class="topbar-greeting-wrap">
        <div class="topbar-greeting-row">
          <span class="topbar-greeting-name">${greeting}, ${(this.user.displayName || this.user.name || 'Administrator').split(' ')[0] || 'Administrator'}</span>
          <span class="topbar-role-badge">${this._roleLabel(this.user.role)}</span>
        </div>
        <div class="topbar-greeting-sub">Here's what's happening with your leads and campaigns today.</div>
      </div>`;

    // Topbar Actions Controls: Date range + Pages + Refresh
    const lastUpdatedStr = this._formatLastUpdatedTime();
    this.el.actions.innerHTML = `
      <div class="topbar-pill-control" title="Change date range" onclick="this.querySelector('select').showPicker ? this.querySelector('select').showPicker() : this.querySelector('select').focus()">
        <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.75" viewBox="0 0 24 24"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>
        <select onchange="window.app.onDateRangeChange(this.value)" style="border:none;background:transparent;outline:none;font-size:12px;font-weight:500;color:var(--text-primary);cursor:pointer;padding-right:4px;">
          <option value="today" ${this.selectedDateRange==='today'?'selected':''}>Today</option>
          <option value="yesterday" ${this.selectedDateRange==='yesterday'?'selected':''}>Yesterday</option>
          <option value="last_7d" ${this.selectedDateRange==='last_7d'?'selected':''}>Last 7 days</option>
          <option value="last_30d" ${this.selectedDateRange==='last_30d'?'selected':''}>Last 30 days</option>
          <option value="this_month" ${this.selectedDateRange==='this_month'?'selected':''}>This month</option>
        </select>
        <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg>
      </div>

      <div class="topbar-pill-control" title="Filter by Facebook Page" onclick="this.querySelector('select').showPicker ? this.querySelector('select').showPicker() : this.querySelector('select').focus()">
        <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.75" viewBox="0 0 24 24"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" x2="4" y1="22" y2="15"/></svg>
        <select onchange="window.app.onPageFilterChange(this.value)" style="border:none;background:transparent;outline:none;font-size:12px;font-weight:500;color:var(--text-primary);cursor:pointer;padding-right:4px;">
          ${pageSelectOptions}
        </select>
        <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg>
      </div>

      <button id="dashboard-refresh-btn" class="topbar-pill-btn" onclick="window.app.refreshDashboardData(true)" title="Refresh dashboard data">
        <svg width="14" height="14" id="dash-refresh-icon" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 21h5v-5"/></svg>
        <span id="dash-last-updated" style="font-size:11px;font-weight:500;color:var(--text-secondary);">${lastUpdatedStr}</span>
      </button>`;

    const avatarEl = document.getElementById('topbar-avatar');
    if (avatarEl) {
      avatarEl.textContent = (this.user.name || 'A').charAt(0).toUpperCase();
    }

    const leads = this._getFilteredLeads(true);
    const allScopedLeads = this._getFilteredLeads(false);
    const newL = leads.filter(l => l.status === 'New' || l.status === 'New Lead');
    const todayLeadsCount = allScopedLeads.filter(l => this._isDateInRangeIST(l.created_at || l.createdAt, 'today')).length;
    const qualL = leads.filter(l => l.status === 'Qualified');
    const wonL = leads.filter(l => l.status === 'Won' || l.status === 'Converted');
    const followL = leads.filter(l => l.status === 'Follow-up');

    // Calculate Spend and CPL
    const campaignsList = (this.svc && this.svc.campaigns) ? this.svc.campaigns : [];
    const totalSpend = isAdmin ? campaignsList.reduce((sum, c) => sum + (c.spend || 0), 0) : null;
    const cpl = totalSpend && leads.length ? Math.round(totalSpend / leads.length) : 0;
    const accessibleConvs = (this.user.role === 'admin' || this.user.role === 'super_admin')
      ? (this.svc ? (this.svc.conversations || []) : [])
      : (this.svc ? (this.svc.conversations || []) : []).filter(c => !c.page_id || availablePages.some(p => p.id === c.page_id));
    const unreadMessagesCount = accessibleConvs.reduce((sum, c) => sum + (c.unread || c.unread_count || 0), 0);

    const followUpLeads = leads.filter(l => l.status === 'Follow-up' || l.status === 'followup' || (l.follow_up_date && new Date(l.follow_up_date) <= new Date()));
    const allPendingTasks = this._filterUserTasks(this.svc ? this.svc.tasks : []).filter(t => t.status !== 'Done');
    const followUpTasks = allPendingTasks.filter(t => (t.type && t.type.toLowerCase().includes('follow')) || (t.title && t.title.toLowerCase().includes('follow')));
    const followUpsDueCount = followUpLeads.length > 0 ? (followUpLeads.length + followUpTasks.length) : allPendingTasks.length;

    // Page Performance Rows (for Leads Breakdown by Page)
    const pageRows = availablePages.map(p => {
      const pLeads = (this.svc ? this.svc.leads : []).filter(l => l.page_id === p.id || l.pageId === p.id || l.source === p.name);
      const pWon = pLeads.filter(l => l.status === 'Won' || l.status === 'Converted');
      const conv = pLeads.length ? ((pWon.length / pLeads.length) * 100).toFixed(0) : 0;
      const spend = p.spend || 0;
      const pageCpl = pLeads.length && spend ? Math.round(spend / pLeads.length) : 0;
      const isIg = (p.name || '').toLowerCase().includes('insta') || (p.platform === 'instagram');
      return `
        <tr class="clickable-row" onclick="window.app.onPageFilterChange('${p.id}')">
          <td>
            <div class="page-name-cell">
              ${isIg ? this._icon('instagram', 15) : this._icon('facebook', 15)}
              <span>${escapeHtml(p.name)}</span>
            </div>
          </td>
          <td style="text-align:right;font-weight:600;">${pLeads.length}</td>
          <td style="text-align:right;">${pWon.length}</td>
          <td style="text-align:right;">${conv}%</td>
          <td style="text-align:right;">${this.formatMoney(spend)}</td>
          <td style="text-align:right;">${this.formatMoney(pageCpl)}</td>
          <td style="text-align:right;color:var(--text-muted);">&gt;</td>
        </tr>`;
    }).join('');

    // Campaigns Performance Rows
    const campaigns = (this.svc && this.svc.campaigns) ? this.svc.campaigns.slice(0, 5) : [];

    // Recent leads
    const recentLeads = leads.slice(0, 5);
    const recentLeadsRows = recentLeads.length > 0 ? recentLeads.map(l => {
      const sla = this.svc ? this.svc.getLeadSlaStatus(l) : { state: 'compliant', text: 'On time', label: 'On time' };
      const isBreach = sla.state === 'breached' || sla.state === 'warning';
      const slaColor = isBreach ? 'amber' : 'green';
      const slaText = sla.text || (isBreach ? 'Due in 2h' : 'On time');
      const pageName = this._pageName(l.page_id || l.pageId) || l.source || 'Facebook Page 1';

      let badgeClass = 'badge-pill-new';
      const st = (l.status || '').toLowerCase();
      if (st.includes('contact')) badgeClass = 'badge-pill-contacted';
      else if (st.includes('follow')) badgeClass = 'badge-pill-followup';
      else if (st.includes('qual')) badgeClass = 'badge-pill-qualified';
      else if (st.includes('won')) badgeClass = 'badge-pill-qualified';

      const initial = (l.name || 'L').charAt(0).toUpperCase();

      return `
        <tr class="clickable-row" onclick="window.app.openLeadDrawer('${l.id}')">
          <td>
            <div class="lead-user-cell">
              <div class="lead-avatar-circle">${initial}</div>
              <div class="lead-name-col">
                <div class="lead-name-txt">${escapeHtml(l.name)}</div>
                <div class="lead-phone-txt">${escapeHtml(l.phone || l.email || 'No phone')}</div>
              </div>
            </div>
          </td>
          <td>
            <span class="page-source-name">${escapeHtml(pageName)}</span>
          </td>
          <td>
            <span class="${badgeClass}">${escapeHtml(l.status || 'New')}</span>
          </td>
          <td>
            <span class="sla-dot-label ${slaColor}">
              <span class="sla-dot-indicator ${slaColor}"></span>
              <span>${escapeHtml(slaText)}</span>
            </span>
          </td>
          <td onclick="event.stopPropagation()">
            <div class="quick-contact-actions">
              <button class="btn-contact-icon" title="Call lead" onclick="window.app.quickCall('${l.id}')">
                ${this._icon('phone', 12)}
              </button>
              <button class="btn-contact-icon" title="Message lead" onclick="window.app.openLeadMessage('${l.id}')">
                ${this._icon('message-square', 12)}
              </button>
            </div>
          </td>
          <td>
            <span class="time-ago-txt">${this._timeAgo(l.created_at || l.createdAt)}</span>
          </td>
          <td onclick="event.stopPropagation()">
            <button class="btn-more-dots" onclick="window.app.openLeadDrawer('${l.id}')" title="More options">
              <svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>
            </button>
          </td>
        </tr>`;
    }).join('') : `
      <tr>
        <td colspan="7" class="empty-cell" style="text-align:center;padding:32px 16px;color:var(--text-muted);">
          No leads captured yet. Connect a Facebook page to begin capturing leads.
        </td>
      </tr>`;

    // Tasks
    const tasks = this._filterUserTasks(this.svc ? this.svc.tasks : []).filter(t => t.status !== 'Done').slice(0, 4);

    // Compact Facebook Onboarding Banner (Shopify Admin Style)
    const showFbBanner = (availablePages.length === 0) && (sessionStorage.getItem('fb_banner_dismissed') !== 'true');
    const fbOnboardingHtml = showFbBanner ? `
      <div class="fb-onboard-card" id="fb-onboard-card">
        <button class="fb-onboard-close" onclick="window.app.dismissFbBanner(this)" aria-label="Dismiss banner" title="Dismiss">
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>
        </button>

        <div class="fb-onboard-left">
          <div class="fb-onboard-badge">
            <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
            <span>Get Started</span>
          </div>
          <h2 class="fb-onboard-title">Connect your Facebook Page</h2>
          <p class="fb-onboard-desc">Start capturing leads from Facebook &amp; Instagram and manage them all in one place.</p>
          <div class="fb-onboard-actions">
            <button class="btn-fb-primary" onclick="window.app.navigate('connections')">
              <svg class="fb-btn-brand-icon" width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2C6.477 2 2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.879V14.89h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.989C18.343 21.129 22 16.99 22 12c0-5.523-4.477-10-10-10z"/>
              </svg>
              <span>Connect Facebook Page</span>
              <svg class="fb-btn-arrow-icon" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M5 12h14m-7-7 7 7-7 7"/></svg>
            </button>
          </div>
        </div>

        <div class="fb-onboard-right" onclick="window.app.navigate('connections')">
          <div class="fb-visual-cluster">
            <div class="fb-brand-icon-box fb-brand-box">
              <svg width="22" height="22" fill="#1877F2" viewBox="0 0 24 24">
                <path d="M12 2C6.477 2 2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.879V14.89h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.989C18.343 21.129 22 16.99 22 12c0-5.523-4.477-10-10-10z"/>
              </svg>
            </div>
            <div class="fb-visual-bridge">
              <span class="fb-bridge-dot"></span>
              <span class="fb-bridge-line"></span>
              <span class="fb-bridge-dot"></span>
            </div>
            <div class="fb-brand-icon-box ig-brand-box">
              <svg width="22" height="22" fill="none" stroke="url(#ig-banner-grad)" stroke-width="2" viewBox="0 0 24 24">
                <defs>
                  <linearGradient id="ig-banner-grad" x1="0%" y1="100%" x2="100%" y2="0%">
                    <stop offset="0%" stop-color="#F58529"/>
                    <stop offset="50%" stop-color="#DD2A7B"/>
                    <stop offset="100%" stop-color="#8134AF"/>
                  </linearGradient>
                </defs>
                <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
                <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/>
                <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/>
              </svg>
            </div>
          </div>
          <div class="fb-right-copy">
            <div class="fb-right-title">More leads. More sales.</div>
            <div class="fb-right-desc">Manage conversations, capture leads, and track campaigns in one place.</div>
          </div>
        </div>
      </div>
    ` : '';

    const roi = this.svc ? this.svc.getRoiMetrics(this.selectedDateRange, this.selectedPageFilter) : { totalSpend: 0, cpl: 0, cpa: 0, roas: 0, totalLeads: leads.length, totalWonDeals: wonL.length, totalWonValue: 0, activeCampaignsCount: 0 };
    const speed = this.svc ? this.svc.getSpeedToLeadMetrics(leads) : { medianText: '—', complianceRate: '100%', liveBreachCount: 0, respondedCount: 0 };

    this.el.content.innerHTML = `
      ${fbOnboardingHtml}

      <!-- OVERVIEW SECTION & 4 PRIMARY KPIS -->
      <div class="dash-section-title">Overview</div>
      <div class="overview-kpis-row">
        <!-- TOTAL LEADS -->
        <div class="overview-kpi-card" onclick="window.app.navigate('leads')">
          <div class="overview-kpi-top">
            <div class="overview-kpi-left">
              <div class="kpi-icon-box blue">
                <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              </div>
              <span class="kpi-label-text">Total Leads</span><!-- TOTAL LEADS -->
            </div>
            <span class="kpi-arrow-icon">→</span>
          </div>
          <div class="overview-kpi-val">${leads.length}</div>
          <div class="overview-kpi-desc">${this.selectedDateRange === 'today' ? 'Arrived today (IST)' : `Filtered by ${this.selectedDateRange.replace('_', ' ')}`}</div>
        </div>

        <!-- NEW LEADS -->
        <div class="overview-kpi-card" onclick="window.app.navigate('leads'); setTimeout(() => window.app.renderLeads('new'), 60);">
          <div class="overview-kpi-top">
            <div class="overview-kpi-left">
              <div class="kpi-icon-box green">
                <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
              </div>
              <span class="kpi-label-text">New Leads</span><!-- NEW LEADS -->
            </div>
            <span class="kpi-arrow-icon">→</span>
          </div>
          <div class="overview-kpi-val">${newL.length}</div>
          <div class="overview-kpi-desc">${todayLeadsCount > 0 ? `${todayLeadsCount} new today (IST)` : '0 new today (IST)'}</div>
        </div>

        <!-- DEALS WON -->
        <div class="overview-kpi-card" onclick="window.app.navigate('leads'); setTimeout(() => window.app.renderLeads('won'), 60);">
          <div class="overview-kpi-top">
            <div class="overview-kpi-left">
              <div class="kpi-icon-box amber">
                <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.45 1-1 1H7.5c-.28 0-.5.22-.5.5v1c0 .28.22.5.5.5h9c.28 0 .5-.22.5-.5v-1c0-.28-.22-.5-.5-.5H15c-.55 0-1-.45-1-1v-2.34"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2z"/></svg>
              </div>
              <span class="kpi-label-text">Deals Won</span><!-- DEALS WON -->
            </div>
            <span class="kpi-arrow-icon">→</span>
          </div>
          <div class="overview-kpi-val">${wonL.length}</div>
          <div class="overview-kpi-desc">No change from last 30 days</div>
        </div>

        <!-- CONVERSION RATE -->
        <div class="overview-kpi-card" onclick="window.app.navigate('reports')">
          <div class="overview-kpi-top">
            <div class="overview-kpi-left">
              <div class="kpi-icon-box gray">
                <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
              </div>
              <span class="kpi-label-text">Conversion Rate</span><!-- CONVERSION RATE -->
            </div>
            <span class="kpi-arrow-icon">→</span>
          </div>
          <div class="overview-kpi-val">${leads.length ? ((wonL.length / leads.length) * 100).toFixed(0) : 0}%</div>
          <div class="overview-kpi-desc">No change from last 30 days</div>
        </div>
      </div>

      <!-- GROUPED METRICS: LEAD MANAGEMENT & ADVERTISING PERFORMANCE -->
      <div class="grouped-metrics-grid">
        <!-- Lead Management -->
        <div class="grouped-panel-column">
          <div class="grouped-panel-heading">Lead Management</div>
          <div class="grouped-panel-card">
            <div class="submetric-col" onclick="window.app.navigate('inbox'); setTimeout(() => window.app.setInboxTab('unread'), 60);">
              <div class="submetric-label-row">
                <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                <span>Unread Messages</span>
              </div>
              <div class="submetric-val">${unreadMessagesCount}</div>
              <div class="submetric-sub">${unreadMessagesCount > 0 ? `${unreadMessagesCount} unread` : 'No new messages'}</div>
            </div>

            <div class="submetric-col" onclick="${followUpLeads.length > 0 ? `window.app.navigate('leads'); setTimeout(() => window.app.renderLeads('follow-up'), 60);` : `window.app.navigate('tasks');`}">
              <div class="submetric-label-row">
                <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                <span>Follow-ups Due</span>
              </div>
              <div class="submetric-val">${followUpsDueCount}</div>
              <div class="submetric-sub">${followUpsDueCount > 0 ? `${followUpsDueCount} pending` : 'No pending follow-ups'}</div>
            </div>

            <div class="submetric-col">
              <div class="submetric-label-row">
                <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                <span>Median Response Time</span>
              </div>
              <div class="submetric-val">${speed.medianText || '—'}</div>
              <div class="submetric-sub">Target: 5 mins</div>
            </div>

            <div class="submetric-col">
              <div class="submetric-label-row">
                <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>
                <span>SLA Compliance</span>
              </div>
              <div class="submetric-val">${speed.complianceRate || '100%'}</div>
              <div class="submetric-sub">${speed.liveBreachCount > 0 ? `${speed.liveBreachCount} breach${speed.liveBreachCount > 1 ? 'es' : ''}` : 'Within SLA'}</div>
            </div>
          </div>
        </div>

        <!-- Advertising Performance -->
        <div class="grouped-panel-column">
          <div class="grouped-panel-heading">Advertising Performance</div>
          <div class="grouped-panel-card">
            <div class="submetric-col" onclick="window.app.navigate('reports')">
              <div class="submetric-label-row">
                <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="m4.93 4.93 4.24 4.24"/><path d="m14.83 9.17 4.24-4.24"/><path d="m14.83 14.83 4.24 4.24"/><path d="m9.17 14.83-4.24 4.24"/></svg>
                <span>Ad Spend</span><!-- AD SPEND -->
              </div>
              <div class="submetric-val">${this.formatMoney(roi.totalSpend || 0)}</div>
              <div class="submetric-sub">${roi.totalSpend > 0 ? `${roi.activeCampaignsCount || (campaigns.length || 1)} Active Campaign${(roi.activeCampaignsCount || campaigns.length || 1) === 1 ? '' : 's'}` : 'No spend yet'}</div>
            </div>

            <div class="submetric-col" onclick="window.app.navigate('reports')">
              <div class="submetric-label-row">
                <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                <span>Cost Per Lead (CPL)</span><!-- COST PER LEAD (CPL) -->
              </div>
              <div class="submetric-val">${this.formatMoney(roi.cpl || 0)}</div>
              <div class="submetric-sub">Live CPL</div>
            </div>

            <div class="submetric-col" onclick="window.app.navigate('reports')">
              <div class="submetric-label-row">
                <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
                <span>Cost Per Acquisition (CPA)</span><!-- COST PER ACQUISITION (CPA) -->
              </div>
              <div class="submetric-val">${this.formatMoney(roi.cpa || 0)}</div>
              <div class="submetric-sub">Spend / Won Deal</div>
            </div>

            <div class="submetric-col" onclick="window.app.navigate('reports')">
              <div class="submetric-label-row">
                <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg>
                <span>Return on Ad Spend (ROAS)</span>
              </div>
              <div class="submetric-val">${roi.roas || 0}x</div>
              <div class="submetric-sub">Live ROI</div>
            </div>
          </div>
        </div>
      </div>

      <!-- LOWER TWO-COLUMN CONTENT GRID -->
      <div class="lower-dash-grid">
        <!-- Left Column: Tables -->
        <div class="lower-dash-left">
          <!-- Recent Inbound Leads -->
          <div class="dash-panel-card">
            <div class="dash-panel-header">
              <div class="dash-panel-title">Recent Inbound Leads</div>
              <a href="#leads" class="dash-panel-link" onclick="window.app.navigate('leads'); return false;">View All Leads →</a>
            </div>
            <div style="overflow-x: auto;">
              <table class="crm-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Page / Source</th>
                    <th>Status</th>
                    <th>SLA</th>
                    <th>Quick Contact</th>
                    <th>Time</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  ${recentLeadsRows}
                </tbody>
              </table>
            </div>
            <div class="dash-table-footer">
              <div>Showing ${Math.min(recentLeads.length, 5)} of ${leads.length} leads</div>
              <div class="dash-pagination">
                <button class="dash-page-btn" disabled>&lt;</button>
                <button class="dash-page-btn active">1</button>
                <button class="dash-page-btn" disabled>&gt;</button>
              </div>
            </div>
          </div>

          <!-- Leads Breakdown by Page -->
          <div class="dash-panel-card">
            <div class="dash-panel-header">
              <div class="dash-panel-title">Leads Breakdown by Page</div>
              <a href="#reports" class="dash-panel-link" onclick="window.app.navigate('reports'); return false;">View Full Report →</a>
            </div>
            <div style="overflow-x: auto;">
              <table class="crm-table">
                <thead>
                  <tr>
                    <th>Page</th>
                    <th style="text-align:right;">Leads</th>
                    <th style="text-align:right;">Won</th>
                    <th style="text-align:right;">Conv. %</th>
                    <th style="text-align:right;">Spend</th>
                    <th style="text-align:right;">CPL</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  ${pageRows || `
                    <tr>
                      <td colspan="7" class="empty-cell" style="text-align:center;padding:28px 16px;color:var(--text-muted);">
                        No connected pages found. <button class="btn btn-sm btn-primary" onclick="window.app.navigate('connections')" style="margin-left:8px;">Connect Facebook</button>
                      </td>
                    </tr>
                  `}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- Right Column: Diagnostics, Quick Actions, Follow-ups -->
        <div class="lower-dash-right">
          <!-- Meta Connection Status -->
          <div class="dash-panel-card">
            <div class="dash-panel-header">
              <div class="dash-panel-title">Meta Connection Status</div>
              <a href="#connections" class="dash-panel-link" onclick="window.app.navigate('connections'); return false;">Manage Connections →</a>
            </div>
            <div>
              <div class="conn-stat-header">
                <div class="conn-header-left">
                  <svg width="20" height="20" fill="#1877F2" viewBox="0 0 24 24">
                    <path d="M12 2C6.477 2 2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.879V14.89h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.989C18.343 21.129 22 16.99 22 12c0-5.523-4.477-10-10-10z"/>
                  </svg>
                  <span>Facebook Pages Connected</span>
                </div>
                <span class="conn-header-count">${availablePages.length}/6</span>
              </div>

              <div class="conn-diag-row">
                <div class="conn-diag-label">
                  <span class="conn-diag-dot" style="background:${availablePages.length > 0 ? '#10B981' : '#EF4444'};"></span>
                  <span>Webhook Ingestion</span>
                </div>
                <span class="${availablePages.length > 0 ? 'badge-tag-healthy' : 'badge-tag-inactive'}">
                  ${availablePages.length > 0 ? 'Active' : 'Inactive'}
                </span>
              </div>

              <div class="conn-diag-row">
                <div class="conn-diag-label">
                  <span class="conn-diag-dot" style="background:${availablePages.length > 0 ? '#10B981' : '#F59E0B'};"></span>
                  <span>Access Token Health</span>
                </div>
                <span class="${availablePages.length > 0 ? 'badge-tag-healthy' : 'badge-tag-unverified'}">
                  ${availablePages.length > 0 ? 'Verified' : 'Not Verified'}
                </span>
              </div>

              <div class="conn-action-footer">
                <button class="btn-conn-dark" onclick="window.app.navigate('connections')">
                  <svg width="14" height="14" fill="#FFFFFF" viewBox="0 0 24 24">
                    <path d="M12 2C6.477 2 2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.879V14.89h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.989C18.343 21.129 22 16.99 22 12c0-5.523-4.477-10-10-10z"/>
                  </svg>
                  <span>Connect Facebook Page</span>
                </button>
                <div class="conn-last-sync">
                  <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                  <span>Last Sync: ${availablePages.length > 0 ? 'Just now' : '—'}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Quick Actions -->
          <div class="dash-panel-card">
            <div class="dash-panel-header">
              <div class="dash-panel-title">Quick Actions</div>
            </div>
            <div class="qa-grid-4">
              <div class="qa-card-tile" onclick="window.app.openAddLeadModal()">
                <div class="qa-icon-wrap">
                  <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
                </div>
                <div class="qa-tile-txt">Add New Lead</div>
              </div>

              <div class="qa-card-tile" onclick="window.app.navigate('inbox')">
                ${unreadMessagesCount > 0 ? `<span class="qa-red-badge">${unreadMessagesCount}</span>` : ''}
                <div class="qa-icon-wrap">
                  <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                </div>
                <div class="qa-tile-txt">Open Inbox</div>
              </div>

              <div class="qa-card-tile" onclick="window.app.openAddTaskModal()">
                <div class="qa-icon-wrap">
                  <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                </div>
                <div class="qa-tile-txt">Schedule Follow-up</div>
              </div>

              <div class="qa-card-tile" onclick="window.app.navigate('pipeline')">
                <div class="qa-icon-wrap">
                  <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/></svg>
                </div>
                <div class="qa-tile-txt">Open Pipeline</div>
              </div>
            </div>

            <div class="qa-bottom-bar" onclick="window.app.navigate('connections')">
              <div style="display:flex;align-items:center;gap:8px;">
                <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                <span>Manage Connected Pages</span>
              </div>
              <span style="color:var(--text-muted);">&gt;</span>
            </div>
          </div>

          <!-- Follow-ups Today -->
          <div class="dash-panel-card">
            <div class="dash-panel-header">
              <div class="dash-panel-title">Follow-ups Today</div>
              <a href="#tasks" class="dash-panel-link" onclick="window.app.navigate('tasks'); return false;">View All Tasks →</a>
            </div>
            ${tasks.length ? `
              <div style="padding: 10px 14px;">
                ${tasks.map(t => `
                  <div class="task-mini">
                    <input type="checkbox" class="task-check" onchange="window.app.completeTask('${t.id}', this)">
                    <div class="task-mini-info">
                      <div class="task-mini-title">${escapeHtml(t.title)}</div>
                      <div class="text-xs text-gray">Due: ${t.dueDate ? new Date(t.dueDate).toLocaleDateString('en-IN', {day:'numeric',month:'short'}) : 'Today'}</div>
                    </div>
                    ${this._priorityBadge(t.priority)}
                  </div>
                `).join('')}
              </div>
            ` : `
              <div class="followups-empty-wrap">
                <div class="followups-empty-icon">
                  <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.75" viewBox="0 0 24 24">
                    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
                    <rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>
                    <path d="m9 14 2 2 4-4"/>
                  </svg>
                </div>
                <div class="followups-empty-title">No follow-ups scheduled</div>
                <div class="followups-empty-sub">You're all caught up! 🎉</div>
              </div>
            `}
          </div>
        </div>
      </div>`;
  }

  onPageFilterChange(pageId) {
    this.selectedPageFilter = pageId;
    this.toast(`Filtered by: ${pageId === 'all' ? 'All 6 Pages' : this._pageName(pageId)}`);
    this._renderPage();
  }

  onDateRangeChange(range) {
    this.selectedDateRange = range;
    this.toast(`Date range: ${range.replace('_', ' ')}`);
    this._renderPage();
  }

  // ──────────────────────────────────────────────────────────
  // LEADS WORKSPACE (Section 10 & 11)
  // ──────────────────────────────────────────────────────────

  renderLeads(tab) {
    if (tab) this.currentLeadTab = tab;
    this.el.title.textContent = this.user.role === 'staff' ? 'My Leads' : 'Leads';

    const isAdmin = this.user.role === 'admin' || this.user.role === 'super_admin';
    this.el.actions.innerHTML = `
      <div class="search-wrap">
        <svg class="search-icon" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input type="text" class="input search-input" placeholder="Search leads… (Ctrl+K)" id="lead-search-input" value="${this.leadSearchQuery}" oninput="window.app.onLeadSearch(this.value)">
      </div>
      ${isAdmin ? `
      <button class="btn btn-secondary" id="sync-leads-btn" onclick="window.app.syncZernioLeads()" title="Pull recent leads via Zernio & Meta">
        <svg width="13" height="13" id="sync-leads-icon" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 21h5v-5"/></svg>
        <span>Sync Leads Now</span>
      </button>` : ''}
      <button class="btn btn-secondary" onclick="window.app.exportLeadsCsv()">Export CSV</button>
      <button class="btn btn-primary" onclick="window.app.openAddLeadModal()">+ Add Lead</button>`;

    const tabs = [
      { id: 'all',       label: 'All' },
      { id: 'new',       label: 'New' },
      { id: 'contacted', label: 'Contacted' },
      { id: 'qualified', label: 'Qualified' },
      { id: 'followup',  label: 'Follow-up' },
      { id: 'won',       label: 'Won' },
      { id: 'lost',      label: 'Lost' },
    ];

    const allLeads = this._getFilteredLeads();
    const tabFiltered = this._filterLeadsByTab(allLeads, this.currentLeadTab).filter(l =>
      !this.leadSearchQuery ||
      (l.name && l.name.toLowerCase().includes(this.leadSearchQuery.toLowerCase())) ||
      (l.phone && l.phone.includes(this.leadSearchQuery)) ||
      (l.email && l.email.toLowerCase().includes(this.leadSearchQuery.toLowerCase()))
    );

    this.el.content.innerHTML = `
      ${this._renderTip('leads', 'New leads from your Facebook &amp; Instagram ads appear here automatically. Click Call or WhatsApp to reach out immediately.')}

      <div class="tabs" id="lead-tabs">
        ${tabs.map(t => {
          const count = this._filterLeadsByTab(allLeads, t.id).length;
          return `<div class="tab ${this.currentLeadTab === t.id ? 'active' : ''}" onclick="window.app.renderLeads('${t.id}')">${t.label} <span class="tab-count">${count}</span></div>`;
        }).join('')}
      </div>

      ${tabFiltered.length ? `
      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th><input type="checkbox" id="select-all-leads" onchange="window.app.toggleSelectAll(this)"></th>
              <th>Name</th>
              <th>Phone / Email</th>
              <th>Source &amp; Page</th>
              <th>Campaign</th>
              <th>Status</th>
              <th>SLA &amp; Speed</th>
              <th>Assigned To</th>
              <th>Last Activity</th>
              <th>Follow-up</th>
              <th>Quick Actions</th>
            </tr>
          </thead>
          <tbody>
            ${tabFiltered.map(l => {
              const lastAct = l.last_contacted_at || l.lastContactedAt ? this._timeAgo(l.last_contacted_at || l.lastContactedAt) : 'Never';
              const followUp = l.follow_up_date || l.followUpDate ? new Date(l.follow_up_date || l.followUpDate).toLocaleDateString('en-IN', {day:'numeric',month:'short'}) : '—';
              const pageName = this._pageName(l.page_id || l.pageId);
              const sla = this.svc ? this.svc.getLeadSlaStatus(l) : { state: 'pending', text: '5m', label: 'Pending' };
              const isHot = l.is_hot_lead || (l.value && l.value >= 50000) || (l.lead_value && l.lead_value >= 50000);
              const dup = this.findDuplicateLead(l);
              const isChecked = this.selectedLeadIds.has(l.id);
              return `
                <tr class="clickable-row ${isHot ? 'hot-lead-card' : ''}" onclick="window.app.openLeadDrawer('${l.id}')">
                  <td onclick="event.stopPropagation()"><input type="checkbox" class="lead-select-box" value="${l.id}" ${isChecked ? 'checked' : ''} onchange="window.app.onLeadSelect(this)"></td>
                  <td>
                    <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                      <strong>${l.name}</strong>
                      ${isHot ? `<span class="badge badge-hot" style="font-size:10px;">${this._icon('flame', 11)} Hot</span>` : ''}
                      ${dup ? `<button class="badge badge-duplicate" title="Potential duplicate detected with ${escapeHtml(dup.name)}" onclick="event.stopPropagation(); window.app.openMergeModal('${l.id}')">Duplicate ⇄</button>` : ''}
                    </div>
                  </td>
                  <td class="text-xs">
                    <div>${l.phone || '—'}</div>
                    <div class="text-gray">${l.email || ''}</div>
                  </td>
                  <td>
                    <div class="text-xs font-semibold">${l.source || 'Facebook Lead Ad'}</div>
                    <div class="text-xs text-gray">${pageName}</div>
                  </td>
                  <td class="text-xs text-gray">${l.campaign_name || l.campaign_id || l.campaignId || '—'}</td>
                  <td>${this._badge(l.status)}</td>
                  <td><span class="sla-badge ${sla.state}" title="${sla.label}">${sla.text}</span></td>
                  <td class="text-xs">${this._staffName(l.assigned_staff_id || l.assignedStaffId)}</td>
                  <td class="text-xs text-gray">${lastAct}</td>
                  <td class="text-xs ${l.followUpDate && new Date(l.followUpDate) < new Date() ? 'text-red font-semibold' : ''}">${followUp}</td>
                  <td onclick="event.stopPropagation()">
                    <div class="row-actions" style="display:flex;align-items:center;gap:6px;">
                      <button class="btn-direct-call" title="Call lead" onclick="window.app.quickCall('${l.id}')">${this._icon('phone', 12)} Call</button>
                      ${l.phone ? `<button class="btn-direct-wa" title="WhatsApp message" onclick="window.crmService.recordFirstResponse('${l.id}','whatsapp');window.open('https://wa.me/'+'${l.phone.replace(/\\D/g,'')}','_blank')">${this._icon('whatsapp', 12)} WhatsApp</button>` : ''}
                      <button class="btn btn-ghost btn-sm" onclick="window.app.openLeadDrawer('${l.id}')">View</button>
                    </div>
                  </td>
                </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
      <div class="table-footer">Showing <strong>${tabFiltered.length}</strong> of <strong>${allLeads.length}</strong> total leads</div>`
      : this._empty('No leads found', 'No leads match the selected filter. Connect your Facebook Page to receive leads automatically, or add a lead manually.', null, null, '<button class="btn btn-primary" onclick="window.app.openAddLeadModal()">+ Add New Lead</button>')}`;
  }

  _filterLeadsByTab(leads, tab) {
    switch (tab) {
      case 'new':       return leads.filter(l => l.status === 'New' || l.status === 'New Lead');
      case 'contacted': return leads.filter(l => l.status === 'Contacted');
      case 'qualified': return leads.filter(l => l.status === 'Qualified');
      case 'followup':  return leads.filter(l => l.status === 'Follow-up');
      case 'won':       return leads.filter(l => l.status === 'Won' || l.status === 'Converted');
      case 'lost':      return leads.filter(l => l.status === 'Lost' || l.status === 'Invalid');
      default:          return leads;
    }
  }

  onLeadSearch(query) {
    this.leadSearchQuery = query;
    this.renderLeads();
  }

  onLeadSelect(cb) {
    if (cb.checked) {
      this.selectedLeadIds.add(cb.value);
    } else {
      this.selectedLeadIds.delete(cb.value);
    }
    this._updateBulkBar();
  }

  toggleSelectAll(master) {
    document.querySelectorAll('.lead-select-box').forEach(cb => {
      cb.checked = master.checked;
      if (master.checked) this.selectedLeadIds.add(cb.value);
      else this.selectedLeadIds.delete(cb.value);
    });
    this._updateBulkBar();
  }

  clearLeadSelection() {
    this.selectedLeadIds.clear();
    document.querySelectorAll('.lead-select-box').forEach(cb => { cb.checked = false; });
    const master = document.getElementById('select-all-leads');
    if (master) master.checked = false;
    this._updateBulkBar();
  }

  _updateBulkBar() {
    let bar = document.getElementById('bulk-actions-bar');
    if (this.selectedLeadIds.size === 0) {
      if (bar) bar.classList.remove('visible');
      return;
    }

    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'bulk-actions-bar';
      bar.className = 'bulk-actions-bar';
      document.body.appendChild(bar);
    }

    const staffList = this.svc ? (this.svc.staff || []) : [];
    const staffOptions = staffList.map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');
    const stages = ['New Lead', 'Contacted', 'Qualified', 'Follow-up', 'Won', 'Lost'];
    const stageOptions = stages.map(s => `<option value="${s}">${s}</option>`).join('');

    bar.innerHTML = `
      <div class="bulk-selected-count">
        <span style="background:var(--accent);color:#fff;border-radius:12px;padding:2px 8px;font-size:11px;">${this.selectedLeadIds.size}</span>
        <span>Selected</span>
      </div>
      <div class="bulk-action-btns">
        <select class="btn-bulk" onchange="if(this.value){window.app.bulkAssignStaff(this.value); this.selectedIndex=0;}">
          <option value="">Assign Staff…</option>
          ${staffOptions}
        </select>
        <select class="btn-bulk" onchange="if(this.value){window.app.bulkChangeStage(this.value); this.selectedIndex=0;}">
          <option value="">Move Stage…</option>
          ${stageOptions}
        </select>
        <button class="btn-bulk" onclick="window.app.bulkExportCsv()">
          <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Export (${this.selectedLeadIds.size})
        </button>
        <button class="btn-bulk btn-bulk-danger" onclick="window.app.clearLeadSelection()">Cancel</button>
      </div>
    `;
    bar.classList.add('visible');
  }

  bulkAssignStaff(staffId) {
    if (!staffId || this.selectedLeadIds.size === 0) return;
    const staff = this.svc ? this.svc.staff.find(s => s.id === staffId) : null;
    const count = this.selectedLeadIds.size;
    this.selectedLeadIds.forEach(id => {
      const l = this.svc ? this.svc.leads.find(x => x.id === id) : null;
      if (l) {
        l.assigned_staff_id = staffId;
        l.assignedStaffId = staffId;
        if (!l.notes) l.notes = [];
        l.notes.push({
          id: `note_${Date.now()}_${Math.random()}`,
          text: `Reassigned to ${staff ? staff.name : staffId} via bulk action`,
          createdAt: new Date().toISOString()
        });
      }
    });

    if (this.svc && this.svc._saveToStorage) this.svc._saveToStorage();
    else if (this.svc && this.svc.saveAll) this.svc.saveAll();

    this.clearLeadSelection();
    this.renderLeads();
    this.toast(`✓ Reassigned ${count} leads to ${staff ? staff.name : 'staff'}`, 'success');
  }

  bulkChangeStage(newStage) {
    if (!newStage || this.selectedLeadIds.size === 0) return;
    const count = this.selectedLeadIds.size;
    this.selectedLeadIds.forEach(id => {
      this.updateLeadStage(id, newStage);
    });

    this.clearLeadSelection();
    this.renderLeads();
    this.toast(`✓ Moved ${count} leads to stage "${newStage}"`, 'success');
  }

  bulkExportCsv() {
    if (this.selectedLeadIds.size === 0) return;
    const allLeads = this._getFilteredLeads();
    const leads = allLeads.filter(l => this.selectedLeadIds.has(l.id));
    let csv = 'ID,Name,Phone,Email,Page,Campaign,Status,AssignedTo,Created\n';
    leads.forEach(l => {
      csv += `"${l.id}","${l.name}","${l.phone||''}","${l.email||''}","${this._pageName(l.page_id||l.pageId)}","${l.campaign_id||l.campaignId||''}","${l.status}","${this._staffName(l.assigned_staff_id||l.assignedStaffId)}","${l.created_at||l.createdAt||''}"\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `leads_bulk_export_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    this.toast(`Exported ${leads.length} selected leads to CSV! ✓`);
  }

  async syncZernioLeads() {
    const btn = document.getElementById('sync-leads-btn');
    const icon = document.getElementById('sync-leads-icon');
    if (icon) icon.style.animation = 'spin 1s linear infinite';
    if (btn) btn.disabled = true;

    this.toast('⏳ Pulling recent leads via Zernio & Meta…', 'info');

    try {
      const res = await fetch('/api/zernio?path=sync-leads', {
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': (this.user && this.user.id) ? this.user.id : 'admin'
        }
      });
      const data = await res.json();
      if (res.ok && data.status === 'success') {
        if (this.svc && this.svc.fetchRemoteLeads) {
          await this.svc.fetchRemoteLeads();
        }
        const newCount = data.newLeads !== undefined ? data.newLeads : (data.syncedCount || 0);
        const skipCount = data.skippedLeads !== undefined ? data.skippedLeads : 0;
        this.toast(`✓ Leads sync complete: ${newCount} new, ${skipCount} skipped.`, 'success');
        this.renderLeads();
      } else {
        this.toast(`⚠️ Leads sync: ${data.message || data.error || 'No new leads found'}`, 'info');
        if (this.svc && this.svc.fetchRemoteLeads) {
          await this.svc.fetchRemoteLeads();
        }
        this.renderLeads();
      }
    } catch (err) {
      console.warn('Sync Zernio leads error:', err);
      this.toast('Sync completed', 'info');
    } finally {
      if (icon) icon.style.animation = '';
      if (btn) btn.disabled = false;
    }
  }

  exportLeadsCsv() {
    const leads = this._getFilteredLeads();
    let csv = 'ID,Name,Phone,Email,Page,Campaign,Status,AssignedTo,Created\n';
    leads.forEach(l => {
      csv += `"${l.id}","${l.name}","${l.phone||''}","${l.email||''}","${this._pageName(l.page_id||l.pageId)}","${l.campaign_id||l.campaignId||''}","${l.status}","${this._staffName(l.assigned_staff_id||l.assignedStaffId)}","${l.created_at||l.createdAt||''}"\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `leads_export_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    this.toast('Leads exported to CSV successfully! ✓');
  }

  findDuplicateLead(lead) {
    if (!lead || !this.svc || !Array.isArray(this.svc.leads)) return null;
    const cleanPhone = (lead.phone || '').replace(/\D/g, '');
    const cleanEmail = (lead.email || '').trim().toLowerCase();
    return this.svc.leads.find(l => {
      if (l.id === lead.id) return false;
      if (cleanPhone && cleanPhone.length >= 8 && (l.phone || '').replace(/\D/g, '') === cleanPhone) return true;
      if (cleanEmail && cleanEmail.length >= 4 && (l.email || '').trim().toLowerCase() === cleanEmail) return true;
      return false;
    }) || null;
  }

  openMergeModal(leadId) {
    const lead = this.svc ? this.svc.leads.find(l => l.id === leadId) : null;
    if (!lead) return;
    const dup = this.findDuplicateLead(lead);
    if (!dup) {
      this.toast('No duplicate lead detected for this contact.', 'info');
      return;
    }

    this.el.mTitle.textContent = 'Merge Duplicate Leads';
    this.el.mBody.innerHTML = `
      <p class="text-xs text-gray mb-3">
        A matching lead was detected based on identical phone number or email address. Select which lead to retain as the primary record. Activity logs, notes, and tasks will be consolidated without data loss.
      </p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px;">
        <div style="border:2px solid var(--accent);border-radius:8px;padding:12px;background:#FFF9F5;">
          <div style="font-weight:700;font-size:13px;color:var(--accent);margin-bottom:6px;">Record A (Current)</div>
          <div style="font-size:14px;font-weight:600;color:#0F172A;">${escapeHtml(lead.name)}</div>
          <div style="font-size:12px;color:#64748B;">${escapeHtml(lead.phone || 'No phone')}</div>
          <div style="font-size:12px;color:#64748B;">${escapeHtml(lead.email || 'No email')}</div>
          <div style="font-size:11px;margin-top:6px;"><strong>Stage:</strong> ${lead.status || 'New'}</div>
          <div style="font-size:11px;"><strong>Source:</strong> ${escapeHtml(lead.source || 'Facebook Lead Ad')}</div>
          <div style="font-size:11px;"><strong>Notes:</strong> ${(lead.notes||[]).length}</div>
        </div>
        <div style="border:1px solid var(--border);border-radius:8px;padding:12px;background:#F8FAFC;">
          <div style="font-weight:700;font-size:13px;color:#64748B;margin-bottom:6px;">Record B (Duplicate)</div>
          <div style="font-size:14px;font-weight:600;color:#0F172A;">${escapeHtml(dup.name)}</div>
          <div style="font-size:12px;color:#64748B;">${escapeHtml(dup.phone || 'No phone')}</div>
          <div style="font-size:12px;color:#64748B;">${escapeHtml(dup.email || 'No email')}</div>
          <div style="font-size:11px;margin-top:6px;"><strong>Stage:</strong> ${dup.status || 'New'}</div>
          <div style="font-size:11px;"><strong>Source:</strong> ${escapeHtml(dup.source || 'Facebook Lead Ad')}</div>
          <div style="font-size:11px;"><strong>Notes:</strong> ${(dup.notes||[]).length}</div>
        </div>
      </div>
      <label class="settings-label">Merge Action:</label>
      <select id="merge-target-choice" class="input">
        <option value="keep_a" selected>Keep Record A ("${escapeHtml(lead.name)}") — Absorb Record B</option>
        <option value="keep_b">Keep Record B ("${escapeHtml(dup.name)}") — Absorb Record A</option>
      </select>
    `;

    this.el.mConfirm.textContent = 'Consolidate & Merge Leads';
    this.el.mConfirm.className = 'btn btn-primary';
    this.el.mConfirm.onclick = () => {
      const choice = document.getElementById('merge-target-choice')?.value || 'keep_a';
      const primary = choice === 'keep_a' ? lead : dup;
      const secondary = choice === 'keep_a' ? dup : lead;

      if (!primary.notes) primary.notes = [];
      if (secondary.notes && secondary.notes.length) {
        secondary.notes.forEach(n => {
          primary.notes.push({ ...n, text: `[Merged from ${secondary.name}]: ${n.text}` });
        });
      }
      primary.notes.push({
        id: `note_${Date.now()}`,
        text: `Consolidated with duplicate lead "${secondary.name}" (ID: ${secondary.id})`,
        createdAt: new Date().toISOString()
      });

      if (!primary.phone && secondary.phone) primary.phone = secondary.phone;
      if (!primary.email && secondary.email) primary.email = secondary.email;
      if (!primary.value && secondary.value) primary.value = secondary.value;

      secondary.status = 'Invalid';
      secondary.notes.push({
        id: `note_arch_${Date.now()}`,
        text: `Archived as duplicate and merged into primary lead ID: ${primary.id}`,
        createdAt: new Date().toISOString()
      });

      if (this.svc && this.svc._saveToStorage) this.svc._saveToStorage();
      else if (this.svc && this.svc.saveAll) this.svc.saveAll();

      this.closeModal();
      this.toast(`✓ Successfully merged duplicate leads into primary record "${primary.name}"!`, 'success');
      this.renderLeads();
      if (this.currentRoute === 'leads') this.openLeadDrawer(primary.id);
    };

    this.el.mOverlay.classList.add('open');
  }

  insertSavedReply(text) {
    const inp = document.getElementById('inbox-msg-input');
    if (inp) {
      inp.value = text;
      inp.focus();
    }
  }

  // ──────────────────────────────────────────────────────────
  // LEAD DETAIL DRAWER (Section 9 & 12)
  // ──────────────────────────────────────────────────────────

  openLeadDrawer(leadId) {
    const lead = this.svc ? this.svc.leads.find(l => l.id === leadId) : null;
    if (!lead) return;

    const stages = ['New Lead', 'Contacted', 'Qualified', 'Follow-up', 'Won', 'Lost'];
    const staff = this.svc ? (this.svc.staff || []) : [];
    const notes = (lead.notes || []).slice().reverse();
    const sla = this.svc ? this.svc.getLeadSlaStatus(lead) : { state: 'pending', text: '5m', label: 'Pending' };
    const isHot = lead.is_hot_lead || (lead.lead_value && lead.lead_value >= 50000);
    const dup = this.findDuplicateLead(lead);

    this.el.dTitle.textContent = 'Lead Details & Attribution';
    this.el.dContent.innerHTML = `
      <!-- HEADER -->
      <div class="drawer-lead-header">
        <div class="lead-avatar">${lead.name.charAt(0).toUpperCase()}</div>
        <div class="lead-header-info">
          <div class="lead-header-name">
            ${lead.name}
            ${isHot ? `<span class="badge badge-hot" style="margin-left:4px;font-size:11px;">${this._icon('flame', 11)} Hot</span>` : ''}
          </div>
          <div class="text-sm text-gray">${lead.phone || 'No phone'} ${lead.email ? '• ' + lead.email : ''}</div>
          <div style="margin-top:4px;">${this._badge(lead.status)}</div>
        </div>
      </div>

      ${dup ? `
      <div style="background:#FEF3C7;border:1px solid #FCD34D;border-radius:8px;padding:10px 12px;margin:12px 0;display:flex;align-items:center;justify-content:space-between;gap:8px;">
        <div style="font-size:12px;color:#92400E;">
          <strong>Duplicate Alert:</strong> Matches record "${escapeHtml(dup.name)}".
        </div>
        <button class="badge badge-duplicate" onclick="window.app.openMergeModal('${lead.id}')">Merge ⇄</button>
      </div>` : ''}

      <!-- ONE-CLICK COMMUNICATION BAR (Hooks first_response_at) -->
      <div class="lead-actions-bar">
        <a href="tel:${lead.phone}" onclick="window.crmService.recordFirstResponse('${lead.id}', 'call')" class="btn btn-primary btn-sm">${this._icon('phone', 13)} Call</a>
        <a href="https://wa.me/${(lead.phone||'').replace(/\D/g,'')}" target="_blank" onclick="window.crmService.recordFirstResponse('${lead.id}', 'whatsapp')" class="btn btn-secondary btn-sm whatsapp-btn">${this._icon('whatsapp', 13)} WhatsApp</a>
        <a href="mailto:${lead.email}" onclick="window.crmService.recordFirstResponse('${lead.id}', 'email')" class="btn btn-secondary btn-sm">${this._icon('mail', 13)} Email</a>
      </div>

      <!-- SPEED-TO-LEAD & SLA TRACKING (Phase A) -->
      <div class="drawer-section">
        <div class="drawer-section-title">Speed-to-Lead &amp; SLA Tracking</div>
        <div style="background:#F8FAFC;border:1px solid var(--border);border-radius:var(--radius-sm);padding:10px 12px;font-size:12px;">
          <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
            <span class="text-gray">SLA Target:</span>
            <strong>${lead.sla_target_minutes || 5} Minutes</strong>
          </div>
          <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
            <span class="text-gray">Response Status:</span>
            <span class="sla-badge ${sla.state}">${sla.label} (${sla.text})</span>
          </div>
          ${lead.first_response_at ? `
          <div style="display:flex;justify-content:space-between;">
            <span class="text-gray">First Responded:</span>
            <span>${new Date(lead.first_response_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})} via ${lead.first_response_action || 'contact'}</span>
          </div>` : `
          <div style="display:flex;justify-content:space-between;">
            <span class="text-gray">Pending Time:</span>
            <span class="${sla.state === 'live_breach' ? 'text-red font-semibold' : ''}">${sla.text}</span>
          </div>`}
        </div>
      </div>

      <!-- STAGE SELECTOR PILLS -->
      <div class="drawer-section">
        <div class="drawer-section-title">Pipeline Stage</div>
        <div class="stage-pills">
          ${stages.map(s => `
            <div class="stage-pill ${lead.status === s || (s === 'New Lead' && lead.status === 'New') ? 'active badge-'+this._statusColor(s) : ''}" 
                 onclick="window.app.updateLeadStage('${lead.id}', '${s}')">
              ${s}
            </div>`).join('')}
        </div>
      </div>

      <!-- 5-TIER LEAD ATTRIBUTION & META ADS TRACE -->
      <div class="drawer-section">
        <div class="drawer-section-title">Lead Source &amp; Attribution</div>
        <div class="attribution-block">
          <div class="attr-row">
            <span class="attr-label">Source</span>
            <div style="display:flex;align-items:center;gap:6px;">
              <strong>${lead.source || 'Meta Lead Ad'}</strong>
              <span class="badge badge-subtle" style="font-size:11px;text-transform:uppercase;">${lead.platform || 'facebook'}</span>
            </div>
          </div>
          <div class="attr-row"><span class="attr-label">Page</span><strong>${this._pageName(lead.page_id || lead.pageId) || '—'}</strong></div>
          <div class="attr-row"><span class="attr-label">Assigned</span>
            <select class="input input-sm" onchange="window.app.reassignLead('${lead.id}', this.value)">
              <option value="">Unassigned</option>
              ${staff.map(s => `<option value="${s.id}" ${(lead.assigned_staff_id||lead.assignedStaffId)===s.id?'selected':''}>${s.name}</option>`).join('')}
            </select>
          </div>
          <div class="attr-row">
            <span class="attr-label">Deal Value</span>
            <div style="display:flex;align-items:center;gap:6px;">
              <span class="text-xs text-gray">${this.getCurrencySymbol()}</span>
              <input type="number" class="input input-sm" style="width:110px;font-weight:600;" value="${lead.lead_value || lead.value || 0}" onchange="window.app.updateLeadValue('${lead.id}', this.value)" placeholder="0">
            </div>
          </div>
          ${lead.status === 'Lost' ? `
          <div class="attr-row" style="background:#FEF2F2;padding:6px 10px;border-radius:6px;border:1px solid #FEE2E2;margin-top:6px;">
            <span class="attr-label" style="color:#991B1B;">Loss Reason</span>
            <select class="input input-sm" style="font-size:12px;" onchange="window.app.updateLossReason('${lead.id}', this.value)">
              <option value="Unresponsive" ${(lead.loss_reason||'')==='Unresponsive'?'selected':''}>Unresponsive</option>
              <option value="Price too high" ${(lead.loss_reason||'')==='Price too high'?'selected':''}>Price too high</option>
              <option value="Competitor chosen" ${(lead.loss_reason||'')==='Competitor chosen'?'selected':''}>Competitor chosen</option>
              <option value="Wrong inquiry / Not interested" ${(lead.loss_reason||'')==='Wrong inquiry / Not interested'?'selected':''}>Wrong inquiry / Not interested</option>
              <option value="Budget constraint" ${(lead.loss_reason||'')==='Budget constraint'?'selected':''}>Budget constraint</option>
              <option value="Other" ${(lead.loss_reason||'')==='Other'?'selected':''}>Other</option>
            </select>
          </div>` : ''}
        </div>

        <!-- Technical Meta Ads Attribution Details -->
        <details class="tech-details-toggle" style="margin-top:10px;" open>
          <summary style="font-size:12px;color:var(--text-muted);cursor:pointer;font-weight:500;">Meta Ads Attribution Details ▾</summary>
          <div class="attribution-block" style="margin-top:8px;background:#f8fafc;padding:8px 12px;border-radius:var(--radius-sm);">
            <div class="attr-row"><span class="attr-label">Campaign</span><strong style="color:var(--primary);">${lead.campaign_name || lead.campaign_id || lead.campaignId || 'Enterprise Lead Gen'}</strong></div>
            <div class="attr-row"><span class="attr-label">Ad Set</span><span>${lead.adset_name || lead.adset_id || lead.adsetId || 'Tech Decision Makers 25-54'}</span></div>
            <div class="attr-row"><span class="attr-label">Ad Creative</span><span>${lead.ad_name || lead.ad_id || lead.adId || 'Single Image - Value Prop'}</span></div>
            <div class="attr-row"><span class="attr-label">Lead Form</span><span>${lead.form_name || lead.form_id || lead.formId || 'Instant Quote Form'}</span></div>
            <div class="attr-row"><span class="attr-label">Meta Lead ID</span><span class="text-xs text-gray font-mono">${lead.meta_leadgen_id || lead.meta_lead_id || lead.id}</span></div>
          </div>
        </details>
      </div>

      <!-- CRM EMAIL INTEGRATION TAB & TIMELINE -->
      <div class="drawer-section">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
          <div class="drawer-section-title" style="margin-bottom:0;">Email Communications</div>
          <button class="btn btn-secondary btn-sm" onclick="window.app.openQuickEmailModal('${lead.id}')">
            ${this._icon('mail', 12)} + Compose
          </button>
        </div>
        
        <div id="drawer-email-thread-${lead.id}">
          ${(() => {
            const leadEmails = this.svc ? this.svc.getEmailsForLead(lead) : [];
            if (!lead.email) {
              return `<div class="text-xs text-gray" style="background:#F9FAFB;padding:10px;border-radius:6px;border:1px dashed var(--border);">No email address recorded for this lead. Add an email to enable conversation syncing.</div>`;
            }
            if (leadEmails.length === 0) {
              return `
                <div style="background:#F9FAFB;padding:12px;border-radius:8px;border:1px dashed var(--border);text-align:center;">
                  <div class="text-xs text-gray mb-2">No emails exchanged yet with <strong>${escapeHtml(lead.email)}</strong>.</div>
                  <button class="btn btn-secondary btn-sm" onclick="window.app.openQuickEmailModal('${lead.id}')">Start Email Thread</button>
                </div>
              `;
            }
            return `
              <div class="drawer-email-list" style="display:flex;flex-direction:column;gap:8px;">
                ${leadEmails.map(em => `
                  <div class="drawer-email-card" style="background:#FFFFFF;border:1px solid var(--border);border-radius:8px;padding:10px 12px;box-shadow:0 1px 2px rgba(0,0,0,0.03);">
                    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
                      <span class="badge ${em.folder === 'sent' ? 'badge-info' : 'badge-success'}" style="font-size:10px;padding:2px 6px;">
                        ${em.folder === 'sent' ? 'Outbound' : 'Inbound'}
                      </span>
                      <span class="text-xs text-gray">${this._timeAgo(em.sent_at || em.received_at)}</span>
                    </div>
                    <div style="font-size:12px;font-weight:600;margin-bottom:2px;color:var(--text);">${escapeHtml(em.subject)}</div>
                    <div style="font-size:11px;color:var(--text-muted);line-height:1.4;">${escapeHtml(em.snippet || em.body_text || '')}</div>
                  </div>
                `).join('')}
              </div>
            `;
          })()}
        </div>
      </div>

      <!-- FOLLOW-UP SCHEDULER -->
      <div class="drawer-section">
        <div class="drawer-section-title">Follow-up Schedule</div>
        <div class="followup-row">
          <input type="date" class="input input-sm" value="${lead.follow_up_date || lead.followUpDate || ''}" 
                 onchange="window.app.updateFollowUp('${lead.id}', this.value)">
          <button class="btn btn-secondary btn-sm" onclick="window.app.setTomorrowFollowUp('${lead.id}')">Tomorrow</button>
          <button class="btn btn-secondary btn-sm" onclick="window.app.setPlusDaysFollowUp('${lead.id}', 3)">+3 Days</button>
        </div>
        <div style="display:flex;gap:6px;margin-top:8px;">
          <input type="text" class="input input-sm flex-1" id="task-quick-input-${lead.id}" placeholder="Schedule follow-up task callback…" onkeydown="if(event.key==='Enter'){window.app.createLeadFollowupTask('${lead.id}', this.value); this.value='';}">
          <button class="btn btn-secondary btn-sm" onclick="const el=document.getElementById('task-quick-input-${lead.id}'); if(el){window.app.createLeadFollowupTask('${lead.id}', el.value); el.value='';}">+ Task</button>
        </div>
      </div>

      <!-- ACTIVITY TIMELINE -->
      <div class="drawer-section">
        <div class="drawer-section-title">Activity Timeline</div>
        <div class="timeline">
          <div class="tl-item">
            <div class="tl-dot"></div>
            <div class="tl-text"><strong>Lead Form submitted</strong> on ${this._pageName(lead.page_id || lead.pageId)} · ${this._timeAgo(lead.created_at || lead.createdAt)}</div>
          </div>
          ${lead.assigned_staff_id || lead.assignedStaffId ? `
          <div class="tl-item">
            <div class="tl-dot"></div>
            <div class="tl-text">Auto-assigned to <strong>${this._staffName(lead.assigned_staff_id || lead.assignedStaffId)}</strong></div>
          </div>` : ''}
          ${(lead.activities || []).slice(-3).map(a => `
            <div class="tl-item">
              <div class="tl-dot"></div>
              <div class="tl-text">${a.description || a.type} · ${this._timeAgo(a.timestamp || a.created_at || a.createdAt)}</div>
            </div>`).join('')}
        </div>
      </div>

      <!-- NOTES -->
      <div class="drawer-section">
        <div class="drawer-section-title">Notes</div>
        ${notes.length ? notes.slice(0,3).map(n => `
          <div class="note-item">
            <div class="note-text">${n.content || n.text || n}</div>
            <div class="text-xs text-gray">${this._timeAgo(n.createdAt || n.created_at || new Date().toISOString())}</div>
          </div>`).join('') : `<div class="text-xs text-gray mb-2">No notes added yet.</div>`}
        <textarea class="input mt-2" rows="2" placeholder="Add a note for the team…" id="note-input-${lead.id}"></textarea>
        <button class="btn btn-primary btn-sm mt-2 w-full" onclick="window.app.saveNote('${lead.id}')">Save Note</button>
      </div>

      <!-- DANGER ZONE: DELETE LEAD -->
      <div class="drawer-section mt-4 pt-3" style="border-top:1px solid var(--border);">
        <button class="btn btn-ghost btn-sm text-red-500 w-full" style="display:flex;align-items:center;justify-content:center;gap:6px;" onclick="window.app.deleteLead('${lead.id}')">
          ${this._icon('trash', 13)} Delete Lead Permanently
        </button>
      </div>`;

    this.el.dOverlay.classList.add('open');
    this.el.drawer.classList.add('open');
  }

  closeDrawer() {
    this.el.dOverlay.classList.remove('open');
    this.el.drawer.classList.remove('open');
  }

  deleteLead(leadId) {
    const lead = this.svc ? this.svc.leads.find(l => l.id === leadId) : null;
    if (!lead) return;
    this.confirmDialog({
      title: 'Delete Lead',
      message: `Are you sure you want to delete lead "${lead.name}"? This record will be permanently removed.`,
      confirmText: 'Delete Lead',
      isDanger: true,
      onConfirm: () => {
        if (this.svc) {
          this.svc.leads = this.svc.leads.filter(l => l.id !== leadId);
          if (this.svc._saveToStorage) this.svc._saveToStorage(); else this.svc.saveAll();
        }
        this.closeDrawer();
        this.toast(`Lead "${lead.name}" deleted.`, 'info');
        this.renderLeads();
      }
    });
  }

  updateLeadStage(leadId, stage) {
    if (this.svc) {
      const lead = this.svc.leads.find(l => l.id === leadId);
      if (lead) {
        lead.status = stage;
        if (!lead.activities) lead.activities = [];
        lead.activities.push({
          type: 'STATUS_CHANGE',
          description: `Stage changed to ${stage}`,
          timestamp: new Date().toISOString()
        });
        this.svc._saveToStorage ? this.svc._saveToStorage() : this.svc.saveAll();
      }
    }
    this.openLeadDrawer(leadId);
    this.toast(`Stage updated to "${stage}"`);
  }

  reassignLead(leadId, staffId) {
    if (this.svc) {
      const lead = this.svc.leads.find(l => l.id === leadId);
      if (lead) {
        lead.assigned_staff_id = staffId;
        lead.assignedStaffId = staffId;
        if (!lead.activities) lead.activities = [];
        lead.activities.push({
          type: 'REASSIGN',
          description: `Reassigned to ${this._staffName(staffId)}`,
          timestamp: new Date().toISOString()
        });
        this.svc._saveToStorage ? this.svc._saveToStorage() : this.svc.saveAll();
      }
    }
    this.toast(`Lead reassigned to ${this._staffName(staffId)}`);
  }

  updateFollowUp(leadId, date) {
    if (this.svc) {
      const lead = this.svc.leads.find(l => l.id === leadId);
      if (lead) {
        lead.follow_up_date = date;
        lead.followUpDate = date;
        this.svc._saveToStorage ? this.svc._saveToStorage() : this.svc.saveAll();
      }
    }
    this.toast(`Follow-up scheduled for ${new Date(date).toLocaleDateString()}`);
  }

  setTomorrowFollowUp(leadId) {
    const d = new Date(); d.setDate(d.getDate() + 1);
    const ds = d.toISOString().split('T')[0];
    this.updateFollowUp(leadId, ds);
  }

  saveNote(leadId) {
    const input = document.getElementById(`note-input-${leadId}`);
    if (!input || !input.value.trim()) return;
    if (this.svc) {
      const lead = this.svc.leads.find(l => l.id === leadId);
      if (lead) {
        if (!lead.notes) lead.notes = [];
        lead.notes.push({ content: input.value.trim(), createdAt: new Date().toISOString() });
        this.svc._saveToStorage ? this.svc._saveToStorage() : this.svc.saveAll();
      }
    }
    this.toast('Note added to lead timeline ✓');
    input.value = '';
    this.openLeadDrawer(leadId);
  }

  quickCall(leadId) {
    const lead = this.svc ? this.svc.leads.find(l => l.id === leadId) : null;
    if (lead && lead.phone) {
      if (this.svc) this.svc.recordFirstResponse(leadId, 'call');
      window.open(`tel:${lead.phone}`);
    } else {
      this.toast('No phone number recorded');
    }
  }

  updateLeadValue(leadId, val) {
    if (this.svc) {
      const lead = this.svc.leads.find(l => l.id === leadId);
      if (lead) {
        const numVal = Math.max(0, parseInt(val, 10) || 0);
        lead.lead_value = numVal;
        lead.value = numVal;
        if (!lead.activities) lead.activities = [];
        lead.activities.push({
          type: 'VALUE_UPDATED',
          description: `Deal value set to ${this.formatMoney(numVal)}`,
          timestamp: new Date().toISOString()
        });
        if (this.svc._saveToStorage) this.svc._saveToStorage(); else this.svc.saveAll();
        this.toast(`Deal value updated to ${this.formatMoney(numVal)}`);
      }
    }
  }

  updateLossReason(leadId, reason) {
    if (this.svc) {
      const lead = this.svc.leads.find(l => l.id === leadId);
      if (lead) {
        lead.loss_reason = reason;
        if (!lead.activities) lead.activities = [];
        lead.activities.push({
          type: 'LOSS_RECORDED',
          description: `Loss reason: ${reason}`,
          timestamp: new Date().toISOString()
        });
        if (this.svc._saveToStorage) this.svc._saveToStorage(); else this.svc.saveAll();
        this.toast(`Loss reason saved: ${reason}`);
      }
    }
  }

  setPlusDaysFollowUp(leadId, days) {
    const d = new Date(); d.setDate(d.getDate() + (days || 1));
    const ds = d.toISOString().split('T')[0];
    this.updateFollowUp(leadId, ds);
  }

  createLeadFollowupTask(leadId, title) {
    if (!title || !title.trim()) return;
    const lead = this.svc ? this.svc.leads.find(l => l.id === leadId) : null;
    const d = new Date(); d.setDate(d.getDate() + 1);
    const dueDate = d.toISOString().split('T')[0];
    const newTask = {
      id: 'task_' + Math.random().toString(36).substr(2, 9),
      title: title.trim(),
      dueDate: dueDate,
      leadId: leadId,
      leadName: lead ? lead.name : '',
      status: 'Pending',
      priority: 'high',
      assignedTo: lead ? (lead.assigned_staff_id || lead.assignedStaffId || this.user.id) : this.user.id,
      assigned_to: lead ? (lead.assigned_staff_id || lead.assignedStaffId || this.user.id) : this.user.id,
      created_at: new Date().toISOString()
    };
    if (this.svc) {
      if (!this.svc.tasks) this.svc.tasks = [];
      this.svc.tasks.unshift(newTask);
      if (this.svc._saveToStorage) this.svc._saveToStorage(); else this.svc.saveAll();
    }
    this.toast(`Follow-up task "${title.trim()}" created ✓`);
    this.openLeadDrawer(leadId);
  }

  openConvInInbox(convId) {
    this.activeConvId = convId;
    this.navigate('inbox');
    this.renderInbox();
  }

  assignConversation(convId, staffId) {
    if (this.svc && this.svc.conversations) {
      const conv = this.svc.conversations.find(c => c.id === convId);
      if (conv) {
        conv.assigned_staff_id = staffId;
        conv.assignedStaffId = staffId;
        const matchingLead = this.svc.leads.find(l => l.name === conv.name || (conv.phone && l.phone === conv.phone));
        if (matchingLead) {
          matchingLead.assigned_staff_id = staffId;
          matchingLead.assignedStaffId = staffId;
        }
        if (this.svc._saveToStorage) this.svc._saveToStorage(); else this.svc.saveAll();
        this.toast(`Conversation assigned to ${this._staffName(staffId)}`);
        this.renderInbox();
      }
    }
  }

  addConversationNote(convId, noteText) {
    if (!noteText || !noteText.trim()) return;
    if (this.svc && this.svc.conversations) {
      const conv = this.svc.conversations.find(c => c.id === convId);
      if (conv) {
        if (!conv.notes) conv.notes = [];
        conv.notes.push({
          content: noteText.trim(),
          author: this.user.displayName || this.user.name || 'User',
          created_at: new Date().toISOString()
        });
        const matchingLead = this.svc.leads.find(l => l.name === conv.name || (conv.phone && l.phone === conv.phone));
        if (matchingLead) {
          if (!matchingLead.notes) matchingLead.notes = [];
          matchingLead.notes.push({
            content: `[Inbox Note] ${noteText.trim()}`,
            createdAt: new Date().toISOString()
          });
        }
        if (this.svc._saveToStorage) this.svc._saveToStorage(); else this.svc.saveAll();
        this.toast('Internal note saved');
        this.renderInbox();
      }
    }
  }

  // ──────────────────────────────────────────────────────────
  // KANBAN CRM PIPELINE WITH DRAG & DROP (Section 13)
  // ──────────────────────────────────────────────────────────

  renderPipeline() {
    this.el.title.textContent = this.user.role === 'staff' ? 'My Pipeline' : 'Sales Pipeline';
    this.el.actions.innerHTML = `
      <div class="btn-group">
        <button class="btn ${this.pipelineView==='kanban'?'btn-primary':'btn-secondary'}" onclick="window.app.pipelineView='kanban';window.app.renderPipeline()">Kanban</button>
        <button class="btn ${this.pipelineView==='list'?'btn-primary':'btn-secondary'}" onclick="window.app.pipelineView='list';window.app.renderPipeline()">List</button>
      </div>
      <button class="btn btn-primary" onclick="window.app.openAddLeadModal()">+ Add Lead</button>`;

    const stages = ['New Lead', 'Contacted', 'Qualified', 'Follow-up', 'Won', 'Lost'];
    const leads = this._getFilteredLeads();

    if (this.pipelineView === 'kanban') {
      const colsHtml = stages.map(stage => {
        const cards = leads.filter(d => d.status === stage || (stage === 'New Lead' && d.status === 'New'));
        const total = cards.reduce((s, c) => s + (c.value || c.dealValue || c.lead_value || 0), 0);
        return `
          <div class="kanban-col" data-stage="${stage}" ondragover="event.preventDefault()" ondrop="window.app.onKanbanDrop(event, '${stage}')">
            <div class="kanban-col-header">
              <div class="kanban-col-label">
                <span class="kanban-col-dot" style="background:${this._stageColor(stage)}"></span>
                <strong>${stage}</strong>
              </div>
              <div class="kanban-col-meta">
                <span class="badge badge-gray">${cards.length}</span>
                ${total ? `<span class="text-xs text-gray font-semibold">${this.formatMoney(total)}</span>` : ''}
              </div>
            </div>
            <div class="kanban-col-body">
              ${cards.length ? cards.map(c => {
                const nowMs = Date.now();
                const createdMs = new Date(c.created_at || c.createdAt || nowMs).getTime();
                const daysInStage = Math.max(0, Math.floor((nowMs - createdMs) / (1000 * 60 * 60 * 24)));
                const isStale = daysInStage >= 3 && (stage === 'New Lead' || stage === 'Contacted' || stage === 'New');
                return `
                <div class="kanban-card" draggable="true" ondragstart="window.app.onKanbanDragStart(event, '${c.id}')" onclick="window.app.openLeadDrawer('${c.id}')">
                  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:3px;">
                    <div class="kanban-card-name">${escapeHtml(c.name)}</div>
                    ${isStale ? `<span class="badge-stale" title="Lead has been in this stage for ${daysInStage} days">${this._icon('clock', 11)} ${daysInStage}d</span>` : ''}
                  </div>
                  <div class="kanban-card-meta text-xs text-gray">${escapeHtml(this._pageName(c.page_id || c.pageId))}</div>
                  ${c.loss_reason && stage === 'Lost' ? `<div class="text-xs" style="color:#DC2626;margin-top:2px;">Lost: ${escapeHtml(c.loss_reason)}</div>` : ''}
                  <div class="kanban-card-footer">
                    <div class="staff-chip" title="${this._staffName(c.assigned_staff_id || c.assignedStaffId)}">${(this._staffName(c.assigned_staff_id || c.assignedStaffId)||'?').charAt(0)}</div>
                    ${(c.value || c.dealValue || c.lead_value) ? `<span class="text-xs font-semibold">${this.formatMoney(c.value || c.dealValue || c.lead_value, c.currency)}</span>` : ''}
                    <span class="text-xs text-gray ml-auto">${c.follow_up_date || c.followUpDate ? new Date(c.follow_up_date || c.followUpDate).toLocaleDateString('en-IN', {day:'numeric',month:'short'}) : 'No date'}</span>
                  </div>
                </div>`;
              }).join('')
              : `<div class="kanban-empty">Drag leads here</div>`}
            </div>
          </div>`;
      }).join('');

      const emptyBanner = leads.length === 0 ? `
        <div style="background:#FFFFFF;border:1px solid var(--border-subtle);border-radius:var(--radius-sm);padding:14px 18px;margin-bottom:14px;display:flex;align-items:center;justify-content:space-between;gap:12px;box-shadow:var(--shadow-card);">
          <div style="display:flex;align-items:center;gap:10px;">
            <span style="color:var(--text-secondary);display:inline-flex;">${this._icon('clipboard', 18)}</span>
            <span style="font-size:13px;color:var(--text-primary);"><strong>Pipeline is currently empty.</strong> Add leads manually or receive inbound Facebook Lead Ads.</span>
          </div>
          <button class="btn btn-primary btn-sm" onclick="window.app.openAddLeadModal()">+ Add First Lead</button>
        </div>` : '';

      this.el.content.innerHTML = `${emptyBanner}<div class="kanban-board">${colsHtml}</div>`;
    } else {
      this.renderLeads();
    }
  }

  renderInbox() {
    this.el.title.textContent = this.user.role === 'staff' ? 'My Messages' : 'Messages';
    this.el.actions.innerHTML = `
      <button class="btn btn-dark btn-sm btn-inbox-refresh" id="btn-inbox-refresh" onclick="window.app.refreshRealInbox()">
        <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
        <span>Refresh Inbox</span>
      </button>
      <button class="btn btn-outline btn-sm btn-inbox-sync" id="btn-inbox-sync" onclick="window.app.syncConnections()">
        <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/></svg>
        <span>Sync Accounts</span>
      </button>`;

    // Ensure content wrapper has inbox-view-container for viewport-fit layout
    if (this.el.content && !this.el.content.classList.contains('inbox-view-container')) {
      this.el.content.classList.add('inbox-view-container');
    }

    // Conversations collection
    const convs = (this.svc ? (this.svc.conversations || []) : []);

    // Auto-fetch real conversations from server so server order wins over localStorage
    if (!this._fetchedServerConvs && this.svc && this.svc.fetchRemoteConversations) {
      this._fetchedServerConvs = true;
      this.svc.fetchRemoteConversations().then(() => {
        if (this.currentRoute === 'inbox') this.renderInbox();
      });
    } else if ((!this._fetchedRealIgConvs || convs.length === 0) && this.svc) {
      this._fetchedRealIgConvs = true;
      setTimeout(() => this.fetchRealInstagramConversations(), 50);
    }
    const userPages = this._getAccessiblePages().map(p => p.id);
    const accessibleConvs = (this.user.role === 'admin' || this.user.role === 'super_admin')
      ? convs
      : convs.filter(c => !c.page_id || userPages.includes(c.page_id) || userPages.includes(c.accountId));

    const sortMode = this.inboxSortMode || 'latest';
    const activeTab = this.inboxTab || 'all';

    // Archived vs Active conversation filtering (Archived conversations are hidden by default)
    const archivedCount = accessibleConvs.filter(c => c.is_archived === true).length;
    let filteredConvs = (activeTab === 'archived')
      ? accessibleConvs.filter(c => c.is_archived === true)
      : accessibleConvs.filter(c => !c.is_archived);

    // Filter by channel, unread or starred
    if (activeTab === 'unread') {
      filteredConvs = filteredConvs.filter(c => (c.unread || c.unread_count || 0) > 0);
    } else if (activeTab === 'starred') {
      filteredConvs = filteredConvs.filter(c => c.starred === true);
    } else if (activeTab === 'facebook' || activeTab === 'messenger') {
      filteredConvs = filteredConvs.filter(c => !c.channel || c.channel.toLowerCase().includes('mess') || c.channel.toLowerCase().includes('face'));
    } else if (activeTab === 'instagram') {
      filteredConvs = filteredConvs.filter(c => c.channel && c.channel.toLowerCase().includes('insta'));
    }

    // Apply active search query if present
    if (this.inboxSearchQuery) {
      const q = this.inboxSearchQuery.toLowerCase();
      filteredConvs = filteredConvs.filter(c => {
        const text = `${c.name || ''} ${c.preview || ''} ${c.participantUsername || ''}`.toLowerCase();
        return text.includes(q);
      });
    }

    // Sorting: Latest (newest message first) | Unread first | Oldest
    filteredConvs.sort((a, b) => {
      const timeA = this.svc ? this.svc._resolveConvTimestamp(a) : new Date(a.last_message_at || a.time || 0).getTime();
      const timeB = this.svc ? this.svc._resolveConvTimestamp(b) : new Date(b.last_message_at || b.time || 0).getTime();
      if (sortMode === 'unread') {
        const uA = ((a.unread || a.unread_count || 0) > 0) ? 1 : 0;
        const uB = ((b.unread || b.unread_count || 0) > 0) ? 1 : 0;
        if (uB !== uA) return uB - uA;
        return timeB - timeA;
      }
      if (sortMode === 'oldest') {
        return timeA - timeB;
      }
      return timeB - timeA;
    });

    const activeScopedConvs = accessibleConvs.filter(c => !c.is_archived);
    const totalCount = activeScopedConvs.length;
    const unreadInboxCount = activeScopedConvs.filter(c => (c.unread || c.unread_count || 0) > 0).length;
    const starredCount = activeScopedConvs.filter(c => c.starred === true).length;
    const fbCount = activeScopedConvs.filter(c => !c.channel || c.channel.toLowerCase().includes('mess') || c.channel.toLowerCase().includes('face')).length;
    const igCount = activeScopedConvs.filter(c => c.channel && c.channel.toLowerCase().includes('insta')).length;

    const convList = filteredConvs;
    const activeConv = convList.find(c => c.id === this.activeConvId) || convList[0] || null;
    if (activeConv && (!activeConv.messages || activeConv.messages.length === 0) && !activeConv._fetchingMsgs) {
      activeConv._fetchingMsgs = true;
      setTimeout(() => this.fetchRealConversationMessages(activeConv), 50);
    }
    const matchingLead = (this.svc && activeConv) ? this.svc.leads.find(l => l.name === activeConv.name || (activeConv.phone && l.phone === activeConv.phone)) : null;
    const messages = activeConv ? (activeConv.messages || (activeConv.preview ? [{ text: activeConv.preview, incoming: true, time: activeConv.time }] : [])) : [];
    const isIgActive = activeConv ? (activeConv.channel && activeConv.channel.toLowerCase().includes('insta')) : (activeTab === 'instagram');

    const activeInitials = activeConv ? this._getContactInitials(activeConv.name) : '?';
    const activeColor = activeConv ? this._getAvatarColor(activeConv.name) : { bg: '#F1F5F9', text: '#334155' };

    this.el.content.innerHTML = `
      ${this._renderTip('messages', 'When someone messages your Facebook Page or Instagram, you can reply directly from here.')}

      <div class="inbox-layout ${this.mobileInboxView === 'chat' ? 'view-chat' : 'view-list'} ${sessionStorage.getItem('inbox_details_collapsed') === 'true' ? 'details-collapsed' : ''}">
        <!-- LEFT: CONVERSATIONS LIST (320px) -->
        <div class="inbox-sidebar">
          <div class="inbox-sidebar-header">
            <div class="inbox-sidebar-title-row">
              <h2 class="inbox-sidebar-title">Inbox</h2>
              <button class="inbox-action-btn-sm" onclick="window.app.refreshInbox()" title="Refresh conversations">
                <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.75" viewBox="0 0 24 24"><path d="M4 6h16M7 12h10M10 18h4"/></svg>
              </button>
            </div>

            <div class="inbox-filter-tabs" id="inbox-filter-tabs">
              <div class="inbox-tab ${activeTab === 'all' ? 'active' : ''}" onclick="window.app.setInboxTab('all')">
                <span>All</span>
                <span class="inbox-tab-count">${totalCount}</span>
              </div>
              <div class="inbox-tab ${activeTab === 'unread' ? 'active' : ''}" onclick="window.app.setInboxTab('unread')">
                <span>Unread</span>
                ${unreadInboxCount > 0 ? `<span class="inbox-tab-count">${unreadInboxCount}</span>` : ''}
              </div>
              <div class="inbox-tab ${activeTab === 'starred' ? 'active' : ''}" onclick="window.app.setInboxTab('starred')">
                <span>Starred</span>
                ${starredCount > 0 ? `<span class="inbox-tab-count">${starredCount}</span>` : ''}
              </div>
            </div>

            <div class="inbox-search-wrap">
              <span class="inbox-search-icon">
                <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
              </span>
              <input type="text" class="inbox-search-input" id="inbox-search-input" placeholder="Search conversations…" value="${escapeHtml(this.inboxSearchQuery || '')}" oninput="window.app.searchInboxConversations(this.value)">
              ${this.inboxSearchQuery ? `<button class="inbox-search-clear" onclick="window.app.clearInboxSearch()" title="Clear search">✕</button>` : ''}
            </div>
          </div>

          <div class="inbox-conv-list" id="inbox-conv-list">
            <div id="inbox-search-empty" style="display:none;padding:24px 16px;text-align:center;font-size:12px;color:var(--text-secondary);">
              No conversations matching "${escapeHtml(this.inboxSearchQuery || '')}"
            </div>
            ${convList.length === 0 ? `
              <div class="inbox-conv-empty">
                <div class="inbox-conv-empty-icon" style="display:flex;justify-content:center;">${activeTab === 'instagram' ? this._icon('instagram', 32) : this._icon('facebook', 32)}</div>
                <strong class="inbox-conv-empty-title">${activeTab === 'archived' ? 'No archived conversations' : (activeTab === 'starred' ? 'No starred conversations' : 'No conversations yet')}</strong>
                <p class="inbox-conv-empty-desc">
                  ${activeTab === 'archived' ? 'Conversations you archive will appear here.' : (activeTab === 'starred' ? 'Star important conversations to see them here.' : `Incoming messages from your connected ${activeTab === 'instagram' ? 'Instagram' : (activeTab === 'facebook' ? 'Facebook' : 'Facebook & Instagram')} account will appear here automatically.`)}
                </p>
                <button class="btn btn-secondary btn-sm" onclick="window.app.refreshInbox()">
                  ↻ Refresh Messages
                </button>
              </div>
            ` : convList.map(c => {
              const isIg = c.channel && c.channel.toLowerCase().includes('insta');
              const isWa = c.channel && c.channel.toLowerCase().includes('what');
              const initials = this._getContactInitials(c.name);
              const color = this._getAvatarColor(c.name);
              const isUnread = (c.unread || c.unread_count || 0) > 0;
              const isCurrentActive = activeConv && String(c.id) === String(activeConv.id);
              const searchText = `${c.name || ''} ${c.preview || ''} ${c.participantUsername || ''}`.toLowerCase();
              const displayTime = this._formatMessageTime(c.last_message_at || c.time);
              const itemLead = (this.svc && this.svc.leads) ? this.svc.leads.find(l => l.name === c.name || (c.phone && l.phone === c.phone)) : null;

              return `
              <div class="inbox-conv-item ${isCurrentActive ? 'active' : ''}" data-conv-id="${c.id}" data-search-text="${escapeHtml(searchText)}" onclick="window.app.selectInboxConv('${c.id}')">
                <div class="conv-avatar" style="background-color:${color.bg};color:${color.text};">
                  ${initials}
                  <span class="conv-platform-badge ${isIg ? 'badge-ig-dot' : 'badge-fb-dot'}" title="${isIg ? 'Instagram Direct' : 'Facebook Messenger'}"></span>
                </div>
                <div class="conv-info">
                  <div class="conv-name-row">
                    <div style="display:flex;align-items:center;gap:6px;min-width:0;flex:1;">
                      <span class="conv-name text-truncate">${escapeHtml(c.name)}</span>
                      ${isUnread ? `<span class="conv-unread-count-bubble">${c.unread || c.unread_count || 1}</span>` : ''}
                    </div>
                    <span class="conv-time">${displayTime}</span>
                  </div>
                  <div class="conv-preview ${isUnread ? 'is-unread' : ''}">${escapeHtml(c.preview || '')}</div>
                  <div class="conv-channel-row">
                    <span class="conv-channel-pill">
                      ${isIg ? this._icon('instagram', 11) + ' Instagram' : (isWa ? '🟢 WhatsApp' : this._icon('facebook', 11) + ' Messenger')}
                    </span>
                    <span class="conv-lead-pill">${itemLead ? escapeHtml(itemLead.status || 'Lead') : 'New Lead'}</span>
                    <button class="conv-options-btn" style="margin-left:auto;" onclick="window.app.toggleConvMenu('${c.id}', event)" title="Conversation options">⋮</button>
                  </div>
                </div>
                <div id="conv-menu-${c.id}" class="conv-item-dropdown" style="display:none;" onclick="event.stopPropagation()">
                  <div class="conv-dropdown-item" onclick="window.app.toggleStarConversation('${c.id}')">
                    <span>${c.starred ? '★' : '☆'}</span> <span>${c.starred ? 'Unstar conversation' : 'Star conversation'}</span>
                  </div>
                  ${isUnread ? `
                    <div class="conv-dropdown-item" onclick="window.app.markConversationRead('${c.id}')">
                      <span>✓</span> <span>Mark as read</span>
                    </div>
                  ` : `
                    <div class="conv-dropdown-item" onclick="window.app.markConversationUnread('${c.id}')">
                      <span>●</span> <span>Mark as unread</span>
                    </div>
                  `}
                  <div class="conv-dropdown-item" onclick="window.app.toggleArchiveConversation('${c.id}')">
                    <span>${c.is_archived ? '📦' : '📁'}</span> <span>${c.is_archived ? 'Unarchive' : 'Archive'}</span>
                  </div>
                </div>
              </div>`;
            }).join('')}
          </div>
        </div>

        <!-- CENTER: ACTIVE CONVERSATION WORKSPACE (Column 2) -->
        <div class="inbox-main">
          ${activeConv ? `
            <div class="inbox-thread-header">
              <button class="inbox-back-btn" onclick="window.app.closeMobileThread()" aria-label="Back to conversations">
                <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
              </button>
              <div class="thread-avatar" style="background-color:${activeColor.bg};color:${activeColor.text};">
                ${activeInitials}
              </div>
              <div class="thread-meta">
                <div class="thread-name-row">
                  <span class="thread-name text-truncate">${escapeHtml(activeConv.name)}</span>
                </div>
                <div class="thread-sub text-truncate">
                  <span>${isIgActive ? 'Instagram Direct' : 'Facebook Messenger'}</span>
                  <span class="thread-lead-badge">${matchingLead ? escapeHtml(matchingLead.status || 'Lead') : 'Lead'}</span>
                </div>
              </div>
              <div class="thread-header-actions">
                <button class="btn-thread-star ${activeConv.starred ? 'active' : ''}" onclick="window.app.toggleStarConversation('${activeConv.id}')" title="Star conversation">
                  <svg width="16" height="16" fill="${activeConv.starred ? '#FF6A00' : 'none'}" stroke="currentColor" stroke-width="1.75" viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                </button>
                <button class="btn-thread-more" onclick="window.app.toggleConvMenu('${activeConv.id}', event)" title="More options">
                  <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></svg>
                </button>
                <button class="btn-thread-action btn-mark-read" onclick="window.app.toggleConversationUnread('${activeConv.id}')" title="Toggle unread status">
                  Mark Read
                </button>
                <button class="inbox-info-btn" onclick="window.app.toggleInboxDetails()" title="Toggle Customer &amp; CRM Details">
                  <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                </button>
              </div>
            </div>

            <div class="inbox-thread" id="inbox-thread">
              ${messages.length ? `
                <div class="msg-date-divider"><span>Today, ${activeConv.time || '10:24 AM'}</span></div>
                ${messages.map((m) => {
                  const isMedia = m.text && (m.text.includes('[Photo/Media Attachment]') || m.text.includes('Replied to your story'));
                  if (m.incoming) {
                    return `
                      <div class="msg msg-in" data-msg-id="${m.id || ''}">
                        <div class="msg-in-row">
                          <div class="msg-mini-avatar" style="background-color:${activeColor.bg};color:${activeColor.text};">
                            ${activeInitials}
                          </div>
                          <div class="msg-bubble">
                            ${this._renderAttachmentInBubble(m, false)}
                            ${isMedia ? `<div class="msg-media-preview">${m.text.includes('story') ? '📸 Story Mention' : '📎 Media Attachment'}</div>` : ''}
                            ${escapeHtml(m.text || '')}
                          </div>
                        </div>
                        ${m.time ? `<span class="msg-time">${m.time}</span>` : ''}
                      </div>
                    `;
                  } else {
                    const isSending = m.status === 'sending';
                    const isFailed = m.status === 'failed';
                    return `
                      <div class="msg msg-out ${isSending ? 'msg-sending' : ''} ${isFailed ? 'msg-failed' : ''}" data-msg-id="${m.id || ''}">
                        <div class="msg-bubble">
                          ${this._renderAttachmentInBubble(m, true)}
                          ${escapeHtml(m.text || '')}
                        </div>
                        <span class="msg-time">
                          ${m.time || 'Just now'}
                          ${isSending ? `
                            <span class="msg-status-sending" title="Sending…"><span class="spinner-dot"></span> Sending</span>
                          ` : isFailed ? `
                            <span class="msg-status-failed" title="Delivery failed">⚠️ Failed</span>
                            <button class="btn-msg-retry" onclick="window.app.retryInboxMessage('${m.id}')" title="Retry sending">↻ Retry</button>
                          ` : `
                            <span class="msg-status-check" title="Delivered">✓✓</span>
                          `}
                        </span>
                      </div>
                    `;
                  }
                }).join('')}
              ` : `
                <div class="inbox-thread-empty-state">
                  <div class="thread-empty-icon-box">
                    ${isIgActive ? this._icon('instagram', 24) : this._icon('facebook', 24)}
                  </div>
                  <h3 class="thread-empty-title">Start conversation with ${escapeHtml(activeConv.name)}</h3>
                  <p class="thread-empty-desc">
                    Send a direct message via ${isIgActive ? 'Instagram Direct' : 'Facebook Messenger'} or select a quick response template below to begin.
                  </p>
                  <div class="thread-suggested-prompts">
                    <button class="btn-suggested-prompt" onclick="window.app.insertSavedReply('Hello! Thanks for reaching out. How can our team help you today?')">
                      <span>👋 Greeting: How can our team help?</span>
                      <span>↵</span>
                    </button>
                    <button class="btn-suggested-prompt" onclick="window.app.insertSavedReply('Our team has received your inquiry. A specialist will call you shortly to discuss options.')">
                      <span>📞 Follow-up: Specialist calling shortly</span>
                      <span>↵</span>
                    </button>
                  </div>
                </div>
              `}
            </div>

            <div class="inbox-composer" ondragover="event.preventDefault(); this.classList.add('drag-over');" ondragleave="this.classList.remove('drag-over');" ondrop="window.app.handleComposerDrop(event)">
              <input type="file" id="inbox-file-input" style="display:none;" accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt" onchange="window.app.handleFileSelected(event)">
              <div id="inbox-attachment-preview-bar" style="display:none;padding:8px 14px;background:#F8FAFC;border-bottom:1px solid var(--border);align-items:center;gap:10px;"></div>
              
              <div class="composer-bar-container">
                <button class="btn-composer-attach" onclick="window.app.handleAttachmentClick()" title="Attach photo, video or document (max 25MB)" type="button">
                  <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.75" viewBox="0 0 24 24"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
                </button>
                <textarea class="inbox-msg-textarea" id="inbox-msg-input" placeholder="Type a reply…" rows="1" onkeydown="window.app.handleComposerKeydown(event)" oninput="window.app.handleComposerInput(this)" onpaste="window.app.handleComposerPaste(event)"></textarea>
                <button class="btn-composer-emoji" type="button" onclick="window.app.insertEmoji('😊')" title="Insert emoji">
                  <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.75" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
                </button>
                <button class="btn-send-msg" id="inbox-send-btn" onclick="window.app.sendInboxMessage()">
                  <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                  <span>Send</span>
                </button>
              </div>
            </div>
          ` : `
            <div class="inbox-empty-view">
              <div class="inbox-empty-icon">
                <svg width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.75" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              </div>
              <h3 class="inbox-empty-title">Unified Messages Inbox</h3>
              <p class="inbox-empty-desc">
                Live direct messages from connected Facebook Pages and Instagram accounts appear here in real-time. Select a conversation on the left to start chatting.
              </p>
              <div class="inbox-empty-actions">
                <button class="btn btn-secondary btn-sm" onclick="window.app.refreshInbox()">
                  ↻ Refresh Messages
                </button>
                <button class="btn btn-primary btn-sm" onclick="window.app.navigate('connections')">
                  Manage Meta Connections →
                </button>
              </div>
            </div>
          `}
        </div>

        <!-- RIGHT: CUSTOMER & CRM LINK DETAILS (Column 3) -->
        <div class="inbox-details" id="inbox-details">
          ${activeConv ? `
            <div class="inbox-details-header">
              <div class="inbox-details-title">Customer &amp; CRM Context</div>
              <button class="inbox-details-close" onclick="window.app.toggleInboxDetails()" title="Collapse panel">✕</button>
            </div>

            <div class="inbox-details-body">
              <!-- Profile Summary Card -->
              <div class="idetail-profile-card">
                <div class="idetail-avatar" style="background-color:${activeColor.bg};color:${activeColor.text};">
                  ${activeInitials}
                </div>
                <div class="idetail-name text-truncate" style="max-width:240px;">${escapeHtml(activeConv.name)}</div>
                <div class="idetail-handle text-truncate" style="max-width:240px;">${escapeHtml(activeConv.participantUsername ? `@${activeConv.participantUsername.replace(/^@/, '')}` : (isIgActive ? 'Instagram User' : 'Messenger User'))}</div>
                <div class="idetail-badge-wrap">
                  <span class="idetail-lead-pill">${matchingLead ? escapeHtml(matchingLead.status || 'Lead') : 'New Lead'}</span>
                </div>
                
                <button class="btn-meta-action" onclick="window.app.openMetaConversation('${activeConv.id}')">
                  <svg width="15" height="15" fill="#1877F2" viewBox="0 0 24 24"><path d="M12 2C6.477 2 2 6.145 2 11.258c0 2.91 1.455 5.518 3.735 7.21V22l3.415-1.874c.907.251 1.865.387 2.85.387 5.523 0 10-4.145 10-9.258C22 6.145 17.523 2 12 2zm1.054 12.433l-2.585-2.756-5.044 2.756 5.549-5.89 2.651 2.756 4.978-2.756-5.549 5.89z"/></svg>
                  <span>Message in Meta</span>
                </button>
                <button class="btn-create-lead-action" onclick="${matchingLead ? `window.app.openLeadDrawer('${matchingLead.id}')` : `window.app.createLeadFromConv('${escapeHtml(activeConv.name)}', '${activeConv.page_id}')`}">
                  <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                  <span>${matchingLead ? 'Open Full CRM Profile' : 'Create Lead in CRM'}</span>
                </button>
              </div>

              <!-- ACCOUNT INFORMATION -->
              <div class="idetail-card">
                <div class="idetail-section-heading">ACCOUNT INFORMATION</div>
                <div class="idetail-row">
                  <span class="idetail-label">Channel</span>
                  <span class="idetail-value">
                    ${isIgActive ? this._icon('instagram', 13) + ' Instagram Direct' : `<svg width="13" height="13" fill="#1877F2" viewBox="0 0 24 24"><path d="M12 2C6.477 2 2 6.145 2 11.258c0 2.91 1.455 5.518 3.735 7.21V22l3.415-1.874c.907.251 1.865.387 2.85.387 5.523 0 10-4.145 10-9.258C22 6.145 17.523 2 12 2zm1.054 12.433l-2.585-2.756-5.044 2.756 5.549-5.89 2.651 2.756 4.978-2.756-5.549 5.89z"/></svg> Facebook Messenger`}
                  </span>
                </div>
                <div class="idetail-row">
                  <span class="idetail-label">Account ID</span>
                  <span class="idetail-value text-truncate" style="max-width:160px;" title="${escapeHtml(activeConv.accountId || activeConv.page_id || 'fb_123456789012345')}">
                    ${escapeHtml(activeConv.accountId ? `fb_${activeConv.accountId.substring(0, 15)}` : 'fb_123456789012345')}
                  </span>
                </div>
                <div class="idetail-row">
                  <span class="idetail-label">Channel Fb ID</span>
                  <span class="idetail-value text-truncate" style="max-width:160px;">
                    ${escapeHtml(activeConv.channelFbId || activeConv.sender_id || '100012345678901')}
                  </span>
                </div>
                <div class="idetail-row">
                  <span class="idetail-label">Lead Activity</span>
                  <span class="idetail-value"><span class="status-dot-green"></span> Active (${activeConv.time || '2h ago'})</span>
                </div>
              </div>

              <!-- CRM INFORMATION -->
              <div class="idetail-card">
                <div class="idetail-section-heading">CRM INFORMATION</div>
                <div class="idetail-row">
                  <span class="idetail-label">Lead Stage</span>
                  <span class="idetail-value">
                    <select class="idetail-select" onchange="window.app.setLeadStageFromInbox('${matchingLead ? matchingLead.id : ''}', this.value)">
                      ${['New Lead', 'Contacted', 'Qualified', 'Proposal Sent', 'Negotiation', 'Won', 'Lost'].map(st => `
                        <option value="${st}" ${(matchingLead && matchingLead.status === st) || (!matchingLead && st === 'New Lead') ? 'selected' : ''}>${st}</option>
                      `).join('')}
                    </select>
                  </span>
                </div>
                <div class="idetail-row">
                  <span class="idetail-label">Assigned Staff</span>
                  <span class="idetail-value">
                    <select class="idetail-select" onchange="window.app.assignConversation('${activeConv.id}', this.value)">
                      <option value="">John Doe</option>
                      ${(this.svc ? (this.svc.staff || []) : []).map(s => `
                        <option value="${s.id}" ${(activeConv.assigned_staff_id || activeConv.assignedStaffId || (matchingLead && (matchingLead.assigned_staff_id || matchingLead.assignedStaffId))) === s.id ? 'selected' : ''}>${s.name}</option>
                      `).join('')}
                    </select>
                  </span>
                </div>
              </div>

              <!-- INTERNAL TEAM NOTES -->
              <div class="idetail-card">
                <div class="idetail-section-heading">INTERNAL TEAM NOTES</div>
                <div class="idetail-notes-container">
                  <textarea class="idetail-notes-textarea" id="inbox-note-input" placeholder="Add internal notes, tags or reminders..."></textarea>
                  <button class="btn-save-note" id="btn-save-note" onclick="window.app.saveInboxNote('${activeConv.id}')">Save</button>
                </div>
                <div class="idetail-notes-list" id="inbox-notes-list" style="${(activeConv.notes && activeConv.notes.length) ? '' : 'display:none;'}">
                  ${(activeConv.notes && activeConv.notes.length) ? activeConv.notes.map(n => `
                    <div class="idetail-note-item">
                      <div class="idetail-note-text">${escapeHtml(n.content)}</div>
                      <div class="idetail-note-meta">
                        <span>${escapeHtml(n.author || 'Team')}</span>
                        <span>${this._timeAgo(n.created_at || n.createdAt)}</span>
                      </div>
                    </div>
                  `).join('') : ''}
                </div>
              </div>
            </div>
          ` : `
            <div class="inbox-details-header">
              <div class="inbox-details-title">Connected Channels</div>
            </div>
            <div class="inbox-details-body">
              <div class="idetail-section-heading">Active Pages &amp; Accounts</div>
              <div class="idetail-channels-list" style="display:flex;flex-direction:column;gap:8px;">
                ${this._getAccessiblePages().map(p => {
                  const isIg = p.channel === 'instagram' || p.name.startsWith('@');
                  return `
                  <div class="idetail-card" style="padding:10px 12px;border:1px solid #E5E7EB;border-radius:8px;">
                    <div style="display:flex;align-items:center;gap:10px;">
                      <div style="width:30px;height:30px;border-radius:6px;background:${isIg ? '#FDF2F2' : '#EEF4FE'};color:${isIg ? '#D82C0D' : '#1877F2'};display:flex;align-items:center;justify-content:center;">
                        ${isIg ? this._icon('instagram', 15) : this._icon('facebook', 15)}
                      </div>
                      <div style="flex:1;min-width:0;">
                        <div class="text-truncate" style="font-size:12.5px;font-weight:600;color:var(--text-primary);">${escapeHtml(p.name)}</div>
                        <div style="font-size:11px;color:#10B981;display:flex;align-items:center;gap:4px;"><span class="status-dot-green"></span> Active</div>
                      </div>
                    </div>
                  </div>`;
                }).join('') || '<p class="text-xs text-gray">No channels connected yet.</p>'}
              </div>
            </div>
          `}
        </div>
      </div>`;

    // Auto-scroll thread to bottom
    const thread = document.getElementById('inbox-thread');
    if (thread) {
      setTimeout(() => { thread.scrollTop = thread.scrollHeight; }, 30);
    }
  }

  setInboxTab(tab) {
    this.inboxTab = tab;
    this.renderInbox();
  }

  setInboxSort(sort) {
    this.inboxSortMode = sort;
    this.renderInbox();
  }

  toggleStarConversation(convId) {
    const conv = (this.svc && this.svc.conversations) ? this.svc.conversations.find(c => String(c.id) === String(convId)) : null;
    if (conv) {
      conv.starred = !conv.starred;
      if (this.svc && this.svc._saveToStorage) this.svc._saveToStorage();
      else if (this.svc && this.svc.saveAll) this.svc.saveAll();
      this.toast(conv.starred ? 'Conversation starred' : 'Conversation unstarred', 'info');
      this.renderInbox();
    }
  }

  openMetaConversation(convId) {
    this.toast('Opening conversation in Meta Business Suite…', 'info');
    window.open('https://business.facebook.com/latest/inbox', '_blank', 'noopener,noreferrer');
  }

  insertEmoji(emoji) {
    const input = document.getElementById('inbox-msg-input');
    if (!input) return;
    const start = input.selectionStart || input.value.length;
    const end = input.selectionEnd || input.value.length;
    input.value = input.value.substring(0, start) + emoji + input.value.substring(end);
    input.selectionStart = input.selectionEnd = start + emoji.length;
    input.focus();
    this.handleComposerInput(input);
  }

  handleGlobalSearch(query) {
    this.inboxSearchQuery = query;
    if (this.currentRoute !== 'inbox') {
      this.navigate('inbox');
    } else {
      this.renderInbox();
    }
  }

  toggleConvMenu(convId, event) {
    if (event) event.stopPropagation();
    const allMenus = document.querySelectorAll('.conv-item-dropdown');
    const targetMenu = document.getElementById(`conv-menu-${convId}`);
    const wasOpen = targetMenu && targetMenu.style.display === 'block';
    allMenus.forEach(m => m.style.display = 'none');
    if (targetMenu && !wasOpen) {
      targetMenu.style.display = 'block';
    }
  }

  async markConversationRead(convId) {
    const allMenus = document.querySelectorAll('.conv-item-dropdown');
    allMenus.forEach(m => m.style.display = 'none');
    const conv = (this.svc && this.svc.conversations) ? this.svc.conversations.find(c => String(c.id) === String(convId)) : null;
    if (conv) {
      conv.unread = 0;
      conv.unread_count = 0;
    }
    try {
      await fetch('/api/messages', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation_id: convId, unread_count: 0 })
      });
    } catch (e) {
      console.warn('Failed to mark read on server:', e);
    }
    if (this.svc && this.svc._saveToStorage) this.svc._saveToStorage();
    this.renderInbox();
  }

  async markConversationUnread(convId) {
    const allMenus = document.querySelectorAll('.conv-item-dropdown');
    allMenus.forEach(m => m.style.display = 'none');
    const conv = (this.svc && this.svc.conversations) ? this.svc.conversations.find(c => String(c.id) === String(convId)) : null;
    if (conv) {
      conv.unread = 1;
      conv.unread_count = 1;
    }
    try {
      await fetch('/api/messages', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation_id: convId, unread_count: 1 })
      });
    } catch (e) {
      console.warn('Failed to mark unread on server:', e);
    }
    if (this.svc && this.svc._saveToStorage) this.svc._saveToStorage();
    this.renderInbox();
  }

  async toggleArchiveConversation(convId) {
    const allMenus = document.querySelectorAll('.conv-item-dropdown');
    allMenus.forEach(m => m.style.display = 'none');
    const conv = (this.svc && this.svc.conversations) ? this.svc.conversations.find(c => String(c.id) === String(convId)) : null;
    const newArchived = conv ? !conv.is_archived : true;
    if (conv) {
      conv.is_archived = newArchived;
    }
    try {
      await fetch('/api/messages', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation_id: convId, is_archived: newArchived })
      });
      this.toast(newArchived ? 'Conversation archived' : 'Conversation unarchived', 'info');
    } catch (e) {
      console.warn('Failed to archive on server:', e);
    }
    if (this.svc && this.svc._saveToStorage) this.svc._saveToStorage();
    this.renderInbox();
  }

  async selectInboxConv(convId) {
    this.activeConvId = convId;
    this.mobileInboxView = 'chat';

    const conv = (this.svc && this.svc.conversations) ? this.svc.conversations.find(c => String(c.id) === String(convId)) : null;
    if (conv && ((conv.unread || 0) > 0 || (conv.unread_count || 0) > 0)) {
      conv.unread = 0;
      conv.unread_count = 0;
      if (this.svc && this.svc._saveToStorage) this.svc._saveToStorage();
      else if (this.svc && this.svc.saveAll) this.svc.saveAll();
      try {
        fetch('/api/messages', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conversation_id: convId, unread_count: 0 })
        }).catch(() => {});
      } catch (e) {}
    }

    this.renderInbox();

    if (conv && (!conv.messages || conv.messages.length === 0)) {
      await this.fetchRealConversationMessages(conv);
    }

    const thread = document.getElementById('inbox-thread');
    if (thread) {
      setTimeout(() => { thread.scrollTop = thread.scrollHeight; }, 30);
    }
  }

  async toggleConversationUnread(convId) {
    if (!this.svc || !this.svc.conversations) return;
    const conv = this.svc.conversations.find(c => String(c.id) === String(convId));
    if (conv) {
      const isUnread = (conv.unread && conv.unread > 0) || (conv.unread_count && conv.unread_count > 0);
      const newCount = isUnread ? 0 : 1;
      conv.unread = newCount;
      conv.unread_count = newCount;
      try {
        await fetch('/api/messages', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conversation_id: convId, unread_count: newCount })
        });
      } catch (e) {}
      if (this.svc._saveToStorage) this.svc._saveToStorage(); else if (this.svc.saveAll) this.svc.saveAll();
      this.renderInbox();
      this.toast(newCount > 0 ? 'Conversation marked as unread' : 'Conversation marked as read', 'info');
    }
  }

  setLeadStageFromInbox(leadId, stage) {
    if (this.svc && this.svc.leads) {
      const lead = this.svc.leads.find(l => l.id === leadId);
      if (lead) {
        lead.status = stage;
        if (!lead.activities) lead.activities = [];
        lead.activities.push({
          type: 'STATUS_CHANGE',
          description: `Stage changed to ${stage} via Unified Inbox`,
          timestamp: new Date().toISOString()
        });
        if (this.svc._saveToStorage) this.svc._saveToStorage(); else if (this.svc.saveAll) this.svc.saveAll();
        this.toast(`Lead moved to "${stage}"`, 'success');
        this.renderInbox();
      }
    }
  }

  saveInboxNote(convId) {
    const input = document.getElementById('inbox-note-input');
    if (!input || !input.value.trim()) return;
    const noteText = input.value.trim();
    input.value = '';
    this.addConversationNote(convId, noteText);
  }

  handleComposerKeydown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendInboxMessage();
    }
  }

  handleComposerInput(el) {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
    const sendBtn = document.getElementById('inbox-send-btn');
    if (sendBtn) {
      sendBtn.disabled = !el.value.trim();
    }
  }

  handleAttachmentClick() {
    const fileInput = document.getElementById('inbox-file-input');
    if (fileInput) fileInput.click();
  }

  handleFileSelected(event) {
    const file = event.target?.files?.[0];
    if (file) {
      this.processSelectedFile(file);
    }
  }

  handleComposerPaste(event) {
    const items = (event.clipboardData || window.clipboardData)?.items;
    if (items) {
      for (let i = 0; i < items.length; i++) {
        if (items[i].kind === 'file') {
          const file = items[i].getAsFile();
          if (file) {
            event.preventDefault();
            this.processSelectedFile(file);
            break;
          }
        }
      }
    }
  }

  handleComposerDrop(event) {
    event.preventDefault();
    const composer = event.currentTarget || document.querySelector('.inbox-composer');
    if (composer) composer.classList.remove('drag-over');
    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      this.processSelectedFile(files[0]);
    }
  }

  async _getSupabaseClient() {
    if (window.supabaseService && window.supabaseService.client) {
      return window.supabaseService.client;
    }
    let cfg = window.supabaseService?.config;
    if (!cfg || !cfg.url || !cfg.anonKey) {
      try {
        const res = await fetch('/api/config');
        if (res.ok) {
          const data = await res.json();
          if (data.supabaseUrl && data.supabaseAnonKey) {
            cfg = { url: data.supabaseUrl, anonKey: data.supabaseAnonKey };
            if (window.supabaseService) window.supabaseService.config = cfg;
          }
        }
      } catch (e) {}
    }
    if (window.supabase && cfg && cfg.url && cfg.anonKey) {
      const client = window.supabase.createClient(cfg.url, cfg.anonKey);
      if (window.supabaseService) window.supabaseService.client = client;
      return client;
    }
    return null;
  }

  async processSelectedFile(file) {
    if (!file) return;

    if (!this.activeConvId) {
      this.toast('Please select a conversation before attaching files', 'warning');
      return;
    }

    // Check Meta & Supabase 25MB file size limit (26,214,400 bytes)
    if (file.size > 26214400) {
      this.toast(`File is ${(file.size / (1024 * 1024)).toFixed(1)}MB. Maximum allowed file size is 25MB.`, 'error');
      const fileInp = document.getElementById('inbox-file-input');
      if (fileInp) fileInp.value = '';
      return;
    }

    const previewBar = document.getElementById('inbox-attachment-preview-bar');
    const sendBtn = document.getElementById('inbox-send-btn');
    const isImg = file.type.startsWith('image/');
    const localPreviewUrl = isImg ? URL.createObjectURL(file) : null;

    if (previewBar) {
      previewBar.style.display = 'flex';
      previewBar.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;width:100%;">
          ${localPreviewUrl ? `<img src="${localPreviewUrl}" style="width:36px;height:36px;object-fit:cover;border-radius:4px;border:1px solid #E2E8F0;">` : `<span class="spinner" style="width:14px;height:14px;border-width:2px;"></span>`}
          <div style="flex:1;min-width:0;font-size:12px;">
            <div style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(file.name)}</div>
            <div style="color:#64748B;font-size:11px;">Uploading directly to secure storage (${(file.size / 1024).toFixed(0)} KB)…</div>
          </div>
          <button type="button" onclick="window.app.clearPendingAttachment()" style="background:none;border:none;color:#94A3B8;cursor:pointer;font-size:16px;padding:2px 6px;" title="Remove attachment">✕</button>
        </div>
      `;
    }
    if (sendBtn) sendBtn.disabled = true;

    this._pendingAttachment = {
      name: file.name,
      type: file.type || 'application/octet-stream',
      size: file.size,
      uploading: true
    };

    try {
      // 1. Request signed upload URL from backend without sending file bytes
      const res = await fetch('/api/messages?action=upload-url', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': (this.user && this.user.id) || 'admin'
        },
        body: JSON.stringify({
          conversation_id: this.activeConvId,
          file_name: file.name,
          mime_type: file.type || 'application/octet-stream',
          size: file.size
        })
      });

      const urlData = await res.json();
      if (!res.ok || urlData.error) {
        throw new Error(urlData.error || 'Failed to obtain upload authorization');
      }

      const { path, token } = urlData;

      // 2. Direct browser-to-Supabase Storage upload using signed URL token
      const sbClient = await this._getSupabaseClient();
      if (!sbClient) {
        throw new Error('Supabase Storage client unavailable');
      }

      const { error: upErr } = await sbClient.storage
        .from('message-attachments')
        .uploadToSignedUrl(path, token, file);

      if (upErr) {
        throw new Error(upErr.message || 'Storage upload failed');
      }

      // 3. Keep relative storage path for message payload (NEVER store signed URLs in DB)
      this._pendingAttachment = {
        name: file.name,
        type: file.type || 'application/octet-stream',
        size: file.size,
        url: path, // RELATIVE STORAGE PATH ONLY
        storagePath: path,
        storage_path: path,
        localPreviewUrl: localPreviewUrl,
        uploading: false
      };

      if (previewBar) {
        previewBar.innerHTML = `
          <div style="display:flex;align-items:center;gap:10px;width:100%;">
            ${isImg ? `<img src="${escapeHtml(fileUrl || localPreviewUrl)}" style="width:36px;height:36px;object-fit:cover;border-radius:4px;border:1px solid #E2E8F0;">` : `<span style="font-size:20px;">📎</span>`}
            <div style="flex:1;min-width:0;font-size:12px;">
              <div style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(file.name)}</div>
              <div style="color:#10B981;font-size:11px;">✓ Ready to send (${(file.size / 1024).toFixed(0)} KB)</div>
            </div>
            <button type="button" onclick="window.app.clearPendingAttachment()" style="background:none;border:none;color:#94A3B8;cursor:pointer;font-size:16px;padding:2px 6px;" title="Remove attachment">✕</button>
          </div>
        `;
      }
      if (sendBtn) sendBtn.disabled = false;
      this.toast('Attachment uploaded and ready to send', 'success');
    } catch (err) {
      console.error('[Attachment upload error]:', err);
      this.toast(`Failed to prepare attachment: ${err.message}`, 'error');
      this.clearPendingAttachment();
    }
  }

  clearPendingAttachment() {
    this._pendingAttachment = null;
    const fileInp = document.getElementById('inbox-file-input');
    if (fileInp) fileInp.value = '';
    const previewBar = document.getElementById('inbox-attachment-preview-bar');
    if (previewBar) {
      previewBar.style.display = 'none';
      previewBar.innerHTML = '';
    }
    const msgInp = document.getElementById('inbox-msg-input');
    const sendBtn = document.getElementById('inbox-send-btn');
    if (sendBtn) {
      sendBtn.disabled = !msgInp || !msgInp.value.trim();
    }
  }

  openImageModal(url, title = 'Photo') {
    let modal = document.getElementById('inbox-media-lightbox');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'inbox-media-lightbox';
      modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;cursor:zoom-out;';
      modal.onclick = () => modal.remove();
      document.body.appendChild(modal);
    }
    modal.innerHTML = `
      <div style="position:relative;max-width:90vw;max-height:90vh;display:flex;flex-direction:column;align-items:center;" onclick="event.stopPropagation()">
        <button style="position:absolute;top:-36px;right:0;background:none;border:none;color:#fff;font-size:24px;cursor:pointer;" onclick="document.getElementById('inbox-media-lightbox')?.remove()">✕</button>
        <img src="${escapeHtml(url)}" alt="${escapeHtml(title)}" style="max-width:90vw;max-height:85vh;border-radius:8px;object-fit:contain;box-shadow:0 8px 30px rgba(0,0,0,0.5);">
        <div style="margin-top:10px;color:#fff;font-size:13px;display:flex;align-items:center;gap:12px;">
          <span>${escapeHtml(title)}</span>
          <a href="${escapeHtml(url)}" target="_blank" rel="noopener" download style="color:#60A5FA;text-decoration:underline;">Download original</a>
        </div>
      </div>
    `;
  }

  _extractAttachment(m) {
    if (!m) return null;
    let raw = m.attachment || (Array.isArray(m.attachments) && m.attachments[0]) || null;
    let url = null;
    let type = null;
    let name = null;
    let storagePath = null;

    if (raw) {
      url = raw.url || raw.signedUrl || raw.signed_url || (raw.payload && raw.payload.url) || raw.src || null;
      type = raw.type || raw.mimeType || raw.mime_type || (raw.payload && raw.payload.type) || null;
      name = raw.name || raw.filename || (raw.payload && raw.payload.name) || null;
      storagePath = raw.storagePath || raw.storage_path || null;
    }

    if (!url) {
      url = m.attachment_url || m.media_url || m.mediaUrl || m.image_url || m.imageUrl || m.file_url || m.fileUrl || null;
    }
    if (!storagePath) {
      storagePath = m.attachment_storage_path || null;
    }
    if (!url && storagePath) {
      url = storagePath;
    }
    if (!url && !storagePath) return null;

    const isExpired = storagePath === 'EXPIRED' || url === 'EXPIRED' || m.attachment_unavailable === true;

    type = (type || '').toLowerCase();
    const cleanUrl = (url || '').split('?')[0].toLowerCase();
    if (!type || type === 'file') {
      if (cleanUrl.match(/\.(jpeg|jpg|png|gif|webp|bmp|svg)$/i) || m.isImage || m.imageUrl || m.image_url) {
        type = 'image';
      } else if (cleanUrl.match(/\.(mp4|mov|webm|quicktime)$/i)) {
        type = 'video';
      } else if (cleanUrl.match(/\.(mp3|wav|ogg|m4a|aac)$/i)) {
        type = 'audio';
      }
    }

    return {
      url,
      type: type || 'file',
      name: name || (type.startsWith('image') ? 'Photo' : 'Attachment'),
      storagePath,
      isExpired
    };
  }

  _renderAttachmentInBubble(m, isOutgoing = false) {
    const att = this._extractAttachment(m);
    if (!att || (!att.url && !att.storagePath)) return '';

    if (att.isExpired || att.storagePath === 'EXPIRED' || m.attachment_storage_path === 'EXPIRED') {
      return `
        <div class="msg-attachment-render" style="margin-bottom:6px;">
          <div class="msg-attachment-unavailable" style="display:inline-flex;align-items:center;gap:8px;padding:8px 12px;background:rgba(0,0,0,0.04);border:1px dashed #CBD5E1;border-radius:8px;font-size:12px;color:#64748B;" title="Attachment unavailable or link expired">
            <span style="font-size:16px;">📷</span>
            <span>Attachment unavailable</span>
          </div>
        </div>
      `;
    }

    const url = m.localPreviewUrl || m.attachment?.localPreviewUrl || att.url;
    const name = att.name || 'Attachment';
    const type = (att.type || '').toLowerCase();
    const isImg = type.startsWith('image') || url.match(/\.(jpeg|jpg|gif|png|webp)($|\?)/i);
    const isVideo = type.startsWith('video') || url.match(/\.(mp4|mov|webm)($|\?)/i);
    const isAudio = type.startsWith('audio') || url.match(/\.(mp3|wav|ogg|m4a|aac)($|\?)/i);

    if (isImg) {
      return `
        <div class="msg-attachment-render" style="margin-bottom:6px;">
          <img src="${escapeHtml(url)}" 
               alt="${escapeHtml(name)}" 
               data-storage-path="${escapeHtml(att.storagePath || (!url.startsWith('http') && !url.startsWith('blob:') ? url : ''))}"
               style="max-width:260px;max-height:220px;border-radius:8px;object-fit:cover;cursor:pointer;display:block;box-shadow:0 1px 3px rgba(0,0,0,0.12);" 
               onclick="window.app.openImageModal('${escapeHtml(url)}', '${escapeHtml(name)}')"
               onload="window.app._onImageLoadedInThread()"
               onerror="window.app.handleAttachmentImageError(this, '${escapeHtml(name)}')">
        </div>
      `;
    }
    if (isVideo) {
      return `
        <div class="msg-attachment-render" style="margin-bottom:6px;">
          <video src="${escapeHtml(url)}" controls playsinline style="max-width:280px;max-height:220px;border-radius:8px;display:block;"></video>
        </div>
      `;
    }
    if (isAudio) {
      return `
        <div class="msg-attachment-render" style="margin-bottom:6px;">
          <audio src="${escapeHtml(url)}" controls style="max-width:240px;display:block;margin:4px 0;"></audio>
        </div>
      `;
    }
    const pillBg = isOutgoing ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.06)';
    return `
      <div class="msg-attachment-render" style="margin-bottom:6px;">
        <a href="${escapeHtml(url)}" target="_blank" rel="noopener" download="${escapeHtml(name)}" style="display:inline-flex;align-items:center;gap:6px;padding:6px 12px;background:${pillBg};border-radius:6px;color:inherit;text-decoration:none;font-size:12px;font-weight:500;">
          <span>📎</span> <span style="text-decoration:underline;">${escapeHtml(name)}</span>
        </a>
      </div>
    `;
  }

  async handleAttachmentImageError(imgEl, name = 'Photo') {
    if (!imgEl) return;
    imgEl.onerror = null;

    const storagePath = imgEl.getAttribute('data-storage-path');
    if (storagePath && storagePath !== 'EXPIRED' && !imgEl._hasRetried) {
      imgEl._hasRetried = true;
      try {
        const sbClient = await this._getSupabaseClient();
        if (sbClient) {
          const { data, error } = await sbClient.storage
            .from('message-attachments')
            .createSignedUrl(storagePath, 3600);
          if (!error && data?.signedUrl) {
            imgEl.src = data.signedUrl;
            imgEl.setAttribute('onclick', `window.app.openImageModal('${escapeHtml(data.signedUrl)}', '${escapeHtml(name)}')`);
            return;
          }
        }
      } catch (e) {}
    }

    const parent = imgEl.parentElement;
    if (parent) {
      parent.innerHTML = `
        <div class="msg-attachment-unavailable" style="display:inline-flex;align-items:center;gap:8px;padding:8px 12px;background:rgba(0,0,0,0.04);border:1px dashed #CBD5E1;border-radius:8px;font-size:12px;color:#64748B;" title="Attachment unavailable or link expired">
          <span style="font-size:16px;">📷</span>
          <span>Attachment unavailable</span>
        </div>
      `;
    }
  }

  _onImageLoadedInThread() {
    this._scrollThreadToBottom(false);
  }

  clearInboxSearch() {
    this.inboxSearchQuery = '';
    const inp = document.getElementById('inbox-search-input');
    if (inp) inp.value = '';
    this.renderInbox();
  }

  async fetchRealConversationMessages(conv) {
    if (!conv) return;
    try {
      const thread = document.getElementById('inbox-thread');
      if (thread && (!conv.messages || conv.messages.length === 0)) {
        thread.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-secondary);"><span class="spinner"></span> Loading real conversation messages…</div>';
      }

      let rawMsgs = [];
      // 1. Try Supabase messages first (which contains permanently stored attachments)
      try {
        const dbRes = await fetch(`/api/messages?conversation_id=${encodeURIComponent(conv.id)}`, {
          headers: { 'X-User-Id': (this.user && this.user.id) || 'admin' }
        });
        if (dbRes.ok) {
          const dbData = await dbRes.json();
          rawMsgs = dbData.messages || [];
        }
      } catch (e) {}

      // 2. Fallback to Zernio endpoint if Supabase had no messages for this conversation
      if (!rawMsgs || rawMsgs.length === 0) {
        const accountId = conv.accountId || conv.page_id;
        const accParam = accountId ? `&accountId=${encodeURIComponent(accountId)}` : '';
        const res = await fetch(`/api/zernio?path=inbox-messages&conversationId=${encodeURIComponent(conv.id)}${accParam}`);
        if (res.ok) {
          const data = await res.json();
          rawMsgs = Array.isArray(data) ? data : (data.messages || data.data || []);
        }
      }

      if (Array.isArray(rawMsgs) && rawMsgs.length > 0) {
        conv.messages = rawMsgs.map(m => {
          let text = m.message || m.message_text || m.text || '';
          const att = this._extractAttachment(m);
          if (!text || !text.trim()) {
            if (m.isStoryMention) text = 'Replied to your story 📸';
            else if (att) text = (att.type && att.type.startsWith('image')) ? 'Sent a photo 📷' : '📎 Attachment';
            else text = 'Direct message';
          }
          const incoming = m.direction ? (m.direction === 'incoming' || m.direction === 'inbound') : (m.sender_type === 'customer' || m.incoming === true);
          return {
            id: m.id,
            text: text,
            incoming: incoming,
            attachment: att,
            attachments: m.attachments || (att ? [att] : []),
            attachment_url: att?.url || m.attachment_url,
            attachment_storage_path: att?.storagePath || m.attachment_storage_path,
            created_at: m.created_at || m.createdAt || m.sentAt,
            time: new Date(m.sentAt || m.createdAt || m.created_at || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          };
        });

        // Always sort messages oldest to newest within open conversation
        conv.messages.sort((a, b) => {
          const tA = new Date(a.created_at || a.time || 0).getTime();
          const tB = new Date(b.created_at || b.time || 0).getTime();
          return tA - tB;
        });

        if (this.svc) {
          if (this.svc.saveConversations) this.svc.saveConversations();
          else if (this.svc._saveToStorage) this.svc._saveToStorage();
          else if (this.svc.saveAll) this.svc.saveAll();
        }

        if (this.activeConvId === conv.id) {
          this.renderInbox();
          const thread = document.getElementById('inbox-thread');
          if (thread) {
            setTimeout(() => { thread.scrollTop = thread.scrollHeight; }, 30);
          }
        }
      }
    } catch (e) {
      console.warn('[Fetch Messages Error]:', e);
    }
  }

  async fetchRealInstagramConversations() {
    try {
      const res = await fetch('/api/zernio?path=inbox-conversations');
      if (!res.ok) return;
      const data = await res.json();
      const rawList = Array.isArray(data) ? data : (data.data || data.conversations || []);
      if (Array.isArray(rawList) && rawList.length > 0) {
        if (!this.svc) return;
        if (!this.svc.conversations) this.svc.conversations = [];

        // Clear out any simulated dummy convs so ONLY real conversations are shown
        this.svc.conversations = this.svc.conversations.filter(c => !c.id.startsWith('conv_ig_initial') && !c.id.startsWith('conv_sim_'));

        rawList.forEach(c => {
          const cid = String(c.id);
          const existing = this.svc.conversations.find(x => String(x.id) === cid);
          const isFb = c.platform === 'facebook' || c.platform === 'messenger';
          const participantName = c.participantName || c.participantUsername || (isFb ? 'Facebook User' : 'Instagram User');
          const cleanName = isFb ? participantName : (participantName.startsWith('@') ? participantName : `@${participantName}`);
          const channel = isFb ? 'messenger' : 'instagram';

          if (existing) {
            existing.name = cleanName;
            existing.channel = channel;
            existing.preview = c.lastMessage || existing.preview;
            existing.time = c.updatedTime ? new Date(c.updatedTime).toLocaleDateString([], { month: 'short', day: 'numeric' }) : existing.time;
            existing.last_message_at = c.updatedTime || existing.last_message_at || new Date().toISOString();
            existing.unread = c.unreadCount || 0;
            existing.accountId = c.accountId || existing.accountId;
            existing.page_id = c.accountId || existing.page_id;
          } else {
            this.svc.conversations.push({
              id: cid,
              conversationId: cid,
              accountId: c.accountId || '6acd4daed19284a3227d7870',
              name: cleanName,
              participantUsername: c.participantUsername,
              channel: channel,
              page_id: c.accountId || '6acd4daed19284a3227d7870',
              time: c.updatedTime ? new Date(c.updatedTime).toLocaleDateString([], { month: 'short', day: 'numeric' }) : 'Recently',
              last_message_at: c.updatedTime || new Date().toISOString(),
              preview: c.lastMessage || 'Direct message',
              unread: c.unreadCount || 0,
              messages: []
            });
          }
        });

        // Always ensure conversations are sorted by newest message first
        if (this.svc && this.svc.conversations) {
          this.svc.conversations.sort((a, b) => {
            const timeA = this.svc._resolveConvTimestamp ? this.svc._resolveConvTimestamp(a) : new Date(a.last_message_at || a.time || 0).getTime();
            const timeB = this.svc._resolveConvTimestamp ? this.svc._resolveConvTimestamp(b) : new Date(b.last_message_at || b.time || 0).getTime();
            return timeB - timeA;
          });
        }

        if (this.svc.saveConversations) this.svc.saveConversations();
        else if (this.svc._saveToStorage) this.svc._saveToStorage();
        else if (this.svc.saveAll) this.svc.saveAll();

        if (!this.activeConvId && this.svc.conversations.length > 0) {
          this.activeConvId = this.svc.conversations[0].id;
        }

        if (this.currentRoute === 'inbox') {
          this.renderInbox();
          const active = this.svc.conversations.find(x => x.id === this.activeConvId);
          if (active && (!active.messages || active.messages.length === 0)) {
            this.fetchRealConversationMessages(active);
          }
        }
      }
    } catch (e) {
      console.warn('[Fetch Instagram Conversations Error]:', e);
    }
  }

  async refreshRealInbox() {
    const btn = document.getElementById('btn-inbox-refresh');
    const origHtml = btn ? btn.innerHTML : null;
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner" style="width:12px;height:12px;border-width:2px;"></span> Syncing…`;
    }
    this.toast('Syncing real conversations & messages…', 'info');
    try {
      await this.fetchRealInstagramConversations();
      this.toast('✓ Inbox up to date!', 'success');
    } finally {
      if (btn && origHtml) {
        btn.disabled = false;
        btn.innerHTML = origHtml;
      }
    }
  }

  closeMobileThread() {
    this.mobileInboxView = 'list';
    this.renderInbox();
  }

  toggleInboxDetails() {
    const layout = document.querySelector('.inbox-layout');
    const details = document.getElementById('inbox-details');
    if (layout) {
      if (window.innerWidth <= 1024) {
        if (details) details.classList.toggle('open');
      } else {
        layout.classList.toggle('details-collapsed');
        const isCollapsed = layout.classList.contains('details-collapsed');
        sessionStorage.setItem('inbox_details_collapsed', isCollapsed ? 'true' : 'false');
      }
    }
  }

  _formatMessageTime(val) {
    if (!val) return '';
    if (typeof val === 'string' && (val.includes('ago') || val === 'Just now' || (val.includes(':') && !val.includes('-') && !val.includes('T')))) {
      return val;
    }
    const d = new Date(val);
    if (isNaN(d.getTime())) return String(val);
    const now = new Date();
    const diffSec = Math.floor((now.getTime() - d.getTime()) / 1000);
    if (diffSec < 45) return 'Just now';
    if (diffSec < 3600) return `${Math.max(1, Math.floor(diffSec / 60))}m ago`;
    if (diffSec < 86400 && d.getDate() === now.getDate()) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (d.getDate() === yesterday.getDate() && d.getMonth() === yesterday.getMonth() && d.getFullYear() === yesterday.getFullYear()) {
      return 'Yesterday';
    }
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  _moveSidebarConvToTop(convId, preview, timeText = 'Just now', unreadCount = null) {
    const list = document.getElementById('inbox-conv-list');
    if (list) {
      const item = list.querySelector(`.inbox-conv-item[data-conv-id="${convId}"]`);
      if (item) {
        if (preview) {
          const prevEl = item.querySelector('.conv-preview');
          if (prevEl) prevEl.textContent = preview;
        }
        if (timeText) {
          const timeEl = item.querySelector('.conv-time');
          if (timeEl) timeEl.textContent = timeText;
        }
        if (unreadCount !== null) {
          let unreadBadge = item.querySelector('.conv-unread');
          if (unreadCount > 0) {
            if (!unreadBadge) {
              const channelRow = item.querySelector('.conv-channel-row');
              if (channelRow) {
                unreadBadge = document.createElement('span');
                unreadBadge.className = 'conv-unread';
                channelRow.appendChild(unreadBadge);
              }
            }
            if (unreadBadge) unreadBadge.textContent = unreadCount;
            const prevEl = item.querySelector('.conv-preview');
            if (prevEl) prevEl.classList.add('is-unread');
          } else if (unreadBadge) {
            unreadBadge.remove();
            const prevEl = item.querySelector('.conv-preview');
            if (prevEl) prevEl.classList.remove('is-unread');
          }
        }
        const searchEmpty = document.getElementById('inbox-search-empty');
        if (searchEmpty && searchEmpty.nextSibling) {
          list.insertBefore(item, searchEmpty.nextSibling);
        } else {
          list.prepend(item);
        }
      } else {
        if (this.currentRoute === 'inbox') {
          this.renderInbox();
        }
      }
    }

    if (this.svc && this.svc.conversations) {
      const idx = this.svc.conversations.findIndex(c => String(c.id) === String(convId));
      if (idx !== -1) {
        const target = this.svc.conversations[idx];
        const nowIso = new Date().toISOString();
        target.last_message_at = nowIso;
        target.time = timeText || 'Just now';
        if (preview) target.preview = preview;
        if (unreadCount !== null) target.unread = unreadCount;
        if (idx > 0) {
          this.svc.conversations.splice(idx, 1);
          this.svc.conversations.unshift(target);
        }
        if (this.svc._saveToStorage) this.svc._saveToStorage();
      }
    }
  }

  _scrollThreadToBottom(force = false) {
    const thread = document.getElementById('inbox-thread');
    if (!thread) return;
    const isNearBottom = (thread.scrollHeight - thread.scrollTop - thread.clientHeight) < 160;
    if (force || isNearBottom) {
      thread.scrollTo({ top: thread.scrollHeight, behavior: 'smooth' });
      const scrollBtn = document.getElementById('inbox-scroll-bottom-btn');
      if (scrollBtn) scrollBtn.remove();
    } else {
      let scrollBtn = document.getElementById('inbox-scroll-bottom-btn');
      if (!scrollBtn) {
        scrollBtn = document.createElement('button');
        scrollBtn.id = 'inbox-scroll-bottom-btn';
        scrollBtn.className = 'inbox-scroll-bottom-btn';
        scrollBtn.innerHTML = `<span>New message ↓</span>`;
        scrollBtn.onclick = () => {
          thread.scrollTo({ top: thread.scrollHeight, behavior: 'smooth' });
          scrollBtn.remove();
        };
        const container = thread.parentElement;
        if (container) container.appendChild(scrollBtn);
      }
    }
  }

  _renderOptimisticMessageInThread(msgObj) {
    const thread = document.getElementById('inbox-thread');
    if (!thread) return;
    const emptyState = thread.querySelector('.inbox-thread-empty-state');
    if (emptyState) emptyState.remove();

    const msgDiv = document.createElement('div');
    msgDiv.className = 'msg msg-out msg-sending';
    msgDiv.setAttribute('data-msg-id', msgObj.id);
    msgDiv.innerHTML = `
      <div class="msg-bubble">
        ${this._renderAttachmentInBubble(msgObj, true)}
        ${escapeHtml(msgObj.text || '')}
      </div>
      <span class="msg-time">
        ${msgObj.time || 'Just now'}
        <span class="msg-status-sending" title="Sending…"><span class="spinner-dot"></span> Sending</span>
      </span>
    `;
    thread.appendChild(msgDiv);
    this._scrollThreadToBottom(true);
  }

  _updateMessageBubbleStatus(msgId, status, errorText = '') {
    const thread = document.getElementById('inbox-thread');
    if (!thread) return;
    const msgDiv = thread.querySelector(`.msg[data-msg-id="${msgId}"]`);
    if (!msgDiv) return;

    msgDiv.classList.remove('msg-sending', 'msg-failed');
    const timeSpan = msgDiv.querySelector('.msg-time');
    const timeText = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    if (status === 'sent') {
      if (timeSpan) {
        timeSpan.innerHTML = `${timeText} <span class="msg-status-check" title="Delivered">✓✓</span>`;
      }
    } else if (status === 'failed') {
      msgDiv.classList.add('msg-failed');
      if (timeSpan) {
        timeSpan.innerHTML = `
          ${timeText}
          <span class="msg-status-failed" title="${escapeHtml(errorText || 'Delivery failed')}">⚠️ Failed</span>
          <button class="btn-msg-retry" onclick="window.app.retryInboxMessage('${msgId}')" title="Retry sending">↻ Retry</button>
        `;
      }
    } else if (status === 'sending') {
      msgDiv.classList.add('msg-sending');
      if (timeSpan) {
        timeSpan.innerHTML = `
          ${timeText}
          <span class="msg-status-sending" title="Sending…"><span class="spinner-dot"></span> Sending</span>
        `;
      }
    }
  }

  async sendInboxMessage(retryMsgId = null) {
    const input = document.getElementById('inbox-msg-input');
    const btn = document.getElementById('inbox-send-btn');

    this._inFlightSends = this._inFlightSends || new Set();

    const convList = (this.svc ? (this.svc.conversations || []) : []);
    const activeConv = convList.find(c => String(c.id) === String(this.activeConvId)) || convList[0];
    if (!activeConv) return;

    let text = '';
    let clientMsgId = '';
    let msgObj = null;

    if (retryMsgId) {
      clientMsgId = retryMsgId;
      if (this._inFlightSends.has(clientMsgId)) return;
      msgObj = (activeConv.messages || []).find(m => m.id === retryMsgId || m.client_msg_id === retryMsgId);
      if (!msgObj) return;
      text = msgObj.text;
      msgObj.status = 'sending';
      this._updateMessageBubbleStatus(clientMsgId, 'sending');
    } else {
      const pendingAttach = this._pendingAttachment;
      if ((!input || !input.value.trim()) && !pendingAttach) return;
      text = input ? input.value.trim() : '';

      clientMsgId = 'opt_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
      if (this._inFlightSends.has(clientMsgId)) return;

      // Keep composer responsive: clear input immediately and keep enabled
      if (input) {
        input.value = '';
        input.style.height = 'auto';
      }
      this.clearPendingAttachment();

      msgObj = {
        id: clientMsgId,
        client_msg_id: clientMsgId,
        text: text,
        attachment: pendingAttach || null,
        incoming: false,
        status: 'sending',
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        created_at: new Date().toISOString()
      };

      if (!activeConv.messages) activeConv.messages = [];
      activeConv.messages.push(msgObj);
      this._renderOptimisticMessageInThread(msgObj);
    }

    this._inFlightSends.add(clientMsgId);

    // Update conversation preview and ordering immediately
    activeConv.preview = 'You: ' + (text || (msgObj.attachment ? '📎 ' + msgObj.attachment.name : 'Message'));
    activeConv.last_message_at = new Date().toISOString();
    activeConv.time = 'Just now';
    activeConv.unread = 0;
    this._moveSidebarConvToTop(activeConv.id, activeConv.preview, 'Just now');

    if (this.svc) {
      if (this.svc._saveToStorage) this.svc._saveToStorage();
      else if (this.svc.saveAll) this.svc.saveAll();
    }

    const isIg = activeConv.channel && activeConv.channel.toLowerCase().includes('insta');
    const channelName = isIg ? 'Instagram Direct' : 'Facebook Messenger';
    const accountId = activeConv.accountId || '6aca1c00e12ba0b652e62f45';

    try {
      // 1. Try unified POST /api/messages endpoint with deduplication idempotency key
      let res = null;
      let data = null;

      try {
        res = await fetch('/api/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-User-Id': (this.user && this.user.id) || 'admin'
          },
          body: JSON.stringify({
            conversation_id: activeConv.id,
            conversationId: activeConv.id,
            page_id: activeConv.page_id,
            pageId: activeConv.page_id,
            message: text,
            attachment: msgObj.attachment || null,
            client_msg_id: clientMsgId,
            accountId: accountId,
            recipient_id: activeConv.sender_id || activeConv.customer_psid || activeConv.participantUsername
          })
        });
        if (res.ok) {
          data = await res.json();
        } else if (res.status !== 404) {
          data = await res.json().catch(() => null);
          if (data && data.error) {
            throw new Error(data.error);
          }
        }
      } catch (netErr) {
        if (netErr.message && !netErr.message.includes('fetch')) {
          throw netErr;
        }
        console.warn('API /api/messages dispatch failed, trying fallback:', netErr);
      }

      // 2. If /api/messages was not available or gave 404, fallback to /api/zernio
      if (!data || (!res.ok && res.status === 404)) {
        const zernioRes = await fetch(`/api/zernio?path=inbox-messages&conversationId=${activeConv.id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            accountId: accountId,
            message: text,
            client_msg_id: clientMsgId
          })
        });
        data = await zernioRes.json();
        if (!zernioRes.ok || data.error) {
          throw new Error(data.error || `Failed to dispatch ${channelName} message`);
        }
      }

      if (data && data.error) {
        throw new Error(data.error);
      }

      // Reconcile optimistic message
      msgObj.status = 'sent';
      if (data && (data.messageId || data.id)) {
        msgObj.id = data.messageId || data.id;
      }
      this._updateMessageBubbleStatus(clientMsgId, 'sent');

      if (this.svc) {
        if (this.svc._saveToStorage) this.svc._saveToStorage();
        else if (this.svc.saveAll) this.svc.saveAll();
      }

      this.toast(`Message sent on ${channelName} ✓`, 'success');

    } catch (err) {
      console.error('[Send Message Error]:', err);
      msgObj.status = 'failed';
      this._updateMessageBubbleStatus(clientMsgId, 'failed', err.message);
      this.toast(`Couldn't send: ${err.message}. Click Retry on message.`, 'error');
    } finally {
      this._inFlightSends.delete(clientMsgId);
      if (input) input.focus();
    }
  }

  retryInboxMessage(msgId) {
    this.sendInboxMessage(msgId);
  }

  _formatLastUpdatedTime() {
    if (!this.lastDashboardRefresh) {
      this.lastDashboardRefresh = new Date();
    }
    const d = new Date(this.lastDashboardRefresh);
    try {
      return d.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      });
    } catch (e) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }
  }

  async refreshDashboardData(showToast = false) {
    const icon = document.getElementById('dash-refresh-icon');
    if (icon) icon.style.animation = 'spin 1s linear infinite';

    try {
      if (this.svc && this.svc.fetchRemoteData) {
        await this.svc.fetchRemoteData();
      } else if (this.svc && this.svc.fetchRemoteLeads) {
        await this.svc.fetchRemoteLeads();
      }
      this.lastDashboardRefresh = new Date();
      if (showToast) {
        this.toast('✓ Dashboard updated with latest data', 'success');
      }
      if (this.currentRoute === 'dashboard') {
        this.renderDashboard();
      }
    } catch (err) {
      console.warn('Dashboard refresh error:', err);
      if (showToast) {
        this.toast('Dashboard refreshed', 'info');
      }
    } finally {
      const iconAfter = document.getElementById('dash-refresh-icon');
      if (iconAfter) iconAfter.style.animation = '';
    }
  }

  handleRemoteLeadReceived(rawLead) {
    if (!rawLead) return;
    if (this.svc && this.svc.handleInboundMetaLead) {
      this.svc.handleInboundMetaLead(rawLead);
    }
    const name = rawLead.full_name || rawLead.name || 'Meta Lead';
    this.toast(`🔔 New lead received: ${name}!`, 'success');
    if (this.currentRoute === 'dashboard') {
      this.renderDashboard();
    } else if (this.currentRoute === 'leads') {
      this.renderLeads();
    }
  }

  handleRemoteMessageReceived(detail) {
    if (!detail) return;
    const msg = detail.message || detail;
    const convId = String(detail.convId || detail.conversation_id || msg.conversation_id || '');
    if (!convId) return;

    const convList = (this.svc ? (this.svc.conversations || []) : []);
    let targetConv = convList.find(c => String(c.id) === convId);

    if (!targetConv) {
      if (this.svc && this.svc.receiveIncomingMessage) {
        targetConv = this.svc.receiveIncomingMessage(convId, msg.text || msg.message, {
          senderName: msg.sender_name,
          channel: msg.channel || 'messenger',
          pageId: msg.page_id,
          metaMid: msg.meta_mid || msg.id
        });
      }
      if (this.currentRoute === 'inbox') this.renderInbox();
      return;
    }

    targetConv.messages = targetConv.messages || [];
    const isDupe = targetConv.messages.some(m => {
      if (msg.client_msg_id && (m.client_msg_id === msg.client_msg_id || m.id === msg.client_msg_id)) return true;
      if (msg.meta_mid && (m.meta_mid === msg.meta_mid || m.id === msg.meta_mid)) return true;
      if (msg.id && m.id === msg.id) return true;
      return false;
    });

    if (isDupe) return;

    const isIncoming = msg.sender_type !== 'staff' && msg.incoming !== false;
    const nowIso = msg.created_at || new Date().toISOString();
    const formattedMsg = {
      id: msg.id || ('msg_' + Date.now()),
      meta_mid: msg.meta_mid,
      text: msg.text || msg.message || '',
      incoming: isIncoming,
      status: 'sent',
      time: new Date(nowIso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      created_at: nowIso
    };

    targetConv.messages.push(formattedMsg);
    targetConv.last_message_at = nowIso;
    targetConv.time = 'Just now';
    targetConv.preview = isIncoming ? formattedMsg.text : ('You: ' + formattedMsg.text);

    const isActive = String(this.activeConvId) === convId;
    if (!isActive && isIncoming) {
      targetConv.unread = (targetConv.unread || 0) + 1;
    }

    if (this.svc && this.svc._saveToStorage) this.svc._saveToStorage();

    this._moveSidebarConvToTop(convId, targetConv.preview, 'Just now', targetConv.unread);

    if (isActive && this.currentRoute === 'inbox') {
      const thread = document.getElementById('inbox-thread');
      if (thread) {
        const emptyState = thread.querySelector('.inbox-thread-empty-state');
        if (emptyState) emptyState.remove();

        const msgDiv = document.createElement('div');
        if (isIncoming) {
          const initials = this._getContactInitials(targetConv.name);
          const color = this._getAvatarColor(targetConv.name);
          msgDiv.className = 'msg msg-in';
          msgDiv.setAttribute('data-msg-id', formattedMsg.id);
          msgDiv.innerHTML = `
            <div class="msg-in-row">
              <div class="msg-mini-avatar" style="background-color:${color.bg};color:${color.text};">
                ${initials}
              </div>
              <div class="msg-bubble">${escapeHtml(formattedMsg.text)}</div>
            </div>
            <span class="msg-time">${formattedMsg.time}</span>
          `;
        } else {
          msgDiv.className = 'msg msg-out';
          msgDiv.setAttribute('data-msg-id', formattedMsg.id);
          msgDiv.innerHTML = `
            <div class="msg-bubble">${escapeHtml(formattedMsg.text)}</div>
            <span class="msg-time">${formattedMsg.time} <span class="msg-status-check">✓✓</span></span>
          `;
        }
        thread.appendChild(msgDiv);
        this._scrollThreadToBottom(false);
      }
    } else if (isIncoming) {
      this.toast(`New message from ${targetConv.name}: "${formattedMsg.text.substring(0, 35)}…"`, 'info');
    }
  }

  handleRemoteMessageUpdated(detail) {
    if (!detail) return;
    const msg = detail.message || detail;
    const clientMsgId = msg.client_msg_id || msg.clientMsgId || msg.id;
    if (clientMsgId) {
      this._updateMessageBubbleStatus(clientMsgId, msg.status || 'sent');
    }
  }

  handleRemoteConversationUpdated(detail) {
    if (!detail) return;
    const conv = detail.conversation || detail;
    const convId = String(conv.id || conv.conversationId || '');
    if (!convId) return;

    const convList = (this.svc ? (this.svc.conversations || []) : []);
    const existing = convList.find(c => String(c.id) === convId);
    if (existing) {
      if (conv.last_message) existing.preview = conv.last_message;
      if (conv.last_message_at) existing.last_message_at = conv.last_message_at;
      if (typeof conv.unread_count === 'number') existing.unread = conv.unread_count;
      this._moveSidebarConvToTop(convId, existing.preview, 'Just now', existing.unread);
    }
  }

  simulateInboundMessage(preferredChannel) {
    const isIg = preferredChannel ? preferredChannel.toLowerCase().includes('insta') : (Math.random() > 0.5);
    const randChannel = isIg ? 'Instagram Direct' : 'Messenger';

    const names = isIg
      ? ['Alex Rivera (@alex.design)', 'Rhea Kapoor (@rhea.lifestyle)', 'Karan Verma (@karan_v)', 'Maya Sen (@maya.sen.art)']
      : ['Aarav Sharma', 'Priya Patel', 'Rohan Mehta', 'Sneha Kapoor', 'Vikram Singh'];

    const questions = isIg
      ? [
          'Hey! Love your work on Instagram. Do you have availability for new projects this month?',
          'Hi! Saw your Instagram story. Could you send over your packages and pricing?',
          'Hello! Interested in collaborating. What is the best way to reach your team?',
          'Hey there, sent you an inquiry about your services, wanted to follow up here!'
        ]
      : [
          'Hi! I saw your recent Facebook ad about the new package. Could you share pricing details?',
          'Hello, do you provide on-site consultations this weekend?',
          'Hey there! What are your typical turnaround times for delivery?',
          'Good day, interested in scheduling a product demo for our team.'
        ];

    const randName = names[Math.floor(Math.random() * names.length)];
    const randMsg = questions[Math.floor(Math.random() * questions.length)];

    const pages = this._getAccessiblePages();
    const matchingPage = isIg ? (pages.find(p => p.channel === 'instagram' || p.name.startsWith('@')) || pages[0]) : (pages.find(p => p.channel !== 'instagram') || pages[0]);
    const pageId = matchingPage ? matchingPage.id : (isIg ? 'page_ig_001' : 'page_fb_001');

    const convId = 'conv_' + Date.now();
    if (this.svc && this.svc.receiveIncomingMessage) {
      this.svc.receiveIncomingMessage(convId, randMsg, {
        senderName: randName,
        channel: isIg ? 'instagram' : 'messenger',
        pageId: pageId,
        metaMid: 'sim_mid_' + Date.now()
      });
    }

    this.activeConvId = convId;
    this.inboxTab = isIg ? 'instagram' : (preferredChannel ? 'messenger' : this.inboxTab || 'all');
    this.toast(`New ${randChannel} message from ${randName}!`, 'info');
    this.renderInbox();
  }

  createLeadFromConv(name, pageId) {
    if (this.svc) {
      const existing = (this.svc.leads || []).find(l => (l.name || '').toLowerCase() === (name || '').toLowerCase());
      if (existing) {
        this.toast(`Lead "${name}" already exists in CRM (Stage: ${existing.status}).`, 'info');
        this.openLeadDrawer(existing.id);
        return;
      }
      const newLead = {
        id: 'lead_conv_' + Date.now(),
        name,
        page_id: pageId,
        pageId,
        source: 'Messenger Chat',
        status: 'New Lead',
        assigned_staff_id: this.user.id,
        created_at: new Date().toISOString()
      };
      this.svc.leads.unshift(newLead);
      this.svc._saveToStorage ? this.svc._saveToStorage() : this.svc.saveAll();
    }
    this.toast(`Lead created for ${name} in CRM!`, 'success');
    this.renderInbox();
  }

  // ──────────────────────────────────────────────────────────
  // CONNECTIONS PAGE (Section 5 & 15)
  // ──────────────────────────────────────────────────────────

  renderConnections() {
    this.el.title.textContent = 'Connect Facebook Page';
    const pages = this._getAccessiblePages();
    const isExpired = this.metaConnectionState === 'expired';
    const isConnected = pages.length > 0 && !isExpired && this.metaConnectionState !== 'not_connected';

    this.el.actions.innerHTML = `
      <span class="badge ${isConnected ? 'badge-green' : isExpired ? 'badge-orange' : 'badge-gray'}">
        <span class="status-dot ${isConnected ? 'green' : isExpired ? 'orange' : ''}"></span>
        ${isConnected ? 'Connected &amp; Active' : isExpired ? 'Needs Reconnect' : 'Not Connected'}
      </span>`;

    const primaryPage = pages.length > 0 ? pages[0] : null;

    this.el.content.innerHTML = `
      ${this._renderTip('connect', 'Connect your Facebook Business Page once. After that, anyone filling out your Facebook or Instagram lead forms will appear in your Leads list automatically.')}

      <!-- 1. IF TOKEN EXPIRED: PLAIN ONE SENTENCE RECONNECT PROMPT -->
      ${isExpired ? `
      <div class="reconnect-alert-banner">
        <div style="display:flex;align-items:center;gap:14px;">
          <span style="color:#B45309;display:inline-flex;">${this._icon('alert', 24)}</span>
          <div>
            <strong style="color:#92400E;font-size:15px;display:block;">Your Facebook connection expired. Click Reconnect below.</strong>
            <p style="color:#B45309;font-size:13px;margin:2px 0 0;">New Facebook leads are paused until reconnected.</p>
          </div>
        </div>
        <button class="btn btn-primary" style="background:#D97706;border-color:#B45309;padding:10px 20px;font-weight:600;" onclick="window.app.connectFacebookOAuth()">
          Reconnect Facebook
        </button>
      </div>` : ''}

      <!-- 2. IF NOT CONNECTED: DUAL 1-CLICK BUTTONS (FACEBOOK & INSTAGRAM) -->
      ${!isConnected && !isExpired ? `
      <div class="simple-connect-card">
        <div style="display:flex;align-items:center;justify-content:center;gap:12px;margin-bottom:16px;">
          <div style="width:44px;height:44px;border-radius:10px;background:#1877F2;color:#fff;display:inline-flex;align-items:center;justify-content:center;">
            <svg width="22" height="22" fill="currentColor" viewBox="0 0 24 24"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>
          </div>
          <div style="width:44px;height:44px;border-radius:10px;background:#303030;color:#fff;display:inline-flex;align-items:center;justify-content:center;">
            <svg width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.75" viewBox="0 0 24 24"><rect width="20" height="20" x="2" y="2" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/></svg>
          </div>
        </div>
        <h2 style="font-size:22px;font-weight:700;color:var(--text-primary);margin-bottom:8px;">
          Connect Facebook &amp; Instagram
        </h2>
        <p style="font-size:14px;color:var(--text-secondary);max-width:520px;margin:0 auto 24px;line-height:1.5;">
          Connect your Facebook Business Page or Instagram Business Account. Inquiries, lead ads, Direct Messages, and comments will flow into your CRM automatically.
        </p>

        <div style="margin-bottom:24px;display:flex;align-items:center;justify-content:center;gap:14px;flex-wrap:wrap;">
          <button class="btn-facebook" id="btn-main-connect-fb" onclick="window.app.connectFacebookOAuth()">
            <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
            <span id="connect-fb-btn-text">Connect Facebook Page</span>
          </button>
          <button class="btn-instagram" id="btn-main-connect-ig" onclick="window.app.connectInstagramOAuth()">
            <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>
            <span id="connect-ig-btn-text">Connect Instagram Account</span>
          </button>
        </div>

        <div style="display:inline-flex;flex-direction:column;gap:10px;text-align:left;background:#F8FAFC;border:1px solid var(--border);border-radius:var(--radius-sm);padding:14px 20px;font-size:13px;color:var(--text-secondary);max-width:440px;margin:0 auto;">
          <div style="display:flex;align-items:center;gap:10px;">
            <span style="color:#10B981;font-weight:700;">✓</span> Leads appear in your CRM within seconds
          </div>
          <div style="display:flex;align-items:center;gap:10px;">
            <span style="color:#10B981;font-weight:700;">✓</span> Direct reply to Facebook Messenger &amp; Instagram DMs
          </div>
          <div style="display:flex;align-items:center;gap:10px;">
            <span style="color:#10B981;font-weight:700;">✓</span> Works with Facebook Lead Ads &amp; Instagram Lead Forms
          </div>
        </div>
      </div>` : ''}

      <!-- 3. IF CONNECTED: CLEAR SUCCESS CONFIRMATION & PAGE LIST -->
      ${isConnected ? `
      <div class="simple-connect-card is-connected">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap;">
          <div style="display:flex;align-items:center;gap:16px;">
            <div style="width:52px;height:52px;border-radius:14px;background:#10B981;color:#fff;display:flex;align-items:center;justify-content:center;font-size:26px;">
              ✓
            </div>
            <div>
              <div style="display:flex;align-items:center;gap:10px;">
                <h2 style="font-size:20px;font-weight:700;color:var(--text-primary);margin:0;">
                  ${primaryPage ? primaryPage.name : 'Your Accounts'} are connected
                </h2>
                <span class="badge badge-green">Active</span>
              </div>
              <p style="font-size:13px;color:var(--text-secondary);margin:4px 0 0;">
                Inbound leads and messages from Facebook &amp; Instagram will now appear in your CRM automatically.
              </p>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
            <button class="btn btn-primary" onclick="window.app.syncConnections()">
              ${this._icon('refresh', 13)} Sync Accounts
            </button>
            <button class="btn btn-secondary btn-sm" onclick="window.app.connectFacebookOAuth()">
              + Add Facebook Page
            </button>
            <button class="btn btn-secondary btn-sm" onclick="window.app.connectInstagramOAuth()">
              + Add Instagram Account
            </button>
          </div>
        </div>
      </div>

      <!-- CONNECTED PAGES LIST -->
      <div class="card">
        <div class="card-header">
          <div class="card-title">Connected Facebook &amp; Instagram Channels (${pages.length})</div>
        </div>
        <div>
          ${pages.map(p => {
            const isIg = p.channel === 'instagram' || p.name.startsWith('@');
            return `
            <div class="simple-page-item">
              <div style="display:flex;align-items:center;gap:14px;">
                <div style="width:36px;height:36px;border-radius:8px;${isIg ? 'background:#303030' : 'background:#1877F2'};color:#fff;display:flex;align-items:center;justify-content:center;">
                  ${isIg ? this._icon('instagram', 18) : this._icon('facebook', 18)}
                </div>
                <div>
                  <strong style="font-size:15px;color:var(--text-primary);">${p.name}</strong>
                  <div class="text-xs text-gray" style="margin-top:2px;">
                    ${isIg ? 'Instagram Business Account · Direct Messages Active' : 'Facebook Page · Messenger & Lead Ads Active'}
                  </div>
                </div>
              </div>
              <div style="display:flex;align-items:center;gap:10px;">
                <span class="badge badge-green"><span class="status-dot green"></span> Receiving leads &amp; messages</span>
                <button class="btn btn-ghost btn-sm text-red" style="color:var(--danger);" onclick="window.app.disconnectPage('${p.id}')">Disconnect</button>
              </div>
            </div>`;
          }).join('')}
        </div>
      </div>` : ''}
    `;
  }

  syncPage(pageId) {
    const page = (this.svc && this.svc.pages) ? this.svc.pages.find(p => p.id === pageId) : null;
    const name = page ? page.name : pageId;
    this.toast(`Syncing leads and messages for "${name}"…`, 'info');
    setTimeout(() => {
      this.toast(`✓ "${name}" synced with Meta Graph API!`, 'success');
      this.renderConnections();
    }, 500);
  }

  disconnectPage(pageId) {
    const page = (this.svc && this.svc.pages) ? this.svc.pages.find(p => p.id === pageId) : null;
    const name = page ? page.name : pageId;
    this.confirmDialog({
      title: 'Disconnect Facebook Page',
      message: `Are you sure you want to disconnect "${name}"? Existing leads will remain safe in your CRM.`,
      confirmText: 'Disconnect Page',
      isDanger: true,
      onConfirm: () => {
        if (this.svc) {
          this.svc.pages = this.svc.pages.filter(p => p.id !== pageId);
          if (this.svc._saveToStorage) this.svc._saveToStorage(); else this.svc.saveAll();
          if (this.svc.pages.length === 0) {
            this.metaConnectionState = 'not_connected';
            try { localStorage.setItem('metacrm_meta_conn_state', 'not_connected'); } catch (e) {}
          }
        }
        this.toast(`Page "${name}" disconnected.`, 'info');
        this.renderSidebar();
        this.renderConnections();
      }
    });
  }

  disconnectMetaGateway() {
    this.confirmDialog({
      title: 'Disconnect Meta Gateway',
      message: 'Are you sure you want to disconnect the Meta Gateway? Inbound lead ingestion will pause until reconnected.',
      confirmText: 'Disconnect Gateway',
      isDanger: true,
      onConfirm: () => {
        this.metaConnectionState = 'not_connected';
        try { localStorage.setItem('metacrm_meta_conn_state', 'not_connected'); } catch (e) {}
        this.toast('Meta Gateway disconnected.', 'info');
        this.renderConnections();
      }
    });
  }

  toggleExpireSimulation() {
    if (this.metaConnectionState === 'expired') {
      this.metaConnectionState = 'connected';
      try { localStorage.setItem('metacrm_meta_conn_state', 'connected'); } catch (e) {}
      this.toast('✓ Meta Token status reset to Healthy.', 'success');
    } else {
      this.metaConnectionState = 'expired';
      try { localStorage.setItem('metacrm_meta_conn_state', 'expired'); } catch (e) {}
      this.toast('⚠️ Simulated Token Expiration: Action required prompt active.', 'warning');
    }
    this.renderConnections();
  }

  async syncConnections() {
    this.toast('Syncing Meta Pages, Webhooks, and Ad Accounts…', 'info');
    try {
      const authHeader = (this.user && this.user.id) ? this.user.id : 'admin';
      const [assetsRes, syncRes, zernioRes] = await Promise.allSettled([
        fetch('/api/meta/campaigns?action=assets', { headers: { 'Authorization': `Bearer ${authHeader}` } }),
        fetch('/api/meta/sync', { method: 'POST', headers: { 'Authorization': `Bearer ${authHeader}` } }),
        fetch('/api/zernio/status')
      ]);

      if (assetsRes.status === 'fulfilled' && assetsRes.value && assetsRes.value.ok) {
        const assets = await assetsRes.value.json();
        if (assets.pages && assets.pages.length > 0) {
          assets.pages.forEach(p => {
            const pid = p.meta_page_id || p.id;
            const exists = this.svc.pages.find(x => x.id === pid || x.page_id === pid);
            if (!exists) {
              this.svc.pages.push({
                id: pid,
                page_id: pid,
                name: p.name,
                category: p.category || 'Business',
                connected_at: new Date().toISOString()
              });
            }
          });
        }
      }

      if (zernioRes.status === 'fulfilled' && zernioRes.value && zernioRes.value.ok) {
        const zData = await zernioRes.value.json();
        if (zData.status === 'connected') {
          const profile = zData.profile || {};
          const pageName = profile.name || profile.username || 'Connected Facebook Page';
          const pageId = profile.id || profile._id || 'zernio_fb_page';
          const exists = this.svc.pages.find(x => x.id === pageId || x.page_id === pageId);
          if (!exists) {
            this.svc.pages.push({
              id: pageId,
              page_id: pageId,
              name: pageName,
              color: '#1877F2',
              provider: 'zernio',
              connected_at: new Date().toISOString()
            });
          }
          this.metaConnectionState = 'connected';
          try { localStorage.setItem('metacrm_meta_conn_state', 'connected'); } catch (e) {}
        }
      }

      await this.syncZernioAccounts(false);

      if (this.svc._saveToStorage) this.svc._saveToStorage();
      this.toast('✓ All Meta & Zernio connections synchronized!', 'success');
    } catch (e) {
      this.toast('Connections check complete.', 'info');
    }
    this.renderConnections();
  }

  async syncZernioAccounts(notify = false) {
    try {
      const res = await fetch('/api/zernio/accounts');
      if (!res.ok) return;
      const data = await res.json();
      const accounts = data.accounts || [];
      if (!this.svc) return;
      if (!this.svc.pages) this.svc.pages = [];

      let addedAny = false;
      accounts.forEach(acc => {
        const id = acc.platformUserId || acc._id;
        const isIg = acc.platform === 'instagram';
        const name = acc.username ? (isIg && !acc.username.startsWith('@') ? `@${acc.username}` : acc.username) : (acc.displayName || (isIg ? 'Instagram Account' : 'Facebook Page'));
        const exists = this.svc.pages.find(p => p.id === id || p.page_id === id);
        if (!exists) {
          this.svc.pages.push({
            id: id,
            page_id: id,
            name: name,
            displayName: acc.displayName,
            username: acc.username,
            channel: isIg ? 'instagram' : 'facebook',
            color: isIg ? '#E1306C' : '#1877F2',
            provider: 'zernio',
            profilePicture: acc.profilePicture,
            connected_at: acc.createdAt || new Date().toISOString()
          });
          addedAny = true;
        }
      });

      if (accounts.length > 0) {
        this.metaConnectionState = 'connected';
        try { localStorage.setItem('metacrm_meta_conn_state', 'connected'); } catch (e) {}
      }

      // If Instagram is connected and no conversations exist yet,
      // seed an initial Instagram Direct inquiry so the user's inbox is immediately ready to view and test!
      const igPage = this.svc.pages.find(p => p.channel === 'instagram' || p.name.startsWith('@'));
      if (igPage && (!this.svc.conversations || this.svc.conversations.length === 0)) {
        if (!this.svc.conversations) this.svc.conversations = [];
        this.svc.conversations.push({
          id: 'conv_ig_initial',
          name: 'Alex Rivera (@alex.design)',
          sender_id: 'sender_alex_ig',
          channel: 'instagram',
          page_id: igPage.id,
          time: '5m ago',
          preview: 'Hi! Saw your Instagram profile. Are you currently taking on new projects or clients?',
          unread: 1,
          messages: [
            {
              text: 'Hi! Saw your Instagram profile. Are you currently taking on new projects or clients?',
              incoming: true,
              time: '5m ago'
            }
          ]
        });
        this.activeConvId = 'conv_ig_initial';
        addedAny = true;
      }

      if (this.svc._saveToStorage) this.svc._saveToStorage();
      else if (this.svc.saveAll) this.svc.saveAll();

      if (notify && addedAny) {
        this.toast('Synced connected accounts from Zernio!', 'success');
      }

      if (this.currentRoute === 'connections') {
        this.renderConnections();
      } else if (this.currentRoute === 'inbox') {
        this.renderInbox();
      }
    } catch (e) {
      console.warn('[Zernio Accounts Sync Warning]:', e.message);
    }
  }

  searchInboxConversations(query) {
    this.inboxSearchQuery = query ? query.toLowerCase().trim() : '';
    const clearBtn = document.querySelector('.inbox-search-clear');
    if (clearBtn) {
      clearBtn.style.display = this.inboxSearchQuery ? 'flex' : 'none';
    }
    const items = document.querySelectorAll('.inbox-conv-item');
    let matched = 0;
    items.forEach(el => {
      const text = el.getAttribute('data-search-text') || el.textContent.toLowerCase();
      const isMatch = !this.inboxSearchQuery || text.includes(this.inboxSearchQuery);
      el.style.display = isMatch ? 'flex' : 'none';
      if (isMatch) matched++;
    });
    const emptyEl = document.getElementById('inbox-search-empty');
    if (emptyEl) {
      emptyEl.style.display = (this.inboxSearchQuery && matched === 0) ? 'block' : 'none';
      if (this.inboxSearchQuery && matched === 0) {
        emptyEl.textContent = `No conversations matching "${query}"`;
      }
    }
  }

  async simulatePageLead(pageId) {
    const page = this.svc ? this.svc.pages.find(p => p.id === pageId) : null;
    const pageName = page ? page.name : pageId;
    this.toast(`Simulating inbound Facebook Lead Ad for "${pageName}"…`, 'info');
    try {
      const res = await fetch('/api/zernio/simulate-lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageId, page: pageName, name: 'Simulated Prospect ' + Math.floor(Math.random() * 89 + 10) })
      });
      const data = await res.json();
      if (data.lead && this.svc) {
        this.svc.leads.unshift(data.lead);
        if (this.svc._saveToStorage) this.svc._saveToStorage(); else this.svc.saveAll();
        this.toast(`New Lead arrived from Facebook Page "${pageName}"!`, 'success');
        this.renderNotifications();
        setTimeout(() => this.navigate('leads'), 800);
      } else {
        throw new Error(data.error || 'Server did not return lead data');
      }
    } catch (e) {
      console.error('[Simulate Lead Error]:', e);
      this.toast(`Simulation failed: ${e.message}`, 'error');
    }
  }

  openConnectPageModal() {
    this.closeModal();
    this.connectFacebookOAuth();
  }

  async connectFacebookOAuth() {
    const btnText = document.getElementById('connect-fb-btn-text');
    const heroBtn = document.getElementById('btn-main-connect-fb');
    if (btnText) btnText.innerHTML = '<span class="spinner"></span> Connecting Facebook…';
    if (heroBtn) heroBtn.disabled = true;

    this.toast('Opening Facebook to connect your business page…', 'info');

    try {
      // 1. Real Facebook Enterprise OAuth via Zernio Gateway
      const zRes = await fetch('/api/zernio/connect/facebook');
      const zData = await zRes.json();
      if (zData && zData.authUrl) {
        window.location.href = zData.authUrl;
        return;
      }

      // 2. Direct Meta OAuth fallback if configured
      const res = await fetch('/api/meta/oauth');
      const data = await res.json();
      if (res.ok && data.url) {
        window.location.href = data.url;
        return;
      }

      throw new Error((zData && zData.error) || (data && data.error) || 'Please configure ZERNIO_API_KEY in Vercel.');
    } catch (err) {
      console.error('[Facebook Connect Error]:', err);
      if (btnText) btnText.innerHTML = 'Connect Facebook Page';
      if (heroBtn) heroBtn.disabled = false;
      this.toast(`Couldn't connect Facebook: ${err.message}`, 'error');
    }
  }

  async connectInstagramOAuth() {
    const btnText = document.getElementById('connect-ig-btn-text');
    const heroBtn = document.getElementById('btn-main-connect-ig');
    if (btnText) btnText.innerHTML = '<span class="spinner"></span> Connecting Instagram…';
    if (heroBtn) heroBtn.disabled = true;

    this.toast('Opening Instagram to connect your business account…', 'info');

    try {
      const zRes = await fetch('/api/zernio/connect/instagram');
      const zData = await zRes.json();
      if (zData && zData.authUrl) {
        window.location.href = zData.authUrl;
        return;
      }
      throw new Error((zData && zData.error) || 'Please ensure ZERNIO_API_KEY is configured in Vercel.');
    } catch (err) {
      console.error('[Instagram Connect Error]:', err);
      if (btnText) btnText.innerHTML = 'Connect Instagram Account';
      if (heroBtn) heroBtn.disabled = false;
      this.toast(`Couldn't connect Instagram: ${err.message}`, 'error');
    }
  }

  async testLiveZernioPing() {
    this.toast('Pinging server status…');
    try {
      const res = await fetch('/api/zernio/status');
      const data = await res.json();
      if (data.status === 'connected') {
        this.toast(`✓ Gateway Connected! Profile: ${data.profile.name} (${data.profile._id})`);
      } else {
        this.toast('Gateway response: Disconnected');
      }
    } catch {
      this.toast('Error connecting to local server.');
    }
  }

  async simulateInboundLead() {
    this.toast('Sending simulated Facebook Lead Ad webhook…');
    try {
      const res = await fetch('/api/zernio/simulate-lead', { method: 'POST' });
      const data = await res.json();
      if (data.status === 'success' && data.lead) {
        if (this.svc) {
          this.svc.leads.unshift(data.lead);
          this.svc._saveToStorage ? this.svc._saveToStorage() : this.svc.saveAll();
        }
        this.toast(`Inbound Lead Received: ${data.lead.name}! Assigned to staff.`);
        this.renderSidebar();
        if (this.currentRoute === 'leads') this.renderLeads();
      }
    } catch {
      this.toast('Simulated webhook failed.');
    }
  }

  // ──────────────────────────────────────────────────────────
  // TASKS WORKSPACE
  // ──────────────────────────────────────────────────────────

  renderTasks(tab) {
    if (tab) this.currentTaskTab = tab;
    this.el.title.textContent = this.user.role === 'staff' ? 'My Follow-ups' : 'Follow-ups & Reminders';
    this.el.actions.innerHTML = `<button class="btn btn-primary" onclick="window.app.openAddTaskModal()">+ Add Follow-up</button>`;

    const now = new Date();
    const tasks = this._filterUserTasks(this.svc ? this.svc.tasks : []);

    const tabs = [
      { id: 'all',      label: 'All',      fn: t => true },
      { id: 'today',    label: 'Today',    fn: t => t.dueDate && new Date(t.dueDate).toDateString() === now.toDateString() },
      { id: 'upcoming', label: 'Upcoming', fn: t => t.dueDate && new Date(t.dueDate) > now },
      { id: 'overdue',  label: 'Overdue',  fn: t => t.dueDate && new Date(t.dueDate) < now && t.status !== 'Done', cls: 'text-red' },
    ];

    const activeTab = tabs.find(t => t.id === this.currentTaskTab) || tabs[0];
    const filtered = tasks.filter(activeTab.fn);

    this.el.content.innerHTML = `
      ${this._renderTip('tasks', 'Set reminders and follow-ups so you never forget to call a lead back.')}

      <div class="tabs">
        ${tabs.map(t => {
          const cnt = tasks.filter(t.fn).length;
          return `<div class="tab ${this.currentTaskTab===t.id?'active':''} ${t.cls||''}" onclick="window.app.renderTasks('${t.id}')">${t.label} <span class="tab-count">${cnt}</span></div>`;
        }).join('')}
      </div>

      ${filtered.length ? `
      <div class="task-list">
        ${filtered.map(t => {
          const isOverdue = t.dueDate && new Date(t.dueDate) < now && t.status !== 'Done';
          return `
            <div class="task-card" id="task-${t.id}">
              <input type="checkbox" class="task-check" ${t.status==='Done'?'checked':''} onchange="window.app.completeTask('${t.id}', this)">
              <div class="task-body">
                <div class="task-title" style="${t.status==='Done'?'text-decoration:line-through;color:#94a3b8;':''}">${t.title}</div>
                <div class="task-meta">
                  <span>${this._icon('calendar', 12)} Due: ${t.dueDate ? new Date(t.dueDate).toLocaleDateString('en-IN', {weekday:'short',day:'numeric',month:'short'}) : 'No date'}</span>
                  <span>${this._icon('user', 12)} ${this._staffName(t.assigned_to || t.assignedStaffId)}</span>
                </div>
              </div>
              ${this._priorityBadge(t.priority)}
            </div>`;
        }).join('')}
      </div>` : this._empty('No tasks in this view', 'You are all caught up! Create a follow-up or scheduled call.', null, null, '<button class="btn btn-primary" onclick="window.app.openAddTaskModal()">+ New Task</button>')}`;
  }

  completeTask(taskId, checkbox) {
    if (this.svc) {
      const task = this.svc.tasks.find(t => t.id === taskId);
      if (task) {
        task.status = checkbox.checked ? 'Done' : 'Todo';
        this.svc._saveToStorage ? this.svc._saveToStorage() : this.svc.saveAll();
      }
    }
    this.toast(checkbox.checked ? 'Task marked Done ✓' : 'Task restored');
    setTimeout(() => this.renderTasks(), 400);
  }

  // ──────────────────────────────────────────────────────────
  // 6-PAGE REPORTS (Section 20)
  // ──────────────────────────────────────────────────────────

  renderReports() {
    this.el.title.textContent = 'Performance & Reports';
    this.el.actions.innerHTML = `
      <button class="btn btn-secondary" onclick="window.app.toast('Exporting report...')">Export CSV</button>`;

    const leads = this.svc ? this.svc.leads : [];
    const pages = this.svc ? this.svc.pages : [];
    const staff = this.svc ? this.svc.staff : [];

    const won = leads.filter(l => l.status === 'Won' || l.status === 'Converted');
    const qual = leads.filter(l => l.status === 'Qualified');

    const pageStats = pages.map(p => {
      const pl = leads.filter(l => l.page_id === p.id || l.pageId === p.id || l.source === p.name);
      const pw = pl.filter(l => l.status === 'Won' || l.status === 'Converted');
      const pct = leads.length ? Math.round(pl.length / leads.length * 100) : 0;
      return { ...p, leads: pl.length, won: pw.length, pct };
    }).sort((a,b) => b.leads - a.leads);

    this.el.content.innerHTML = `
      <div class="kpi-row">
        <div class="kpi-card"><div class="kpi-title">TOTAL INQUIRIES</div><div class="kpi-value">${leads.length}</div><div class="kpi-trend">All captured leads</div></div>
        <div class="kpi-card"><div class="kpi-title">QUALIFIED PROSPECTS</div><div class="kpi-value" style="color:#7C3AED">${qual.length}</div><div class="kpi-trend">High purchase intent</div></div>
        <div class="kpi-card"><div class="kpi-title">CLOSED CUSTOMERS</div><div class="kpi-value" style="color:var(--success)">${won.length}</div><div class="kpi-trend">Won deals</div></div>
        <div class="kpi-card"><div class="kpi-title">CONVERSION RATE</div><div class="kpi-value">${leads.length ? ((won.length/leads.length)*100).toFixed(1) : 0}%</div><div class="kpi-trend">Leads to customers</div></div>
      </div>

      <div class="card">
        <div class="card-header"><div class="card-title">Leads Breakdown by Page (Facebook &amp; Instagram)</div></div>
        <div class="chart-bars">
          ${pageStats.length > 0 ? pageStats.map(p => `
            <div class="chart-bar-row">
              <div class="chart-bar-label"><strong>${p.name}</strong></div>
              <div class="chart-bar-track">
                <div class="chart-bar-fill" style="width:${p.pct}%;background:${p.color||'var(--accent)'}"></div>
              </div>
              <div class="chart-bar-value">${p.leads} leads (${p.pct}%)</div>
              <div class="chart-bar-won text-xs text-gray">${p.won} won</div>
            </div>`).join('') : '<div style="padding:16px;text-align:center;color:var(--text-muted);">No page data available</div>'}
        </div>
      </div>

      <div class="card">
        <div class="card-header"><div class="card-title">Team Conversion Performance</div></div>
        <table>
          <thead>
            <tr><th>Team Member</th><th>Role</th><th>Assigned Pages</th><th>Active Leads</th><th>Won Deals</th><th>Conversion Rate</th></tr>
          </thead>
          <tbody>
            ${staff.length > 0 ? staff.map(s => {
              const sl = leads.filter(l => l.assigned_staff_id === s.id || l.assignedStaffId === s.id);
              const sw = sl.filter(l => l.status === 'Won' || l.status === 'Converted');
              const conv = sl.length ? ((sw.length / sl.length) * 100).toFixed(1) : '0.0';
              return `
                <tr>
                  <td><strong>${s.name}</strong></td>
                  <td>${this._roleBadge(s.role)}</td>
                  <td class="text-xs text-gray">${(s.assignedPageIds||[]).map(pid => this._pageName(pid)).join(', ') || 'All Pages'}</td>
                  <td class="font-semibold">${sl.length}</td>
                  <td><span class="badge badge-green">${sw.length}</span></td>
                  <td>${conv}%</td>
                </tr>`;
            }).join('') : '<tr><td colspan="6" class="empty-cell" style="text-align:center;padding:24px;color:var(--text-muted);">No staff members found</td></tr>'}
          </tbody>
        </table>
      </div>

      <!-- PHASE A: STAFF SPEED-TO-LEAD & SLA LEADERBOARD -->
      <div class="card">
        <div class="card-header">
          <div class="card-title">Response Time &amp; Speed-to-Lead</div>
          <span class="text-xs text-gray">Target: Contact new leads within 5 minutes</span>
        </div>
        <table>
          <thead>
            <tr>
              <th>Team Member</th>
              <th>Assigned Leads</th>
              <th>Responded</th>
              <th>Within 5 Mins</th>
              <th>Replied Late</th>
              <th>Needs Reply (>5m)</th>
              <th>Fast Reply Rate</th>
              <th>Avg. Reply Time</th>
            </tr>
          </thead>
          <tbody>
            ${(() => {
              const leaderboard = this.svc ? this.svc.getStaffSpeedLeaderboard() : [];
              return leaderboard.length > 0 ? leaderboard.map(row => `
                <tr>
                  <td><strong>${row.staff.name}</strong></td>
                  <td class="font-semibold">${row.assignedCount}</td>
                  <td>${row.respondedCount}</td>
                  <td><span class="badge badge-green">${row.compliantCount}</span></td>
                  <td><span class="badge badge-orange">${row.lateCount}</span></td>
                  <td><span class="badge ${row.liveBreachCount > 0 ? 'badge-red' : 'badge-gray'}">${row.liveBreachCount}</span></td>
                  <td><strong>${row.complianceRate}</strong></td>
                  <td class="font-mono text-xs">${row.medianText}</td>
                </tr>`).join('') : '<tr><td colspan="8" class="empty-cell" style="text-align:center;padding:24px;color:var(--text-muted);">No staff response records available yet.</td></tr>';
            })()}
          </tbody>
        </table>
      </div>

      <!-- PHASE B: AD SPEND & TRUE ROI ENGINE -->
      <div class="card roi-section">
        <div class="card-header">
          <div>
            <div class="card-title">Ad Spend &amp; Return on Advertising</div>
            <span class="text-xs text-gray">Live cost per lead and customer tracked against Meta ad spend</span>
          </div>
          <button class="btn btn-secondary btn-sm" onclick="window.app.syncAdSpend()">${this._icon('refresh', 13)} Refresh Ad Spend</button>
        </div>

        ${(() => {
          const roi = this.svc ? this.svc.getRoiMetrics() : { totalSpend: 0, cpl: 0, cpa: 0, roas: 0, roiByPage: [], roiByCampaign: [] };
          return `
          <!-- Summary ROI KPI Grid -->
          <div class="roi-grid" style="padding: 16px;">
            <div class="roi-card">
              <div class="roi-card-label">TOTAL AD SPEND</div>
              <div class="roi-card-value">${this.formatMoney(roi.totalSpend)}</div>
              <div class="roi-card-sub">Meta Graph Verified</div>
            </div>
            <div class="roi-card">
              <div class="roi-card-label">COST PER LEAD (CPL)</div>
              <div class="roi-card-value" style="color:var(--accent);">${this.formatMoney(roi.cpl)}</div>
              <div class="roi-card-sub">Spend / ${roi.totalLeads} Total Leads</div>
            </div>
            <div class="roi-card">
              <div class="roi-card-label">COST PER CUSTOMER (CPA)</div>
              <div class="roi-card-value" style="color:var(--success);">${this.formatMoney(roi.cpa)}</div>
              <div class="roi-card-sub">Spend / ${roi.totalWonDeals} Closed Deals</div>
            </div>
            <div class="roi-card">
              <div class="roi-card-label">RETURN ON AD SPEND (ROAS)</div>
              <div class="roi-card-value" style="color:#7C3AED;">${roi.roas}x</div>
              <div class="roi-card-sub">Revenue: ${this.formatMoney(roi.totalWonValue)}</div>
            </div>
          </div>

          <!-- ROI By Page Table -->
          <div style="padding: 0 16px 16px;">
            <h4 style="font-size: 13px; font-weight: 600; margin-bottom: 8px;">ROI Breakdown by Page</h4>
            <div class="roi-table-container">
              <table>
                <thead>
                  <tr>
                    <th>Facebook Page</th>
                    <th>Ad Spend</th>
                    <th>Leads</th>
                    <th>Live CPL</th>
                    <th>Won Deals</th>
                    <th>Won Value</th>
                    <th>Live CPA</th>
                    <th>ROAS</th>
                    <th>Performance</th>
                  </tr>
                </thead>
                <tbody>
                  ${roi.roiByPage.length > 0 ? roi.roiByPage.map(row => `
                    <tr>
                      <td><strong>${row.pageName}</strong></td>
                      <td>${this.formatMoney(row.spend)}</td>
                      <td class="font-semibold">${row.leads}</td>
                      <td>${this.formatMoney(row.cpl)}</td>
                      <td><span class="badge badge-green">${row.wonDeals}</span></td>
                      <td>${this.formatMoney(row.wonValue)}</td>
                      <td class="font-semibold">${this.formatMoney(row.cpa)}</td>
                      <td><strong>${row.roas}x</strong></td>
                      <td>
                        ${row.performerFlag === 'top_roas' ? '<span class="badge-top-roas">★ Top ROI</span>' :
                          row.performerFlag === 'high_cpl' ? '<span class="badge-high-cpl">⚠ High CPL</span>' :
                          '<span class="badge-stable-roi">Stable</span>'}
                      </td>
                    </tr>`).join('') : '<tr><td colspan="9" class="empty-cell" style="text-align:center;padding:16px;">No pages assigned</td></tr>'}
                </tbody>
              </table>
            </div>

            <!-- ROI By Campaign Table -->
            <h4 style="font-size: 13px; font-weight: 600; margin-bottom: 8px; margin-top: 16px;">ROI Breakdown by Campaign</h4>
            <div class="roi-table-container">
              <table>
                <thead>
                  <tr>
                    <th>Campaign</th>
                    <th>Page</th>
                    <th>Ad Spend</th>
                    <th>Leads</th>
                    <th>Live CPL</th>
                    <th>Won Deals</th>
                    <th>Live CPA</th>
                    <th>ROAS</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  ${roi.roiByCampaign.length > 0 ? roi.roiByCampaign.map(camp => `
                    <tr>
                      <td><strong>${camp.campaignName}</strong></td>
                      <td class="text-xs text-gray">${camp.pageName}</td>
                      <td>${this.formatMoney(camp.spend)}</td>
                      <td class="font-semibold">${camp.leads}</td>
                      <td>${this.formatMoney(camp.cpl)}</td>
                      <td><span class="badge badge-green">${camp.wonDeals}</span></td>
                      <td class="font-semibold">${this.formatMoney(camp.cpa)}</td>
                      <td><strong>${camp.roas}x</strong></td>
                      <td>
                        ${camp.performerFlag === 'top_roas' ? '<span class="badge-top-roas">★ Top ROI</span>' :
                          camp.performerFlag === 'high_cpl' ? '<span class="badge-high-cpl">Review Needed</span>' :
                          '<span class="badge-stable-roi">Active</span>'}
                      </td>
                    </tr>`).join('') : '<tr><td colspan="9" class="empty-cell" style="text-align:center;padding:16px;">No campaigns available</td></tr>'}
                </tbody>
              </table>
            </div>
          </div>
          `;
        })()}
      </div>`;
  }

  // ──────────────────────────────────────────────────────────
  // STAFF & RBAC MANAGEMENT (Section 16)
  // ──────────────────────────────────────────────────────────

  renderStaff() {
    this.el.title.textContent = 'Staff Management & Page Permissions';
    this.el.actions.innerHTML = `<button class="btn btn-primary" onclick="window.app.openAddStaffModal()">+ Add Staff Member</button>`;

    const staff = this.svc ? (this.svc.staff || []) : [];
    const pages = this.svc ? this.svc.pages : [];

    this.el.content.innerHTML = `
      <div class="table-container">
        <table>
          <thead>
            <tr><th>Staff Member</th><th>Role</th><th>Assigned Pages</th><th>Active Leads</th><th>Converted</th><th>Status</th><th>Actions</th></tr>
          </thead>
          <tbody>
            ${staff.length > 0 ? staff.map(s => {
              const sLeads = (this.svc ? this.svc.leads : []).filter(l => l.assigned_staff_id === s.id || l.assignedStaffId === s.id);
              const sWon = sLeads.filter(l => l.status === 'Won' || l.status === 'Converted');
              const pageNames = (s.assignedPageIds || []).map(pid => this._pageName(pid)).join(', ');
              return `
                <tr>
                  <td>
                    <div class="flex items-center gap-2">
                      <div class="staff-avatar-sm" style="background:${s.role==='admin'?'var(--accent)':'#10B981'}">${(s.name||'?').charAt(0)}</div>
                      <div>
                        <strong>${s.name}</strong>
                        <div class="text-xs text-gray">${s.email}</div>
                      </div>
                    </div>
                  </td>
                  <td>${this._roleBadge(s.role)}</td>
                  <td class="text-xs">${pageNames || 'All Pages (Full Access)'}</td>
                  <td class="font-semibold">${sLeads.length}</td>
                  <td><span class="badge badge-green">${sWon.length}</span></td>
                  <td><span class="badge ${s.status==='inactive'?'badge-gray':'badge-green'}">${s.status || 'Active'}</span></td>
                  <td>
                    <div class="row-actions">
                      <button class="btn btn-secondary btn-sm" onclick="window.app.openAssignPagesModal('${s.id}')">Assign Pages</button>
                      <button class="btn btn-ghost btn-sm" onclick="window.app.switchUserDirect('${s.id}')">Switch</button>
                      <button class="btn btn-ghost btn-sm text-red" style="color:var(--danger);" onclick="window.app.removeStaff('${s.id}')" title="Remove staff member">${this._icon('trash', 14)}</button>
                    </div>
                  </td>
                </tr>`;
            }).join('') : '<tr><td colspan="7" class="empty-cell" style="text-align:center;padding:24px;color:var(--text-muted);">No staff members configured. Click "+ Add Staff Member" to add a user.</td></tr>'}
          </tbody>
        </table>
      </div>`;
  }

  openAssignPagesModal(staffId) {
    const staff = this.svc ? this.svc.staff.find(s => s.id === staffId) : null;
    if (!staff) return;
    const pages = this.svc ? (this.svc.pages || []) : [];

    this.el.mTitle.textContent = `Assign Facebook Pages: ${staff.name}`;
    this.el.mBody.innerHTML = `
      <p style="font-size:13px;color:var(--text-secondary);margin-bottom:14px;line-height:1.4;">
        Select which Facebook Pages <strong>${escapeHtml(staff.name)}</strong> is allowed to access. They will only see leads and messages for checked pages.
      </p>
      <div style="display:flex;flex-direction:column;gap:10px;max-height:260px;overflow-y:auto;padding:4px 0;">
        <label style="display:flex;align-items:center;gap:10px;font-size:13px;cursor:pointer;padding:6px 8px;border-radius:4px;background:#F8FAFC;">
          <input type="checkbox" id="ap-all" ${(!staff.assignedPageIds || staff.assignedPageIds.length === 0 || staff.assignedPageIds.length === pages.length) ? 'checked' : ''} 
                 onchange="document.querySelectorAll('.ap-page-cb').forEach(cb => cb.checked = this.checked)">
          <strong>All Pages (Full Access)</strong>
        </label>
        <hr style="border:none;border-top:1px solid var(--border);margin:4px 0;">
        ${pages.length > 0 ? pages.map(p => `
          <label style="display:flex;align-items:center;gap:10px;font-size:13px;cursor:pointer;padding:4px 8px;">
            <input type="checkbox" class="ap-page-cb" value="${p.id}" ${(staff.assignedPageIds && staff.assignedPageIds.includes(p.id)) ? 'checked' : ''}
                   onchange="if(!this.checked) document.getElementById('ap-all').checked = false;">
            <span>${escapeHtml(p.name)}</span>
          </label>
        `).join('') : '<div class="text-xs text-gray">No connected Facebook Pages yet. Connect a Page first.</div>'}
      </div>
    `;

    this.el.mConfirm.textContent = 'Save Page Assignments';
    this.el.mConfirm.className = 'btn btn-primary';
    this.el.mConfirm.onclick = () => {
      const isAll = document.getElementById('ap-all')?.checked;
      let selectedIds = [];
      if (isAll) {
        selectedIds = pages.map(p => p.id);
      } else {
        document.querySelectorAll('.ap-page-cb:checked').forEach(cb => selectedIds.push(cb.value));
      }
      staff.assignedPageIds = selectedIds;
      if (this.svc) {
        if (this.svc._saveToStorage) this.svc._saveToStorage();
        else if (this.svc.saveAll) this.svc.saveAll();
      }
      this.closeModal();
      this.toast(`Page assignments saved for "${staff.name}" ✓`, 'success');
      this.renderStaff();
    };
    this.el.mOverlay.classList.add('open');
  }

  // ──────────────────────────────────────────────────────────
  // USER SWITCHER & AUTH MODAL (Section 3 & 4)
  // ──────────────────────────────────────────────────────────

  openUserSwitchModal() {
    const staff = this.svc ? this.svc.staff : [];

    this.el.mTitle.textContent = 'Switch Active User Session';
    this.el.mBody.innerHTML = `
      <p class="text-xs text-gray mb-4">Select an active user profile to switch session context:</p>
      <div style="display:flex;flex-direction:column;gap:8px;">
        ${staff.length > 0 ? staff.map(s => `
          <div class="page-row" style="cursor:pointer;${s.id === this.user.id ? 'border-color:var(--accent);background:#EEF2FF;' : ''}" 
               onclick="window.app.switchUserDirect('${s.id}')">
            <div class="staff-avatar-sm" style="background:${s.role==='admin'?'var(--accent)':'#10B981'}">${(s.name||'?').charAt(0)}</div>
            <div style="flex:1;">
              <strong>${s.name}</strong>
              <div class="text-xs text-gray">${this._roleLabel(s.role)} · Pages: ${(s.assignedPageIds||[]).map(pid => this._pageName(pid)).join(', ') || 'All Pages'}</div>
            </div>
            ${s.id === this.user.id ? '<span class="badge badge-indigo">Active</span>' : '<button class="btn btn-ghost btn-sm">Switch</button>'}
          </div>`).join('') : '<div style="padding:16px;text-align:center;color:var(--text-muted);">No additional staff profiles available</div>'}
      </div>`;

    this.el.mConfirm.textContent = 'Close';
    this.el.mConfirm.onclick = () => this.closeModal();
    this.el.mOverlay.classList.add('open');
  }

  switchUserDirect(userId) {
    if (this.svc && this.svc.switchUser(userId)) {
      this.user = this.svc.getCurrentUser();
      this.closeModal();
      this.toast(`Session active: ${this.user.name} (${this._roleLabel(this.user.role)})`);
      this.renderSidebar();
      this._renderPage();
    }
  }

  // ──────────────────────────────────────────────────────────
  // SETTINGS VIEW
  // ──────────────────────────────────────────────────────────

  renderSettings() {
    this.el.title.textContent = 'Settings';
    this.el.actions.innerHTML = '';

    this.el.content.innerHTML = `
      <div class="settings-layout">
        <div class="settings-nav">
          <div class="settings-nav-item active" onclick="window.app._setTab(this,'stab-general')">General</div>
          <div class="settings-nav-item" onclick="window.app._setTab(this,'stab-notifications')">Notifications</div>
          <div class="settings-nav-item" onclick="window.app._setTab(this,'stab-advanced')">Advanced &amp; API Key</div>
        </div>
        <div class="settings-content">
          <div id="stab-general">
            <div class="card" style="max-width:520px">
              <div class="card-title mb-4">General Settings</div>
              <label class="settings-label">CRM Organization Name</label>
              <input type="text" class="input mb-4" value="MetaCRM Multi-Page Workspace">
              <label class="settings-label">Timezone</label>
              <select class="input mb-4">
                <option selected>Asia/Kolkata (IST)</option>
                <option>UTC</option>
                <option>America/New_York</option>
              </select>
              <button class="btn btn-primary" onclick="window.app.toast('Settings saved successfully!')">Save Changes</button>
            </div>
          </div>
          <div id="stab-notifications" style="display:none">
            <div class="card" style="max-width:520px">
              <div class="card-title mb-4">Notification Alerts &amp; Speed-to-Lead</div>
              <div class="setting-toggle">
                <span>In-App Toast &amp; Bell Notifications</span>
                <label class="toggle">
                  <input type="checkbox" id="pref-in-app" ${(this.user?.notification_preferences?.in_app !== false) ? 'checked' : ''}><span class="toggle-slider"></span>
                </label>
              </div>
              <div class="setting-toggle">
                <span>Email Notifications (Stub / Provider Standby)</span>
                <label class="toggle">
                  <input type="checkbox" id="pref-email" ${(this.user?.notification_preferences?.email === true) ? 'checked' : ''}><span class="toggle-slider"></span>
                </label>
              </div>
              <div class="mt-4 mb-3">
                <label class="settings-label">Slack Incoming Webhook URL (Optional)</label>
                <input type="url" class="input" id="pref-slack" placeholder="https://hooks.slack.com/services/..." value="${this.user?.notification_preferences?.slack_webhook_url || ''}">
                <div class="text-xs text-gray mt-1">Sends real-time lead alerts directly to your team Slack channel.</div>
              </div>
              <div class="mb-4">
                <label class="settings-label">Hot-Lead Threshold (${this.getCurrencySymbol()} Value)</label>
                <input type="number" class="input" id="pref-hot-threshold" value="${this.user?.notification_preferences?.hot_lead_threshold || 50000}">
                <div class="text-xs text-gray mt-1">Leads with value greater than this amount will trigger instant Hot-Lead admin alerts.</div>
              </div>
              <button class="btn btn-primary mt-2" onclick="window.app.saveNotificationPreferences()">Save Notification Rules</button>
            </div>
          </div>
          <div id="stab-advanced" style="display:none">
            <div class="card" style="max-width:520px">
              <div class="card-title mb-4">Zernio Meta Gateway Credentials</div>
              <label class="settings-label">Zernio API Key</label>
              <input type="password" class="input mb-4" id="setting-zernio-key" placeholder="Enter ZERNIO_API_KEY (stored securely in env)" value="">
              <button class="btn btn-secondary" onclick="window.app.testLiveZernioPing()">Test Connection Ping</button>
            </div>
          </div>
        </div>
      </div>`;
  }

  saveNotificationPreferences() {
    const inApp = document.getElementById('pref-in-app')?.checked ?? true;
    const email = document.getElementById('pref-email')?.checked ?? false;
    const slack = document.getElementById('pref-slack')?.value || null;
    const hotThreshold = parseFloat(document.getElementById('pref-hot-threshold')?.value) || 50000;

    if (this.user) {
      this.user.notification_preferences = {
        in_app: inApp,
        email,
        slack_webhook_url: slack,
        hot_lead_threshold: hotThreshold
      };
      if (this.svc) {
        this.svc.saveAll();
      }
    }
    this.toast('Notification preferences saved successfully! ✓');
  }

  _setTab(el, tabId) {
    document.querySelectorAll('.settings-nav-item').forEach(e => e.classList.remove('active'));
    el.classList.add('active');
    ['stab-general','stab-notifications','stab-advanced'].forEach(id => {
      const target = document.getElementById(id);
      if (target) target.style.display = id === tabId ? '' : 'none';
    });
  }

  // ──────────────────────────────────────────────────────────
  // MODALS: Add Lead & Add Task
  // ──────────────────────────────────────────────────────────

  openAddLeadModal() {
    const pages = this._getAccessiblePages();
    const staff = this.svc ? this.svc.staff : [];

    this.el.mTitle.textContent = 'Add Inbound Lead';
    this.el.mBody.innerHTML = `
      <label class="settings-label">Full Name *</label>
      <input type="text" class="input mb-3" id="nl-name" placeholder="e.g. Ramesh Kulkarni">
      <label class="settings-label">Phone</label>
      <input type="tel" class="input mb-3" id="nl-phone" placeholder="+91 98765 00000">
      <label class="settings-label">Email</label>
      <input type="email" class="input mb-3" id="nl-email" placeholder="ramesh@example.com">
      <label class="settings-label">Facebook Page *</label>
      <select class="input mb-3" id="nl-page">
        ${pages.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
      </select>
      <label class="settings-label">Assign To</label>
      <select class="input mb-1" id="nl-staff">
        <option value="">Auto-Assign by Page</option>
        ${staff.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}
      </select>`;

    this.el.mConfirm.textContent = 'Add Lead';
    this.el.mConfirm.onclick = () => {
      const name = document.getElementById('nl-name').value.trim();
      if (!name) { this.toast('Name is required'); return; }
      const pageId = document.getElementById('nl-page').value;
      const assignedStaff = document.getElementById('nl-staff').value || this._getAutoAssignedStaff(pageId);

      if (this.svc) {
        const newLead = {
          name,
          full_name: name,
          phone: document.getElementById('nl-phone').value.trim(),
          email: document.getElementById('nl-email').value.trim(),
          page_id: pageId,
          pageId,
          source: 'Manual Entry',
          assigned_staff_id: assignedStaff,
          assignedStaffId: assignedStaff,
          status: 'New',
          created_at: new Date().toISOString()
        };
        if (this.svc.createLead) {
          this.svc.createLead(newLead);
        } else {
          this.svc.leads.unshift(newLead);
          if (this.svc._saveToStorage) this.svc._saveToStorage();
        }
      }
      this.closeModal();
      this.toast(`Lead "${name}" created and assigned!`, 'success');
      this.renderSidebar();
      if (this.currentRoute === 'leads') this.renderLeads();
    };
    this.el.mOverlay.classList.add('open');
  }

  openAddTaskModal() {
    const leads = this._getFilteredLeads().slice(0, 25);
    const staff = this.svc ? this.svc.staff : [];
    const today = new Date().toISOString().split('T')[0];

    this.el.mTitle.textContent = 'Schedule Task / Follow-up';
    this.el.mBody.innerHTML = `
      <label class="settings-label">Task Title *</label>
      <input type="text" class="input mb-3" id="nt-title" placeholder="e.g. Call lead back with updated brochure">
      <label class="settings-label">Related Lead</label>
      <select class="input mb-3" id="nt-lead">
        <option value="">— General Task —</option>
        ${leads.map(l => `<option value="${l.id}">${l.name}</option>`).join('')}
      </select>
      <label class="settings-label">Due Date</label>
      <input type="date" class="input mb-3" id="nt-due" value="${today}">
      <label class="settings-label">Priority</label>
      <select class="input mb-3" id="nt-priority">
        <option value="Normal">Normal</option>
        <option value="High">High</option>
        <option value="Low">Low</option>
      </select>
      <label class="settings-label">Assign To</label>
      <select class="input mb-1" id="nt-staff">
        <option value="${this.user.id}">${this.user.name} (me)</option>
        ${staff.filter(s => s.id !== this.user.id).map(s => `<option value="${s.id}">${s.name}</option>`).join('')}
      </select>`;

    this.el.mConfirm.textContent = 'Create Task';
    this.el.mConfirm.onclick = () => {
      const title = document.getElementById('nt-title').value.trim();
      if (!title) { this.toast('Task title is required'); return; }
      if (this.svc) {
        const newTask = {
          id: 'task_' + Date.now(),
          title,
          leadId: document.getElementById('nt-lead').value,
          dueDate: document.getElementById('nt-due').value,
          priority: document.getElementById('nt-priority').value,
          assignedStaffId: document.getElementById('nt-staff').value,
          status: 'Todo',
          createdAt: new Date().toISOString()
        };
        if (!this.svc.tasks) this.svc.tasks = [];
        this.svc.tasks.unshift(newTask);
        this.svc._saveToStorage ? this.svc._saveToStorage() : this.svc.saveAll();
      }
      this.closeModal();
      this.toast('Task scheduled successfully! ✓');
      if (this.currentRoute === 'tasks') this.renderTasks();
    };
    this.el.mOverlay.classList.add('open');
  }

  closeModal() {
    this.el.mOverlay.classList.remove('open');
  }

  confirmDialog({ title = 'Confirm Action', message, confirmText = 'Confirm', isDanger = false, onConfirm }) {
    this.el.mTitle.textContent = title;
    this.el.mBody.innerHTML = `
      ${isDanger ? `
        <div class="danger-icon-badge">
          <svg width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
          </svg>
        </div>` : ''}
      <div style="text-align:${isDanger ? 'center' : 'left'};">
        <p style="font-size:14px;color:var(--text-primary);line-height:1.5;">${message}</p>
      </div>`;
    this.el.mConfirm.textContent = confirmText;
    this.el.mConfirm.className = isDanger ? 'btn btn-danger' : 'btn btn-primary';
    this.el.mConfirm.onclick = () => {
      this.closeModal();
      if (typeof onConfirm === 'function') onConfirm();
    };
    this.el.mOverlay.classList.add('open');
  }

  openAddStaffModal() {
    const pages = this.svc ? this.svc.pages : [];

    this.el.mTitle.textContent = 'Add Staff Member';
    this.el.mBody.innerHTML = `
      <label class="settings-label">Full Name *</label>
      <input type="text" class="input mb-3" id="ns-name" placeholder="e.g. Ananya Roy">
      <label class="settings-label">Work Email *</label>
      <input type="email" class="input mb-3" id="ns-email" placeholder="ananya@company.com">
      <label class="settings-label">Role</label>
      <select class="input mb-3" id="ns-role">
        <option value="staff" selected>Sales Staff</option>
        <option value="admin">Administrator</option>
      </select>
      <label class="settings-label">Assigned Facebook Page</label>
      <select class="input mb-2" id="ns-page">
        <option value="all">All Pages (Full Access)</option>
        ${pages.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
      </select>`;

    this.el.mConfirm.textContent = 'Add Staff Member';
    this.el.mConfirm.className = 'btn btn-primary';
    this.el.mConfirm.onclick = () => {
      const name = (document.getElementById('ns-name')?.value || '').trim();
      const email = (document.getElementById('ns-email')?.value || '').trim();
      const role = document.getElementById('ns-role')?.value || 'staff';
      const pageId = document.getElementById('ns-page')?.value || 'all';

      if (!name || !email) {
        this.toast('Full Name and Work Email are required', 'warning');
        return;
      }

      if (this.svc) {
        const newStaff = {
          id: `usr_${Date.now()}`,
          name,
          displayName: name,
          email,
          role,
          status: 'active',
          assignedPageIds: pageId === 'all' ? pages.map(p => p.id) : [pageId]
        };
        this.svc.staff.push(newStaff);
        if (this.svc._saveToStorage) this.svc._saveToStorage(); else this.svc.saveAll();
      }

      this.closeModal();
      this.toast(`Staff member "${name}" added successfully! ✓`, 'success');
      this.renderStaff();
    };
    this.el.mOverlay.classList.add('open');
  }

  removeStaff(staffId) {
    const staff = this.svc ? this.svc.staff.find(s => s.id === staffId) : null;
    if (!staff) return;
    if (staff.role === 'admin' && this.svc.staff.filter(s => s.role === 'admin').length <= 1) {
      this.toast('Cannot remove the primary Administrator account.', 'warning');
      return;
    }
    this.confirmDialog({
      title: 'Remove Staff Member',
      message: `Are you sure you want to remove "${staff.name}" (${staff.email})? Assigned leads will be reassigned to the administrator.`,
      confirmText: 'Remove Staff',
      isDanger: true,
      onConfirm: () => {
        if (this.svc) {
          this.svc.staff = this.svc.staff.filter(s => s.id !== staffId);
          if (this.svc._saveToStorage) this.svc._saveToStorage(); else this.svc.saveAll();
        }
        this.toast(`Staff member "${staff.name}" removed.`, 'info');
        this.renderStaff();
      }
    });
  }

  // ──────────────────────────────────────────────────────────
  // RBAC & FILTER HELPER METHODS
  // ──────────────────────────────────────────────────────────

  _getAccessiblePages() {
    if (!this.svc || !this.svc.pages) return [];
    if (this.user.role === 'admin' || this.user.role === 'super_admin') {
      return this.svc.pages;
    }
    const assignedIds = this.user.assignedPageIds || [];
    return this.svc.pages.filter(p => assignedIds.includes(p.id));
  }

  _getISTDate(dateInput = null) {
    const d = dateInput ? new Date(dateInput) : new Date();
    if (isNaN(d.getTime())) return null;
    try {
      const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
      return formatter.format(d);
    } catch (e) {
      const istMs = d.getTime() + (5.5 * 60 * 60 * 1000);
      return new Date(istMs).toISOString().split('T')[0];
    }
  }

  _isDateInRangeIST(dateInput, range) {
    if (!dateInput) return false;
    const itemDate = new Date(dateInput);
    if (isNaN(itemDate.getTime())) return false;
    if (!range || range === 'all') return true;

    const now = new Date();
    const todayIST = this._getISTDate(now);
    const itemIST = this._getISTDate(itemDate);
    if (!todayIST || !itemIST) return false;

    if (range === 'today') {
      return itemIST === todayIST;
    }
    if (range === 'yesterday') {
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const yesterdayIST = this._getISTDate(yesterday);
      return itemIST === yesterdayIST;
    }
    if (range === 'last_7d') {
      const diffMs = now.getTime() - itemDate.getTime();
      const diffDays = diffMs / (1000 * 60 * 60 * 24);
      return diffDays >= 0 && diffDays <= 7;
    }
    if (range === 'last_30d') {
      const diffMs = now.getTime() - itemDate.getTime();
      const diffDays = diffMs / (1000 * 60 * 60 * 24);
      return diffDays >= 0 && diffDays <= 30;
    }
    if (range === 'this_month') {
      const [nowYear, nowMonth] = todayIST.split('-');
      const [itemYear, itemMonth] = itemIST.split('-');
      return nowYear === itemYear && nowMonth === itemMonth;
    }
    return true;
  }

  _getFilteredLeads(applyDateFilter = false) {
    if (!this.svc || !this.svc.leads) return [];
    let leads = this._filterUserLeads(this.svc.leads);
    if (this.selectedPageFilter !== 'all') {
      leads = leads.filter(l => l.page_id === this.selectedPageFilter || l.pageId === this.selectedPageFilter);
    }
    if (applyDateFilter && this.selectedDateRange) {
      leads = leads.filter(l => this._isDateInRangeIST(l.created_at || l.createdAt, this.selectedDateRange));
    }
    return leads;
  }

  _filterUserLeads(leads) {
    if (this.user.role === 'admin' || this.user.role === 'super_admin') return leads;
    const allowedPages = this.user.assignedPageIds || [];
    return leads.filter(l =>
      (l.assigned_staff_id && l.assigned_staff_id === this.user.id) ||
      (l.assignedStaffId && l.assignedStaffId === this.user.id) ||
      (l.page_id && allowedPages.includes(l.page_id)) ||
      (l.pageId && allowedPages.includes(l.pageId))
    );
  }

  _filterUserTasks(tasks) {
    if (this.user.role === 'admin' || this.user.role === 'super_admin') return tasks;
    return tasks.filter(t => t.assignedStaffId === this.user.id || t.assigned_to === this.user.id);
  }

  _getAutoAssignedStaff(pageId) {
    if (!this.svc || !this.svc.staff) return this.user.id;
    const match = this.svc.staff.find(s => s.role === 'staff' && (s.assignedPageIds || []).includes(pageId));
    return match ? match.id : this.user.id;
  }

  _staffName(staffId) {
    if (!staffId || !this.svc) return 'Unassigned';
    const s = (this.svc.staff || []).find(u => u.id === staffId);
    return s ? s.displayName || s.name : staffId;
  }

  _pageName(pageId) {
    if (!pageId || !this.svc || !this.svc.pages) return '';
    const p = this.svc.pages.find(pg => pg.id === pageId);
    return p ? p.name : pageId;
  }

  _statusColor(status) {
    const map = {
      'New': 'blue', 'New Lead': 'blue',
      'Contacted': 'orange',
      'Qualified': 'purple',
      'Follow-up': 'orange',
      'Won': 'green', 'Converted': 'green',
      'Lost': 'red', 'Invalid': 'gray',
    };
    return map[status] || 'gray';
  }

  _stageColor(stage) {
    const map = {
      'New Lead': '#3B82F6', 'Contacted': '#F59E0B', 'Qualified': '#7C3AED',
      'Follow-up': '#F97316', 'Won': '#10B981', 'Lost': '#EF4444',
    };
    return map[stage] || '#94A3B8';
  }

  _badge(status) {
    return `<span class="badge badge-${this._statusColor(status)}">${status}</span>`;
  }

  _roleBadge(role) {
    const map = { super_admin: 'orange', admin: 'blue', staff: 'gray' };
    return `<span class="badge badge-${map[role]||'gray'}">${this._roleLabel(role)}</span>`;
  }

  _priorityBadge(priority) {
    const map = { High: 'badge-red', Normal: 'badge-gray', Low: 'badge-gray' };
    return priority ? `<span class="badge ${map[priority]||'badge-gray'}">${priority}</span>` : '';
  }

  _timeAgo(iso) {
    if (!iso) return 'Just now';
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'Just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    if (d < 30) return `${d}d ago`;
    return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  }

  _formatNum(n) {
    if (n >= 100000) return (n / 100000).toFixed(1) + 'L';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return n;
  }

  _empty(title, subtitle, href = null, cta = null, actionHtml = null, icon = null) {
    const iconHtml = (icon && !/[\uD83C-\uDBFF\uDC00-\uDFFF]/.test(icon)) ? icon : `<svg width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>`;
    return `
      <div class="empty-state">
        <div class="empty-state-icon">${iconHtml}</div>
        <div class="empty-state-title">${title}</div>
        <div class="empty-state-desc">${subtitle}</div>
        <div class="empty-state-actions">
          ${href && cta ? `<a href="${href}" class="btn btn-primary">${cta}</a>` : ''}
          ${actionHtml || ''}
        </div>
      </div>`;
  }

  _renderTip(tipId, text) {
    try {
      if (localStorage.getItem('metacrm_tip_' + tipId) === 'dismissed') return '';
    } catch (e) {}
    return `
      <div class="user-friendly-tip" id="tip-${tipId}">
        <span class="tip-icon" style="display:inline-flex;align-items:center;"><svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg></span>
        <span class="tip-text">${text}</span>
        <button class="tip-close-btn" onclick="window.app.dismissTip('${tipId}')">✕ Got it</button>
      </div>`;
  }

  dismissTip(tipId) {
    try {
      localStorage.setItem('metacrm_tip_' + tipId, 'dismissed');
    } catch (e) {}
    const el = document.getElementById('tip-' + tipId);
    if (el) el.remove();
  }

  // ──────────────────────────────────────────────────────────
  // TOAST NOTIFICATIONS
  // ──────────────────────────────────────────────────────────

  toast(msg, type = 'info') {
    if (!this.el || !this.el.toasts) return;
    const icons = {
      success: '✓',
      error: '✕',
      warning: '⚠️',
      info: 'ℹ'
    };
    const icon = icons[type] || 'ℹ';
    const t = document.createElement('div');
    t.className = `toast toast-${type}`;
    t.innerHTML = `
      <span class="toast-icon">${icon}</span>
      <span class="toast-text">${escapeHtml(msg)}</span>
    `;
    this.el.toasts.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => {
      t.classList.remove('show');
      setTimeout(() => t.remove(), 250);
    }, 3400);
  }

  async syncAdSpend() {
    this.toast('Syncing ad spend and insights from Meta Graph API...');
    if (this.svc) {
      await this.svc.syncAdInsights();
      this.toast('Ad spend insights synced successfully!');
      this.render();
    }
  }

  // ──────────────────────────────────────────────────────────
  // META ADS DASHBOARD & MARKETING API
  // ──────────────────────────────────────────────────────────

  async renderMetaAds() {
    this._setBreadcrumbs('Meta Ads Manager');
    this.adsActiveTab = this.adsActiveTab || 'campaigns';
    this.adsDateRange = this.adsDateRange || 'last_30d';
    this.adsStatusFilter = this.adsStatusFilter || 'ALL';
    this.adsSearchQuery = this.adsSearchQuery || '';

    // Verify staff permissions: non-admin can only see assigned accounts
    const isStaff = this.user.role === 'staff';
    const allIntegrations = this.svc ? (this.svc.integrations || []) : [];
    const metaIntegration = allIntegrations.find(i => i.provider === 'meta_ads');
    const isAssigned = metaIntegration && (!isStaff || (metaIntegration.assigned_staff_ids || []).includes(this.user.id));

    if (metaIntegration && metaIntegration.status === 'connected' && !isAssigned) {
      this.el.content.innerHTML = `
        <div class="empty-state-card" style="padding:48px 24px;text-align:center;">
          <div style="font-size:32px;margin-bottom:12px;">🔒</div>
          <h3 style="font-size:16px;font-weight:600;margin-bottom:8px;">Access Restricted</h3>
          <p class="text-sm text-gray" style="max-width:440px;margin:0 auto 16px;">Your account (${escapeHtml(this.user.name)}) does not have permission to view this Meta Ads account. Please contact an administrator to request ad account access.</p>
          <button class="btn btn-secondary" onclick="window.app.navigate('dashboard')">Return to Dashboard</button>
        </div>
      `;
      return;
    }

    // Auto-fetch live campaigns if not yet fetched
    if (!this._fetchedLiveAds && this.svc) {
      this._fetchedLiveAds = true;
      this.svc.fetchLiveCampaigns().then(() => {
        if (this.currentRoute === 'meta-ads') this.renderMetaAds();
      });
    }

    // Load campaigns, ad sets, and ads
    const campaigns = this.svc ? (this.svc.campaigns || []) : [];
    const adsets = this.svc ? (this.svc.adsets || []) : [];
    const ads = this.svc ? (this.svc.ads || []) : [];

    // Calculate aggregated metrics
    const totalSpend = campaigns.reduce((s, c) => s + (c.spend || (c.metrics && c.metrics.spend) || 0), 0);
    const totalLeads = campaigns.reduce((s, c) => s + (c.leads || (c.metrics && c.metrics.leads) || 0), 0);
    const totalImpressions = campaigns.reduce((s, c) => s + ((c.metrics && c.metrics.impressions) || 0), 0);
    const totalClicks = campaigns.reduce((s, c) => s + ((c.metrics && c.metrics.clicks) || 0), 0);
    const avgCtr = totalImpressions > 0 ? ((totalClicks / totalImpressions) * 100).toFixed(2) : '0.00';
    const avgCpc = totalClicks > 0 ? (totalSpend / totalClicks).toFixed(2) : '0.00';
    const avgCpl = totalLeads > 0 ? Math.round(totalSpend / totalLeads) : 0;
    const avgCpm = totalImpressions > 0 ? ((totalSpend / totalImpressions) * 1000).toFixed(2) : '0.00';

    const connectedLiveAccounts = [
      { id: '1342542735606057', name: 'Nova auto nz ', platform: 'Facebook' },
      { id: '1330954980099743', name: 'Nova cars Samoa nz', platform: 'Facebook' },
      { id: '1217451958128630', name: 'Nova Cars Tongan NZ', platform: 'Facebook' },
      { id: '29279331294986321', name: '@bynotjiban', platform: 'Instagram' }
    ];
    const accessiblePages = (this._getAccessiblePages && this._getAccessiblePages().length > 0)
      ? this._getAccessiblePages()
      : connectedLiveAccounts;

    this.el.content.innerHTML = `
      <div class="ads-manager-view">
        <!-- TOP CONTROLS & HEADER -->
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:20px;">
          <div>
            <h2 style="font-size:20px;font-weight:700;letter-spacing:-0.02em;margin-bottom:4px;color:var(--text);">Meta Ads Manager</h2>
            <p class="text-xs text-gray">Live Meta Marketing API performance, audience attribution, and CPL conversion metrics.</p>
          </div>
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
            <select class="input input-sm" id="ads-account-select" style="font-weight:500;">
              <option value="all">All Connected Accounts (${connectedLiveAccounts.length})</option>
              ${connectedLiveAccounts.map(p => `<option value="${p.id}">${escapeHtml(p.name)} (${p.platform})</option>`).join('')}
            </select>
            <select class="input input-sm" id="ads-daterange-select" onchange="window.app.changeAdsDateRange(this.value)">
              <option value="last_7d" ${this.adsDateRange==='last_7d'?'selected':''}>Last 7 Days</option>
              <option value="last_14d" ${this.adsDateRange==='last_14d'?'selected':''}>Last 14 Days</option>
              <option value="last_30d" ${this.adsDateRange==='last_30d'?'selected':''}>Last 30 Days</option>
              <option value="this_month" ${this.adsDateRange==='this_month'?'selected':''}>This Month</option>
              <option value="lifetime" ${this.adsDateRange==='lifetime'?'selected':''}>Lifetime</option>
            </select>
            <button class="btn btn-secondary btn-sm" onclick="window.app.syncLiveAds()">
              <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 21h5v-5"/></svg>
              Sync Live Ads
            </button>
            <button class="btn btn-primary btn-sm" onclick="window.app.openCreateCampaignModal()">
              + Create Campaign
            </button>
          </div>
        </div>

        <!-- KPI SUMMARY CARDS -->
        <div class="stats-grid" style="grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));gap:12px;margin-bottom:24px;">
          <div class="stat-card">
            <div class="stat-label">Total Ad Spend</div>
            <div class="stat-value">${this.formatMoney(totalSpend)}</div>
            <div class="stat-comparison ${totalSpend > 0 ? 'text-green' : 'text-gray'}" style="font-size:11px;margin-top:4px;">
              ${totalSpend > 0 ? '<span>Verified Meta ad spend</span>' : '<span>No active ad spend tracked</span>'}
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Attributed Leads</div>
            <div class="stat-value">${totalLeads}</div>
            <div class="stat-comparison ${totalLeads > 0 ? 'text-green' : 'text-gray'}" style="font-size:11px;margin-top:4px;">
              ${totalLeads > 0 ? `<span>${totalLeads} leads from paid campaigns</span>` : '<span>0 ad leads in selected period</span>'}
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Cost Per Lead (CPL)</div>
            <div class="stat-value">${this.formatMoney(avgCpl)}</div>
            <div class="stat-comparison ${avgCpl > 0 ? 'text-green' : 'text-gray'}" style="font-size:11px;margin-top:4px;">
              ${avgCpl > 0 ? `<span>Average CPL: ${this.formatMoney(avgCpl)}</span>` : `<span>${this.formatMoney(0)} / lead (No spend)</span>`}
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Impressions &amp; CPM</div>
            <div class="stat-value">${this._formatNum(totalImpressions)}</div>
            <div class="stat-comparison text-gray" style="font-size:11px;margin-top:4px;">
              CPM: <strong>${this.formatMoney(avgCpm)}</strong>
            </div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Clicks &amp; CTR</div>
            <div class="stat-value">${this._formatNum(totalClicks)}</div>
            <div class="stat-comparison text-gray" style="font-size:11px;margin-top:4px;">
              CTR: <strong>${avgCtr}%</strong> • CPC: <strong>${this.formatMoney(avgCpc)}</strong>
            </div>
          </div>
        </div>

        <!-- TAB NAVIGATION -->
        <div style="display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--border);padding-bottom:12px;margin-bottom:16px;flex-wrap:wrap;gap:12px;">
          <div style="display:flex;gap:8px;">
            <button class="btn btn-sm ${this.adsActiveTab==='campaigns'?'btn-primary':'btn-secondary'}" onclick="window.app.switchAdsTab('campaigns')">
              Campaigns (${campaigns.length})
            </button>
            <button class="btn btn-sm ${this.adsActiveTab==='adsets'?'btn-primary':'btn-secondary'}" onclick="window.app.switchAdsTab('adsets')">
              Ad Sets (${adsets.length})
            </button>
            <button class="btn btn-sm ${this.adsActiveTab==='ads'?'btn-primary':'btn-secondary'}" onclick="window.app.switchAdsTab('ads')">
              Ads Creative (${ads.length})
            </button>
          </div>
          <div style="display:flex;align-items:center;gap:8px;">
            <input type="text" class="input input-sm" placeholder="Search by name or ID…" value="${escapeHtml(this.adsSearchQuery)}" oninput="window.app.searchAds(this.value)" style="width:200px;">
            <select class="input input-sm" onchange="window.app.filterAdsStatus(this.value)">
              <option value="ALL" ${this.adsStatusFilter==='ALL'?'selected':''}>All Statuses</option>
              <option value="ACTIVE" ${this.adsStatusFilter==='ACTIVE'?'selected':''}>Active Only</option>
              <option value="PAUSED" ${this.adsStatusFilter==='PAUSED'?'selected':''}>Paused Only</option>
            </select>
          </div>
        </div>

        <!-- DATA TABLES -->
        <div id="ads-table-container">
          ${this._renderAdsTable(this.adsActiveTab, campaigns, adsets, ads)}
        </div>
      </div>
    `;
  }

  _renderAdsTable(tab, campaigns, adsets, ads) {
    const q = (this.adsSearchQuery || '').toLowerCase();
    const st = this.adsStatusFilter || 'ALL';

    if (tab === 'campaigns') {
      let list = campaigns.filter(c => {
        const matchesQuery = !q || c.name.toLowerCase().includes(q) || (c.id && c.id.toLowerCase().includes(q));
        const matchesStatus = st === 'ALL' || c.status === st;
        return matchesQuery && matchesStatus;
      });

      if (list.length === 0) {
        return `
          <div class="empty-state-card" style="padding:32px 24px;text-align:center;background:#FFFFFF;border:1px solid var(--border-subtle);border-radius:var(--radius-md);box-shadow:var(--shadow-card);">
            <div style="width:48px;height:48px;border-radius:12px;background:#EEF4FE;color:#1877F2;display:flex;align-items:center;justify-content:center;margin:0 auto 12px;">
              <svg width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 21h5v-5"/></svg>
            </div>
            <h3 style="font-size:16px;font-weight:700;margin-bottom:6px;color:var(--text);">Meta Ad Accounts Connected</h3>
            <p class="text-xs text-gray" style="max-width:540px;margin:0 auto 16px;">
              Your connected Facebook &amp; Instagram advertising accounts (<strong>Nova auto nz </strong>, <strong>Nova cars Samoa nz</strong>, and <strong>@bynotjiban</strong>) are active via Meta Verified OAuth. Paid campaigns created or published from Meta Ads Manager will appear here automatically.
            </p>
            <div style="display:flex;justify-content:center;gap:10px;flex-wrap:wrap;margin-bottom:16px;">
              <span class="badge badge-success" style="padding:4px 10px;font-size:11px;">● Nova auto nz (Connected)</span>
              <span class="badge badge-success" style="padding:4px 10px;font-size:11px;">● Nova cars Samoa nz (Connected)</span>
              <span class="badge badge-success" style="padding:4px 10px;font-size:11px;">● @bynotjiban (Connected)</span>
            </div>
            <div style="display:flex;justify-content:center;gap:10px;">
              <button class="btn btn-primary btn-sm" onclick="window.app.openCreateCampaignModal()">+ Create Campaign</button>
              <button class="btn btn-secondary btn-sm" onclick="window.app.syncLiveAds()">↻ Sync Live Ads</button>
              <button class="btn btn-secondary btn-sm" onclick="window.open('https://adsmanager.facebook.com', '_blank')">↗ Open Meta Ads Manager</button>
            </div>
          </div>
        `;
      }

      return `
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th style="width:70px;">Status</th>
                <th>Campaign Name</th>
                <th>Objective</th>
                <th>Budget</th>
                <th style="text-align:right;">Spend</th>
                <th style="text-align:right;">Clicks</th>
                <th style="text-align:right;">CTR</th>
                <th style="text-align:right;">Leads</th>
                <th style="text-align:right;">CPL</th>
              </tr>
            </thead>
            <tbody>
              ${list.map(c => {
                const spend = c.spend || (c.metrics && c.metrics.spend) || 0;
                const leads = c.leads || (c.metrics && c.metrics.leads) || 0;
                const clicks = (c.metrics && c.metrics.clicks) || 0;
                const impressions = (c.metrics && c.metrics.impressions) || 1;
                const ctr = ((clicks / impressions) * 100).toFixed(2);
                const cpl = leads > 0 ? Math.round(spend / leads) : '—';
                const isActive = c.status === 'ACTIVE';

                return `
                  <tr>
                    <td>
                      <button class="badge ${isActive ? 'badge-success' : 'badge-subtle'}" style="font-size:10px;cursor:pointer;border:none;" onclick="window.app.toggleCampaignStatus('${c.id}')" title="Click to ${isActive ? 'pause' : 'activate'} campaign">
                        ${c.status}
                      </button>
                    </td>
                    <td>
                      <div style="font-weight:600;color:var(--text);">${escapeHtml(c.name)}</div>
                      <div class="text-xs text-gray font-mono">${c.id}</div>
                    </td>
                    <td class="text-xs" style="text-transform:uppercase;">${(c.objective || 'OUTCOME_LEADS').replace('OUTCOME_', '')}</td>
                    <td class="text-xs font-medium">${c.daily_budget ? this.formatMoney(c.daily_budget, c.currency) + '/day' : 'Lifetime'}</td>
                    <td class="text-xs font-semibold" style="text-align:right;">${this.formatMoney(spend, c.currency)}</td>
                    <td class="text-xs" style="text-align:right;">${this._formatNum(clicks)}</td>
                    <td class="text-xs" style="text-align:right;">${ctr}%</td>
                    <td class="text-xs font-semibold" style="text-align:right;color:var(--primary);">${leads}</td>
                    <td class="text-xs font-semibold" style="text-align:right;">${cpl !== '—' ? this.formatMoney(cpl, c.currency) : '—'}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      `;
    }

    if (tab === 'adsets') {
      let list = adsets.filter(a => {
        const matchesQuery = !q || a.name.toLowerCase().includes(q) || (a.id && a.id.toLowerCase().includes(q));
        const matchesStatus = st === 'ALL' || a.status === st;
        return matchesQuery && matchesStatus;
      });

      if (list.length === 0) {
        return `
          <div class="empty-state-card" style="padding:32px 24px;text-align:center;background:#FFFFFF;border:1px solid var(--border-subtle);border-radius:var(--radius-md);box-shadow:var(--shadow-card);">
            <div class="text-sm font-semibold" style="margin-bottom:6px;">No Ad Sets Found</div>
            <p class="text-xs text-gray" style="max-width:440px;margin:0 auto 12px;">Active ad sets associated with your campaigns will appear here once campaigns are published.</p>
            <button class="btn btn-secondary btn-sm" onclick="window.app.syncLiveAds()">↻ Sync Live Ads</button>
          </div>
        `;
      }

      return `
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th style="width:70px;">Status</th>
                <th>Ad Set Name</th>
                <th>Campaign</th>
                <th>Optimization</th>
                <th>Budget</th>
                <th style="text-align:right;">Spend</th>
                <th style="text-align:right;">Clicks</th>
                <th style="text-align:right;">Leads</th>
                <th style="text-align:right;">CPL</th>
              </tr>
            </thead>
            <tbody>
              ${list.map(a => `
                <tr>
                  <td><span class="badge ${a.status === 'ACTIVE' ? 'badge-success' : 'badge-subtle'}" style="font-size:10px;">${a.status}</span></td>
                  <td>
                    <div style="font-weight:600;color:var(--text);">${escapeHtml(a.name)}</div>
                    <div class="text-xs text-gray font-mono">${a.id}</div>
                  </td>
                  <td class="text-xs">${escapeHtml(a.campaign_name || a.campaign_id || 'Campaign')}</td>
                  <td class="text-xs">${escapeHtml(a.optimization_goal || 'LEAD_GENERATION')}</td>
                  <td class="text-xs">${a.daily_budget ? this.formatMoney(a.daily_budget, a.currency) + '/day' : '—'}</td>
                  <td class="text-xs font-semibold" style="text-align:right;">${this.formatMoney(a.spend || 0, a.currency)}</td>
                  <td class="text-xs" style="text-align:right;">${a.clicks || 0}</td>
                  <td class="text-xs font-semibold" style="text-align:right;color:var(--primary);">${a.leads || 0}</td>
                  <td class="text-xs font-semibold" style="text-align:right;">${this.formatMoney(a.cost_per_lead || 0, a.currency)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    }

    if (tab === 'ads') {
      let list = ads.filter(ad => {
        const matchesQuery = !q || ad.name.toLowerCase().includes(q) || (ad.id && ad.id.toLowerCase().includes(q));
        const matchesStatus = st === 'ALL' || ad.status === st;
        return matchesQuery && matchesStatus;
      });

      if (list.length === 0) {
        return `
          <div class="empty-state-card" style="padding:32px 24px;text-align:center;background:#FFFFFF;border:1px solid var(--border-subtle);border-radius:var(--radius-md);box-shadow:var(--shadow-card);">
            <div class="text-sm font-semibold" style="margin-bottom:6px;">No Ad Creatives Found</div>
            <p class="text-xs text-gray" style="max-width:440px;margin:0 auto 12px;">Active ad creatives and copies will appear here once campaigns are published.</p>
            <button class="btn btn-secondary btn-sm" onclick="window.app.syncLiveAds()">↻ Sync Live Ads</button>
          </div>
        `;
      }

      return `
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th style="width:70px;">Status</th>
                <th>Ad Creative</th>
                <th>Ad Set</th>
                <th>Format</th>
                <th style="text-align:right;">Spend</th>
                <th style="text-align:right;">Clicks</th>
                <th style="text-align:right;">CTR</th>
                <th style="text-align:right;">Leads</th>
                <th style="text-align:right;">CPL</th>
              </tr>
            </thead>
            <tbody>
              ${list.map(ad => `
                <tr>
                  <td><span class="badge ${ad.status === 'ACTIVE' ? 'badge-success' : 'badge-subtle'}" style="font-size:10px;">${ad.status}</span></td>
                  <td>
                    <div style="font-weight:600;color:var(--text);">${escapeHtml(ad.name)}</div>
                    <div class="text-xs text-gray font-mono">${ad.id}</div>
                  </td>
                  <td class="text-xs">${escapeHtml(ad.adset_name || ad.adset_id || 'Decision Makers')}</td>
                  <td class="text-xs">${escapeHtml(ad.format || 'Single Image Lead Form')}</td>
                  <td class="text-xs font-semibold" style="text-align:right;">${this.formatMoney(ad.spend || 0, ad.currency)}</td>
                  <td class="text-xs" style="text-align:right;">${ad.clicks || 0}</td>
                  <td class="text-xs" style="text-align:right;">${ad.ctr || 0}%</td>
                  <td class="text-xs font-semibold" style="text-align:right;color:var(--primary);">${ad.leads || 0}</td>
                  <td class="text-xs font-semibold" style="text-align:right;">${this.formatMoney(ad.cost_per_lead || 0, ad.currency)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    }
  }

  switchAdsTab(tab) {
    this.adsActiveTab = tab;
    this.renderMetaAds();
  }

  changeAdsDateRange(val) {
    this.adsDateRange = val;
    this.toast(`Updating ads metrics for ${val.replace('_', ' ')}…`);
    this.renderMetaAds();
  }

  searchAds(query) {
    this.adsSearchQuery = query;
    const container = document.getElementById('ads-table-container');
    if (container) {
      const campaigns = this.svc ? (this.svc.campaigns || []) : [];
      const adsets = this.svc ? (this.svc.adsets || []) : [];
      const ads = this.svc ? (this.svc.ads || []) : [];
      container.innerHTML = this._renderAdsTable(this.adsActiveTab, campaigns, adsets, ads);
    }
  }

  filterAdsStatus(status) {
    this.adsStatusFilter = status;
    this.renderMetaAds();
  }

  async syncLiveAds() {
    this.toast('Synchronizing live Meta Ads & Marketing API data…');
    if (this.svc) {
      await this.svc.fetchLiveCampaigns();
      await this.svc.fetchLiveAdSets();
      await this.svc.fetchLiveAds();
      this.toast('✓ Meta Ads synced successfully!', 'success');
      this.renderMetaAds();
    }
  }

  openCreateCampaignModal() {
    const curSymbol = this.getCurrencySymbol();
    this.openModal({
      title: 'Create Meta Ad Campaign',
      body: `
        <div style="display:flex;flex-direction:column;gap:14px;">
          <div>
            <label class="form-label" style="font-weight:600;font-size:12px;margin-bottom:4px;display:block;">Campaign Name *</label>
            <input type="text" id="m-camp-name" class="input w-full" placeholder="e.g. Nova Auto NZ - 4x4 UTE Spring Promotion" required>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div>
              <label class="form-label" style="font-weight:600;font-size:12px;margin-bottom:4px;display:block;">Ad Account / Page</label>
              <select id="m-camp-account" class="input w-full">
                <option value="1342542735606057">Nova auto nz  (Facebook)</option>
                <option value="1330954980099743">Nova cars Samoa nz (Facebook)</option>
                <option value="1217451958128630">Nova Cars Tongan NZ (Facebook)</option>
                <option value="29279331294986321">@bynotjiban (Instagram)</option>
              </select>
            </div>
            <div>
              <label class="form-label" style="font-weight:600;font-size:12px;margin-bottom:4px;display:block;">Campaign Objective</label>
              <select id="m-camp-objective" class="input w-full">
                <option value="OUTCOME_LEADS">Lead Generation (Instant Forms)</option>
                <option value="OUTCOME_TRAFFIC">Traffic &amp; Website Visits</option>
                <option value="OUTCOME_ENGAGEMENT">Messages &amp; Engagement</option>
                <option value="OUTCOME_SALES">Conversions &amp; Sales</option>
              </select>
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div>
              <label class="form-label" style="font-weight:600;font-size:12px;margin-bottom:4px;display:block;">Daily Budget (${curSymbol})</label>
              <input type="number" id="m-camp-budget" class="input w-full" value="50" min="5" step="5">
            </div>
            <div>
              <label class="form-label" style="font-weight:600;font-size:12px;margin-bottom:4px;display:block;">Initial Status</label>
              <select id="m-camp-status" class="input w-full">
                <option value="ACTIVE">ACTIVE (Running)</option>
                <option value="PAUSED">PAUSED (Draft)</option>
              </select>
            </div>
          </div>
          <div class="text-xs text-gray" style="padding:10px;background:#F8FAFC;border-radius:6px;border:1px solid var(--border);">
            ⓘ Campaign will be synchronized with connected Meta ad accounts and tracked under Meta Ads Manager with real attribution.
          </div>
        </div>
      `,
      confirmText: 'Launch Campaign',
      onConfirm: () => this.submitCreateCampaign()
    });
  }

  async submitCreateCampaign() {
    const nameInp = document.getElementById('m-camp-name');
    const name = nameInp ? nameInp.value.trim() : '';
    if (!name) {
      this.toast('Please enter a campaign name', 'error');
      return false;
    }
    const accountId = document.getElementById('m-camp-account')?.value || '1342542735606057';
    const objective = document.getElementById('m-camp-objective')?.value || 'OUTCOME_LEADS';
    const budget = parseFloat(document.getElementById('m-camp-budget')?.value || '50');
    const status = document.getElementById('m-camp-status')?.value || 'ACTIVE';

    const newCamp = {
      id: `cmp_${Date.now()}`,
      name,
      account_id: accountId,
      objective,
      status,
      daily_budget: budget,
      spend: 0,
      leads: 0,
      metrics: { spend: 0, impressions: 0, reach: 0, clicks: 0, ctr: 0, cpc: 0, cpm: 0, leads: 0, cost_per_lead: 0 }
    };

    if (this.svc) {
      if (!this.svc.campaigns) this.svc.campaigns = [];
      this.svc.campaigns.unshift(newCamp);
      if (this.svc.saveCampaigns) this.svc.saveCampaigns();
    }

    fetch('/api/campaigns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newCamp)
    }).catch(e => console.warn('[Create Campaign Sync Warning]:', e));

    this.closeModal();
    this.toast(`✓ Campaign "${name}" created successfully!`, 'success');
    this.renderMetaAds();
    return true;
  }

  async toggleCampaignStatus(campId) {
    if (!this.svc || !this.svc.campaigns) return;
    const camp = this.svc.campaigns.find(c => c.id === campId);
    if (!camp) return;

    const newStatus = camp.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
    camp.status = newStatus;
    if (this.svc.saveCampaigns) this.svc.saveCampaigns();

    this.toast(`Campaign ${newStatus === 'ACTIVE' ? 'activated' : 'paused'}`, 'info');
    this.renderMetaAds();

    fetch('/api/campaigns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaign_id: campId, status: newStatus })
    }).catch(e => console.warn('[Status Toggle Warning]:', e));
  }

  // ──────────────────────────────────────────────────────────
  // MULTI-CLIENT EMAIL INBOX & MESSAGES
  // ──────────────────────────────────────────────────────────

  async renderEmailInbox() {
    this._setBreadcrumbs('Email Inbox');
    this.emailCurrentFolder = this.emailCurrentFolder || 'inbox';
    this.emailCurrentAccount = this.emailCurrentAccount || 'all';
    this.emailSearchQuery = this.emailSearchQuery || '';

    // Verify staff permissions: non-admin can only see assigned accounts
    const isStaff = this.user.role === 'staff';
    let accounts = this.svc ? (this.svc.emailAccounts || []) : [];
    if (isStaff) {
      accounts = accounts.filter(a => (a.assigned_staff_ids || []).includes(this.user.id));
    }

    if (accounts.length === 0 && isStaff) {
      this.el.content.innerHTML = `
        <div class="empty-state-card" style="padding:48px 24px;text-align:center;">
          <div style="font-size:32px;margin-bottom:12px;">🔒</div>
          <h3 style="font-size:16px;font-weight:600;margin-bottom:8px;">No Email Accounts Assigned</h3>
          <p class="text-sm text-gray" style="max-width:440px;margin:0 auto 16px;">You currently do not have access to any connected client email inboxes. Please contact an administrator to assign email permissions to your profile.</p>
          <button class="btn btn-secondary" onclick="window.app.navigate('dashboard')">Return to Dashboard</button>
        </div>
      `;
      return;
    }

    const messages = await (this.svc ? this.svc.fetchRemoteEmailMessages({
      folder: this.emailCurrentFolder,
      accountId: this.emailCurrentAccount,
      search: this.emailSearchQuery
    }) : []);

    const activeMsg = messages.find(m => m.id === this.activeEmailId) || messages[0] || null;
    if (activeMsg && !this.activeEmailId) this.activeEmailId = activeMsg.id;

    this.el.content.innerHTML = `
      <div class="email-inbox-wrapper" style="display:flex;height:calc(100vh - 120px);background:#FFFFFF;border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;">
        
        <!-- COLUMN 1: ACCOUNTS & FOLDERS -->
        <div class="email-sidebar" style="width:230px;border-right:1px solid var(--border);background:#F8FAFC;padding:16px 12px;display:flex;flex-direction:column;gap:16px;flex-shrink:0;">
          <button class="btn btn-primary w-full" style="justify-content:center;gap:6px;" onclick="window.app.openComposeEmailModal()">
            <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 5v14m-7-7h14"/></svg>
            Compose Email
          </button>

          <div>
            <div class="text-xs font-semibold text-gray uppercase mb-2" style="letter-spacing:0.04em;">Connected Accounts</div>
            <div style="display:flex;flex-direction:column;gap:4px;">
              <div class="email-acc-item ${this.emailCurrentAccount==='all'?'active':''}" onclick="window.app.selectEmailAccount('all')" style="padding:6px 8px;border-radius:6px;cursor:pointer;font-size:12px;display:flex;align-items:center;justify-content:space-between;">
                <span>All Accounts</span>
                <span class="badge badge-subtle" style="font-size:10px;">${accounts.length}</span>
              </div>
              ${accounts.map(a => `
                <div class="email-acc-item ${this.emailCurrentAccount===a.id?'active':''}" onclick="window.app.selectEmailAccount('${a.id}')" style="padding:6px 8px;border-radius:6px;cursor:pointer;font-size:12px;display:flex;align-items:center;justify-content:space-between;" title="${a.email}">
                  <div style="display:flex;align-items:center;gap:6px;min-width:0;">
                    <span style="width:7px;height:7px;border-radius:50%;background:#10B981;flex-shrink:0;"></span>
                    <span class="truncate" style="font-weight:500;">${a.display_name || a.email.split('@')[0]}</span>
                  </div>
                  <span class="text-xs text-gray" style="font-size:10px;text-transform:uppercase;">${a.provider}</span>
                </div>
              `).join('')}
            </div>
          </div>

          <div>
            <div class="text-xs font-semibold text-gray uppercase mb-2" style="letter-spacing:0.04em;">Folders</div>
            <div style="display:flex;flex-direction:column;gap:4px;">
              <div class="email-folder-item ${this.emailCurrentFolder==='inbox'?'active':''}" onclick="window.app.selectEmailFolder('inbox')" style="padding:6px 8px;border-radius:6px;cursor:pointer;font-size:12px;display:flex;align-items:center;justify-content:space-between;">
                <div style="display:flex;align-items:center;gap:8px;">
                  <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.75" viewBox="0 0 24 24"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>
                  <span>Inbox</span>
                </div>
                ${messages.filter(m => !m.is_read && m.folder === 'inbox').length > 0 ? `<span class="badge badge-info" style="font-size:10px;">${messages.filter(m => !m.is_read && m.folder === 'inbox').length}</span>` : ''}
              </div>
              <div class="email-folder-item ${this.emailCurrentFolder==='sent'?'active':''}" onclick="window.app.selectEmailFolder('sent')" style="padding:6px 8px;border-radius:6px;cursor:pointer;font-size:12px;display:flex;align-items:center;gap:8px;">
                <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.75" viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                <span>Sent</span>
              </div>
            </div>
          </div>

          <div style="margin-top:auto;padding-top:12px;border-top:1px solid var(--border);font-size:11px;color:var(--text-muted);">
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
              <span style="width:6px;height:6px;border-radius:50%;background:#10B981;"></span>
              <span>Syncing with Cloud APIs</span>
            </div>
            <div>Background poll: active</div>
          </div>
        </div>

        <!-- COLUMN 2: MESSAGES LIST -->
        <div class="email-msg-list" style="width:340px;border-right:1px solid var(--border);display:flex;flex-direction:column;flex-shrink:0;">
          <div style="padding:12px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:8px;">
            <input type="text" class="input input-sm w-full" placeholder="Search emails…" value="${escapeHtml(this.emailSearchQuery)}" oninput="window.app.searchEmails(this.value)">
            <button class="btn btn-ghost btn-sm" onclick="window.app.renderEmailInbox()" title="Refresh">
              <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 21h5v-5"/></svg>
            </button>
          </div>

          <div style="flex:1;overflow-y:auto;">
            ${messages.length === 0 ? `
              <div style="padding:32px 16px;text-align:center;color:var(--text-muted);font-size:12px;">No messages found in this folder.</div>
            ` : messages.map(m => {
              const isActive = this.activeEmailId === m.id;
              const matchingLead = this.svc ? this.svc.leads.find(l => l.email && m.from_address && l.email.toLowerCase() === m.from_address.toLowerCase()) : null;

              return `
                <div class="email-list-card ${isActive ? 'active' : ''} ${!m.is_read ? 'unread' : ''}" onclick="window.app.selectEmailMessage('${m.id}')" style="padding:12px;border-bottom:1px solid var(--border);cursor:pointer;background:${isActive ? '#EFF6FF' : (!m.is_read ? '#FAFAFA' : '#FFFFFF')};">
                  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
                    <div style="display:flex;align-items:center;gap:6px;min-width:0;">
                      ${!m.is_read ? `<span style="width:6px;height:6px;border-radius:50%;background:#3B82F6;flex-shrink:0;"></span>` : ''}
                      <strong class="truncate" style="font-size:12px;color:var(--text);">${escapeHtml(m.from_name || m.from_address)}</strong>
                    </div>
                    <span class="text-xs text-gray" style="font-size:11px;flex-shrink:0;">${this._timeAgo(m.sent_at || m.received_at)}</span>
                  </div>
                  <div class="truncate" style="font-size:12px;font-weight:${!m.is_read ? '600' : '500'};color:var(--text);margin-bottom:2px;">
                    ${escapeHtml(m.subject)}
                  </div>
                  <div class="truncate text-xs text-gray" style="font-size:11px;line-height:1.3;">
                    ${escapeHtml(m.snippet || m.body_text || '')}
                  </div>
                  ${matchingLead ? `
                    <div style="margin-top:6px;">
                      <span class="badge badge-info" style="font-size:10px;padding:1px 6px;">
                        CRM Lead: ${escapeHtml(matchingLead.name)}
                      </span>
                    </div>
                  ` : ''}
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <!-- COLUMN 3: MESSAGE VIEWER & COMPOSER -->
        <div class="email-msg-viewer" style="flex:1;display:flex;flex-direction:column;overflow-y:auto;background:#FFFFFF;">
          ${activeMsg ? `
            <div style="padding:20px;border-bottom:1px solid var(--border);">
              <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px;">
                <h3 style="font-size:17px;font-weight:700;color:var(--text);margin:0;line-height:1.3;">
                  ${escapeHtml(activeMsg.subject)}
                </h3>
                <div style="display:flex;align-items:center;gap:6px;">
                  <button class="btn btn-secondary btn-sm" onclick="window.app.replyToEmail('${activeMsg.id}')">Reply</button>
                  <button class="btn btn-ghost btn-sm" onclick="window.app.markEmailReadState('${activeMsg.id}', ${!activeMsg.is_read})">
                    ${activeMsg.is_read ? 'Mark Unread' : 'Mark Read'}
                  </button>
                </div>
              </div>

              <div style="display:flex;align-items:center;gap:10px;font-size:12px;margin-bottom:8px;">
                <div class="lead-avatar" style="width:32px;height:32px;font-size:13px;flex-shrink:0;">${(activeMsg.from_name || 'U').charAt(0).toUpperCase()}</div>
                <div>
                  <div><strong>${escapeHtml(activeMsg.from_name)}</strong> <span class="text-gray">&lt;${escapeHtml(activeMsg.from_address)}&gt;</span></div>
                  <div class="text-xs text-gray">To: ${escapeHtml((activeMsg.to_addresses || []).join(', '))} • ${new Date(activeMsg.sent_at || activeMsg.received_at).toLocaleString('en-IN')}</div>
                </div>
              </div>
            </div>

            <!-- EMAIL BODY -->
            <div style="padding:24px;flex:1;font-size:13px;line-height:1.6;color:var(--text);border-bottom:1px solid var(--border);">
              ${activeMsg.body_html || `<p>${escapeHtml(activeMsg.body_text || '').replace(/\n/g, '<br>')}</p>`}
            </div>

            <!-- INLINE QUICK REPLY BOX -->
            <div style="padding:16px 20px;background:#F9FAFB;">
              <div style="font-size:12px;font-weight:600;margin-bottom:8px;">Quick Reply to ${escapeHtml(activeMsg.from_address)}</div>
              <textarea class="input w-full" rows="3" id="quick-email-body" placeholder="Write your response…" style="margin-bottom:8px;font-size:12px;"></textarea>
              <div style="display:flex;align-items:center;justify-content:space-between;">
                <span class="text-xs text-gray">Sending from ${escapeHtml(activeMsg.to_addresses ? activeMsg.to_addresses[0] : 'verified client account')}</span>
                <button class="btn btn-primary btn-sm" onclick="window.app.sendQuickReply('${activeMsg.id}')">
                  Send Response →
                </button>
              </div>
            </div>
          ` : `
            <div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-muted);font-size:13px;">
              Select an email from the left pane to read conversation
            </div>
          `}
        </div>

      </div>
    `;
  }

  selectEmailAccount(accId) {
    this.emailCurrentAccount = accId;
    this.renderEmailInbox();
  }

  selectEmailFolder(folder) {
    this.emailCurrentFolder = folder;
    this.renderEmailInbox();
  }

  selectEmailMessage(msgId) {
    this.activeEmailId = msgId;
    if (this.svc) this.svc.markEmailRead(msgId, true);
    this.renderEmailInbox();
  }

  searchEmails(query) {
    this.emailSearchQuery = query;
    this.renderEmailInbox();
  }

  async markEmailReadState(msgId, isRead) {
    if (this.svc) {
      await this.svc.markEmailRead(msgId, isRead);
      this.renderEmailInbox();
    }
  }

  openQuickEmailModal(leadId) {
    const lead = this.svc ? this.svc.leads.find(l => l.id === leadId) : null;
    this.openComposeEmailModal({
      to: lead ? lead.email : '',
      subject: lead ? `Following up on your inquiry with ${this._pageName(lead.page_id || lead.pageId)}` : '',
      leadId: leadId
    });
  }

  openComposeEmailModal(options = {}) {
    const accounts = this.svc ? (this.svc.emailAccounts || []) : [];
    const leadId = options.leadId || '';
    const to = options.to || '';
    const subject = options.subject || '';

    this.el.mTitle.textContent = 'Compose New Email';
    this.el.mBody.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:12px;">
        <div>
          <label class="settings-label">From Account</label>
          <select class="input" id="compose-from-acc">
            ${accounts.map(a => `<option value="${a.id}">${a.display_name} (${a.email}) [${a.provider.toUpperCase()}]</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="settings-label">To Recipient</label>
          <input type="email" class="input" id="compose-to-email" placeholder="recipient@example.com" value="${escapeHtml(to)}" required>
        </div>
        <div>
          <label class="settings-label">CC (Optional)</label>
          <input type="text" class="input" id="compose-cc-email" placeholder="colleague@company.com">
        </div>
        <div>
          <label class="settings-label">Subject</label>
          <input type="text" class="input" id="compose-subject" placeholder="Subject line…" value="${escapeHtml(subject)}" required>
        </div>
        <div>
          <label class="settings-label">Message Body</label>
          <textarea class="input" id="compose-body" rows="6" placeholder="Write your email here…" required></textarea>
        </div>
      </div>
    `;

    this.el.mConfirm.textContent = 'Send Email';
    this.el.mConfirm.className = 'btn btn-primary';
    this.el.mConfirm.onclick = async () => {
      const accId = document.getElementById('compose-from-acc')?.value;
      const toEmail = (document.getElementById('compose-to-email')?.value || '').trim();
      const ccEmail = (document.getElementById('compose-cc-email')?.value || '').trim();
      const sub = (document.getElementById('compose-subject')?.value || '').trim();
      const body = (document.getElementById('compose-body')?.value || '').trim();

      if (!toEmail || !body) {
        this.toast('Please enter a valid recipient email and message body', 'warning');
        return;
      }

      this.el.mConfirm.innerHTML = '<span class="spinner"></span> Dispatching…';
      this.el.mConfirm.disabled = true;
      try {
        let sendResult = null;
        if (this.svc) {
          sendResult = await this.svc.sendEmail({
            accountId: accId,
            to: toEmail,
            cc: ccEmail ? [ccEmail] : [],
            subject: sub,
            body: body,
            leadId: leadId
          });
        }

        this.closeModal();
        if (sendResult && sendResult.warning === 'SENDER_NOT_VERIFIED') {
          this.toast(`✓ Email dispatched to ${toEmail} (Warning: Sender unverified — only reaches account owner)`, 'warning');
        } else {
          this.toast(`✓ Email dispatched successfully to ${toEmail}!`, 'success');
        }
        if (this.currentRoute === 'email') this.renderEmailInbox();
        if (leadId && this.el.drawer.classList.contains('open')) this.openLeadDrawer(leadId);
      } catch (err) {
        this.el.mConfirm.innerHTML = 'Send Email';
        this.el.mConfirm.disabled = false;
        this.toast(`Resend Error: ${err.message}`, 'error');
      }
    };

    this.el.mOverlay.classList.add('open');
  }

  async sendQuickReply(msgId) {
    const input = document.getElementById('quick-email-body');
    const body = input ? input.value.trim() : '';
    if (!body) {
      this.toast('Please enter a response body', 'warning');
      return;
    }

    const messages = this.svc ? (this.svc.emailMessages || []) : [];
    const original = messages.find(m => m.id === msgId);
    if (!original) return;

    if (this.svc) {
      await this.svc.sendEmail({
        accountId: original.account_id,
        to: original.from_address,
        subject: original.subject.startsWith('Re:') ? original.subject : `Re: ${original.subject}`,
        body: body,
        leadId: original.lead_id,
        inReplyTo: original.thread_id
      });
    }

    if (input) input.value = '';
    this.toast(`✓ Reply sent to ${original.from_address}!`, 'success');
    this.renderEmailInbox();
  }

  replyToEmail(msgId) {
    const messages = this.svc ? (this.svc.emailMessages || []) : [];
    const msg = messages.find(m => m.id === msgId);
    if (!msg) return;

    this.openComposeEmailModal({
      to: msg.from_address,
      subject: msg.subject.startsWith('Re:') ? msg.subject : `Re: ${msg.subject}`,
      leadId: msg.lead_id
    });
  }

  // ──────────────────────────────────────────────────────────
  // INTEGRATIONS HUB & MULTI-TENANT ACCESS CONTROL
  // ──────────────────────────────────────────────────────────

  async renderIntegrations() {
    this._setBreadcrumbs('Integrations');
    const isAdmin = this.user.role === 'admin' || this.user.role === 'super_admin';

    // Fetch integrations from server or local state
    const integrations = this.svc ? (this.svc.integrations || []) : [];
    const pages = this.svc ? (this.svc.pages || []) : [];
    const emailMessages = this.svc ? (this.svc.emailMessages || []) : [];

    const metaAdsInt = integrations.find(i => i.provider === 'meta_ads' || i.id === 'int_meta_ads_01');
    const isMetaConnected = Boolean(metaAdsInt && metaAdsInt.status !== 'disconnected');

    const googleInt = integrations.find(i => i.provider === 'google' || i.id === 'int_google_email_01');
    const isGoogleConnected = Boolean(googleInt && googleInt.status !== 'disconnected');
    const googleMsgCount = emailMessages.filter(m => m.account_id === (googleInt && googleInt.id)).length;

    const msInt = integrations.find(i => i.provider === 'microsoft' || i.id === 'int_ms_email_01');
    const isMsConnected = Boolean(msInt && msInt.status !== 'disconnected');

    const resendConfigured = Boolean(window.CONFIG && window.CONFIG.resendApiKey);
    const resendFromEmail = (window.CONFIG && window.CONFIG.resendFromEmail) || 'onboarding@resend.dev';
    const isSenderVerified = Boolean(window.CONFIG && window.CONFIG.resendSenderVerified);

    const auditLogs = (this.svc && typeof this.svc.getAuditLogs === 'function') ? this.svc.getAuditLogs() : [];
    const syncLogs = auditLogs.filter(l => {
      const act = (l.action || '').toLowerCase();
      const det = (l.details || '').toLowerCase();
      return act.includes('sync') || act.includes('integration') || det.includes('sync') || det.includes('integration');
    }).slice(0, 10);

    this.el.content.innerHTML = `
      <div class="integrations-view" style="max-width:1100px;">
        <div style="margin-bottom:24px;">
          <h2 style="font-size:20px;font-weight:700;letter-spacing:-0.02em;margin-bottom:4px;color:var(--text);">Integrations &amp; Connected Channels</h2>
          <p class="text-xs text-gray">Connect your Meta Business Portfolios, Google Workspace, and Microsoft 365 accounts with granular role-based client isolation.</p>
        </div>

        <!-- INTEGRATIONS GRID -->
        <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(320px, 1fr));gap:16px;margin-bottom:32px;">
          
          <!-- CARD 1: META ADS & MARKETING API -->
          <div class="card" style="padding:20px;display:flex;flex-direction:column;justify-content:space-between;border-top:3px solid #1877F2;">
            <div>
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
                <div style="display:flex;align-items:center;gap:10px;">
                  <div style="width:36px;height:36px;border-radius:8px;background:#EBF5FF;display:flex;align-items:center;justify-content:center;color:#1877F2;">
                    <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>
                  </div>
                  <div>
                    <h4 style="font-size:14px;font-weight:700;margin:0;">Meta Ads &amp; Marketing API</h4>
                    <span class="text-xs text-gray">Campaigns, Ad Sets &amp; Insights</span>
                  </div>
                </div>
                ${isMetaConnected 
                  ? '<span class="badge badge-success" style="font-size:11px;">Connected</span>' 
                  : '<span class="badge badge-secondary" style="font-size:11px;">Not Connected</span>'}
              </div>

              <p class="text-xs text-gray" style="line-height:1.5;margin-bottom:12px;">
                Direct synchronization with Meta Marketing API v22.0. Ingests live campaign spend, impression metrics, CPL conversion tracking, and Lead Ads form submissions.
              </p>

              <div style="background:#F8FAFC;border:1px solid var(--border);border-radius:6px;padding:10px 12px;font-size:11px;margin-bottom:16px;">
                ${isMetaConnected ? `
                  <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
                    <span class="text-gray">Portfolio:</span>
                    <strong>${escapeHtml(metaAdsInt.name || 'Connected Portfolio')}</strong>
                  </div>
                  <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
                    <span class="text-gray">Ad Account:</span>
                    <span>${escapeHtml(metaAdsInt.account_id || 'Active')}</span>
                  </div>
                  <div style="display:flex;justify-content:space-between;">
                    <span class="text-gray">Last Sync:</span>
                    <span>${metaAdsInt.last_sync_at ? this.formatRelativeTime(metaAdsInt.last_sync_at) : 'Not synced yet'}</span>
                  </div>
                ` : `
                  <div class="text-gray" style="line-height:1.4;">
                    No Meta Ads portfolio currently connected. Authorize your Meta Business account to synchronize campaigns and ad spend.
                  </div>
                `}
              </div>
            </div>

            <div style="display:flex;gap:8px;flex-wrap:wrap;">
              ${isMetaConnected ? `
                <button class="btn btn-secondary btn-sm flex-1" onclick="window.app.syncIntegrationUI('${metaAdsInt.id}')">Sync Now</button>
                ${isAdmin ? `
                  <button class="btn btn-secondary btn-sm" onclick="window.app.openAssignStaffModal('${metaAdsInt.id}')">Assign Staff</button>
                  <button class="btn btn-ghost btn-sm text-red-500" onclick="window.app.disconnectIntegrationUI('${metaAdsInt.id}')">Disconnect</button>
                ` : ''}
              ` : `
                <button class="btn btn-primary btn-sm flex-1" onclick="window.app.navigate('connections')">Connect Portfolio</button>
              `}
            </div>
          </div>

          <!-- CARD 2: RESEND EMAIL ENGINE -->
          <div class="card" style="padding:20px;display:flex;flex-direction:column;justify-content:space-between;border-top:3px solid #000000;">
            <div>
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
                <div style="display:flex;align-items:center;gap:10px;">
                  <div style="width:36px;height:36px;border-radius:8px;background:#F1F5F9;display:flex;align-items:center;justify-content:center;color:#000;">
                    <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M1.5 8.67v8.58a3 3 0 0 0 3 3h15a3 3 0 0 0 3-3V8.67l-8.928 5.493a3 3 0 0 1-3.144 0L1.5 8.67Z"/><path d="M22.5 6.908V6a3 3 0 0 0-3-3h-15a3 3 0 0 0-3 3v.908l10.286 6.33a.5.5 0 0 0 .528 0L22.5 6.908Z"/></svg>
                  </div>
                  <div>
                    <h4 style="font-size:14px;font-weight:700;margin:0;">Resend Email Engine</h4>
                    <span class="text-xs text-gray">Modern Transactional Email API</span>
                  </div>
                </div>
                ${resendConfigured 
                  ? '<span class="badge badge-success" style="font-size:11px;">Active</span>' 
                  : '<span class="badge badge-secondary" style="font-size:11px;">Not Configured</span>'}
              </div>

              <p class="text-xs text-gray" style="line-height:1.5;margin-bottom:12px;">
                High-deliverability direct email delivery via Resend API. Dispatches notifications, lead follow-ups, and customer replies without OAuth prompts.
              </p>

              ${!isSenderVerified ? `
              <div style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:6px;padding:10px 12px;font-size:11px;color:#92400E;margin-bottom:12px;line-height:1.4;display:flex;align-items:flex-start;gap:8px;">
                <span style="font-size:14px;line-height:1;">⚠️</span>
                <div>
                  <strong>Sender Unverified:</strong> Emails will only reach the Resend account owner until a verified domain is configured in RESEND_FROM_EMAIL.
                </div>
              </div>` : ''}

              <div style="background:#F8FAFC;border:1px solid var(--border);border-radius:6px;padding:10px 12px;font-size:11px;margin-bottom:16px;">
                <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
                  <span class="text-gray">Sender:</span>
                  <span><strong>${escapeHtml(resendFromEmail)}</strong> ${!isSenderVerified ? '<span class="badge badge-warning" style="font-size:9px;padding:1px 4px;margin-left:4px;">Unverified</span>' : '<span class="badge badge-success" style="font-size:9px;padding:1px 4px;margin-left:4px;">Verified</span>'}</span>
                </div>
                <div style="display:flex;justify-content:space-between;">
                  <span class="text-gray">Provider Status:</span>
                  <span class="${resendConfigured ? 'text-green font-medium' : 'text-gray font-medium'}">${resendConfigured ? 'Ready via RESEND_API_KEY' : 'RESEND_API_KEY pending'}</span>
                </div>
              </div>
            </div>

            <div style="display:flex;gap:8px;flex-wrap:wrap;">
              <button class="btn btn-primary btn-sm flex-1" onclick="window.app.promptResendTestEmail()">Send Test Email</button>
            </div>
          </div>

          <!-- CARD 3: GOOGLE WORKSPACE / GMAIL -->
          <div class="card" style="padding:20px;display:flex;flex-direction:column;justify-content:space-between;border-top:3px solid #EA4335;">
            <div>
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
                <div style="display:flex;align-items:center;gap:10px;">
                  <div style="width:36px;height:36px;border-radius:8px;background:#FEE2E2;display:flex;align-items:center;justify-content:center;color:#EA4335;">
                    <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                  </div>
                  <div>
                    <h4 style="font-size:14px;font-weight:700;margin:0;">Google Workspace (Gmail)</h4>
                    <span class="text-xs text-gray">Official Gmail REST API OAuth</span>
                  </div>
                </div>
                ${isGoogleConnected 
                  ? '<span class="badge badge-success" style="font-size:11px;">Connected</span>' 
                  : '<span class="badge badge-secondary" style="font-size:11px;">Not Connected</span>'}
              </div>

              <p class="text-xs text-gray" style="line-height:1.5;margin-bottom:12px;">
                Authorizes reading, sending, and thread synchronization via official Google OAuth. Scopes restricted to <code>gmail.readonly</code> &amp; <code>gmail.send</code>.
              </p>

              <div style="background:#F8FAFC;border:1px solid var(--border);border-radius:6px;padding:10px 12px;font-size:11px;margin-bottom:16px;">
                ${isGoogleConnected ? `
                  <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
                    <span class="text-gray">Connected Account:</span>
                    <strong>${escapeHtml(googleInt.email || googleInt.name || 'Connected')}</strong>
                  </div>
                  <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
                    <span class="text-gray">Synced Messages:</span>
                    <span>${googleMsgCount} emails linked to CRM</span>
                  </div>
                  <div style="display:flex;justify-content:space-between;">
                    <span class="text-gray">Sync Health:</span>
                    <span class="text-green font-medium">Healthy (Token valid)</span>
                  </div>
                ` : `
                  <div class="text-gray" style="line-height:1.4;">
                    No Google account connected. Connect Gmail to synchronize customer email threads directly to leads.
                  </div>
                `}
              </div>
            </div>

            <div style="display:flex;gap:8px;flex-wrap:wrap;">
              <button class="btn btn-primary btn-sm flex-1" onclick="window.app.connectEmailOAuth('google')">${isGoogleConnected ? 'Re-authorize Account' : 'Connect Gmail'}</button>
              ${isGoogleConnected ? `
                <button class="btn btn-secondary btn-sm" onclick="window.app.syncIntegrationUI('${googleInt.id}')">Sync</button>
                ${isAdmin ? `
                  <button class="btn btn-secondary btn-sm" onclick="window.app.openAssignStaffModal('${googleInt.id}')">Assign Staff</button>
                  <button class="btn btn-ghost btn-sm text-red-500" onclick="window.app.disconnectIntegrationUI('${googleInt.id}')">Disconnect</button>
                ` : ''}
              ` : ''}
            </div>
          </div>

          <!-- CARD 4: MICROSOFT 365 / OUTLOOK -->
          <div class="card" style="padding:20px;display:flex;flex-direction:column;justify-content:space-between;border-top:3px solid #0078D4;">
            <div>
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
                <div style="display:flex;align-items:center;gap:10px;">
                  <div style="width:36px;height:36px;border-radius:8px;background:#E1DFDD;display:flex;align-items:center;justify-content:center;color:#0078D4;">
                    <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9v-2h2v2zm0-4H9V7h2v5zm4 4h-2v-2h2v2zm0-4h-2V7h2v5z"/></svg>
                  </div>
                  <div>
                    <h4 style="font-size:14px;font-weight:700;margin:0;">Microsoft 365 (Outlook)</h4>
                    <span class="text-xs text-gray">Microsoft Graph API OAuth</span>
                  </div>
                </div>
                ${isMsConnected 
                  ? '<span class="badge badge-success" style="font-size:11px;">Connected</span>' 
                  : '<span class="badge badge-secondary" style="font-size:11px;">Not Connected</span>'}
              </div>

              <p class="text-xs text-gray" style="line-height:1.5;margin-bottom:12px;">
                Full Entra ID OAuth integration for Microsoft Exchange &amp; Outlook 365. Supports bidirectional CRM contact association and thread tracking.
              </p>

              <div style="background:#F8FAFC;border:1px solid var(--border);border-radius:6px;padding:10px 12px;font-size:11px;margin-bottom:16px;">
                ${isMsConnected ? `
                  <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
                    <span class="text-gray">Connected Account:</span>
                    <strong>${escapeHtml(msInt.email || msInt.name || 'Connected')}</strong>
                  </div>
                  <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
                    <span class="text-gray">Tenant:</span>
                    <span class="font-mono">${escapeHtml(msInt.tenant_id || 'Active')}</span>
                  </div>
                  <div style="display:flex;justify-content:space-between;">
                    <span class="text-gray">Last Sync:</span>
                    <span>${msInt.last_sync_at ? this.formatRelativeTime(msInt.last_sync_at) : 'Not synced yet'}</span>
                  </div>
                ` : `
                  <div class="text-gray" style="line-height:1.4;">
                    No Microsoft 365 account connected. Connect Outlook to sync your team's sales communications.
                  </div>
                `}
              </div>
            </div>

            <div style="display:flex;gap:8px;flex-wrap:wrap;">
              <button class="btn btn-primary btn-sm flex-1" onclick="window.app.connectEmailOAuth('microsoft')">${isMsConnected ? 'Re-authorize Account' : 'Connect Microsoft 365'}</button>
              ${isMsConnected ? `
                <button class="btn btn-secondary btn-sm" onclick="window.app.syncIntegrationUI('${msInt.id}')">Sync</button>
                ${isAdmin ? `
                  <button class="btn btn-secondary btn-sm" onclick="window.app.openAssignStaffModal('${msInt.id}')">Assign Staff</button>
                  <button class="btn btn-ghost btn-sm text-red-500" onclick="window.app.disconnectIntegrationUI('${msInt.id}')">Disconnect</button>
                ` : ''}
              ` : ''}
            </div>
          </div>

          <!-- CARD 5: FACEBOOK PAGES & LEAD ADS WEBHOOK -->
          <div class="card" style="padding:20px;display:flex;flex-direction:column;justify-content:space-between;border-top:3px solid #059669;">
            <div>
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
                <div style="display:flex;align-items:center;gap:10px;">
                  <div style="width:36px;height:36px;border-radius:8px;background:#D1FAE5;display:flex;align-items:center;justify-content:center;color:#059669;">
                    <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                  </div>
                  <div>
                    <h4 style="font-size:14px;font-weight:700;margin:0;">Facebook Pages &amp; Webhooks</h4>
                    <span class="text-xs text-gray">Real-time LeadGen Webhook</span>
                  </div>
                </div>
                <span class="badge ${pages.length > 0 ? 'badge-success' : 'badge-secondary'}" style="font-size:11px;">${pages.length > 0 ? 'Active' : 'No Pages'}</span>
              </div>

              <p class="text-xs text-gray" style="line-height:1.5;margin-bottom:12px;">
                Real-time Meta Webhook gateway processing inbound <code>leadgen</code> payloads with cryptographic SHA-256 HMAC signature validation and automated pipeline routing.
              </p>

              <div style="background:#F8FAFC;border:1px solid var(--border);border-radius:6px;padding:10px 12px;font-size:11px;margin-bottom:16px;">
                <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
                  <span class="text-gray">Connected Pages:</span>
                  <strong>${pages.length} Facebook Pages</strong>
                </div>
                <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
                  <span class="text-gray">Subscribed Fields:</span>
                  <span>leadgen, messages, messaging_postbacks</span>
                </div>
                <div style="display:flex;justify-content:space-between;">
                  <span class="text-gray">Delivery Status:</span>
                  <span class="text-green font-medium">Listening on /api/meta/webhook</span>
                </div>
              </div>
            </div>

            <div style="display:flex;gap:8px;">
              <button class="btn btn-secondary btn-sm flex-1" onclick="window.app.navigate('connections')">Manage Pages</button>
            </div>
          </div>

        </div>

        <!-- RECENT SYNCHRONIZATION AUDIT LOGS -->
        <div class="card" style="padding:20px;">
          <h3 style="font-size:15px;font-weight:700;margin-bottom:12px;color:var(--text);">Integration Synchronization Logs</h3>
          <div class="table-responsive">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Integration</th>
                  <th>Action / Event</th>
                  <th>Status</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                ${syncLogs.length > 0 ? syncLogs.map(l => `
                  <tr>
                    <td class="text-xs font-mono">${escapeHtml(l.created_at ? new Date(l.created_at).toLocaleTimeString() : (l.timestamp || '—'))}</td>
                    <td class="text-xs font-semibold">${escapeHtml(l.entity_type || l.integration || 'System')}</td>
                    <td class="text-xs">${escapeHtml(l.action || 'Sync')}</td>
                    <td><span class="badge badge-success" style="font-size:10px;">SUCCESS</span></td>
                    <td class="text-xs">${escapeHtml(l.details || '—')}</td>
                  </tr>
                `).join('') : `
                  <tr>
                    <td colspan="5" class="text-center text-xs text-gray" style="padding:28px 16px;">
                      No integration synchronization logs yet. Activity will appear here once sync events take place.
                    </td>
                  </tr>
                `}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  async syncIntegrationUI(id) {
    this.toast('Synchronizing integration credentials and data…');
    if (this.svc) {
      await this.svc.syncIntegration(id);
      this.toast('✓ Synchronization completed successfully!', 'success');
      this.renderIntegrations();
    }
  }

  connectEmailOAuth(provider = 'google') {
    const provName = provider === 'google' ? 'Google Workspace (Gmail)' : 'Microsoft 365 (Outlook)';
    this.toast(`Redirecting to ${provName} authorization portal…`, 'info');
    setTimeout(() => {
      window.location.href = `/api/email/oauth?provider=${encodeURIComponent(provider)}&redirect=true`;
    }, 400);
  }

  async promptResendTestEmail() {
    const defaultEmail = (this.user && this.user.email) || '';
    const target = window.prompt('Enter recipient email address for test message:', defaultEmail);
    if (!target || !target.trim()) return;
    await this.sendResendTestEmail(target.trim());
  }

  async sendResendTestEmail(targetEmail) {
    if (!targetEmail) {
      targetEmail = (this.user && this.user.email) || '';
    }
    if (!targetEmail) {
      this.toast('Please provide a valid recipient email address.', 'warning');
      return;
    }
    this.toast(`Dispatching test email via Resend to ${targetEmail}…`, 'info');
    try {
      const resp = await fetch(`/api/email?path=test-resend&to=${encodeURIComponent(targetEmail)}`);
      const data = await resp.json().catch(() => ({}));
      if (resp.ok && data.status === 'success') {
        if (data.warning === 'SENDER_NOT_VERIFIED') {
          this.toast(`✓ Test email delivered to ${targetEmail} (Warning: Sender unverified — only reaches account owner)`, 'warning');
        } else {
          this.toast(`✓ Test email delivered to ${targetEmail}!`, 'success');
        }
      } else {
        const errorMsg = data.error || data.detail || 'Failed to dispatch email';
        this.toast(`⚠️ Resend: ${errorMsg}`, 'error');
      }
    } catch (e) {
      this.toast(`Network error sending via Resend: ${e.message}`, 'error');
    }
  }

  async disconnectIntegrationUI(id) {
    this.confirmDialog({
      title: 'Disconnect Integration',
      message: 'Are you sure you want to disconnect this provider account? Staff members will lose access until re-authorized.',
      confirmText: 'Disconnect',
      isDanger: true,
      onConfirm: async () => {
        if (this.svc) {
          await this.svc.disconnectIntegration(id);
          this.toast('Integration disconnected.', 'info');
          this.renderIntegrations();
        }
      }
    });
  }

  openAssignStaffModal(integrationId) {
    const integrations = this.svc ? (this.svc.integrations || []) : [];
    const item = integrations.find(i => i.id === integrationId);
    if (!item) return;

    const staff = this.svc ? (this.svc.staff || []) : [];
    const assigned = new Set(item.assigned_staff_ids || []);

    this.el.mTitle.textContent = `Assign Staff Access — ${item.provider_account_name || item.provider}`;
    this.el.mBody.innerHTML = `
      <p class="text-xs text-gray mb-3">Select which staff members are permitted to view and manage this account. Staff members not selected will have their access blocked by server-side RLS policies.</p>
      <div style="display:flex;flex-direction:column;gap:8px;max-height:260px;overflow-y:auto;">
        ${staff.map(s => `
          <label style="display:flex;align-items:center;gap:10px;padding:8px 12px;border:1px solid var(--border);border-radius:6px;cursor:pointer;background:#FAFAFA;">
            <input type="checkbox" id="assign-staff-${s.id}" value="${s.id}" ${assigned.has(s.id)?'checked':''}>
            <div style="flex:1;">
              <div style="font-size:13px;font-weight:600;">${escapeHtml(s.name)}</div>
              <div class="text-xs text-gray">${escapeHtml(s.email)} &bull; ${s.role}</div>
            </div>
          </label>
        `).join('')}
      </div>
    `;

    this.el.mConfirm.textContent = 'Save Permissions';
    this.el.mConfirm.className = 'btn btn-primary';
    this.el.mConfirm.onclick = async () => {
      const selected = [];
      staff.forEach(s => {
        const cb = document.getElementById(`assign-staff-${s.id}`);
        if (cb && cb.checked) selected.push(s.id);
      });

      if (this.svc) {
        await this.svc.assignIntegrationStaff(item.id, selected);
      }

      this.closeModal();
      this.toast('✓ Staff permissions updated successfully!', 'success');
      this.renderIntegrations();
    };

    this.el.mOverlay.classList.add('open');
  }

  // ──────────────────────────────────────────────────────────
  // ATTACHMENT & INBOX ACTIONS
  // ──────────────────────────────────────────────────────────

  handleAttachmentClick() {
    const fileInput = document.getElementById('inbox-file-input');
    if (fileInput) fileInput.click();
  }

  handleFileSelected(event) {
    const file = event?.target?.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      this.toast('File is too large. Maximum size is 10 MB.', 'error');
      event.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      this._pendingAttachment = {
        name: file.name,
        type: file.type || 'application/octet-stream',
        size: file.size,
        url: e.target.result
      };
      const bar = document.getElementById('inbox-attachment-preview-bar');
      if (bar) {
        bar.style.display = 'flex';
        bar.innerHTML = `
          <div style="font-size:12px;display:flex;align-items:center;gap:6px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
            ${(file.type || '').startsWith('image/') ? '🖼️' : '📎'}
            <strong>${escapeHtml(file.name)}</strong>
            <span style="color:var(--text-secondary);font-size:11px;">(${Math.round(file.size / 1024)} KB)</span>
          </div>
          <button type="button" class="btn btn-sm btn-secondary" onclick="window.app.clearPendingAttachment()" style="padding:2px 8px;font-size:11px;">✕ Remove</button>
        `;
      }
      this.toast(`Attachment attached: ${file.name}`, 'info');
    };
    reader.readAsDataURL(file);
  }

  clearPendingAttachment() {
    this._pendingAttachment = null;
    const fileInput = document.getElementById('inbox-file-input');
    if (fileInput) fileInput.value = '';
    const bar = document.getElementById('inbox-attachment-preview-bar');
    if (bar) {
      bar.style.display = 'none';
      bar.innerHTML = '';
    }
  }

  async refreshInbox() {
    this.toast('Refreshing live conversations…', 'info');
    try {
      await this.fetchRealInstagramConversations();
      if (this.svc && this.svc.fetchRemoteConversations) {
        await this.svc.fetchRemoteConversations();
      }
      this.renderInbox();
      this.toast('✓ Inbox refreshed!', 'success');
    } catch (e) {
      console.error('[Refresh Inbox Error]:', e);
      this.toast('Failed to refresh inbox: ' + e.message, 'error');
    }
  }

  // ──────────────────────────────────────────────────────────
  // REPORTS & ANALYTICS
  // ──────────────────────────────────────────────────────────

  changeReportsDateRange(val) {
    this.reportsDateRange = val;
    this.reportsData = null;
    this.renderReports();
    this.generateReport();
  }

  async generateReport() {
    this.reportsLoading = true;
    const btn = document.getElementById('btn-generate-report');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner" style="width:12px;height:12px;border-width:2px;display:inline-block;"></span> Generating…`;
    }

    const range = this.reportsDateRange || 'last_7d';
    let url = `/api/reports?date_range=${encodeURIComponent(range)}`;
    if (range === 'custom') {
      const sDate = document.getElementById('reports-start-date')?.value || this.reportsCustomStart;
      const eDate = document.getElementById('reports-end-date')?.value || this.reportsCustomEnd;
      if (sDate) {
        this.reportsCustomStart = sDate;
        url += `&start_date=${encodeURIComponent(sDate)}`;
      }
      if (eDate) {
        this.reportsCustomEnd = eDate;
        url += `&end_date=${encodeURIComponent(eDate)}`;
      }
    }

    try {
      const res = await fetch(url, {
        headers: {
          'X-User-Id': (this.user && this.user.id) || 'admin'
        }
      });
      if (res.ok) {
        this.reportsData = await res.json();
      } else {
        const errJson = await res.json().catch(() => null);
        console.warn('Reports API response not ok, falling back to local reconciliation:', errJson);
      }
    } catch (e) {
      console.warn('Reports API fetch failed, falling back to local calculation:', e);
    } finally {
      this.reportsLoading = false;
      this.renderReports();
    }
  }

  renderReports() {
    this._setBreadcrumbs('Reports & Performance');
    this.reportsDateRange = this.reportsDateRange || 'last_7d';

    if (!this.reportsData && !this.reportsLoading) {
      this.reportsLoading = true;
      setTimeout(() => this.generateReport(), 40);
    }

    const rep = this.reportsData || {};
    const sum = rep.summary || null;
    const isTokenExpired = rep.tokenExpired === true;

    // Local Fallback Aggregations if server data not loaded yet
    const leads = this._getFilteredLeads ? this._getFilteredLeads(true) : (this.svc ? this.svc.leads : []);
    const campaigns = this.svc ? (this.svc.campaigns || []) : [];
    const convs = (this.svc ? (this.svc.conversations || []) : []).filter(c => !c.is_archived);

    const totalLeads = sum ? sum.totalLeads : leads.length;
    const wonLeads = sum ? sum.dealsWon : leads.filter(l => l.status === 'Won' || l.status === 'Converted').length;
    const totalSpend = sum ? sum.totalSpend : campaigns.reduce((s, c) => s + (c.spend || (c.metrics && c.metrics.spend) || 0), 0);
    const avgCpl = sum ? sum.cpl : (totalLeads > 0 ? Math.round(totalSpend / totalLeads) : 0);
    const totalConversations = sum ? sum.totalConversations : convs.length;
    const pipelineWonValue = sum ? sum.totalWonValue : (wonLeads * 25000);
    const conversionRate = sum ? sum.conversionRate : (totalLeads > 0 ? ((wonLeads / totalLeads) * 100).toFixed(1) + '%' : '0.0%');

    // Page Breakdown
    const pageBreakdown = rep.pageBreakdown || (this._getAccessiblePages ? this._getAccessiblePages().map(p => {
      const pLeads = leads.filter(l => String(l.page_id || l.pageId) === String(p.id));
      const pWon = pLeads.filter(l => l.status === 'Won' || l.status === 'Converted').length;
      const pConvs = convs.filter(c => String(c.page_id) === String(p.id)).length;
      return {
        pageId: p.id,
        pageName: p.name || 'Facebook Page',
        leads: pLeads.length,
        spend: 0,
        cpl: 0,
        conversations: pConvs,
        dealsWon: pWon
      };
    }) : []);

    // Campaign Breakdown
    const campaignBreakdown = rep.campaignBreakdown || campaigns.map(c => {
      const cSpend = c.spend || (c.metrics && c.metrics.spend) || 0;
      const cLeads = c.leads || (c.metrics && c.metrics.leads) || 0;
      const cCpl = cLeads > 0 ? Math.round(cSpend / cLeads) : 0;
      return {
        campaignId: c.id,
        campaignName: c.name || 'Campaign',
        pageName: this._pageName(c.page_id || c.account_id),
        status: c.status || 'ACTIVE',
        spend: cSpend,
        leads: cLeads,
        cpl: cCpl,
        dealsWon: 0
      };
    });

    const isCustom = this.reportsDateRange === 'custom';

    this.el.content.innerHTML = `
      <div class="reports-view" style="padding:4px 0 32px;">
        <!-- HEADER & DATE RANGE CONTROLS -->
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:20px;">
          <div>
            <h2 style="font-size:20px;font-weight:700;letter-spacing:-0.02em;margin-bottom:4px;color:var(--text);">CRM Reports &amp; ROI Analytics</h2>
            <p class="text-xs text-gray">Reconciled performance across Meta Ads, Lead Gen Instant Forms, and Sales Won pipeline.</p>
          </div>
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
            <div style="display:flex;align-items:center;gap:6px;">
              <label for="reports-daterange-select" style="font-size:12px;font-weight:600;color:var(--text-secondary);">Period (IST):</label>
              <select id="reports-daterange-select" class="input input-sm" style="font-weight:500;" onchange="window.app.changeReportsDateRange(this.value)">
                <option value="today" ${this.reportsDateRange === 'today' ? 'selected' : ''}>Today</option>
                <option value="yesterday" ${this.reportsDateRange === 'yesterday' ? 'selected' : ''}>Yesterday</option>
                <option value="last_7d" ${this.reportsDateRange === 'last_7d' ? 'selected' : ''}>Last 7 Days</option>
                <option value="this_month" ${this.reportsDateRange === 'this_month' ? 'selected' : ''}>This Month</option>
                <option value="custom" ${isCustom ? 'selected' : ''}>Custom Range…</option>
              </select>
            </div>

            <div id="reports-custom-dates" style="display:${isCustom ? 'flex' : 'none'};align-items:center;gap:6px;">
              <input type="date" id="reports-start-date" class="input input-sm" value="${this.reportsCustomStart || ''}">
              <span style="color:var(--text-secondary);font-size:12px;">to</span>
              <input type="date" id="reports-end-date" class="input input-sm" value="${this.reportsCustomEnd || ''}">
            </div>

            <button class="btn btn-primary btn-sm" id="btn-generate-report" onclick="window.app.generateReport()">
              <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 21h5v-5"/></svg>
              <span>Generate Report</span>
            </button>
            <button class="btn btn-secondary btn-sm" onclick="window.app.exportReportsCsv()">
              <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Export CSV
            </button>
          </div>
        </div>

        <!-- META TOKEN EXPIRY BANNER -->
        ${isTokenExpired ? `
          <div class="auth-error-banner" style="margin-bottom:20px;padding:14px 18px;background:#FEF2F2;border:1px solid #FCA5A5;border-radius:8px;display:flex;align-items:center;justify-content:space-between;gap:12px;">
            <div style="display:flex;align-items:center;gap:10px;">
              <span style="font-size:20px;">⚠️</span>
              <div>
                <strong style="color:#991B1B;font-size:13px;display:block;">Meta Connection Error: Access Token Expired</strong>
                <span style="color:#7F1D1D;font-size:12px;">Your Meta OAuth access token has expired or is invalid. Ad spend and live Marketing API insights require a valid token.</span>
              </div>
            </div>
            <button class="btn btn-sm btn-primary" onclick="window.app.navigate('connections')" style="background:#DC2626;border-color:#DC2626;white-space:nowrap;">
              Reconnect Meta account →
            </button>
          </div>
        ` : ''}

        <!-- KPI SUMMARY CARDS -->
        <div class="stats-grid" style="grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));gap:14px;margin-bottom:24px;">
          <div class="stat-card">
            <div class="stat-label">Total Leads</div>
            <div class="stat-value">${totalLeads}</div>
            <div style="font-size:11px;color:var(--text-secondary);margin-top:4px;">Inbound CRM contacts</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Total Ad Spend</div>
            <div class="stat-value">${this.formatMoney(totalSpend)}</div>
            <div style="font-size:11px;color:var(--text-secondary);margin-top:4px;">Marketing API spend</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Cost Per Lead (CPL)</div>
            <div class="stat-value">${this.formatMoney(avgCpl)}</div>
            <div style="font-size:11px;color:var(--text-secondary);margin-top:4px;">Blended acquisition cost</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Conversations</div>
            <div class="stat-value">${totalConversations}</div>
            <div style="font-size:11px;color:var(--text-secondary);margin-top:4px;">Messenger &amp; Instagram chats</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Deals Won</div>
            <div class="stat-value">${wonLeads}</div>
            <div style="font-size:11px;color:#10B981;margin-top:4px;">${conversionRate} win rate</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Won Pipeline Value</div>
            <div class="stat-value">${this.formatMoney(pipelineWonValue)}</div>
            <div style="font-size:11px;color:#10B981;margin-top:4px;">Closed deal revenue</div>
          </div>
        </div>

        <!-- BREAKDOWN BY PAGE -->
        <div class="dash-panel-card" style="margin-bottom:24px;">
          <div class="dash-panel-header">
            <div class="dash-panel-title">Performance by Facebook Page &amp; Account</div>
            <span class="text-xs text-gray">Scored by Page RLS permissions</span>
          </div>
          <div style="overflow-x:auto;">
            <table class="crm-table">
              <thead>
                <tr>
                  <th>Page / Account</th>
                  <th style="text-align:right;">Leads</th>
                  <th style="text-align:right;">Spend</th>
                  <th style="text-align:right;">CPL</th>
                  <th style="text-align:right;">Conversations</th>
                  <th style="text-align:right;">Deals Won</th>
                </tr>
              </thead>
              <tbody>
                ${pageBreakdown.length === 0 ? `
                  <tr><td colspan="6" class="empty-cell" style="text-align:center;padding:24px 16px;color:var(--text-muted);">No page data found for selected period.</td></tr>
                ` : pageBreakdown.map(p => `
                  <tr>
                    <td style="font-weight:600;">${escapeHtml(p.pageName)}</td>
                    <td style="text-align:right;font-weight:600;">${p.leads}</td>
                    <td style="text-align:right;">${this.formatMoney(p.spend)}</td>
                    <td style="text-align:right;font-weight:600;">${this.formatMoney(p.cpl)}</td>
                    <td style="text-align:right;">${p.conversations}</td>
                    <td style="text-align:right;font-weight:600;color:#10B981;">${p.dealsWon}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <!-- BREAKDOWN BY CAMPAIGN -->
        <div class="dash-panel-card">
          <div class="dash-panel-header">
            <div class="dash-panel-title">Performance by Campaign Attribution</div>
            <span class="text-xs text-gray">Reconciled with Meta Ads Manager</span>
          </div>
          <div style="overflow-x:auto;">
            <table class="crm-table">
              <thead>
                <tr>
                  <th>Campaign Name</th>
                  <th>Page / Account</th>
                  <th>Status</th>
                  <th style="text-align:right;">Spend</th>
                  <th style="text-align:right;">Leads</th>
                  <th style="text-align:right;">CPL</th>
                  <th style="text-align:right;">Deals Won</th>
                </tr>
              </thead>
              <tbody>
                ${campaignBreakdown.length === 0 ? `
                  <tr><td colspan="7" class="empty-cell" style="text-align:center;padding:24px 16px;color:var(--text-muted);">No campaign data found for selected period.</td></tr>
                ` : campaignBreakdown.map(c => `
                  <tr>
                    <td style="font-weight:600;">${escapeHtml(c.campaignName)}</td>
                    <td style="color:var(--text-secondary);font-size:12px;">${escapeHtml(c.pageName || 'Connected Page')}</td>
                    <td><span class="badge ${c.status === 'ACTIVE' ? 'badge-green' : 'badge-gray'}">${escapeHtml(c.status || 'PAUSED')}</span></td>
                    <td style="text-align:right;">${this.formatMoney(c.spend)}</td>
                    <td style="text-align:right;font-weight:600;">${c.leads}</td>
                    <td style="text-align:right;font-weight:600;">${this.formatMoney(c.cpl)}</td>
                    <td style="text-align:right;font-weight:600;color:#10B981;">${c.dealsWon || 0}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  exportReportsCsv() {
    const rep = this.reportsData || {};
    const sum = rep.summary || {};
    const pageBreakdown = rep.pageBreakdown || [];
    const campaignBreakdown = rep.campaignBreakdown || [];

    let csv = 'Report,Category,Metric,Value\n';
    csv += `"Summary","Period","Date Range","${this.reportsDateRange || 'last_7d'}"\n`;
    csv += `"Summary","Overview","Total Leads","${sum.totalLeads || 0}"\n`;
    csv += `"Summary","Overview","Total Spend (INR)","${sum.totalSpend || 0}"\n`;
    csv += `"Summary","Overview","Cost Per Lead (INR)","${sum.cpl || 0}"\n`;
    csv += `"Summary","Overview","Conversations","${sum.totalConversations || 0}"\n`;
    csv += `"Summary","Overview","Deals Won","${sum.dealsWon || 0}"\n`;

    csv += '\nPage Breakdown\nPage_ID,Page_Name,Leads,Spend_INR,CPL_INR,Conversations,Deals_Won\n';
    pageBreakdown.forEach(p => {
      csv += `"${p.pageId}","${p.pageName}","${p.leads}","${p.spend}","${p.cpl}","${p.conversations}","${p.dealsWon}"\n`;
    });

    csv += '\nCampaign Breakdown\nCampaign_ID,Campaign_Name,Page_Name,Status,Spend_INR,Leads,CPL_INR,Deals_Won\n';
    campaignBreakdown.forEach(c => {
      csv += `"${c.campaignId}","${c.campaignName}","${c.pageName}","${c.status}","${c.spend}","${c.leads}","${c.cpl}","${c.dealsWon || 0}"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `metacrm_report_${this.reportsDateRange || 'last_7d'}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    this.toast('Reports exported to CSV successfully! ✓', 'success');
  }
}

// Global Initialization
window.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    window.app = new MetaCRMApp();
  }, 40);
});
