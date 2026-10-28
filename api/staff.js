const {
  getUserByEmail,
  getUserById,
  getUserBySetupToken,
  getUserByResetToken,
  getAllUsers,
  updateUser,
  hashPassword,
  verifyPassword,
  generateSecureToken,
  createSessionToken,
  verifySessionToken,
  invalidateSessionToken,
  checkRateLimit,
  resetRateLimit,
  resolveUser,
  toDeterministicUuid,
  createVercelHandler
} = require('./_utils/index.js');

let createClient = null;
try {
  createClient = require('@supabase/supabase-js').createClient;
} catch (e) {}

function getSupabaseAdmin() {
  if (!createClient) return null;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !serviceKey) return null;
  return createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

async function staffHandler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-User-Id, x-user-id');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const query = req.query || {};
  const body = req.body || {};
  const action = body.action || query.action || query.path || '';

  // Get base application URL for link generation
  const appUrl = (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://crm-beta-three-36.vercel.app').replace(/\/$/, '');

  // --------------------------------------------------------------------------
  // PUBLIC AUTH ACTIONS: LOGIN, VERIFY SETUP, COMPLETE SETUP, RESET PASSWORD
  // --------------------------------------------------------------------------

  // 1. LOGIN
  if (action === 'login') {
    const email = (body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const clientIp = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'client';

    if (!email || !password) {
      return res.status(400).json({ success: false, error: "Email and password are required." });
    }

    // Rate Limiting (Brute-Force Protection: max 5 attempts per 15 min)
    const rateCheck = checkRateLimit(`login_${clientIp}_${email}`, 5, 15 * 60 * 1000);
    if (!rateCheck.allowed) {
      return res.status(429).json({
        success: false,
        error: `Too many failed login attempts. Please wait ${rateCheck.retryAfterSec} seconds before trying again.`,
        retryAfter: rateCheck.retryAfterSec
      });
    }

    const user = getUserByEmail(email);
    if (!user) {
      return res.status(401).json({ success: false, error: "Invalid email or password." });
    }

    // Check account status
    if (user.status === 'deactivated' || user.status === 'inactive') {
      return res.status(403).json({ success: false, error: "This staff account has been deactivated. Please contact your administrator." });
    }

    if ((user.status === 'setup_pending' || user.status === 'pending_setup') && !user.passwordHash && !user.password_hash) {
      return res.status(403).json({
        success: false,
        error: "Your account setup is pending. Please use your single-use password setup invitation link to set your password before logging in."
      });
    }

    // Verify Password
    const hash = user.passwordHash || user.password_hash;
    const salt = user.passwordSalt || user.password_salt;
    const isValid = hash && salt ? verifyPassword(password, hash, salt) : false;
    if (!isValid) {
      return res.status(401).json({ success: false, error: "Invalid email or password." });
    }

    // Success: Reset rate limit counter
    resetRateLimit(`login_${clientIp}_${email}`);

    // Update last login
    updateUser(email, { lastLoginAt: new Date().toISOString() });

    // Issue signed session token
    const token = createSessionToken(user);

    return res.status(200).json({
      success: true,
      status: "success",
      sessionToken: token,
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        displayName: user.displayName || user.name,
        role: user.role,
        assignedPages: user.assignedPages || []
      },
      redirectUrl: user.role === 'admin' ? '/#dashboard' : '/#dashboard'
    });
  }

  // 2. LOGOUT & SESSION INVALIDATION
  if (action === 'logout') {
    const authHeader = req.headers['authorization'] || '';
    if (authHeader.startsWith('Bearer ')) {
      invalidateSessionToken(authHeader.replace('Bearer ', '').trim());
    }
    return res.status(200).json({ success: true, status: "success", message: "Logged out successfully." });
  }

  // 3. VERIFY SETUP TOKEN
  if (action === 'verify-setup-token') {
    const token = String(body.token || query.token || '').trim();
    if (!token) {
      return res.status(400).json({ valid: false, error: "Setup token is required." });
    }

    const user = getUserBySetupToken(token);
    if (!user) {
      return res.status(400).json({ valid: false, error: "Setup link is invalid or has expired." });
    }

    return res.status(200).json({
      valid: true,
      email: user.email,
      name: user.name,
      role: user.role
    });
  }

  // 4. SETUP PASSWORD (Initial Account Setup Flow)
  if (action === 'setup-password') {
    const token = String(body.token || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '').trim();

    if (!token || !password) {
      return res.status(400).json({ success: false, error: "Setup token and password are required." });
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, error: "Password must be at least 6 characters long." });
    }

    const user = getUserBySetupToken(token);
    if (!user || (email && user.email.toLowerCase() !== email)) {
      return res.status(400).json({ success: false, error: "Setup token is invalid or has expired." });
    }

    // Generate fresh salt & hash password
    const salt = generateSecureToken(16);
    const hash = hashPassword(password, salt);

    // Update user record: activate account and invalidate single-use setup token
    updateUser(user.email, {
      passwordHash: hash,
      password_hash: hash,
      passwordSalt: salt,
      password_salt: salt,
      status: 'active',
      setupToken: null,
      setup_token: null,
      setupExpiresAt: null,
      lastLoginAt: new Date().toISOString()
    });

    // Create session token so user is logged in immediately
    const sessionToken = createSessionToken(user);

    return res.status(200).json({
      success: true,
      status: "success",
      message: "Password set successfully! Your account is now active.",
      sessionToken: sessionToken,
      token: sessionToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        displayName: user.displayName || user.name,
        role: user.role,
        assignedPages: user.assignedPages || []
      }
    });
  }

  // 5. FORGOT PASSWORD (Initiates secure reset flow)
  if (action === 'forgot-password') {
    const email = String(body.email || '').trim().toLowerCase();
    const clientIp = req.headers['x-forwarded-for'] || 'client';

    if (!email) {
      return res.status(400).json({ success: false, error: "Email address is required." });
    }

    // Rate limiting on forgot password requests
    checkRateLimit(`reset_${clientIp}`, 10, 15 * 60 * 1000);

    const user = getUserByEmail(email);
    let resetToken = null;
    if (user) {
      resetToken = generateSecureToken(32);
      const resetExpiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour
      updateUser(email, { resetToken, reset_token: resetToken, resetExpiresAt });
      console.log(`[Auth Notice] Generated password reset link for ${email}`);
    }

    return res.status(200).json({
      success: true,
      status: "success",
      resetToken: resetToken,
      resetLink: resetToken ? `${appUrl}/#reset-password?token=${resetToken}` : null,
      message: "If an account exists with that email address, password reset instructions have been dispatched."
    });
  }

  // 6. RESET PASSWORD (Validates single-use reset token and sets new password)
  if (action === 'reset-password') {
    const token = String(body.token || '').trim();
    const password = String(body.password || '').trim();

    if (!token || !password) {
      return res.status(400).json({ success: false, error: "Reset token and new password are required." });
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, error: "Password must be at least 6 characters long." });
    }

    const user = getUserByResetToken(token);
    if (!user) {
      return res.status(400).json({ success: false, error: "Password reset link is invalid or has expired." });
    }

    // Hash new password and invalidate reset token
    const salt = generateSecureToken(16);
    const hash = hashPassword(password, salt);

    updateUser(user.email, {
      passwordHash: hash,
      password_hash: hash,
      passwordSalt: salt,
      password_salt: salt,
      resetToken: null,
      reset_token: null,
      resetExpiresAt: null
    });

    const sessionToken = createSessionToken(user);

    return res.status(200).json({
      success: true,
      status: "success",
      sessionToken: sessionToken,
      token: sessionToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        displayName: user.displayName || user.name,
        role: user.role
      },
      message: "Your password has been reset successfully. You may now sign in with your new password."
    });
  }

  // 7. CURRENT AUTH SESSION CHECK
  if (action === 'session') {
    const user = resolveUser(req.headers);
    if (!user) {
      return res.status(401).json({ authenticated: false, error: "No active session." });
    }
    return res.status(200).json({
      authenticated: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        displayName: user.displayName || user.name,
        role: user.role,
        assignedPages: user.pages || []
      }
    });
  }

  // --------------------------------------------------------------------------
  // PROTECTED ACTIONS: STAFF DIRECTORY & ADMIN MANAGEMENT
  // --------------------------------------------------------------------------

  // Mandatory Authentication for All Subsequent Endpoints
  const currentUser = resolveUser(req.headers);
  if (!currentUser) {
    return res.status(401).json({ error: "Unauthorized: Valid session token required." });
  }

  const isAdmin = currentUser.role === 'admin';

  // 8. ADMIN ONLY: INVITE NEW USER OR RESEND SETUP LINK
  if (action === 'invite' || action === 'resend-setup') {
    if (!isAdmin) {
      return res.status(403).json({ error: "Forbidden: Only administrators can manage invitations." });
    }

    const email = String(body.email || query.email || '').trim().toLowerCase();
    if (!email) {
      return res.status(400).json({ error: "Email address is required." });
    }

    const existingUser = getUserByEmail(email);
    if (existingUser && action === 'invite') {
      return res.status(409).json({ error: `Account with email ${email} already exists.` });
    }

    if (!existingUser && action === 'resend-setup') {
      return res.status(404).json({ error: "User account not found." });
    }

    const setupToken = generateSecureToken(32);
    const setupExpiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();

    let targetUser = existingUser;
    if (!targetUser) {
      const name = String(body.name || email).trim();
      const role = body.role === 'admin' ? 'admin' : 'staff';
      const assignedPages = Array.isArray(body.assignedPages) ? body.assignedPages : [];
      targetUser = {
        id: require('crypto').randomUUID ? require('crypto').randomUUID() : `usr_${Date.now()}`,
        email,
        name,
        displayName: name,
        role,
        status: 'pending_setup',
        setupToken,
        setup_token: setupToken,
        setupExpiresAt,
        assignedPages,
        createdAt: new Date().toISOString()
      };
      updateUser(email, targetUser);
    } else {
      updateUser(email, { setupToken, setup_token: setupToken, setupExpiresAt, status: 'pending_setup' });
    }

    const setupLink = `${appUrl}/#setup-password?token=${setupToken}`;

    return res.status(existingUser ? 200 : 201).json({
      success: true,
      status: "success",
      message: `Setup invitation created for ${targetUser.name} (${email})`,
      user: targetUser,
      setup_token: setupToken,
      setupToken,
      setupLink,
      expiresAt: setupExpiresAt
    });
  }

  // 9. ADMIN ONLY: TOGGLE ACCOUNT STATUS (Active / Deactivated)
  if (action === 'toggle-status') {
    if (!isAdmin) {
      return res.status(403).json({ error: "Forbidden: Only administrators can modify account status." });
    }

    let email = String(body.email || '').trim().toLowerCase();
    const userId = body.userId || body.id;
    if (!email && userId) {
      const u = getUserById(userId);
      if (u) email = u.email;
    }

    // Protect Joy (admina@novaautos.co.nz) from accidental lockout
    if (email === 'admina@novaautos.co.nz' || userId === '00000000-0000-4001-a001-000000000001') {
      return res.status(400).json({ error: "The primary administrator account (Joy) cannot be deactivated or locked out." });
    }

    const targetUser = getUserByEmail(email);
    if (!targetUser) {
      return res.status(404).json({ error: "User not found." });
    }

    const requestedStatus = body.status;
    const newStatus = requestedStatus || (targetUser.status === 'inactive' || targetUser.status === 'deactivated' ? (targetUser.passwordHash ? 'active' : 'pending_setup') : 'inactive');
    updateUser(email, { status: newStatus });

    return res.status(200).json({
      success: true,
      status: "success",
      message: `Account status updated to ${newStatus}.`,
      user: { email, status: newStatus }
    });
  }

  // 10. ADMIN ONLY: UPDATE USER PROFILE (Name, Page Assignments)
  if (action === 'update-profile') {
    if (!isAdmin) {
      return res.status(403).json({ error: "Forbidden: Only administrators can update user profiles." });
    }

    let email = String(body.email || '').trim().toLowerCase();
    const userId = body.userId || body.id;
    if (!email && userId) {
      const u = getUserById(userId);
      if (u) email = u.email;
    }

    const newName = body.name ? String(body.name).trim() : null;
    const newPages = Array.isArray(body.assignedPages) ? body.assignedPages : (Array.isArray(body.assignedPageIds) ? body.assignedPageIds : null);

    let targetUser = email ? getUserByEmail(email) : (userId ? getUserById(userId) : null);
    if (!targetUser && userId) {
      for (const u of getAllUsers(true)) {
        if (u.id === userId || String(u.id).toLowerCase() === String(userId).toLowerCase()) {
          targetUser = u;
          email = u.email;
          break;
        }
      }
    }

    // Supabase DB query fallback if not in memory
    const supabase = getSupabaseAdmin();
    if (!targetUser && supabase && (email || userId)) {
      try {
        let q = supabase.from('users').select('id, email, name, role, assigned_pages');
        if (email) q = q.eq('email', email);
        else if (userId) q = q.eq('id', userId);
        const { data: dbU } = await q.maybeSingle();
        if (dbU) {
          targetUser = { id: dbU.id, email: dbU.email, name: dbU.name, role: dbU.role, assignedPages: dbU.assigned_pages || [] };
          email = dbU.email;
          updateUser(email, targetUser);
        }
      } catch (e) {
        console.warn('[Staff Lookup Warning]:', e.message);
      }
    }

    if (!targetUser) {
      return res.status(404).json({ error: "User not found." });
    }

    const updates = {};
    if (newName) {
      updates.name = newName;
      updates.displayName = newName;
    }
    if (newPages) {
      if (email === 'admina@novaautos.co.nz') {
        updates.assignedPages = ['*'];
      } else {
        updates.assignedPages = newPages;
      }
    }

    updateUser(email, updates);

    // Persist to Supabase if configured
    if (supabase) {
      try {
        const dbUpdates = {};
        if (newName) {
          dbUpdates.name = newName;
          dbUpdates.full_name = newName;
        }
        if (newPages) {
          dbUpdates.assigned_pages = (email === 'admina@novaautos.co.nz') ? ['*'] : newPages;
        }
        dbUpdates.updated_at = new Date().toISOString();

        await supabase
          .from('users')
          .update(dbUpdates)
          .eq('email', email);

        // Also synchronize page_members RBAC memberships
        if (newPages && targetUser && targetUser.id) {
          const { data: dbPages } = await supabase
            .from('facebook_pages')
            .select('id, page_id');

          if (Array.isArray(dbPages)) {
            // Clear prior memberships
            await supabase
              .from('page_members')
              .delete()
              .eq('user_id', targetUser.id);

            // Re-insert designated memberships
            for (const pid of newPages) {
              const matched = dbPages.find(p => p.id === pid || p.page_id === pid);
              if (matched && matched.id) {
                await supabase
                  .from('page_members')
                  .upsert({
                    id: toDeterministicUuid(`pm_${matched.id}_${targetUser.id}`),
                    page_id: matched.id,
                    user_id: targetUser.id,
                    role: targetUser.role === 'admin' ? 'owner' : 'agent'
                  }, { onConflict: 'page_id,user_id' });
              }
            }
          }
        }
      } catch (dbErr) {
        console.warn('[Staff Supabase Update Warning]:', dbErr.message);
      }
    }

    return res.status(200).json({
      success: true,
      status: "success",
      message: "Profile and page assignments updated successfully.",
      user: {
        id: targetUser.id,
        email,
        name: updates.name || targetUser.name,
        assignedPages: targetUser.assignedPages,
        assignedPageIds: targetUser.assignedPages
      }
    });
  }

  // 11. ADMIN ONLY: INITIATE SECURE PASSWORD RESET FOR USER
  if (action === 'admin-reset-password') {
    if (!isAdmin) {
      return res.status(403).json({ error: "Forbidden: Only administrators can trigger password resets." });
    }

    const email = String(body.email || '').trim().toLowerCase();
    const targetUser = getUserByEmail(email);
    if (!targetUser) {
      return res.status(404).json({ error: "User not found." });
    }

    const resetToken = generateSecureToken(32);
    const resetExpiresAt = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    updateUser(email, { resetToken, resetExpiresAt });

    const resetLink = `${appUrl}/#reset-password?token=${resetToken}&email=${encodeURIComponent(email)}`;

    return res.status(200).json({
      status: "success",
      message: `Single-use password reset link created for ${targetUser.name}`,
      resetLink,
      expiresAt: resetExpiresAt
    });
  }

  // 12. GET: STAFF DIRECTORY LISTING
  // Sync latest persisted database attributes if Supabase is connected
  const supabase = getSupabaseAdmin();
  if (supabase) {
    try {
      const { data: dbUsers } = await supabase
        .from('users')
        .select('id, email, name, full_name, role, status, assigned_pages, last_login_at');

      if (Array.isArray(dbUsers) && dbUsers.length > 0) {
        for (const dbu of dbUsers) {
          const u = getUserByEmail(dbu.email);
          if (u) {
            if (dbu.assigned_pages && Array.isArray(dbu.assigned_pages)) {
              u.assignedPages = dbu.assigned_pages;
            }
            if (dbu.status) u.status = dbu.status;
            if (dbu.last_login_at) u.lastLoginAt = dbu.last_login_at;
            if (dbu.name || dbu.full_name) u.name = dbu.name || dbu.full_name;
          }
        }
      }
    } catch (e) {
      console.warn('[Staff Directory DB Sync Warning]:', e.message);
    }
  }

  const allUsers = getAllUsers(false); // sanitized
  const staffList = allUsers.map(u => {
    const pages = u.assignedPages || [];
    const item = {
      id: u.id,
      name: u.name,
      displayName: u.name,
      email: u.email,
      role: u.role,
      status: u.status,
      lastLogin: u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : 'Never',
      assignedPages: pages,
      assignedPageIds: pages,
      assigned_pages: pages
    };

    // If admin is requesting and account setup is pending, include setup link
    if (isAdmin && u.status === 'setup_pending' && u.setupToken) {
      item.setupLink = `${appUrl}/#setup-password?token=${u.setupToken}&email=${encodeURIComponent(u.email)}`;
      item.setupExpiresAt = u.setupExpiresAt;
    }

    return item;
  });

  return res.status(200).json({
    status: "success",
    authorized: true,
    userRole: currentUser.role,
    currentUserEmail: currentUser.email,
    count: staffList.length,
    staff: staffList,
    emailDeliveryConfigured: Boolean(process.env.RESEND_API_KEY),
    timestamp: new Date().toISOString()
  });
}

module.exports = createVercelHandler(staffHandler);
