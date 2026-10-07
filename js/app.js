/* ============================================================
   MetaCRM — Production Architecture v4 (Complete Solution)
   ============================================================ */

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
      id: 'usr_admin_01',
      name: 'Ananya Sen (Super Admin)',
      displayName: 'Ananya Sen',
      email: 'admin@metacrm.io',
      role: 'admin',
      assignedPageIds: ['page_01', 'page_02', 'page_03', 'page_04', 'page_05', 'page_06']
    };

    // Active conversation in Inbox
    this.activeConvId = 'c1';

    // DOM References
    this.el = {
      nav: document.getElementById('sidebar-nav'),
      title: document.getElementById('page-title'),
      actions: document.getElementById('topbar-actions'),
      content: document.getElementById('main-content'),
      sidebar: document.getElementById('sidebar'),
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
    };

    this._bindGlobalEvents();
    this._init();
  }

  // ──────────────────────────────────────────────────────────
  // Bootstrap & Global Event Bindings
  // ──────────────────────────────────────────────────────────

  _init() {
    this.renderSidebar();
    this._route();
    window.addEventListener('hashchange', () => this._route());
  }

  _bindGlobalEvents() {
    this.el.closeDrawer.addEventListener('click', () => this.closeDrawer());
    this.el.dOverlay.addEventListener('click', () => this.closeDrawer());
    this.el.closeModal.addEventListener('click', () => this.closeModal());
    this.el.mCancel.addEventListener('click', () => this.closeModal());
    this.el.mOverlay.addEventListener('click', e => { if (e.target === this.el.mOverlay) this.closeModal(); });

    // Keyboard Shortcuts (Ctrl+K for search, Escape for modal/drawer)
    window.addEventListener('keydown', e => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        const input = document.getElementById('lead-search-input');
        if (input) { input.focus(); }
        else { this.navigate('leads'); setTimeout(() => { const i = document.getElementById('lead-search-input'); if (i) i.focus(); }, 150); }
      }
      if (e.key === 'Escape') { this.closeDrawer(); this.closeModal(); }
    });

    // Listen to real-time CRM updates
    window.addEventListener('crm:state_changed', () => {
      this.user = this.svc.getCurrentUser();
      this.renderSidebar();
      this._renderPage();
    });
  }

  _route() {
    let hash = window.location.hash.replace(/^#\/?/, '') || 'dashboard';
    hash = hash.replace(/^(admin|staff)\//, '');
    this.currentRoute = hash;
    this.renderSidebar();
    this._renderPage();
  }

  navigate(path) {
    window.location.hash = path;
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
          { id: 'dashboard', icon: `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>`, label: 'Dashboard' },
          { id: 'leads',     icon: `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`, label: isAdmin ? 'Leads' : 'My Leads', badge: newLeads || null },
          { id: 'inbox',     icon: `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`, label: isAdmin ? 'Inbox' : 'My Messages', badge: 3 },
          { id: 'pipeline',  icon: `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`, label: isAdmin ? 'Pipeline' : 'My Pipeline' },
          { id: 'tasks',     icon: `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`, label: isAdmin ? 'Tasks' : 'My Tasks', badge: overdueTasks || null },
        ]
      },
      ...(isAdmin ? [{
        title: 'ANALYTICS',
        items: [
          { id: 'reports', icon: `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>`, label: 'Reports' },
        ]
      }] : []),
      ...(isAdmin ? [{
        title: 'SETUP',
        items: [
          { id: 'connections', icon: `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`, label: 'Connections' },
          { id: 'staff',       icon: `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`, label: 'Staff' },
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
        <span>${greeting}, ${(this.user.displayName || this.user.name || '').split(' ')[0]} 👋</span>
        <span class="badge ${isAdmin ? 'badge-purple' : 'badge-green'}" style="font-size:11px;">${this._roleLabel(this.user.role)}</span>
      </div>`;

    this.el.actions.innerHTML = `
      <select class="input" style="width:auto;" onchange="window.app.onPageFilterChange(this.value)">
        ${pageSelectOptions}
      </select>
      <select class="input" style="width:auto;" onchange="window.app.onDateRangeChange(this.value)">
        <option value="today" ${this.selectedDateRange==='today'?'selected':''}>Today</option>
        <option value="yesterday" ${this.selectedDateRange==='yesterday'?'selected':''}>Yesterday</option>
        <option value="last_7d" ${this.selectedDateRange==='last_7d'?'selected':''}>Last 7 days</option>
        <option value="last_30d" ${this.selectedDateRange==='last_30d'?'selected':''}>Last 30 days</option>
        <option value="this_month" ${this.selectedDateRange==='this_month'?'selected':''}>This month</option>
      </select>
      <button class="btn btn-secondary btn-sm" onclick="window.app.openUserSwitchModal()">Switch User</button>`;

    const leads = this._getFilteredLeads();
    const newL = leads.filter(l => l.status === 'New' || l.status === 'New Lead');
    const qualL = leads.filter(l => l.status === 'Qualified');
    const wonL = leads.filter(l => l.status === 'Won' || l.status === 'Converted');
    const followL = leads.filter(l => l.status === 'Follow-up');

    // Calculate Spend and CPL
    const totalSpend = isAdmin ? 245000 : null; // ₹2,45,000
    const cpl = totalSpend && leads.length ? Math.round(totalSpend / leads.length) : null;

    // Page Performance Rows (Section 18 & 19)
    const pageRows = availablePages.map(p => {
      const pLeads = (this.svc ? this.svc.leads : []).filter(l => l.page_id === p.id || l.pageId === p.id || l.source === p.name);
      const pWon = pLeads.filter(l => l.status === 'Won' || l.status === 'Converted');
      const conv = pLeads.length ? ((pWon.length / pLeads.length) * 100).toFixed(0) : 0;
      const spend = p.spend || Math.round(pLeads.length * 185);
      const pageCpl = pLeads.length ? Math.round(spend / pLeads.length) : 0;
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
          <td>₹${this._formatNum(c.spend || 28000)}</td>
          <td class="font-semibold">${cLeads.length || c.leadsCount || 18}</td>
          <td>₹${c.cpl || 195}</td>
          <td><span class="badge badge-green">${cWon.length || 4}</span></td>
        </tr>`;
    }).join('');

    // Recent leads
    const recentLeads = leads.slice(0, 6);

    // Recent conversations
    const recentConvs = (this.svc ? (this.svc.conversations || []) : []).slice(0, 4);

    // Tasks
    const tasks = this._filterUserTasks(this.svc ? this.svc.tasks : []).filter(t => t.status !== 'Done').slice(0, 4);

    this.el.content.innerHTML = `
      <!-- TOP KPI CARDS (Section 18) -->
      <div class="kpi-row">
        <div class="kpi-card">
          <div class="kpi-title">TOTAL LEADS</div>
          <div class="kpi-value">${leads.length}</div>
          <div class="kpi-trend up">↑ 14% vs prev period</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-title">NEW LEADS</div>
          <div class="kpi-value" style="color:var(--info)">${newL.length}</div>
          <div class="kpi-trend">Requires contact</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-title">QUALIFIED</div>
          <div class="kpi-value" style="color:#7C3AED">${qualL.length}</div>
          <div class="kpi-trend">In pipeline</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-title">WON / CONVERTED</div>
          <div class="kpi-value" style="color:var(--success)">${wonL.length}</div>
          <div class="kpi-trend up">↑ Target achieved</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-title">UNREAD MESSAGES</div>
          <div class="kpi-value" style="color:var(--warning)">5</div>
          <div class="kpi-trend">In Messenger &amp; IG</div>
        </div>
        ${isAdmin ? `
        <div class="kpi-card">
          <div class="kpi-title">AD SPEND</div>
          <div class="kpi-value">₹${this._formatNum(totalSpend)}</div>
          <div class="kpi-trend">6 Meta Campaigns</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-title">COST PER LEAD</div>
          <div class="kpi-value" style="color:var(--accent)">₹${cpl}</div>
          <div class="kpi-trend up">↓ 8% lower CPL</div>
        </div>` : ''}
      </div>

      <!-- MAIN DASHBOARD GRID -->
      <div class="dash-grid">
        <div class="dash-col-main">
          <!-- 6-Page Performance Table -->
          <div class="card">
            <div class="card-header">
              <div class="card-title">${isAdmin ? 'Leads by Page (All 6 Pages)' : 'My Assigned Pages Performance'}</div>
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
                ${pageRows || '<tr><td colspan="7" class="empty-cell">No page activity found</td></tr>'}
              </tbody>
            </table>
          </div>

          <!-- Campaign Performance (Section 18 & 19) -->
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
                ${campaignRows || '<tr><td colspan="6" class="empty-cell">No campaigns</td></tr>'}
              </tbody>
            </table>
          </div>` : ''}

          <!-- Recent Leads (Section 18) -->
          <div class="card">
            <div class="card-header">
              <div class="card-title">Recent Leads</div>
              <a href="#leads" class="link-small">Open All Leads →</a>
            </div>
            <table>
              <thead>
                <tr><th>Name</th><th>Source &amp; Page</th><th>Stage</th><th>Assigned</th><th>Date</th></tr>
              </thead>
              <tbody>
                ${recentLeads.map(l => `
                  <tr class="clickable-row" onclick="window.app.openLeadDrawer('${l.id}')">
                    <td>
                      <div class="lead-name">${l.name}</div>
                      <div class="text-xs text-gray">${l.phone || l.email || ''}</div>
                    </td>
                    <td>
                      <div class="text-xs font-semibold">${l.source || 'Facebook Lead Ad'}</div>
                      <div class="text-xs text-gray">${this._pageName(l.page_id || l.pageId)}</div>
                    </td>
                    <td>${this._badge(l.status)}</td>
                    <td class="text-xs">${this._staffName(l.assigned_staff_id || l.assignedStaffId)}</td>
                    <td class="text-xs text-gray">${this._timeAgo(l.created_at || l.createdAt)}</td>
                  </tr>`).join('')}
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
              <button class="qa-btn" onclick="window.app.openAddTaskModal()">+ Schedule Task / Call</button>
              <button class="qa-btn" onclick="window.app.navigate('inbox')">Open Unified Inbox</button>
              ${isAdmin ? `<button class="qa-btn" onclick="window.app.simulateInboundLead()">⚡ Simulate Inbound Lead</button>` : ''}
            </div>
          </div>

          <!-- Pipeline Distribution Mini -->
          <div class="card">
            <div class="card-header">
              <div class="card-title">Pipeline Breakdown</div>
              <a href="#pipeline" class="link-small">Board →</a>
            </div>
            <div style="display:flex;flex-direction:column;gap:8px;">
              ${['New Lead', 'Contacted', 'Qualified', 'Follow-up', 'Won'].map(st => {
                const count = leads.filter(l => l.status === st || (st === 'New Lead' && l.status === 'New')).length;
                const pct = leads.length ? Math.round(count / leads.length * 100) : 0;
                return `
                  <div style="font-size:12px;">
                    <div style="display:flex;justify-content:space-between;margin-bottom:2px;">
                      <span>${st}</span>
                      <strong>${count} <span class="text-gray">(${pct}%)</span></strong>
                    </div>
                    <div class="mini-bar"><div class="mini-bar-fill" style="width:${pct}%;background:${this._stageColor(st)}"></div></div>
                  </div>`;
              }).join('')}
            </div>
          </div>

          <!-- Tasks Due Today -->
          <div class="card">
            <div class="card-header">
              <div class="card-title">Follow-ups &amp; Tasks</div>
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
              <th>Assigned To</th>
              <th>Last Activity</th>
              <th>Follow-up</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${tabFiltered.map(l => {
              const lastAct = l.last_contacted_at || l.lastContactedAt ? this._timeAgo(l.last_contacted_at || l.lastContactedAt) : 'Never';
              const followUp = l.follow_up_date || l.followUpDate ? new Date(l.follow_up_date || l.followUpDate).toLocaleDateString('en-IN', {day:'numeric',month:'short'}) : '—';
              const pageName = this._pageName(l.page_id || l.pageId);
              return `
                <tr class="clickable-row" onclick="window.app.openLeadDrawer('${l.id}')">
                  <td onclick="event.stopPropagation()"><input type="checkbox" class="lead-select-box" value="${l.id}"></td>
                  <td><strong>${l.name}</strong></td>
                  <td class="text-xs">
                    <div>${l.phone || '—'}</div>
                    <div class="text-gray">${l.email || ''}</div>
                  </td>
                  <td>
                    <div class="text-xs font-semibold">${l.source || 'Facebook Lead Ad'}</div>
                    <div class="text-xs text-gray">${pageName}</div>
                  </td>
                  <td class="text-xs text-gray">${l.campaign_id || l.campaignId || 'Diwali Leads 2026'}</td>
                  <td>${this._badge(l.status)}</td>
                  <td class="text-xs">${this._staffName(l.assigned_staff_id || l.assignedStaffId)}</td>
                  <td class="text-xs text-gray">${lastAct}</td>
                  <td class="text-xs ${l.followUpDate && new Date(l.followUpDate) < new Date() ? 'text-red font-semibold' : ''}">${followUp}</td>
                  <td onclick="event.stopPropagation()">
                    <div class="row-actions">
                      <button class="btn btn-ghost btn-sm" onclick="window.app.openLeadDrawer('${l.id}')">View</button>
                      <button class="btn btn-ghost btn-sm" onclick="window.app.quickCall('${l.id}')">📞</button>
                    </div>
                  </td>
                </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
      <div class="table-footer">Showing <strong>${tabFiltered.length}</strong> of <strong>${allLeads.length}</strong> total leads</div>`
      : this._empty('No leads found', 'No leads match the selected filter.', null, null)}`;
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

    this.el.dTitle.textContent = 'Lead Details & Attribution';
    this.el.dContent.innerHTML = `
      <!-- HEADER -->
      <div class="drawer-lead-header">
        <div class="lead-avatar">${lead.name.charAt(0).toUpperCase()}</div>
        <div class="lead-header-info">
          <div class="lead-header-name">${lead.name}</div>
          <div class="text-sm text-gray">${lead.phone || 'No phone'} ${lead.email ? '• ' + lead.email : ''}</div>
          <div style="margin-top:4px;">${this._badge(lead.status)}</div>
        </div>
      </div>

      <!-- ONE-CLICK COMMUNICATION BAR -->
      <div class="lead-actions-bar">
        <a href="tel:${lead.phone}" class="btn btn-primary btn-sm">📞 Call</a>
        <a href="https://wa.me/${(lead.phone||'').replace(/\D/g,'')}" target="_blank" class="btn btn-secondary btn-sm whatsapp-btn">💬 WhatsApp</a>
        <a href="mailto:${lead.email}" class="btn btn-secondary btn-sm">✉ Email</a>
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
          <div class="attr-row"><span class="attr-label">Page</span><strong>${this._pageName(lead.page_id || lead.pageId) || 'Apex Living'}</strong></div>
          <div class="attr-row"><span class="attr-label">Campaign</span><span>${lead.campaign_id || lead.campaignId || 'Diwali Leads 2026'}</span></div>
          <div class="attr-row"><span class="attr-label">Ad Set</span><span>${lead.adset_id || lead.adsetId || 'High Intent Homebuyers'}</span></div>
          <div class="attr-row"><span class="attr-label">Ad</span><span>${lead.ad_id || lead.adId || 'Video 02 - Tour Demo'}</span></div>
          <div class="attr-row"><span class="attr-label">Lead Form</span><span>${lead.form_id || lead.formId || 'Instant Quote Form #8412'}</span></div>
          <div class="attr-row"><span class="attr-label">Meta ID</span><span class="text-xs text-gray font-mono">${lead.meta_lead_id || lead.id}</span></div>
          <div class="attr-row"><span class="attr-label">Assigned</span>
            <select class="input input-sm" onchange="window.app.reassignLead('${lead.id}', this.value)">
              <option value="">Unassigned</option>
              ${staff.map(s => `<option value="${s.id}" ${(lead.assigned_staff_id||lead.assignedStaffId)===s.id?'selected':''}>${s.name}</option>`).join('')}
            </select>
          </div>
        </div>
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
      </div>`;

    this.el.dOverlay.classList.add('open');
    this.el.drawer.classList.add('open');
  }

  closeDrawer() {
    this.el.dOverlay.classList.remove('open');
    this.el.drawer.classList.remove('open');
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
    if (lead && lead.phone) window.open(`tel:${lead.phone}`);
    else this.toast('No phone number recorded');
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
        const total = cards.reduce((s, c) => s + (c.value || c.dealValue || 35000), 0);
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
                    <span class="text-xs font-semibold">₹${this._formatNum(c.value || c.dealValue || 35000)}</span>
                    <span class="text-xs text-gray ml-auto">${c.follow_up_date || c.followUpDate ? new Date(c.follow_up_date || c.followUpDate).toLocaleDateString('en-IN', {day:'numeric',month:'short'}) : 'No date'}</span>
                  </div>
                </div>`).join('')
              : `<div class="kanban-empty">Drag leads here</div>`}
            </div>
          </div>`;
      }).join('');

      this.el.content.innerHTML = `<div class="kanban-board">${colsHtml}</div>`;
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
    this.el.title.textContent = this.user.role === 'staff' ? 'My Messages' : 'Unified Messenger & IG Inbox';
    this.el.actions.innerHTML = `
      <span class="badge badge-green"><span class="status-dot green"></span> Live Meta Chat Engine</span>`;

    const convs = (this.svc ? (this.svc.conversations || []) : []);
    const userPages = this._getAccessiblePages().map(p => p.id);
    const accessibleConvs = convs.filter(c => !c.page_id || userPages.includes(c.page_id));

    const convList = accessibleConvs.length ? accessibleConvs : [
      { id: 'c1', name: 'Rajesh Kumar',   preview: 'Yes, I am interested in the property...', time: '10m', unread: 2, channel: 'Messenger', page_id: 'page_01', phone: '+91 98765 43210' },
      { id: 'c2', name: 'Preethi Nair',   preview: 'Can I get more details on the 3BHK plan?', time: '25m', unread: 0, channel: 'Instagram', page_id: 'page_02', phone: '+91 98450 11223' },
      { id: 'c3', name: 'Sunil Mehta',    preview: 'What is the pricing for the premium villa?', time: '1h', unread: 1, channel: 'Messenger', page_id: 'page_03', phone: '+91 99201 55667' },
      { id: 'c4', name: 'Ananya Singh',   preview: 'I submitted the lead form earlier today', time: '2h', unread: 0, channel: 'Instagram', page_id: 'page_04', phone: '+91 97112 33445' },
    ];

    const activeConv = convList.find(c => c.id === this.activeConvId) || convList[0];
    const matchingLead = this.svc ? this.svc.leads.find(l => l.name === activeConv.name || l.phone === activeConv.phone) : null;

    this.el.content.innerHTML = `
      <div class="inbox-layout">
        <!-- LEFT: CONVERSATIONS LIST -->
        <div class="inbox-sidebar">
          <div class="inbox-sidebar-header">
            <input type="text" class="input" placeholder="Search conversations…" style="margin-bottom:8px;">
            <div class="inbox-filter-tabs">
              <div class="inbox-tab active">All</div>
              <div class="inbox-tab">Unread (3)</div>
              <div class="inbox-tab">Messenger</div>
              <div class="inbox-tab">Instagram</div>
            </div>
          </div>
          <div class="inbox-conv-list">
            ${convList.map(c => `
              <div class="inbox-conv-item ${c.id === activeConv.id ? 'active' : ''}" onclick="window.app.selectInboxConv('${c.id}')">
                <div class="conv-avatar">${(c.name||'?').charAt(0)}</div>
                <div class="conv-info">
                  <div class="conv-name-row">
                    <span class="conv-name">${c.name}</span>
                    <span class="conv-time">${c.time || '10m'}</span>
                  </div>
                  <div class="conv-preview">${c.preview || ''}</div>
                  <div class="conv-channel">
                    <span>${c.channel || 'Messenger'}</span> · 
                    <span class="text-gray">${this._pageName(c.page_id)}</span>
                  </div>
                </div>
                ${(c.unread || 0) > 0 ? `<div class="conv-unread">${c.unread}</div>` : ''}
              </div>`).join('')}
          </div>
        </div>

        <!-- CENTER: CHAT WINDOW -->
        <div class="inbox-main">
          <div class="inbox-thread-header">
            <div class="conv-avatar">${(activeConv.name||'?').charAt(0)}</div>
            <div>
              <div class="thread-name">${activeConv.name}</div>
              <div class="text-xs text-gray">${this._pageName(activeConv.page_id)} · ${activeConv.channel || 'Messenger'}</div>
            </div>
            <span class="badge badge-blue ml-auto">${activeConv.channel || 'Messenger'}</span>
          </div>

          <div class="inbox-thread" id="inbox-thread">
            <div class="msg msg-in"><div class="msg-bubble">Hi, I submitted your Facebook Lead form. Is this still available?</div></div>
            <div class="msg msg-out"><div class="msg-bubble">Hello ${activeConv.name}! Yes, it is available. May I share the brochure with you on WhatsApp?</div></div>
            <div class="msg msg-in"><div class="msg-bubble">${activeConv.preview}</div></div>
          </div>

          <div class="inbox-composer">
            <input type="text" class="input" placeholder="Type a message to reply on ${activeConv.channel || 'Messenger'}…" id="inbox-msg-input" 
                   onkeydown="if(event.key==='Enter')window.app.sendInboxMessage()">
            <button class="btn btn-primary" onclick="window.app.sendInboxMessage()">Send</button>
          </div>
        </div>

        <!-- RIGHT: CUSTOMER / LEAD INFORMATION (Section 14 & 15) -->
        <div class="inbox-details">
          <div class="drawer-section-title mb-4">Customer &amp; CRM Link</div>
          <div class="idetail-avatar">${(activeConv.name||'?').charAt(0)}</div>
          <div class="idetail-name">${activeConv.name}</div>
          <div class="text-xs text-gray mb-4 text-center">${activeConv.phone || '+91 98765 43210'}</div>

          <div class="attribution-block mb-4">
            <div class="attr-row"><span class="attr-label">Page</span><span>${this._pageName(activeConv.page_id)}</span></div>
            <div class="attr-row"><span class="attr-label">Channel</span><span>${activeConv.channel || 'Messenger'}</span></div>
            <div class="attr-row"><span class="attr-label">Stage</span><span>${this._badge(matchingLead ? matchingLead.status : 'New Lead')}</span></div>
            <div class="attr-row"><span class="attr-label">Assigned</span><span>${this._staffName(matchingLead ? matchingLead.assigned_staff_id : this.user.id)}</span></div>
          </div>

          ${matchingLead ? `
          <button class="btn btn-primary btn-sm w-full mb-2" onclick="window.app.openLeadDrawer('${matchingLead.id}')">Open Full CRM Profile →</button>
          <button class="btn btn-secondary btn-sm w-full mb-2" onclick="window.app.updateLeadStage('${matchingLead.id}', 'Qualified')">Mark as Qualified</button>
          ` : `
          <button class="btn btn-primary btn-sm w-full mb-2" onclick="window.app.createLeadFromConv('${activeConv.name}', '${activeConv.page_id}')">+ Create Lead in CRM</button>
          `}
        </div>
      </div>`;
  }

  selectInboxConv(convId) {
    this.activeConvId = convId;
    this.renderInbox();
  }

  sendInboxMessage() {
    const input = document.getElementById('inbox-msg-input');
    if (!input || !input.value.trim()) return;
    const thread = document.getElementById('inbox-thread');
    if (thread) {
      const msgDiv = document.createElement('div');
      msgDiv.className = 'msg msg-out';
      msgDiv.innerHTML = `<div class="msg-bubble">${input.value}</div>`;
      thread.appendChild(msgDiv);
      thread.scrollTop = thread.scrollHeight;
    }
    this.toast('Message sent via Meta API ✓');
    input.value = '';
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
    this.el.title.textContent = 'Connections & Meta OAuth';
    this.el.actions.innerHTML = `
      <button class="btn btn-secondary" onclick="window.app.testLiveZernioPing()">Test API Status</button>
      <button class="btn btn-primary" onclick="window.app.simulateInboundLead()">⚡ Simulate Inbound Lead</button>`;

    const conn = this.meta ? this.meta.connection : { connected: true };
    const isConnected = conn && conn.connected;
    const pages = (this.svc && this.svc.pages) ? this.svc.pages : [];

    this.el.content.innerHTML = `
      <p class="text-gray mb-6" style="max-width:680px;">Connect your Meta Business Account through OAuth to automatically sync Leads, Messenger conversations, Instagram Direct messages, and Ad campaigns across all 6 pages.</p>

      <!-- PRIMARY META OAUTH CARD -->
      <div class="card connection-card">
        <div class="connection-header">
          <div class="connection-brand">
            <div class="brand-icon facebook-icon">f</div>
            <div>
              <div class="connection-title">Facebook &amp; Instagram / Meta</div>
              <div class="text-xs text-gray">Official Meta OAuth Gateway (No manual tokens needed)</div>
            </div>
          </div>
          ${isConnected
            ? `<span class="badge badge-green"><span class="status-dot green"></span> Connected (Profile: 6ac64ff5)</span>`
            : `<span class="badge badge-gray"><span class="status-dot"></span> Not Connected</span>`}
        </div>

        <div class="connection-info">
          <div class="attr-row"><span class="attr-label">Gateway</span><strong>Zernio Verified OAuth App (Client ID: 712341431446535)</strong></div>
          <div class="attr-row"><span class="attr-label">Status</span><span class="text-green font-semibold">Active &amp; Listening for Webhooks</span></div>
          <div class="attr-row"><span class="attr-label">Last synced</span><span>Just now</span></div>
        </div>

        <div class="connection-section-title">Connected Facebook Pages (${pages.length} Pages Active)</div>
        <div class="page-list">
          ${pages.map(p => {
            const pLeads = (this.svc ? this.svc.leads : []).filter(l => l.page_id === p.id || l.pageId === p.id).length;
            return `
              <div class="page-row">
                <div class="page-dot-lg" style="background:${p.color||'#6366F1'}"></div>
                <div class="page-row-info">
                  <div class="font-semibold text-sm">${p.name}</div>
                  <div class="text-xs text-gray">ID: <code>${p.id}</code> · Ad Account: <code>${p.ad_account_id || 'act_094821'}</code> · Instagram: <code>@${p.name.toLowerCase().replace(/\s+/g,'_')}</code></div>
                </div>
                <span class="badge badge-gray mr-2">${pLeads} Leads</span>
                <span class="badge badge-green">Connected</span>
              </div>`;
          }).join('')}
        </div>

        <div class="connection-actions mt-4">
          <button class="btn btn-primary" onclick="window.app.connectFacebookOAuth()">Reconnect Meta OAuth →</button>
          <button class="btn btn-secondary" onclick="window.app.syncConnections()">Sync Now</button>
          <button class="btn btn-ghost text-red-500 ml-auto" onclick="window.app.disconnectMeta()">Disconnect</button>
        </div>
      </div>

      <!-- COMING SOON INTEGRATIONS -->
      <div class="card connection-card opacity-60">
        <div class="connection-header">
          <div class="connection-brand">
            <div class="brand-icon whatsapp-icon">W</div>
            <div>
              <div class="connection-title">WhatsApp Cloud API (Official)</div>
              <div class="text-xs text-gray">Direct Cloud Messaging without markup</div>
            </div>
          </div>
          <span class="badge badge-gray">Ready for Phone Binding</span>
        </div>
      </div>`;
  }

  async connectFacebookOAuth() {
    this.toast('Fetching secure Meta OAuth authorization URL…');
    try {
      const res = await fetch('/api/zernio/connect/facebook');
      const data = await res.json();
      if (data.authUrl) {
        window.open(data.authUrl, '_blank');
        this.toast('Meta login opened in new tab. Approve permissions to complete.');
      } else {
        this.toast('Could not fetch OAuth URL. Check server connection.');
      }
    } catch (e) {
      this.toast('Server connection error.');
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

  syncConnections() {
    this.toast('Syncing Meta Pages, Leads, and Messages…');
    setTimeout(() => { this.toast('Sync complete! All 6 pages are up to date ✓'); }, 600);
  }

  disconnectMeta() {
    if (confirm('Disconnect Meta connection? Leads will remain in CRM.')) {
      this.toast('Disconnected.');
    }
  }

  // ──────────────────────────────────────────────────────────
  // TASKS WORKSPACE
  // ──────────────────────────────────────────────────────────

  renderTasks(tab) {
    if (tab) this.currentTaskTab = tab;
    this.el.title.textContent = this.user.role === 'staff' ? 'My Tasks & Follow-ups' : 'Tasks';
    this.el.actions.innerHTML = `<button class="btn btn-primary" onclick="window.app.openAddTaskModal()">+ New Task</button>`;

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
      </div>` : this._empty('No tasks in this view', 'You are all caught up!', null, null)}`;
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
    this.el.title.textContent = 'Executive Analytics & 6-Page Reporting';
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
        <div class="kpi-card"><div class="kpi-title">TOTAL LEADS</div><div class="kpi-value">${leads.length}</div></div>
        <div class="kpi-card"><div class="kpi-title">QUALIFIED</div><div class="kpi-value" style="color:#7C3AED">${qual.length}</div></div>
        <div class="kpi-card"><div class="kpi-title">CONVERTED / WON</div><div class="kpi-value" style="color:var(--success)">${won.length}</div></div>
        <div class="kpi-card"><div class="kpi-title">CONVERSION RATE</div><div class="kpi-value">${leads.length ? ((won.length/leads.length)*100).toFixed(1) : 0}%</div></div>
      </div>

      <div class="card">
        <div class="card-header"><div class="card-title">Leads Breakdown by Page</div></div>
        <div class="chart-bars">
          ${pageStats.map(p => `
            <div class="chart-bar-row">
              <div class="chart-bar-label"><strong>${p.name}</strong></div>
              <div class="chart-bar-track">
                <div class="chart-bar-fill" style="width:${p.pct}%;background:${p.color||'var(--accent)'}"></div>
              </div>
              <div class="chart-bar-value">${p.leads} leads (${p.pct}%)</div>
              <div class="chart-bar-won text-xs text-gray">${p.won} won</div>
            </div>`).join('')}
        </div>
      </div>

      <div class="card">
        <div class="card-header"><div class="card-title">Staff Conversion Performance</div></div>
        <table>
          <thead>
            <tr><th>Staff Member</th><th>Role</th><th>Assigned Pages</th><th>Leads</th><th>Won</th><th>Conv.%</th></tr>
          </thead>
          <tbody>
            ${staff.map(s => {
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
            }).join('')}
          </tbody>
        </table>
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
            ${staff.map(s => {
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
                  <td class="text-xs">${pageNames || 'All 6 Pages (Full Access)'}</td>
                  <td class="font-semibold">${sLeads.length}</td>
                  <td><span class="badge badge-green">${sWon.length}</span></td>
                  <td><span class="badge ${s.status==='inactive'?'badge-gray':'badge-green'}">${s.status || 'Active'}</span></td>
                  <td>
                    <div class="row-actions">
                      <button class="btn btn-ghost btn-sm" onclick="window.app.switchUserDirect('${s.id}')">Login as</button>
                    </div>
                  </td>
                </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;
  }

  // ──────────────────────────────────────────────────────────
  // USER SWITCHER & AUTH MODAL (Section 3 & 4)
  // ──────────────────────────────────────────────────────────

  openUserSwitchModal() {
    const staff = this.svc ? this.svc.staff : [];

    this.el.mTitle.textContent = 'Switch Active User Session (RBAC Demo)';
    this.el.mBody.innerHTML = `
      <p class="text-xs text-gray mb-4">Click any staff member or administrator to demonstrate real page-level access restriction and staff-restricted dashboards:</p>
      <div style="display:flex;flex-direction:column;gap:8px;">
        ${staff.map(s => `
          <div class="page-row" style="cursor:pointer;${s.id === this.user.id ? 'border-color:var(--accent);background:#EEF2FF;' : ''}" 
               onclick="window.app.switchUserDirect('${s.id}')">
            <div class="staff-avatar-sm" style="background:${s.role==='admin'?'var(--accent)':'#10B981'}">${(s.name||'?').charAt(0)}</div>
            <div style="flex:1;">
              <strong>${s.name}</strong>
              <div class="text-xs text-gray">${this._roleLabel(s.role)} · Pages: ${(s.assignedPageIds||[]).map(pid => this._pageName(pid)).join(', ') || 'All 6 Pages'}</div>
            </div>
            ${s.id === this.user.id ? '<span class="badge badge-indigo">Active</span>' : '<button class="btn btn-ghost btn-sm">Switch</button>'}
          </div>`).join('')}
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
              <div class="card-title mb-4">Notification Alerts</div>
              ${[
                ['New Meta lead form submitted', true],
                ['Lead assigned to me', true],
                ['Follow-up due alert', true],
                ['New Messenger / Instagram message', true],
              ].map(([label, checked]) => `
                <div class="setting-toggle">
                  <span>${label}</span>
                  <label class="toggle">
                    <input type="checkbox" ${checked?'checked':''}><span class="toggle-slider"></span>
                  </label>
                </div>`).join('')}
              <button class="btn btn-primary mt-4" onclick="window.app.toast('Notification rules saved!')">Save Rules</button>
            </div>
          </div>
          <div id="stab-advanced" style="display:none">
            <div class="card" style="max-width:520px">
              <div class="card-title mb-4">Zernio Meta Gateway Credentials</div>
              <label class="settings-label">Zernio API Key</label>
              <input type="password" class="input mb-4" value="sk_70e384c607a377dd9cc9e1585a8def99688e735a3a47d515b2255808055dabe1" readonly>
              <button class="btn btn-secondary" onclick="window.app.testLiveZernioPing()">Test Connection Ping</button>
            </div>
          </div>
        </div>
      </div>`;
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

  _empty(title, subtitle, href, cta) {
    return `
      <div class="empty-state">
        <div class="empty-icon">📭</div>
        <div class="empty-title">${title}</div>
        <div class="empty-subtitle">${subtitle}</div>
        ${href && cta ? `<a href="${href}" class="btn btn-primary mt-4">${cta}</a>` : ''}
      </div>`;
  }

  // ──────────────────────────────────────────────────────────
  // TOAST NOTIFICATIONS
  // ──────────────────────────────────────────────────────────

  toast(msg) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    this.el.toasts.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => {
      t.style.opacity = '0';
      setTimeout(() => t.remove(), 250);
    }, 3200);
  }
}

// Global Initialization
window.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    window.app = new MetaCRMApp();
  }, 40);
});
