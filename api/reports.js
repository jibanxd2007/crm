const { createClient } = require('@supabase/supabase-js');
const { resolveUser, createVercelHandler } = require('./_utils/index.js');

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

/**
 * Computes exact UTC offset string (e.g. "+13:00" during NZDT, "+12:00" during NZST)
 * for a given YYYY-MM-DD date in Pacific/Auckland, handling daylight saving accurately.
 */
function getAucklandOffsetForDate(dateStr) {
  try {
    const probe = new Date(`${dateStr}T12:00:00Z`);
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Pacific/Auckland',
      timeZoneName: 'shortOffset'
    }).formatToParts(probe);
    const tzPart = parts.find(p => p.type === 'timeZoneName')?.value || 'GMT+12';
    const match = tzPart.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/i);
    if (match) {
      const sign = match[1];
      const hrs = String(match[2]).padStart(2, '0');
      const mins = String(match[3] || '00').padStart(2, '0');
      return `${sign}${hrs}:${mins}`;
    }
  } catch (e) {}
  return '+12:00';
}

function formatAucklandYMD(dateObj) {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Pacific/Auckland',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(dateObj);
  } catch (e) {
    return dateObj.toISOString().slice(0, 10);
  }
}

function shiftYMD(ymd, deltaDays) {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + deltaDays));
  return dt.toISOString().slice(0, 10);
}

/**
 * Computes exact date boundaries in Pacific/Auckland (NZST / NZDT with automatic DST).
 */
function getNZDateRange(rangeType = 'last_7d', customStart = null, customEnd = null, referenceNow = new Date()) {
  const todayStr = formatAucklandYMD(referenceNow);
  let startDateStr = todayStr;
  let endDateStr = todayStr;

  if (rangeType === 'yesterday') {
    startDateStr = shiftYMD(todayStr, -1);
    endDateStr = startDateStr;
  } else if (rangeType === 'last_7d' || rangeType === 'last_7_days' || rangeType === '7d') {
    startDateStr = shiftYMD(todayStr, -6);
    endDateStr = todayStr;
  } else if (rangeType === 'this_month' || rangeType === 'month') {
    startDateStr = `${todayStr.slice(0, 7)}-01`;
    endDateStr = todayStr;
  } else if (rangeType === 'last_30d' || rangeType === '30d') {
    startDateStr = shiftYMD(todayStr, -29);
    endDateStr = todayStr;
  } else if (rangeType === 'custom' && customStart) {
    startDateStr = customStart;
    endDateStr = customEnd || todayStr;
  }

  const startOffset = getAucklandOffsetForDate(startDateStr);
  const endOffset = getAucklandOffsetForDate(endDateStr);

  return {
    timezone: 'Pacific/Auckland',
    startDate: startDateStr,
    endDate: endDateStr,
    startOffset,
    endOffset,
    startIso: `${startDateStr}T00:00:00.000${startOffset}`,
    endIso: `${endDateStr}T23:59:59.999${endOffset}`
  };
}

function computePercentile(sortedValues, p) {
  if (!Array.isArray(sortedValues) || sortedValues.length === 0) return null;
  if (sortedValues.length === 1) return Number(sortedValues[0].toFixed(1));
  const idx = (p / 100) * (sortedValues.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  const weight = idx - lo;
  const val = sortedValues[lo] * (1 - weight) + sortedValues[hi] * weight;
  return Number(val.toFixed(1));
}

function isWonStatus(s) {
  const v = String(s || '').toLowerCase();
  return v === 'won' || v === 'sold' || v === 'converted' || v === 'closed won';
}

function isLostStatus(s) {
  const v = String(s || '').toLowerCase();
  return v === 'lost' || v === 'closed lost';
}

function isQualifiedStatus(s) {
  const v = String(s || '').toLowerCase();
  return ['qualified', 'proposal sent', 'negotiation', 'booked', 'won', 'sold', 'converted'].includes(v);
}

function isContactedLead(l) {
  const v = String(l.status || '').toLowerCase();
  return Boolean(l.human_first_response_at || l.first_response_at || (v && v !== 'new' && v !== 'new lead'));
}

/**
 * Pure, deterministic dealership reporting engine.
 * Reconciles every total directly against the underlying authorised records.
 */
function computeDealershipReport({
  leads = [],
  conversations = [],
  insights = [],
  campaigns = [],
  pages = [],
  staff = [],
  tasks = [],
  dateBounds,
  userRole = 'admin',
  adAccountConnected = false
}) {
  const nowMs = Date.now();
  const pageNameById = new Map();
  pages.forEach(p => {
    const name = p.page_name || p.name || 'Connected Page';
    if (p.id) pageNameById.set(String(p.id), name);
    if (p.page_id) pageNameById.set(String(p.page_id), name);
    if (p.meta_page_id) pageNameById.set(String(p.meta_page_id), name);
  });

  const staffNameById = new Map();
  staff.forEach(s => {
    if (s.id) staffNameById.set(String(s.id), s.displayName || s.name || s.email || 'Sales Rep');
  });

  // 1. Enquiries vs Unique Contacts (distinct by contact_id, normalized phone, or normalized email)
  const uniqueContactKeys = new Set();
  leads.forEach(l => {
    if (l.contact_id) {
      uniqueContactKeys.add(`cid:${l.contact_id}`);
    } else if (l.phone) {
      uniqueContactKeys.add(`ph:${String(l.phone).replace(/[^\d+]/g, '')}`);
    } else if (l.email) {
      uniqueContactKeys.add(`em:${String(l.email).trim().toLowerCase()}`);
    } else {
      uniqueContactKeys.add(`lead:${l.id}`);
    }
  });

  const totalEnquiries = leads.length;
  const uniqueContacts = uniqueContactKeys.size;

  // 2. Acquisition-Cohort Funnel Counts
  const contactedLeads = leads.filter(isContactedLead);
  const qualifiedLeads = leads.filter(l => isQualifiedStatus(l.status));
  const bookedLeads = leads.filter(l => Boolean(l.appointment_at || l.appointment_status));
  const attendedLeads = leads.filter(l => String(l.appointment_status || '').toLowerCase() === 'attended');
  const wonLeads = leads.filter(l => isWonStatus(l.status));
  const lostLeads = leads.filter(l => isLostStatus(l.status));
  const unassignedLeads = leads.filter(l => !(l.assigned_to || l.assigned_staff_id || l.assignedStaffId));

  // Actual NZD Sale Value ONLY from recorded sale_value_nzd / lead_value (NEVER fabricated!)
  let totalSaleValueNzd = 0;
  let salesWithValueCount = 0;
  wonLeads.forEach(l => {
    const rawVal = l.sale_value_nzd !== undefined && l.sale_value_nzd !== null
      ? Number(l.sale_value_nzd)
      : (l.lead_value !== undefined && l.lead_value !== null ? Number(l.lead_value) : 0);
    if (!isNaN(rawVal) && rawVal > 0) {
      totalSaleValueNzd += rawVal;
      salesWithValueCount++;
    }
  });

  // 3. Human First Response Time (EXCLUDING automated acknowledgements!)
  const humanResponseMins = [];
  leads.forEach(l => {
    const humanTs = l.human_first_response_at || (!l.auto_ack_only ? l.first_response_at : null);
    if (!humanTs || !l.created_at) return;
    const diffMs = new Date(humanTs).getTime() - new Date(l.created_at).getTime();
    if (!isNaN(diffMs) && diffMs >= 0) {
      humanResponseMins.push(diffMs / 60000);
    }
  });
  humanResponseMins.sort((a, b) => a - b);
  const medianHumanResponseMin = computePercentile(humanResponseMins, 50);
  const p90HumanResponseMin = computePercentile(humanResponseMins, 90);

  // 4. Operational Activity: Overdue Follow-ups & Pipeline Age
  const overdueFollowups = tasks.filter(t => t.status !== 'Done' && t.dueDate && new Date(t.dueDate).getTime() < nowMs).length;
  const openLeads = leads.filter(l => !isWonStatus(l.status) && !isLostStatus(l.status));
  const openAgesDays = openLeads
    .filter(l => l.created_at)
    .map(l => Math.max(0, (nowMs - new Date(l.created_at).getTime()) / (1000 * 3600 * 24)));
  const avgPipelineAgeDays = openAgesDays.length > 0
    ? Number((openAgesDays.reduce((a, b) => a + b, 0) / openAgesDays.length).toFixed(1))
    : null;

  // Lost Reasons Breakdown
  const lostReasonCounts = {};
  lostLeads.forEach(l => {
    const reason = (l.loss_reason || 'Not recorded').trim();
    lostReasonCounts[reason] = (lostReasonCounts[reason] || 0) + 1;
  });

  // 5. Ad Spend & Platform-Reported vs CRM-Ingested Leads (No double-counting across pages)
  const hasInsightSpend = insights.length > 0;
  const hasCampaignSpend = campaigns.some(c => Number(c.total_spend || c.spend || 0) > 0);
  const hasSpendData = hasInsightSpend || hasCampaignSpend;

  let totalSpendNzd = null;
  let platformReportedLeads = null;
  if (hasInsightSpend) {
    totalSpendNzd = Number(insights.reduce((sum, ins) => sum + (parseFloat(ins.spend || 0) || 0), 0).toFixed(2));
    platformReportedLeads = insights.reduce((sum, ins) => sum + (parseInt(ins.leads || ins.lead_count || 0, 10) || 0), 0);
  } else if (hasCampaignSpend) {
    totalSpendNzd = Number(campaigns.reduce((sum, c) => sum + (parseFloat(c.total_spend || c.spend || 0) || 0), 0).toFixed(2));
    platformReportedLeads = campaigns.reduce((sum, c) => sum + (parseInt(c.leads || 0, 10) || 0), 0);
  }

  // Attributed ad leads & sales (strictly where campaign_id / ad_id / form_id or Lead Ad source exists)
  const adAttributedLeads = leads.filter(l => Boolean(l.campaign_id || l.campaign_name || l.ad_id || l.form_id || String(l.source || '').toLowerCase().includes('ad')));
  const adAttributedAttended = adAttributedLeads.filter(l => String(l.appointment_status || '').toLowerCase() === 'attended');
  const adAttributedSales = adAttributedLeads.filter(l => isWonStatus(l.status));

  const cplNzd = (totalSpendNzd !== null && totalEnquiries > 0) ? Number((totalSpendNzd / totalEnquiries).toFixed(2)) : null;
  const costPerAttendedApptNzd = (totalSpendNzd !== null && adAttributedAttended.length > 0) ? Number((totalSpendNzd / adAttributedAttended.length).toFixed(2)) : null;
  const costPerAttributedSaleNzd = (totalSpendNzd !== null && adAttributedSales.length > 0) ? Number((totalSpendNzd / adAttributedSales.length).toFixed(2)) : null;

  const adDataStatus = hasSpendData ? 'connected' : (adAccountConnected ? 'no_data' : 'not_connected');

  // 6. Page Breakdown
  const pageMap = new Map();
  pages.forEach(p => {
    const pid = String(p.id || p.page_id);
    pageMap.set(pid, {
      pageId: pid,
      pageName: p.page_name || p.name || 'Connected Page',
      enquiries: 0,
      uniqueContactSet: new Set(),
      contacted: 0,
      qualified: 0,
      booked: 0,
      attended: 0,
      dealsWon: 0,
      saleValueNzd: 0,
      conversations: 0,
      spend: hasSpendData ? 0 : null,
      cpl: null
    });
  });

  leads.forEach(l => {
    const pid = String(l.page_id || 'unassigned_page');
    if (!pageMap.has(pid)) {
      pageMap.set(pid, {
        pageId: pid,
        pageName: pageNameById.get(pid) || (pid === 'unassigned_page' ? 'Unknown / Unmapped Page' : `Page ${pid.slice(0, 8)}`),
        enquiries: 0,
        uniqueContactSet: new Set(),
        contacted: 0,
        qualified: 0,
        booked: 0,
        attended: 0,
        dealsWon: 0,
        saleValueNzd: 0,
        conversations: 0,
        spend: hasSpendData ? 0 : null,
        cpl: null
      });
    }
    const row = pageMap.get(pid);
    row.enquiries++;
    row.uniqueContactSet.add(l.contact_id || l.phone || l.email || l.id);
    if (isContactedLead(l)) row.contacted++;
    if (isQualifiedStatus(l.status)) row.qualified++;
    if (l.appointment_at || l.appointment_status) row.booked++;
    if (String(l.appointment_status || '').toLowerCase() === 'attended') row.attended++;
    if (isWonStatus(l.status)) {
      row.dealsWon++;
      const sv = Number(l.sale_value_nzd ?? l.lead_value ?? 0);
      if (!isNaN(sv) && sv > 0) row.saleValueNzd += sv;
    }
  });

  conversations.forEach(c => {
    const pid = String(c.page_id || 'unassigned_page');
    if (pageMap.has(pid)) pageMap.get(pid).conversations++;
  });

  if (hasSpendData) {
    insights.forEach(ins => {
      const pid = String(ins.page_id || '');
      if (pid && pageMap.has(pid)) {
        pageMap.get(pid).spend = Number(((pageMap.get(pid).spend || 0) + (parseFloat(ins.spend || 0) || 0)).toFixed(2));
      }
    });
  }

  const pageBreakdown = Array.from(pageMap.values()).map(p => ({
    pageId: p.pageId,
    pageName: p.pageName,
    leads: p.enquiries,
    enquiries: p.enquiries,
    uniqueContacts: p.uniqueContactSet.size,
    contacted: p.contacted,
    qualified: p.qualified,
    booked: p.booked,
    attended: p.attended,
    dealsWon: p.dealsWon,
    saleValueNzd: Number(p.saleValueNzd.toFixed(2)),
    conversations: p.conversations,
    spend: p.spend,
    cpl: (p.spend !== null && p.enquiries > 0) ? Number((p.spend / p.enquiries).toFixed(2)) : null
  })).sort((a, b) => b.enquiries - a.enquiries);

  // 7. Form Breakdown
  const formMap = new Map();
  leads.forEach(l => {
    const fKey = l.form_id || l.form_name || 'unknown_form';
    if (!formMap.has(fKey)) {
      formMap.set(fKey, {
        formId: l.form_id || null,
        formName: l.form_name || (l.form_id ? `Form #${l.form_id}` : 'Unknown / Non-Form Enquiry'),
        enquiries: 0,
        contacted: 0,
        booked: 0,
        dealsWon: 0
      });
    }
    const row = formMap.get(fKey);
    row.enquiries++;
    if (isContactedLead(l)) row.contacted++;
    if (l.appointment_at || l.appointment_status) row.booked++;
    if (isWonStatus(l.status)) row.dealsWon++;
  });
  const formBreakdown = Array.from(formMap.values()).sort((a, b) => b.enquiries - a.enquiries);

  // 8. Campaign Attribution Breakdown (honest Unknown bucket, separates platform vs CRM leads)
  const campMap = new Map();
  campaigns.forEach(c => {
    const cid = String(c.id || c.meta_campaign_id);
    campMap.set(cid, {
      campaignId: cid,
      campaignName: c.name || 'Unnamed Campaign',
      pageName: pageNameById.get(String(c.page_id)) || 'Connected Page',
      status: c.status || 'ACTIVE',
      spend: hasSpendData ? Number(parseFloat(c.total_spend || c.spend || 0).toFixed(2)) : null,
      platformLeads: hasSpendData ? (parseInt(c.leads || 0, 10) || 0) : null,
      crmLeads: 0,
      attended: 0,
      dealsWon: 0,
      cpl: null
    });
  });

  leads.forEach(l => {
    const cid = l.campaign_id ? String(l.campaign_id) : (l.campaign_name ? `name:${l.campaign_name}` : 'unknown_attribution');
    if (!campMap.has(cid)) {
      campMap.set(cid, {
        campaignId: l.campaign_id || null,
        campaignName: l.campaign_name || (l.campaign_id ? `Campaign ${l.campaign_id}` : 'Unknown / Unattributed'),
        pageName: pageNameById.get(String(l.page_id)) || 'Multiple / Unknown',
        status: cid === 'unknown_attribution' ? 'UNATTRIBUTED' : 'TRACKED',
        spend: null,
        platformLeads: null,
        crmLeads: 0,
        attended: 0,
        dealsWon: 0,
        cpl: null
      });
    }
    const row = campMap.get(cid);
    row.crmLeads++;
    if (String(l.appointment_status || '').toLowerCase() === 'attended') row.attended++;
    if (isWonStatus(l.status)) row.dealsWon++;
  });

  const campaignBreakdown = Array.from(campMap.values()).map(c => ({
    ...c,
    leads: c.crmLeads,
    cpl: (c.spend !== null && c.crmLeads > 0) ? Number((c.spend / c.crmLeads).toFixed(2)) : null
  })).sort((a, b) => b.crmLeads - a.crmLeads);

  // 9. Salesperson Performance Breakdown
  const staffMap = new Map();
  leads.forEach(l => {
    const sid = String(l.assigned_to || l.assigned_staff_id || l.assignedStaffId || 'unassigned');
    if (!staffMap.has(sid)) {
      staffMap.set(sid, {
        staffId: sid === 'unassigned' ? null : sid,
        staffName: sid === 'unassigned' ? 'Unassigned' : (staffNameById.get(sid) || `Staff ${sid.slice(0, 6)}`),
        enquiries: 0,
        contacted: 0,
        qualified: 0,
        booked: 0,
        attended: 0,
        dealsWon: 0,
        saleValueNzd: 0,
        responseTimesMin: []
      });
    }
    const row = staffMap.get(sid);
    row.enquiries++;
    if (isContactedLead(l)) row.contacted++;
    if (isQualifiedStatus(l.status)) row.qualified++;
    if (l.appointment_at || l.appointment_status) row.booked++;
    if (String(l.appointment_status || '').toLowerCase() === 'attended') row.attended++;
    if (isWonStatus(l.status)) {
      row.dealsWon++;
      const sv = Number(l.sale_value_nzd ?? l.lead_value ?? 0);
      if (!isNaN(sv) && sv > 0) row.saleValueNzd += sv;
    }
    const humanTs = l.human_first_response_at || (!l.auto_ack_only ? l.first_response_at : null);
    if (humanTs && l.created_at) {
      const dm = (new Date(humanTs).getTime() - new Date(l.created_at).getTime()) / 60000;
      if (!isNaN(dm) && dm >= 0) row.responseTimesMin.push(dm);
    }
  });

  const staffBreakdown = Array.from(staffMap.values()).map(s => {
    s.responseTimesMin.sort((a, b) => a - b);
    return {
      staffId: s.staffId,
      staffName: s.staffName,
      enquiries: s.enquiries,
      contacted: s.contacted,
      qualified: s.qualified,
      booked: s.booked,
      attended: s.attended,
      dealsWon: s.dealsWon,
      saleValueNzd: Number(s.saleValueNzd.toFixed(2)),
      medianResponseMin: computePercentile(s.responseTimesMin, 50),
      p90ResponseMin: computePercentile(s.responseTimesMin, 90)
    };
  }).sort((a, b) => b.enquiries - a.enquiries);

  const pct = (num, den) => (den > 0 ? Number(((num / den) * 100).toFixed(1)) : null);

  return {
    status: 'success',
    currency: 'NZD',
    timezone: 'Pacific/Auckland',
    reportMode: 'acquisition_cohort',
    dateBounds,
    adDataStatus,
    metadata: {
      scope: userRole === 'admin' ? 'All Authorised Dealership Pages' : 'Your Assigned Pages Only',
      cohortExplanation: 'Funnel counts reflect enquiries received during the selected Pacific/Auckland date range. Overdue follow-ups and open pipeline age reflect current live operational status.',
      attributionModel: 'Last-supplied Meta Lead Ad / Click-to-Message referral IDs. Enquiries without verified ad IDs are explicitly grouped under "Unknown / Unattributed".',
      metricDefinitions: {
        enquiries: 'Total lead/enquiry submissions received in the period (repeat enquiries from the same buyer counted separately).',
        uniqueContacts: 'Distinct buyers deduplicated by contact_id, normalized NZ phone, or email within the period.',
        medianHumanResponseMin: 'Median minutes from enquiry creation to first HUMAN rep reply (excludes automated acknowledgements).',
        p90HumanResponseMin: '90th-percentile human first-response time in minutes.',
        saleValueNzd: 'Sum of explicitly recorded NZD sale values on Won/Sold deals (unrecorded deals are NOT estimated).'
      },
      dataFreshness: new Date().toISOString()
    },
    summary: {
      totalLeads: totalEnquiries,
      totalEnquiries,
      uniqueContacts,
      contacted: contactedLeads.length,
      qualified: qualifiedLeads.length,
      booked: bookedLeads.length,
      attended: attendedLeads.length,
      dealsWon: wonLeads.length,
      dealsLost: lostLeads.length,
      unassignedLeads: unassignedLeads.length,
      overdueFollowups,
      avgPipelineAgeDays,
      totalConversations: conversations.length,
      totalWonValue: Number(totalSaleValueNzd.toFixed(2)),
      salesWithRecordedValue: salesWithValueCount,
      contactRatePct: pct(contactedLeads.length, totalEnquiries),
      qualificationRatePct: pct(qualifiedLeads.length, totalEnquiries),
      bookingRatePct: pct(bookedLeads.length, totalEnquiries),
      attendanceRatePct: pct(attendedLeads.length, bookedLeads.length),
      conversionRate: totalEnquiries > 0 ? `${((wonLeads.length / totalEnquiries) * 100).toFixed(1)}%` : '0.0%',
      saleRatePct: pct(wonLeads.length, totalEnquiries),
      medianHumanResponseMin,
      p90HumanResponseMin,
      humanResponsesSampleSize: humanResponseMins.length,
      totalSpend: totalSpendNzd,
      platformReportedLeads,
      crmAttributedAdLeads: adAttributedLeads.length,
      cpl: cplNzd,
      costPerAttendedAppointment: costPerAttendedApptNzd,
      costPerAttributedSale: costPerAttributedSaleNzd
    },
    lostReasons: lostReasonCounts,
    pageBreakdown,
    formBreakdown,
    campaignBreakdown,
    staffBreakdown,
    timestamp: new Date().toISOString()
  };
}

async function reportsHandler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-user-id, X-User-Id');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 1. Mandatory Authentication Check
  const user = resolveUser(req.headers);
  if (!user) {
    return res.status(401).json({ error: "Unauthorized: Authentication required" });
  }

  const requestedPage = req.query?.page_id || req.query?.pageId;
  const dateRangeType = (req.query?.date_range || req.query?.dateRange || 'last_7d').toLowerCase();
  const customStart = req.query?.start_date || req.query?.startDate;
  const customEnd = req.query?.end_date || req.query?.endDate;

  // 2. Strict Page-Scoping Authorization Check
  if (requestedPage && user.role !== 'admin' && !user.pages.includes('*')) {
    if (!user.pages.includes(requestedPage)) {
      return res.status(403).json({
        error: "Forbidden: Access denied to reports for unassigned page",
        requestedPage: requestedPage
      });
    }
  }

  const dateBounds = getNZDateRange(dateRangeType, customStart, customEnd);
  const supabase = getSupabaseAdmin();

  try {
    let tokenExpired = false;
    let tokenExpiryReason = null;
    let adAccountConnected = false;

    let leads = [];
    let conversations = [];
    let insights = [];
    let pagesList = [];
    let campaignsList = [];
    let staffList = [];

    if (supabase) {
      const { data: conn } = await supabase.from('meta_connections').select('*').maybeSingle();
      if (conn) {
        if (conn.is_active === false || (conn.last_error && conn.last_error.toLowerCase().includes('token'))) {
          tokenExpired = true;
          tokenExpiryReason = conn.last_error || 'Meta token is inactive or revoked';
        } else if (conn.token_expires_at && new Date(conn.token_expires_at) < new Date()) {
          tokenExpired = true;
          tokenExpiryReason = 'Meta access token has expired';
        } else {
          adAccountConnected = true;
        }
      }

      const isRestrictedStaff = user.role !== 'admin' && !user.pages.includes('*');
      if (isRestrictedStaff && (!user.pages || user.pages.length === 0)) {
        const emptyReport = computeDealershipReport({
          leads: [],
          conversations: [],
          insights: [],
          campaigns: [],
          pages: [],
          staff: [],
          dateBounds,
          userRole: user.role,
          adAccountConnected
        });
        return res.status(200).json({ ...emptyReport, tokenExpired, tokenExpiryReason });
      }

      // Fetch Pages
      let pagesQuery = supabase.from('facebook_pages').select('id, page_name, page_id');
      if (isRestrictedStaff) pagesQuery = pagesQuery.in('id', user.pages);
      else if (requestedPage) pagesQuery = pagesQuery.or(`id.eq.${requestedPage},page_id.eq.${requestedPage}`);
      const { data: pagesData } = await pagesQuery;
      pagesList = pagesData || [];

      // Fetch Leads within Pacific/Auckland Date Bounds
      let leadsQuery = supabase
        .from('leads')
        .select('*')
        .gte('created_at', dateBounds.startIso)
        .lte('created_at', dateBounds.endIso);
      if (isRestrictedStaff) leadsQuery = leadsQuery.in('page_id', user.pages);
      else if (requestedPage) leadsQuery = leadsQuery.eq('page_id', requestedPage);
      const { data: leadsData } = await leadsQuery;
      leads = leadsData || [];

      // Fetch Conversations within Pacific/Auckland Date Bounds
      let convsQuery = supabase
        .from('conversations')
        .select('id, page_id, last_message_at, unread_count, is_archived, created_at')
        .gte('last_message_at', dateBounds.startIso)
        .lte('last_message_at', dateBounds.endIso);
      if (isRestrictedStaff) convsQuery = convsQuery.in('page_id', user.pages);
      else if (requestedPage) convsQuery = convsQuery.eq('page_id', requestedPage);
      const { data: convsData } = await convsQuery;
      conversations = convsData || [];

      // Fetch Ad Insights & Campaigns (Managers only or page-scoped)
      let insightsQuery = supabase
        .from('ad_insights')
        .select('*')
        .gte('date_start', dateBounds.startDate)
        .lte('date_start', dateBounds.endDate);
      if (isRestrictedStaff) insightsQuery = insightsQuery.in('page_id', user.pages);
      else if (requestedPage) insightsQuery = insightsQuery.eq('page_id', requestedPage);
      const { data: insData } = await insightsQuery;
      insights = insData || [];

      let campsQuery = supabase.from('campaigns').select('*');
      if (isRestrictedStaff) campsQuery = campsQuery.in('page_id', user.pages);
      else if (requestedPage) campsQuery = campsQuery.eq('page_id', requestedPage);
      const { data: campsData } = await campsQuery;
      campaignsList = campsData || [];

      const { data: usersData } = await supabase.from('users').select('id, name, email, role');
      if (Array.isArray(usersData)) staffList = usersData;
    }

    const report = computeDealershipReport({
      leads,
      conversations,
      insights,
      campaigns: campaignsList,
      pages: pagesList,
      staff: staffList,
      dateBounds,
      userRole: user.role,
      adAccountConnected
    });

    return res.status(200).json({
      ...report,
      tokenExpired,
      tokenExpiryReason
    });
  } catch (err) {
    console.error('[Reports Error]:', err);
    return res.status(500).json({ error: err.message || 'Failed to generate dealership report' });
  }
}

const handler = createVercelHandler(reportsHandler);
handler.getNZDateRange = getNZDateRange;
handler.computeDealershipReport = computeDealershipReport;
handler.reportsHandler = reportsHandler;
module.exports = handler;
