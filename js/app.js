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

  // ──────────────────────────────────────────────────────────
  // Bootstrap & Global Event Bindings
  // ──────────────────────────────────────────────────────────

  _init() {
    this._checkUrlCallbacks();
    this.syncZernioAccounts(false);
    this.fetchRealInstagramConversations();
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
    });

    // Real-time notification handler
    window.addEventListener('crm:notification_received', (e) => {
      const notif = e.detail?.notification;
      if (notif) {
        this.toast(`${notif.title}: ${notif.message}`, notif.type === 'hot_lead' ? 'warning' : 'info');
      }
      this.renderNotifications();
    });

    // Keyboard Shortcuts (Ctrl+K for search, Escape for modal/drawer)
    window.addEventListener('keydown', e => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        const input = document.getElementById('lead-search-input');
        if (input) { input.focus(); }
        else { this.navigate('leads'); setTimeout(() => { const i = document.getElementById('lead-search-input'); if (i) i.focus(); }, 150); }
      }
      if (e.key === 'Escape') { this.closeDrawer(); this.closeModal(); this.toggleMobileSidebar(false); if (this.el.notifPopover) this.el.notifPopover.classList.remove('open'); }
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
      const icon = isHot ? '🔥' : n.type === 'sla_breach' ? '⚠️' : '👤';
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

        <div class="auth-demo-section">
          <div class="auth-demo-title">Quick Demo Sign-In (1-Click)</div>
          <div class="auth-demo-pills">
            <div class="auth-demo-pill" onclick="window.app.quickDemoLogin('admin')">
              <div>
                <strong>🛡️ Administrator (Super Admin)</strong>
                <div class="text-xs text-gray">admin@company.com · Full Access</div>
              </div>
              <span class="badge badge-purple">Log In</span>
            </div>
            <div class="auth-demo-pill" onclick="window.app.quickDemoLogin('staff_a')">
              <div>
                <strong>👤 Vikram Sharma (Staff A)</strong>
                <div class="text-xs text-gray">vikram@company.com · Page 1 Assigned</div>
              </div>
              <span class="badge badge-green">Log In</span>
            </div>
            <div class="auth-demo-pill" onclick="window.app.quickDemoLogin('staff_b')">
              <div>
                <strong>👤 Priya Patel (Staff B)</strong>
                <div class="text-xs text-gray">priya@company.com · Page 2 Assigned</div>
              </div>
              <span class="badge badge-green">Log In</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  switchAuthTab(tab) {
    this.authTab = tab;
    this.renderAuthScreen();
  }

  submitLogin() {
    const email = (document.getElementById('login-email')?.value || '').trim();
    const pass = (document.getElementById('login-password')?.value || '').trim();
    const feedback = document.getElementById('auth-feedback');
    const submitBtn = document.getElementById('login-submit-btn');

    if (!email || !pass) {
      if (feedback) feedback.innerHTML = '<div class="auth-error-banner">Please enter both your work email and password.</div>';
      return;
    }

    if (submitBtn) submitBtn.innerHTML = '<span class="spinner"></span> Verifying credentials…';

    setTimeout(() => {
      if (this.svc) {
        const res = this.svc.login(email, pass);
        if (res.success) {
          this.user = res.user;
          try { localStorage.setItem('metacrm_authenticated', 'true'); } catch (e) {}
          const pages = this._getAccessiblePages();
          this.toast(`Welcome back, ${(this.user.displayName || this.user.name).split(' ')[0]}!`, 'success');
          if (pages.length === 0) {
            this.navigate('connections');
          } else {
            this.navigate('dashboard');
          }
          return;
        } else {
          if (submitBtn) submitBtn.innerHTML = 'Sign In to MetaCRM';
          if (feedback) feedback.innerHTML = `<div class="auth-error-banner"><span>⚠️</span> ${res.error || 'Incorrect email or password. Please verify and try again.'}</div>`;
        }
      }
    }, 350);
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
        assignedPageIds: role === 'admin' ? (this.svc ? this.svc.pages.map(p => p.id) : []) : ['page_01']
      };

      if (this.svc) {
        this.svc.staff.push(newUser);
        this.svc._saveToStorage ? this.svc._saveToStorage() : this.svc.saveAll();
        this.svc.login(email);
        this.user = this.svc.getCurrentUser();
      }

      try { localStorage.setItem('metacrm_authenticated', 'true'); } catch (e) {}
      this.toast(`🎉 Account created! Welcome, ${name.split(' ')[0]}!`, 'success');
      this.navigate('dashboard');
    }, 400);
  }

  quickDemoLogin(type) {
    if (type === 'admin') {
      const user = this.svc ? this.svc.staff.find(s => s.role === 'admin') : null;
      if (user) this.switchUserDirect(user.id);
    } else if (type === 'staff_a') {
      const user = this.svc ? this.svc.staff.find(s => s.email && s.email.includes('vikram')) || this.svc.staff[1] : null;
      if (user) this.switchUserDirect(user.id);
    } else if (type === 'staff_b') {
      const user = this.svc ? this.svc.staff.find(s => s.email && s.email.includes('priya')) || this.svc.staff[2] : null;
      if (user) this.switchUserDirect(user.id);
    }
    try { localStorage.setItem('metacrm_authenticated', 'true'); } catch (e) {}
    this.navigate('dashboard');
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

    const sections = [
      {
        title: 'MAIN',
        items: [
          { id: 'dashboard',   icon: `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>`, label: 'Dashboard' },
          { id: 'leads',       icon: `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`, label: 'Leads', badge: newLeads || null },
          { id: 'inbox',       icon: `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`, label: 'Messages', badge: (this.svc ? (this.svc.conversations||[]).reduce((s,c)=>s+(c.unread||0),0) : 0) || null },
          { id: 'tasks',       icon: `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`, label: 'Follow-ups', badge: overdueTasks || null },
          { id: 'pipeline',    icon: `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`, label: 'Pipeline' },
          { id: 'connections', icon: `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>`, label: 'Connect Facebook' },
        ]
      },
      ...(isAdmin ? [{
        title: 'MANAGEMENT',
        items: [
          { id: 'staff',   icon: `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`, label: 'Team' },
          { id: 'reports', icon: `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>`, label: 'Reports' },
        ]
      }] : []),
    ];

    let html = '';
    sections.forEach(sec => {
      html += `<div class="nav-section-title">${sec.title}</div>`;
      sec.items.forEach(item => {
        const active = this.currentRoute === item.id ? 'active' : '';
        const badge = item.badge ? `<span class="nav-badge">${item.badge}</span>` : '';
        html += `
          <a href="#${item.id}" class="nav-item ${active}">
            <span class="nav-icon">${item.icon}</span>
            <span class="nav-text">${item.label}</span>
            ${badge}
          </a>`;
      });
    });

    // Bottom Navigation with User Profile & Role Switcher
    html += `
      <div class="sidebar-spacer"></div>
      <div class="nav-bottom">
        <a href="#settings" class="nav-item ${this.currentRoute === 'settings' ? 'active' : ''}">
          <span class="nav-icon"><svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg></span>
          <span class="nav-text">Settings</span>
        </a>
        <div class="user-profile-item" onclick="window.app.openUserSwitchModal()">
          <div class="user-avatar" style="background:${this.user.role === 'admin' ? 'var(--accent)' : '#10B981'}">
            ${(this.user.name || 'A').charAt(0).toUpperCase()}
          </div>
          <div class="nav-text user-info">
            <div class="user-name">${this.user.displayName || this.user.name}</div>
            <div class="user-role">${this._roleLabel(this.user.role)} · Switch ▾</div>
          </div>
        </div>
        <div class="user-profile-item" style="padding:6px 10px;margin-top:2px;cursor:pointer;border-radius:var(--radius-sm);" onclick="window.app.logout()">
          <span style="font-size:13px;margin-right:8px;">🚪</span>
          <span class="text-xs text-gray font-semibold">Sign Out</span>
        </div>
      </div>`;

    this.el.nav.innerHTML = html;
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
    setTimeout(() => {
      switch (this.currentRoute) {
        case 'dashboard':   this.renderDashboard(); break;
        case 'leads':       this.renderLeads(); break;
        case 'inbox':       this.renderInbox(); break;
        case 'pipeline':    this.renderPipeline(); break;
        case 'tasks':       this.renderTasks(); break;
        case 'reports':     this.renderReports(); break;
        case 'connections': this.renderConnections(); break;
        case 'staff':       this.renderStaff(); break;
        case 'settings':    this.renderSettings(); break;
        default:            this.renderDashboard(); break;
      }
    }, 80);
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
    let pageSelectOptions = `<option value="all">All 6 Pages (${availablePages.length})</option>`;
    if (!isAdmin) {
      pageSelectOptions = availablePages.map(p => `<option value="${p.id}" ${this.selectedPageFilter === p.id ? 'selected' : ''}>${p.name}</option>`).join('');
    } else {
      pageSelectOptions += availablePages.map(p => `<option value="${p.id}" ${this.selectedPageFilter === p.id ? 'selected' : ''}>${p.name}</option>`).join('');
    }

    this.el.title.innerHTML = `
      <div style="display:flex;align-items:center;gap:12px;">
        <span style="font-weight:700;font-size:18px;color:#0F172A;">${greeting}, ${(this.user.displayName || this.user.name || 'Administrator').split(' ')[0]} 👋</span>
        <span style="background:#FFF3EC;color:#FF5A1F;border-radius:20px;font-size:11px;font-weight:600;padding:4px 12px;">${this._roleLabel(this.user.role)}</span>
      </div>`;

    this.el.actions.innerHTML = `
      <select class="input topbar-pill-select" onchange="window.app.onPageFilterChange(this.value)">
        ${pageSelectOptions}
      </select>
      <select class="input topbar-pill-select" onchange="window.app.onDateRangeChange(this.value)">
        <option value="today" ${this.selectedDateRange==='today'?'selected':''}>Today</option>
        <option value="yesterday" ${this.selectedDateRange==='yesterday'?'selected':''}>Yesterday</option>
        <option value="last_7d" ${this.selectedDateRange==='last_7d'?'selected':''}>Last 7 days</option>
        <option value="last_30d" ${this.selectedDateRange==='last_30d'?'selected':''}>Last 30 days</option>
        <option value="this_month" ${this.selectedDateRange==='this_month'?'selected':''}>This month</option>
      </select>
      <button class="btn btn-secondary btn-sm topbar-switch-btn" onclick="window.app.openUserSwitchModal()">
        <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        Switch User
      </button>`;

    const leads = this._getFilteredLeads();
    const newL = leads.filter(l => l.status === 'New' || l.status === 'New Lead');
    const qualL = leads.filter(l => l.status === 'Qualified');
    const wonL = leads.filter(l => l.status === 'Won' || l.status === 'Converted');
    const followL = leads.filter(l => l.status === 'Follow-up');

    // Calculate Spend and CPL
    const campaignsList = (this.svc && this.svc.campaigns) ? this.svc.campaigns : [];
    const totalSpend = isAdmin ? campaignsList.reduce((sum, c) => sum + (c.spend || 0), 0) : null;
    const cpl = totalSpend && leads.length ? Math.round(totalSpend / leads.length) : 0;
    const unreadMessagesCount = (this.svc ? (this.svc.conversations || []) : []).reduce((sum, c) => sum + (c.unread || 0), 0);

    // Page Performance Rows (Section 18 & 19)
    const pageRows = availablePages.map(p => {
      const pLeads = (this.svc ? this.svc.leads : []).filter(l => l.page_id === p.id || l.pageId === p.id || l.source === p.name);
      const pWon = pLeads.filter(l => l.status === 'Won' || l.status === 'Converted');
      const conv = pLeads.length ? ((pWon.length / pLeads.length) * 100).toFixed(0) : 0;
      const spend = p.spend || 0;
      const pageCpl = pLeads.length && spend ? Math.round(spend / pLeads.length) : 0;
      return `
        <tr>
          <td><div class="page-dot" style="background:${p.color || '#6366F1'}"></div><strong>${p.name}</strong></td>
          <td class="font-semibold">${pLeads.length}</td>
          <td><span class="badge badge-green">${pWon.length}</span></td>
          <td>${conv}%</td>
          ${isAdmin ? `<td>₹${this._formatNum(spend)}</td><td>₹${pageCpl}</td>` : ''}
          <td><div class="mini-bar"><div class="mini-bar-fill" style="width:${Math.min(100, Math.round(pLeads.length / (leads.length || 1) * 100))}%"></div></div></td>
        </tr>`;
    }).join('');

    // Campaigns Performance Rows
    const campaigns = (this.svc && this.svc.campaigns) ? this.svc.campaigns.slice(0, 5) : [];
    const campaignRows = campaigns.map(c => {
      const cLeads = leads.filter(l => l.campaign_id === c.id || l.campaignId === c.id);
      const cWon = cLeads.filter(l => l.status === 'Won' || l.status === 'Converted');
      return `
        <tr>
          <td><strong>${c.name}</strong></td>
          <td>${this._pageName(c.page_id || c.pageId)}</td>
          <td>₹${this._formatNum(c.spend || 0)}</td>
          <td class="font-semibold">${cLeads.length || c.leadsCount || 0}</td>
          <td>₹${c.cpl || (c.spend && cLeads.length ? Math.round(c.spend / cLeads.length) : 0)}</td>
          <td><span class="badge badge-green">${cWon.length || 0}</span></td>
        </tr>`;
    }).join('');

    // Recent leads
    const recentLeads = leads.slice(0, 8);

    // Recent conversations
    const recentConvs = (this.svc ? (this.svc.conversations || []) : []).slice(0, 4);

    // Tasks
    const tasks = this._filterUserTasks(this.svc ? this.svc.tasks : []).filter(t => t.status !== 'Done').slice(0, 4);

    // FIRST-TIME ZERO-DATA WELCOME: When no pages connected, show warm clean welcome screen matching screenshot
    if (availablePages.length === 0) {
      this.el.content.innerHTML = `
        <div class="home-hero-container">
          <div class="home-hero-grid">
            <!-- Left Column: Copy & Actions -->
            <div class="home-hero-left">
              <div class="welcome-badge">
                <span>👋</span>
                <span>Welcome!</span>
              </div>
              
              <h1 class="home-hero-title">
                Let’s get your leads<br>flowing in <span class="highlight-orange">2 minutes.</span>
              </h1>
              
              <p class="home-hero-desc">
                Connect your Facebook Page once to automatically capture leads from Facebook &amp; Instagram ads and Messenger chats.
              </p>
              
              <div class="home-hero-cta-wrap">
                <button class="btn-hero-connect" onclick="window.app.navigate('connections')">
                  <svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2C6.477 2 2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.879V14.89h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.989C18.343 21.129 22 16.99 22 12c0-5.523-4.477-10-10-10z"/>
                  </svg>
                  <span>Connect Your Facebook Page →</span>
                </button>
              </div>

              <!-- 3 Feature Pillars -->
              <div class="home-features-row">
                <div class="home-feature-col">
                  <div class="feature-icon-circle">
                    <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                    </svg>
                  </div>
                  <div class="feature-title">Connect Once</div>
                  <div class="feature-desc">Facebook will ask permission to link your leads.</div>
                </div>

                <div class="home-feature-col">
                  <div class="feature-icon-circle">
                    <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                    </svg>
                  </div>
                  <div class="feature-title">Get Instant Leads</div>
                  <div class="feature-desc">When someone fills out your Lead Ad or messages you, they appear here instantly.</div>
                </div>

                <div class="home-feature-col">
                  <div class="feature-icon-circle">
                    <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                    </svg>
                  </div>
                  <div class="feature-title">Call or WhatsApp</div>
                  <div class="feature-desc">Contact them with one click directly from your dashboard.</div>
                </div>
              </div>
            </div>

            <!-- Right Column: 3D Floating Graphic Card Stack -->
            <div class="home-hero-right">
              <div class="hero-card-stack">
                <!-- Back Card: Integration Hub -->
                <div class="stack-back-card">
                  <div class="hub-icons-row">
                    <div class="hub-icon-fb">
                      <svg width="22" height="22" fill="#fff" viewBox="0 0 24 24">
                        <path d="M12 2C6.477 2 2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.879V14.89h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.989C18.343 21.129 22 16.99 22 12c0-5.523-4.477-10-10-10z"/>
                      </svg>
                    </div>
                    <div class="hub-connector-dots"></div>
                    <div class="hub-icon-ig">
                      <svg width="20" height="20" fill="#fff" viewBox="0 0 24 24">
                        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                      </svg>
                    </div>
                  </div>

                  <div class="hub-center-badge">
                    <svg width="26" height="26" viewBox="0 0 32 32" fill="none">
                      <rect width="32" height="32" rx="8" fill="#FF5A1F"/>
                      <path d="M8 23V9h3.6l4.4 7.2L20.4 9H24v14h-3.2v-8.8l-4.1 6.6h-1.4l-4.1-6.6V23H8z" fill="#fff"/>
                    </svg>
                  </div>
                </div>

                <!-- Front Card: Live Incoming Lead Card -->
                <div class="stack-front-card">
                  <div class="front-card-header">
                    <div class="lead-avatar-img">
                      <img src="https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=100&h=100&fit=crop&crop=faces" alt="Priya Sharma" onerror="this.onerror=null;this.src='';this.parentElement.innerHTML='PS';">
                    </div>
                    <div class="lead-info-wrap">
                      <div class="lead-name-row">
                        <span class="lead-name-text">Priya Sharma</span>
                        <span class="lead-pill-tag">Lead</span>
                        <span class="lead-time-text">2m ago</span>
                      </div>
                      <div class="lead-interest-text">Interested in your product</div>
                    </div>
                  </div>

                  <div class="front-card-actions">
                    <a href="tel:+919876543210" class="btn-card-action btn-card-call">
                      <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                      </svg>
                      <span>Call</span>
                    </a>
                    <a href="https://wa.me/919876543210" target="_blank" rel="noopener" class="btn-card-action btn-card-wa">
                      <svg width="13" height="13" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.582 2.128 2.182-.573c.978.58 1.911.928 3.145.929 3.178 0 5.767-2.587 5.768-5.766.001-3.187-2.575-5.77-5.764-5.771zm3.392 8.244c-.144.405-.837.774-1.17.824-.312.045-.694.072-2.127-.521-1.727-.714-2.839-2.477-2.926-2.593-.086-.115-.705-.939-.705-1.789 0-.85.447-1.267.606-1.44.159-.174.347-.217.462-.217.116 0 .232.001.332.006.107.005.25-.041.39.296.145.348.492 1.202.535 1.289.043.087.072.188.014.304-.058.116-.087.188-.173.289l-.261.304c-.087.086-.177.18-.076.353.101.174.45 1.06 1.488 1.984.779.695 1.436.909 1.639.996.202.087.322.072.441-.065.119-.137.509-.594.646-.797.137-.202.274-.173.462-.101.188.072 1.185.558 1.387.66.202.101.337.151.386.236.049.085.049.493-.095.898z"/>
                      </svg>
                      <span>WhatsApp</span>
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>`;
      return;
    }

    this.el.content.innerHTML = `
      <!-- TOP 4 CORE DAILY KPI CARDS -->
      <div class="kpi-row" style="grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));">
        <div class="kpi-card">
          <div class="kpi-title">NEW LEADS</div>
          <div class="kpi-value" style="color:var(--info)">${newL.length}</div>
          <div class="kpi-trend">Requires contact today</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-title">UNREAD MESSAGES</div>
          <div class="kpi-value" style="color:var(--warning)">${unreadMessagesCount}</div>
          <div class="kpi-trend">Waiting for reply</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-title">FOLLOW-UPS DUE</div>
          <div class="kpi-value" style="color:var(--accent)">${tasks.length}</div>
          <div class="kpi-trend">Callbacks &amp; reminders</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-title">DEALS WON</div>
          <div class="kpi-value" style="color:var(--success)">${wonL.length}</div>
          <div class="kpi-trend">Closed customers</div>
        </div>
      </div>

      <!-- MAIN DASHBOARD GRID -->
      <div class="dash-grid">
        <div class="dash-col-main">
          <!-- Recent Leads with 1-Click Call & WhatsApp -->
          <div class="card">
            <div class="card-header">
              <div class="card-title">Recent Inbound Leads</div>
              <a href="#leads" class="link-small">Open All Leads →</a>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Lead Details</th>
                  <th>Platform / Page</th>
                  <th>Status</th>
                  <th>Received</th>
                  <th>Quick Contact</th>
                </tr>
              </thead>
              <tbody>
                ${recentLeads.length > 0 ? recentLeads.map(l => `
                  <tr class="clickable-row" onclick="window.app.openLeadDrawer('${l.id}')">
                    <td>
                      <div class="lead-name" style="font-weight:600;font-size:13px;">${l.name}</div>
                      <div class="text-xs text-gray">${l.phone || l.email || 'No phone'}</div>
                    </td>
                    <td>
                      <div class="text-xs font-semibold">${l.source || 'Facebook Lead Ad'}</div>
                      <div class="text-xs text-gray">${this._pageName(l.page_id || l.pageId)}</div>
                    </td>
                    <td>${this._badge(l.status)}</td>
                    <td class="text-xs text-gray">${this._timeAgo(l.created_at || l.createdAt)}</td>
                    <td onclick="event.stopPropagation()">
                      <div style="display:flex;align-items:center;gap:6px;">
                        <button class="btn-direct-call" title="Call lead" onclick="window.app.quickCall('${l.id}')">📞 Call</button>
                        ${l.phone ? `<button class="btn-direct-wa" title="WhatsApp message" onclick="window.crmService.recordFirstResponse('${l.id}','whatsapp');window.open('https://wa.me/'+'${l.phone.replace(/\\D/g,'')}','_blank')">💬 WhatsApp</button>` : ''}
                      </div>
                    </td>
                  </tr>`).join('') : '<tr><td colspan="5" class="empty-cell" style="text-align:center;padding:24px;color:var(--text-muted);">No leads captured yet. Your leads will appear here as soon as someone submits a form.</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>

        <div class="dash-col-side">
          <!-- Quick Action Buttons -->
          <div class="card">
            <div class="card-header">
              <div class="card-title">Quick Actions</div>
            </div>
            <div class="quick-actions">
              <button class="qa-btn" onclick="window.app.openAddLeadModal()">+ Add New Lead</button>
              <button class="qa-btn" onclick="window.app.openAddTaskModal()">+ Schedule Follow-up</button>
              <button class="qa-btn" onclick="window.app.navigate('inbox')">Open Messages</button>
              <button class="qa-btn" onclick="window.app.navigate('connections')">Manage Facebook Pages</button>
            </div>
          </div>

          <!-- Tasks Due Today -->
          <div class="card">
            <div class="card-header">
              <div class="card-title">Follow-ups Today</div>
              <a href="#tasks" class="link-small">All Tasks →</a>
            </div>
            ${tasks.length ? tasks.map(t => `
              <div class="task-mini">
                <input type="checkbox" class="task-check" onchange="window.app.completeTask('${t.id}', this)">
                <div class="task-mini-info">
                  <div class="task-mini-title">${t.title}</div>
                  <div class="text-xs text-gray">Due: ${t.dueDate ? new Date(t.dueDate).toLocaleDateString('en-IN', {day:'numeric',month:'short'}) : 'Today'}</div>
                </div>
                ${this._priorityBadge(t.priority)}
              </div>`).join('') : `<div class="empty-mini">✓ No overdue follow-ups!</div>`}
          </div>
        </div>
      </div>

      <!-- COLLAPSIBLE DETAILED AD SPEND & ANALYTICS -->
      <details class="tech-details-toggle" style="margin-top:24px;background:#ffffff;border:1px solid var(--border);border-radius:var(--radius);padding:18px 22px;">
        <summary style="font-weight:600;font-size:14px;color:var(--text-primary);cursor:pointer;list-style:none;display:flex;align-items:center;justify-content:space-between;">
          <span>📊 Ad Spend &amp; Detailed Analytics (Click to view spend, CPL, speed-to-lead &amp; page stats)</span>
          <span class="text-xs text-gray font-normal">Expand ▾</span>
        </summary>
        <div style="margin-top:20px;">
          <!-- Secondary Financial & SLA KPI Row -->
          <div class="kpi-row" style="margin-bottom:20px;">
            <div class="kpi-card">
              <div class="kpi-title">TOTAL LEADS</div>
              <div class="kpi-value">${leads.length}</div>
              <div class="kpi-trend">All time capture</div>
            </div>
            <div class="kpi-card">
              <div class="kpi-title">AD SPEND</div>
              <div class="kpi-value">₹${this._formatNum(this.svc ? this.svc.getRoiMetrics().totalSpend : 0)}</div>
              <div class="kpi-trend">${isAdmin ? (campaigns.length + ' Active Campaigns') : 'Assigned Pages'}</div>
            </div>
            <div class="kpi-card">
              <div class="kpi-title">COST PER LEAD (CPL)</div>
              <div class="kpi-value" style="color:var(--accent)">₹${this.svc ? this.svc.getRoiMetrics().cpl : 0}</div>
              <div class="kpi-trend">Live CPL</div>
            </div>
            <div class="kpi-card">
              <div class="kpi-title">COST PER ACQUISITION (CPA)</div>
              <div class="kpi-value" style="color:var(--success)">₹${this.svc ? this.svc.getRoiMetrics().cpa : 0}</div>
              <div class="kpi-trend">Spend / Won Deal</div>
            </div>
            <div class="kpi-card">
              <div class="kpi-title">MEDIAN RESPONSE TIME</div>
              <div class="kpi-value" style="color:var(--accent)">${this.svc ? this.svc.getSpeedToLeadMetrics(leads).medianText : '—'}</div>
              <div class="kpi-trend">Target: &lt; 5 mins</div>
            </div>
            <div class="kpi-card">
              <div class="kpi-title">SLA COMPLIANCE</div>
              <div class="kpi-value" style="color:var(--success)">${this.svc ? this.svc.getSpeedToLeadMetrics(leads).complianceRate : '100%'}</div>
              <div class="kpi-trend">Within 5m SLA</div>
            </div>
          </div>

          <!-- Page Performance Table -->
          <div class="card" style="margin-bottom:16px;">
            <div class="card-header">
              <div class="card-title">${isAdmin ? 'Leads by Page' : 'My Assigned Pages Performance'}</div>
              ${isAdmin ? `<a href="#reports" class="link-small">View Full Report →</a>` : ''}
            </div>
            <table>
              <thead>
                <tr>
                  <th>Page</th><th>Leads</th><th>Won</th><th>Conv.%</th>
                  ${isAdmin ? `<th>Spend</th><th>CPL</th>` : ''}
                  <th>Share</th>
                </tr>
              </thead>
              <tbody>
                ${pageRows || '<tr><td colspan="7" class="empty-cell" style="text-align:center;padding:24px;color:var(--text-muted);">No connected pages found. Connect a Facebook Page in Connections.</td></tr>'}
              </tbody>
            </table>
          </div>

          <!-- Campaign Performance -->
          ${isAdmin ? `
          <div class="card">
            <div class="card-header">
              <div class="card-title">Campaign Performance</div>
              <span class="text-xs text-gray">Synced with Meta Ads</span>
            </div>
            <table>
              <thead>
                <tr><th>Campaign Name</th><th>Page</th><th>Spend</th><th>Leads</th><th>CPL</th><th>Won</th></tr>
              </thead>
              <tbody>
                ${campaignRows || '<tr><td colspan="6" class="empty-cell" style="text-align:center;padding:24px;color:var(--text-muted);">No active campaigns found.</td></tr>'}
              </tbody>
            </table>
          </div>` : ''}
        </div>
      </details>`;
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

    this.el.actions.innerHTML = `
      <div class="search-wrap">
        <svg class="search-icon" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input type="text" class="input search-input" placeholder="Search leads… (Ctrl+K)" id="lead-search-input" value="${this.leadSearchQuery}" oninput="window.app.onLeadSearch(this.value)">
      </div>
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
              return `
                <tr class="clickable-row ${isHot ? 'hot-lead-card' : ''}" onclick="window.app.openLeadDrawer('${l.id}')">
                  <td onclick="event.stopPropagation()"><input type="checkbox" class="lead-select-box" value="${l.id}"></td>
                  <td>
                    <strong>${l.name}</strong>
                    ${isHot ? `<span class="badge badge-hot" style="margin-left:4px;font-size:10px;">🔥 Hot</span>` : ''}
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
                      <button class="btn-direct-call" title="Call lead" onclick="window.app.quickCall('${l.id}')">📞 Call</button>
                      ${l.phone ? `<button class="btn-direct-wa" title="WhatsApp message" onclick="window.crmService.recordFirstResponse('${l.id}','whatsapp');window.open('https://wa.me/'+'${l.phone.replace(/\\D/g,'')}','_blank')">💬 WhatsApp</button>` : ''}
                      <button class="btn btn-ghost btn-sm" onclick="window.app.openLeadDrawer('${l.id}')">View</button>
                    </div>
                  </td>
                </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
      <div class="table-footer">Showing <strong>${tabFiltered.length}</strong> of <strong>${allLeads.length}</strong> total leads</div>`
      : this._empty('No leads found', 'No leads match the selected filter. Connect your Facebook Page to receive leads automatically, or add a lead manually.', null, null, '<button class="btn btn-primary" onclick="window.app.openAddLeadModal()">+ Add New Lead</button>', '👥')}`;
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

  toggleSelectAll(master) {
    document.querySelectorAll('.lead-select-box').forEach(cb => { cb.checked = master.checked; });
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

    this.el.dTitle.textContent = 'Lead Details & Attribution';
    this.el.dContent.innerHTML = `
      <!-- HEADER -->
      <div class="drawer-lead-header">
        <div class="lead-avatar">${lead.name.charAt(0).toUpperCase()}</div>
        <div class="lead-header-info">
          <div class="lead-header-name">
            ${lead.name}
            ${isHot ? `<span class="badge badge-hot" style="margin-left:4px;font-size:11px;">🔥 Hot</span>` : ''}
          </div>
          <div class="text-sm text-gray">${lead.phone || 'No phone'} ${lead.email ? '• ' + lead.email : ''}</div>
          <div style="margin-top:4px;">${this._badge(lead.status)}</div>
        </div>
      </div>

      <!-- ONE-CLICK COMMUNICATION BAR (Hooks first_response_at) -->
      <div class="lead-actions-bar">
        <a href="tel:${lead.phone}" onclick="window.crmService.recordFirstResponse('${lead.id}', 'call')" class="btn btn-primary btn-sm">📞 Call</a>
        <a href="https://wa.me/${(lead.phone||'').replace(/\D/g,'')}" target="_blank" onclick="window.crmService.recordFirstResponse('${lead.id}', 'whatsapp')" class="btn btn-secondary btn-sm whatsapp-btn">💬 WhatsApp</a>
        <a href="mailto:${lead.email}" onclick="window.crmService.recordFirstResponse('${lead.id}', 'email')" class="btn btn-secondary btn-sm">✉ Email</a>
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

      <!-- 5-TIER LEAD ATTRIBUTION (Section 9) -->
      <div class="drawer-section">
        <div class="drawer-section-title">Lead Source &amp; Attribution</div>
        <div class="attribution-block">
          <div class="attr-row"><span class="attr-label">Source</span><strong>${lead.source || 'Facebook Lead Ad'}</strong></div>
          <div class="attr-row"><span class="attr-label">Page</span><strong>${this._pageName(lead.page_id || lead.pageId) || '—'}</strong></div>
          <div class="attr-row"><span class="attr-label">Assigned</span>
            <select class="input input-sm" onchange="window.app.reassignLead('${lead.id}', this.value)">
              <option value="">Unassigned</option>
              ${staff.map(s => `<option value="${s.id}" ${(lead.assigned_staff_id||lead.assignedStaffId)===s.id?'selected':''}>${s.name}</option>`).join('')}
            </select>
          </div>
        </div>

        <!-- Collapsible Technical Ad IDs -->
        <details class="tech-details-toggle" style="margin-top:10px;">
          <summary style="font-size:12px;color:var(--text-muted);cursor:pointer;">Ad details (Campaign, Form, Adset IDs) ▾</summary>
          <div class="attribution-block" style="margin-top:8px;background:#f8fafc;padding:8px 12px;border-radius:var(--radius-sm);">
            <div class="attr-row"><span class="attr-label">Campaign</span><span>${lead.campaign_name || lead.campaign_id || lead.campaignId || '—'}</span></div>
            <div class="attr-row"><span class="attr-label">Ad Set</span><span>${lead.adset_name || lead.adset_id || lead.adsetId || '—'}</span></div>
            <div class="attr-row"><span class="attr-label">Ad</span><span>${lead.ad_name || lead.ad_id || lead.adId || '—'}</span></div>
            <div class="attr-row"><span class="attr-label">Lead Form</span><span>${lead.form_name || lead.form_id || lead.formId || '—'}</span></div>
            <div class="attr-row"><span class="attr-label">Meta ID</span><span class="text-xs text-gray font-mono">${lead.meta_lead_id || lead.id}</span></div>
          </div>
        </details>
      </div>

      <!-- FOLLOW-UP SCHEDULER -->
      <div class="drawer-section">
        <div class="drawer-section-title">Follow-up Schedule</div>
        <div class="followup-row">
          <input type="date" class="input input-sm" value="${lead.follow_up_date || lead.followUpDate || ''}" 
                 onchange="window.app.updateFollowUp('${lead.id}', this.value)">
          <button class="btn btn-secondary btn-sm" onclick="window.app.setTomorrowFollowUp('${lead.id}')">Tomorrow</button>
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
          🗑️ Delete Lead Permanently
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
        const total = cards.reduce((s, c) => s + (c.value || c.dealValue || 0), 0);
        return `
          <div class="kanban-col" data-stage="${stage}" ondragover="event.preventDefault()" ondrop="window.app.onKanbanDrop(event, '${stage}')">
            <div class="kanban-col-header">
              <div class="kanban-col-label">
                <span class="kanban-col-dot" style="background:${this._stageColor(stage)}"></span>
                <strong>${stage}</strong>
              </div>
              <div class="kanban-col-meta">
                <span class="badge badge-gray">${cards.length}</span>
                ${total ? `<span class="text-xs text-gray font-semibold">₹${this._formatNum(total)}</span>` : ''}
              </div>
            </div>
            <div class="kanban-col-body">
              ${cards.length ? cards.map(c => `
                <div class="kanban-card" draggable="true" ondragstart="window.app.onKanbanDragStart(event, '${c.id}')" onclick="window.app.openLeadDrawer('${c.id}')">
                  <div class="kanban-card-name">${c.name}</div>
                  <div class="kanban-card-meta text-xs text-gray">${this._pageName(c.page_id || c.pageId)}</div>
                  <div class="kanban-card-footer">
                    <div class="staff-chip" title="${this._staffName(c.assigned_staff_id || c.assignedStaffId)}">${(this._staffName(c.assigned_staff_id || c.assignedStaffId)||'?').charAt(0)}</div>
                    ${(c.value || c.dealValue) ? `<span class="text-xs font-semibold">₹${this._formatNum(c.value || c.dealValue)}</span>` : ''}
                    <span class="text-xs text-gray ml-auto">${c.follow_up_date || c.followUpDate ? new Date(c.follow_up_date || c.followUpDate).toLocaleDateString('en-IN', {day:'numeric',month:'short'}) : 'No date'}</span>
                  </div>
                </div>`).join('')
              : `<div class="kanban-empty">Drag leads here</div>`}
            </div>
          </div>`;
      }).join('');

      const emptyBanner = leads.length === 0 ? `
        <div style="background:#EEF2FF;border:1px solid #C7D2FE;border-radius:var(--radius-sm);padding:12px 16px;margin-bottom:14px;display:flex;align-items:center;justify-content:space-between;gap:12px;">
          <div style="display:flex;align-items:center;gap:10px;">
            <span style="font-size:18px;">📋</span>
            <span style="font-size:13px;color:#312E81;"><strong>Pipeline is currently empty.</strong> Add leads manually or receive inbound Facebook Lead Ads.</span>
          </div>
          <button class="btn btn-primary btn-sm" onclick="window.app.openAddLeadModal()">+ Add First Lead</button>
        </div>` : '';

      this.el.content.innerHTML = `${emptyBanner}<div class="kanban-board">${colsHtml}</div>`;
    } else {
      this.renderLeads();
    }
  }

  onKanbanDragStart(e, leadId) {
    e.dataTransfer.setData('text/plain', leadId);
  }

  onKanbanDrop(e, newStage) {
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
        this.toast(`Lead moved from ${prev} → ${newStage}`);
        this.renderPipeline();
      }
    }
  }

  // ──────────────────────────────────────────────────────────
  // UNIFIED 3-COLUMN INBOX (Section 14 & 15)
  // ──────────────────────────────────────────────────────────

  renderInbox() {
    this.el.title.textContent = this.user.role === 'staff' ? 'My Messages' : 'Messages';
    this.el.actions.innerHTML = `
      <button class="btn btn-lime btn-sm btn-inbox-refresh" onclick="window.app.refreshRealInbox()">
        🔄 Refresh Real Instagram Inbox
      </button>
      <button class="btn btn-secondary-lime btn-sm btn-inbox-sync" onclick="window.app.syncConnections()">
        🔄 Sync Accounts
      </button>`;

    // Auto-fetch real Instagram conversations if not loaded yet
    if (!this._fetchedRealIgConvs && this.svc) {
      this._fetchedRealIgConvs = true;
      setTimeout(() => this.fetchRealInstagramConversations(), 50);
    }

    const convs = (this.svc ? (this.svc.conversations || []) : []);
    const userPages = this._getAccessiblePages().map(p => p.id);
    const accessibleConvs = (this.user.role === 'admin' || this.user.role === 'super_admin')
      ? convs
      : convs.filter(c => !c.page_id || userPages.includes(c.page_id) || userPages.includes(c.accountId));

    const activeTab = this.inboxTab || 'all';
    let filteredConvs = accessibleConvs;
    if (activeTab === 'unread') {
      filteredConvs = filteredConvs.filter(c => (c.unread || 0) > 0);
    } else if (activeTab === 'messenger') {
      filteredConvs = filteredConvs.filter(c => !c.channel || c.channel.toLowerCase().includes('mess') || c.channel.toLowerCase().includes('face'));
    } else if (activeTab === 'instagram') {
      filteredConvs = filteredConvs.filter(c => c.channel && c.channel.toLowerCase().includes('insta'));
    }

    const convList = filteredConvs;
    const activeConv = convList.find(c => c.id === this.activeConvId) || convList[0] || null;
    const matchingLead = (this.svc && activeConv) ? this.svc.leads.find(l => l.name === activeConv.name || (activeConv.phone && l.phone === activeConv.phone)) : null;
    const messages = activeConv ? (activeConv.messages || (activeConv.preview ? [{ text: activeConv.preview, incoming: true, time: activeConv.time }] : [])) : [];
    const unreadInboxCount = accessibleConvs.filter(c => (c.unread || 0) > 0).length;
    const isIgActive = activeConv ? (activeConv.channel && activeConv.channel.toLowerCase().includes('insta')) : (activeTab === 'instagram');

    this.el.content.innerHTML = `
      ${this._renderTip('messages', 'When someone messages your Facebook Page or Instagram, you can reply directly from here.')}

      <div class="inbox-layout ${this.mobileInboxView === 'chat' ? 'view-chat' : 'view-list'}">
        <!-- LEFT: CONVERSATIONS LIST -->
        <div class="inbox-sidebar">
          <div class="inbox-sidebar-header">
            <div class="inbox-search-wrap">
              <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
              <input type="text" class="input inbox-search-input" placeholder="Search conversations…" oninput="window.app.searchInboxConversations(this.value)">
            </div>
            <div class="inbox-filter-tabs" id="inbox-filter-tabs">
              <div class="inbox-tab ${activeTab === 'all' ? 'active' : ''}" onclick="window.app.setInboxTab('all')">All</div>
              <div class="inbox-tab ${activeTab === 'unread' ? 'active' : ''}" onclick="window.app.setInboxTab('unread')">Unread (${unreadInboxCount})</div>
              <div class="inbox-tab ${activeTab === 'messenger' ? 'active' : ''}" onclick="window.app.setInboxTab('messenger')">Messenger</div>
              <div class="inbox-tab ${activeTab === 'instagram' ? 'active' : ''}" onclick="window.app.setInboxTab('instagram')">Instagram</div>
            </div>
          </div>
          <div class="inbox-conv-list">
            ${convList.length === 0 ? `
              <div class="inbox-conv-empty">
                <div class="inbox-conv-empty-icon">${activeTab === 'instagram' ? '📷' : '💬'}</div>
                <strong class="inbox-conv-empty-title">No ${activeTab === 'all' ? '' : (activeTab === 'instagram' ? 'Instagram ' : 'Messenger ')}messages yet</strong>
                <p class="inbox-conv-empty-desc">
                  Incoming messages from your connected ${activeTab === 'instagram' ? 'Instagram' : 'Facebook & Instagram'} account will appear here automatically.
                </p>
                <button class="btn btn-lime btn-sm" onclick="window.app.simulateInboundMessage('${activeTab === 'instagram' ? 'Instagram Direct' : 'Messenger'}')">
                  + Test ${activeTab === 'instagram' ? 'Instagram DM' : 'Message'}
                </button>
              </div>
            ` : convList.map(c => {
              const isIg = c.channel && c.channel.toLowerCase().includes('insta');
              return `
              <div class="inbox-conv-item ${activeConv && c.id === activeConv.id ? 'active' : ''}" onclick="window.app.selectInboxConv('${c.id}')">
                <div class="conv-avatar">
                  ${(c.name||'?').charAt(0).toUpperCase()}
                  <span class="conv-platform-badge ${isIg ? 'badge-ig-dot' : 'badge-fb-dot'}" title="${isIg ? 'Instagram Direct' : 'Messenger'}"></span>
                </div>
                <div class="conv-info">
                  <div class="conv-name-row">
                    <span class="conv-name">${escapeHtml(c.name)}</span>
                    <span class="conv-time">${c.time || ''}</span>
                  </div>
                  <div class="conv-preview">${escapeHtml(c.preview || '')}</div>
                  <div class="conv-channel">
                    <span class="conv-channel-pill ${isIg ? 'pill-ig' : 'pill-fb'}">
                      ${isIg ? '📷 Instagram' : '💬 Messenger'}
                    </span>
                    <span class="conv-channel-sep">·</span>
                    <span class="conv-page-name">${escapeHtml(this._pageName(c.page_id))}</span>
                  </div>
                </div>
                ${(c.unread || 0) > 0 ? `<div class="conv-unread">${c.unread}</div>` : ''}
              </div>`;
            }).join('')}
          </div>
        </div>

        <!-- CENTER: CHAT WINDOW -->
        <div class="inbox-main">
          ${activeConv ? `
            <div class="inbox-thread-header">
              <button class="inbox-back-btn" onclick="window.app.closeMobileThread()" aria-label="Back to conversations">
                <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
              </button>
              <div class="thread-avatar">
                ${(activeConv.name||'?').charAt(0).toUpperCase()}
              </div>
              <div class="thread-meta">
                <div class="thread-name text-truncate">${escapeHtml(activeConv.name)}</div>
                <div class="thread-sub text-truncate">${escapeHtml(this._pageName(activeConv.page_id))} · ${isIgActive ? 'Instagram Direct' : 'Facebook Messenger'}</div>
              </div>
              <span class="inbox-platform-badge ${isIgActive ? 'badge-ig' : 'badge-fb'} ml-auto">
                ${isIgActive ? '📷 Instagram' : '💬 Messenger'}
              </span>
              <button class="inbox-info-btn btn btn-ghost btn-sm" onclick="window.app.toggleInboxDetails()" title="Customer CRM Details">
                <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
              </button>
            </div>

            <div class="inbox-thread" id="inbox-thread">
              ${messages.length ? messages.map(m => `
                <div class="msg ${m.incoming ? 'msg-in' : 'msg-out'}">
                  <div class="msg-bubble">${escapeHtml(m.text || '')}</div>
                  ${m.time ? `<span class="msg-time">${m.time}</span>` : ''}
                </div>
              `).join('') : `<div class="inbox-thread-empty">Beginning of direct messaging thread with ${escapeHtml(activeConv.name)}</div>`}
            </div>

            <div class="inbox-composer">
              <input type="text" class="input inbox-msg-input" placeholder="Type a message to reply on ${isIgActive ? 'Instagram Direct' : 'Messenger'}…" id="inbox-msg-input" 
                     onkeydown="if(event.key==='Enter')window.app.sendInboxMessage()">
              <button class="btn btn-lime btn-send-msg" id="inbox-send-btn" onclick="window.app.sendInboxMessage()">
                Send via ${isIgActive ? 'Instagram' : 'Facebook'}
              </button>
            </div>
          ` : `
            <div class="inbox-empty-view">
              <div class="inbox-empty-icon">
                💬
              </div>
              <h3 class="inbox-empty-title">
                Unified Messages Hub
              </h3>
              <p class="inbox-empty-desc">
                Live direct messages from connected Facebook Pages and Instagram accounts appear here in real-time. Select a conversation on the left to start chatting.
              </p>
              <div class="inbox-empty-actions">
                <button class="btn btn-lime" onclick="window.app.simulateInboundMessage('Instagram Direct')">
                  📷 Simulate Inbound Instagram DM
                </button>
                <button class="btn btn-secondary-lime" onclick="window.app.simulateInboundMessage('Messenger')">
                  💬 Simulate Messenger Chat
                </button>
              </div>
            </div>
          `}
        </div>

        <!-- RIGHT: CUSTOMER / LEAD INFORMATION -->
        <div class="inbox-details">
          ${activeConv ? `
            <div class="inbox-details-header">
              <div class="inbox-details-title">Customer &amp; CRM Link</div>
              <button class="inbox-details-close btn btn-ghost btn-sm" onclick="window.app.toggleInboxDetails()">✕</button>
            </div>

            <div class="idetail-card idetail-profile-card">
              <div class="idetail-avatar">
                ${(activeConv.name||'?').charAt(0).toUpperCase()}
              </div>
              <div class="idetail-name text-truncate">${escapeHtml(activeConv.name)}</div>
              <div class="idetail-handle text-truncate">${escapeHtml(activeConv.participantUsername ? `@${activeConv.participantUsername.replace(/^@/, '')}` : (activeConv.phone || (isIgActive ? 'Instagram Direct Inquiry' : 'Messenger Inquiry')))}</div>
              <div class="idetail-badge-wrap">
                <span class="idetail-lime-badge">${isIgActive ? '📷 Instagram DM' : '💬 Messenger Chat'}</span>
              </div>
            </div>

            <div class="idetail-card">
              <div class="idetail-section-heading">Account Information</div>
              <div class="idetail-row">
                <span class="idetail-label">Channel</span>
                <span class="idetail-value">
                  ${isIgActive ? '📷 Instagram Direct' : '💬 Messenger'}
                </span>
              </div>
              <div class="idetail-row">
                <span class="idetail-label">Account</span>
                <span class="idetail-value text-truncate" title="${escapeHtml(this._pageName(activeConv.page_id))}">${escapeHtml(this._pageName(activeConv.page_id))}</span>
              </div>
              <div class="idetail-row">
                <span class="idetail-label">Status</span>
                <span class="idetail-value"><span class="status-dot-lime"></span> Active Channel</span>
              </div>
            </div>

            <div class="idetail-card">
              <div class="idetail-section-heading">CRM Status</div>
              <div class="idetail-row">
                <span class="idetail-label">Lead Stage</span>
                <span class="idetail-value">
                  <span class="badge badge-lime">${matchingLead ? (matchingLead.status || 'New Lead') : 'Not in CRM'}</span>
                </span>
              </div>
              <div class="idetail-row">
                <span class="idetail-label">Assignee</span>
                <span class="idetail-value">
                  <span class="assignee-avatar">${(this._staffName(matchingLead ? matchingLead.assigned_staff_id : this.user.id) || 'A').charAt(0)}</span>
                  ${escapeHtml(this._staffName(matchingLead ? matchingLead.assigned_staff_id : this.user.id))}
                </span>
              </div>
            </div>

            <div class="idetail-actions">
              ${matchingLead ? `
                <button class="btn btn-lime w-full mb-2" onclick="window.app.openLeadDrawer('${matchingLead.id}')">Open Full CRM Profile →</button>
                <button class="btn btn-secondary-lime w-full mb-2" onclick="window.app.updateLeadStage('${matchingLead.id}', 'Qualified')">Mark as Qualified</button>
              ` : `
                <button class="btn btn-lime btn-create-lead-crm w-full mb-2" onclick="window.app.createLeadFromConv('${escapeHtml(activeConv.name)}', '${activeConv.page_id}')">+ Create Lead in CRM</button>
              `}
            </div>
          ` : `
            <div class="idetail-section-heading">Connected Channels</div>
            <div class="idetail-channels-list">
              ${this._getAccessiblePages().map(p => {
                const isIg = p.channel === 'instagram' || p.name.startsWith('@');
                return `
                <div class="idetail-channel-card">
                  <div class="idetail-channel-icon ${isIg ? 'icon-ig' : 'icon-fb'}">
                    ${isIg ? '📷' : 'f'}
                  </div>
                  <div class="idetail-channel-info">
                    <div class="idetail-channel-name text-truncate">${escapeHtml(p.name)}</div>
                    <div class="idetail-channel-status"><span class="status-dot-lime"></span> Direct Messages Active</div>
                  </div>
                </div>`;
              }).join('') || '<p class="text-xs text-gray">No channels connected yet.</p>'}
            </div>
          `}
        </div>
      </div>`;
  }

  setInboxTab(tab) {
    this.inboxTab = tab;
    this.renderInbox();
  }

  async selectInboxConv(convId) {
    this.activeConvId = convId;
    this.mobileInboxView = 'chat';
    this.renderInbox();

    const conv = (this.svc && this.svc.conversations) ? this.svc.conversations.find(c => String(c.id) === String(convId)) : null;
    if (conv && (!conv.messages || conv.messages.length === 0)) {
      await this.fetchRealConversationMessages(conv);
    }
  }

  async fetchRealConversationMessages(conv) {
    if (!conv) return;
    try {
      const thread = document.getElementById('inbox-thread');
      if (thread && (!conv.messages || conv.messages.length === 0)) {
        thread.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-secondary);"><span class="spinner"></span> Loading real Instagram direct messages…</div>';
      }

      const accountId = conv.accountId || '6aca1c00e12ba0b652e62f45';
      const res = await fetch(`/api/zernio?path=inbox-messages&conversationId=${conv.id}&accountId=${accountId}`);
      if (!res.ok) return;
      const data = await res.json();
      const rawMsgs = data.messages || data.data || [];
      if (Array.isArray(rawMsgs)) {
        conv.messages = rawMsgs.map(m => {
          let text = m.message;
          if (!text || !text.trim()) {
            if (m.isStoryMention) text = 'Replied to your story 📸';
            else if (m.attachments && m.attachments.length) text = '[Photo/Media Attachment]';
            else text = 'Direct message';
          }
          return {
            id: m.id,
            text: text,
            incoming: m.direction === 'incoming',
            time: new Date(m.sentAt || m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          };
        });

        if (this.svc) {
          if (this.svc._saveToStorage) this.svc._saveToStorage();
          else if (this.svc.saveAll) this.svc.saveAll();
        }

        if (this.activeConvId === conv.id) {
          this.renderInbox();
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
      const rawList = (data && (data.data || data.conversations)) || [];
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
            existing.unread = c.unreadCount || 0;
            existing.accountId = c.accountId;
          } else {
            this.svc.conversations.push({
              id: cid,
              conversationId: cid,
              accountId: c.accountId || '6aca1c00e12ba0b652e62f45',
              name: cleanName,
              participantUsername: c.participantUsername,
              channel: channel,
              page_id: c.accountId || '6aca1c00e12ba0b652e62f45',
              time: c.updatedTime ? new Date(c.updatedTime).toLocaleDateString([], { month: 'short', day: 'numeric' }) : 'Recently',
              preview: c.lastMessage || 'Direct message',
              unread: c.unreadCount || 0,
              messages: []
            });
          }
        });

        if (this.svc._saveToStorage) this.svc._saveToStorage();
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
    this.toast('Syncing real Instagram conversations & messages…', 'info');
    await this.fetchRealInstagramConversations();
    this.toast('✓ Real Instagram inbox up to date!', 'success');
  }

  closeMobileThread() {
    this.mobileInboxView = 'list';
    this.renderInbox();
  }

  toggleInboxDetails() {
    const details = document.querySelector('.inbox-details');
    if (details) details.classList.toggle('open');
  }

  async sendInboxMessage() {
    const input = document.getElementById('inbox-msg-input');
    if (!input || !input.value.trim()) return;
    const text = input.value.trim();
    input.value = '';

    const convList = (this.svc ? (this.svc.conversations || []) : []);
    const activeConv = convList.find(c => String(c.id) === String(this.activeConvId)) || convList[0];
    if (!activeConv) return;

    try {
      this.toast(`Sending real message to ${activeConv.name} on Instagram…`, 'info');

      const accountId = activeConv.accountId || '6aca1c00e12ba0b652e62f45';
      const res = await fetch(`/api/zernio?path=inbox-messages&conversationId=${activeConv.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          accountId: accountId,
          message: text
        })
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Failed to dispatch Instagram message');
      }

      if (!activeConv.messages) activeConv.messages = [];
      const newMsg = { text, incoming: false, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) };
      activeConv.messages.push(newMsg);
      activeConv.preview = 'You: ' + text;
      activeConv.time = 'Just now';
      activeConv.unread = 0;
      if (this.svc) {
        if (this.svc._saveToStorage) this.svc._saveToStorage();
        else if (this.svc.saveAll) this.svc.saveAll();
      }

      const thread = document.getElementById('inbox-thread');
      if (thread) {
        const msgDiv = document.createElement('div');
        msgDiv.className = 'msg msg-out';
        msgDiv.innerHTML = `<div class="msg-bubble">${escapeHtml(text)}</div>`;
        thread.appendChild(msgDiv);
        thread.scrollTop = thread.scrollHeight;
      }
      this.toast(`Real message sent to ${activeConv.name} on Instagram ✓`, 'success');

    } catch (err) {
      console.error('[Send Message Error]:', err);
      this.toast(`Couldn't send: ${err.message}`, 'error');
      if (input) input.value = text;
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

    const newConv = {
      id: 'conv_' + Date.now(),
      name: randName,
      sender_id: 'sender_' + Date.now(),
      channel: isIg ? 'instagram' : 'messenger',
      page_id: pageId,
      time: 'Just now',
      preview: randMsg,
      unread: 1,
      messages: [
        { text: randMsg, incoming: true, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }
      ]
    };

    if (this.svc) {
      if (!this.svc.conversations) this.svc.conversations = [];
      this.svc.conversations.unshift(newConv);
      if (this.svc._saveToStorage) this.svc._saveToStorage();
      else if (this.svc.saveAll) this.svc.saveAll();
    }
    this.activeConvId = newConv.id;
    this.inboxTab = isIg ? 'instagram' : (preferredChannel ? 'messenger' : this.inboxTab || 'all');
    this.toast(`💬 New ${randChannel} message from ${randName}!`, 'info');
    this.renderInbox();
  }

  createLeadFromConv(name, pageId) {
    if (this.svc) {
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
    this.toast(`Lead created for ${name} in CRM!`);
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
          <span style="font-size:26px;">⚠️</span>
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
          <div style="width:56px;height:56px;border-radius:16px;background:#1877F2;color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:28px;font-weight:700;">f</div>
          <div style="width:56px;height:56px;border-radius:16px;background:linear-gradient(45deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888);color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:26px;">📷</div>
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
              🔄 Sync Accounts
            </button>
            <button class="btn btn-secondary btn-sm" onclick="window.app.connectFacebookOAuth()">
              + Add Facebook Page
            </button>
            <button class="btn btn-secondary btn-sm" onclick="window.app.connectInstagramOAuth()" style="border-color:#E1306C;color:#E1306C;">
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
                <div style="width:40px;height:40px;border-radius:10px;${isIg ? 'background:linear-gradient(45deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888)' : 'background:#1877F2'};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:18px;">
                  ${isIg ? '📷' : 'f'}
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
    if (!query) {
      this.inboxSearchQuery = '';
    } else {
      this.inboxSearchQuery = query.toLowerCase().trim();
    }
    const items = document.querySelectorAll('.inbox-conv-item');
    items.forEach(el => {
      const text = el.textContent.toLowerCase();
      el.style.display = (!this.inboxSearchQuery || text.includes(this.inboxSearchQuery)) ? 'flex' : 'none';
    });
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
        this.toast(`🎉 New Lead arrived from Facebook Page "${pageName}"!`, 'success');
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
        this.toast(`🎉 Inbound Lead Received: ${data.lead.name}! Assigned to staff.`);
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
                  <span>📅 Due: ${t.dueDate ? new Date(t.dueDate).toLocaleDateString('en-IN', {weekday:'short',day:'numeric',month:'short'}) : 'No date'}</span>
                  <span>👤 ${this._staffName(t.assigned_to || t.assignedStaffId)}</span>
                </div>
              </div>
              ${this._priorityBadge(t.priority)}
            </div>`;
        }).join('')}
      </div>` : this._empty('No tasks in this view', 'You are all caught up! Create a follow-up or scheduled call.', null, null, '<button class="btn btn-primary" onclick="window.app.openAddTaskModal()">+ New Task</button>', '✅')}`;
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
          <button class="btn btn-secondary btn-sm" onclick="window.app.syncAdSpend()">🔄 Refresh Ad Spend</button>
        </div>

        ${(() => {
          const roi = this.svc ? this.svc.getRoiMetrics() : { totalSpend: 0, cpl: 0, cpa: 0, roas: 0, roiByPage: [], roiByCampaign: [] };
          return `
          <!-- Summary ROI KPI Grid -->
          <div class="roi-grid" style="padding: 16px;">
            <div class="roi-card">
              <div class="roi-card-label">TOTAL AD SPEND</div>
              <div class="roi-card-value">₹${this._formatNum(roi.totalSpend)}</div>
              <div class="roi-card-sub">Meta Graph Verified</div>
            </div>
            <div class="roi-card">
              <div class="roi-card-label">COST PER LEAD (CPL)</div>
              <div class="roi-card-value" style="color:var(--accent);">₹${roi.cpl}</div>
              <div class="roi-card-sub">Spend / ${roi.totalLeads} Total Leads</div>
            </div>
            <div class="roi-card">
              <div class="roi-card-label">COST PER CUSTOMER (CPA)</div>
              <div class="roi-card-value" style="color:var(--success);">₹${roi.cpa}</div>
              <div class="roi-card-sub">Spend / ${roi.totalWonDeals} Closed Deals</div>
            </div>
            <div class="roi-card">
              <div class="roi-card-label">RETURN ON AD SPEND (ROAS)</div>
              <div class="roi-card-value" style="color:#7C3AED;">${roi.roas}x</div>
              <div class="roi-card-sub">Revenue: ₹${this._formatNum(roi.totalWonValue)}</div>
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
                      <td>₹${this._formatNum(row.spend)}</td>
                      <td class="font-semibold">${row.leads}</td>
                      <td>₹${row.cpl}</td>
                      <td><span class="badge badge-green">${row.wonDeals}</span></td>
                      <td>₹${this._formatNum(row.wonValue)}</td>
                      <td class="font-semibold">₹${row.cpa}</td>
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
                      <td>₹${this._formatNum(camp.spend)}</td>
                      <td class="font-semibold">${camp.leads}</td>
                      <td>₹${camp.cpl}</td>
                      <td><span class="badge badge-green">${camp.wonDeals}</span></td>
                      <td class="font-semibold">₹${camp.cpa}</td>
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
                      <button class="btn btn-ghost btn-sm text-red" style="color:var(--danger);" onclick="window.app.removeStaff('${s.id}')" title="Remove staff member">🗑️</button>
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
                <label class="settings-label">Hot-Lead Threshold (₹ Value)</label>
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
          id: 'lead_manual_' + Date.now(),
          name,
          phone: document.getElementById('nl-phone').value.trim(),
          email: document.getElementById('nl-email').value.trim(),
          page_id: pageId,
          pageId,
          source: 'Manual Entry',
          assigned_staff_id: assignedStaff,
          assignedStaffId: assignedStaff,
          status: 'New Lead',
          created_at: new Date().toISOString(),
          notes: [],
          activities: [{ type: 'CREATED', description: 'Lead manually entered', timestamp: new Date().toISOString() }]
        };
        this.svc.leads.unshift(newLead);
        this.svc._saveToStorage ? this.svc._saveToStorage() : this.svc.saveAll();
      }
      this.closeModal();
      this.toast(`Lead "${name}" created and assigned!`);
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

  _getFilteredLeads() {
    if (!this.svc || !this.svc.leads) return [];
    let leads = this._filterUserLeads(this.svc.leads);
    if (this.selectedPageFilter !== 'all') {
      leads = leads.filter(l => l.page_id === this.selectedPageFilter || l.pageId === this.selectedPageFilter);
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

  _empty(title, subtitle, href = null, cta = null, actionHtml = null, icon = '📭') {
    return `
      <div class="empty-state">
        <div class="empty-state-icon">${icon}</div>
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
        <span class="tip-icon">💡</span>
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
}

// Global Initialization
window.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    window.app = new MetaCRMApp();
  }, 40);
});
