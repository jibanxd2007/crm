/**
 * Canonical Page Assignment & RBAC Authority
 * Provides persistent many-to-many relationships between employees and dealership pages.
 * Supports:
 *  - One employee assigned to multiple Facebook/Instagram pages
 *  - One page assigned to multiple employees simultaneously
 *  - Independent access revocation (revoking Employee A never affects Employee B)
 *  - Strict RBAC: 0 assigned pages = 0 access (never auto-defaults to all pages)
 *  - Cross-container durable persistence via Zernio metadata + Supabase sync
 */

const https = require('https');

// All 6 Canonical Dealership Accounts with both Zernio ObjectId and Facebook Page ID
const CANONICAL_DEALERSHIP_ACCOUNTS = [
  {
    zernioAccountId: '6accd8b0d52dc43d8bf6034c',
    pageId: '1330954980099743',
    name: 'Nova cars Samoa nz',
    platform: 'facebook'
  },
  {
    zernioAccountId: '6acd4daed19284a3227d7870',
    pageId: '1342542735606057',
    name: 'Nova auto nz',
    platform: 'facebook'
  },
  {
    zernioAccountId: '6aea527fa5c031c687ccba15',
    pageId: '1357368447449594',
    name: 'Car4u Ma’a Tonga NZ',
    platform: 'facebook'
  },
  {
    zernioAccountId: '6aea5280a5c031c687ccba16',
    pageId: '380918975300755',
    name: 'Car4u',
    platform: 'facebook'
  },
  {
    zernioAccountId: '6aea5280a5c031c687ccba17',
    pageId: '284138661621993',
    name: 'Zodiac Motor Company',
    platform: 'facebook'
  },
  {
    zernioAccountId: '6aea5281a5c031c687ccba18',
    pageId: '1271057346092106',
    name: 'Car4u Mo Samoa NZ',
    platform: 'facebook'
  }
];

// Flat list of all 12 canonical IDs
const CANONICAL_DEALERSHIP_PAGE_IDS = [
  '6accd8b0d52dc43d8bf6034c',
  '6acd4daed19284a3227d7870',
  '6aea527fa5c031c687ccba15',
  '6aea5280a5c031c687ccba16',
  '6aea5280a5c031c687ccba17',
  '6aea5281a5c031c687ccba18',
  '1330954980099743',
  '1342542735606057',
  '1357368447449594',
  '380918975300755',
  '284138661621993',
  '1271057346092106'
];

// Alias mapping table: any ID -> Set of related IDs
const PAGE_ALIAS_MAP = new Map();
for (const acc of CANONICAL_DEALERSHIP_ACCOUNTS) {
  const aliases = [acc.zernioAccountId, acc.pageId].filter(Boolean);
  aliases.forEach(id => {
    PAGE_ALIAS_MAP.set(String(id).toLowerCase(), aliases);
  });
}

/**
 * Expands an array of page IDs to include all known aliases
 */
function expandPageAliases(pageIds) {
  if (!Array.isArray(pageIds)) return [];
  if (pageIds.includes('*')) return ['*'];

  const expanded = new Set();
  for (const pid of pageIds) {
    if (!pid) continue;
    const str = String(pid).trim().toLowerCase();
    expanded.add(str);
    const aliases = PAGE_ALIAS_MAP.get(str);
    if (aliases) {
      aliases.forEach(a => expanded.add(String(a).toLowerCase()));
    }
  }
  return Array.from(expanded);
}

/**
 * Verifies if user has permission to access a page
 */
function hasPageAccess(user, pageId) {
  if (!user) return false;
  if (user.role === 'admin' || user.role === 'super_admin') return true;

  const userPages = Array.isArray(user.pages) ? user.pages : (Array.isArray(user.assignedPages) ? user.assignedPages : []);
  if (userPages.includes('*')) return true;
  if (userPages.length === 0) return false;

  // If checking 'all', return true if user has at least one assigned page
  if (!pageId || pageId === 'all') return userPages.length > 0;

  const targetExpanded = expandPageAliases([pageId]);
  const userExpanded = expandPageAliases(userPages);

  return targetExpanded.some(t => userExpanded.includes(t));
}

// In-Memory Global Store with TTL
global.CRM_DURABLE_ASSIGNMENTS_CACHE = global.CRM_DURABLE_ASSIGNMENTS_CACHE || {
  timestamp: 0,
  data: new Map() // email/id -> Array of pageIds
};

const ZERNIO_PROFILE_ID = process.env.ZERNIO_PROFILE_ID || '6aca100754c13a71092c1d1c';

/**
 * Loads durable page assignments from Zernio profile description
 */
async function loadDurableAssignments(forceRefresh = false) {
  const cache = global.CRM_DURABLE_ASSIGNMENTS_CACHE;
  const isFresh = (Date.now() - cache.timestamp) < (15 * 1000); // 15 second TTL

  if (!forceRefresh && isFresh && cache.data.size > 0) {
    return cache.data;
  }

  const apiKey = process.env.ZERNIO_API_KEY;
  if (!apiKey) return cache.data;

  try {
    const profile = await new Promise((resolve) => {
      const req = https.request({
        hostname: 'zernio.com',
        port: 443,
        path: '/api/v1/profiles',
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Accept': 'application/json'
        }
      }, res => {
        let d = '';
        res.on('data', chunk => d += chunk);
        res.on('end', () => {
          try {
            const j = JSON.parse(d);
            const p = (j.profiles || []).find(x => x._id === ZERNIO_PROFILE_ID);
            resolve(p);
          } catch (e) { resolve(null); }
        });
      });
      req.setTimeout(4000, () => { req.destroy(); resolve(null); });
      req.on('error', () => resolve(null));
      req.end();
    });

    if (profile && profile.description && profile.description.startsWith('{')) {
      const parsed = JSON.parse(profile.description);
      if (parsed && parsed.assignments && typeof parsed.assignments === 'object') {
        cache.data.clear();
        for (const [key, val] of Object.entries(parsed.assignments)) {
          if (Array.isArray(val)) {
            cache.data.set(key.toLowerCase().trim(), val);
          }
        }
        cache.timestamp = Date.now();
      }
    }
  } catch (err) {
    console.warn('[Durable Assignments Load Warning]:', err.message);
  }

  return cache.data;
}

/**
 * Saves page assignments for an employee to both in-memory cache and persistent Zernio profile
 */
async function saveDurableAssignments(emailOrId, pageIds, supabaseAdmin = null) {
  if (!emailOrId) return [];
  const key = String(emailOrId).toLowerCase().trim();
  const normalizedPages = Array.isArray(pageIds) ? pageIds : [];

  const cache = global.CRM_DURABLE_ASSIGNMENTS_CACHE;
  cache.data.set(key, normalizedPages);
  cache.timestamp = Date.now();

  if (global.CRM_EXPLICIT_PAGE_ASSIGNMENTS) {
    global.CRM_EXPLICIT_PAGE_ASSIGNMENTS.set(key, normalizedPages);
  }

  if (global.CRM_USER_STORE) {
    const u = global.CRM_USER_STORE.get(key);
    if (u) {
      u.assignedPages = normalizedPages;
      u.pages = normalizedPages;
    }
  }

  const apiKey = process.env.ZERNIO_API_KEY;
  if (apiKey) {
    try {
      // Build full assignment map
      const currentMap = await loadDurableAssignments(false);
      currentMap.set(key, normalizedPages);

      const serializable = {};
      for (const [k, v] of currentMap.entries()) {
        serializable[k] = v;
      }

      const payload = {
        _type: 'metacrm_state_v1',
        updated_at: new Date().toISOString(),
        assignments: serializable
      };

      const body = JSON.stringify({ description: JSON.stringify(payload) });
      await new Promise((resolve) => {
        const req = https.request({
          hostname: 'zernio.com',
          port: 443,
          path: `/api/v1/profiles/${ZERNIO_PROFILE_ID}`,
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body)
          }
        }, res => {
          let d = '';
          res.on('data', chunk => d += chunk);
          res.on('end', () => resolve());
        });
        req.setTimeout(5000, () => { req.destroy(); resolve(); });
        req.on('error', () => resolve());
        req.write(body);
        req.end();
      });
    } catch (saveErr) {
      console.warn('[Durable Assignments Save Warning]:', saveErr.message);
    }
  }

  // Best-effort Supabase sync
  if (supabaseAdmin) {
    try {
      let q = supabaseAdmin.from('users').update({ assigned_pages: normalizedPages });
      if (key.includes('@')) q = q.eq('email', key);
      else q = q.eq('id', key);
      await q.catch(() => {});
    } catch (e) {}
  }

  return normalizedPages;
}

/**
 * Retrieves the effective assigned pages for a specific user
 */
function getEffectiveUserPages(user, assignmentMap = null) {
  if (!user) return [];
  if (user.role === 'admin' || user.role === 'super_admin') return ['*'];

  const map = assignmentMap || (global.CRM_DURABLE_ASSIGNMENTS_CACHE && global.CRM_DURABLE_ASSIGNMENTS_CACHE.data);
  if (map) {
    if (user.email && map.has(user.email.toLowerCase().trim())) {
      return map.get(user.email.toLowerCase().trim());
    }
    if (user.id && map.has(String(user.id).toLowerCase().trim())) {
      return map.get(String(user.id).toLowerCase().trim());
    }
  }

  if (Array.isArray(user.assignedPages)) return user.assignedPages;
  if (Array.isArray(user.pages)) return user.pages;
  return [];
}

module.exports = {
  CANONICAL_DEALERSHIP_ACCOUNTS,
  CANONICAL_DEALERSHIP_PAGE_IDS,
  PAGE_ALIAS_MAP,
  expandPageAliases,
  hasPageAccess,
  loadDurableAssignments,
  saveDurableAssignments,
  getEffectiveUserPages
};
