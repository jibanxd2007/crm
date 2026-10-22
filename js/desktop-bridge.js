/**
 * MetaCRM Desktop Integration Bridge
 * Connects the web application seamlessly to the Electron desktop container.
 * - Routes all /api/* requests to centralized cloud backend when running in desktop container
 * - Intercepts notifications to dispatch native Windows desktop notifications
 * - Monitors online/offline network connectivity state
 * - Synchronizes credentials with Windows DPAPI secure storage
 */
(function() {
  'use strict';

  const isDesktop = Boolean(window.desktopAPI?.isDesktop || window.location.protocol === 'file:');
  const PROD_BACKEND_ORIGIN = 'https://crm-beta-three-36.vercel.app';

  window.IS_DESKTOP_APP = isDesktop;
  window.CRM_BACKEND_ORIGIN = isDesktop ? PROD_BACKEND_ORIGIN : '';

  // 1. GLOBAL FETCH INTERCEPTOR FOR DESKTOP CONTAINER
  if (isDesktop) {
    const rawFetch = window.fetch;
    window.fetch = function(input, init) {
      if (typeof input === 'string') {
        if (input.startsWith('/api/')) {
          input = PROD_BACKEND_ORIGIN + input;
        } else if (input.startsWith('api/')) {
          input = PROD_BACKEND_ORIGIN + '/' + input;
        }
      } else if (input instanceof Request) {
        const url = input.url;
        if (url.startsWith('file:///api/') || url.includes('/api/')) {
          const path = url.substring(url.indexOf('/api/'));
          input = new Request(PROD_BACKEND_ORIGIN + path, input);
        }
      }
      return rawFetch(input, init).catch(err => {
        // Broadcast network failure to offline handler
        window.dispatchEvent(new CustomEvent('crm:network-error', { detail: { error: err.message } }));
        throw err;
      });
    };
    console.log('[DesktopBridge] Active: All API requests routed to', PROD_BACKEND_ORIGIN);
  }

  // 2. DESKTOP NOTIFICATION DISPATCHER
  window.sendDesktopNotification = function(title, body, options = {}) {
    if (window.desktopAPI?.showNotification) {
      window.desktopAPI.showNotification({ title, body, ...options });
    } else if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      try {
        new Notification(title, { body, icon: 'electron/assets/icon.png' });
      } catch (e) {}
    }
  };

  // 3. OFFLINE / RECONNECTING STATUS BANNER
  function setupNetworkMonitor() {
    let statusBanner = null;

    function renderBanner(online, message) {
      if (online) {
        if (statusBanner) {
          statusBanner.style.background = '#0E6251';
          statusBanner.innerHTML = '<span>● Reconnected to MetaCRM Live Cloud</span>';
          setTimeout(() => {
            if (statusBanner) {
              statusBanner.remove();
              statusBanner = null;
            }
          }, 3000);
        }
      } else {
        if (!statusBanner) {
          statusBanner = document.createElement('div');
          statusBanner.id = 'desktop-offline-banner';
          statusBanner.style.cssText = `
            position: fixed;
            bottom: 16px;
            right: 16px;
            z-index: 999999;
            background: #B03A2E;
            color: #FFFFFF;
            padding: 10px 18px;
            border-radius: 8px;
            font-family: inherit;
            font-size: 13px;
            font-weight: 600;
            display: flex;
            align-items: center;
            gap: 10px;
            box-shadow: 0 8px 24px rgba(0,0,0,0.5);
            border: 1px solid rgba(255,255,255,0.2);
            animation: fadeIn 0.25s ease-out;
          `;
          document.body.appendChild(statusBanner);
        }
        statusBanner.style.background = '#B03A2E';
        statusBanner.innerHTML = `
          <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:#FFF; animation:pulse 1.5s infinite;"></span>
          <span>${message || 'Connecting to Centralized Server...'}</span>
          <button style="background:rgba(255,255,255,0.2); border:none; color:#FFF; padding:3px 8px; border-radius:4px; cursor:pointer; font-size:11px;" onclick="window.location.reload()">Retry</button>
        `;
      }
    }

    window.addEventListener('online', () => renderBanner(true));
    window.addEventListener('offline', () => renderBanner(false, 'Internet connection lost. Reconnecting...'));
    window.addEventListener('crm:network-error', (e) => {
      renderBanner(false, 'Server unreachable. Retrying connection...');
    });

    if (window.desktopAPI?.onNetworkChange) {
      window.desktopAPI.onNetworkChange((isOnline) => renderBanner(isOnline));
    }
  }

  // 4. AUTOMATIC UPDATE NOTIFICATION
  function setupUpdateListener() {
    if (window.desktopAPI?.onUpdateStatus) {
      window.desktopAPI.onUpdateStatus((updateInfo) => {
        if (updateInfo?.available) {
          const bar = document.createElement('div');
          bar.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            z-index: 999999;
            background: linear-gradient(90deg, #FF6A00, #EE0979);
            color: #FFF;
            text-align: center;
            padding: 8px 16px;
            font-size: 13px;
            font-weight: 600;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 12px;
          `;
          bar.innerHTML = `
            <span>🚀 MetaCRM Desktop update available (${updateInfo.latestVersion}).</span>
            <button style="background:#FFF; color:#222; border:none; padding:4px 10px; border-radius:4px; font-weight:700; cursor:pointer;" onclick="window.desktopAPI.openExternal('${updateInfo.downloadUrl}')">Download Update</button>
            <button style="background:transparent; color:#FFF; border:none; cursor:pointer; font-size:16px;" onclick="this.parentElement.remove()">✕</button>
          `;
          document.body.prepend(bar);
        }
      });
    }
  }

  // Initialize once DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setupNetworkMonitor();
      setupUpdateListener();
    });
  } else {
    setupNetworkMonitor();
    setupUpdateListener();
  }
})();
