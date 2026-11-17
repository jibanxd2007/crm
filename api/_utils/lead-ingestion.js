/**
 * Dealership Lead Ads Ingestion, Identity Separation & Atomic Assignment Module
 * Shared across Zernio webhooks, Meta Graph webhooks, and Leads API.
 *
 * Design guarantees:
 * 1. Idempotent on meta_lead_id (replay-safe under webhook retries).
 * 2. Preserves ALL standard and custom Meta Lead Ad answers without discarding fields.
 * 3. Separates Contacts (person) from Enquiries (leads row) strictly per page_id;
 *    never merges contacts solely by name and never leaks contacts across pages.
 * 4. Atomic concurrency-safe assignment ONLY to staff eligible for the originating page,
 *    falling back cleanly to Unassigned (null) instead of cross-page staff.
 * 5. Explicitly marks Lead Ad submissions as messaging_eligible: false until a customer
 *    initiates a channel conversation or valid consent exists.
 */

const { toDeterministicUuid, httpsRequest, safeDbUpsert } = require('./index.js');

// In-memory durable locks & deduplication fallback for serverless/local test runs
global.CRM_LEAD_ASSIGN_LOCKS = global.CRM_LEAD_ASSIGN_LOCKS || new Map();
global.CRM_LEAD_ASSIGNMENTS = global.CRM_LEAD_ASSIGNMENTS || new Map();
global.CRM_PAGE_RR_CURSOR = global.CRM_PAGE_RR_CURSOR || new Map();
global.CRM_INGESTED_LEADS = global.CRM_INGESTED_LEADS || new Map();
global.CRM_PAGE_CONTACTS = global.CRM_PAGE_CONTACTS || new Map();
global.CRM_WEBHOOK_LOG = global.CRM_WEBHOOK_LOG || [];

function normalizeEmail(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const cleaned = raw.trim().toLowerCase();
  return cleaned.includes('@') ? cleaned : null;
}

function normalizeNzPhone(raw) {
  if (!raw || typeof raw !== 'string') return null;
  let digits = raw.replace(/[^\d+]/g, '');
  if (!digits) return null;
  if (digits.startsWith('0064')) digits = '+64' + digits.slice(4);
  else if (digits.startsWith('64') && !digits.startsWith('+')) digits = '+' + digits;
  else if (digits.startsWith('0') && digits.length >= 8 && digits.length <= 11) digits = '+64' + digits.slice(1);
  return digits.length >= 7 ? digits : null;
}

/**
 * Extracts standard + custom Meta Lead Ads answers without discarding any fields.
 */
function parseLeadFieldData(payload = {}) {
  let fullName = (payload.full_name || payload.name || '').trim();
  let firstName = (payload.first_name || '').trim();
  let lastName = (payload.last_name || '').trim();
  let email = payload.email || payload.email_address || null;
  let phone = payload.phone || payload.phone_number || null;

  const customFields = { ...(payload.custom_fields || {}) };
  let vehicleInterest = payload.vehicle_interest || null;
  let budgetNzd = payload.budget_nzd ? Number(payload.budget_nzd) : null;
  let paymentPreference = payload.payment_preference || null;
  let tradeInInfo = payload.trade_in_info || null;
  let buyingTimeframe = payload.buying_timeframe || null;

  const fieldsList = payload.field_data || payload.form_data || payload.answers || [];
  if (Array.isArray(fieldsList)) {
    for (const field of fieldsList) {
      if (!field || !field.name) continue;
      const rawKey = String(field.name).trim();
      const fname = rawKey.toLowerCase();
      const rawVal = Array.isArray(field.values) ? field.values.join(', ') : (field.value ?? field.values ?? '');
      const fval = String(rawVal).trim();
      if (!fval) continue;

      if (fname === 'full_name' || fname === 'name') {
        if (!fullName) fullName = fval;
      } else if (fname === 'first_name') {
        if (!firstName) firstName = fval;
      } else if (fname === 'last_name') {
        if (!lastName) lastName = fval;
      } else if (fname.includes('email')) {
        if (!email) email = fval;
      } else if (fname.includes('phone') || fname.includes('mobile')) {
        if (!phone) phone = fval;
      } else {
        // Preserve EVERY custom answer verbatim
        customFields[rawKey] = fval;

        // Also map dealership-specific answers cleanly
        if (!vehicleInterest && (fname.includes('vehicle') || fname.includes('car') || fname.includes('model') || fname.includes('stock'))) {
          vehicleInterest = fval;
        }
        if (!budgetNzd && (fname.includes('budget') || fname.includes('price'))) {
          const parsedNum = Number(fval.replace(/[^\d.]/g, ''));
          if (!isNaN(parsedNum) && parsedNum > 0) budgetNzd = parsedNum;
        }
        if (!paymentPreference && (fname.includes('finance') || fname.includes('payment') || fname.includes('cash'))) {
          if (fval.toLowerCase().includes('finance')) paymentPreference = 'Finance';
          else if (fval.toLowerCase().includes('cash')) paymentPreference = 'Cash';
          else paymentPreference = fval;
        }
        if (!tradeInInfo && (fname.includes('trade') || fname.includes('swap'))) {
          tradeInInfo = fval;
        }
        if (!buyingTimeframe && (fname.includes('time') || fname.includes('when') || fname.includes('soon'))) {
          buyingTimeframe = fval;
        }
      }
    }
  }

  if (!fullName && (firstName || lastName)) {
    fullName = `${firstName} ${lastName}`.trim();
  }
  if (!fullName) fullName = 'Meta Lead';

  return {
    fullName,
    email: email ? String(email).trim() : null,
    phone: phone ? String(phone).trim() : null,
    normalizedEmail: normalizeEmail(email),
    normalizedPhone: normalizeNzPhone(phone),
    customFields,
    vehicleInterest,
    budgetNzd: isNaN(budgetNzd) ? null : budgetNzd,
    paymentPreference,
    tradeInInfo,
    buyingTimeframe
  };
}

/**
 * Cautiously matches or creates a page-scoped contact using reliable identifiers
 * (normalized email or phone) ONLY within the same page_id.
 * Never merges contacts solely by name, and never leaks contacts across pages.
 */
async function findOrCreatePageScopedContact(supabase, { pageId, fullName, email, phone }) {
  const scopePage = String(pageId || 'unmapped');
  const normEmail = normalizeEmail(email);
  const normPhone = normalizeNzPhone(phone);

  // 1. Try Supabase contacts table if available
  if (supabase && (normEmail || normPhone)) {
    try {
      let existing = null;
      if (normPhone) {
        const { data } = await supabase
          .from('contacts')
          .select('*')
          .eq('page_id', scopePage)
          .eq('normalized_phone', normPhone)
          .maybeSingle();
        if (data) existing = data;
      }
      if (!existing && normEmail) {
        const { data } = await supabase
          .from('contacts')
          .select('*')
          .eq('page_id', scopePage)
          .eq('normalized_email', normEmail)
          .maybeSingle();
        if (data) existing = data;
      }
      if (existing) {
        return { contactId: existing.id, isExistingContact: true, contact: existing };
      }

      const newContact = {
        page_id: scopePage,
        full_name: fullName || 'Meta Lead',
        email: email || null,
        normalized_email: normEmail,
        phone: phone || null,
        normalized_phone: normPhone,
        updated_at: new Date().toISOString()
      };
      const { data: created, error } = await supabase
        .from('contacts')
        .insert(newContact)
        .select('*')
        .single();
      if (!error && created) {
        return { contactId: created.id, isExistingContact: false, contact: created };
      }
    } catch (e) {
      // Fallback safely to deterministic in-memory contact registry if table not yet migrated
    }
  }

  // 2. Deterministic page-scoped contact matching fallback
  const lookupKey = normPhone
    ? `${scopePage}::phone::${normPhone}`
    : (normEmail ? `${scopePage}::email::${normEmail}` : `${scopePage}::anon::${Date.now()}_${Math.random()}`);

  if (global.CRM_PAGE_CONTACTS.has(lookupKey)) {
    const existing = global.CRM_PAGE_CONTACTS.get(lookupKey);
    return { contactId: existing.id, isExistingContact: true, contact: existing };
  }

  const contactId = toDeterministicUuid(`contact_${lookupKey}`);
  const contact = {
    id: contactId,
    page_id: scopePage,
    full_name: fullName || 'Meta Lead',
    email: email || null,
    normalized_email: normEmail,
    phone: phone || null,
    normalized_phone: normPhone,
    created_at: new Date().toISOString()
  };
  global.CRM_PAGE_CONTACTS.set(lookupKey, contact);
  return { contactId, isExistingContact: false, contact };
}

/**
 * Atomic, concurrency-safe lead assignment strictly scoped to staff eligible for `pageId`.
 * Two concurrent workers calling assignLeadAtomically for the same leadId will serialize
 * and resolve to the exact same single owner — never conflicting owners!
 */
async function assignLeadAtomically(supabase, { leadId, pageId, eligibleStaffIds = [], manualStaffId = null }) {
  const lockKey = String(leadId || `lead_${Date.now()}`);

  // Serialize concurrent workers targeting the same leadId within this runtime
  while (global.CRM_LEAD_ASSIGN_LOCKS.has(lockKey)) {
    await global.CRM_LEAD_ASSIGN_LOCKS.get(lockKey);
  }

  let releaseLock;
  const lockPromise = new Promise(resolve => { releaseLock = resolve; });
  global.CRM_LEAD_ASSIGN_LOCKS.set(lockKey, lockPromise);

  try {
    // Check if an owner was already atomically assigned by an earlier concurrent worker
    if (!manualStaffId && global.CRM_LEAD_ASSIGNMENTS.has(lockKey)) {
      const existingOwner = global.CRM_LEAD_ASSIGNMENTS.get(lockKey);
      return { assignedStaffId: existingOwner, alreadyAssigned: true };
    }

    if (supabase && !manualStaffId && leadId) {
      try {
        const { data: dbLead } = await supabase
          .from('leads')
          .select('id, assigned_to')
          .eq('id', leadId)
          .maybeSingle();
        if (dbLead && dbLead.assigned_to) {
          global.CRM_LEAD_ASSIGNMENTS.set(lockKey, dbLead.assigned_to);
          return { assignedStaffId: dbLead.assigned_to, alreadyAssigned: true };
        }
      } catch (e) {}
    }

    // Resolve eligible staff for this page strictly
    let pool = Array.isArray(eligibleStaffIds) ? eligibleStaffIds.filter(Boolean).map(String) : [];

    if (pool.length === 0 && supabase && pageId) {
      try {
        const { data: members } = await supabase
          .from('page_members')
          .select('user_id')
          .eq('page_id', pageId);
        if (Array.isArray(members) && members.length > 0) {
          pool = members.map(m => String(m.user_id));
        }
      } catch (e) {}
    }

    // Deduplicate and sort for deterministic round-robin
    pool = Array.from(new Set(pool)).sort();

    // Manual override validation: must be eligible for page (if pool known) or explicitly null (unassign)
    if (manualStaffId !== null && manualStaffId !== undefined) {
      if (manualStaffId === '') {
        global.CRM_LEAD_ASSIGNMENTS.set(lockKey, null);
        return { assignedStaffId: null, alreadyAssigned: false };
      }
      if (pool.length > 0 && !pool.includes(String(manualStaffId))) {
        return { assignedStaffId: null, rejected: true, reason: 'Target staff member is not assigned to this page' };
      }
      global.CRM_LEAD_ASSIGNMENTS.set(lockKey, String(manualStaffId));
      return { assignedStaffId: String(manualStaffId), alreadyAssigned: false };
    }

    // Unassigned fallback if zero eligible staff exist for this page (NEVER leak to another page's staff!)
    if (pool.length === 0) {
      global.CRM_LEAD_ASSIGNMENTS.set(lockKey, null);
      return { assignedStaffId: null, alreadyAssigned: false, fallbackUnassigned: true };
    }

    let chosenStaffId = null;

    // Prefer PostgreSQL atomic row-locked round-robin RPC if migration is applied
    if (supabase && pageId) {
      try {
        const { data: rpcUser, error: rpcErr } = await supabase.rpc('assign_next_eligible_staff', {
          p_page_id: String(pageId),
          p_eligible_user_ids: pool
        });
        if (!rpcErr && rpcUser) {
          chosenStaffId = String(rpcUser);
        }
      } catch (e) {}
    }

    // Atomic in-process round-robin fallback
    if (!chosenStaffId) {
      const pageKey = String(pageId || 'default');
      const curIdx = global.CRM_PAGE_RR_CURSOR.get(pageKey) || 0;
      chosenStaffId = pool[curIdx % pool.length];
      global.CRM_PAGE_RR_CURSOR.set(pageKey, curIdx + 1);
    }

    // Persist assignment using conditional WHERE assigned_to IS NULL to guard cross-instance races
    if (supabase && leadId) {
      try {
        const { data: updatedRows } = await supabase
          .from('leads')
          .update({ assigned_to: chosenStaffId, updated_at: new Date().toISOString() })
          .eq('id', leadId)
          .is('assigned_to', null)
          .select('assigned_to');
        if (Array.isArray(updatedRows) && updatedRows.length === 0) {
          // Another worker won the DB race — read back the authoritative winner
          const { data: winner } = await supabase
            .from('leads')
            .select('assigned_to')
            .eq('id', leadId)
            .maybeSingle();
          if (winner && winner.assigned_to) {
            chosenStaffId = winner.assigned_to;
          }
        }
      } catch (e) {}
    }

    global.CRM_LEAD_ASSIGNMENTS.set(lockKey, chosenStaffId);
    return { assignedStaffId: chosenStaffId, alreadyAssigned: false };
  } finally {
    global.CRM_LEAD_ASSIGN_LOCKS.delete(lockKey);
    releaseLock();
  }
}

/**
 * Records webhook receipt/result into webhook_events (durable) and in-memory log.
 */
async function logWebhookEvent(supabase, { provider = 'zernio', eventType = 'leadgen', externalEventId, pageId = null, status = 'processed', payload = {}, errorMessage = null }) {
  const entry = {
    provider,
    event_type: eventType,
    external_event_id: String(externalEventId),
    page_id: pageId ? String(pageId) : null,
    status,
    payload,
    error_message: errorMessage,
    processed_at: new Date().toISOString()
  };

  global.CRM_WEBHOOK_LOG.unshift({ ...entry, created_at: entry.processed_at });
  if (global.CRM_WEBHOOK_LOG.length > 100) global.CRM_WEBHOOK_LOG.pop();

  if (supabase) {
    try {
      await safeDbUpsert(supabase, 'webhook_events', entry, 'provider,external_event_id');
    } catch (e) {}
  }
}

/**
 * Full idempotent Meta / Zernio Lead Ad Ingestion Pipeline.
 */
async function ingestLeadAdEvent(supabase, rawPayload = {}, options = {}) {
  const provider = options.provider || 'zernio';
  const payload = { ...rawPayload };
  const leadgenId = String(payload.leadgen_id || payload.meta_lead_id || payload.lead_id || payload.id || `zn_lead_${Date.now()}`);
  const rawPageId = payload.page_id || payload.pageId || (payload.page && payload.page.id) || null;
  const pageName = payload.page_name || payload.pageName || (payload.page && payload.page.name) || null;

  // 1. Fast in-memory idempotency check
  if (global.CRM_INGESTED_LEADS.has(leadgenId)) {
    const existing = global.CRM_INGESTED_LEADS.get(leadgenId);
    await logWebhookEvent(supabase, { provider, eventType: 'leadgen', externalEventId: `lead_${leadgenId}`, pageId: rawPageId, status: 'duplicate', payload });
    return { status: 'success', isDuplicate: true, lead: existing };
  }

  // 2. Database idempotency check
  if (supabase) {
    try {
      const { data: existingLead } = await supabase
        .from('leads')
        .select('*')
        .eq('meta_lead_id', leadgenId)
        .maybeSingle();
      if (existingLead) {
        global.CRM_INGESTED_LEADS.set(leadgenId, existingLead);
        await logWebhookEvent(supabase, { provider, eventType: 'leadgen', externalEventId: `lead_${leadgenId}`, pageId: rawPageId, status: 'duplicate', payload });
        return { status: 'success', isDuplicate: true, lead: { ...existingLead, name: existingLead.full_name } };
      }
    } catch (e) {}
  }

  // 3. Retrieve full lead details from Meta Graph API if webhook only supplied leadgen_id without answers
  const hasAnswers = Boolean(
    payload.full_name || payload.name || payload.email || payload.phone ||
    (Array.isArray(payload.field_data) && payload.field_data.length > 0) ||
    (Array.isArray(payload.answers) && payload.answers.length > 0)
  );
  let retrievalWarning = null;
  if (!hasAnswers && leadgenId && !leadgenId.startsWith('zn_lead_') && !leadgenId.startsWith('test_lead_')) {
    const pageToken = options.pageAccessToken
      || (rawPageId && global.META_PAGE_TOKENS && global.META_PAGE_TOKENS[rawPageId]?.accessToken)
      || process.env.META_ACCESS_TOKEN
      || process.env.META_SYSTEM_USER_ACCESS_TOKEN;

    if (pageToken) {
      try {
        const graphLead = await httpsRequest(`https://graph.facebook.com/v24.0/${encodeURIComponent(leadgenId)}?fields=id,created_time,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,form_id,field_data&access_token=${encodeURIComponent(pageToken)}`);
        if (graphLead) {
          if (Array.isArray(graphLead.field_data)) payload.field_data = graphLead.field_data;
          if (graphLead.campaign_id) payload.campaign_id = payload.campaign_id || graphLead.campaign_id;
          if (graphLead.campaign_name) payload.campaign_name = payload.campaign_name || graphLead.campaign_name;
          if (graphLead.adset_id) payload.adset_id = payload.adset_id || graphLead.adset_id;
          if (graphLead.adset_name) payload.adset_name = payload.adset_name || graphLead.adset_name;
          if (graphLead.ad_id) payload.ad_id = payload.ad_id || graphLead.ad_id;
          if (graphLead.ad_name) payload.ad_name = payload.ad_name || graphLead.ad_name;
          if (graphLead.form_id) payload.form_id = payload.form_id || graphLead.form_id;
          if (graphLead.created_time) payload.created_time = payload.created_time || graphLead.created_time;
        }
      } catch (gErr) {
        retrievalWarning = `Meta Graph retrieval failed (${gErr.message})`;
      }
    } else {
      retrievalWarning = 'Webhook supplied only leadgen_id and no Meta Page Access Token is available to retrieve form answers.';
    }
  }

  // 4. Parse ALL standard & custom answers (never discarding fields)
  const parsed = parseLeadFieldData(payload);

  // 5. Resolve page strictly — NEVER silently fall back to an unrelated random page!
  let resolvedPageDbId = null;
  let resolvedPagePublicId = rawPageId ? String(rawPageId) : null;
  let resolvedPageName = pageName || null;

  if (supabase && rawPageId) {
    try {
      const { data: matchedPages } = await supabase
        .from('facebook_pages')
        .select('id, page_id, page_name')
        .or(`page_id.eq.${rawPageId},id.eq.${rawPageId}`)
        .limit(1);
      if (matchedPages && matchedPages.length > 0) {
        resolvedPageDbId = matchedPages[0].id;
        resolvedPagePublicId = matchedPages[0].page_id || resolvedPagePublicId;
        resolvedPageName = resolvedPageName || matchedPages[0].page_name;
      }
    } catch (e) {}
  }

  const effectivePageId = resolvedPageDbId || resolvedPagePublicId || null;

  // 6. Separate Person/Contact from Enquiry (scoped strictly to effectivePageId)
  const contactRes = await findOrCreatePageScopedContact(supabase, {
    pageId: effectivePageId || 'unmapped',
    fullName: parsed.fullName,
    email: parsed.email,
    phone: parsed.phone
  });

  // 7. Attribution metadata (explicitly unknown when absent — never fabricated)
  const campaignId = payload.campaign_id || payload.campaignId || null;
  const campaignName = payload.campaign_name || payload.campaignName || null;
  const formId = payload.form_id || payload.formId || null;
  const formName = payload.form_name || payload.formName || null;
  const adId = payload.ad_id || payload.adId || null;
  const adName = payload.ad_name || payload.adName || null;
  const adsetId = payload.adset_id || payload.adsetId || payload.adgroup_id || null;
  const adsetName = payload.adset_name || payload.adsetName || null;
  const attributionStatus = (campaignId || campaignName || adId || formId) ? 'attributed' : 'unknown';

  const platform = payload.platform && String(payload.platform).toLowerCase().includes('insta')
    ? 'Instagram Lead Ad'
    : (payload.source || 'Facebook Lead Ad');

  const createdTime = payload.created_time
    ? (typeof payload.created_time === 'number' ? new Date(payload.created_time * 1000).toISOString() : new Date(payload.created_time).toISOString())
    : (payload.created_at || new Date().toISOString());

  // 8. Atomic page-scoped assignment (ONLY staff eligible for effectivePageId, else Unassigned null)
  const assignRes = await assignLeadAtomically(supabase, {
    leadId: leadgenId,
    pageId: effectivePageId,
    eligibleStaffIds: options.eligibleStaffIds || []
  });

  const insertData = {
    page_id: effectivePageId,
    contact_id: contactRes.contactId,
    meta_lead_id: leadgenId,
    full_name: parsed.fullName,
    email: parsed.email,
    phone: parsed.phone,
    source: platform,
    campaign_id: campaignId ? String(campaignId) : null,
    campaign_name: campaignName || null,
    form_id: formId ? String(formId) : null,
    form_name: formName || null,
    ad_id: adId ? String(adId) : null,
    ad_name: adName || null,
    adset_id: adsetId ? String(adsetId) : null,
    adset_name: adsetName || null,
    attribution_status: attributionStatus,
    custom_fields: parsed.customFields,
    vehicle_interest: parsed.vehicleInterest,
    budget_nzd: parsed.budgetNzd,
    payment_preference: parsed.paymentPreference,
    trade_in_info: parsed.tradeInInfo,
    buying_timeframe: parsed.buyingTimeframe,
    assigned_to: assignRes.assignedStaffId,
    status: 'New',
    messaging_eligible: false, // Lead Ad submission does NOT automatically open Messenger!
    next_action_note: 'Call / contact new Lead Ad enquiry',
    next_action_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    raw_data: payload,
    created_at: createdTime
  };

  let persistedLead = { id: toDeterministicUuid(`lead_${leadgenId}`), ...insertData, name: parsed.fullName };

  if (supabase && !options.skipDbWrite) {
    const { data: savedRows, error: dbErr, isDuplicate } = await safeDbUpsert(supabase, 'leads', insertData, 'meta_lead_id');
    if (isDuplicate) {
      await logWebhookEvent(supabase, { provider, eventType: 'leadgen', externalEventId: `lead_${leadgenId}`, pageId: effectivePageId, status: 'duplicate', payload });
      return { status: 'success', isDuplicate: true, lead: persistedLead };
    }
    if (!dbErr && savedRows && savedRows[0]) {
      persistedLead = { ...savedRows[0], name: savedRows[0].full_name || parsed.fullName };
    }

    // Create owner notification idempotently
    if (assignRes.assignedStaffId) {
      const notifId = toDeterministicUuid(`notif_lead_${leadgenId}`);
      await safeDbUpsert(supabase, 'notifications', {
        id: notifId,
        organization_id: '00000000-0000-0000-0000-000000000001',
        user_id: assignRes.assignedStaffId,
        title: `New Lead Ad: ${parsed.fullName}`,
        message: `${parsed.vehicleInterest ? parsed.vehicleInterest + ' · ' : ''}${resolvedPageName || effectivePageId || 'Connected Page'}`,
        type: 'new_lead',
        read: false,
        created_at: createdTime
      }, 'id').catch(() => {});
    }
  }

  global.CRM_INGESTED_LEADS.set(leadgenId, persistedLead);
  await logWebhookEvent(supabase, {
    provider,
    eventType: 'leadgen',
    externalEventId: `lead_${leadgenId}`,
    pageId: effectivePageId,
    status: retrievalWarning ? 'failed' : 'processed',
    payload,
    errorMessage: retrievalWarning
  });

  return {
    status: 'success',
    isDuplicate: false,
    lead: persistedLead,
    contact: contactRes.contact,
    isExistingContact: contactRes.isExistingContact,
    assignedStaffId: assignRes.assignedStaffId,
    warning: retrievalWarning
  };
}

module.exports = {
  normalizeEmail,
  normalizeNzPhone,
  parseLeadFieldData,
  findOrCreatePageScopedContact,
  assignLeadAtomically,
  logWebhookEvent,
  ingestLeadAdEvent
};
