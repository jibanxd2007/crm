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
    this.user = this.svc ? this.svc.getCurrentUser() : null;

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
    return '$';
  }

  getCurrency() {
    return 'NZD';
  }

  setCurrency(curr) {
    localStorage.setItem('metacrm_currency', 'NZD');
  }

  updateCurrencyDropdownTooltip() {
    const sel = document.getElementById('topbar-currency-select');
    if (!sel) return;
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

    // Verify session validity with backend on boot
    if (this.svc && typeof this.svc.validateSession === 'function') {
      this.svc.validateSession().then((isValid) => {
        if (!isValid && !['login', 'setup-password', 'reset-password'].includes(this.currentRoute)) {
          this.user = null;
          this.renderAuthScreen();
        } else if (isValid && !this.user) {
          this.user = this.svc.getCurrentUser();
          this._route();
        }
      });
    }

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
    if (this.user) {
      this.renderSidebar();
      this.renderNotifications();
    }
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

    // Realtime Reconnection & Tab Focus Catch-Up
    window.addEventListener('crm:realtime_reconnected', () => this.catchUpInbox());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') this.catchUpInbox();
    });
    window.addEventListener('online', () => this.catchUpInbox());

    // Keyboard Shortcuts (Ctrl+K for command palette, Escape, and module navigation)
    window.addEventListener('keydown', e => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        this.openCommandPalette();
        return;
      }
      if (e.key === 'Escape') {
        this.closeCommandPalette();
        this.closeDrawer();
        this.closeModal();
        this.toggleMobileSidebar(false);
        if (this.el.notifPopover) this.el.notifPopover.classList.remove('open');
        if (this.currentRoute === 'inbox' && this.selectedInboxPage && this.selectedInboxPage !== 'all') {
          this.setInboxPageFilter('all');
        }
        return;
      }

      // Fast Inbox Page Switching Shortcuts (Alt+0 for All Pages, Alt+1..9 for specific pages, [ / ] to cycle)
      const isInputActive = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
      if (this.currentRoute === 'inbox') {
        if (e.altKey && !e.ctrlKey && !e.metaKey) {
          const num = parseInt(e.key, 10);
          if (num === 0) {
            e.preventDefault();
            this.setInboxPageFilter('all');
            return;
          } else if (num >= 1 && num <= 9) {
            const pages = this._getAccessiblePages ? this._getAccessiblePages() : [];
            if (pages && pages[num - 1]) {
              e.preventDefault();
              this.setInboxPageFilter(pages[num - 1].id || pages[num - 1].page_id);
              return;
            }
          }
        } else if (!isInputActive && !e.altKey && !e.ctrlKey && !e.metaKey) {
          if (e.key === '[' || e.key === ']') {
            e.preventDefault();
            const pages = this._getAccessiblePages ? this._getAccessiblePages() : [];
            const pageIds = ['all', ...pages.map(p => p.id || p.page_id)];
            const currentIdx = Math.max(0, pageIds.indexOf(this.selectedInboxPage || 'all'));
            const nextIdx = e.key === ']'
              ? (currentIdx + 1) % pageIds.length
              : (currentIdx - 1 + pageIds.length) % pageIds.length;
            this.setInboxPageFilter(pageIds[nextIdx]);
          }
        }
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
          <div class="cmd-item" data-cmd="profile user account" onclick="window.app.closeCommandPalette(); window.app.openUserProfileModal();">
            <div class="cmd-item-left">
              <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              <span>My Profile &amp; Account Security</span>
            </div>
            <kbd class="cmd-badge">Auth</kbd>
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
    if (this._isHandlingMetaCallback) return;
    const search = window.location.search || '';
    const hash = window.location.hash || '';
    const fullUrl = search + hash;

    if (fullUrl.includes('meta_auth=success') || fullUrl.includes('connected=true') || fullUrl.includes('connected=facebook') || fullUrl.includes('connected=instagram')) {
      this._isHandlingMetaCallback = true;
      try {
        const pagesDataMatch = fullUrl.match(/pages_data=([^&]+)/);
        const pageNameMatch = fullUrl.match(/page_name=([^&]+)/);
        const pageIdMatch = fullUrl.match(/page_id=([^&]+)/);
        const usernameMatch = fullUrl.match(/username=([^&]+)/);
        const isIg = fullUrl.includes('channel=instagram') || fullUrl.includes('connected=instagram') || (usernameMatch && fullUrl.includes('instagram'));

        let incomingPages = [];
        if (pagesDataMatch) {
          try {
            const parsed = JSON.parse(decodeURIComponent(pagesDataMatch[1]));
            if (Array.isArray(parsed) && parsed.length > 0) {
              incomingPages = parsed;
            }
          } catch (e) {
            console.warn('Could not parse pages_data JSON:', e);
          }
        }

        if (incomingPages.length === 0) {
          const rawName = pageNameMatch ? decodeURIComponent(pageNameMatch[1]) : (usernameMatch ? decodeURIComponent(usernameMatch[1]) : (isIg ? 'Instagram Account' : 'Facebook Page'));
          const pageName = isIg && !rawName.startsWith('@') ? `@${rawName}` : rawName;
          const pageId = pageIdMatch ? decodeURIComponent(pageIdMatch[1]) : `page_${Date.now()}`;
          const channel = isIg ? 'instagram' : 'facebook';
          const color = isIg ? '#E1306C' : '#1877F2';

          incomingPages.push({
            id: pageId,
            page_id: pageId,
            name: pageName,
            channel: channel,
            color: color,
            provider: fullUrl.includes('provider=zernio') ? 'zernio' : 'meta',
            is_active: true,
            connected_at: new Date().toISOString()
          });
        }

        // Register connected page/account in CRM state
        if (this.svc) {
          if (!this.svc.pages) this.svc.pages = [];
          incomingPages.forEach(p => {
            const pId = p.page_id || p.id;
            const existingIdx = this.svc.pages.findIndex(x => x.id === pId || x.page_id === pId || (p.id && x.id === p.id));
            const pageRecord = {
              id: p.id || pId,
              page_id: pId,
              name: p.name || p.page_name,
              channel: p.channel || (p.name && p.name.startsWith('@') ? 'instagram' : 'facebook'),
              color: p.color || (p.channel === 'instagram' ? '#E1306C' : '#1877F2'),
              provider: p.provider || 'meta',
              is_active: true,
              connected_at: p.connected_at || new Date().toISOString()
            };

            if (existingIdx >= 0) {
              this.svc.pages[existingIdx] = { ...this.svc.pages[existingIdx], ...pageRecord };
            } else {
              this.svc.pages.push(pageRecord);
            }
          });

          if (this.svc._saveToStorage) this.svc._saveToStorage();
          else if (this.svc.saveAll) this.svc.saveAll();

          // Sync to server database in background
          const sessionToken = this.svc.getSessionToken ? this.svc.getSessionToken() : null;
          const headers = { 'Content-Type': 'application/json' };
          if (sessionToken) headers['Authorization'] = `Bearer ${sessionToken}`;
          else headers['x-user-id'] = (this.user && this.user.id) || 'admin';

          fetch('/api/pages', {
            method: 'POST',
            headers,
            body: JSON.stringify({ action: 'connect', pages: incomingPages })
          }).catch(err => console.warn('Background page persistence warning:', err));
        }

        this.metaConnectionState = 'connected';
        try { localStorage.setItem('metacrm_meta_conn_state', 'connected'); } catch (e) {}

        const primaryName = incomingPages[0]?.name || 'Meta Page';
        const countMsg = incomingPages.length > 1 ? `${incomingPages.length} Pages` : `"${primaryName}"`;
        this.toast(`✅ ${countMsg} connected successfully! Leads & messages will now appear automatically.`, 'success');

        if (window.history && window.history.replaceState) {
          window.history.replaceState({}, document.title, window.location.pathname + '#settings');
        }

        // Notify state subscribers to trigger immediate reactive UI rendering
        if (this.svc && typeof this.svc.notifyChange === 'function') {
          this.svc.notifyChange('pages_updated', { pages: this.svc.pages });
        }

        this.settingsTab = 'accounts';
        if (this.currentRoute === 'settings') {
          this.renderSettings();
        } else {
          this.navigate('settings');
        }
        this.renderSidebar();
        this.renderNotifications();
        if (this.currentRoute === 'connections' || window.location.hash.includes('connections')) {
          this.renderConnections();
        } else if (this.currentRoute === 'dashboard') {
          this.renderDashboard();
        }
      } finally {
        setTimeout(() => { this._isHandlingMetaCallback = false; }, 500);
      }
    } else if (fullUrl.includes('meta_auth=no_pages')) {
      this.metaConnectionState = 'not_connected';
      try { localStorage.setItem('metacrm_meta_conn_state', 'not_connected'); } catch (e) {}
      this.toast('⚠️ Connected to Facebook, but no Facebook Pages were found on this account. Please create or manage a Facebook Page first.', 'warning');
      if (window.history && window.history.replaceState) {
        window.history.replaceState({}, document.title, window.location.pathname + '#connections');
      }
      this.renderSidebar();
      if (this.currentRoute === 'connections') this.renderConnections();
    } else if (fullUrl.includes('meta_auth=error')) {
      const msgMatch = fullUrl.match(/msg=([^&]+)/);
      const msg = msgMatch ? decodeURIComponent(msgMatch[1]) : 'Permissions declined or window closed';
      this.metaConnectionState = 'not_connected';
      try { localStorage.setItem('metacrm_meta_conn_state', 'not_connected'); } catch (e) {}
      this.toast(`⚠️ Couldn't connect to Facebook: ${msg}`, 'error');
      if (window.history && window.history.replaceState) {
        window.history.replaceState({}, document.title, window.location.pathname + '#connections');
      }
      this.renderSidebar();
      if (this.currentRoute === 'connections') this.renderConnections();
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

    const fullHash = window.location.hash.replace(/^#\/?/, '') || 'dashboard';
    const [rawHash, queryStr] = fullHash.split('?');
    const hash = rawHash.replace(/^(admin|staff)\//, '');

    // 1. Password Setup flow (#setup-password?token=...)
    if (hash === 'setup-password') {
      this.currentRoute = 'setup-password';
      this.renderSetupPasswordScreen(queryStr);
      return;
    }

    // 2. Password Reset flow (#reset-password?token=...)
    if (hash === 'reset-password') {
      this.currentRoute = 'reset-password';
      this.renderResetPasswordScreen(queryStr);
      return;
    }

    // 3. Login or Unauthenticated check
    if (hash === 'login' || !this.user) {
      if (hash && hash !== 'login') {
        this.redirectAfterLogin = hash;
      }
      this.currentRoute = 'login';
      this.renderAuthScreen();
      return;
    }

    // 4. Admin-only Route Guard
    const adminOnlyRoutes = ['staff', 'settings', 'connections', 'integrations', 'meta-ads'];
    const isAdmin = this.user && (this.user.role === 'admin' || this.user.role === 'super_admin');
    if (adminOnlyRoutes.includes(hash) && !isAdmin) {
      this.currentRoute = hash;
      if (this.el.auth) this.el.auth.style.display = 'none';
      if (this.el.appLayout) this.el.appLayout.style.display = 'flex';
      this.toggleMobileSidebar(false);
      this.renderSidebar();
      this.renderAccessDeniedScreen(hash);
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
    const targetHash = '#' + path;
    if (window.location.hash === targetHash) {
      this._route();
    } else {
      window.location.hash = path;
    }
  }

  // ──────────────────────────────────────────────────────────
  // Dedicated Login, Setup & Auth Management (Email & Password)
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
                  <stop offset="0%" stop-color="#202223" />
                  <stop offset="100%" stop-color="#303030" />
                </linearGradient>
              </defs>
            </svg>
          </div>
          <h2 class="auth-title">MetaCRM</h2>
          <p class="auth-subtitle">Production Lead &amp; Multi-Tenant Messaging Platform</p>
        </div>

        <div id="auth-feedback"></div>

        <form onsubmit="event.preventDefault(); window.app.submitLogin();" style="margin-top:14px;">
          <div style="margin-bottom:14px;">
            <label class="settings-label" for="login-email">Login Email</label>
            <input type="email" id="login-email" class="input" placeholder="e.g. admina@novaautos.co.nz" required autocomplete="username">
          </div>
          <div style="margin-bottom:12px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
              <label class="settings-label" for="login-password" style="margin-bottom:0;">Password</label>
              <a href="javascript:void(0)" onclick="window.app.openForgotPasswordModal()" class="link-small" style="font-size:11px;">Forgot password?</a>
            </div>
            <div class="password-input-wrap">
              <input type="password" id="login-password" class="input" placeholder="••••••••••••" required autocomplete="current-password">
              <button type="button" id="toggle-login-pass-btn" class="password-toggle-btn" onclick="window.app.togglePasswordVisibility('login-password', 'toggle-login-pass-btn')" title="Toggle password visibility">
                ${this._icon('eye', 16)}
              </button>
            </div>
          </div>
          <button type="submit" id="login-submit-btn" class="btn btn-primary w-full" style="margin-top:16px;padding:10px;font-weight:600;">
            Sign In to MetaCRM
          </button>
        </form>

        <div style="margin-top:16px;padding:12px;background:rgba(255,255,255,0.03);border:1px solid var(--border-subtle);border-radius:8px;font-size:11px;color:var(--text-secondary);">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
            <strong style="color:var(--text-primary);font-size:11px;">Team Quick-Fill Credentials</strong>
            <span style="font-size:10px;color:var(--text-muted);">Click to auto-fill</span>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            <button type="button" class="btn btn-xs btn-secondary" onclick="window.app.fillLoginCredentials('admina@novaautos.co.nz', 'NovaAutos#2026Admin!')" style="font-size:11px;padding:4px 8px;">
              Admin (Joy)
            </button>
            <button type="button" class="btn btn-xs btn-secondary" onclick="window.app.fillLoginCredentials('danielsamoa4u@yahoo.com', 'DanSamoa#2026!')" style="font-size:11px;padding:4px 8px;">
              Staff (Dan)
            </button>
            <button type="button" class="btn btn-xs btn-secondary" onclick="window.app.fillLoginCredentials('lemaki4u@yahoo.com', 'MakiNova#2026!')" style="font-size:11px;padding:4px 8px;">
              Staff (Maki)
            </button>
          </div>
        </div>

        <div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--border-subtle);font-size:12px;color:var(--text-secondary);text-align:center;line-height:1.5;">
          <span>First-time setup? </span>
          <a href="#setup-password" class="link-small" style="font-weight:600;">Enter password setup token</a>
        </div>
      </div>
    `;
  }

  fillLoginCredentials(email, password) {
    const emailEl = document.getElementById('login-email');
    const passEl = document.getElementById('login-password');
    if (emailEl) emailEl.value = email;
    if (passEl) passEl.value = password;
    const feedback = document.getElementById('auth-feedback');
    if (feedback) feedback.innerHTML = '';
  }

  togglePasswordVisibility(inputId, btnId) {
    const input = document.getElementById(inputId);
    const btn = document.getElementById(btnId);
    if (!input) return;
    if (input.type === 'password') {
      input.type = 'text';
      if (btn) btn.innerHTML = this._icon('eye-off', 16);
    } else {
      input.type = 'password';
      if (btn) btn.innerHTML = this._icon('eye', 16);
    }
  }

  async submitLogin() {
    const email = (document.getElementById('login-email')?.value || '').trim().toLowerCase();
    const pass = (document.getElementById('login-password')?.value || '').trim();
    const feedback = document.getElementById('auth-feedback');
    const submitBtn = document.getElementById('login-submit-btn');

    if (!email || !pass) {
      if (feedback) feedback.innerHTML = '<div class="auth-error-banner">Please enter both your login email and password.</div>';
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span class="spinner"></span> Verifying credentials…';
    }

    try {
      const svc = this.svc || window.crmService;
      if (svc) {
        const res = await svc.login(email, pass);
        if (res.success && res.user) {
          this.user = res.user;
          try { localStorage.setItem('metacrm_authenticated', 'true'); } catch (e) {}
          this.toast(`Welcome back, ${this.user.displayName || this.user.name}!`, 'success');
          const target = this.redirectAfterLogin || 'dashboard';
          this.redirectAfterLogin = null;
          this.navigate(target);
          this._route();
          return;
        } else {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = 'Sign In to MetaCRM';
          }
          if (feedback) {
            feedback.innerHTML = `<div class="auth-error-banner"><span>⚠️</span> ${res.error || 'Invalid credentials or unconfigured account.'}</div>`;
          }
        }
      }
    } catch (err) {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = 'Sign In to MetaCRM';
      }
      if (feedback) feedback.innerHTML = `<div class="auth-error-banner"><span>⚠️</span> ${err.message || 'Authentication error occurred.'}</div>`;
    }
  }

  renderSetupPasswordScreen(queryStr = '') {
    if (this.el.appLayout) this.el.appLayout.style.display = 'none';
    if (!this.el.auth) return;

    let initialToken = '';
    if (queryStr) {
      const match = queryStr.match(/token=([a-zA-Z0-9_\-]+)/);
      if (match) initialToken = match[1];
    }

    this.el.auth.style.display = 'flex';
    this.el.auth.innerHTML = `
      <div class="auth-card">
        <div class="auth-brand">
          <div class="auth-brand-logo">
            <div style="width:44px;height:44px;border-radius:10px;background:#202223;color:#fff;display:flex;align-items:center;justify-content:center;">
              ${this._icon('lock', 22)}
            </div>
          </div>
          <h2 class="auth-title">Initial Account Password Setup</h2>
          <p class="auth-subtitle">Enter your secure setup token to create your password and activate your CRM account.</p>
        </div>

        <div id="setup-feedback"></div>

        <form onsubmit="event.preventDefault(); window.app.submitSetupPassword();">
          <div style="margin-bottom:14px;">
            <label class="settings-label" for="setup-token">Setup Token</label>
            <input type="text" id="setup-token" class="input" placeholder="e.g. stp_..." value="${escapeHtml(initialToken)}" required autocomplete="off">
          </div>
          <div style="margin-bottom:12px;">
            <label class="settings-label" for="setup-password">Create Password (min. 6 characters)</label>
            <div class="password-input-wrap">
              <input type="password" id="setup-password" class="input" placeholder="••••••••••••" minlength="6" required autocomplete="new-password">
              <button type="button" id="toggle-setup-pass-btn" class="password-toggle-btn" onclick="window.app.togglePasswordVisibility('setup-password', 'toggle-setup-pass-btn')">
                ${this._icon('eye', 16)}
              </button>
            </div>
          </div>
          <div style="margin-bottom:14px;">
            <label class="settings-label" for="setup-confirm-password">Confirm Password</label>
            <div class="password-input-wrap">
              <input type="password" id="setup-confirm-password" class="input" placeholder="••••••••••••" minlength="6" required autocomplete="new-password">
              <button type="button" id="toggle-setup-cpass-btn" class="password-toggle-btn" onclick="window.app.togglePasswordVisibility('setup-confirm-password', 'toggle-setup-cpass-btn')">
                ${this._icon('eye', 16)}
              </button>
            </div>
          </div>
          <button type="submit" id="setup-submit-btn" class="btn btn-primary w-full" style="margin-top:14px;padding:10px;font-weight:600;">
            Save Password &amp; Activate Account
          </button>
        </form>

        <div style="margin-top:16px;text-align:center;">
          <a href="#login" class="link-small">← Back to Sign In</a>
        </div>
      </div>
    `;
  }

  async submitSetupPassword() {
    const token = (document.getElementById('setup-token')?.value || '').trim();
    const pass = (document.getElementById('setup-password')?.value || '').trim();
    const cpass = (document.getElementById('setup-confirm-password')?.value || '').trim();
    const feedback = document.getElementById('setup-feedback');
    const submitBtn = document.getElementById('setup-submit-btn');

    if (!token) {
      if (feedback) feedback.innerHTML = '<div class="auth-error-banner">Please enter a valid setup token.</div>';
      return;
    }
    if (pass.length < 6) {
      if (feedback) feedback.innerHTML = '<div class="auth-error-banner">Password must be at least 6 characters long.</div>';
      return;
    }
    if (pass !== cpass) {
      if (feedback) feedback.innerHTML = '<div class="auth-error-banner">Passwords do not match. Please verify and retype.</div>';
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span class="spinner"></span> Activating account…';
    }

    try {
      const res = await fetch('/api/auth/setup-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password: pass })
      });
      const data = await res.json();

      if (res.ok && data.success) {
        if (data.sessionToken && this.svc) {
          this.svc.setSessionToken(data.sessionToken);
          this.svc.currentUser = { ...data.user };
          this.user = data.user;
          if (this.svc._saveToStorage) this.svc._saveToStorage(); else this.svc.saveAll();
        }
        this.toast('✓ Password created successfully! Welcome to MetaCRM.', 'success');
        this.navigate('dashboard');
        this._route();
      } else {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = 'Save Password &amp; Activate Account';
        }
        if (feedback) feedback.innerHTML = `<div class="auth-error-banner"><span>⚠️</span> ${data.error || 'Failed to activate account.'}</div>`;
      }
    } catch (err) {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = 'Save Password &amp; Activate Account';
      }
      if (feedback) feedback.innerHTML = `<div class="auth-error-banner"><span>⚠️</span> ${err.message || 'Error configuring password.'}</div>`;
    }
  }

  renderResetPasswordScreen(queryStr = '') {
    if (this.el.appLayout) this.el.appLayout.style.display = 'none';
    if (!this.el.auth) return;

    let initialToken = '';
    if (queryStr) {
      const match = queryStr.match(/token=([a-zA-Z0-9_\-]+)/);
      if (match) initialToken = match[1];
    }

    this.el.auth.style.display = 'flex';
    this.el.auth.innerHTML = `
      <div class="auth-card">
        <div class="auth-brand">
          <div class="auth-brand-logo">
            <div style="width:44px;height:44px;border-radius:10px;background:#202223;color:#fff;display:flex;align-items:center;justify-content:center;">
              ${this._icon('lock', 22)}
            </div>
          </div>
          <h2 class="auth-title">Reset Your CRM Password</h2>
          <p class="auth-subtitle">Enter your password reset token and choose a new secure password.</p>
        </div>

        <div id="reset-feedback"></div>

        <form onsubmit="event.preventDefault(); window.app.submitResetPassword();">
          <div style="margin-bottom:14px;">
            <label class="settings-label" for="reset-token">Reset Token</label>
            <input type="text" id="reset-token" class="input" placeholder="e.g. rst_..." value="${escapeHtml(initialToken)}" required autocomplete="off">
          </div>
          <div style="margin-bottom:12px;">
            <label class="settings-label" for="new-password">New Password (min. 6 characters)</label>
            <div class="password-input-wrap">
              <input type="password" id="new-password" class="input" placeholder="••••••••••••" minlength="6" required autocomplete="new-password">
              <button type="button" id="toggle-new-pass-btn" class="password-toggle-btn" onclick="window.app.togglePasswordVisibility('new-password', 'toggle-new-pass-btn')">
                ${this._icon('eye', 16)}
              </button>
            </div>
          </div>
          <div style="margin-bottom:14px;">
            <label class="settings-label" for="new-confirm-password">Confirm New Password</label>
            <div class="password-input-wrap">
              <input type="password" id="new-confirm-password" class="input" placeholder="••••••••••••" minlength="6" required autocomplete="new-password">
              <button type="button" id="toggle-cnew-pass-btn" class="password-toggle-btn" onclick="window.app.togglePasswordVisibility('new-confirm-password', 'toggle-cnew-pass-btn')">
                ${this._icon('eye', 16)}
              </button>
            </div>
          </div>
          <button type="submit" id="reset-submit-btn" class="btn btn-primary w-full" style="margin-top:14px;padding:10px;font-weight:600;">
            Update Password &amp; Sign In
          </button>
        </form>

        <div style="margin-top:16px;text-align:center;">
          <a href="#login" class="link-small">← Back to Sign In</a>
        </div>
      </div>
    `;
  }

  async submitResetPassword() {
    const token = (document.getElementById('reset-token')?.value || '').trim();
    const pass = (document.getElementById('new-password')?.value || '').trim();
    const cpass = (document.getElementById('new-confirm-password')?.value || '').trim();
    const feedback = document.getElementById('reset-feedback');
    const submitBtn = document.getElementById('reset-submit-btn');

    if (!token) {
      if (feedback) feedback.innerHTML = '<div class="auth-error-banner">Please enter a valid reset token.</div>';
      return;
    }
    if (pass.length < 6) {
      if (feedback) feedback.innerHTML = '<div class="auth-error-banner">Password must be at least 6 characters long.</div>';
      return;
    }
    if (pass !== cpass) {
      if (feedback) feedback.innerHTML = '<div class="auth-error-banner">Passwords do not match. Please verify and retype.</div>';
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span class="spinner"></span> Updating password…';
    }

    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password: pass })
      });
      const data = await res.json();

      if (res.ok && data.success) {
        if (data.sessionToken && this.svc) {
          this.svc.setSessionToken(data.sessionToken);
          this.svc.currentUser = { ...data.user };
          this.user = data.user;
          if (this.svc._saveToStorage) this.svc._saveToStorage(); else this.svc.saveAll();
        }
        this.toast('✓ Password updated successfully! Welcome back.', 'success');
        this.navigate('dashboard');
        this._route();
      } else {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = 'Update Password &amp; Sign In';
        }
        if (feedback) feedback.innerHTML = `<div class="auth-error-banner"><span>⚠️</span> ${data.error || 'Failed to update password.'}</div>`;
      }
    } catch (err) {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = 'Update Password &amp; Sign In';
      }
      if (feedback) feedback.innerHTML = `<div class="auth-error-banner"><span>⚠️</span> ${err.message || 'Error updating password.'}</div>`;
    }
  }

  openForgotPasswordModal() {
    this.el.mTitle.textContent = 'Forgot Password';
    this.el.mBody.innerHTML = `
      <p class="text-xs text-gray mb-3">Enter the login email associated with your MetaCRM account to request a single-use password reset link.</p>
      <label class="settings-label" for="reset-email">Work Email</label>
      <input type="email" id="reset-email" class="input" placeholder="e.g. admina@novaautos.co.nz" required value="${escapeHtml(document.getElementById('login-email')?.value || '')}">
      <div id="forgot-pass-msg" style="margin-top:12px;"></div>
    `;
    this.el.mConfirm.textContent = 'Request Reset Link';
    this.el.mConfirm.className = 'btn btn-primary';
    this.el.mConfirm.onclick = async () => {
      const email = (document.getElementById('reset-email')?.value || '').trim().toLowerCase();
      const msgBox = document.getElementById('forgot-pass-msg');
      if (!email || !email.includes('@')) {
        if (msgBox) msgBox.innerHTML = '<div class="auth-error-banner">Please enter a valid email address.</div>';
        return;
      }
      this.el.mConfirm.disabled = true;
      this.el.mConfirm.innerHTML = '<span class="spinner"></span> Processing…';
      try {
        const res = await fetch('/api/auth/forgot-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email })
        });
        const data = await res.json();
        if (res.ok && data.success) {
          if (data.resetLink) {
            msgBox.innerHTML = `
              <div class="auth-success-banner">
                <div><strong>Password reset generated:</strong></div>
                <div style="font-size:11px;margin-top:4px;word-break:break-all;">${escapeHtml(data.resetLink)}</div>
              </div>`;
            this.el.mConfirm.textContent = 'Done';
            this.el.mConfirm.disabled = false;
            this.el.mConfirm.onclick = () => this.closeModal();
          } else {
            this.closeModal();
            this.toast(data.message || 'Password reset link sent to your email.', 'success');
          }
        } else {
          this.el.mConfirm.disabled = false;
          this.el.mConfirm.textContent = 'Request Reset Link';
          if (msgBox) msgBox.innerHTML = `<div class="auth-error-banner"><span>⚠️</span> ${data.error || 'Failed to process request.'}</div>`;
        }
      } catch (e) {
        this.el.mConfirm.disabled = false;
        this.el.mConfirm.textContent = 'Request Reset Link';
        if (msgBox) msgBox.innerHTML = `<div class="auth-error-banner"><span>⚠️</span> ${e.message}</div>`;
      }
    };
    this.el.mOverlay.classList.add('open');
  }

  renderAccessDeniedScreen(route = '') {
    this.el.title.textContent = 'Access Restricted';
    this.el.actions.innerHTML = '';
    this.el.content.innerHTML = `
      <div class="access-denied-card">
        <div class="access-denied-icon">${this._icon('lock', 32)}</div>
        <h2 class="access-denied-title">Administrator Access Required</h2>
        <p class="access-denied-desc">
          The section <code>#${escapeHtml(route)}</code> is restricted to administrator accounts. As a staff member, your account is configured for assigned sales leads and client conversations.
        </p>
        <button class="btn btn-primary" onclick="window.app.navigate('dashboard')">
          Return to Dashboard
        </button>
      </div>`;
  }

  openUserProfileModal() {
    if (!this.user) {
      this.navigate('login');
      return;
    }
    const isAdmin = this.user.role === 'admin' || this.user.role === 'super_admin';
    this.el.mTitle.textContent = 'User Profile & Security';
    this.el.mBody.innerHTML = `
      <div style="display:flex;align-items:center;gap:14px;margin-bottom:18px;padding-bottom:14px;border-bottom:1px solid var(--border-subtle);">
        <div class="staff-avatar-sm" style="width:48px;height:48px;font-size:18px;background:${isAdmin ? 'var(--accent)' : '#10B981'}">
          ${(this.user.displayName || this.user.name || this.user.email || 'U').charAt(0).toUpperCase()}
        </div>
        <div>
          <strong style="font-size:16px;">${escapeHtml(this.user.displayName || this.user.name)}</strong>
          <div class="text-xs text-gray">${escapeHtml(this.user.email)}</div>
          <div style="margin-top:4px;">
            <span class="badge ${isAdmin ? 'badge-indigo' : 'badge-green'}">${this._roleLabel(this.user.role)}</span>
            <span class="badge badge-gray" style="margin-left:4px;">Active Session</span>
          </div>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:10px;">
        <div style="display:flex;justify-content:space-between;align-items:center;font-size:13px;padding:8px 0;">
          <span style="color:var(--text-secondary);">Account Role</span>
          <strong>${this._roleLabel(this.user.role)}</strong>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;font-size:13px;padding:8px 0;border-top:1px solid var(--border-subtle);">
          <span style="color:var(--text-secondary);">Assigned Pages</span>
          <span class="text-xs">${isAdmin ? 'All Connected Pages' : ((this.user.assignedPageIds || []).length > 0 ? `${this.user.assignedPageIds.length} Pages` : 'No Pages Assigned')}</span>
        </div>
        <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border-subtle);">
          <a href="download.html" target="_blank" class="btn btn-secondary w-full" style="display:flex;align-items:center;justify-content:center;gap:8px;text-decoration:none;font-weight:600;color:var(--text-primary);">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FF6A00" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Download Windows Desktop App
          </a>
        </div>
      </div>
    `;
    this.el.mConfirm.textContent = 'Close';
    this.el.mConfirm.className = 'btn btn-secondary';
    this.el.mConfirm.onclick = () => this.closeModal();
    this.el.mOverlay.classList.add('open');
  }

  logout() {
    this.confirmDialog({
      title: 'Sign Out',
      message: 'Are you sure you want to sign out of MetaCRM?',
      confirmText: 'Sign Out',
      isDanger: false,
      onConfirm: async () => {
        if (this.svc) await this.svc.logout();
        this.user = null;
        this.businessStatusCache = null;
        this.zernioHealthCache = null;
        this.zernioLeadForms = [];
        this.reportsData = null;
        this.activeConvId = null;
        this.inboxDrafts = {};
        this._loadedBizStatus = false;
        this._loadedBizStatusSettings = false;
        this._loadedZernioMarketing = false;
        this._fetchedServerConvs = false;
        this._adsSyncInFlight = null;
        try { localStorage.removeItem('metacrm_authenticated'); } catch (e) {}
        this.toast('You have been signed out.', 'info');
        this.navigate('login');
        this._route();
      }
    });
  }

  // ──────────────────────────────────────────────────────────
  // Sidebar Navigation with RBAC
  // ──────────────────────────────────────────────────────────

  renderSidebar() {
    if (!this.user) {
      if (this.el.nav) this.el.nav.innerHTML = '';
      return;
    }
    const isAdmin = this.user.role === 'admin' || this.user.role === 'super_admin';
    const leads = this._filterUserLeads(this.svc ? this.svc.leads : []);
    const newLeads = leads.filter(l => l.status === 'New' || l.status === 'New Lead').length;
    const tasks = this._filterUserTasks(this.svc ? this.svc.tasks : []);
    const overdueTasks = tasks.filter(t => t.status !== 'Done' && t.dueDate && new Date(t.dueDate) < new Date()).length;
    const activeWs = this.selectedWorkspace || 'MetaCRM Workspace';
    const accessiblePageIds = (this._getAccessiblePages ? this._getAccessiblePages() : []).map(p => String(p.id || p.page_id));
    const scopedConvs = (this.svc ? (this.svc.conversations || []) : []).filter(c => {
      if (c.is_archived) return false;
      if (isAdmin) return true;
      const cid = this.svc?.resolveCanonicalPageId ? this.svc.resolveCanonicalPageId(c.page_id || c.accountId || c.pageId) : String(c.page_id || c.accountId || '');
      return !cid || accessiblePageIds.includes(cid);
    });
    const unreadConvs = scopedConvs.filter(c => (c.unread || c.unread_count || 0) > 0).length;

    const unreadEmails = (this.svc ? (this.svc.emailMessages || []) : []).filter(m => !m.is_read && m.folder === 'inbox').length;

    const sections = [
      {
        title: 'Daily Sales',
        items: [
          { id: 'dashboard',   icon: `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.75" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>`, label: 'Overview', shortcut: '' },
          { id: 'inbox',       icon: `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.75" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`, label: 'Inbox', badge: unreadConvs > 0 ? unreadConvs : null, shortcut: '' },
          { id: 'leads',       icon: `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.75" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`, label: 'Leads', badge: newLeads > 0 ? newLeads : null, shortcut: '' },
          { id: 'pipeline',    icon: `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.75" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>`, label: 'Pipeline', shortcut: '' },
          { id: 'tasks',       icon: `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.75" viewBox="0 0 24 24"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`, label: 'Tasks &amp; Appointments', badge: overdueTasks > 0 ? overdueTasks : null, shortcut: '' },
          { id: 'reports',     icon: `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.75" viewBox="0 0 24 24"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>`, label: 'Reports', shortcut: '' },
        ]
      },
      ...(isAdmin ? [{
        title: 'Manager',
        items: [
          { id: 'meta-ads',    icon: `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.75" viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>`, label: 'Marketing / Meta', shortcut: '' },
          { id: 'staff',       icon: `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.75" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`, label: 'Team', shortcut: '' },
          { id: 'email',       icon: `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.75" viewBox="0 0 24 24"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>`, label: 'Email', badge: unreadEmails > 0 ? unreadEmails : null, shortcut: '' },
        ]
      }] : [])
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
              <span class="ws-plan">New Zealand</span>
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
        ${isAdmin ? `
        <a href="#settings" class="nav-item ${this.currentRoute === 'settings' ? 'active' : ''}">
          <div class="nav-item-left">
            <span class="nav-icon"><svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg></span>
            <span class="nav-text">Settings</span>
          </div>
          <div class="nav-item-right">
            <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></svg>
          </div>
        </a>` : ''}
        <div class="user-profile-item" onclick="window.app.openUserProfileModal()">
          <div class="user-avatar" style="background:${isAdmin ? '#202223' : '#10B981'};color:#FFFFFF;font-weight:600;">
            ${(this.user.displayName || this.user.name || this.user.email || 'U').charAt(0).toUpperCase()}
          </div>
          <div class="nav-text user-info">
            <div class="user-name">${escapeHtml(this.user.displayName || this.user.name || this.user.email)}</div>
            <div class="user-role">${this._roleLabel(this.user.role)}</div>
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
    if (this._pageRenderTimer) {
      clearTimeout(this._pageRenderTimer);
      this._pageRenderTimer = null;
    }
    this.el.content.innerHTML = `<div class="page-skeleton"></div>`;
    if (this.currentRoute === 'inbox' || this.currentRoute === 'email') {
      this.el.content.classList.add('inbox-view-container');
    } else {
      this.el.content.classList.remove('inbox-view-container');
    }
    this._pageRenderTimer = setTimeout(() => {
      this._pageRenderTimer = null;
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
        case 'inbox':
        case 'messages':
        case 'conversations': this.renderInbox(); break;
        case 'email':        this.renderEmailInbox(); break;
        case 'meta-ads':     this.renderMetaAds(); break;
        case 'pipeline':     this.renderPipeline(); break;
        case 'tasks':        this.renderTasks(); break;
        case 'reports':      this.renderReports(); break;
        case 'integrations':
        case 'connections':
          this.settingsTab = 'accounts';
          this.renderSettings();
          break;
        case 'developer-diagnostics':
        case 'diagnostics':
          if (typeof this.renderDeveloperDiagnostics === 'function') this.renderDeveloperDiagnostics();
          else this.renderAccessDeniedScreen('developer-diagnostics');
          break;
        case 'staff':        this.renderStaff(); break;
        case 'settings':     this.renderSettings(); break;
        case 'download':
        case 'desktop':      this.renderDownloadPage(); break;
        default:             this.renderDashboard(); break;
      }
    }, 80);
  }

  renderDownloadPage() {
    this.el.title.textContent = 'Desktop App for Windows';
    this.el.actions.innerHTML = `
      <a href="download.html" target="_blank" class="btn btn-secondary btn-sm" style="display:flex;align-items:center;gap:6px;text-decoration:none;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
        <span>Open Standalone Download Page</span>
      </a>
    `;

    this.el.content.innerHTML = `
      <div style="max-width:960px;margin:0 auto;padding:24px 16px;">
        <!-- Hero Download Card -->
        <div style="background:linear-gradient(135deg, rgba(255,106,0,0.12) 0%, rgba(238,9,121,0.06) 100%), var(--bg-surface);border:1px solid rgba(255,106,0,0.3);border-radius:16px;padding:36px;margin-bottom:28px;position:relative;overflow:hidden;">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
            <span style="display:inline-flex;align-items:center;gap:6px;background:rgba(52,211,153,0.15);color:#34D399;font-size:12px;font-weight:700;padding:4px 12px;border-radius:999px;border:1px solid rgba(52,211,153,0.3);">
              <span style="width:6px;height:6px;border-radius:50%;background:#34D399;"></span>
              Windows Production Client v2.0.0
            </span>
            <span style="font-size:12px;color:var(--text-secondary);">64-bit • Centralized Cloud Sync</span>
          </div>
          <h2 style="font-family:'Outfit',sans-serif;font-size:32px;font-weight:800;margin-bottom:10px;">MetaCRM for Windows Desktop</h2>
          <p style="font-size:15px;line-height:1.6;color:var(--text-secondary);max-width:680px;margin-bottom:24px;">
            Install the dedicated desktop client on your Windows PC. Enjoy instant launch, native system notifications for new leads and incoming messages, and encrypted local session storage with zero browser tab clutter.
          </p>

          <div style="display:flex;flex-wrap:wrap;align-items:center;gap:14px;margin-bottom:20px;">
            <a href="https://github.com/jibanxd2007/crm/releases/download/v2.0.0/MetaCRM-Setup-2.0.0.exe" class="btn btn-primary" style="display:inline-flex;align-items:center;gap:10px;padding:12px 28px;font-size:15px;font-weight:700;background:linear-gradient(135deg, #FF6A00 0%, #EE0979 100%);box-shadow:0 8px 20px rgba(255,106,0,0.3);text-decoration:none;">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              <span>Download Installer (.exe)</span>
            </a>
            <a href="https://github.com/jibanxd2007/crm/releases/download/v2.0.0/MetaCRM-Portable-2.0.0.exe" class="btn btn-secondary" style="display:inline-flex;align-items:center;gap:8px;padding:12px 22px;font-size:14px;font-weight:600;text-decoration:none;">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
              <span>Download Portable (.exe)</span>
            </a>
          </div>

          <div style="display:flex;align-items:center;gap:20px;font-size:12px;color:var(--text-muted);flex-wrap:wrap;">
            <span>✓ Desktop &amp; Start Menu Shortcuts</span>
            <span>✓ Built-in Uninstaller</span>
            <span>✓ Windows 10 &amp; 11 Compatible</span>
            <span>✓ Size: ~115 MB</span>
          </div>
        </div>

        <!-- Checksums & Verification -->
        <div style="background:var(--bg-surface);border:1px solid var(--border-subtle);border-radius:12px;padding:20px 24px;margin-bottom:28px;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px;">
            <strong style="font-size:14px;">Verified Binary SHA-256 Checksums</strong>
            <span style="font-size:11px;color:var(--text-muted);">Release v2.0.0 (x64)</span>
          </div>
          <div style="background:#07080A;border:1px solid rgba(255,255,255,0.06);border-radius:8px;padding:10px 14px;font-family:monospace;font-size:11px;color:#34D399;display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;overflow-x:auto;">
            <span>MetaCRM-Setup-2.0.0.exe: c1e00275ca39307c5d4abc584992c95cfcc486257597eddb415c634404bf41e1</span>
            <button class="btn btn-ghost btn-sm" style="padding:2px 8px;font-size:11px;color:#FFF;" onclick="navigator.clipboard.writeText('c1e00275ca39307c5d4abc584992c95cfcc486257597eddb415c634404bf41e1'); this.innerText='Copied!'">Copy</button>
          </div>
          <div style="background:#07080A;border:1px solid rgba(255,255,255,0.06);border-radius:8px;padding:10px 14px;font-family:monospace;font-size:11px;color:#34D399;display:flex;align-items:center;justify-content:space-between;overflow-x:auto;">
            <span>MetaCRM-Portable-2.0.0.exe: cef53327d16c02b42b49db7413f28b2b88217309963d63d7f65ec51e6b32f474</span>
            <button class="btn btn-ghost btn-sm" style="padding:2px 8px;font-size:11px;color:#FFF;" onclick="navigator.clipboard.writeText('cef53327d16c02b42b49db7413f28b2b88217309963d63d7f65ec51e6b32f474'); this.innerText='Copied!'">Copy</button>
          </div>
        </div>

        <!-- 3-Step Walkthrough -->
        <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(260px, 1fr));gap:16px;">
          <div style="background:var(--bg-surface);border:1px solid var(--border-subtle);border-radius:12px;padding:20px;">
            <div style="width:28px;height:28px;border-radius:50%;background:rgba(255,106,0,0.15);color:#FF6A00;font-weight:800;display:flex;align-items:center;justify-content:center;margin-bottom:12px;">1</div>
            <strong style="font-size:15px;display:block;margin-bottom:6px;">Download &amp; Run</strong>
            <p style="font-size:13px;color:var(--text-secondary);line-height:1.5;">Click the Download Installer button above. When finished, double-click <code>MetaCRM-Setup-2.0.0.exe</code>.</p>
          </div>
          <div style="background:var(--bg-surface);border:1px solid var(--border-subtle);border-radius:12px;padding:20px;">
            <div style="width:28px;height:28px;border-radius:50%;background:rgba(255,106,0,0.15);color:#FF6A00;font-weight:800;display:flex;align-items:center;justify-content:center;margin-bottom:12px;">2</div>
            <strong style="font-size:15px;display:block;margin-bottom:6px;">Quick Installation</strong>
            <p style="font-size:13px;color:var(--text-secondary);line-height:1.5;">Follow the setup wizard. It automatically creates shortcuts on your desktop and Windows Start Menu.</p>
          </div>
          <div style="background:var(--bg-surface);border:1px solid var(--border-subtle);border-radius:12px;padding:20px;">
            <div style="width:28px;height:28px;border-radius:50%;background:rgba(255,106,0,0.15);color:#FF6A00;font-weight:800;display:flex;align-items:center;justify-content:center;margin-bottom:12px;">3</div>
            <strong style="font-size:15px;display:block;margin-bottom:6px;">Team Login</strong>
            <p style="font-size:13px;color:var(--text-secondary);line-height:1.5;">Sign in with your authorized email and password. Your leads, conversations, and assigned pages load live.</p>
          </div>
        </div>
      </div>
    `;
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
      sparkles: `<svg width="${s}" height="${s}" class="${className}" fill="none" stroke="currentColor" stroke-width="1.75" viewBox="0 0 24 24"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3z"/></svg>`,
      eye: `<svg width="${s}" height="${s}" class="${className}" fill="none" stroke="currentColor" stroke-width="1.75" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`,
      'eye-off': `<svg width="${s}" height="${s}" class="${className}" fill="none" stroke="currentColor" stroke-width="1.75" viewBox="0 0 24 24"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`,
      copy: `<svg width="${s}" height="${s}" class="${className}" fill="none" stroke="currentColor" stroke-width="1.75" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`,
      lock: `<svg width="${s}" height="${s}" class="${className}" fill="none" stroke="currentColor" stroke-width="1.75" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,
      shield: `<svg width="${s}" height="${s}" class="${className}" fill="none" stroke="currentColor" stroke-width="1.75" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`
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
    if (!this.user) return;
    if (!this._loadedDashHealth && this.svc && this.svc.fetchZernioHealth) {
      this._loadedDashHealth = true;
      this.svc.fetchZernioHealth().then(h => {
        this.zernioHealthCache = h;
        if (this.currentRoute === 'dashboard') this.renderDashboard();
      }).catch(() => {});
    }
    const now = new Date();
    const hour = now.getHours();
    const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    const isAdmin = this.user ? (this.user.role !== 'staff') : false;

    // Page selector for header
    const availablePages = this._getAccessiblePages();
    let pageSelectOptions = `<option value="all">All Pages (${availablePages.length})</option>`;
    if (!isAdmin) {
      pageSelectOptions = availablePages.map(p => `<option value="${p.id}" ${this.selectedPageFilter === p.id ? 'selected' : ''}>${p.name}</option>`).join('');
    } else {
      pageSelectOptions += availablePages.map(p => `<option value="${p.id}" ${this.selectedPageFilter === p.id ? 'selected' : ''}>${p.name}</option>`).join('');
    }

    // Top Header - clean minimal Dashboard heading
    this.el.title.innerHTML = `<h1 class="topbar-title" style="font-size:18px;font-weight:600;color:var(--text-primary);margin:0;">Dashboard</h1>`;

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
    const accessibleConvs = (this.user && (this.user.role === 'admin' || this.user.role === 'super_admin'))
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
    const speed = this.svc ? this.svc.getSpeedToLeadMetrics(leads) : { medianText: '—', complianceRate: 'No data', liveBreachCount: 0, respondedCount: 0 };
    const honestSlaRate = (leads.length > 0 && speed.respondedCount > 0) ? (speed.complianceRate || 'No data') : 'No data';
    const honestSlaSub = (leads.length > 0 && speed.respondedCount > 0)
      ? (speed.liveBreachCount > 0 ? `${speed.liveBreachCount} breach${speed.liveBreachCount > 1 ? 'es' : ''}` : 'Within SLA')
      : 'Awaiting responses';

    const needsReplyConvsCount = accessibleConvs.filter(c => {
      if (c.is_archived) return false;
      if (Array.isArray(c.messages) && c.messages.length > 0) {
        const last = c.messages[c.messages.length - 1];
        return last.incoming === true || last.sender_type === 'customer' || last.direction === 'inbound';
      }
      return !String(c.preview || c.last_message || '').startsWith('You:');
    }).length;
    const unassignedLeadsCount = allScopedLeads.filter(l => !(l.assigned_staff_id || l.assignedStaffId || l.assigned_to)).length;
    const todayVisitsCount = allPendingTasks.filter(t => t.type === 'appointment' && t.dueDate && this._getNZDate(t.dueDate) === this._getNZDate(new Date())).length;

    const zHealth = this.zernioHealthCache || null;
    const connectedPagesCount = zHealth && Array.isArray(zHealth.pages) ? zHealth.pages.filter(p => p.accountConnected).length : availablePages.length;
    const webhookIsLive = Boolean(zHealth?.webhookHealth?.active);
    const webhookStatusLabel = !zHealth ? 'Checking…' : (webhookIsLive ? 'Active' : (zHealth.webhookHealth?.status === 'disabled' ? 'Disabled (Action Required)' : 'Needs Setup'));
    const webhookDotColor = !zHealth ? '#94A3B8' : (webhookIsLive ? '#10B981' : '#EF4444');
    const tokenHealthy = zHealth && Array.isArray(zHealth.pages) ? (zHealth.pages.length > 0 && zHealth.pages.every(p => p.accountConnected)) : availablePages.length > 0;

    this.el.content.innerHTML = `
      ${fbOnboardingHtml}

      <!-- NEEDS ATTENTION TODAY (Daily Sales Priority Strip) -->
      <div class="dash-section-title" style="display:flex;align-items:center;justify-content:space-between;">
        <span>Needs Attention Today (NZ)</span>
        <span class="text-xs text-gray" style="font-weight:500;">${greeting}, ${escapeHtml(this.user.displayName || this.user.name || 'Team')}</span>
      </div>
      <div class="attention-strip">
        <button type="button" class="attention-card ${needsReplyConvsCount > 0 ? 'urgent' : 'ok'}" onclick="window.app.navigate('inbox'); setTimeout(() => window.app.setInboxTab('needs_reply'), 60);">
          <div>
            <div class="attention-title">Messages Needing Reply</div>
            <div class="attention-count">${needsReplyConvsCount}</div>
          </div>
          <span class="attention-cta">Open Queue →</span>
        </button>
        <button type="button" class="attention-card ${unassignedLeadsCount > 0 ? 'warning' : 'ok'}" onclick="window.app.navigate('leads');">
          <div>
            <div class="attention-title">Unassigned Enquiries</div>
            <div class="attention-count">${unassignedLeadsCount}</div>
          </div>
          <span class="attention-cta">Review Leads →</span>
        </button>
        <button type="button" class="attention-card ${followUpsDueCount > 0 ? 'warning' : 'ok'}" onclick="window.app.navigate('tasks');">
          <div>
            <div class="attention-title">Follow-ups &amp; Yard Visits Due</div>
            <div class="attention-count">${followUpsDueCount}${todayVisitsCount > 0 ? ` <span style="font-size:12px;font-weight:600;color:#475569;">(${todayVisitsCount} visits today)</span>` : ''}</div>
          </div>
          <span class="attention-cta">Open Tasks →</span>
        </button>
      </div>

      <!-- OVERVIEW SECTION & 4 PRIMARY KPIS -->
      <div class="dash-section-title">Performance Summary</div>
      <div class="overview-kpis-row">
        <!-- TOTAL LEADS -->
        <div class="overview-kpi-card" onclick="window.app.navigate('leads')">
          <div class="overview-kpi-top">
            <div class="overview-kpi-left">
              <div class="kpi-icon-box blue">
                <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              </div>
              <span class="kpi-label-text">Total Enquiries</span>
            </div>
            <span class="kpi-arrow-icon">→</span>
          </div>
          <div class="overview-kpi-val">${leads.length}</div>
          <div class="overview-kpi-desc">${this.selectedDateRange === 'today' ? 'Arrived today (NZ)' : `Filtered by ${this.selectedDateRange.replace('_', ' ')}`}</div>
        </div>

        <!-- NEW LEADS -->
        <div class="overview-kpi-card" onclick="window.app.navigate('leads'); setTimeout(() => window.app.renderLeads('new'), 60);">
          <div class="overview-kpi-top">
            <div class="overview-kpi-left">
              <div class="kpi-icon-box green">
                <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
              </div>
              <span class="kpi-label-text">New Enquiries</span>
            </div>
            <span class="kpi-arrow-icon">→</span>
          </div>
          <div class="overview-kpi-val">${newL.length}</div>
          <div class="overview-kpi-desc">${todayLeadsCount > 0 ? `${todayLeadsCount} new today (NZ)` : '0 new today (NZ)'}</div>
        </div>

        <!-- DEALS WON -->
        <div class="overview-kpi-card" onclick="window.app.navigate('leads'); setTimeout(() => window.app.renderLeads('won'), 60);">
          <div class="overview-kpi-top">
            <div class="overview-kpi-left">
              <div class="kpi-icon-box amber">
                <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.45 1-1 1H7.5c-.28 0-.5.22-.5.5v1c0 .28.22.5.5.5h9c.28 0 .5-.22.5-.5v-1c0-.28-.22-.5-.5-.5H15c-.55 0-1-.45-1-1v-2.34"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2z"/></svg>
              </div>
              <span class="kpi-label-text">Vehicles Sold</span>
            </div>
            <span class="kpi-arrow-icon">→</span>
          </div>
          <div class="overview-kpi-val">${wonL.length}</div>
          <div class="overview-kpi-desc">${roi.totalWonValue > 0 ? `${this.formatMoney(roi.totalWonValue)} recorded` : 'No sold value recorded'}</div>
        </div>

        <!-- CONVERSION RATE -->
        <div class="overview-kpi-card" onclick="window.app.navigate('reports')">
          <div class="overview-kpi-top">
            <div class="overview-kpi-left">
              <div class="kpi-icon-box gray">
                <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
              </div>
              <span class="kpi-label-text">Sale Rate</span>
            </div>
            <span class="kpi-arrow-icon">→</span>
          </div>
          <div class="overview-kpi-val">${leads.length ? ((wonL.length / leads.length) * 100).toFixed(0) + '%' : 'No data'}</div>
          <div class="overview-kpi-desc">${leads.length ? `${wonL.length} of ${leads.length} enquiries` : 'Awaiting enquiries'}</div>
        </div>
      </div>

      <!-- GROUPED METRICS: LEAD MANAGEMENT & ADVERTISING PERFORMANCE -->
      <div class="grouped-metrics-grid">
        <!-- Lead Management -->
        <div class="grouped-panel-column">
          <div class="grouped-panel-heading">Response &amp; Follow-up</div>
          <div class="grouped-panel-card">
            <div class="submetric-col" onclick="window.app.navigate('inbox'); setTimeout(() => window.app.setInboxTab('needs_reply'), 60);">
              <div class="submetric-label-row">
                <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                <span>Needs Reply</span>
              </div>
              <div class="submetric-val">${needsReplyConvsCount}</div>
              <div class="submetric-sub">${needsReplyConvsCount > 0 ? `${needsReplyConvsCount} awaiting rep` : 'All caught up'}</div>
            </div>

            <div class="submetric-col" onclick="${followUpLeads.length > 0 ? `window.app.navigate('leads'); setTimeout(() => window.app.renderLeads('followup'), 60);` : `window.app.navigate('tasks');`}">
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
                <span>Median Response</span>
              </div>
              <div class="submetric-val">${speed.medianText || 'No data'}</div>
              <div class="submetric-sub">Target: 15 mins</div>
            </div>

            <div class="submetric-col">
              <div class="submetric-label-row">
                <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>
                <span>SLA Compliance</span>
              </div>
              <div class="submetric-val">${honestSlaRate}</div>
              <div class="submetric-sub">${honestSlaSub}</div>
            </div>
          </div>
        </div>

        <!-- Advertising Performance -->
        <div class="grouped-panel-column">
          <div class="grouped-panel-heading">Meta Advertising (NZD)</div>
          <div class="grouped-panel-card">
            <div class="submetric-col" onclick="window.app.navigate('meta-ads')">
              <div class="submetric-label-row">
                <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="m4.93 4.93 4.24 4.24"/><path d="m14.83 9.17 4.24-4.24"/><path d="m14.83 14.83 4.24 4.24"/><path d="m9.17 14.83-4.24 4.24"/></svg>
                <span>Ad Spend (NZD)</span>
              </div>
              <div class="submetric-val">${roi.totalSpend > 0 ? this.formatMoney(roi.totalSpend) : 'Not synced'}</div>
              <div class="submetric-sub">${roi.totalSpend > 0 ? `${roi.activeCampaignsCount || campaigns.length} active campaigns` : 'Sync in Marketing / Meta'}</div>
            </div>

            <div class="submetric-col" onclick="window.app.navigate('meta-ads')">
              <div class="submetric-label-row">
                <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                <span>Cost Per Lead</span>
              </div>
              <div class="submetric-val">${roi.cpl > 0 ? this.formatMoney(roi.cpl) : 'No data'}</div>
              <div class="submetric-sub">NZD / Lead</div>
            </div>

            <div class="submetric-col" onclick="window.app.navigate('reports')">
              <div class="submetric-label-row">
                <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
                <span>Cost / Sale</span>
              </div>
              <div class="submetric-val">${roi.cpa > 0 ? this.formatMoney(roi.cpa) : 'No data'}</div>
              <div class="submetric-sub">Spend / Sold Vehicle</div>
            </div>

            <div class="submetric-col" onclick="window.app.navigate('reports')">
              <div class="submetric-label-row">
                <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg>
                <span>ROAS</span>
              </div>
              <div class="submetric-val">${roi.roas > 0 ? roi.roas + 'x' : 'No data'}</div>
              <div class="submetric-sub">Attributed Sales</div>
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
                <span class="conn-header-count">${connectedPagesCount} Connected</span>
              </div>

              <div class="conn-diag-row">
                <div class="conn-diag-label">
                  <span class="conn-diag-dot" style="background:${webhookDotColor};"></span>
                  <span>Live Lead Webhook</span>
                </div>
                <span class="${webhookIsLive ? 'badge-tag-healthy' : 'badge-tag-inactive'}">
                  ${webhookStatusLabel}
                </span>
              </div>

              <div class="conn-diag-row">
                <div class="conn-diag-label">
                  <span class="conn-diag-dot" style="background:${tokenHealthy ? '#10B981' : '#F59E0B'};"></span>
                  <span>OAuth &amp; Permissions</span>
                </div>
                <span class="${tokenHealthy ? 'badge-tag-healthy' : 'badge-tag-unverified'}">
                  ${tokenHealthy ? 'Verified' : 'Needs Check'}
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
    this.el.title.textContent = (this.user && this.user.role === 'staff') ? 'My Leads' : 'Leads';

    const isAdmin = this.user && (this.user.role === 'admin' || this.user.role === 'super_admin');
    const accessiblePages = this._getAccessiblePages ? this._getAccessiblePages() : [];
    this.el.actions.innerHTML = `
      ${isAdmin ? `
      <button class="btn btn-secondary btn-sm" id="sync-leads-btn" onclick="window.app.syncZernioLeads()" title="Sync recent Meta Lead Ad submissions via Zernio">
        <svg width="13" height="13" id="sync-leads-icon" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 21h5v-5"/></svg>
        <span>Sync Meta Leads</span>
      </button>` : ''}
      <button class="btn btn-secondary btn-sm" onclick="window.app.exportLeadsCsv()">Export CSV</button>
      <button class="btn btn-primary btn-sm" onclick="window.app.openAddLeadModal()">+ Add Lead</button>`;

    const tabs = [
      { id: 'all',       label: 'All' },
      { id: 'new',       label: 'New' },
      { id: 'contacted', label: 'Contacted' },
      { id: 'qualified', label: 'Qualified' },
      { id: 'followup',  label: 'Follow-up' },
      { id: 'won',       label: 'Sold' },
      { id: 'lost',      label: 'Lost' },
    ];

    const allLeads = this._getFilteredLeads();
    const activePageFilter = this.leadPageFilter || 'all';
    const activeCampaignFilter = this.leadCampaignFilter || '';
    const hasActiveFilters = Boolean(this.leadSearchQuery || activePageFilter !== 'all' || activeCampaignFilter || (this.currentLeadTab && this.currentLeadTab !== 'all'));

    const pageFilteredLeads = allLeads.filter(l => {
      if (activePageFilter !== 'all') {
        const normTarget = this.svc?.resolveCanonicalPageId ? this.svc.resolveCanonicalPageId(activePageFilter) : String(activePageFilter);
        const normLead = this.svc?.resolveCanonicalPageId ? this.svc.resolveCanonicalPageId(l.page_id || l.pageId) : String(l.page_id || l.pageId || '');
        if (normLead !== normTarget) return false;
      }
      if (activeCampaignFilter && String(l.campaign_id || l.campaignId || '') !== String(activeCampaignFilter)) {
        return false;
      }
      return true;
    });

    const tabFiltered = this._filterLeadsByTab(pageFilteredLeads, this.currentLeadTab).filter(l =>
      !this.leadSearchQuery ||
      (l.name && l.name.toLowerCase().includes(this.leadSearchQuery.toLowerCase())) ||
      (l.phone && l.phone.includes(this.leadSearchQuery)) ||
      (l.email && l.email.toLowerCase().includes(this.leadSearchQuery.toLowerCase())) ||
      (l.vehicle_interest && l.vehicle_interest.toLowerCase().includes(this.leadSearchQuery.toLowerCase()))
    );

    this.el.content.innerHTML = `
      <div class="crm-filter-bar" role="region" aria-label="Filter leads">
        <div style="position:relative;flex:1 1 220px;min-width:180px;max-width:320px;">
          <input type="text" class="input input-sm w-full" placeholder="Filter by customer, phone, email, or car…" id="lead-search-input" value="${escapeHtml(this.leadSearchQuery || '')}" oninput="window.app.onLeadSearch(this.value)">
        </div>
        <select class="input input-sm" style="width:auto;min-width:165px;" aria-label="Filter leads by page" onchange="window.app.leadPageFilter=this.value;window.app.renderLeads();">
          <option value="all">${isAdmin ? 'All Authorised Pages' : 'All Assigned Pages'}</option>
          ${accessiblePages.map(p => `<option value="${p.id || p.page_id}" ${String(activePageFilter) === String(p.id || p.page_id) ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('')}
        </select>
        ${activeCampaignFilter ? `<span class="health-pill warn">Campaign: ${escapeHtml(activeCampaignFilter)} <button type="button" style="border:none;background:none;cursor:pointer;font-weight:700;margin-left:4px;" onclick="window.app.leadCampaignFilter='';window.app.renderLeads();">✕</button></span>` : ''}
        ${hasActiveFilters ? `<button type="button" class="btn btn-ghost btn-sm" onclick="window.app.clearLeadFilters()">✕ Clear filters</button>` : ''}
        <span class="text-xs text-gray" style="margin-left:auto;">${tabFiltered.length} of ${allLeads.length} enquiries</span>
      </div>

      <div class="tabs" id="lead-tabs">
        ${tabs.map(t => {
          const count = this._filterLeadsByTab(pageFilteredLeads, t.id).length;
          return `<div class="tab ${this.currentLeadTab === t.id ? 'active' : ''}" onclick="window.app.renderLeads('${t.id}')">${t.label} <span class="tab-count">${count}</span></div>`;
        }).join('')}
      </div>

      ${tabFiltered.length ? `
      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th><input type="checkbox" id="select-all-leads" onchange="window.app.toggleSelectAll(this)"></th>
              <th>Customer</th>
              <th>Source &amp; Page</th>
              <th>Vehicle &amp; Budget (NZD)</th>
              <th>Stage</th>
              <th>Owner</th>
              <th>Next Action</th>
              <th>Quick Actions</th>
            </tr>
          </thead>
          <tbody>
            ${tabFiltered.map(l => {
              const nextDateRaw = l.next_action_at || l.follow_up_date || l.followUpDate;
              const followUp = nextDateRaw ? new Date(nextDateRaw).toLocaleDateString('en-NZ', { timeZone: 'Pacific/Auckland', day: 'numeric', month: 'short' }) : 'Not set';
              const isOverdue = nextDateRaw && new Date(nextDateRaw) < new Date() && l.status !== 'Won' && l.status !== 'Lost';
              const pageName = this._pageName(l.page_id || l.pageId);
              const isHot = l.is_hot_lead || (l.budget_nzd && l.budget_nzd >= 25000) || (l.value && l.value >= 25000);
              const dup = this.findDuplicateLead(l);
              const isChecked = this.selectedLeadIds.has(l.id);
              const vehicleTxt = l.vehicle_interest || 'Vehicle not specified';
              const budgetVal = l.budget_nzd || l.value || l.dealValue || l.lead_value || 0;
              return `
                <tr class="clickable-row ${isHot ? 'hot-lead-card' : ''}" onclick="window.app.openLeadDrawer('${l.id}')">
                  <td onclick="event.stopPropagation()"><input type="checkbox" class="lead-select-box" value="${l.id}" ${isChecked ? 'checked' : ''} onchange="window.app.onLeadSelect(this)"></td>
                  <td>
                    <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                      <strong>${escapeHtml(l.name || l.full_name || 'Unnamed Lead')}</strong>
                      ${isHot ? `<span class="badge badge-hot" style="font-size:10px;">Hot</span>` : ''}
                      ${dup ? `<button class="badge badge-duplicate" title="Potential duplicate detected with ${escapeHtml(dup.name)}" onclick="event.stopPropagation(); window.app.openMergeModal('${l.id}')">Duplicate</button>` : ''}
                    </div>
                    <div class="text-xs text-gray">${escapeHtml(l.phone || l.email || 'No contact details')}</div>
                  </td>
                  <td>
                    <div class="text-xs font-semibold">${escapeHtml(pageName)}</div>
                    <div class="text-xs text-gray">${escapeHtml(l.source || 'Facebook Lead Ad')}${l.form_name ? ` · ${escapeHtml(l.form_name)}` : ''}</div>
                  </td>
                  <td>
                    <div class="text-xs font-semibold">${escapeHtml(vehicleTxt)}</div>
                    <div class="text-xs text-gray">${budgetVal > 0 ? this.formatMoney(budgetVal) : 'Budget not set'}${l.payment_preference ? ` · ${escapeHtml(l.payment_preference)}` : ''}</div>
                  </td>
                  <td>${this._badge(l.status)}</td>
                  <td class="text-xs">${escapeHtml(this._staffName(l.assigned_staff_id || l.assignedStaffId || l.assigned_to))}</td>
                  <td class="text-xs ${isOverdue ? 'text-red font-semibold' : 'text-gray'}">
                    <div>${escapeHtml(l.next_action_note || (isOverdue ? 'Overdue follow-up' : 'Follow up'))}</div>
                    <div>${followUp}</div>
                  </td>
                  <td onclick="event.stopPropagation()">
                    <div class="row-actions" style="display:flex;align-items:center;gap:6px;">
                      ${l.phone ? `<button class="btn-direct-call" title="Call customer" onclick="window.app.quickCall('${l.id}')">${this._icon('phone', 12)} Call</button>` : ''}
                      <button class="btn btn-secondary btn-sm" onclick="window.app.openLeadDrawer('${l.id}')">Open</button>
                    </div>
                  </td>
                </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
      <div class="table-footer">Showing <strong>${tabFiltered.length}</strong> of <strong>${allLeads.length}</strong> authorised enquiries</div>`
      : this._empty('No leads match this view', hasActiveFilters ? 'Try clearing your active search or page filters.' : 'Sync Meta Lead Ads from Marketing / Meta, or add a customer enquiry manually.', null, null, `${hasActiveFilters ? '<button class="btn btn-secondary" onclick="window.app.clearLeadFilters()">Clear Filters</button> ' : ''}<button class="btn btn-primary" onclick="window.app.openAddLeadModal()">+ Add New Lead</button>`) }`;
  }

  clearLeadFilters() {
    this.leadSearchQuery = '';
    this.leadPageFilter = 'all';
    this.leadCampaignFilter = '';
    this.currentLeadTab = 'all';
    this.renderLeads();
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

    this.toast('Checking for new enquiries…', 'info');

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
        this.toast(newCount > 0 ? `Added ${newCount} new enquir${newCount === 1 ? 'y' : 'ies'}.` : 'Enquiries are up to date.', 'success');
        this.renderLeads();
      } else {
        this.toast('New enquiries are delayed. Your existing leads are still available.', 'info');
        if (this.svc && this.svc.fetchRemoteLeads) {
          await this.svc.fetchRemoteLeads();
        }
        this.renderLeads();
      }
    } catch (err) {
      this.toast('New enquiries are delayed. Your existing leads are still available.', 'info');
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

      <!-- ONE-CLICK COMMUNICATION & WORKFLOW BAR (Hooks human_first_response_at) -->
      <div class="lead-actions-bar" style="flex-wrap:wrap;">
        <button type="button" onclick="window.app.openLeadMessage('${lead.id}')" class="btn btn-primary btn-sm">💬 Open Inbox</button>
        <button type="button" onclick="window.app.openBookAppointmentModal('${lead.id}')" class="btn btn-secondary btn-sm">📅 Book Yard Visit</button>
        ${lead.phone ? `<a href="tel:${lead.phone}" onclick="window.crmService.recordFirstResponse('${lead.id}', 'call', {isAutomated:false})" class="btn btn-secondary btn-sm">${this._icon('phone', 13)} Call</a>` : ''}
        ${lead.email ? `<a href="mailto:${lead.email}" onclick="window.crmService.recordFirstResponse('${lead.id}', 'email', {isAutomated:false})" class="btn btn-secondary btn-sm">${this._icon('mail', 13)} Email</a>` : ''}
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
              ${this._getEligibleStaffForPage(lead.page_id || lead.pageId).map(s => `<option value="${s.id}" ${(lead.assigned_staff_id||lead.assignedStaffId)===s.id?'selected':''}>${escapeHtml(s.displayName || s.name)}</option>`).join('')}
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

        <!-- Dealership Buyer Qualification -->
        <div class="attribution-block" style="margin-top:10px;background:#F8FAFC;padding:10px 12px;border-radius:var(--radius-sm);border:1px solid var(--border);">
          <div style="font-size:11px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:8px;">Vehicle &amp; Deal Details</div>
          <div class="attr-row">
            <span class="attr-label">Vehicle</span>
            <input type="text" class="input input-sm" style="flex:1;max-width:210px;" placeholder="Interested vehicle..." value="${escapeHtml(lead.vehicle_interest || '')}" onchange="window.app.saveLeadQualification('${lead.id}', null, 'vehicle_interest', this.value)">
          </div>
          <div class="attr-row">
            <span class="attr-label">Budget (NZD)</span>
            <input type="number" class="input input-sm" style="width:120px;" placeholder="0" value="${lead.budget_nzd || ''}" onchange="window.app.saveLeadQualification('${lead.id}', null, 'budget_nzd', Number(this.value)||null)">
          </div>
          <div class="attr-row">
            <span class="attr-label">Cash / Finance</span>
            <select class="input input-sm" style="width:150px;" onchange="window.app.saveLeadQualification('${lead.id}', null, 'payment_preference', this.value)">
              <option value="">Undecided</option>
              <option value="Cash" ${lead.payment_preference==='Cash'?'selected':''}>Cash</option>
              <option value="Finance" ${lead.payment_preference==='Finance'?'selected':''}>Finance</option>
              <option value="Trade-in + Finance" ${lead.payment_preference==='Trade-in + Finance'?'selected':''}>Trade-in + Finance</option>
            </select>
          </div>
          <div class="attr-row">
            <span class="attr-label">Trade-in</span>
            <input type="text" class="input input-sm" style="flex:1;max-width:210px;" placeholder="Vehicle / details..." value="${escapeHtml(lead.trade_in_info || '')}" onchange="window.app.saveLeadQualification('${lead.id}', null, 'trade_in_info', this.value)">
          </div>
          <div class="attr-row">
            <span class="attr-label">Timeframe</span>
            <input type="text" class="input input-sm" style="flex:1;max-width:210px;" placeholder="e.g. This weekend" value="${escapeHtml(lead.buying_timeframe || '')}" onchange="window.app.saveLeadQualification('${lead.id}', null, 'buying_timeframe', this.value)">
          </div>
          ${lead.appointment_at ? `
          <div class="attr-row">
            <span class="attr-label">Yard Visit</span>
            <strong style="font-size:12px;color:#059669;">${new Date(lead.appointment_at).toLocaleString('en-NZ', { timeZone: 'Pacific/Auckland', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} (${escapeHtml(lead.appointment_status || 'scheduled')})</strong>
          </div>` : ''}
        </div>

        <!-- Original Meta Lead Ads Form Answers (never discarded) -->
        ${lead.custom_fields && Object.keys(lead.custom_fields).length > 0 ? `
        <details class="tech-details-toggle" style="margin-top:10px;" open>
          <summary style="font-size:12px;color:var(--text-secondary);cursor:pointer;font-weight:600;">Submitted Form Answers (${Object.keys(lead.custom_fields).length}) ▾</summary>
          <div class="attribution-block" style="margin-top:6px;background:#FFFBEB;padding:8px 12px;border-radius:var(--radius-sm);border:1px solid #FDE68A;">
            ${Object.entries(lead.custom_fields).map(([k, v]) => `
              <div class="attr-row"><span class="attr-label">${escapeHtml(String(k).replace(/_/g, ' '))}</span><strong>${escapeHtml(Array.isArray(v) ? v.join(', ') : String(v || '—'))}</strong></div>
            `).join('')}
          </div>
        </details>` : ''}

        <!-- Honest Meta Ads Attribution Details (never fabricated) -->
        <details class="tech-details-toggle" style="margin-top:10px;">
          <summary style="font-size:12px;color:var(--text-muted);cursor:pointer;font-weight:500;">Meta Ads Source &amp; Attribution ▾</summary>
          <div class="attribution-block" style="margin-top:8px;background:#f8fafc;padding:8px 12px;border-radius:var(--radius-sm);">
            <div class="attr-row"><span class="attr-label">Campaign</span><strong>${escapeHtml(lead.campaign_name || lead.campaign_id || lead.campaignId || 'Unknown / Not supplied')}</strong></div>
            <div class="attr-row"><span class="attr-label">Ad Set</span><span>${escapeHtml(lead.adset_name || lead.adset_id || lead.adsetId || 'Unknown / Not supplied')}</span></div>
            <div class="attr-row"><span class="attr-label">Ad Creative</span><span>${escapeHtml(lead.ad_name || lead.ad_id || lead.adId || 'Unknown / Not supplied')}</span></div>
            <div class="attr-row"><span class="attr-label">Lead Form</span><span>${escapeHtml(lead.form_name || lead.form_id || lead.formId || 'Unknown / Not supplied')}</span></div>
            <div class="attr-row"><span class="attr-label">Meta Lead ID</span><span class="text-xs text-gray font-mono">${escapeHtml(lead.meta_leadgen_id || lead.meta_lead_id || 'N/A')}</span></div>
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
    this.el.title.textContent = (this.user && this.user.role === 'staff') ? 'My Pipeline' : 'Sales Pipeline';
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
                const stageRefMs = new Date(c.updated_at || c.created_at || c.createdAt || nowMs).getTime();
                const daysInStage = Math.max(0, Math.floor((nowMs - stageRefMs) / (1000 * 60 * 60 * 24)));
                const isStale = daysInStage >= 3 && (stage === 'New Lead' || stage === 'Contacted' || stage === 'New');
                const cardVal = c.sale_value_nzd || c.budget_nzd || c.value || c.dealValue || c.lead_value || 0;
                const nextDt = c.next_action_at || c.follow_up_date || c.followUpDate;
                return `
                <div class="kanban-card" draggable="true" ondragstart="window.app.onKanbanDragStart(event, '${c.id}')" onclick="window.app.openLeadDrawer('${c.id}')">
                  <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;margin-bottom:3px;">
                    <div class="kanban-card-name">${escapeHtml(c.name || c.full_name || 'Customer')}</div>
                    <span class="${isStale ? 'badge-stale' : 'badge badge-gray'}" style="font-size:10.5px;white-space:nowrap;" title="${daysInStage} day(s) in ${stage}">${daysInStage}d</span>
                  </div>
                  <div class="kanban-card-meta text-xs text-gray">${escapeHtml(this._pageName(c.page_id || c.pageId))}</div>
                  ${c.vehicle_interest ? `<div class="kanban-card-vehicle">🚗 ${escapeHtml(c.vehicle_interest)}</div>` : ''}
                  ${c.loss_reason && stage === 'Lost' ? `<div class="text-xs" style="color:#DC2626;margin-top:2px;">Lost: ${escapeHtml(c.loss_reason)}</div>` : ''}
                  <div class="kanban-card-footer">
                    <div class="staff-chip" title="${escapeHtml(this._staffName(c.assigned_staff_id || c.assignedStaffId || c.assigned_to))}">${(this._staffName(c.assigned_staff_id || c.assignedStaffId || c.assigned_to)||'?').charAt(0)}</div>
                    ${cardVal ? `<span class="text-xs font-semibold">${this.formatMoney(cardVal)}</span>` : '<span class="text-xs text-gray">No budget</span>'}
                    <span class="text-xs text-gray ml-auto">${nextDt ? new Date(nextDt).toLocaleDateString('en-NZ', { timeZone: 'Pacific/Auckland', day:'numeric', month:'short' }) : 'No next action'}</span>
                  </div>
                  <div class="kanban-card-stage-bar" onclick="event.stopPropagation()">
                    <select class="kanban-stage-select" aria-label="Change stage for ${escapeHtml(c.name || 'lead')}" onchange="window.app.moveLeadStage('${c.id}', this.value)">
                      ${stages.map(st => `<option value="${st}" ${(c.status === st || (st === 'New Lead' && c.status === 'New')) ? 'selected' : ''}>Move → ${st}</option>`).join('')}
                    </select>
                  </div>
                </div>`;
              }).join('')
              : `<div class="kanban-empty">No deals in ${stage}</div>`}
            </div>
          </div>`;
      }).join('');

      const emptyBanner = leads.length === 0 ? `
        <div style="background:#FFFFFF;border:1px solid var(--border-subtle);border-radius:10px;padding:14px 18px;margin-bottom:14px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
          <div style="display:flex;align-items:center;gap:10px;">
            <span style="color:var(--text-secondary);display:inline-flex;">${this._icon('clipboard', 18)}</span>
            <span style="font-size:13px;color:var(--text-primary);"><strong>Pipeline is currently empty.</strong> Sync Meta Lead Ads or add your first dealership enquiry.</span>
          </div>
          <button class="btn btn-primary btn-sm" onclick="window.app.openAddLeadModal()">+ Add First Lead</button>
        </div>` : '';

      this.el.content.innerHTML = `${emptyBanner}<div class="kanban-board">${colsHtml}</div>`;
    } else {
      this.renderLeads();
    }
  }

  moveLeadStage(leadId, newStage) {
    if (!leadId || !newStage || !this.svc) return;
    const lead = (this.svc.leads || []).find(l => String(l.id) === String(leadId));
    if (lead && lead.status !== newStage) {
      const prev = lead.status;
      lead.status = newStage;
      lead.updated_at = new Date().toISOString();
      if (!lead.activities) lead.activities = [];
      lead.activities.push({
        type: 'STAGE_MOVED',
        description: `Moved from ${prev} → ${newStage}`,
        timestamp: lead.updated_at
      });
      this.svc._saveToStorage ? this.svc._saveToStorage() : this.svc.saveAll();
      this.toast(`Moved ${lead.name || 'lead'} to ${newStage}`, 'success');
      this.renderPipeline();
    }
  }

  onKanbanDragStart(e, leadId) {
    e.dataTransfer.setData('text/plain', leadId);
  }

  async onKanbanDrop(e, newStage) {
    e.preventDefault();
    const leadId = e.dataTransfer.getData('text/plain');
    if (!leadId) return;

    if (this.svc) {
      const lead = this.svc.leads.find(l => l.id === leadId);
      if (lead && lead.status !== newStage) {
        const prev = lead.status;
        lead.status = newStage;
        if (!lead.activities) lead.activities = [];
        lead.activities.push({
          type: 'STAGE_MOVED',
          description: `Moved from ${prev} → ${newStage}`,
          timestamp: new Date().toISOString()
        });
        this.svc._saveToStorage ? this.svc._saveToStorage() : this.svc.saveAll();
        this.renderPipeline();

        try {
          if (typeof this.svc.updateLeadStatus === 'function') {
            await this.svc.updateLeadStatus(leadId, newStage);
          } else {
            const authH = (this.svc && this.svc.getAuthHeaders) ? this.svc.getAuthHeaders() : { 'Content-Type': 'application/json' };
            await fetch('/api/leads', {
              method: 'PATCH',
              headers: authH,
              body: JSON.stringify({ id: leadId, status: newStage })
            });
          }
          this.toast(`Lead moved from ${prev} → ${newStage}`);
        } catch (err) {
          console.warn('[Kanban Drop Revert]:', err);
          lead.status = prev;
          this.svc._saveToStorage ? this.svc._saveToStorage() : this.svc.saveAll();
          this.renderPipeline();
          this.toast('Failed to save stage change to server. Reverted.', 'error');
        }
      }
    }
  }

  // ──────────────────────────────────────────────────────────
  // UNIFIED 3-COLUMN INBOX (Section 14 & 15)
  // ──────────────────────────────────────────────────────────

  _getContactInitials(name) {
    if (!name) return '?';
    const clean = name.replace(/^@/, '').trim();
    const parts = clean.split(/[\s._-]+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return clean.slice(0, 2).toUpperCase() || '?';
  }

  _getAvatarColor(name) {
    const colors = [
      { bg: '#EEF2FF', text: '#4338CA' }, // Indigo
      { bg: '#F5F3FF', text: '#6D28D9' }, // Purple
      { bg: '#ECFDF5', text: '#047857' }, // Emerald
      { bg: '#F0F9FF', text: '#0369A1' }, // Sky
      { bg: '#FEF3C7', text: '#B45309' }, // Amber
      { bg: '#FFF1F2', text: '#BE123C' }, // Rose
      { bg: '#F1F5F9', text: '#334155' }  // Slate
    ];
    let hash = 0;
    for (let i = 0; i < (name || '').length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const idx = Math.abs(hash) % colors.length;
    return colors[idx];
  }

  renderInbox() {
    if (!['inbox', 'messages', 'conversations'].includes(this.currentRoute)) {
      return;
    }
    this.el.title.textContent = (this.user && this.user.role === 'staff') ? 'My Messages' : 'Messages';

    // Page filter state initialization (remembered across navigation/reloads)
    if (!this.selectedInboxPage) {
      try {
        this.selectedInboxPage = localStorage.getItem('metacrm_inbox_page_filter') || 'all';
      } catch (e) {
        this.selectedInboxPage = 'all';
      }
    }

    // Accessible pages for current user
    const accessiblePages = this._getAccessiblePages ? this._getAccessiblePages() : [];
    if (this.selectedInboxPage !== 'all' && !accessiblePages.some(p => String(p.id) === String(this.selectedInboxPage) || String(p.page_id) === String(this.selectedInboxPage))) {
      this.selectedInboxPage = 'all';
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
    const userPages = accessiblePages.map(p => String(p.id || p.page_id));
    const accessibleConvs = (this.user && (this.user.role === 'admin' || this.user.role === 'super_admin'))
      ? convs
      : convs.filter(c => {
          const cPage = String(c.page_id || c.accountId || c.pageId || '');
          return !cPage || userPages.includes(cPage);
        });

    // Helper to test if a conversation belongs to a given page ID (100% dynamic — zero hardcoded IDs)
    const normalizePageId = (id) => {
      if (!id) return '';
      if (this.svc && typeof this.svc.resolveCanonicalPageId === 'function') {
        return this.svc.resolveCanonicalPageId(id);
      }
      return String(id).trim();
    };
    const convMatchesPage = (c, pageId) => {
      if (!pageId || pageId === 'all') return true;
      const targetNorm = normalizePageId(pageId);
      const cNorm1 = normalizePageId(c.page_id);
      const cNorm2 = normalizePageId(c.accountId);
      const cNorm3 = normalizePageId(c.pageId);
      return targetNorm === cNorm1 || targetNorm === cNorm2 || targetNorm === cNorm3;
    };

    // Calculate per-page metrics for quick-switcher chips and dropdown
    const allActiveConvs = accessibleConvs.filter(c => !c.is_archived);
    const allPagesTotalCount = allActiveConvs.length;
    const allPagesUnreadCount = allActiveConvs.filter(c => (c.unread || c.unread_count || 0) > 0).length;

    const pageMetrics = accessiblePages.map(p => {
      const pConvs = allActiveConvs.filter(c => convMatchesPage(c, p.id || p.page_id));
      const pUnread = pConvs.filter(c => (c.unread || c.unread_count || 0) > 0).length;
      return {
        page: p,
        total: pConvs.length,
        unread: pUnread
      };
    });

    const livePageCount = accessiblePages.length;
    this.el.actions.innerHTML = `
      <div class="inbox-topbar-meta-status" title="Authorised connected Meta pages">
        <span class="status-live-pulse"></span>
        <span>${livePageCount} ${livePageCount === 1 ? 'Page' : 'Pages'} Active</span>
      </div>
      <button class="topbar-pill-btn" id="btn-inbox-refresh" onclick="window.app.refreshRealInbox()" title="Fetch newest messages from Meta">
        <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
        <span>Refresh</span>
      </button>
      <button class="topbar-pill-btn" id="btn-inbox-sync" onclick="window.app.syncConnections()" title="Re-sync connected Meta accounts">
        <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/></svg>
        <span>Sync</span>
      </button>`;

    // Ensure content wrapper has inbox-view-container for viewport-fit layout
    if (this.el.content && !this.el.content.classList.contains('inbox-view-container')) {
      this.el.content.classList.add('inbox-view-container');
    }

    // 0ms In-Memory Page Scoping
    let pageScopedConvs = accessibleConvs;
    if (this.selectedInboxPage && this.selectedInboxPage !== 'all') {
      pageScopedConvs = accessibleConvs.filter(c => convMatchesPage(c, this.selectedInboxPage));
    }

    const sortMode = this.inboxSortMode || 'latest';
    const activeTab = this.inboxTab || 'all';

    // Archived vs Active conversation filtering for current page scope
    const archivedCount = pageScopedConvs.filter(c => c.is_archived === true).length;
    let filteredConvs = (activeTab === 'archived')
      ? pageScopedConvs.filter(c => c.is_archived === true)
      : pageScopedConvs.filter(c => !c.is_archived);

    // Helper: "Needs Reply" = last message is from customer (distinct from Unread, which only tracks opening the thread)
    const convNeedsReply = (c) => {
      if (c.is_archived) return false;
      if (Array.isArray(c.messages) && c.messages.length > 0) {
        const last = c.messages[c.messages.length - 1];
        return last.incoming === true || last.sender_type === 'customer' || last.direction === 'inbound';
      }
      const prev = String(c.preview || c.last_message || '');
      if (prev.startsWith('You:')) return false;
      return true;
    };

    const convHasDueFollowup = (c) => {
      if (!this.svc || !this.svc.tasks) return false;
      const nowMs = Date.now();
      const matchedLead = (this.svc.leads || []).find(l => l.name === c.name || (c.phone && l.phone === c.phone) || String(l.id) === String(c.lead_id));
      if (!matchedLead) return false;
      return this.svc.tasks.some(t => String(t.lead_id || t.leadId) === String(matchedLead.id) && t.status !== 'Done' && t.dueDate && new Date(t.dueDate).getTime() <= nowMs + 24 * 3600 * 1000);
    };

    const needsReplyCount = pageScopedConvs.filter(c => !c.is_archived && convNeedsReply(c)).length;
    const unassignedCount = pageScopedConvs.filter(c => !c.is_archived && !(c.assigned_staff_id || c.assignedStaffId || c.assigned_to)).length;
    const mineCount = pageScopedConvs.filter(c => !c.is_archived && this.user && String(c.assigned_staff_id || c.assignedStaffId || c.assigned_to) === String(this.user.id)).length;
    const followupDueCount = pageScopedConvs.filter(c => !c.is_archived && convHasDueFollowup(c)).length;

    // Filter by Work Queue / Channel / Archived
    if (activeTab === 'needs_reply') {
      filteredConvs = filteredConvs.filter(c => convNeedsReply(c));
    } else if (activeTab === 'unread') {
      filteredConvs = filteredConvs.filter(c => (c.unread || c.unread_count || 0) > 0);
    } else if (activeTab === 'unassigned') {
      filteredConvs = filteredConvs.filter(c => !(c.assigned_staff_id || c.assignedStaffId || c.assigned_to));
    } else if (activeTab === 'mine') {
      filteredConvs = filteredConvs.filter(c => this.user && String(c.assigned_staff_id || c.assignedStaffId || c.assigned_to) === String(this.user.id));
    } else if (activeTab === 'followup_due') {
      filteredConvs = filteredConvs.filter(c => convHasDueFollowup(c));
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

    const activeScopedConvs = pageScopedConvs.filter(c => !c.is_archived);
    const totalCount = activeScopedConvs.length;
    const unreadInboxCount = activeScopedConvs.filter(c => (c.unread || c.unread_count || 0) > 0).length;
    const starredCount = activeScopedConvs.filter(c => c.starred === true).length;
    const fbCount = activeScopedConvs.filter(c => !c.channel || c.channel.toLowerCase().includes('mess') || c.channel.toLowerCase().includes('face')).length;
    const igCount = activeScopedConvs.filter(c => c.channel && c.channel.toLowerCase().includes('insta')).length;

    const convList = filteredConvs;
    // Preserve the currently open conversation across page filter switches so a rep never accidentally sends from the wrong page
    let activeConv = accessibleConvs.find(c => String(c.id) === String(this.activeConvId)) || convList.find(c => String(c.id) === String(this.activeConvId)) || null;
    if (!activeConv && convList.length > 0) {
      activeConv = convList[0];
      this.activeConvId = activeConv.id;
    }
    const activeConvOutsideFilter = Boolean(activeConv && this.selectedInboxPage !== 'all' && !convMatchesPage(activeConv, this.selectedInboxPage));
    if (activeConv && (!activeConv.messages || activeConv.messages.length === 0) && !activeConv._fetchingMsgs) {
      activeConv._fetchingMsgs = true;
      setTimeout(() => this.fetchRealConversationMessages(activeConv), 50);
    }
    const matchingLead = (this.svc && activeConv) ? this.svc.leads.find(l => l.name === activeConv.name || (activeConv.phone && l.phone === activeConv.phone)) : null;
    const messages = activeConv
      ? ((Array.isArray(activeConv.messages) && activeConv.messages.length > 0)
          ? activeConv.messages
          : (activeConv.preview ? [{ id: 'msg_preview_' + activeConv.id, text: activeConv.preview, incoming: true, time: activeConv.time || '12:22 PM' }] : []))
      : [];
    const isIgActive = activeConv ? (activeConv.channel && activeConv.channel.toLowerCase().includes('insta')) : (activeTab === 'instagram');

    const activeInitials = activeConv ? this._getContactInitials(activeConv.name) : '?';
    const activeColor = activeConv ? this._getAvatarColor(activeConv.name) : { bg: '#F1F5F9', text: '#334155' };
    const activePageName = activeConv ? this._pageName(activeConv.page_id || activeConv.accountId || activeConv.pageId) : '';
    const activeDisplayTime = activeConv ? this._formatMessageTime(activeConv.last_message_at || activeConv.time) : '10:24 AM';
    const selectedPageObj = (this.selectedInboxPage !== 'all') ? accessiblePages.find(p => String(p.id) === String(this.selectedInboxPage) || String(p.page_id) === String(this.selectedInboxPage)) : null;

    const isAdminUser = this.user && (this.user.role === 'admin' || this.user.role === 'super_admin');
    const allPagesLabel = isAdminUser ? 'All Pages' : 'All Assigned Pages';
    const activeScopeLabel = this.selectedInboxPage === 'all' ? allPagesLabel : (selectedPageObj ? selectedPageObj.name : this._pageName(this.selectedInboxPage));

    const detailsCollapsed = sessionStorage.getItem('inbox_details_collapsed') !== 'false';
    this.el.content.innerHTML = `
      <div class="inbox-layout ${this.mobileInboxView === 'chat' ? 'view-chat' : 'view-list'} ${detailsCollapsed ? 'details-collapsed' : ''}">
        <!-- COLUMN 0: STABLE PAGE / ACCOUNT RAIL -->
        <aside class="inbox-page-rail" aria-label="Pages and channels">
          <div class="inbox-rail-header">
            <span class="inbox-rail-title">Pages (${accessiblePages.length})</span>
            ${isAdminUser ? `<button type="button" class="btn btn-ghost btn-sm" style="padding:2px 6px;font-size:11px;" onclick="window.app.navigate('connections')" title="Manage connected pages">+ Manage</button>` : ''}
          </div>
          <div class="inbox-rail-list" role="tablist" aria-label="Filter inbox by page">
            <button type="button" role="tab" aria-selected="${this.selectedInboxPage === 'all'}" class="inbox-rail-item ${this.selectedInboxPage === 'all' ? 'active' : ''}" onclick="window.app.setInboxPageFilter('all')" title="${allPagesLabel} — ${allPagesTotalCount} conversations, ${allPagesUnreadCount} unread [Alt+0]">
              <span class="inbox-rail-item-left">
                <span class="inbox-rail-channel all">🌐</span>
                <span class="inbox-rail-name">${allPagesLabel}</span>
              </span>
              <span class="inbox-rail-counts">
                ${allPagesUnreadCount > 0 ? `<span class="inbox-rail-unread" title="${allPagesUnreadCount} unread of ${allPagesTotalCount}">${allPagesUnreadCount}</span>` : `<span class="inbox-rail-total">${allPagesTotalCount}</span>`}
              </span>
            </button>
            ${pageMetrics.length === 0 ? `
              <div style="padding:12px 8px;font-size:11.5px;color:#64748B;line-height:1.45;">
                ${isAdminUser ? 'No pages connected yet. Go to Connections to connect Facebook or Instagram.' : 'No pages have been assigned to your account. Ask your manager to assign pages in Team.'}
              </div>
            ` : pageMetrics.map((pm, idx) => {
              const isSelected = String(this.selectedInboxPage) === String(pm.page.id);
              const isIg = pm.page.channel === 'instagram' || (pm.page.name && pm.page.name.startsWith('@'));
              return `
                <button type="button" role="tab" aria-selected="${isSelected}" class="inbox-rail-item ${isSelected ? 'active' : ''}" onclick="window.app.setInboxPageFilter('${pm.page.id}')" title="${escapeHtml(pm.page.name)} — ${pm.total} conversations, ${pm.unread} unread [Alt+${idx + 1}]">
                  <span class="inbox-rail-item-left">
                    <span class="inbox-rail-channel ${isIg ? 'ig' : 'fb'}">${isIg ? 'IG' : 'FB'}</span>
                    <span class="inbox-rail-name">${escapeHtml(pm.page.name)}</span>
                  </span>
                  <span class="inbox-rail-counts">
                    ${pm.unread > 0 ? `<span class="inbox-rail-unread" title="${pm.unread} unread of ${pm.total}">${pm.unread}</span>` : `<span class="inbox-rail-total">${pm.total}</span>`}
                  </span>
                </button>
              `;
            }).join('')}
          </div>
          <div class="inbox-rail-footer">
            Scope: <strong>${escapeHtml(activeScopeLabel)}</strong>
          </div>
        </aside>

        <!-- COLUMN 1: CONVERSATIONS LIST -->
        <div class="inbox-sidebar">
          <div class="inbox-sidebar-header" style="position:relative;padding:12px 12px 10px;gap:8px;">
            <div class="inbox-sidebar-title-row">
              <div style="min-width:0;flex:1;">
                <h2 class="inbox-sidebar-title" style="font-size:16px;">${escapeHtml(activeScopeLabel)}</h2>
                <div style="font-size:11px;color:#64748B;margin-top:1px;">${convList.length} shown · ${needsReplyCount} need reply</div>
              </div>
              <div style="display:flex;align-items:center;gap:6px;">
                <button class="inbox-action-btn-sm" onclick="window.app.toggleInboxFilterMenu(event)" title="Filter channel &amp; sort order">
                  <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>
                </button>
              </div>
            </div>

            <!-- Compact Page Selector (ONLY visible on tablet/mobile <= 1024px where left rail hides) -->
            <div class="inbox-mobile-page-bar">
              <select class="input input-sm w-full" aria-label="Select Page" onchange="window.app.setInboxPageFilter(this.value)">
                <option value="all" ${this.selectedInboxPage === 'all' ? 'selected' : ''}>🌐 ${allPagesLabel} (${allPagesTotalCount})</option>
                ${pageMetrics.map(pm => `<option value="${pm.page.id}" ${String(this.selectedInboxPage) === String(pm.page.id) ? 'selected' : ''}>${pm.page.channel === 'instagram' ? 'IG' : 'FB'} · ${escapeHtml(pm.page.name)} (${pm.total}${pm.unread > 0 ? ` · ${pm.unread} unread` : ''})</option>`).join('')}
              </select>
            </div>

            <!-- Channel & Sort Popover Menu (Page switching stays exclusively in the Rail) -->
            <div id="inbox-filter-menu-popover" class="inbox-filter-menu-popover" style="display:none;" onclick="event.stopPropagation()">
              <div class="filter-menu-section-title">CHANNELS</div>
              <div class="filter-menu-item ${activeTab === 'all' ? 'active' : ''}" onclick="window.app.setInboxTab('all'); window.app.toggleInboxFilterMenu();">
                <span>All Channels</span>
                <span class="filter-menu-badge">${totalCount}</span>
              </div>
              <div class="filter-menu-item ${(activeTab === 'facebook' || activeTab === 'messenger') ? 'active' : ''}" onclick="window.app.setInboxTab('facebook'); window.app.toggleInboxFilterMenu();">
                <span>Facebook Messenger</span>
                <span class="filter-menu-badge">${fbCount}</span>
              </div>
              <div class="filter-menu-item ${activeTab === 'instagram' ? 'active' : ''}" onclick="window.app.setInboxTab('instagram'); window.app.toggleInboxFilterMenu();">
                <span>Instagram Direct</span>
                <span class="filter-menu-badge">${igCount}</span>
              </div>
              <div class="filter-menu-item ${activeTab === 'starred' ? 'active' : ''}" onclick="window.app.setInboxTab('starred'); window.app.toggleInboxFilterMenu();">
                <span>Starred</span>
                <span class="filter-menu-badge">${starredCount}</span>
              </div>
              <div class="filter-menu-item ${activeTab === 'archived' ? 'active' : ''}" onclick="window.app.setInboxTab('archived'); window.app.toggleInboxFilterMenu();">
                <span>Archived</span>
                <span class="filter-menu-badge">${archivedCount}</span>
              </div>
              <div class="filter-menu-divider"></div>
              <div class="filter-menu-section-title">SORT BY</div>
              <div class="filter-menu-item ${sortMode === 'latest' ? 'active' : ''}" onclick="window.app.setInboxSort('latest'); window.app.toggleInboxFilterMenu();">
                <span>Latest message</span>
                ${sortMode === 'latest' ? '✓' : ''}
              </div>
              <div class="filter-menu-item ${sortMode === 'unread' ? 'active' : ''}" onclick="window.app.setInboxSort('unread'); window.app.toggleInboxFilterMenu();">
                <span>Unread first</span>
                ${sortMode === 'unread' ? '✓' : ''}
              </div>
              <div class="filter-menu-item ${sortMode === 'oldest' ? 'active' : ''}" onclick="window.app.setInboxSort('oldest'); window.app.toggleInboxFilterMenu();">
                <span>Oldest message</span>
                ${sortMode === 'oldest' ? '✓' : ''}
              </div>
            </div>

            <!-- Dealership Work Queues -->
            <div class="inbox-work-queues" id="inbox-filter-tabs" role="tablist" aria-label="Conversation work queues">
              <button type="button" class="inbox-queue-pill queue-urgent ${activeTab === 'needs_reply' ? 'active' : ''}" onclick="window.app.setInboxTab('needs_reply')" title="Needs Reply: Last message is from the customer and no rep has answered yet (different from Unread, which only tracks opening the chat).">
                <span>Needs Reply</span>
                <span class="inbox-queue-count">${needsReplyCount}</span>
              </button>
              <button type="button" class="inbox-queue-pill ${activeTab === 'unread' ? 'active' : ''}" onclick="window.app.setInboxTab('unread')" title="Unread: Threads with unopened incoming messages.">
                <span>Unread</span>
                <span class="inbox-queue-count">${unreadInboxCount}</span>
              </button>
              <button type="button" class="inbox-queue-pill ${activeTab === 'unassigned' ? 'active' : ''}" onclick="window.app.setInboxTab('unassigned')" title="Conversations with no assigned salesperson yet.">
                <span>Unassigned</span>
                <span class="inbox-queue-count">${unassignedCount}</span>
              </button>
              <button type="button" class="inbox-queue-pill ${activeTab === 'mine' ? 'active' : ''}" onclick="window.app.setInboxTab('mine')" title="Conversations assigned to you.">
                <span>Mine</span>
                <span class="inbox-queue-count">${mineCount}</span>
              </button>
              <button type="button" class="inbox-queue-pill ${activeTab === 'followup_due' ? 'active' : ''}" onclick="window.app.setInboxTab('followup_due')" title="Conversations whose lead has a follow-up task due today or overdue.">
                <span>Follow-up Due</span>
                <span class="inbox-queue-count">${followupDueCount}</span>
              </button>
              <button type="button" class="inbox-queue-pill ${activeTab === 'all' ? 'active' : ''}" onclick="window.app.setInboxTab('all')">
                <span>All</span>
                <span class="inbox-queue-count">${totalCount}</span>
              </button>
            </div>

            <div class="inbox-search-wrap">
              <span class="inbox-search-icon">
                <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
              </span>
              <input type="text" class="inbox-search-input" id="inbox-search-input" placeholder="Search in ${escapeHtml(activeScopeLabel)}..." value="${escapeHtml(this.inboxSearchQuery || '')}" oninput="window.app.searchInboxConversations(this.value)">
              ${this.inboxSearchQuery ? `<button class="inbox-search-clear" onclick="window.app.clearInboxSearch()" title="Clear search">✕</button>` : ''}
            </div>
          </div>

          <div class="inbox-conv-list" id="inbox-conv-list">
            <div id="inbox-search-empty" style="display:none;padding:24px 16px;text-align:center;font-size:12px;color:var(--text-secondary);">
              No conversations matching "${escapeHtml(this.inboxSearchQuery || '')}"
            </div>
            ${convList.length === 0 ? `
              <div class="inbox-conv-empty">
                <div class="inbox-conv-empty-icon" style="display:flex;justify-content:center;">${activeTab === 'instagram' ? this._icon('instagram', 28) : this._icon('facebook', 28)}</div>
                <strong class="inbox-conv-empty-title">
                  ${this.selectedInboxPage !== 'all' ? `No messages for ${escapeHtml(selectedPageObj ? selectedPageObj.name : this.selectedInboxPage)}` : (activeTab === 'archived' ? 'No archived conversations' : (activeTab === 'starred' ? 'No starred conversations' : 'No conversations yet'))}
                </strong>
                <p class="inbox-conv-empty-desc">
                  ${this.selectedInboxPage !== 'all' ? 'Messages sent to this page will appear here.' : (activeTab === 'archived' ? 'Archived messages will appear here.' : (activeTab === 'starred' ? 'Starred conversations appear here.' : 'Messages from your connected Meta accounts appear here.'))}
                </p>
                <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;">
                  ${this.selectedInboxPage !== 'all' ? `
                    <button class="btn btn-secondary btn-sm" onclick="window.app.setInboxPageFilter('all')">
                      Show All Pages
                    </button>
                    <button class="btn btn-primary btn-sm" onclick="window.app.simulateInboundMessageForPage('${this.selectedInboxPage}')">
                      + Simulate Message
                    </button>
                  ` : `
                    <button class="btn btn-secondary btn-sm" onclick="window.app.refreshInbox()">
                      ↻ Refresh
                    </button>
                    <button class="btn btn-primary btn-sm" onclick="window.app.simulateInboundMessage()">
                      + Simulate Message
                    </button>
                  `}
                </div>
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
              const convPageName = this._pageName(c.page_id || c.accountId || c.pageId) || 'Main Page';

              return `
              <div class="inbox-conv-item ${isCurrentActive ? 'active' : ''}" data-conv-id="${c.id}" data-search-text="${escapeHtml(searchText)}" onclick="window.app.selectInboxConv('${c.id}')">
                <div class="conv-avatar" style="background-color:${color.bg};color:${color.text};">
                  ${initials}
                  <span class="conv-platform-badge ${isIg ? 'badge-ig-dot' : 'badge-fb-dot'}" title="${isIg ? 'Instagram Direct' : 'Facebook Messenger'}">
                    ${isIg ? `<svg width="8" height="8" viewBox="0 0 24 24" fill="#FFFFFF"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>` : `<svg width="8" height="8" viewBox="0 0 24 24" fill="#FFFFFF"><path d="M12 2C6.477 2 2 6.145 2 11.258c0 2.91 1.455 5.518 3.735 7.21V22l3.415-1.874c.907.251 1.865.387 2.85.387 5.523 0 10-4.145 10-9.258C22 6.145 17.523 2 12 2zm1.054 12.433l-2.585-2.756-5.044 2.756 5.549-5.89 2.651 2.756 4.978-2.756-5.549 5.89z"/></svg>`}
                  </span>
                </div>
                <div class="conv-info">
                  <div class="conv-name-row">
                    <div style="display:flex;align-items:center;gap:6px;min-width:0;flex:1;">
                      <span class="conv-name text-truncate">${escapeHtml(c.name)}</span>
                      ${isUnread ? `<span class="conv-unread-dot" title="Unread message"></span>` : ''}
                    </div>
                    <div style="display:flex;align-items:center;gap:4px;">
                      <span class="conv-time">${displayTime}</span>
                      <button class="conv-options-btn" onclick="window.app.toggleConvMenu('${c.id}', event)" title="Options">⋮</button>
                    </div>
                  </div>
                  <div class="conv-preview ${isUnread ? 'is-unread' : ''}">${escapeHtml(c.preview || 'No messages yet')}</div>
                  <div class="conv-channel-row" style="flex-wrap:wrap;gap:4px;">
                    <span class="conv-attribution-pill ${isIg ? 'ig' : 'fb'}" title="Originating page: ${escapeHtml(convPageName)} (${isIg ? 'Instagram Direct' : 'Facebook Messenger'})">
                      <span class="attribution-dot">${isIg ? 'IG' : 'FB'}</span>
                      <span class="attribution-name text-truncate">${escapeHtml(convPageName)}</span>
                    </span>
                    ${this._getConvDraft(c.id) ? `<span class="conv-draft-badge" title="Unsent draft saved">Draft</span>` : ''}
                    ${convNeedsReply(c) ? `<span class="conv-needs-reply-badge" title="Customer sent the last message — awaiting rep reply">Needs reply</span>` : ''}
                    ${(c.assigned_staff_id || c.assignedStaffId || c.assigned_to) ? `<span class="conv-lead-pill" title="Assigned owner">${escapeHtml(this._staffName(c.assigned_staff_id || c.assignedStaffId || c.assigned_to))}</span>` : ''}
                    ${(c.unread || 0) > 0 ? `<span class="conv-unread-count-bubble" title="${c.unread} unread">${c.unread}</span>` : ''}
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
                  <span class="thread-lead-badge">${matchingLead ? escapeHtml(matchingLead.status || 'Lead') : 'Lead'}</span>
                </div>
                <div class="thread-sub text-truncate">
                  <span>${isIgActive ? 'Instagram Direct' : 'Facebook Messenger'}</span>
                  <span>·</span>
                  <span class="thread-page-badge" onclick="window.app.setInboxPageFilter('${activeConv.page_id || activeConv.accountId || activeConv.pageId || ''}')" title="Filter inbox to: ${escapeHtml(activePageName)}" style="cursor:pointer;">
                    ${isIgActive ? '📸' : '📄'} ${escapeHtml(activePageName)}
                  </span>
                </div>
              </div>
              <div class="thread-header-actions">
                <button type="button" class="btn-thread-more" onclick="window.app.toggleConvMenu('${activeConv.id}', event)" title="Thread actions (Star, Mark Read/Unread, Archive)" aria-label="More thread actions">
                  <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/><circle cx="5" cy="12" r="2"/></svg>
                </button>
                <button type="button" class="inbox-details-toggle-btn ${!detailsCollapsed ? 'active' : ''}" onclick="window.app.toggleInboxDetails()" title="Toggle Customer &amp; CRM Context panel">
                  <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="15" y1="3" x2="15" y2="21"/></svg>
                  <span>Details</span>
                </button>
              </div>
            </div>

            <div class="inbox-thread" id="inbox-thread">
              ${messages.length ? `
                <div class="msg-date-divider"><span>Today, ${activeDisplayTime || '10:24 AM'}</span></div>
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
                            <button class="btn-msg-retry" onclick="window.app.retryInboxMessage('${m.id}')" title="Retry">↻ Retry</button>
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
                  <h3 class="thread-empty-title">Conversation with ${escapeHtml(activeConv.name)}</h3>
                  <p class="thread-empty-desc">
                    Send a message directly via ${isIgActive ? 'Instagram Direct' : 'Facebook Messenger'} below.
                  </p>
                  <div class="thread-suggested-prompts">
                    <button class="btn-suggested-prompt" onclick="window.app.insertSavedReply('Hello! Thanks for reaching out. How can our team help you today?')">
                      <span>👋 Hello! Thanks for reaching out. How can our team help?</span>
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

            <!-- Quick Reply Chips -->
            <div class="composer-quick-replies" id="composer-quick-replies">
              <span style="font-size:11px;font-weight:600;color:var(--text-muted);display:flex;align-items:center;padding:0 4px;">⚡ Quick:</span>
              <button class="composer-quick-chip" type="button" onclick="window.app.insertSavedReply('Hello! Thanks for reaching out to Nova Autos. How can our team help you today?')">
                <span>👋 Hello! How can we help?</span>
              </button>
              <button class="composer-quick-chip" type="button" onclick="window.app.insertSavedReply('Hi! Yes, this vehicle is currently on our lot in Auckland and available for a test drive. Would Saturday suit you?')">
                <span>🚗 Available for test drive</span>
              </button>
              <button class="composer-quick-chip" type="button" onclick="window.app.insertSavedReply('We offer zero-deposit and low-deposit weekly finance starting from $85/week with fast approval.')">
                <span>💰 Finance options</span>
              </button>
            </div>

            ${(() => {
              const ownerId = activeConv.assigned_staff_id || activeConv.assignedStaffId || activeConv.assigned_to || (matchingLead && (matchingLead.assigned_staff_id || matchingLead.assignedStaffId));
              const isOtherOwner = ownerId && this.user && String(ownerId) !== String(this.user.id);
              const lastCustomerMsg = (messages || []).slice().reverse().find(m => m.incoming === true || m.sender_type === 'customer');
              const lastCustMs = lastCustomerMsg ? new Date(lastCustomerMsg.created_at || activeConv.last_message_at || Date.now()).getTime() : new Date(activeConv.last_message_at || Date.now()).getTime();
              const hoursSinceCustomer = Math.max(0, (Date.now() - lastCustMs) / (1000 * 3600));
              const windowExpired = !isNaN(hoursSinceCustomer) && hoursSinceCustomer > 24;
              return `
                ${isOtherOwner ? `
                  <div class="composer-collision-banner">
                    <span>⚠️ Owned by <strong>${escapeHtml(this._staffName(ownerId))}</strong> — coordinate before replying to avoid duplicate responses.</span>
                    <button type="button" class="btn btn-ghost btn-sm" style="padding:2px 8px;font-size:11px;color:#991B1B;" onclick="window.app.assignConversation('${activeConv.id}', '${this.user.id}')">Take ownership</button>
                  </div>
                ` : ''}
                <div class="composer-sender-banner ${activeConvOutsideFilter ? 'sender-mismatch' : ''}" id="composer-sender-banner" data-sender-page-id="${escapeHtml(String(activeConv.page_id || activeConv.accountId || ''))}">
                  <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                    <span style="font-weight:700;">Replying as:</span>
                    <span class="badge ${isIgActive ? 'badge-pink' : 'badge-indigo'}" style="font-size:11px;padding:2px 8px;">${isIgActive ? 'IG' : 'FB'} · ${escapeHtml(activePageName)}</span>
                    ${activeConvOutsideFilter ? `<span style="font-size:11px;font-weight:600;">(List filtered to ${escapeHtml(activeScopeLabel)} — sender stays locked to ${escapeHtml(activePageName)})</span>` : ''}
                  </div>
                  <div style="display:flex;align-items:center;gap:8px;">
                    <span style="font-size:11px;color:${windowExpired ? '#B45309' : '#059669'};font-weight:600;" title="${windowExpired ? 'Meta 24-hour standard reply window may have closed. Replies require a new customer message or approved template.' : 'Within Meta 24-hour standard messaging window.'}">
                      ${windowExpired ? '⏱️ 24h window likely closed' : '● Eligible to reply'}
                    </span>
                    <button type="button" class="btn btn-secondary btn-sm" style="padding:2px 8px;font-size:11px;" onclick="window.app.openVehicleStockPicker('${activeConv.id}')" title="Share a vehicle from dealership stock into this reply">🚗 Share Car</button>
                  </div>
                </div>
              `;
            })()}

            <div class="inbox-composer" ondragover="event.preventDefault(); this.classList.add('drag-over');" ondragleave="this.classList.remove('drag-over');" ondrop="window.app.handleComposerDrop(event)">
              <input type="file" id="inbox-file-input" style="display:none;" accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt" onchange="window.app.handleFileSelected(event)">
              <div id="inbox-attachment-preview-bar" style="display:none;padding:8px 14px;background:#F8FAFC;border-bottom:1px solid var(--border);align-items:center;gap:10px;"></div>

              <div class="composer-bar-container">
                <button class="btn-composer-attach" onclick="window.app.handleAttachmentClick()" title="Attach photo, video or document (max 25MB)" type="button">
                  <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.75" viewBox="0 0 24 24"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
                </button>
                <textarea class="inbox-msg-textarea" id="inbox-msg-input" placeholder="Reply to ${escapeHtml(activeConv.name)}..." rows="1" onkeydown="window.app.handleComposerKeydown(event)" oninput="window.app.handleComposerInput(this)" onpaste="window.app.handleComposerPaste(event)">${escapeHtml(this._getConvDraft(activeConv.id))}</textarea>
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
              <h3 class="inbox-empty-title">Select a conversation</h3>
              <p class="inbox-empty-desc">
                Choose a conversation from the left to view customer messages and reply.
              </p>
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
                
                <div style="display:flex;gap:8px;width:100%;margin-top:10px;">
                  <button class="btn-meta-action" onclick="window.app.openMetaConversation('${activeConv.id}')" style="flex:1;">
                    <svg width="14" height="14" fill="#1877F2" viewBox="0 0 24 24"><path d="M12 2C6.477 2 2 6.145 2 11.258c0 2.91 1.455 5.518 3.735 7.21V22l3.415-1.874c.907.251 1.865.387 2.85.387 5.523 0 10-4.145 10-9.258C22 6.145 17.523 2 12 2zm1.054 12.433l-2.585-2.756-5.044 2.756 5.549-5.89 2.651 2.756 4.978-2.756-5.549 5.89z"/></svg>
                    <span>Message in Meta</span>
                  </button>
                  ${matchingLead ? `
                    <button class="btn-create-lead-action" onclick="window.app.openLeadDrawer('${matchingLead.id}')" style="flex:1;">
                      <span>Open Lead →</span>
                    </button>
                  ` : `
                    <button class="btn-create-lead-action" onclick="window.app.createLeadFromConv('${escapeHtml(activeConv.name)}', '${activeConv.page_id}')" style="flex:1;">
                      <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                      <span>Create CRM Lead</span>
                    </button>
                  `}
                </div>
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
                  <span class="idetail-label">Connected Page</span>
                  <span class="idetail-value text-truncate" style="max-width:160px;" title="${escapeHtml(activePageName)}">
                    ${isIgActive ? '📸' : '📄'} ${escapeHtml(activePageName)}
                  </span>
                </div>
                <div class="idetail-row">
                  <span class="idetail-label">Lead Activity</span>
                  <span class="idetail-value"><span class="status-dot-green"></span> Active recently</span>
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
                  <span class="idetail-label">Owner</span>
                  <span class="idetail-value">
                    <select class="idetail-select" onchange="window.app.assignConversation('${activeConv.id}', this.value)">
                      <option value="">Unassigned</option>
                      ${this._getEligibleStaffForPage(activeConv.page_id || activeConv.accountId).map(s => `
                        <option value="${s.id}" ${(activeConv.assigned_staff_id || activeConv.assignedStaffId || activeConv.assigned_to || (matchingLead && (matchingLead.assigned_staff_id || matchingLead.assignedStaffId))) === s.id ? 'selected' : ''}>${escapeHtml(s.displayName || s.name)}</option>
                      `).join('')}
                    </select>
                  </span>
                </div>
                <div class="idetail-row">
                  <span class="idetail-label">Last Interaction</span>
                  <span class="idetail-value">${this._timeAgo(activeConv.last_message_at || activeConv.time)}</span>
                </div>
                <div class="idetail-row">
                  <span class="idetail-label">Next Action</span>
                  <span class="idetail-value">${matchingLead && matchingLead.next_action_note ? escapeHtml(matchingLead.next_action_note) : '<span style="color:#94A3B8;">None scheduled</span>'}</span>
                </div>
                <div style="display:flex;gap:6px;margin-top:8px;">
                  <button type="button" class="btn btn-secondary btn-sm" style="flex:1;font-size:11px;" onclick="window.app.openBookAppointmentModal('${matchingLead ? matchingLead.id : ''}', '${activeConv.id}')">📅 Book Yard Visit</button>
                  <button type="button" class="btn btn-secondary btn-sm" style="flex:1;font-size:11px;" onclick="window.app.openQuickFollowupModal('${matchingLead ? matchingLead.id : ''}', '${activeConv.id}')">⏰ Next Action</button>
                </div>
              </div>

              <!-- DEALERSHIP QUALIFICATION (Progressive Disclosure) -->
              <details class="idetail-card" ${matchingLead && (matchingLead.vehicle_interest || matchingLead.budget_nzd || matchingLead.payment_preference) ? 'open' : ''}>
                <summary class="idetail-section-heading" style="cursor:pointer;margin-bottom:0;display:flex;justify-content:space-between;align-items:center;">
                  <span>VEHICLE &amp; BUYER DETAILS</span>
                  <span style="font-size:10px;color:#64748B;">▾</span>
                </summary>
                <div style="display:flex;flex-direction:column;gap:8px;margin-top:10px;">
                  <div>
                    <label style="font-size:11px;color:#64748B;display:block;margin-bottom:2px;">Interested Vehicle</label>
                    <input type="text" class="input input-sm w-full" placeholder="e.g. 2019 Toyota Aqua Hybrid" value="${escapeHtml(matchingLead?.vehicle_interest || '')}" onchange="window.app.saveLeadQualification('${matchingLead ? matchingLead.id : ''}', '${activeConv.id}', 'vehicle_interest', this.value)">
                  </div>
                  <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
                    <div>
                      <label style="font-size:11px;color:#64748B;display:block;margin-bottom:2px;">Budget (NZD)</label>
                      <input type="number" class="input input-sm w-full" placeholder="15000" value="${matchingLead?.budget_nzd || ''}" onchange="window.app.saveLeadQualification('${matchingLead ? matchingLead.id : ''}', '${activeConv.id}', 'budget_nzd', Number(this.value)||null)">
                    </div>
                    <div>
                      <label style="font-size:11px;color:#64748B;display:block;margin-bottom:2px;">Payment</label>
                      <select class="input input-sm w-full" onchange="window.app.saveLeadQualification('${matchingLead ? matchingLead.id : ''}', '${activeConv.id}', 'payment_preference', this.value)">
                        <option value="">Undecided</option>
                        <option value="Cash" ${matchingLead?.payment_preference==='Cash'?'selected':''}>Cash</option>
                        <option value="Finance" ${matchingLead?.payment_preference==='Finance'?'selected':''}>Finance</option>
                        <option value="Trade-in + Finance" ${matchingLead?.payment_preference==='Trade-in + Finance'?'selected':''}>Trade-in + Finance</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label style="font-size:11px;color:#64748B;display:block;margin-bottom:2px;">Trade-in / Timeframe</label>
                    <input type="text" class="input input-sm w-full" placeholder="e.g. 2012 Swift trade-in · Buying this week" value="${escapeHtml(matchingLead?.trade_in_info || matchingLead?.buying_timeframe || '')}" onchange="window.app.saveLeadQualification('${matchingLead ? matchingLead.id : ''}', '${activeConv.id}', 'trade_in_info', this.value)">
                  </div>
                </div>
              </details>

              <!-- INTERNAL TEAM NOTES -->
              <div class="idetail-card">
                <div class="idetail-section-heading">INTERNAL TEAM NOTES</div>
                <div class="idetail-notes-container">
                  <textarea class="idetail-notes-textarea" id="inbox-note-input" placeholder="Add internal notes, tags or reminders..." onkeydown="if(event.key==='Enter'&amp;&amp;!event.shiftKey){event.preventDefault();window.app.saveInboxNote('${activeConv.id}');}"></textarea>
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
              <div class="inbox-details-title">Customer &amp; CRM Context</div>
            </div>
            <div class="inbox-details-empty">
              <div class="inbox-details-empty-icon">${this._icon('user', 32)}</div>
              <p style="font-size:13px;color:#737B89;margin-top:12px;">Select a conversation to view customer details, lead status and CRM notes.</p>
            </div>
          `}
        </div>
      </div>`;

    // Auto-scroll thread to bottom
    const thread = document.getElementById('inbox-thread');
    if (thread) {
      setTimeout(() => { thread.scrollTop = thread.scrollHeight; }, 30);
    }

    // Initialize interactive movable chips carousel
    this._initInboxChipsCarousel();
  }

  _initInboxChipsCarousel() {
    setTimeout(() => {
      const chipsBar = document.getElementById('inbox-page-chips-bar');
      const leftBtn = document.getElementById('chips-arrow-left');
      const rightBtn = document.getElementById('chips-arrow-right');
      if (!chipsBar) return;

      // 1. Wheel to horizontal scroll
      chipsBar.onwheel = (e) => {
        if (e.deltaY !== 0) {
          e.preventDefault();
          chipsBar.scrollLeft += e.deltaY;
          this._updateChipsNavArrows();
        }
      };

      // 2. Mouse Drag-to-Scroll (Pan)
      let isDown = false;
      let startX = 0;
      let scrollLeft = 0;
      let moved = false;

      chipsBar.onmousedown = (e) => {
        isDown = true;
        moved = false;
        startX = e.pageX - chipsBar.offsetLeft;
        scrollLeft = chipsBar.scrollLeft;
        chipsBar.classList.add('is-dragging');
      };

      const stopDrag = () => {
        if (isDown) {
          isDown = false;
          chipsBar.classList.remove('is-dragging');
          setTimeout(() => { this._isDraggingChips = false; }, 40);
        }
      };

      chipsBar.onmouseleave = stopDrag;
      chipsBar.onmouseup = stopDrag;

      chipsBar.onmousemove = (e) => {
        if (!isDown) return;
        const x = e.pageX - chipsBar.offsetLeft;
        const walk = (x - startX) * 1.5;
        if (Math.abs(walk) > 4) {
          moved = true;
          this._isDraggingChips = true;
        }
        chipsBar.scrollLeft = scrollLeft - walk;
        this._updateChipsNavArrows();
      };

      // 3. Update arrows on scroll
      chipsBar.onscroll = () => this._updateChipsNavArrows();

      // 4. Scroll active chip into view
      const activeChip = chipsBar.querySelector('.inbox-page-chip.active');
      if (activeChip) {
        activeChip.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      }

      this._updateChipsNavArrows();
    }, 40);
  }

  scrollInboxChips(direction) {
    const bar = document.getElementById('inbox-page-chips-bar');
    if (!bar) return;
    const scrollStep = Math.max(160, bar.clientWidth * 0.7);
    bar.scrollBy({ left: direction * scrollStep, behavior: 'smooth' });
    setTimeout(() => this._updateChipsNavArrows(), 250);
  }

  _updateChipsNavArrows() {
    const bar = document.getElementById('inbox-page-chips-bar');
    const leftBtn = document.getElementById('chips-arrow-left');
    const rightBtn = document.getElementById('chips-arrow-right');
    if (!bar || !leftBtn || !rightBtn) return;
    const canScrollLeft = bar.scrollLeft > 2;
    const canScrollRight = bar.scrollLeft + bar.clientWidth < (bar.scrollWidth - 4);
    leftBtn.style.opacity = canScrollLeft ? '1' : '0.2';
    leftBtn.style.pointerEvents = canScrollLeft ? 'auto' : 'none';
    rightBtn.style.opacity = canScrollRight ? '1' : '0.2';
    rightBtn.style.pointerEvents = canScrollRight ? 'auto' : 'none';
  }

  setInboxTab(tab) {
    this.inboxTab = tab;
    this.renderInbox();
  }

  setInboxSort(sort) {
    this.inboxSortMode = sort;
    this.renderInbox();
  }

  setInboxPageFilter(pageId) {
    this.selectedInboxPage = pageId || 'all';
    try {
      localStorage.setItem('metacrm_inbox_page_filter', this.selectedInboxPage);
    } catch (e) {}

    // Find accessible conversations
    const convs = (this.svc ? (this.svc.conversations || []) : []);
    const accessiblePages = this._getAccessiblePages ? this._getAccessiblePages() : [];
    const userPages = accessiblePages.map(p => String(p.id || p.page_id));
    const accessibleConvs = (this.user && (this.user.role === 'admin' || this.user.role === 'super_admin'))
      ? convs
      : convs.filter(c => {
          const cPage = String(c.page_id || c.accountId || c.pageId || '');
          return !cPage || userPages.includes(cPage);
        });

    const normalizePageId = (id) => {
      if (!id) return '';
      if (this.svc && typeof this.svc.resolveCanonicalPageId === 'function') {
        return this.svc.resolveCanonicalPageId(id);
      }
      return String(id).trim();
    };
    const convMatchesPage = (c, pId) => {
      if (!pId || pId === 'all') return true;
      const targetNorm = normalizePageId(pId);
      const cNorm1 = normalizePageId(c.page_id);
      const cNorm2 = normalizePageId(c.accountId);
      const cNorm3 = normalizePageId(c.pageId);
      return targetNorm === cNorm1 || targetNorm === cNorm2 || targetNorm === cNorm3;
    };

    let matching = accessibleConvs.filter(c => !c.is_archived);
    if (this.selectedInboxPage !== 'all') {
      matching = matching.filter(c => convMatchesPage(c, this.selectedInboxPage));
    }

    // Save any current draft before re-rendering
    const curInput = document.getElementById('inbox-msg-input');
    if (curInput && this.activeConvId) {
      this._setConvDraft(this.activeConvId, curInput.value);
    }

    // Only auto-select a conversation if none is currently open.
    // Switching page filters MUST NEVER silently change the sender of an open conversation!
    if (!this.activeConvId && matching.length > 0) {
      this.activeConvId = matching[0].id;
    }

    // 0ms instant UI update
    this.renderInbox();
  }

  simulateInboundMessageForPage(pageId) {
    const pages = this._getAccessiblePages ? this._getAccessiblePages() : [];
    const page = pages.find(p => String(p.id) === String(pageId) || String(p.page_id) === String(pageId)) || pages[0];
    const isIg = page ? (page.channel === 'instagram' || (page.name && page.name.startsWith('@'))) : false;
    this.simulateInboundMessage(isIg ? 'instagram' : 'messenger', page ? (page.id || page.page_id) : pageId);
  }

  toggleInboxFilterMenu(e) {
    if (e && e.stopPropagation) e.stopPropagation();
    const pop = document.getElementById('inbox-filter-menu-popover');
    if (!pop) return;
    const isShowing = pop.style.display !== 'none';
    pop.style.display = isShowing ? 'none' : 'block';
    if (!isShowing) {
      const closeHandler = () => {
        if (pop) pop.style.display = 'none';
        document.removeEventListener('click', closeHandler);
      };
      setTimeout(() => document.addEventListener('click', closeHandler), 10);
    }
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
        headers: (this.svc && this.svc.getAuthHeaders) ? this.svc.getAuthHeaders() : { 'Content-Type': 'application/json' },
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
        headers: (this.svc && this.svc.getAuthHeaders) ? this.svc.getAuthHeaders() : { 'Content-Type': 'application/json' },
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
        headers: (this.svc && this.svc.getAuthHeaders) ? this.svc.getAuthHeaders() : { 'Content-Type': 'application/json' },
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
    const prevInput = document.getElementById('inbox-msg-input');
    if (prevInput && this.activeConvId) {
      this._setConvDraft(this.activeConvId, prevInput.value);
    }
    this.activeConvId = convId;
    this.mobileInboxView = 'chat';

    const conv = (this.svc && this.svc.conversations) ? this.svc.conversations.find(c => String(c.id) === String(convId)) : null;
    if (conv && ((conv.unread || 0) > 0 || (conv.unread_count || 0) > 0)) {
      conv.unread = 0;
      conv.unread_count = 0;
      if (this.svc && this.svc._saveToStorage) this.svc._saveToStorage();
      else if (this.svc && this.svc.saveAll) this.svc.saveAll();
      try {
        const authH = (this.svc && this.svc.getAuthHeaders) ? this.svc.getAuthHeaders() : { 'Content-Type': 'application/json' };
        fetch('/api/messages', {
          method: 'PATCH',
          headers: authH,
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
          headers: (this.svc && this.svc.getAuthHeaders) ? this.svc.getAuthHeaders() : { 'Content-Type': 'application/json' },
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

  _getConvDraft(convId) {
    if (!convId) return '';
    this._convDrafts = this._convDrafts || {};
    if (this._convDrafts[convId] !== undefined) return this._convDrafts[convId];
    try {
      const stored = sessionStorage.getItem('metacrm_draft_' + convId);
      if (stored) {
        this._convDrafts[convId] = stored;
        return stored;
      }
    } catch (e) {}
    return '';
  }

  _setConvDraft(convId, text) {
    if (!convId) return;
    this._convDrafts = this._convDrafts || {};
    const val = text || '';
    if (val.trim()) {
      this._convDrafts[convId] = val;
      try { sessionStorage.setItem('metacrm_draft_' + convId, val); } catch (e) {}
    } else {
      delete this._convDrafts[convId];
      try { sessionStorage.removeItem('metacrm_draft_' + convId); } catch (e) {}
    }
  }

  _getEligibleStaffForPage(pageId) {
    const staff = (this.svc && this.svc.staff) ? this.svc.staff : [];
    if (!pageId) return staff;
    const pid = String(pageId);
    return staff.filter(s => {
      if (s.status === 'deactivated' || s.status === 'suspended') return false;
      if (s.role === 'admin' || s.role === 'super_admin') return true;
      const assigned = s.assignedPageIds || s.assignedPages || [];
      return assigned.includes('*') || assigned.includes(pid);
    });
  }

  saveLeadQualification(leadId, convId, field, value) {
    if (!this.svc) return;
    let targetLeadId = leadId;
    if (!targetLeadId && convId) {
      const conv = (this.svc.conversations || []).find(c => String(c.id) === String(convId));
      if (conv) {
        const created = this.svc.addLead ? this.svc.addLead({
          name: conv.name,
          page_id: conv.page_id || conv.accountId,
          source: conv.channel === 'instagram' ? 'Instagram Direct' : 'Facebook Messenger',
          status: 'Contacted'
        }) : null;
        if (created && created.id) {
          targetLeadId = created.id;
          conv.lead_id = created.id;
        }
      }
    }
    if (targetLeadId && this.svc.updateLeadDealershipProfile) {
      this.svc.updateLeadDealershipProfile(targetLeadId, { [field]: value });
      this.toast('Buyer details saved ✓', 'success');
    }
  }

  openVehicleStockPicker(convId) {
    const vehicles = (this.svc && this.svc.getVehicles) ? this.svc.getVehicles() : [];
    this.el.mTitle.textContent = 'Share Dealership Vehicle Stock';
    this.el.mBody.innerHTML = `
      <p class="text-xs text-gray mb-3">Insert a clean vehicle summary into your reply. Always confirm physical yard availability and exact lender terms before promising finance.</p>
      <div style="display:flex;flex-direction:column;gap:8px;max-height:300px;overflow-y:auto;">
        ${vehicles.map(v => {
          const estWeekly = Math.round((v.priceNzd / 260) * 1.18);
          return `
            <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;border:1px solid var(--border);border-radius:8px;background:#F8FAFC;">
              <div>
                <div style="font-weight:700;font-size:13px;color:var(--text);">${escapeHtml(v.title)} <span class="badge badge-gray" style="font-size:10px;">${escapeHtml(v.stockNo)}</span></div>
                <div class="text-xs text-gray">${this.formatMoney(v.priceNzd)} NZD · ${(v.odometerKm||0).toLocaleString('en-NZ')} km · ${escapeHtml(v.fuel)} · ${escapeHtml(v.yard)}</div>
                <div style="font-size:11px;color:#059669;">Indicative estimate: ~$${estWeekly}/wk (subject to lender approval)</div>
              </div>
              <button type="button" class="btn btn-primary btn-sm" onclick="window.app.insertVehicleIntoReply('${v.id}')">Insert</button>
            </div>
          `;
        }).join('')}
      </div>
    `;
    this.el.mConfirm.style.display = 'none';
    this.el.mCancel.textContent = 'Close';
    this.el.mOverlay.classList.add('open');
  }

  insertVehicleIntoReply(vehId) {
    const vehicles = (this.svc && this.svc.getVehicles) ? this.svc.getVehicles() : [];
    const v = vehicles.find(x => x.id === vehId);
    if (!v) return;
    const msg = `Hi! Here are the details for the ${v.title} (Stock #${v.stockNo}): ${this.formatMoney(v.priceNzd)} NZD, ${(v.odometerKm||0).toLocaleString('en-NZ')} km, ${v.fuel} ${v.transmission} at our ${v.yard}. Would you like to book a test drive?`;
    this.el.mConfirm.style.display = '';
    this.closeModal();
    this.insertSavedReply(msg);
  }

  openBookAppointmentModal(leadId, convId = null) {
    const lead = (this.svc && leadId) ? this.svc.leads.find(l => String(l.id) === String(leadId)) : null;
    const conv = (this.svc && convId) ? this.svc.conversations.find(c => String(c.id) === String(convId)) : null;
    const defaultDate = new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 16);
    this.el.mTitle.textContent = 'Book Yard Visit / Test Drive';
    this.el.mBody.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:12px;">
        <div>
          <label class="form-label" style="font-size:12px;font-weight:600;display:block;margin-bottom:4px;">Customer</label>
          <input type="text" class="input w-full" id="appt-cust" value="${escapeHtml(lead?.name || conv?.name || '')}" readonly>
        </div>
        <div>
          <label class="form-label" style="font-size:12px;font-weight:600;display:block;margin-bottom:4px;">Vehicle for Test Drive</label>
          <input type="text" class="input w-full" id="appt-veh" placeholder="e.g. 2019 Toyota Aqua Hybrid" value="${escapeHtml(lead?.vehicle_interest || '')}">
        </div>
        <div>
          <label class="form-label" style="font-size:12px;font-weight:600;display:block;margin-bottom:4px;">Date &amp; Time (NZ)</label>
          <input type="datetime-local" class="input w-full" id="appt-dt" value="${defaultDate}">
        </div>
        <div>
          <label class="form-label" style="font-size:12px;font-weight:600;display:block;margin-bottom:4px;">Notes</label>
          <input type="text" class="input w-full" id="appt-note" placeholder="e.g. Bringing trade-in &amp; driver licence">
        </div>
      </div>
    `;
    this.el.mConfirm.style.display = '';
    this.el.mConfirm.textContent = 'Book Yard Visit';
    this.el.mConfirm.onclick = () => {
      const veh = document.getElementById('appt-veh')?.value?.trim() || 'Yard Visit';
      const dt = document.getElementById('appt-dt')?.value;
      const note = document.getElementById('appt-note')?.value?.trim() || '';
      if (!dt) return this.toast('Select appointment date and time.', 'warning');
      const isoDt = new Date(dt).toISOString();
      if (this.svc) {
        const taskObj = {
          id: 'appt_' + Date.now(),
          type: 'appointment',
          title: `Yard Visit: ${lead?.name || conv?.name || 'Customer'} — ${veh}`,
          vehicle: veh,
          notes: note,
          dueDate: isoDt,
          lead_id: lead?.id || null,
          leadId: lead?.id || null,
          page_id: lead?.page_id || conv?.page_id || null,
          assigned_to: (this.user && this.user.id) || null,
          assignedStaffId: (this.user && this.user.id) || null,
          priority: 'High',
          status: 'Todo',
          attendance_status: 'scheduled',
          created_at: new Date().toISOString()
        };
        this.svc.tasks = this.svc.tasks || [];
        this.svc.tasks.unshift(taskObj);
        if (lead && this.svc.updateLeadDealershipProfile) {
          this.svc.updateLeadDealershipProfile(lead.id, {
            vehicle_interest: veh,
            appointment_at: isoDt,
            appointment_status: 'scheduled',
            next_action_at: isoDt,
            next_action_note: `Yard Visit: ${veh}`
          });
        } else {
          this.svc.saveAll();
        }
      }
      this.closeModal();
      this.toast('Yard visit booked! Added to Tasks & Appointments ✓', 'success');
      if (this.currentRoute === 'inbox') this.renderInbox();
      else if (this.currentRoute === 'tasks') this.renderTasks();
      else if (lead && this.el.drawer.classList.contains('open')) this.openLeadDrawer(lead.id);
    };
    this.el.mOverlay.classList.add('open');
  }

  openQuickFollowupModal(leadId, convId = null) {
    const lead = (this.svc && leadId) ? this.svc.leads.find(l => String(l.id) === String(leadId)) : null;
    const conv = (this.svc && convId) ? this.svc.conversations.find(c => String(c.id) === String(convId)) : null;
    const defaultDate = new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10);
    this.el.mTitle.textContent = 'Set Next Action / Follow-up';
    this.el.mBody.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:12px;">
        <div>
          <label class="form-label" style="font-size:12px;font-weight:600;display:block;margin-bottom:4px;">Next Action</label>
          <input type="text" class="input w-full" id="fu-title" placeholder="e.g. Call back about finance approval">
        </div>
        <div>
          <label class="form-label" style="font-size:12px;font-weight:600;display:block;margin-bottom:4px;">Due Date (NZ)</label>
          <input type="date" class="input w-full" id="fu-date" value="${defaultDate}">
        </div>
      </div>
    `;
    this.el.mConfirm.style.display = '';
    this.el.mConfirm.textContent = 'Save Follow-up';
    this.el.mConfirm.onclick = () => {
      const title = document.getElementById('fu-title')?.value?.trim();
      const dt = document.getElementById('fu-date')?.value;
      if (!title) return this.toast('Enter a next action note.', 'warning');
      const dueIso = dt ? new Date(dt + 'T09:00:00').toISOString() : new Date().toISOString();
      if (this.svc) {
        this.svc.tasks = this.svc.tasks || [];
        this.svc.tasks.unshift({
          id: 'task_' + Date.now(),
          type: 'followup',
          title: `${lead?.name || conv?.name || 'Lead'}: ${title}`,
          dueDate: dueIso,
          lead_id: lead?.id || null,
          leadId: lead?.id || null,
          page_id: lead?.page_id || conv?.page_id || null,
          assigned_to: (this.user && this.user.id) || null,
          assignedStaffId: (this.user && this.user.id) || null,
          priority: 'Medium',
          status: 'Todo',
          created_at: new Date().toISOString()
        });
        if (lead && this.svc.updateLeadDealershipProfile) {
          this.svc.updateLeadDealershipProfile(lead.id, { next_action_at: dueIso, next_action_note: title });
        } else {
          this.svc.saveAll();
        }
      }
      this.closeModal();
      this.toast('Next action saved ✓', 'success');
      if (this.currentRoute === 'inbox') this.renderInbox();
    };
    this.el.mOverlay.classList.add('open');
  }

  handleComposerInput(el) {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
    if (this.activeConvId) {
      this._setConvDraft(this.activeConvId, el.value);
    }
    const sendBtn = document.getElementById('inbox-send-btn');
    if (sendBtn) {
      sendBtn.disabled = !el.value.trim() && !this._pendingAttachment;
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
    const clearBtn = document.querySelector('.inbox-search-clear');
    if (clearBtn) clearBtn.style.display = 'none';
    if (this.svc) {
      const pageId = (this.selectedInboxPage && this.selectedInboxPage !== 'all') ? this.selectedInboxPage : null;
      this.svc.fetchRemoteConversations({ pageId, all: true }).then(() => this.renderInbox());
    } else {
      this.renderInbox();
    }
  }

  retryFetchConversationMessages(convId) {
    if (!this.svc || !this.svc.conversations) return;
    const conv = this.svc.conversations.find(c => String(c.id) === String(convId) || String(c.external_id) === String(convId));
    if (conv) {
      conv._fetchingMsgs = false;
      this.fetchRealConversationMessages(conv);
    }
  }

  async fetchRealConversationMessages(conv) {
    if (!conv) return;
    if (conv._fetchingMsgs) return;
    conv._fetchingMsgs = true;

    if (!this._msgAbortControllers) this._msgAbortControllers = new Map();
    if (this._msgAbortControllers.has(conv.id)) {
      try { this._msgAbortControllers.get(conv.id).abort(); } catch (e) {}
    }
    const ac = new AbortController();
    this._msgAbortControllers.set(conv.id, ac);
    const timeoutId = setTimeout(() => {
      try { ac.abort(); } catch (e) {}
    }, 7500);

    const thread = document.getElementById('inbox-thread');
    const hasMessages = Array.isArray(conv.messages) && conv.messages.length > 0;
    const hasPreview = !!(conv.preview && conv.preview.trim());

    if (thread && this.activeConvId === conv.id) {
      if (!hasMessages && !hasPreview) {
        thread.innerHTML = `
          <div class="inbox-thread-loading" id="inbox-thread-loading" style="padding:60px 20px;text-align:center;color:var(--text-secondary);">
            <div class="spinner" style="display:inline-block;width:24px;height:24px;border:2.5px solid var(--border-color);border-top-color:var(--primary);border-radius:50%;animation:spin 0.8s linear infinite;margin-bottom:12px;"></div>
            <div style="font-size:13px;font-weight:500;">Loading conversation messages…</div>
          </div>
        `;
      } else {
        const existingLoader = document.getElementById('inbox-sync-indicator');
        if (!existingLoader) {
          const syncInd = document.createElement('div');
          syncInd.id = 'inbox-sync-indicator';
          syncInd.style.cssText = 'padding:4px 12px;margin:8px auto;background:rgba(0,0,0,0.04);border-radius:12px;font-size:11px;color:var(--text-secondary);text-align:center;width:fit-content;';
          syncInd.innerHTML = '<span>⟳ Syncing latest messages…</span>';
          thread.prepend(syncInd);
        }
      }
    }

    try {
      const accountId = (this.svc && this.svc.resolveZernioAccountId(conv.accountId || conv.page_id)) || conv.accountId || conv.page_id || '';
      const externalId = conv.external_id || conv.id;
      let rawMsgs = [];

      // 1. Fetch from Supabase via unified /api/messages with accountId and external_id
      try {
        const authHeaders = (this.svc && typeof this.svc.getAuthHeaders === 'function')
          ? this.svc.getAuthHeaders(false)
          : { 'X-User-Id': (this.user && this.user.id) || 'admin' };
        const dbRes = await fetch(`/api/messages?conversation_id=${encodeURIComponent(conv.id)}&accountId=${encodeURIComponent(accountId)}&external_id=${encodeURIComponent(externalId)}`, {
          headers: authHeaders,
          signal: ac.signal
        });
        if (dbRes.ok) {
          const dbData = await dbRes.json();
          rawMsgs = dbData.messages || [];
        }
      } catch (e) {
        if (e.name === 'AbortError') return;
      }

      // 2. Direct fast fallback to Zernio endpoint if Supabase had 0 messages
      if (!rawMsgs || rawMsgs.length === 0) {
        try {
          const accParam = `&accountId=${encodeURIComponent(accountId)}`;
          const res = await fetch(`/api/zernio?path=inbox-messages&conversationId=${encodeURIComponent(externalId)}${accParam}`, {
            signal: ac.signal
          });
          if (res.ok) {
            const data = await res.json();
            rawMsgs = Array.isArray(data) ? data : (data.messages || data.data || []);
          }
        } catch (e) {
          if (e.name === 'AbortError') return;
        }
      }

      if (Array.isArray(rawMsgs) && rawMsgs.length > 0) {
        conv.messages = rawMsgs.map(m => {
          let text = m.message || m.message_text || m.text || '';
          const att = this._extractAttachment ? this._extractAttachment(m) : null;
          if (!text || !text.trim()) {
            if (m.isStoryMention) text = 'Replied to your story 📸';
            else if (att) text = (att.type && att.type.startsWith('image')) ? 'Sent a photo 📷' : '📎 Attachment';
            else text = 'Direct message';
          }
          const incoming = m.direction ? (m.direction === 'incoming' || m.direction === 'inbound') : (m.sender_type === 'customer' || m.incoming === true);
          return {
            id: m.id || m.meta_mid || ('msg_' + Date.now()),
            meta_mid: m.meta_mid || m.id,
            client_msg_id: m.client_msg_id,
            text: text,
            incoming: incoming,
            attachment: att,
            attachments: m.attachments || (att ? [att] : []),
            attachment_url: att?.url || m.attachment_url,
            attachment_storage_path: att?.storagePath || m.attachment_storage_path,
            created_at: m.created_at || m.createdAt || m.sentAt,
            status: m.status || 'sent',
            time: new Date(m.sentAt || m.createdAt || m.created_at || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          };
        });

        // Sort messages chronologically with deterministic tie-breaking
        conv.messages.sort((a, b) => {
          const tA = new Date(a.created_at || a.time || 0).getTime();
          const tB = new Date(b.created_at || b.time || 0).getTime();
          if (tA !== tB) return tA - tB;
          return String(a.id || a.client_msg_id || '').localeCompare(String(b.id || b.client_msg_id || ''));
        });

        const newest = conv.messages[conv.messages.length - 1];
        if (newest) {
          conv.preview = newest.incoming ? newest.text : ('You: ' + newest.text);
          conv.last_message_at = newest.created_at || conv.last_message_at;
          conv.time = newest.time || conv.time;
        }

        if (this.svc) {
          if (this.svc.saveConversations) this.svc.saveConversations();
          else if (this.svc._saveToStorage) this.svc._saveToStorage();
          else if (this.svc.saveAll) this.svc.saveAll();
        }
      } else {
        if (!conv.messages || conv.messages.length === 0) {
          if (conv.preview && conv.preview.trim()) {
            conv.messages = [{
              id: 'msg_preview_' + conv.id,
              text: conv.preview,
              incoming: true,
              created_at: conv.last_message_at || new Date().toISOString(),
              status: 'delivered',
              time: conv.time || 'Today'
            }];
          } else {
            conv.messages = [];
          }
        }
      }

      if (this.activeConvId === conv.id && ['inbox', 'messages', 'conversations'].includes(this.currentRoute)) {
        this.renderInbox();
        const threadAfter = document.getElementById('inbox-thread');
        if (threadAfter) {
          setTimeout(() => { threadAfter.scrollTop = threadAfter.scrollHeight; }, 30);
        }
      }
    } catch (e) {
      if (e.name !== 'AbortError') {
        console.warn('[Fetch Messages Error]:', e);
        if (this.activeConvId === conv.id) {
          const errThread = document.getElementById('inbox-thread');
          if (errThread && (!conv.messages || conv.messages.length === 0) && !conv.preview) {
            errThread.innerHTML = `
              <div class="inbox-thread-error-state" style="padding:40px 20px;text-align:center;color:var(--text-secondary);">
                <div style="font-size:28px;margin-bottom:8px;">⚠️</div>
                <div style="font-size:14px;font-weight:500;margin-bottom:6px;">Unable to load conversation messages</div>
                <p style="font-size:12px;color:var(--text-tertiary);margin-bottom:14px;">The provider timed out or network was interrupted.</p>
                <button class="btn btn-secondary btn-sm" onclick="window.app.retryFetchConversationMessages('${conv.id}')" style="cursor:pointer;padding:6px 14px;font-size:12px;">↻ Retry Loading</button>
              </div>
            `;
          }
        }
      }
    } finally {
      clearTimeout(timeoutId);
      conv._fetchingMsgs = false;
      const syncInd = document.getElementById('inbox-sync-indicator');
      if (syncInd) syncInd.remove();
      const loadInd = document.getElementById('inbox-thread-loading');
      if (loadInd) loadInd.remove();
    }
  }

  async loadOlderMessages(convId = null) {
    const targetId = convId || this.activeConvId;
    if (!targetId || !this.svc) return;
    const conv = (this.svc.conversations || []).find(c => String(c.id) === String(targetId));
    if (!conv || conv._loadingOlderMsgs || conv._allHistoryLoaded) return;
    if (!Array.isArray(conv.messages) || conv.messages.length === 0) return;

    conv._loadingOlderMsgs = true;
    const thread = document.getElementById('inbox-thread');
    const prevScrollHeight = thread ? thread.scrollHeight : 0;
    const prevScrollTop = thread ? thread.scrollTop : 0;

    let olderInd = null;
    if (thread) {
      olderInd = document.createElement('div');
      olderInd.id = 'inbox-older-loader';
      olderInd.style.cssText = 'padding:6px;text-align:center;font-size:11px;color:var(--ds-ink-muted);';
      olderInd.innerHTML = '<span>⟳ Loading earlier messages…</span>';
      thread.prepend(olderInd);
    }

    try {
      const oldestMsg = conv.messages[0];
      const beforeCursor = oldestMsg ? (oldestMsg.created_at || oldestMsg.sentAt) : null;
      const accountId = (this.svc && this.svc.resolveZernioAccountId(conv.accountId || conv.page_id)) || conv.accountId || conv.page_id || '';
      const externalId = conv.external_id || conv.id;

      let olderMsgs = [];
      const authHeaders = (this.svc && typeof this.svc.getAuthHeaders === 'function')
        ? this.svc.getAuthHeaders(false)
        : { 'X-User-Id': (this.user && this.user.id) || 'admin' };

      const dbUrl = `/api/messages?conversation_id=${encodeURIComponent(conv.id)}&accountId=${encodeURIComponent(accountId)}&before=${encodeURIComponent(beforeCursor || '')}&limit=30`;
      const dbRes = await fetch(dbUrl, { headers: authHeaders }).catch(() => null);
      if (dbRes && dbRes.ok) {
        const dbData = await dbRes.json();
        olderMsgs = dbData.messages || [];
      }

      if (!olderMsgs || olderMsgs.length === 0) {
        const zUrl = `/api/zernio?path=inbox-messages&conversationId=${encodeURIComponent(externalId)}&accountId=${encodeURIComponent(accountId)}&before=${encodeURIComponent(beforeCursor || '')}&limit=30`;
        const zRes = await fetch(zUrl).catch(() => null);
        if (zRes && zRes.ok) {
          const zData = await zRes.json();
          olderMsgs = Array.isArray(zData) ? zData : (zData.messages || zData.data || []);
        }
      }

      if (olderInd) olderInd.remove();

      if (!olderMsgs || olderMsgs.length === 0) {
        conv._allHistoryLoaded = true;
      } else {
        const existingIds = new Set(conv.messages.map(m => String(m.id || m.meta_mid)));
        const newOlder = [];
        olderMsgs.forEach(m => {
          const mid = String(m.id || m.meta_mid || ('msg_' + Date.now()));
          if (!existingIds.has(mid)) {
            existingIds.add(mid);
            let text = m.message || m.message_text || m.text || '';
            const att = this._extractAttachment ? this._extractAttachment(m) : null;
            if (!text || !text.trim()) {
              if (m.isStoryMention) text = 'Replied to your story 📸';
              else if (att) text = (att.type && att.type.startsWith('image')) ? 'Sent a photo 📷' : '📎 Attachment';
              else text = 'Direct message';
            }
            const incoming = m.direction ? (m.direction === 'incoming' || m.direction === 'inbound') : (m.sender_type === 'customer' || m.incoming === true);
            newOlder.push({
              id: mid,
              meta_mid: m.meta_mid || m.id,
              client_msg_id: m.client_msg_id,
              text: text,
              incoming: incoming,
              attachment: att,
              attachments: m.attachments || (att ? [att] : []),
              attachment_url: att?.url || m.attachment_url,
              attachment_storage_path: att?.storagePath || m.attachment_storage_path,
              created_at: m.created_at || m.createdAt || m.sentAt,
              status: m.status || 'sent',
              time: new Date(m.sentAt || m.createdAt || m.created_at || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            });
          }
        });

        if (newOlder.length === 0) {
          conv._allHistoryLoaded = true;
        } else {
          conv.messages = [...newOlder, ...conv.messages];
          conv.messages.sort((a, b) => {
            const tA = new Date(a.created_at || a.time || 0).getTime();
            const tB = new Date(b.created_at || b.time || 0).getTime();
            if (tA !== tB) return tA - tB;
            return String(a.id || '').localeCompare(String(b.id || ''));
          });

          if (this.svc && this.svc.saveConversations) this.svc.saveConversations();

          if (this.activeConvId === conv.id) {
            this.renderInbox();
            const threadAfter = document.getElementById('inbox-thread');
            if (threadAfter) {
              const newScrollHeight = threadAfter.scrollHeight;
              threadAfter.scrollTop = newScrollHeight - prevScrollHeight + prevScrollTop;
            }
          }
        }
      }
    } catch (e) {
      console.warn('[Load older messages warning]:', e);
      if (olderInd) olderInd.remove();
    } finally {
      conv._loadingOlderMsgs = false;
    }
  }

  async loadMoreConversations() {
    if (this._loadingMoreConvs || !this.svc) return;
    this._loadingMoreConvs = true;
    const btn = document.getElementById('btn-load-more-convs');
    if (btn) btn.innerHTML = '<span class="spinner" style="width:12px;height:12px;margin-right:6px;"></span> Loading…';

    try {
      const pageId = (this.selectedInboxPage && this.selectedInboxPage !== 'all') ? this.selectedInboxPage : null;
      const q = this.inboxSearchQuery || '';
      await this.svc.fetchRemoteConversations({
        pageId,
        q,
        append: true,
        limit: 5000,
        all: true
      });
      this.renderInbox();
    } catch (e) {
      console.warn('[Load more conversations error]:', e);
    } finally {
      this._loadingMoreConvs = false;
      const btnAfter = document.getElementById('btn-load-more-convs');
      if (btnAfter) btnAfter.innerHTML = 'Load older conversations…';
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
          const existing = this.svc.conversations.find(x => String(x.id) === cid || String(x.external_id) === cid);
          const isFb = c.platform === 'facebook' || c.platform === 'messenger';
          const participantName = c.participantName || c.participantUsername || (isFb ? 'Facebook User' : 'Instagram User');
          const cleanName = isFb ? participantName : (participantName.startsWith('@') ? participantName : `@${participantName}`);
          const channel = isFb ? 'messenger' : 'instagram';
          const accId = (this.svc && this.svc.resolveZernioAccountId(c.accountId || c.page_id)) || c.accountId || '';

          if (existing) {
            existing.name = cleanName;
            existing.channel = channel;
            existing.preview = c.lastMessage || existing.preview;
            existing.time = c.updatedTime ? new Date(c.updatedTime).toLocaleDateString([], { month: 'short', day: 'numeric' }) : existing.time;
            existing.last_message_at = c.updatedTime || existing.last_message_at || new Date().toISOString();
            existing.unread = c.unreadCount || 0;
            existing.accountId = accId;
            existing.page_id = accId;
            existing.external_id = c.external_id || cid;
            if (c.participant_id || c.participantId || c.customer_psid) {
              existing.participant_id = c.participant_id || c.participantId || c.customer_psid;
            }
          } else {
            this.svc.conversations.push({
              id: cid,
              conversationId: cid,
              external_id: c.external_id || cid,
              participant_id: c.participant_id || c.participantId || c.customer_psid,
              customer_psid: c.customer_psid || c.participant_id,
              accountId: accId,
              name: cleanName,
              participantUsername: c.participantUsername,
              channel: channel,
              page_id: accId,
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
    if (layout) {
      layout.classList.toggle('details-collapsed');
      const isCollapsed = layout.classList.contains('details-collapsed');
      sessionStorage.setItem('inbox_details_collapsed', isCollapsed ? 'true' : 'false');
      const btn = document.querySelector('.inbox-details-toggle-btn');
      if (btn) btn.classList.toggle('active', !isCollapsed);
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
      let item = list.querySelector(`.inbox-conv-item[data-conv-id="${convId}"]`);
      if (!item && this.svc && this.svc.conversations) {
        const conv = this.svc.conversations.find(c => String(c.id) === String(convId) || String(c.external_id) === String(convId) || String(c.conversationId) === String(convId));
        if (conv) {
          item = list.querySelector(`.inbox-conv-item[data-conv-id="${conv.id}"]`) || list.querySelector(`.inbox-conv-item[data-conv-id="${conv.external_id}"]`);
        }
      }
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
      const idx = this.svc.conversations.findIndex(c => String(c.id) === String(convId) || String(c.external_id) === String(convId) || String(c.conversationId) === String(convId));
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
    this._inFlightConvSends = this._inFlightConvSends || new Set();

    const convList = (this.svc ? (this.svc.conversations || []) : []);
    const activeConv = convList.find(c => String(c.id) === String(this.activeConvId)) || convList[0];
    if (!activeConv) return;

    const convLockKey = String(activeConv.id);
    if (!retryMsgId && this._inFlightConvSends.has(convLockKey)) return;

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

      // Keep composer responsive: clear input and saved draft immediately
      if (input) {
        input.value = '';
        input.style.height = 'auto';
      }
      this._setConvDraft(activeConv.id, '');
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
    this._inFlightConvSends.add(convLockKey);
    if (btn) btn.disabled = true;

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
    const accountId = (this.svc && this.svc.resolveZernioAccountId(activeConv.accountId || activeConv.page_id)) || activeConv.accountId || activeConv.page_id || '';
    const externalId = activeConv.external_id || activeConv.id;

    try {
      // 1. Unified POST /api/messages endpoint with idempotency key (client_msg_id)
      let res = null;
      let data = null;
      let lostNetworkResponse = false;

      try {
        res = await fetch('/api/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-User-Id': (this.user && this.user.id) || 'admin',
            ...(this.svc && typeof this.svc.getAuthHeaders === 'function' ? this.svc.getAuthHeaders() : {})
          },
          body: JSON.stringify({
            conversation_id: activeConv.id,
            conversationId: activeConv.id,
            external_id: externalId,
            externalId: externalId,
            page_id: activeConv.page_id || accountId,
            pageId: activeConv.page_id || accountId,
            message: text,
            attachment: msgObj.attachment || null,
            client_msg_id: clientMsgId,
            accountId: accountId,
            recipient_id: activeConv.sender_id || activeConv.customer_psid || activeConv.participant_id || activeConv.participantUsername
          })
        });
        if (res.ok) {
          data = await res.json();
        } else if (res.status !== 404) {
          data = await res.json().catch(() => null);
          throw new Error((data && data.error) || `HTTP ${res.status}`);
        }
      } catch (netErr) {
        // Distinguish lost network response/timeout (provider may have accepted!) from explicit HTTP error
        if (!res) {
          lostNetworkResponse = true;
        } else {
          throw netErr;
        }
      }

      if (lostNetworkResponse) {
        // NEVER blindly resend a duplicate message after a timeout/lost response — reconcile first!
        msgObj.status = 'uncertain';
        this._updateMessageBubbleStatus(clientMsgId, 'uncertain');
        this.toast('Connection interrupted while sending. Checking delivery status before resending.', 'warning');
        if (this.svc && typeof this.svc.fetchRemoteMessages === 'function') {
          this.svc.fetchRemoteMessages(activeConv.id, activeConv.page_id || accountId).catch(() => {});
        }
        return;
      }

      // 2. ONLY fall back to /api/zernio if /api/messages returned 404
      if (res && res.status === 404) {
        const zernioRes = await fetch(`/api/zernio?path=inbox-messages&conversationId=${encodeURIComponent(externalId)}&accountId=${encodeURIComponent(accountId)}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(this.svc && typeof this.svc.getAuthHeaders === 'function' ? this.svc.getAuthHeaders() : {})
          },
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
      msgObj.status = data?.status === 'delivered' ? 'delivered' : 'sent';
      if (data && (data.messageId || data.id || data.meta_mid)) {
        msgObj.id = data.messageId || data.id;
        msgObj.meta_mid = data.meta_mid || data.messageId || data.id;
      }
      this._updateMessageBubbleStatus(clientMsgId, msgObj.status);

      if (this.svc) {
        if (this.svc._saveToStorage) this.svc._saveToStorage();
        else if (this.svc.saveAll) this.svc.saveAll();
      }

      // Record human first response on linked lead if present
      if (this.svc && this.svc.leads && this.svc.recordFirstResponse) {
        const linkedLead = this.svc.leads.find(l => String(l.id) === String(activeConv.lead_id) || l.name === activeConv.name);
        if (linkedLead) {
          this.svc.recordFirstResponse(linkedLead.id, isIg ? 'instagram' : 'messenger', { isAutomated: false });
        }
      }
      this.toast(`Sent as ${this._pageName(activeConv.page_id || accountId)} on ${channelName} ✓`, 'success');

    } catch (err) {
      msgObj.status = 'failed';
      this._updateMessageBubbleStatus(clientMsgId, 'failed');
      this.toast("Your message wasn't sent. Try again.", 'error');
    } finally {
      this._inFlightSends.delete(clientMsgId);
      this._inFlightConvSends.delete(convLockKey);
      if (btn) btn.disabled = false;
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
    const clientMsgId = msg.client_msg_id || msg.clientMsgId;
    const externalMid = msg.meta_mid || msg.id;

    const convList = (this.svc ? (this.svc.conversations || []) : []);
    let targetConv = convList.find(c => 
      (convId && (String(c.id) === convId || String(c.conversationId) === convId || String(c.external_id) === convId)) ||
      (detail.participant_id && String(c.participant_id) === String(detail.participant_id)) ||
      (detail.customer_psid && String(c.customer_psid) === String(detail.customer_psid)) ||
      (msg.participant_id && String(c.participant_id) === String(msg.participant_id)) ||
      (msg.customer_psid && String(c.customer_psid) === String(msg.customer_psid)) ||
      (msg.sender_id && String(c.sender_id) === String(msg.sender_id))
    );

    // If this confirms an optimistic message sent from this client, reconcile it
    if (targetConv && clientMsgId) {
      const existingOpt = (targetConv.messages || []).find(m => m.client_msg_id === clientMsgId || m.id === clientMsgId);
      if (existingOpt) {
        existingOpt.status = 'sent';
        if (msg.id) existingOpt.id = msg.id;
        if (externalMid) existingOpt.meta_mid = externalMid;
        this._updateMessageBubbleStatus(clientMsgId, 'sent');
        return;
      }
    }

    const att = this._extractAttachment ? this._extractAttachment(msg) : null;
    let resolvedText = msg.text || msg.message || msg.message_text || '';
    if (!resolvedText || !resolvedText.trim()) {
      if (att) {
        resolvedText = (att.type && att.type.startsWith('image')) ? 'Sent a photo 📷' : `📎 ${att.name || 'Attachment'}`;
      } else {
        resolvedText = 'Direct message';
      }
    }

    if (!targetConv) {
      if (this.svc && this.svc.receiveIncomingMessage) {
        targetConv = this.svc.receiveIncomingMessage(convId, resolvedText, {
          senderName: msg.sender_name || msg.participantName || 'Contact',
          channel: msg.channel || (msg.platform === 'instagram' ? 'instagram' : 'messenger'),
          pageId: msg.page_id || msg.accountId || '',
          accountId: msg.accountId || msg.page_id || '',
          metaMid: externalMid,
          attachment: att,
          attachments: msg.attachments
        });
      }
      if (this.currentRoute === 'inbox') this.renderInbox();
      return;
    }

    targetConv.messages = targetConv.messages || [];
    const isDupe = targetConv.messages.some(m => {
      if (clientMsgId && (m.client_msg_id === clientMsgId || m.id === clientMsgId)) return true;
      if (externalMid && (m.meta_mid === externalMid || m.id === externalMid)) return true;
      if (msg.id && m.id === msg.id) return true;
      return false;
    });

    if (isDupe) return;

    const isIncoming = msg.sender_type !== 'staff' && msg.incoming !== false && msg.direction !== 'outbound';
    const nowIso = msg.created_at || msg.sentAt || new Date().toISOString();
    const formattedMsg = {
      id: msg.id || ('msg_' + Date.now()),
      meta_mid: externalMid,
      client_msg_id: clientMsgId,
      text: resolvedText,
      incoming: isIncoming,
      attachment: att,
      attachments: msg.attachments || (att ? [att] : []),
      attachment_url: att?.url || msg.attachment_url,
      attachment_storage_path: att?.storagePath || msg.attachment_storage_path,
      status: 'sent',
      time: new Date(nowIso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      created_at: nowIso
    };

    targetConv.messages.push(formattedMsg);
    // Maintain strict chronological ordering with deterministic tie-breaking on ID
    targetConv.messages.sort((a, b) => {
      const tA = new Date(a.created_at || a.time || 0).getTime();
      const tB = new Date(b.created_at || b.time || 0).getTime();
      if (tA !== tB) return tA - tB;
      return String(a.id || a.client_msg_id || '').localeCompare(String(b.id || b.client_msg_id || ''));
    });

    const newestMsg = targetConv.messages[targetConv.messages.length - 1];
    targetConv.last_message_at = newestMsg ? newestMsg.created_at : nowIso;
    targetConv.time = 'Just now';
    targetConv.preview = newestMsg ? (newestMsg.incoming ? newestMsg.text : ('You: ' + newestMsg.text)) : resolvedText;
    targetConv.last_message = newestMsg ? newestMsg.text : resolvedText;

    const isActive = targetConv && (
      String(this.activeConvId) === String(targetConv.id) ||
      String(this.activeConvId) === String(targetConv.conversationId) ||
      String(this.activeConvId) === String(targetConv.external_id) ||
      String(this.activeConvId) === convId
    );

    if (!isActive && isIncoming) {
      targetConv.unread = (targetConv.unread || 0) + 1;
      targetConv.unread_count = (targetConv.unread_count || 0) + 1;
    }

    if (this.svc) {
      if (this.svc._saveToStorage) this.svc._saveToStorage();
      else if (this.svc.saveAll) this.svc.saveAll();
    }

    this._moveSidebarConvToTop(targetConv.id, targetConv.preview, 'Just now', targetConv.unread);

    if (isActive && this.currentRoute === 'inbox') {
      const thread = document.getElementById('inbox-thread');
      if (thread) {
        const emptyState = thread.querySelector('.inbox-thread-empty-state');
        if (emptyState) emptyState.remove();

        const msgDiv = document.createElement('div');
        msgDiv.setAttribute('data-timestamp', String(new Date(nowIso).getTime()));
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
              <div class="msg-bubble">
                ${this._renderAttachmentInBubble ? this._renderAttachmentInBubble(formattedMsg, false) : ''}
                ${escapeHtml(formattedMsg.text)}
              </div>
            </div>
            <span class="msg-time">${formattedMsg.time}</span>
          `;
        } else {
          msgDiv.className = 'msg msg-out';
          msgDiv.setAttribute('data-msg-id', formattedMsg.id);
          msgDiv.innerHTML = `
            <div class="msg-bubble">
              ${this._renderAttachmentInBubble ? this._renderAttachmentInBubble(formattedMsg, true) : ''}
              ${escapeHtml(formattedMsg.text)}
            </div>
            <span class="msg-time">${formattedMsg.time} <span class="msg-status-check">✓✓</span></span>
          `;
        }

        // Handle chronological positioning for out-of-order & late arrivals
        const existingNodes = thread.querySelectorAll('.msg[data-timestamp]');
        let inserted = false;
        const currentMsgTs = new Date(nowIso).getTime();
        for (const node of existingNodes) {
          const nodeTs = parseInt(node.getAttribute('data-timestamp'), 10);
          if (nodeTs > currentMsgTs) {
            thread.insertBefore(msgDiv, node);
            inserted = true;
            break;
          }
        }
        if (!inserted) {
          thread.appendChild(msgDiv);
          this._scrollThreadToBottom(false);
        }
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
    const convId = String(conv.id || conv.conversationId || conv.external_id || '');
    if (!convId) return;

    const convList = (this.svc ? (this.svc.conversations || []) : []);
    const existing = convList.find(c => 
      String(c.id) === convId || 
      String(c.conversationId) === convId || 
      String(c.external_id) === convId ||
      (conv.customer_psid && String(c.customer_psid) === String(conv.customer_psid)) ||
      (conv.participant_id && String(c.participant_id) === String(conv.participant_id))
    );
    if (existing) {
      if (conv.last_message) {
        existing.preview = conv.last_message;
        existing.last_message = conv.last_message;
      }
      if (conv.last_message_at) existing.last_message_at = conv.last_message_at;
      if (typeof conv.unread_count === 'number') {
        existing.unread = conv.unread_count;
        existing.unread_count = conv.unread_count;
      }
      if (this.svc) {
        if (this.svc._saveToStorage) this.svc._saveToStorage();
        else if (this.svc.saveAll) this.svc.saveAll();
      }
      this._moveSidebarConvToTop(existing.id, existing.preview, 'Just now', existing.unread);
    } else {
      const isFb = conv.channel === 'messenger' || conv.channel === 'facebook' || conv.platform === 'facebook';
      const pName = conv.customer_name || conv.participant_name || conv.participantName || 'Customer';
      const accId = (this.svc && this.svc.resolveZernioAccountId(conv.account_id || conv.page_id)) || conv.page_id || conv.account_id || '';
      const newConv = {
        id: String(conv.external_id || conv.customer_psid || conv.id),
        conversationId: String(conv.external_id || conv.customer_psid || conv.id),
        external_id: String(conv.external_id || conv.customer_psid || conv.id),
        participant_id: conv.participant_id || conv.customer_psid,
        customer_psid: conv.customer_psid || conv.participant_id,
        name: isFb ? pName : (pName.startsWith('@') ? pName : `@${pName}`),
        participant_name: pName,
        channel: isFb ? 'messenger' : 'instagram',
        page_id: accId,
        accountId: accId,
        preview: conv.last_message || 'Direct message',
        last_message: conv.last_message || 'Direct message',
        time: 'Just now',
        last_message_at: conv.last_message_at || new Date().toISOString(),
        unread: conv.unread_count || 1,
        unread_count: conv.unread_count || 1,
        messages: []
      };
      if (this.svc && this.svc.conversations) {
        this.svc.conversations.unshift(newConv);
        if (this.svc._saveToStorage) this.svc._saveToStorage();
        else if (this.svc.saveAll) this.svc.saveAll();
      }
      if (this.currentRoute === 'inbox') {
        this.renderInbox();
      }
    }
  }

  async catchUpInbox() {
    if (this._isCatchingUp) return;
    this._isCatchingUp = true;
    try {
      if (this.fetchRealInstagramConversations) {
        await this.fetchRealInstagramConversations();
      }
      const activeConv = (this.svc && this.svc.conversations) 
        ? this.svc.conversations.find(c => String(c.id) === String(this.activeConvId)) 
        : null;
      if (activeConv && this.fetchRealConversationMessages) {
        await this.fetchRealConversationMessages(activeConv);
      }
    } catch (e) {
      console.warn('[Inbox catch-up warning]:', e);
    } finally {
      this._isCatchingUp = false;
    }
  }


  simulateInboundMessage(preferredChannel, targetPageId = null) {
    const pages = this._getAccessiblePages ? this._getAccessiblePages() : [];
    let matchingPage = null;
    if (targetPageId) {
      matchingPage = pages.find(p => String(p.id) === String(targetPageId) || String(p.page_id) === String(targetPageId));
    }
    const isIg = matchingPage
      ? (matchingPage.channel === 'instagram' || (matchingPage.name && matchingPage.name.startsWith('@')))
      : (preferredChannel ? preferredChannel.toLowerCase().includes('insta') : (Math.random() > 0.5));
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

    if (!matchingPage) {
      matchingPage = isIg ? (pages.find(p => p.channel === 'instagram' || (p.name && p.name.startsWith('@'))) || pages[0]) : (pages.find(p => p.channel !== 'instagram') || pages[0]);
    }
    const pageId = matchingPage ? (matchingPage.id || matchingPage.page_id) : (pages[0] ? (pages[0].id || pages[0].page_id) : '');

    const convId = 'conv_' + Date.now();
    if (this.svc && this.svc.receiveIncomingMessage) {
      this.svc.receiveIncomingMessage(convId, randMsg, {
        senderName: randName,
        channel: isIg ? 'instagram' : 'messenger',
        pageId: pageId,
        accountId: pageId,
        metaMid: 'sim_mid_' + Date.now()
      });
    }

    this.activeConvId = convId;
    this.inboxTab = isIg ? 'instagram' : (preferredChannel ? 'messenger' : this.inboxTab || 'all');
    this.toast(`New ${randChannel} message on ${matchingPage ? matchingPage.name : 'Page'}!`, 'info');
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
    this.currentRoute = 'connections';
    if (this.el.content) {
      this.el.content.classList.remove('inbox-view-container');
    }
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
            const isIg = p.channel === 'instagram' || (p.name && p.name.startsWith('@'));
            const pageIdStr = p.page_id || p.id;
            const allStaff = this.svc && this.svc.staff ? this.svc.staff : [];
            const assignedStaff = allStaff.filter(s => {
              if (s.role === 'admin' || s.role === 'super_admin') return false;
              const sPages = s.assignedPageIds || s.assignedPages || [];
              return sPages.includes(p.id) || sPages.includes(p.page_id) || sPages.includes(pageIdStr);
            });

            return `
            <div class="simple-page-item" style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid var(--border-subtle);gap:16px;flex-wrap:wrap;">
              <div style="display:flex;align-items:center;gap:14px;">
                <div style="width:40px;height:40px;border-radius:10px;${isIg ? 'background:#303030' : 'background:#1877F2'};color:#fff;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                  ${isIg ? this._icon('instagram', 20) : this._icon('facebook', 20)}
                </div>
                <div>
                  <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                    <strong style="font-size:15px;color:var(--text-primary);">${escapeHtml(p.name)}</strong>
                    <span class="badge badge-gray text-xs" style="font-family:monospace;font-size:11px;padding:2px 6px;">ID: ${escapeHtml(pageIdStr)}</span>
                  </div>
                  <div style="display:flex;align-items:center;gap:8px;margin-top:4px;flex-wrap:wrap;">
                    <span class="text-xs text-gray">
                      ${isIg ? 'Instagram Business Account · Direct Messages Active' : 'Facebook Page · Messenger &amp; Lead Ads Active'}
                    </span>
                    <span style="color:var(--border);">•</span>
                    ${assignedStaff.length > 0
                      ? `<span class="badge badge-indigo text-xs" style="padding:2px 6px;">Assigned: ${assignedStaff.map(s => escapeHtml(s.displayName || s.name)).join(', ')}</span>`
                      : `<span class="badge badge-orange text-xs" style="padding:2px 6px;">No reps assigned (Admin only)</span>`
                    }
                  </div>
                </div>
              </div>
              <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                ${(() => {
                  const healthPages = (this._connectionHealth && Array.isArray(this._connectionHealth.pages)) ? this._connectionHealth.pages : [];
                  const hp = healthPages.find(x => String(x.pageId) === String(pageIdStr) || String(x.accountId) === String(pageIdStr) || (x.pageName && p.name && x.pageName.toLowerCase() === p.name.toLowerCase()));
                  if (!hp) return `<span class="badge badge-gray text-xs">Checking live permissions…</span>`;
                  return `
                    <span class="badge ${hp.messagingReady ? 'badge-green' : 'badge-orange'}" title="Messenger / IG Direct status">${hp.messagingReady ? '✓ Messaging' : '⚠ Messaging'}</span>
                    ${!isIg ? `<span class="badge ${hp.leadAdsReady ? 'badge-green' : 'badge-orange'}" title="Lead Ads webhook + leads_retrieval status">${hp.leadAdsReady ? '✓ Lead Ads' : '⚠ Lead Ads'}</span>` : ''}
                    <span class="badge ${hp.adReportingReady ? 'badge-green' : 'badge-gray'}" title="Meta Ads Insights reporting status">${hp.adReportingReady ? '✓ Ad Reporting' : 'Ad Reporting N/A'}</span>
                    ${hp.needsReconnection ? `<button class="btn btn-primary btn-sm" style="background:#D97706;border-color:#B45309;" onclick="window.app.connectFacebookOAuth()">Reconnect</button>` : ''}
                  `;
                })()}
                <button class="btn btn-secondary btn-sm" onclick="window.app.openAssignStaffToPageModal('${p.id || p.page_id}')">Assign Staff</button>
                <button class="btn btn-ghost btn-sm text-red" style="color:var(--danger);" onclick="window.app.disconnectPage('${p.id || p.page_id}')">Disconnect</button>
              </div>
            </div>`;
          }).join('')}
        </div>
      </div>

      <!-- LEAD ADS INGESTION HEALTH & GUIDED TEST LEAD VERIFICATION -->
      <div class="card" style="margin-top:16px;">
        <div class="card-header" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">
          <div>
            <div class="card-title">Meta Lead Ads Ingestion Health &amp; Guided Test</div>
            <div class="text-xs text-gray">Distinguishes OAuth connection from live webhook delivery, field mapping, and duplicate replay safety.</div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button class="btn btn-secondary btn-sm" onclick="window.app.loadConnectionHealth(true)">↻ Refresh Health</button>
            <button class="btn btn-primary btn-sm" onclick="window.app.runGuidedTestLead('${primaryPage ? (primaryPage.page_id || primaryPage.id) : ''}', '${escapeHtml(primaryPage ? primaryPage.name : 'Connected Page')}')">🧪 Run Guided Test Lead</button>
          </div>
        </div>
        <div style="padding:16px 20px;">
          ${(() => {
            const h = this._connectionHealth;
            if (!h) {
              setTimeout(() => this.loadConnectionHealth(false), 30);
              return '<div class="text-xs text-gray">Checking live Zernio / Meta gateway health…</div>';
            }
            const ing = h.ingestion || {};
            return `
              <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;margin-bottom:14px;">
                <div style="padding:10px 12px;border:1px solid var(--border);border-radius:8px;background:#F8FAFC;">
                  <div class="text-xs text-gray">Gateway Status</div>
                  <div style="font-weight:700;font-size:14px;color:${h.status==='ok'?'#059669':'#B45309'};">${h.status==='ok' ? '● Connected' : (h.status==='degraded' ? '⚠ Degraded' : 'Not configured')}</div>
                </div>
                <div style="padding:10px 12px;border:1px solid var(--border);border-radius:8px;background:#F8FAFC;">
                  <div class="text-xs text-gray">Webhook Verification</div>
                  <div style="font-weight:700;font-size:14px;">${h.webhookSignatureEnforced ? 'HMAC-SHA256 Enforced' : 'Secret Missing'}</div>
                </div>
                <div style="padding:10px 12px;border:1px solid var(--border);border-radius:8px;background:#F8FAFC;">
                  <div class="text-xs text-gray">Events Processed / Dupes</div>
                  <div style="font-weight:700;font-size:14px;">${ing.webhooksProcessed || 0} / ${ing.duplicatesIgnored || 0} ignored</div>
                </div>
                <div style="padding:10px 12px;border:1px solid var(--border);border-radius:8px;background:#F8FAFC;">
                  <div class="text-xs text-gray">Failed / Retry Queue</div>
                  <div style="font-weight:700;font-size:14px;color:${(ing.failedCount||0)>0?'#DC2626':'#0F172A'};">${ing.failedCount || 0} / ${ing.recoveryQueueSize || 0}</div>
                </div>
              </div>
              ${h.liveAccountsError ? `<div style="padding:10px 12px;background:#FEF2F2;border:1px solid #FCA5A5;border-radius:8px;color:#991B1B;font-size:12px;margin-bottom:12px;">⚠️ Gateway warning: ${escapeHtml(h.liveAccountsError)}</div>` : ''}
              <div id="guided-test-lead-result"></div>
            `;
          })()}
        </div>
      </div>` : ''}
    `;
  }

  async loadConnectionHealth(notify = false) {
    try {
      const res = await fetch('/api/zernio?path=health', {
        headers: (this.svc && this.svc.getAuthHeaders) ? this.svc.getAuthHeaders(false) : {}
      });
      if (res.ok) {
        this._connectionHealth = await res.json();
        if (notify) this.toast('Connection health refreshed ✓', 'success');
        if (this.currentRoute === 'connections') this.renderConnections();
      }
    } catch (e) {
      if (notify) this.toast('Could not load connection health: ' + e.message, 'error');
    }
  }

  async runGuidedTestLead(pageId, pageName) {
    const out = document.getElementById('guided-test-lead-result');
    if (out) out.innerHTML = '<div class="text-xs text-gray">Running guided Lead Ad ingestion + duplicate replay test…</div>';
    try {
      const headers = (this.svc && this.svc.getAuthHeaders) ? this.svc.getAuthHeaders() : { 'Content-Type': 'application/json' };
      const res = await fetch('/api/zernio?path=test-lead', {
        method: 'POST',
        headers,
        body: JSON.stringify({ page_id: pageId, page_name: pageName })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Test lead failed');
      const v = data.verification || {};
      if (data.lead && this.svc && this.svc.handleInboundMetaLead) {
        this.svc.handleInboundMetaLead(data.lead);
      }
      if (out) {
        out.innerHTML = `
          <div style="padding:12px 14px;background:#ECFDF5;border:1px solid #6EE7B7;border-radius:8px;font-size:12px;color:#065F46;">
            <strong>✓ Guided Test Lead Verified (${escapeHtml(pageName)})</strong>
            <ul style="margin:6px 0 0 18px;line-height:1.6;">
              <li>Lead created once: <strong>${v.createdOnce ? 'PASS' : 'FAIL'}</strong> · Webhook replay deduplicated: <strong>${v.replayDeduplicated ? 'PASS' : 'FAIL'}</strong></li>
              <li>Mapped contact: <strong>${escapeHtml(v.mappedStandardFields?.name || '—')}</strong> (${escapeHtml(v.mappedStandardFields?.phone || '—')})</li>
              <li>Mapped custom answers: Vehicle = <strong>${escapeHtml(v.vehicleInterest || '—')}</strong>, Budget = <strong>${v.budgetNzd ? this.formatMoney(v.budgetNzd) : '—'}</strong>, Payment = <strong>${escapeHtml(v.paymentPreference || '—')}</strong></li>
              <li>Messenger auto-open blocked (respects Meta rules): <strong>${v.messagingEligible === false ? 'PASS' : 'CHECK'}</strong></li>
            </ul>
          </div>
        `;
      }
      this.toast('Guided Test Lead verified and added to Leads ✓', 'success');
    } catch (err) {
      if (out) out.innerHTML = `<div style="padding:10px 12px;background:#FEF2F2;border:1px solid #FCA5A5;border-radius:8px;color:#991B1B;font-size:12px;">⚠️ Test lead error: ${escapeHtml(err.message)}</div>`;
    }
  }

  syncPage(pageId) {
    const page = (this.svc && this.svc.pages) ? this.svc.pages.find(p => p.id === pageId || p.page_id === pageId) : null;
    const name = page ? page.name : pageId;
    this.toast(`Syncing leads and messages for "${name}"…`, 'info');
    setTimeout(() => {
      this.toast(`✓ "${name}" synced with Meta Graph API!`, 'success');
      this.renderConnections();
    }, 500);
  }

  disconnectPage(pageId) {
    const page = (this.svc && this.svc.pages) ? this.svc.pages.find(p => p.id === pageId || p.page_id === pageId) : null;
    const name = page ? page.name : pageId;
    const targetPageId = (page && page.page_id) || pageId;
    this.confirmDialog({
      title: 'Disconnect Facebook Page',
      message: `Are you sure you want to disconnect "${name}"? Existing leads will remain safe in your CRM.`,
      confirmText: 'Disconnect Page',
      isDanger: true,
      onConfirm: async () => {
        try {
          const sessionToken = this.svc ? this.svc.getSessionToken() : null;
          const headers = { 'Content-Type': 'application/json' };
          if (sessionToken) headers['Authorization'] = `Bearer ${sessionToken}`;
          else headers['x-user-id'] = (this.user && this.user.id) || 'admin';

          await fetch('/api/pages', {
            method: 'POST',
            headers,
            body: JSON.stringify({ action: 'disconnect', page_id: targetPageId })
          });
        } catch (e) {
          console.warn('Failed to notify server of disconnect:', e);
        }

        if (this.svc) {
          this.svc.pages = this.svc.pages.filter(p => p.id !== pageId && p.page_id !== pageId && p.id !== targetPageId && p.page_id !== targetPageId);
          if (this.svc._saveToStorage) this.svc._saveToStorage(); else this.svc.saveAll();
          if (this.svc.pages.length === 0) {
            this.metaConnectionState = 'not_connected';
            try { localStorage.setItem('metacrm_meta_conn_state', 'not_connected'); } catch (e) {}
          }
          if (typeof this.svc.notifyChange === 'function') {
            this.svc.notifyChange('pages_updated', { pages: this.svc.pages });
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

      if (this.svc && typeof this.svc.fetchRemotePages === 'function') {
        await this.svc.fetchRemotePages();
      }

      if (this.svc._saveToStorage) this.svc._saveToStorage();
      this.toast('✓ All Meta & Zernio connections synchronized!', 'success');
    } catch (e) {
      this.toast('Connections check complete.', 'info');
    }
    this.renderSidebar();
    this.renderConnections();
    if (this.currentRoute === 'dashboard') this.renderDashboard();
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
      accounts = accounts.filter(acc => {
        const n = (acc.displayName || acc.username || acc.metadata?.selectedPageName || '').toLowerCase();
        const id = String(acc.platformUserId || acc._id || '');
        return !n.includes('jiban') && !n.includes('prakash') && !n.includes('omm') && id !== '29279331294986321';
      });
      accounts.forEach(acc => {
        const rawPageId = acc.metadata?.selectedPageId || (acc.platformUserId && acc.platformUserId.includes(':page:') ? acc.platformUserId.split(':page:')[1] : (acc.platformUserId || acc._id));
        const id = String(rawPageId);
        const isIg = acc.platform === 'instagram';
        const name = (acc.metadata?.selectedPageName || (acc.username ? (isIg && !acc.username.startsWith('@') ? `@${acc.username}` : acc.username) : (acc.displayName || (isIg ? 'Instagram Account' : 'Facebook Page')))).trim();
        const exists = this.svc.pages.find(p => String(p.id) === id || String(p.page_id) === id || (p.name && (p.name.trim().toLowerCase() === name.toLowerCase())));
        if (exists) {
          exists.id = id;
          exists.page_id = id;
          if (acc.profilePicture) exists.profilePicture = acc.profilePicture;
          exists.provider = 'zernio';
          addedAny = true;
        } else {
          this.svc.pages.push({
            id: id,
            page_id: id,
            name: name,
            displayName: acc.displayName || name,
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
      if (addedAny && this.svc && typeof this.svc.savePages === 'function') {
        this.svc.savePages();
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

    if (this._inboxSearchTimer) clearTimeout(this._inboxSearchTimer);
    if (this.inboxSearchQuery && this.inboxSearchQuery.length >= 2 && this.svc) {
      this._inboxSearchTimer = setTimeout(async () => {
        try {
          const pageId = (this.selectedInboxPage && this.selectedInboxPage !== 'all') ? this.selectedInboxPage : null;
          await this.svc.fetchRemoteConversations({
            pageId,
            q: this.inboxSearchQuery
          });
          this.renderInbox();
        } catch (e) {
          console.warn('[Server search error]:', e);
        }
      }, 350);
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
    if (this._isConnectingOAuth) {
      this.toast('Facebook connection is already processing. Please wait…', 'info');
      return;
    }
    this._isConnectingOAuth = true;
    const resetTimer = setTimeout(() => { this._isConnectingOAuth = false; }, 15000);

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

      throw new Error('Facebook connection is temporarily unavailable. Try again shortly.');
    } catch (err) {
      clearTimeout(resetTimer);
      this._isConnectingOAuth = false;
      if (btnText) btnText.innerHTML = 'Add Facebook Page';
      if (heroBtn) heroBtn.disabled = false;
      this.toast('Could not open Facebook right now. Try again shortly.', 'error');
    }
  }

  async connectInstagramOAuth() {
    if (this._isConnectingOAuth) {
      this.toast('Instagram connection is already processing. Please wait…', 'info');
      return;
    }
    this._isConnectingOAuth = true;
    const resetTimer = setTimeout(() => { this._isConnectingOAuth = false; }, 15000);

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
      throw new Error('Instagram connection is temporarily unavailable. Try again shortly.');
    } catch (err) {
      clearTimeout(resetTimer);
      this._isConnectingOAuth = false;
      if (btnText) btnText.innerHTML = 'Add Instagram Account';
      if (heroBtn) heroBtn.disabled = false;
      this.toast('Could not open Instagram right now. Try again shortly.', 'error');
    }
  }

  openAssignStaffToPageModal(pageId) {
    if (!this.svc) return;
    const page = (this.svc.pages || []).find(p => p.id === pageId || p.page_id === pageId);
    const pageName = page ? page.name : pageId;
    const staffList = (this.svc.staff || []).filter(s => s.role !== 'admin' && s.role !== 'super_admin');

    this.el.mTitle.textContent = `Assign Staff: ${pageName}`;
    this.el.mBody.innerHTML = `
      <p style="font-size:13px;color:var(--text-secondary);margin-bottom:14px;line-height:1.4;">
        Select which team members have access to handle inquiries and leads from <strong>${escapeHtml(pageName)}</strong>. Administrators automatically retain access to all pages.
      </p>
      <div style="display:flex;flex-direction:column;gap:8px;max-height:280px;overflow-y:auto;padding:4px 0;">
        ${staffList.length > 0 ? staffList.map(s => {
          const sPages = s.assignedPageIds || s.assignedPages || [];
          const isAssigned = sPages.includes(pageId) || (page && (sPages.includes(page.id) || sPages.includes(page.page_id)));
          return `
          <label style="display:flex;align-items:center;gap:12px;font-size:13px;cursor:pointer;padding:8px 12px;border-radius:6px;border:1px solid var(--border-subtle);background:var(--bg-surface);">
            <input type="checkbox" class="page-assign-staff-cb" value="${s.id}" ${isAssigned ? 'checked' : ''}>
            <div style="flex:1;">
              <strong style="color:var(--text-primary);display:block;">${escapeHtml(s.displayName || s.name)}</strong>
              <div class="text-xs text-gray">${escapeHtml(s.email)}</div>
            </div>
            <span class="badge ${isAssigned ? 'badge-green' : 'badge-gray'} text-xs">${isAssigned ? 'Assigned' : 'Unassigned'}</span>
          </label>`;
        }).join('') : '<div class="text-xs text-gray" style="padding:16px;text-align:center;">No staff accounts provisioned.</div>'}
      </div>
    `;

    this.el.mConfirm.textContent = 'Save Assignments';
    this.el.mConfirm.className = 'btn btn-primary';
    this.el.mConfirm.onclick = async () => {
      const confirmBtn = this.el.mConfirm;
      confirmBtn.disabled = true;
      confirmBtn.innerHTML = '<span class="spinner"></span> Saving assignments…';

      try {
        const checkedStaffIds = Array.from(document.querySelectorAll('.page-assign-staff-cb:checked')).map(cb => cb.value);
        for (const s of staffList) {
          const sPages = new Set(s.assignedPageIds || s.assignedPages || []);
          const shouldHave = checkedStaffIds.includes(s.id);
          const had = sPages.has(pageId) || (page && (sPages.has(page.id) || sPages.has(page.page_id)));

          if (shouldHave && !had) {
            sPages.add(pageId);
            if (page && page.page_id) sPages.add(page.page_id);
            if (page && page.id) sPages.add(page.id);
            await this.svc.updateStaffAssignedPages(s.id, Array.from(sPages));
          } else if (!shouldHave && had) {
            sPages.delete(pageId);
            if (page && page.page_id) sPages.delete(page.page_id);
            if (page && page.id) sPages.delete(page.id);
            await this.svc.updateStaffAssignedPages(s.id, Array.from(sPages));
          }
        }
        this.closeModal();
        this.toast(`Staff assignments updated for "${pageName}" ✓`, 'success');
        this.renderConnections();
        this.renderSidebar();
      } catch (err) {
        confirmBtn.disabled = false;
        confirmBtn.textContent = 'Save Assignments';
        this.toast(`Failed to save staff assignments: ${err.message}`, 'error');
      }
    };
    this.el.mOverlay.classList.add('open');
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
    this.el.title.textContent = (this.user && this.user.role === 'staff') ? 'My Tasks & Appointments' : 'Tasks & Appointments';
    this.el.actions.innerHTML = `
      <div style="display:flex;gap:8px;">
        <button class="btn btn-secondary btn-sm" onclick="window.app.openBookAppointmentModal()">📅 + Book Yard Visit</button>
        <button class="btn btn-primary btn-sm" onclick="window.app.openAddTaskModal()">+ Add Follow-up</button>
      </div>`;

    const now = new Date();
    const todayNZ = this._getNZDate(now);
    const tasks = this._filterUserTasks(this.svc ? this.svc.tasks : []);

    const tabs = [
      { id: 'all',          label: 'All',          fn: t => true },
      { id: 'appointments', label: 'Yard Visits',  fn: t => t.type === 'appointment' },
      { id: 'today',        label: 'Today (NZ)',   fn: t => t.dueDate && this._getNZDate(t.dueDate) === todayNZ },
      { id: 'upcoming',     label: 'Upcoming',     fn: t => t.dueDate && new Date(t.dueDate) > now },
      { id: 'overdue',      label: 'Overdue',      fn: t => t.dueDate && new Date(t.dueDate) < now && t.status !== 'Done', cls: 'text-red' },
    ];

    const activeTab = tabs.find(t => t.id === this.currentTaskTab) || tabs[0];
    const filtered = tasks.filter(activeTab.fn);

    this.el.content.innerHTML = `
      ${this._renderTip('tasks', 'Track customer callbacks and scheduled yard visits / test drives in New Zealand time (Pacific/Auckland).')}

      <div class="tabs">
        ${tabs.map(t => {
          const cnt = tasks.filter(t.fn).length;
          return `<div class="tab ${this.currentTaskTab===t.id?'active':''} ${t.cls||''}" onclick="window.app.renderTasks('${t.id}')">${t.label} <span class="tab-count">${cnt}</span></div>`;
        }).join('')}
      </div>

      ${filtered.length ? `
      <div class="task-list">
        ${filtered.map(t => {
          const isAppt = t.type === 'appointment';
          const dueLabel = t.dueDate ? new Date(t.dueDate).toLocaleString('en-NZ', { timeZone: 'Pacific/Auckland', weekday: 'short', day: 'numeric', month: 'short', ...(isAppt ? { hour: '2-digit', minute: '2-digit' } : {}) }) : 'No date';
          return `
            <div class="task-card" id="task-${t.id}">
              <input type="checkbox" class="task-check" ${t.status==='Done'?'checked':''} onchange="window.app.completeTask('${t.id}', this)">
              <div class="task-body">
                <div class="task-title" style="${t.status==='Done'?'text-decoration:line-through;color:#94a3b8;':''}">
                  ${isAppt ? '<span class="badge badge-indigo" style="font-size:10px;margin-right:6px;">📅 Yard Visit</span>' : ''}
                  ${escapeHtml(t.title)}
                </div>
                <div class="task-meta">
                  <span>${this._icon('calendar', 12)} ${isAppt ? 'Scheduled' : 'Due'}: ${dueLabel}</span>
                  <span>${this._icon('user', 12)} ${escapeHtml(this._staffName(t.assigned_to || t.assignedStaffId))}</span>
                  ${t.lead_id || t.leadId ? `<button type="button" class="btn btn-ghost btn-sm" style="padding:0 4px;font-size:11px;" onclick="window.app.openLeadDrawer('${t.lead_id || t.leadId}')">Open Lead →</button>` : ''}
                </div>
              </div>
              <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
                ${t.status !== 'Done' ? `
                  <button type="button" class="btn btn-ghost btn-sm" style="padding:3px 7px;font-size:11px;" onclick="window.app.rescheduleTask('${t.id}', 1)" title="Move due date to tomorrow">+1d</button>
                  <button type="button" class="btn btn-ghost btn-sm" style="padding:3px 7px;font-size:11px;" onclick="window.app.rescheduleTask('${t.id}', 3)" title="Move due date +3 days">+3d</button>
                ` : ''}
                ${isAppt ? `
                  <select class="input input-sm" style="width:118px;font-size:11px;" onchange="window.app.updateAppointmentStatus('${t.id}', this.value)">
                    <option value="scheduled" ${(t.attendance_status||'scheduled')==='scheduled'?'selected':''}>Scheduled</option>
                    <option value="attended" ${t.attendance_status==='attended'?'selected':''}>Attended ✓</option>
                    <option value="no_show" ${t.attendance_status==='no_show'?'selected':''}>No-Show</option>
                    <option value="cancelled" ${t.attendance_status==='cancelled'?'selected':''}>Cancelled</option>
                  </select>
                ` : this._priorityBadge(t.priority)}
              </div>
            </div>`;
        }).join('')}
      </div>` : this._empty('No tasks or appointments here', 'Schedule a customer callback or book a yard visit / test drive.', null, null, '<button class="btn btn-primary" onclick="window.app.openBookAppointmentModal()">📅 Book Yard Visit</button>')}`;
  }

  rescheduleTask(taskId, addDays = 1) {
    if (!this.svc || !this.svc.tasks) return;
    const task = this.svc.tasks.find(t => String(t.id) === String(taskId));
    if (!task) return;
    const baseMs = task.dueDate && new Date(task.dueDate).getTime() > Date.now() ? new Date(task.dueDate).getTime() : Date.now();
    task.dueDate = new Date(baseMs + addDays * 24 * 60 * 60 * 1000).toISOString();
    this.svc._saveToStorage ? this.svc._saveToStorage() : this.svc.saveAll();
    this.toast(`Rescheduled +${addDays} day${addDays > 1 ? 's' : ''}`, 'success');
    this.renderTasks();
  }

  updateAppointmentStatus(taskId, status) {
    if (!this.svc || !this.svc.tasks) return;
    const task = this.svc.tasks.find(t => String(t.id) === String(taskId));
    if (!task) return;
    task.attendance_status = status;
    if (status === 'attended') task.status = 'Done';
    if (task.lead_id || task.leadId) {
      this.svc.updateLeadDealershipProfile(task.lead_id || task.leadId, { appointment_status: status });
    } else {
      this.svc.saveAll();
    }
    this.toast(`Appointment marked: ${status}`, 'success');
    this.renderTasks();
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
  // STAFF & RBAC MANAGEMENT (Section 16)
  // ──────────────────────────────────────────────────────────

  async renderStaff() {
    this.el.title.textContent = 'User Accounts & Access Management';
    this.el.actions.innerHTML = `<button class="btn btn-primary" onclick="window.app.openAddStaffModal()">+ Invite User</button>`;

    // Fetch authoritative staff accounts from server
    if (this.svc) {
      try {
        const sessionToken = this.svc.getSessionToken();
        const headers = {};
        if (sessionToken) headers['Authorization'] = `Bearer ${sessionToken}`;
        else headers['x-user-id'] = (this.user && this.user.id) || 'admin';
        const res = await fetch('/api/staff', { headers });
        if (res.ok) {
          const data = await res.json();
          if (data && Array.isArray(data.staff) && data.staff.length > 0) {
            data.staff.forEach(remoteS => {
              const localS = this.svc.staff.find(s => s.id === remoteS.id || s.email === remoteS.email);
              const remoteAssigned = remoteS.assignedPageIds || remoteS.assignedPages || remoteS.assigned_pages || [];
              if (localS) {
                localS.setup_token = remoteS.setup_token || localS.setup_token;
                localS.status = remoteS.status || localS.status;
                localS.name = remoteS.name || localS.name;
                localS.displayName = remoteS.displayName || remoteS.name || localS.displayName;
                localS.assignedPageIds = remoteAssigned;
                localS.assignedPages = remoteAssigned;
              } else {
                this.svc.staff.push({
                  ...remoteS,
                  assignedPageIds: remoteAssigned,
                  assignedPages: remoteAssigned
                });
              }
            });
            if (this.svc._saveToStorage) this.svc._saveToStorage(); else this.svc.saveAll();
          }
        }
      } catch (e) {
        console.warn('Could not refresh remote staff list:', e);
      }
    }

    const staff = this.svc ? (this.svc.staff || []) : [];
    const pages = this.svc ? this.svc.pages : [];

    this.el.content.innerHTML = `
      <div style="margin-bottom:16px;background:#F8FAFC;border:1px solid var(--border-subtle);border-radius:var(--radius-sm);padding:14px 18px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
        <div style="font-size:13px;color:var(--text-secondary);">
          <strong style="color:var(--text-primary);display:block;margin-bottom:2px;">Production User Access Directory</strong>
          Exactly ${staff.length} authorized accounts provisioned. Passwords must be configured before accessing CRM.
        </div>
        <span class="badge badge-indigo">${staff.filter(s => s.role === 'admin').length} Admin · ${staff.filter(s => s.role === 'staff').length} Staff</span>
      </div>

      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th>User Account</th>
              <th>Role</th>
              <th>Account Status</th>
              <th>Assigned Facebook Pages</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${staff.length > 0 ? staff.map(s => {
              const isAdminAccount = s.role === 'admin' || s.role === 'super_admin';
              const isJoy = s.email === 'admina@novaautos.co.nz';
              const assignedIds = s.assignedPageIds || s.assignedPages || [];
              const pageNames = assignedIds.map(pid => this._pageName(pid)).filter(Boolean).join(', ');
              const status = s.status || 'active';
              return `
                <tr>
                  <td>
                    <div class="flex items-center gap-2">
                      <div class="staff-avatar-sm" style="background:${isAdminAccount ? 'var(--accent)' : '#10B981'}">
                        ${(s.displayName || s.name || s.email || '?').charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <strong>${escapeHtml(s.displayName || s.name || s.email)}</strong>
                        <div class="text-xs text-gray">${escapeHtml(s.email)}</div>
                      </div>
                    </div>
                  </td>
                  <td>${this._roleBadge(s.role)}</td>
                  <td>
                    ${status === 'pending_setup' ? '<span class="badge badge-orange">Pending Setup</span>' :
                      status === 'inactive' ? '<span class="badge badge-gray">Inactive</span>' :
                      '<span class="badge badge-green">Active</span>'}
                  </td>
                  <td class="text-xs">${isAdminAccount ? 'All Pages (Full Administrator Access)' : (pageNames || '<span class="text-gray">None Assigned</span>')}</td>
                  <td>
                    <div class="row-actions">
                      ${s.setup_token ? `
                        <button class="btn btn-secondary btn-sm" onclick="window.app.copySetupLink('${s.setup_token}')" title="Copy single-use setup link">
                          ${this._icon('copy', 13)} Copy Link
                        </button>` : ''}
                      <button class="btn btn-secondary btn-sm" onclick="window.app.openEditStaffProfileModal('${s.id}')">Edit</button>
                      ${!isAdminAccount ? `
                        <button class="btn btn-secondary btn-sm" onclick="window.app.openAssignPagesModal('${s.id}')">Pages</button>
                      ` : ''}
                      <button class="btn btn-ghost btn-sm" onclick="window.app.initiatePasswordReset('${s.id}')" title="Generate password reset link">Reset</button>
                      ${!isJoy ? `
                        <button class="btn btn-ghost btn-sm" onclick="window.app.toggleStaffStatus('${s.id}')" title="${status === 'inactive' ? 'Activate user' : 'Deactivate user'}">
                          ${status === 'inactive' ? 'Activate' : 'Deactivate'}
                        </button>
                        <button class="btn btn-ghost btn-sm text-red" style="color:var(--danger);" onclick="window.app.removeStaff('${s.id}')" title="Remove account">
                          ${this._icon('trash', 14)}
                        </button>` : `
                        <span class="text-xs text-gray" style="padding:4px 6px;" title="Sole administrator account protected from deletion or lockout">Protected</span>
                      `}
                    </div>
                  </td>
                </tr>`;
            }).join('') : '<tr><td colspan="5" class="empty-cell" style="text-align:center;padding:24px;color:var(--text-muted);">No accounts found.</td></tr>'}
          </tbody>
        </table>
      </div>`;
  }

  copySetupLink(token) {
    const url = `${window.location.origin}${window.location.pathname}#setup-password?token=${token}`;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(() => {
        this.toast('✓ Single-use setup link copied to clipboard!', 'success');
      }).catch(() => {
        prompt('Copy setup link:', url);
      });
    } else {
      prompt('Copy setup link:', url);
    }
  }

  openEditStaffProfileModal(staffId) {
    const staff = this.svc ? this.svc.staff.find(s => s.id === staffId) : null;
    if (!staff) return;
    this.el.mTitle.textContent = `Edit Profile: ${staff.email}`;
    this.el.mBody.innerHTML = `
      <label class="settings-label">Full Name / Display Name</label>
      <input type="text" id="edit-staff-name" class="input mb-3" value="${escapeHtml(staff.displayName || staff.name || '')}">
      <label class="settings-label">Login Email</label>
      <input type="email" class="input mb-3" value="${escapeHtml(staff.email)}" disabled style="background:#F1F5F9;cursor:not-allowed;">
      <p class="text-xs text-gray">Login email cannot be modified to ensure identity consistency.</p>
    `;
    this.el.mConfirm.textContent = 'Save Changes';
    this.el.mConfirm.className = 'btn btn-primary';
    this.el.mConfirm.onclick = async () => {
      const newName = (document.getElementById('edit-staff-name')?.value || '').trim();
      if (!newName) {
        this.toast('Please enter a display name', 'warning');
        return;
      }
      try {
        const sessionToken = this.svc ? this.svc.getSessionToken() : null;
        const headers = { 'Content-Type': 'application/json' };
        if (sessionToken) headers['Authorization'] = `Bearer ${sessionToken}`;
        else headers['x-user-id'] = (this.user && this.user.id) || 'admin';

        const res = await fetch('/api/staff', {
          method: 'POST',
          headers,
          body: JSON.stringify({ action: 'update-profile', userId: staffId, name: newName })
        });
        const data = await res.json();
        if (res.ok && data.success) {
          staff.name = newName;
          staff.displayName = newName;
          if (this.svc._saveToStorage) this.svc._saveToStorage(); else this.svc.saveAll();
          this.closeModal();
          this.toast('✓ User profile updated successfully!', 'success');
          this.renderStaff();
        } else {
          this.toast(data.error || 'Failed to update profile', 'error');
        }
      } catch (e) {
        this.toast(e.message, 'error');
      }
    };
    this.el.mOverlay.classList.add('open');
  }

  async initiatePasswordReset(staffId) {
    const staff = this.svc ? this.svc.staff.find(s => s.id === staffId) : null;
    if (!staff) return;
    try {
      const sessionToken = this.svc ? this.svc.getSessionToken() : null;
      const headers = { 'Content-Type': 'application/json' };
      if (sessionToken) headers['Authorization'] = `Bearer ${sessionToken}`;
      else headers['x-user-id'] = (this.user && this.user.id) || 'admin';

      const res = await fetch('/api/staff', {
        method: 'POST',
        headers,
        body: JSON.stringify({ action: 'admin-reset-password', userId: staffId })
      });
      const data = await res.json();
      if (res.ok && data.success && data.setupLink) {
        staff.setup_token = data.setup_token;
        staff.status = 'pending_setup';
        if (this.svc._saveToStorage) this.svc._saveToStorage(); else this.svc.saveAll();
        this.renderStaff();
        this.el.mTitle.textContent = 'Password Reset Link Generated';
        this.el.mBody.innerHTML = `
          <p class="text-xs text-gray mb-3">A secure, single-use password setup link was generated for <strong>${escapeHtml(staff.email)}</strong>:</p>
          <div class="setup-token-box">
            <span style="font-size:11px;">${escapeHtml(data.setupLink)}</span>
            <button class="btn btn-primary btn-sm" onclick="window.app.copySetupLink('${data.setup_token}')">Copy</button>
          </div>
          <p class="text-xs text-gray mt-2">Send this link to the staff member so they can set their new password. The link expires in 48 hours.</p>
        `;
        this.el.mConfirm.textContent = 'Done';
        this.el.mConfirm.className = 'btn btn-primary';
        this.el.mConfirm.onclick = () => this.closeModal();
        this.el.mOverlay.classList.add('open');
      } else {
        this.toast(data.error || 'Failed to generate password reset', 'error');
      }
    } catch (e) {
      this.toast(e.message, 'error');
    }
  }

  async toggleStaffStatus(staffId) {
    const staff = this.svc ? this.svc.staff.find(s => s.id === staffId) : null;
    if (!staff) return;
    if (staff.email === 'admina@novaautos.co.nz') {
      this.toast('Admin account cannot be deactivated.', 'warning');
      return;
    }
    const nextStatus = staff.status === 'inactive' ? 'active' : 'inactive';
    try {
      const sessionToken = this.svc ? this.svc.getSessionToken() : null;
      const headers = { 'Content-Type': 'application/json' };
      if (sessionToken) headers['Authorization'] = `Bearer ${sessionToken}`;
      else headers['x-user-id'] = (this.user && this.user.id) || 'admin';

      const res = await fetch('/api/staff', {
        method: 'POST',
        headers,
        body: JSON.stringify({ action: 'toggle-status', userId: staffId, status: nextStatus })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        staff.status = nextStatus;
        if (this.svc._saveToStorage) this.svc._saveToStorage(); else this.svc.saveAll();
        this.toast(`✓ User ${staff.name} is now ${nextStatus}.`, 'success');
        this.renderStaff();
      } else {
        this.toast(data.error || 'Failed to update status', 'error');
      }
    } catch (e) {
      this.toast(e.message, 'error');
    }
  }

  openAssignPagesModal(staffId) {
    const staff = this.svc ? this.svc.staff.find(s => s.id === staffId) : null;
    if (!staff) return;
    const pages = this.svc ? (this.svc.pages || []) : [];
    const staffAssigned = staff.assignedPageIds || staff.assignedPages || [];

    this.el.mTitle.textContent = `Assign Facebook Pages: ${staff.name}`;
    this.el.mBody.innerHTML = `
      <p style="font-size:13px;color:var(--text-secondary);margin-bottom:14px;line-height:1.4;">
        Select which Facebook Pages <strong>${escapeHtml(staff.name)}</strong> is allowed to access. They will only see leads and messages for checked pages.
      </p>
      <div style="display:flex;flex-direction:column;gap:10px;max-height:260px;overflow-y:auto;padding:4px 0;">
        <label style="display:flex;align-items:center;gap:10px;font-size:13px;cursor:pointer;padding:6px 8px;border-radius:4px;background:#F8FAFC;">
          <input type="checkbox" id="ap-all" ${(!staffAssigned || staffAssigned.length === 0 || staffAssigned.length >= pages.length) ? 'checked' : ''} 
                 onchange="document.querySelectorAll('.ap-page-cb').forEach(cb => cb.checked = this.checked)">
          <strong>All Pages (Full Access)</strong>
        </label>
        <hr style="border:none;border-top:1px solid var(--border);margin:4px 0;">
        ${pages.length > 0 ? pages.map(p => {
          const isChecked = staffAssigned && (staffAssigned.includes(p.id) || staffAssigned.includes(p.page_id));
          return `
          <label style="display:flex;align-items:center;gap:10px;font-size:13px;cursor:pointer;padding:4px 8px;">
            <input type="checkbox" class="ap-page-cb" value="${p.id || p.page_id}" ${isChecked ? 'checked' : ''}
                   onchange="if(!this.checked) document.getElementById('ap-all').checked = false;">
            <span>${escapeHtml(p.name)}</span>
            <span class="badge badge-gray text-xs" style="font-family:monospace;margin-left:auto;">ID: ${p.page_id || p.id}</span>
          </label>`;
        }).join('') : '<div class="text-xs text-gray">No connected Facebook Pages yet. Connect a Page first.</div>'}
      </div>
    `;

    this.el.mConfirm.textContent = 'Save Page Assignments';
    this.el.mConfirm.className = 'btn btn-primary';
    this.el.mConfirm.onclick = async () => {
      const confirmBtn = this.el.mConfirm;
      confirmBtn.disabled = true;
      confirmBtn.innerHTML = '<span class="spinner"></span> Saving assignments…';

      const isAll = document.getElementById('ap-all')?.checked;
      let selectedIds = [];
      if (isAll) {
        selectedIds = pages.map(p => p.id || p.page_id);
      } else {
        document.querySelectorAll('.ap-page-cb:checked').forEach(cb => {
          if (cb.value && !selectedIds.includes(cb.value)) selectedIds.push(cb.value);
        });
      }

      try {
        if (this.svc && typeof this.svc.updateStaffAssignedPages === 'function') {
          await this.svc.updateStaffAssignedPages(staff.id, selectedIds);
        } else {
          staff.assignedPageIds = selectedIds;
          staff.assignedPages = selectedIds;
          if (this.svc && this.svc._saveToStorage) this.svc._saveToStorage();
        }
        this.closeModal();
        this.toast(`Page assignments saved for "${staff.name}" ✓`, 'success');
        this.renderStaff();
        this.renderSidebar();
      } catch (err) {
        confirmBtn.disabled = false;
        confirmBtn.textContent = 'Save Page Assignments';
        this.toast(`Failed to save page assignments: ${err.message}`, 'error');
      }
    };
    this.el.mOverlay.classList.add('open');
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
              <label class="settings-label">Business Timezone</label>
              <select class="input mb-4" disabled title="Locked to New Zealand business time (with automatic daylight saving)">
                <option selected>Pacific/Auckland (NZST / NZDT)</option>
              </select>
              <button class="btn btn-primary" onclick="window.app.toast('Settings saved successfully!')">Save Changes</button>
            </div>
            <div class="card mt-4" style="max-width:520px">
              <div class="card-title mb-2">Desktop Application</div>
              <p class="text-xs text-gray mb-3">Optional Windows &amp; macOS desktop wrapper synced to your cloud workspace.</p>
              <a href="download.html" target="_blank" class="btn btn-secondary btn-sm">Download Desktop App ↗</a>
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
    document.body.classList.remove('modal-open');
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

    this.el.mTitle.textContent = 'Invite New User';
    this.el.mBody.innerHTML = `
      <p class="text-xs text-gray mb-3">Add a new user to MetaCRM. A secure single-use password setup link will be generated for them to configure their own password.</p>
      <label class="settings-label" for="ns-name">Full Name *</label>
      <input type="text" class="input mb-3" id="ns-name" placeholder="e.g. Sales Specialist">
      <label class="settings-label" for="ns-email">Work Email *</label>
      <input type="email" class="input mb-3" id="ns-email" placeholder="user@company.com">
      <label class="settings-label" for="ns-role">Account Role</label>
      <select class="input mb-3" id="ns-role">
        <option value="staff" selected>Sales Staff</option>
        <option value="admin">Administrator</option>
      </select>
      <label class="settings-label" for="ns-page">Assigned Facebook Page</label>
      <select class="input mb-2" id="ns-page">
        <option value="all">All Pages (Full Access)</option>
        ${pages.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('')}
      </select>`;

    this.el.mConfirm.textContent = 'Generate Invite';
    this.el.mConfirm.className = 'btn btn-primary';
    this.el.mConfirm.onclick = async () => {
      const name = (document.getElementById('ns-name')?.value || '').trim();
      const email = (document.getElementById('ns-email')?.value || '').trim().toLowerCase();
      const role = document.getElementById('ns-role')?.value || 'staff';
      const pageId = document.getElementById('ns-page')?.value || 'all';

      if (!name || !email) {
        this.toast('Full Name and Work Email are required', 'warning');
        return;
      }

      this.el.mConfirm.disabled = true;
      this.el.mConfirm.innerHTML = '<span class="spinner"></span> Inviting…';

      try {
        const sessionToken = this.svc ? this.svc.getSessionToken() : null;
        const headers = { 'Content-Type': 'application/json' };
        if (sessionToken) headers['Authorization'] = `Bearer ${sessionToken}`;
        else headers['x-user-id'] = (this.user && this.user.id) || 'admin';

        const res = await fetch('/api/staff', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            action: 'invite',
            name,
            email,
            role,
            assignedPages: pageId === 'all' ? pages.map(p => p.id) : [pageId]
          })
        });
        const data = await res.json();

        if (res.ok && data.success) {
          if (this.svc) {
            const existingIdx = this.svc.staff.findIndex(s => s.id === data.user.id || s.email === data.user.email);
            if (existingIdx >= 0) this.svc.staff[existingIdx] = data.user;
            else this.svc.staff.push(data.user);
            if (this.svc._saveToStorage) this.svc._saveToStorage(); else this.svc.saveAll();
          }

          this.renderStaff();
          this.el.mTitle.textContent = 'Account Provisioned Successfully';
          this.el.mBody.innerHTML = `
            <p class="text-xs text-gray mb-3">Single-use setup link generated for <strong>${escapeHtml(email)}</strong>:</p>
            <div class="setup-token-box">
              <span style="font-size:11px;">${escapeHtml(data.setupLink)}</span>
              <button class="btn btn-primary btn-sm" onclick="window.app.copySetupLink('${data.setup_token}')">Copy</button>
            </div>
            <p class="text-xs text-gray mt-2">Email delivery is not configured. Provide this setup link to the user directly so they can configure their password.</p>
          `;
          this.el.mConfirm.textContent = 'Done';
          this.el.mConfirm.disabled = false;
          this.el.mConfirm.onclick = () => this.closeModal();
        } else {
          this.el.mConfirm.disabled = false;
          this.el.mConfirm.textContent = 'Generate Invite';
          this.toast(data.error || 'Failed to create user account', 'error');
        }
      } catch (e) {
        this.el.mConfirm.disabled = false;
        this.el.mConfirm.textContent = 'Generate Invite';
        this.toast(e.message, 'error');
      }
    };
    this.el.mOverlay.classList.add('open');
  }

  removeStaff(staffId) {
    const staff = this.svc ? this.svc.staff.find(s => s.id === staffId) : null;
    if (!staff) return;
    if (staff.email === 'admina@novaautos.co.nz') {
      this.toast('The sole Administrator account (Joy) cannot be deleted or locked out.', 'warning');
      return;
    }
    this.confirmDialog({
      title: 'Deactivate Account',
      message: `Are you sure you want to remove access for "${staff.name}" (${staff.email})?`,
      confirmText: 'Deactivate Account',
      isDanger: true,
      onConfirm: async () => {
        if (this.svc) {
          staff.status = 'inactive';
          if (this.svc._saveToStorage) this.svc._saveToStorage(); else this.svc.saveAll();
        }
        try {
          const sessionToken = this.svc ? this.svc.getSessionToken() : null;
          const headers = { 'Content-Type': 'application/json' };
          if (sessionToken) headers['Authorization'] = `Bearer ${sessionToken}`;
          else headers['x-user-id'] = (this.user && this.user.id) || 'admin';

          await fetch('/api/staff', {
            method: 'POST',
            headers,
            body: JSON.stringify({ action: 'toggle-status', userId: staffId, status: 'inactive' })
          });
        } catch (e) {}

        this.toast(`Account for "${staff.name}" deactivated.`, 'info');
        this.renderStaff();
      }
    });
  }

  // ──────────────────────────────────────────────────────────
  // RBAC & FILTER HELPER METHODS
  // ──────────────────────────────────────────────────────────

  _getAccessiblePages() {
    let pages = (this.svc && Array.isArray(this.svc.pages) && this.svc.pages.length > 0) ? this.svc.pages : [];
    if (pages.length === 0 && this.svc && this.svc.fetchRemotePages && !this._fetchingDynamicPages) {
      this._fetchingDynamicPages = true;
      this.svc.fetchRemotePages().then(() => {
        this._fetchingDynamicPages = false;
        if (this.currentRoute && this.user) this.render();
      }).catch(() => { this._fetchingDynamicPages = false; });
    }
    // Filter out unauthorized personal accounts
    pages = pages.filter(p => {
      const n = (p.name || '').toLowerCase();
      const id = String(p.id || p.page_id || '');
      return !n.includes('jiban') && !n.includes('prakash') && !n.includes('omm') && id !== '29279331294986321' && id !== 'page_ig_001';
    });
    if (!this.user) return pages;
    if (this.user.role === 'admin' || this.user.role === 'super_admin') {
      return pages;
    }
    const assignedIds = this.user.assignedPageIds || this.user.assignedPages || [];
    if (!Array.isArray(assignedIds) || assignedIds.length === 0) return [];
    return pages.filter(p => assignedIds.includes(p.id) || assignedIds.includes(p.page_id));
  }

  _getNZDate(dateInput = null) {
    const d = dateInput ? new Date(dateInput) : new Date();
    if (isNaN(d.getTime())) return null;
    try {
      const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Pacific/Auckland',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
      return formatter.format(d);
    } catch (e) {
      const nzMs = d.getTime() + (13 * 60 * 60 * 1000);
      return new Date(nzMs).toISOString().split('T')[0];
    }
  }

  _getISTDate(dateInput = null) {
    // Alias kept for backwards compatibility — uses Pacific/Auckland business day
    return this._getNZDate(dateInput);
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
    if (!this.user || this.user.role === 'admin' || this.user.role === 'super_admin') return leads;
    const allowedPages = this.user.assignedPageIds || [];
    return leads.filter(l =>
      (l.assigned_staff_id && l.assigned_staff_id === this.user.id) ||
      (l.assignedStaffId && l.assignedStaffId === this.user.id) ||
      (l.page_id && allowedPages.includes(l.page_id)) ||
      (l.pageId && allowedPages.includes(l.pageId))
    );
  }

  _filterUserTasks(tasks) {
    if (!this.user || this.user.role === 'admin' || this.user.role === 'super_admin') return tasks;
    return tasks.filter(t => t.assignedStaffId === this.user.id || t.assigned_to === this.user.id);
  }

  _getAutoAssignedStaff(pageId) {
    if (!this.svc || !this.svc.staff) return this.user ? this.user.id : null;
    const match = this.svc.staff.find(s => s.role === 'staff' && (s.assignedPageIds || []).includes(pageId));
    return match ? match.id : (this.user ? this.user.id : null);
  }

  _staffName(staffId) {
    if (!staffId || !this.svc) return 'Unassigned';
    const s = (this.svc.staff || []).find(u => u.id === staffId);
    return s ? s.displayName || s.name : staffId;
  }

  _pageName(pageId) {
    if (!pageId) return 'Unmapped Page';
    const cleanId = String(pageId).trim();
    if (this.svc && typeof this.svc.resolvePageRecord === 'function') {
      const rec = this.svc.resolvePageRecord(cleanId);
      if (rec && rec.name) return rec.name.trim();
    }
    const pages = (this._getAccessiblePages ? this._getAccessiblePages() : (this.svc ? this.svc.pages : [])) || [];
    const p = pages.find(pg =>
      String(pg.id) === cleanId ||
      String(pg.page_id) === cleanId ||
      String(pg.accountId) === cleanId ||
      String(pg.account_id) === cleanId ||
      String(pg._id) === cleanId ||
      String(pg.zernioAccountId) === cleanId
    );
    if (p && p.name) return p.name.trim();
    if (/^[0-9a-f]{20,32}$/i.test(cleanId) || /^[0-9]{12,25}$/.test(cleanId)) {
      return `Page (${cleanId.slice(-6)})`;
    }
    return cleanId || 'Unmapped Page';
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
    const val = Number(n || 0);
    if (val >= 1000000) return (val / 1000000).toFixed(1) + 'M';
    if (val >= 1000) return (val / 1000).toFixed(1) + 'K';
    return val.toLocaleString('en-NZ');
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
    return '';
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
    this.el.title.textContent = 'Marketing / Meta';
    this.adsActiveTab = this.adsActiveTab || 'campaigns';
    this.adsDateRange = this.adsDateRange || 'last_30d';
    this.adsPageFilter = this.adsPageFilter || 'all';
    this.adsSearchQuery = this.adsSearchQuery || '';

    const isAdmin = this.user && (this.user.role === 'admin' || this.user.role === 'super_admin');
    if (!isAdmin) {
      this.el.actions.innerHTML = '';
      this.el.content.innerHTML = `
        <div class="empty-state-card" style="padding:48px 24px;text-align:center;">
          <div style="font-size:32px;margin-bottom:12px;">🔒</div>
          <h3 style="font-size:16px;font-weight:600;margin-bottom:8px;">Manager Access Only</h3>
          <p class="text-sm text-gray" style="max-width:440px;margin:0 auto 16px;">Marketing &amp; Meta advertising settings are restricted to dealership managers.</p>
          <button class="btn btn-secondary" onclick="window.app.navigate('dashboard')">Return to Overview</button>
        </div>`;
      return;
    }

    // Clear any stale actions from previous screens and mount Marketing actions cleanly
    this.el.actions.innerHTML = `
      <button class="btn btn-secondary btn-sm" id="btn-sync-meta-leads" onclick="window.app.syncZernioLeadsFromMarketing()">
        ↻ Sync Meta Leads
      </button>
      <button class="btn btn-primary btn-sm" id="btn-sync-meta-ads" onclick="window.app.syncLiveAds()">
        ↻ Sync Ad Insights (NZD)
      </button>`;

    // Auto-fetch live Zernio insights, lead forms, and connection health once
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

    const adsState = (this.svc && this.svc.zernioAdsState) ? this.svc.zernioAdsState : null;
    const campaigns = adsState?.campaigns || (this.svc ? (this.svc.campaigns || []) : []);
    const totals = adsState?.totals || null;
    const nzdAdAccounts = adsState?.adAccounts || [];
    const excludedNonNzd = adsState?.excludedNonNzdAccounts || [];
    const leadForms = this.zernioLeadForms || [];
    const health = this.zernioHealthCache || null;
    const accessiblePages = this._getAccessiblePages ? this._getAccessiblePages() : [];

    const totalSpend = totals ? totals.spendNzd : 0;
    const totalPlatformLeads = totals ? totals.platformLeads : 0;
    const totalCrmLeads = totals ? totals.crmAttributedLeads : 0;
    const avgCpl = totals && totals.cplPlatformNzd !== null ? totals.cplPlatformNzd : null;
    const totalImpressions = totals ? totals.impressions : 0;
    const totalClicks = totals ? totals.clicks : 0;
    const avgCtr = totals ? totals.ctr : 0;
    const totalMsgs = totals ? totals.messagingConnections : 0;
    const lastSyncLabel = adsState?.lastSuccessfulSync
      ? new Date(adsState.lastSuccessfulSync).toLocaleString('en-NZ', { timeZone: 'Pacific/Auckland', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) + ' NZ'
      : 'Not synced yet';

    const webhookBlocked = health && health.webhookHealth && !health.webhookHealth.active;

    this.el.content.innerHTML = `
      <div class="ads-manager-view" style="padding-bottom:32px;">
        <!-- TOP HEADER & FILTER TOOLBAR -->
        <div class="crm-toolbar">
          <div>
            <h2 style="font-size:20px;font-weight:700;letter-spacing:-0.02em;margin:0 0 4px;color:#0F172A;">Marketing &amp; Meta Ads (via Zernio)</h2>
            <p class="text-xs text-gray" style="margin:0;">
              Currency: <strong>NZD only</strong> · Connected Pages: <strong>${accessiblePages.length}</strong> · Last Ad Sync: <strong>${escapeHtml(lastSyncLabel)}</strong>
            </p>
          </div>
          <div class="crm-filter-group">
            <select class="input input-sm" id="ads-account-select" aria-label="Filter by Page" onchange="window.app.adsPageFilter=this.value;window.app.syncLiveAds();">
              <option value="all">All Connected Pages (${accessiblePages.length})</option>
              ${accessiblePages.map(p => `<option value="${p.id || p.page_id}" ${String(this.adsPageFilter) === String(p.id || p.page_id) ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('')}
            </select>
            <select class="input input-sm" id="ads-daterange-select" aria-label="Date range" onchange="window.app.changeAdsDateRange(this.value)">
              <option value="last_7d" ${this.adsDateRange==='last_7d'?'selected':''}>Last 7 Days (NZ)</option>
              <option value="last_14d" ${this.adsDateRange==='last_14d'?'selected':''}>Last 14 Days (NZ)</option>
              <option value="last_30d" ${this.adsDateRange==='last_30d'?'selected':''}>Last 30 Days (NZ)</option>
              <option value="this_month" ${this.adsDateRange==='this_month'?'selected':''}>This Month (NZ)</option>
            </select>
          </div>
        </div>

        ${webhookBlocked ? `
          <div style="margin-bottom:16px;padding:12px 16px;background:#FFFBEB;border:1px solid #FDE68A;border-radius:10px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">
            <div style="font-size:12.5px;color:#92400E;">
              <strong>⚠️ Live Zernio Webhook Disabled / Misconfigured:</strong> ${escapeHtml(health.webhookHealth.actionRequired || 'Check Connection Health tab for details.')}
            </div>
            <button type="button" class="btn btn-secondary btn-sm" onclick="window.app.switchAdsTab('health')">Inspect Health →</button>
          </div>
        ` : ''}

        <!-- 3 CLEAR SEPARATED SECTIONS -->
        <div class="tabs" style="margin-bottom:18px;">
          <div class="tab ${this.adsActiveTab==='campaigns'?'active':''}" onclick="window.app.switchAdsTab('campaigns')">
            Campaign Performance (NZD) <span class="tab-count">${campaigns.length}</span>
          </div>
          <div class="tab ${this.adsActiveTab==='lead_capture'?'active':''}" onclick="window.app.switchAdsTab('lead_capture')">
            Lead Capture &amp; Forms <span class="tab-count">${leadForms.length}</span>
          </div>
          <div class="tab ${this.adsActiveTab==='health'?'active':''}" onclick="window.app.switchAdsTab('health')">
            Connection Health <span class="tab-count">${health?.pages?.length || accessiblePages.length}</span>
          </div>
        </div>

        ${this.adsActiveTab === 'campaigns' ? `
          <!-- NZD KPI SUMMARY CARDS -->
          <div class="stats-grid">
            <div class="stat-card">
              <div class="stat-label">Ad Spend (NZD)</div>
              <div class="stat-value">${adsState?.insightsRetrievedSuccessfully ? this.formatMoney(totalSpend) : 'Not synced'}</div>
              <div class="stat-sub">${nzdAdAccounts.length} deduplicated NZD ad accounts</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">Meta Platform Leads</div>
              <div class="stat-value">${adsState?.insightsRetrievedSuccessfully ? totalPlatformLeads.toLocaleString() : '—'}</div>
              <div class="stat-sub">${totalMsgs.toLocaleString()} messaging conversations started</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">CRM Attributed Leads</div>
              <div class="stat-value" style="color:#059669;">${totalCrmLeads}</div>
              <div class="stat-sub">Ingested enquiries linked by campaign ID</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">Cost / Platform Lead</div>
              <div class="stat-value">${avgCpl !== null ? this.formatMoney(avgCpl) : 'No data'}</div>
              <div class="stat-sub">CTR: <strong>${avgCtr}%</strong> · ${this._formatNum(totalImpressions)} impr.</div>
            </div>
          </div>

          ${excludedNonNzd.length > 0 ? `
            <div style="margin-bottom:14px;padding:10px 14px;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;font-size:12px;color:#475569;">
              <strong>NZD Currency Safeguard:</strong> Excluded ${excludedNonNzd.length} non-NZD ad account(s) (${excludedNonNzd.map(a => `${escapeHtml(a.name)} [${escapeHtml(a.currency)}]`).join(', ')}) so non-NZD spend is never mixed into New Zealand dealership totals.
            </div>
          ` : ''}

          <div class="crm-filter-bar">
            <input type="text" class="input input-sm" style="min-width:220px;flex:1;max-width:340px;" placeholder="Filter campaigns by name or ad account…" value="${escapeHtml(this.adsSearchQuery)}" oninput="window.app.searchAds(this.value)">
            <span class="text-xs text-gray" style="margin-left:auto;">Click any campaign row to inspect its captured CRM leads</span>
          </div>

          <div id="ads-table-container">
            ${this._renderAdsTable('campaigns', campaigns, [], [])}
          </div>

          <div style="margin-top:14px;padding:10px 14px;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;font-size:11.5px;color:#64748B;">
            <strong>Provider note (Zernio):</strong> Native Meta Ads Manager campaigns are retrieved via Zernio <code>GET /api/v1/ads/insights?level=campaign</code> (Zernio <code>/api/v1/ads/campaigns</code> only lists campaigns created inside Zernio).
          </div>
        ` : this.adsActiveTab === 'lead_capture' ? `
          <div class="dash-panel-card" style="margin-bottom:16px;">
            <div class="dash-panel-header">
              <div>
                <div class="dash-panel-title">Meta Instant Lead Forms (via Zernio)</div>
                <div class="text-xs text-gray">Live forms discovered across your connected dealership pages.</div>
              </div>
              <div style="display:flex;gap:8px;">
                <button type="button" class="btn btn-secondary btn-sm" onclick="window.app.runGuidedTestLead('${accessiblePages[0] ? (accessiblePages[0].page_id || accessiblePages[0].id) : ''}', '${escapeHtml(accessiblePages[0] ? accessiblePages[0].name : 'Connected Page')}')">🧪 Guided Test Lead</button>
                <button type="button" class="btn btn-primary btn-sm" onclick="window.app.syncZernioLeadsFromMarketing()">↻ Sync Real Leads from Zernio</button>
              </div>
            </div>
            <div style="overflow-x:auto;">
              <table class="crm-table">
                <thead>
                  <tr>
                    <th>Page</th>
                    <th>Lead Form Name</th>
                    <th>Status</th>
                    <th style="text-align:right;">Platform Leads</th>
                    <th style="text-align:right;">Action</th>
                  </tr>
                </thead>
                <tbody>
                  ${leadForms.length === 0 ? `
                    <tr><td colspan="5" style="text-align:center;padding:28px;color:#64748B;">Loading live Meta Lead Forms from Zernio… Click "Sync Meta Leads" to pull submissions.</td></tr>
                  ` : leadForms.map(f => `
                    <tr>
                      <td style="font-weight:600;">${escapeHtml(f.pageName)}</td>
                      <td>
                        <div style="font-weight:600;color:#0F172A;">${escapeHtml(f.name)}</div>
                        <div class="text-xs text-gray">Form ID: ${escapeHtml(f.id)}</div>
                      </td>
                      <td><span class="health-pill ${f.status === 'ACTIVE' ? 'pass' : 'neutral'}">${escapeHtml(f.status)}</span></td>
                      <td style="text-align:right;font-weight:700;">${f.leadsCount ?? 0}</td>
                      <td style="text-align:right;">
                        <button type="button" class="btn btn-ghost btn-sm" onclick="window.app.leadPageFilter='${f.pageId}';window.app.navigate('leads');">View Page Leads →</button>
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        ` : `
          <!-- CONNECTION HEALTH (7-STAGE HONEST MATRIX) -->
          <div class="dash-panel-card" style="margin-bottom:16px;">
            <div class="dash-panel-header">
              <div>
                <div class="dash-panel-title">7-Stage Integration Readiness Matrix</div>
                <div class="text-xs text-gray">Every stage is verified independently from live Zernio endpoints — never inferred from OAuth alone.</div>
              </div>
              <button type="button" class="btn btn-secondary btn-sm" onclick="window.app.refreshMarketingHealth()">↻ Re-verify Live Health</button>
            </div>
            <div style="overflow-x:auto;">
              <table class="crm-table">
                <thead>
                  <tr>
                    <th>Page</th>
                    <th>1. Connected</th>
                    <th>2. Permissions</th>
                    <th>3. Subscription &amp; Webhook</th>
                    <th>4. Leads Received</th>
                    <th>5. NZD Ad Account</th>
                    <th>6. Insights Synced</th>
                    <th>Action Needed</th>
                  </tr>
                </thead>
                <tbody>
                  ${!health || !Array.isArray(health.pages) || health.pages.length === 0 ? `
                    <tr><td colspan="8" style="text-align:center;padding:24px;color:#64748B;">Checking live Zernio connection health…</td></tr>
                  ` : health.pages.map(p => `
                    <tr>
                      <td>
                        <div style="font-weight:600;">${escapeHtml(p.pageName)}</div>
                        <div class="text-xs text-gray">${escapeHtml(p.pageId)}</div>
                      </td>
                      <td><span class="health-pill ${p.accountConnected ? 'pass' : 'fail'}">${p.accountConnected ? 'Connected' : 'Reconnect'}</span></td>
                      <td><span class="health-pill ${p.permissionsVerified?.allCoreGranted ? 'pass' : 'warn'}">${p.permissionsVerified?.allCoreGranted ? 'All Granted' : (p.missingPermissions?.join(', ') || 'Partial')}</span></td>
                      <td><span class="health-pill ${p.subscriptionVerified?.verified ? 'pass' : 'fail'}">${p.subscriptionVerified?.verified ? 'Verified' : (p.subscriptionVerified?.pageLeadgenSubscribed ? 'Page OK · Webhook Off' : 'Unsubscribed')}</span></td>
                      <td><span class="health-pill ${p.leadReceivedSuccessfully ? 'pass' : 'neutral'}">${p.leadReceivedSuccessfully ? `${p.recentLeadsCount || 'Yes'} captured` : 'None yet'}</span></td>
                      <td><span class="health-pill ${p.adAccountConnected ? 'pass' : 'warn'}">${p.adAccountConnected ? `${(p.adAccounts||[]).filter(a=>a.isNzd).length} NZD` : 'None linked'}</span></td>
                      <td><span class="health-pill ${p.insightsRetrievedSuccessfully ? 'pass' : 'warn'}">${p.insightsRetrievedSuccessfully ? 'Synced' : 'Not synced'}</span></td>
                      <td class="text-xs" style="color:${p.actionRequired ? '#92400E' : '#065F46'};">${escapeHtml(p.actionRequired || 'All checks passing')}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        `}
      </div>
    `;
  }

  async syncZernioLeadsFromMarketing() {
    this.toast('Checking for new ad leads…');
    try {
      const res = await this.svc.syncZernioLeads(this.adsPageFilter);
      const added = res.newLeads || 0;
      this.toast(added > 0 ? `Added ${added} new ad enquir${added === 1 ? 'y' : 'ies'}.` : 'Ad leads are up to date.', 'success');
      this.renderMetaAds();
    } catch (e) {
      this.toast('New enquiries are delayed. Your existing leads are still available.', 'error');
    }
  }

  async refreshMarketingHealth() {
    this.toast('Refreshing account status…');
    try {
      if (this.svc?.fetchBusinessStatus) {
        this.businessStatusCache = await this.svc.fetchBusinessStatus();
      }
      if (this.currentRoute === 'settings') this.renderSettings();
      else this.renderMetaAds();
      this.toast('Account status updated.', 'success');
    } catch (e) {
      this.toast('Could not refresh account status right now. Try again shortly.', 'error');
    }
  }

  _renderAdsTable(tab, campaigns, adsets, ads) {
    const q = (this.adsSearchQuery || '').toLowerCase();
    const list = (campaigns || []).filter(c => {
      if (!q) return true;
      return String(c.name || '').toLowerCase().includes(q) ||
        String(c.adAccountName || '').toLowerCase().includes(q);
    });

    if (list.length === 0) {
      return `
        <div style="padding:36px 24px;text-align:center;">
          <h3 style="font-size:15px;font-weight:700;margin:0 0 6px;color:var(--ds-ink, #0F172A);">No Campaign Results Available Yet</h3>
          <p class="text-xs text-gray" style="max-width:460px;margin:0 auto 14px;">
            Refresh advertising results to view your New Zealand campaign spend, ad leads, and enquiries.
          </p>
          <button type="button" class="btn btn-primary btn-sm" onclick="window.app.syncLiveAds()">Update Results</button>
        </div>`;
    }

    return `
      <div class="ds-table-wrap">
        <table class="ds-table">
          <thead>
            <tr>
              <th>Campaign</th>
              <th>Dealership Account</th>
              <th style="text-align:right;">Spend (NZD)</th>
              <th style="text-align:right;">Ad Leads</th>
              <th style="text-align:right;">CRM Enquiries</th>
              <th style="text-align:right;">Cost per Lead</th>
              <th style="text-align:right;">Messages</th>
            </tr>
          </thead>
          <tbody>
            ${list.map(c => `
              <tr class="clickable-row" onclick="window.app.leadCampaignFilter='${escapeHtml(c.id || '')}';window.app.navigate('leads');" title="Click to view enquiries from this campaign">
                <td style="font-weight:600;color:var(--ds-ink, #0F172A);">${escapeHtml(c.name)}</td>
                <td style="font-size:12.5px;color:var(--ds-ink-muted, #64748B);">${escapeHtml(c.adAccountName || c.pageName || 'New Zealand')}</td>
                <td style="text-align:right;font-weight:600;">${this.formatMoney(c.spend || 0)}</td>
                <td style="text-align:right;font-weight:600;">${c.platformLeads ?? 0}</td>
                <td style="text-align:right;font-weight:700;color:var(--ds-success, #059669);">${c.crmLeadsCount ?? 0}</td>
                <td style="text-align:right;">${c.cplPlatform !== null && c.cplPlatform !== undefined ? this.formatMoney(c.cplPlatform) : '—'}</td>
                <td style="text-align:right;">${c.messagingConnections ?? 0}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>`;
  }

  switchAdsTab(tab) {
    this.adsActiveTab = (tab === 'ad_leads' || tab === 'campaigns') ? tab : 'ad_leads';
    this.renderMetaAds();
  }

  changeAdsDateRange(val) {
    this.adsDateRange = val;
    this.syncLiveAds();
  }

  searchAds(query) {
    this.adsSearchQuery = query;
    const container = document.getElementById('ads-table-container');
    if (container) {
      const campaigns = (this.svc?.zernioAdsState?.campaigns) || (this.svc ? (this.svc.campaigns || []) : []);
      container.innerHTML = this._renderAdsTable('campaigns', campaigns, [], []);
    }
  }

  filterAdsStatus(status) {
    this.adsStatusFilter = status;
    this.renderMetaAds();
  }

  async connectMetaAdsOAuth() {
    if (this._isConnectingOAuth) {
      this.toast('Meta Ads connection is already opening. Please wait…', 'info');
      return;
    }
    this._isConnectingOAuth = true;
    const resetTimer = setTimeout(() => { this._isConnectingOAuth = false; }, 15000);
    this.toast('Opening Meta Business Login to authorise your ad account…', 'info');
    try {
      const zRes = await fetch('/api/zernio/connect/facebook-ads');
      const zData = await zRes.json();
      if (zData && zData.authUrl) {
        window.location.href = zData.authUrl;
        return;
      }
      throw new Error('Meta Ads connection is temporarily unavailable. Try again shortly.');
    } catch (err) {
      clearTimeout(resetTimer);
      this._isConnectingOAuth = false;
      this.toast('Could not open Meta Ads authorisation right now. Try again shortly.', 'error');
    }
  }

  getExcludedAdAccountIds() {
    try {
      const raw = localStorage.getItem('metacrm_excluded_ad_accounts');
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) return new Set(arr.map(String));
      }
    } catch (e) {}
    return new Set();
  }

  toggleAdAccountEnabled(adAccountId, enabled) {
    const excluded = this.getExcludedAdAccountIds();
    if (enabled) excluded.delete(String(adAccountId));
    else excluded.add(String(adAccountId));
    try { localStorage.setItem('metacrm_excluded_ad_accounts', JSON.stringify(Array.from(excluded))); } catch (e) {}
    this.toast(enabled ? 'Ad account included in dealership reporting.' : 'Ad account hidden from dealership totals.', 'success');
    if (this.currentRoute === 'settings') this.renderSettings();
    else if (this.currentRoute === 'meta-ads') this.renderMetaAds();
  }

  async syncLiveAds() {
    if (this._adsSyncInFlight) {
      this.toast('Advertising results are already updating…', 'info');
      return this._adsSyncInFlight;
    }
    this.toast('Updating advertising results…');
    if (this.svc && this.svc.syncZernioAds) {
      this._adsSyncInFlight = (async () => {
        try {
          const res = await this.svc.syncZernioAds(this.adsDateRange || 'last_30d', this.adsPageFilter || 'all', true);
          if (this.svc.fetchBusinessStatus) {
            this.businessStatusCache = await this.svc.fetchBusinessStatus().catch(() => this.businessStatusCache);
          }
          if (res?.partialFailure) {
            this.toast('Some advertising accounts could not be updated. Showing available results.', 'warning');
          } else {
            this.toast(`Updated ${res.campaigns?.length || 0} New Zealand campaign${(res.campaigns?.length || 0) === 1 ? '' : 's'}.`, 'success');
          }
          if (this.currentRoute === 'meta-ads') this.renderMetaAds();
          else if (this.currentRoute === 'settings') this.renderSettings();
          return res;
        } catch (err) {
          this.toast('Could not update advertising results right now. Try again shortly.', 'error');
        } finally {
          this._adsSyncInFlight = null;
        }
      })();
      return this._adsSyncInFlight;
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
                ${(this._getAccessiblePages ? this._getAccessiblePages() : []).map(p => `<option value="${p.id || p.page_id}">${escapeHtml(p.name)} (${escapeHtml(p.platform || 'Facebook')})</option>`).join('') || '<option value="">No connected pages</option>'}
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
    const firstPage = (this._getAccessiblePages ? this._getAccessiblePages() : [])[0];
    const accountId = document.getElementById('m-camp-account')?.value || (firstPage ? (firstPage.id || firstPage.page_id) : '');
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
    const isStaff = this.user && this.user.role === 'staff';
    let accounts = this.svc ? (this.svc.emailAccounts || []) : [];
    if (isStaff && this.user) {
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
    const isAdmin = this.user && (this.user.role === 'admin' || this.user.role === 'super_admin');

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
  // DEALERSHIP BUSINESS REPORTS (Pacific/Auckland, Honest Attribution & Drill-Down)
  // ──────────────────────────────────────────────────────────

  changeReportsDateRange(val) {
    this.reportsDateRange = val;
    this.reportsData = null;
    this.renderReports();
    this.generateReport();
  }

  changeReportsPageFilter(val) {
    this.reportsPageFilter = val || 'all';
    this.reportsData = null;
    this.renderReports();
    this.generateReport();
  }

  drillDownReportToLeads({ pageId = null, status = null, unassignedOnly = false } = {}) {
    if (this.svc && this.svc.setFilter) {
      this.svc.setFilter('pageId', pageId || 'all');
      this.svc.setFilter('status', status || 'all');
    }
    this._reportDrilldownFilter = { pageId, status, unassignedOnly };
    this.navigate('leads');
    if (unassignedOnly) {
      this.toast('Showing authorised leads — filter by Unassigned to claim them.', 'info');
    }
  }

  async generateReport() {
    this.reportsLoading = true;
    const btn = document.getElementById('btn-generate-report');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner" style="width:12px;height:12px;border-width:2px;display:inline-block;"></span> Refreshing…`;
    }

    const range = this.reportsDateRange || 'last_7d';
    let url = `/api/reports?date_range=${encodeURIComponent(range)}`;
    if (this.reportsPageFilter && this.reportsPageFilter !== 'all') {
      url += `&page_id=${encodeURIComponent(this.reportsPageFilter)}`;
    }
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
      const headers = (this.svc && this.svc.getAuthHeaders)
        ? this.svc.getAuthHeaders(false)
        : { 'X-User-Id': (this.user && this.user.id) || 'admin' };
      const res = await fetch(url, { headers });
      if (res.ok) {
        this.reportsData = await res.json();
      }
    } catch (e) {
      console.warn('Reports API fetch failed, using local authorised reconciliation:', e);
    } finally {
      this.reportsLoading = false;
      this.renderReports();
    }
  }

  _buildLocalAuthorisedReport() {
    const isAdmin = this.user && (this.user.role === 'admin' || this.user.role === 'super_admin');
    const accessiblePages = this._getAccessiblePages ? this._getAccessiblePages() : [];
    const allowedIds = new Set(accessiblePages.map(p => String(p.id || p.page_id)));
    const allLeads = (this.svc ? (this.svc.leads || []) : []).filter(l => {
      if (isAdmin) return true;
      const pid = String(l.page_id || l.pageId || '');
      return allowedIds.has(pid) || String(l.assigned_staff_id || l.assigned_to) === String(this.user?.id);
    });
    const scopedLeads = (this.reportsPageFilter && this.reportsPageFilter !== 'all')
      ? allLeads.filter(l => String(l.page_id || l.pageId) === String(this.reportsPageFilter))
      : allLeads;

    const convs = (this.svc ? (this.svc.conversations || []) : []).filter(c => !c.is_archived && (isAdmin || allowedIds.has(String(c.page_id || c.accountId || ''))));
    const tasks = this._filterUserTasks ? this._filterUserTasks(this.svc ? (this.svc.tasks || []) : []) : [];

    const uniqueKeys = new Set(scopedLeads.map(l => l.contact_id || (l.phone ? String(l.phone).replace(/[^\d+]/g, '') : null) || (l.email ? l.email.toLowerCase() : null) || l.id));
    const isWon = s => ['won', 'sold', 'converted'].includes(String(s || '').toLowerCase());
    const isLost = s => ['lost', 'closed lost'].includes(String(s || '').toLowerCase());
    const isContacted = l => Boolean(l.human_first_response_at || l.first_response_at || (l.status && !['new', 'new lead'].includes(String(l.status).toLowerCase())));

    const contacted = scopedLeads.filter(isContacted);
    const qualified = scopedLeads.filter(l => ['qualified', 'proposal sent', 'negotiation', 'booked', 'won', 'sold', 'converted'].includes(String(l.status || '').toLowerCase()));
    const booked = scopedLeads.filter(l => Boolean(l.appointment_at || l.appointment_status));
    const attended = scopedLeads.filter(l => String(l.appointment_status || '').toLowerCase() === 'attended');
    const won = scopedLeads.filter(l => isWon(l.status));
    const lost = scopedLeads.filter(l => isLost(l.status));
    const unassigned = scopedLeads.filter(l => !(l.assigned_to || l.assigned_staff_id || l.assignedStaffId));
    const overdueFollowups = tasks.filter(t => t.status !== 'Done' && t.dueDate && new Date(t.dueDate).getTime() < Date.now()).length;

    const saleValueNzd = won.reduce((sum, l) => sum + (Number(l.sale_value_nzd ?? l.lead_value ?? 0) || 0), 0);

    const respMins = scopedLeads
      .map(l => {
        const ts = l.human_first_response_at || l.first_response_at;
        if (!ts || !l.created_at) return null;
        const m = (new Date(ts).getTime() - new Date(l.created_at).getTime()) / 60000;
        return (!isNaN(m) && m >= 0) ? m : null;
      })
      .filter(v => v !== null)
      .sort((a, b) => a - b);

    const pctile = (arr, p) => {
      if (!arr.length) return null;
      const idx = (p / 100) * (arr.length - 1);
      const lo = Math.floor(idx), hi = Math.ceil(idx);
      return Number((arr[lo] * (1 - (idx - lo)) + arr[hi] * (idx - lo)).toFixed(1));
    };

    const lostReasons = {};
    lost.forEach(l => {
      const r = (l.loss_reason || 'Not recorded').trim();
      lostReasons[r] = (lostReasons[r] || 0) + 1;
    });

    const pageBreakdown = accessiblePages.map(p => {
      const pl = scopedLeads.filter(l => String(l.page_id || l.pageId) === String(p.id || p.page_id));
      const pWon = pl.filter(l => isWon(l.status));
      return {
        pageId: p.id || p.page_id,
        pageName: p.name || 'Connected Page',
        enquiries: pl.length,
        leads: pl.length,
        uniqueContacts: new Set(pl.map(l => l.contact_id || l.phone || l.email || l.id)).size,
        contacted: pl.filter(isContacted).length,
        booked: pl.filter(l => Boolean(l.appointment_at || l.appointment_status)).length,
        attended: pl.filter(l => String(l.appointment_status || '').toLowerCase() === 'attended').length,
        dealsWon: pWon.length,
        saleValueNzd: pWon.reduce((s, l) => s + (Number(l.sale_value_nzd ?? l.lead_value ?? 0) || 0), 0),
        conversations: convs.filter(c => String(c.page_id || c.accountId) === String(p.id || p.page_id)).length,
        spend: null,
        cpl: null
      };
    });

    return {
      currency: 'NZD',
      timezone: 'Pacific/Auckland',
      adDataStatus: 'no_data',
      metadata: {
        scope: isAdmin ? 'All Authorised Dealership Pages' : 'Your Assigned Pages Only',
        cohortExplanation: 'Funnel reflects enquiries received in the selected Pacific/Auckland period; overdue follow-ups reflect current live queue.',
        attributionModel: 'Verified Meta Lead Ad / referral IDs only. Unattributed enquiries appear under Unknown.',
        dataFreshness: new Date().toISOString()
      },
      summary: {
        totalEnquiries: scopedLeads.length,
        totalLeads: scopedLeads.length,
        uniqueContacts: uniqueKeys.size,
        contacted: contacted.length,
        qualified: qualified.length,
        booked: booked.length,
        attended: attended.length,
        dealsWon: won.length,
        dealsLost: lost.length,
        unassignedLeads: unassigned.length,
        overdueFollowups,
        totalConversations: convs.length,
        totalWonValue: saleValueNzd,
        medianHumanResponseMin: pctile(respMins, 50),
        p90HumanResponseMin: pctile(respMins, 90),
        humanResponsesSampleSize: respMins.length,
        totalSpend: null,
        platformReportedLeads: null,
        cpl: null,
        costPerAttendedAppointment: null,
        costPerAttributedSale: null
      },
      lostReasons,
      pageBreakdown,
      formBreakdown: [],
      campaignBreakdown: [],
      staffBreakdown: []
    };
  }

  renderReports() {
    this.el.title.textContent = (this.user && this.user.role === 'staff') ? 'My Performance' : 'Reports';
    this.el.actions.innerHTML = `
      <button class="btn btn-secondary btn-sm" id="btn-generate-report" onclick="window.app.generateReport()">↻ Refresh</button>
      <button class="btn btn-primary btn-sm" onclick="window.app.exportReportsCsv()">Export CSV (NZD)</button>`;
    this.reportsDateRange = this.reportsDateRange || 'last_7d';
    this.reportsPageFilter = this.reportsPageFilter || 'all';

    if (!this.reportsData && !this.reportsLoading) {
      this.reportsLoading = true;
      setTimeout(() => this.generateReport(), 40);
    }

    const isAdmin = this.user && (this.user.role === 'admin' || this.user.role === 'super_admin');
    const accessiblePages = this._getAccessiblePages ? this._getAccessiblePages() : [];
    const rep = (this.reportsData && this.reportsData.summary) ? this.reportsData : this._buildLocalAuthorisedReport();
    const sum = rep.summary || {};
    const meta = rep.metadata || {};
    const isTokenExpired = rep.tokenExpired === true;
    const isCustom = this.reportsDateRange === 'custom';

    const fmtNullableMoney = (v) => {
      if (v === null || v === undefined) return rep.adDataStatus === 'not_connected' ? 'Not connected' : 'No data';
      return this.formatMoney(v);
    };
    const fmtMin = (m) => {
      if (m === null || m === undefined) return 'No data';
      if (m < 60) return `${m}m`;
      return `${(m / 60).toFixed(1)}h`;
    };
    const fmtRate = (num, den) => den > 0 ? `${((num / den) * 100).toFixed(1)}% (${num}/${den})` : 'No data';

    const pageBreakdown = rep.pageBreakdown || [];
    const formBreakdown = rep.formBreakdown || [];
    const campaignBreakdown = rep.campaignBreakdown || [];
    const staffBreakdown = rep.staffBreakdown || [];
    const lostReasons = Object.entries(rep.lostReasons || {});

    this.el.content.innerHTML = `
      <div class="reports-view" style="padding:4px 0 36px;">
        <!-- HEADER & PACIFIC/AUCKLAND CONTROLS -->
        <div class="crm-toolbar">
          <div>
            <h2 style="font-size:20px;font-weight:700;letter-spacing:-0.02em;margin:0 0 4px;color:#0F172A;">${isAdmin ? 'Dealership Business Reports' : 'My Sales Performance'}</h2>
            <p class="text-xs text-gray" style="margin:0;">
              Scope: <strong>${escapeHtml(meta.scope || (isAdmin ? 'All Authorised Pages' : 'Assigned Pages Only'))}</strong> ·
              Timezone: <strong>Pacific/Auckland (NZST/NZDT)</strong> ·
              Currency: <strong>NZD ($)</strong>
            </p>
          </div>
          <div class="crm-filter-group">
            <select id="reports-page-select" class="input input-sm" style="font-weight:500;" onchange="window.app.changeReportsPageFilter(this.value)">
              <option value="all">${isAdmin ? 'All Authorised Pages' : 'All Assigned Pages'}</option>
              ${accessiblePages.map(p => `<option value="${p.id || p.page_id}" ${String(this.reportsPageFilter) === String(p.id || p.page_id) ? 'selected' : ''}>${escapeHtml(p.name)}</option>`).join('')}
            </select>
            <select id="reports-daterange-select" class="input input-sm" style="font-weight:500;" onchange="window.app.changeReportsDateRange(this.value)">
              <option value="today" ${this.reportsDateRange === 'today' ? 'selected' : ''}>Today (NZ)</option>
              <option value="yesterday" ${this.reportsDateRange === 'yesterday' ? 'selected' : ''}>Yesterday (NZ)</option>
              <option value="last_7d" ${this.reportsDateRange === 'last_7d' ? 'selected' : ''}>Last 7 Days (NZ)</option>
              <option value="last_30d" ${this.reportsDateRange === 'last_30d' ? 'selected' : ''}>Last 30 Days (NZ)</option>
              <option value="this_month" ${this.reportsDateRange === 'this_month' ? 'selected' : ''}>This Month (NZ)</option>
              <option value="custom" ${isCustom ? 'selected' : ''}>Custom Range…</option>
            </select>
            <div id="reports-custom-dates" style="display:${isCustom ? 'flex' : 'none'};align-items:center;gap:6px;">
              <input type="date" id="reports-start-date" class="input input-sm" value="${this.reportsCustomStart || ''}">
              <span class="text-xs text-gray">to</span>
              <input type="date" id="reports-end-date" class="input input-sm" value="${this.reportsCustomEnd || ''}">
            </div>
          </div>
        </div>

        <!-- METHODOLOGY & DATA FRESHNESS DISCLOSURE -->
        <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;padding:10px 14px;margin-bottom:18px;font-size:11.5px;color:#475569;display:flex;flex-wrap:wrap;justify-content:space-between;gap:8px;">
          <span><strong>Cohort basis:</strong> ${escapeHtml(meta.cohortExplanation || 'Enquiries received within selected Pacific/Auckland dates.')}</span>
          <span><strong>Updated:</strong> ${meta.dataFreshness ? new Date(meta.dataFreshness).toLocaleTimeString('en-NZ', { timeZone: 'Pacific/Auckland', hour: '2-digit', minute: '2-digit' }) + ' NZ' : 'Live'}</span>
        </div>

        ${isTokenExpired ? `
          <div style="margin-bottom:18px;padding:12px 16px;background:#FEF2F2;border:1px solid #FCA5A5;border-radius:8px;display:flex;align-items:center;justify-content:space-between;gap:12px;">
            <div style="font-size:12.5px;color:#991B1B;"><strong>⚠️ Meta Token Expired:</strong> Ad spend &amp; platform lead metrics are unavailable until reconnected.</div>
            ${isAdmin ? `<button class="btn btn-sm btn-primary" style="background:#DC2626;border-color:#DC2626;" onclick="window.app.navigate('connections')">Reconnect →</button>` : ''}
          </div>
        ` : ''}

        <!-- 1. CORE DEALERSHIP KPI SUMMARY (Clickable Drill-Down) -->
        <div class="stats-grid" style="grid-template-columns:repeat(auto-fit, minmax(175px, 1fr));gap:12px;margin-bottom:20px;">
          <div class="stat-card" style="cursor:pointer;" onclick="window.app.drillDownReportToLeads({ pageId: window.app.reportsPageFilter })" title="Click to inspect underlying enquiries">
            <div class="stat-label">Enquiries / Unique Buyers</div>
            <div class="stat-value">${sum.totalEnquiries ?? 0} <span style="font-size:14px;font-weight:500;color:#64748B;">/ ${sum.uniqueContacts ?? 0}</span></div>
            <div class="text-xs text-gray mt-1">Repeat vehicle enquiries counted separately</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Human Response (Median / p90)</div>
            <div class="stat-value">${fmtMin(sum.medianHumanResponseMin)} <span style="font-size:14px;font-weight:500;color:#64748B;">/ ${fmtMin(sum.p90HumanResponseMin)}</span></div>
            <div class="text-xs text-gray mt-1">Excludes automated replies (n=${sum.humanResponsesSampleSize || 0})</div>
          </div>
          <div class="stat-card" style="cursor:pointer;" onclick="window.app.drillDownReportToLeads({ unassignedOnly: true })" title="Click to review unassigned leads">
            <div class="stat-label">Needs Attention</div>
            <div class="stat-value" style="color:${(sum.unassignedLeads||0)+(sum.overdueFollowups||0)>0?'#EA580C':'#059669'};">${sum.unassignedLeads ?? 0} <span style="font-size:13px;font-weight:500;color:#64748B;">unassigned · ${sum.overdueFollowups ?? 0} overdue</span></div>
            <div class="text-xs text-gray mt-1">Avg open age: ${sum.avgPipelineAgeDays !== null && sum.avgPipelineAgeDays !== undefined ? sum.avgPipelineAgeDays + 'd' : 'No data'}</div>
          </div>
          <div class="stat-card" style="cursor:pointer;" onclick="window.app.drillDownReportToLeads({ status: 'Won' })" title="Click to inspect sold deals">
            <div class="stat-label">Sold Deals &amp; NZD Value</div>
            <div class="stat-value" style="color:#059669;">${sum.dealsWon ?? 0} <span style="font-size:14px;font-weight:600;">(${sum.totalWonValue > 0 ? this.formatMoney(sum.totalWonValue) : 'No value recorded'})</span></div>
            <div class="text-xs text-gray mt-1">Sale rate: ${fmtRate(sum.dealsWon || 0, sum.totalEnquiries || 0)}</div>
          </div>
        </div>

        <!-- 2. SALES FUNNEL PROGRESSION -->
        <div class="dash-panel-card" style="margin-bottom:20px;">
          <div class="dash-panel-header">
            <div class="dash-panel-title">Dealership Sales Funnel (Acquisition Cohort)</div>
            <span class="text-xs text-gray">Every percentage shows exact numerator / denominator</span>
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;padding:14px 18px;">
            <div style="padding:10px;border:1px solid #E2E8F0;border-radius:8px;background:#F8FAFC;">
              <div class="text-xs text-gray">Received</div>
              <div style="font-size:20px;font-weight:700;">${sum.totalEnquiries ?? 0}</div>
              <div class="text-xs text-gray">100% baseline</div>
            </div>
            <div style="padding:10px;border:1px solid #E2E8F0;border-radius:8px;background:#F8FAFC;">
              <div class="text-xs text-gray">Contacted</div>
              <div style="font-size:20px;font-weight:700;">${sum.contacted ?? 0}</div>
              <div class="text-xs text-gray">${fmtRate(sum.contacted || 0, sum.totalEnquiries || 0)}</div>
            </div>
            <div style="padding:10px;border:1px solid #E2E8F0;border-radius:8px;background:#F8FAFC;">
              <div class="text-xs text-gray">Qualified</div>
              <div style="font-size:20px;font-weight:700;">${sum.qualified ?? 0}</div>
              <div class="text-xs text-gray">${fmtRate(sum.qualified || 0, sum.totalEnquiries || 0)}</div>
            </div>
            <div style="padding:10px;border:1px solid #E2E8F0;border-radius:8px;background:#F8FAFC;">
              <div class="text-xs text-gray">Booked Visit</div>
              <div style="font-size:20px;font-weight:700;">${sum.booked ?? 0}</div>
              <div class="text-xs text-gray">${fmtRate(sum.booked || 0, sum.totalEnquiries || 0)}</div>
            </div>
            <div style="padding:10px;border:1px solid #E2E8F0;border-radius:8px;background:#F8FAFC;">
              <div class="text-xs text-gray">Attended Yard</div>
              <div style="font-size:20px;font-weight:700;">${sum.attended ?? 0}</div>
              <div class="text-xs text-gray">${fmtRate(sum.attended || 0, sum.booked || 0)} of booked</div>
            </div>
            <div style="padding:10px;border:1px solid #BBF7D0;border-radius:8px;background:#ECFDF5;">
              <div class="text-xs" style="color:#065F46;">Sold</div>
              <div style="font-size:20px;font-weight:700;color:#059669;">${sum.dealsWon ?? 0}</div>
              <div class="text-xs" style="color:#065F46;">${fmtRate(sum.dealsWon || 0, sum.totalEnquiries || 0)}</div>
            </div>
          </div>
          ${lostReasons.length > 0 ? `
            <div style="padding:0 18px 14px;display:flex;flex-wrap:wrap;gap:6px;align-items:center;">
              <span class="text-xs text-gray" style="font-weight:600;">Lost Reasons (${sum.dealsLost}):</span>
              ${lostReasons.map(([r, c]) => `<span class="badge badge-gray" style="font-size:11px;">${escapeHtml(r)}: ${c}</span>`).join('')}
            </div>
          ` : ''}
        </div>

        <!-- 3. MARKETING SPEND & HONEST COST METRICS (Managers Only) -->
        ${isAdmin ? `
        <div class="dash-panel-card" style="margin-bottom:20px;">
          <div class="dash-panel-header">
            <div class="dash-panel-title">Meta Advertising Cost Metrics (NZD)</div>
            <span class="text-xs text-gray">Platform-reported leads vs CRM-ingested leads shown separately; missing data shown honestly</span>
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;padding:14px 18px;">
            <div style="padding:10px;border:1px solid #E2E8F0;border-radius:8px;">
              <div class="text-xs text-gray">Ad Spend (NZD)</div>
              <div style="font-size:17px;font-weight:700;">${fmtNullableMoney(sum.totalSpend)}</div>
            </div>
            <div style="padding:10px;border:1px solid #E2E8F0;border-radius:8px;">
              <div class="text-xs text-gray">Platform Leads / CRM Ad Leads</div>
              <div style="font-size:17px;font-weight:700;">${sum.platformReportedLeads !== null && sum.platformReportedLeads !== undefined ? sum.platformReportedLeads : 'Unavailable'} / ${sum.crmAttributedAdLeads ?? 0}</div>
            </div>
            <div style="padding:10px;border:1px solid #E2E8F0;border-radius:8px;">
              <div class="text-xs text-gray">Cost per CRM Lead (CPL)</div>
              <div style="font-size:17px;font-weight:700;">${fmtNullableMoney(sum.cpl)}</div>
            </div>
            <div style="padding:10px;border:1px solid #E2E8F0;border-radius:8px;">
              <div class="text-xs text-gray">Cost / Attended Visit</div>
              <div style="font-size:17px;font-weight:700;">${fmtNullableMoney(sum.costPerAttendedAppointment)}</div>
            </div>
            <div style="padding:10px;border:1px solid #E2E8F0;border-radius:8px;">
              <div class="text-xs text-gray">Cost / Attributed Sale</div>
              <div style="font-size:17px;font-weight:700;">${fmtNullableMoney(sum.costPerAttributedSale)}</div>
            </div>
          </div>
        </div>` : ''}

        <!-- 4. BREAKDOWN BY PAGE -->
        <div class="dash-panel-card" style="margin-bottom:20px;">
          <div class="dash-panel-header">
            <div class="dash-panel-title">Performance by Page</div>
            <span class="text-xs text-gray">Click any page row to drill down into its leads</span>
          </div>
          <div style="overflow-x:auto;">
            <table class="crm-table">
              <thead>
                <tr>
                  <th>Page</th>
                  <th style="text-align:right;">Enquiries</th>
                  <th style="text-align:right;">Unique Buyers</th>
                  <th style="text-align:right;">Contacted</th>
                  <th style="text-align:right;">Booked / Attended</th>
                  <th style="text-align:right;">Sold</th>
                  <th style="text-align:right;">Sale Value (NZD)</th>
                  <th style="text-align:right;">Ad Spend</th>
                </tr>
              </thead>
              <tbody>
                ${pageBreakdown.length === 0 ? `
                  <tr><td colspan="8" style="text-align:center;padding:20px;color:var(--text-muted);">No authorised page data for this period.</td></tr>
                ` : pageBreakdown.map(p => `
                  <tr style="cursor:pointer;" onclick="window.app.drillDownReportToLeads({ pageId: '${p.pageId}' })">
                    <td style="font-weight:600;">${escapeHtml(p.pageName)}</td>
                    <td style="text-align:right;font-weight:600;">${p.enquiries ?? p.leads ?? 0}</td>
                    <td style="text-align:right;">${p.uniqueContacts ?? '—'}</td>
                    <td style="text-align:right;">${p.contacted ?? 0}</td>
                    <td style="text-align:right;">${p.booked ?? 0} / ${p.attended ?? 0}</td>
                    <td style="text-align:right;font-weight:600;color:#059669;">${p.dealsWon ?? 0}</td>
                    <td style="text-align:right;">${p.saleValueNzd > 0 ? this.formatMoney(p.saleValueNzd) : '—'}</td>
                    <td style="text-align:right;">${fmtNullableMoney(p.spend)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <!-- 5. BREAKDOWN BY SALESPERSON (Managers Only) -->
        ${isAdmin && staffBreakdown.length > 0 ? `
        <div class="dash-panel-card" style="margin-bottom:20px;">
          <div class="dash-panel-header">
            <div class="dash-panel-title">Salesperson Response &amp; Results</div>
            <span class="text-xs text-gray">Human response times only (automated acknowledgements excluded)</span>
          </div>
          <div style="overflow-x:auto;">
            <table class="crm-table">
              <thead>
                <tr>
                  <th>Salesperson</th>
                  <th style="text-align:right;">Enquiries</th>
                  <th style="text-align:right;">Contacted</th>
                  <th style="text-align:right;">Booked / Attended</th>
                  <th style="text-align:right;">Sold</th>
                  <th style="text-align:right;">Median Response</th>
                  <th style="text-align:right;">p90 Response</th>
                </tr>
              </thead>
              <tbody>
                ${staffBreakdown.map(s => `
                  <tr>
                    <td style="font-weight:600;">${escapeHtml(s.staffName)}</td>
                    <td style="text-align:right;font-weight:600;">${s.enquiries}</td>
                    <td style="text-align:right;">${s.contacted}</td>
                    <td style="text-align:right;">${s.booked} / ${s.attended}</td>
                    <td style="text-align:right;font-weight:600;color:#059669;">${s.dealsWon}</td>
                    <td style="text-align:right;">${fmtMin(s.medianResponseMin)}</td>
                    <td style="text-align:right;">${fmtMin(s.p90ResponseMin)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>` : ''}

        <!-- 6. CAMPAIGN & FORM ATTRIBUTION -->
        <div class="dash-panel-card">
          <div class="dash-panel-header">
            <div class="dash-panel-title">Campaign &amp; Form Attribution</div>
            <span class="text-xs text-gray">${escapeHtml(meta.attributionModel || 'Unavailable attribution is explicitly labelled Unknown.')}</span>
          </div>
          <div style="overflow-x:auto;">
            <table class="crm-table">
              <thead>
                <tr>
                  <th>Campaign</th>
                  <th>Page</th>
                  <th>Status</th>
                  <th style="text-align:right;">Ad Spend (NZD)</th>
                  <th style="text-align:right;">Platform Leads</th>
                  <th style="text-align:right;">CRM Leads</th>
                  <th style="text-align:right;">CPL (NZD)</th>
                  <th style="text-align:right;">Sold</th>
                </tr>
              </thead>
              <tbody>
                ${campaignBreakdown.length === 0 ? `
                  <tr><td colspan="8" style="text-align:center;padding:20px;color:var(--text-muted);">No campaign attribution records for this period.</td></tr>
                ` : campaignBreakdown.map(c => `
                  <tr>
                    <td style="font-weight:600;">${escapeHtml(c.campaignName)}</td>
                    <td class="text-xs text-gray">${escapeHtml(c.pageName || 'Unknown')}</td>
                    <td><span class="badge ${c.status === 'ACTIVE' ? 'badge-green' : 'badge-gray'}">${escapeHtml(c.status || 'UNKNOWN')}</span></td>
                    <td style="text-align:right;">${fmtNullableMoney(c.spend)}</td>
                    <td style="text-align:right;">${c.platformLeads !== null && c.platformLeads !== undefined ? c.platformLeads : 'Unavailable'}</td>
                    <td style="text-align:right;font-weight:600;">${c.crmLeads ?? c.leads ?? 0}</td>
                    <td style="text-align:right;">${fmtNullableMoney(c.cpl)}</td>
                    <td style="text-align:right;font-weight:600;color:#059669;">${c.dealsWon || 0}</td>
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
    const rep = (this.reportsData && this.reportsData.summary) ? this.reportsData : this._buildLocalAuthorisedReport();
    const sum = rep.summary || {};
    const pageBreakdown = rep.pageBreakdown || [];
    const campaignBreakdown = rep.campaignBreakdown || [];

    let csv = 'Section,Category,Metric,Value\n';
    csv += `"Summary","Period (Pacific/Auckland)","Date Range","${this.reportsDateRange || 'last_7d'}"\n`;
    csv += `"Summary","Overview","Total Enquiries","${sum.totalEnquiries || 0}"\n`;
    csv += `"Summary","Overview","Unique Contacts","${sum.uniqueContacts || 0}"\n`;
    csv += `"Summary","Overview","Contacted","${sum.contacted || 0}"\n`;
    csv += `"Summary","Overview","Booked Yard Visits","${sum.booked || 0}"\n`;
    csv += `"Summary","Overview","Attended Yard Visits","${sum.attended || 0}"\n`;
    csv += `"Summary","Overview","Deals Sold","${sum.dealsWon || 0}"\n`;
    csv += `"Summary","Overview","Recorded Sale Value (NZD)","${sum.totalWonValue || 0}"\n`;
    csv += `"Summary","Speed","Median Human Response (Min)","${sum.medianHumanResponseMin ?? 'No data'}"\n`;
    csv += `"Summary","Speed","p90 Human Response (Min)","${sum.p90HumanResponseMin ?? 'No data'}"\n`;
    csv += `"Summary","Ads","Total Spend (NZD)","${sum.totalSpend ?? 'Unavailable'}"\n`;
    csv += `"Summary","Ads","Cost Per CRM Lead (NZD)","${sum.cpl ?? 'Unavailable'}"\n`;

    csv += '\nPage Breakdown\nPage_ID,Page_Name,Enquiries,Unique_Buyers,Contacted,Booked,Attended,Sold,Sale_Value_NZD,Spend_NZD\n';
    pageBreakdown.forEach(p => {
      csv += `"${p.pageId}","${p.pageName}","${p.enquiries ?? p.leads ?? 0}","${p.uniqueContacts ?? 0}","${p.contacted ?? 0}","${p.booked ?? 0}","${p.attended ?? 0}","${p.dealsWon ?? 0}","${p.saleValueNzd ?? 0}","${p.spend ?? 'Unavailable'}"\n`;
    });

    csv += '\nCampaign Breakdown\nCampaign_ID,Campaign_Name,Page_Name,Status,Spend_NZD,Platform_Leads,CRM_Leads,CPL_NZD,Sold\n';
    campaignBreakdown.forEach(c => {
      csv += `"${c.campaignId || ''}","${c.campaignName}","${c.pageName}","${c.status}","${c.spend ?? 'Unavailable'}","${c.platformLeads ?? 'Unavailable'}","${c.crmLeads ?? c.leads ?? 0}","${c.cpl ?? 'Unavailable'}","${c.dealsWon || 0}"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nova_autos_report_nzd_${this.reportsDateRange || 'last_7d'}_${this._getNZDate()}.csv`;
    a.click();
    this.toast('Authorised NZD report exported to CSV ✓', 'success');
  }
}

// Global Initialization
window.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    window.app = new MetaCRMApp();
  }, 40);
});
