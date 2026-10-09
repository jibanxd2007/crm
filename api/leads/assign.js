/**
 * Server-Side Lead Assignment Endpoint
 * 
 * Securely assigns or reassigns leads and logs activity records.
 */

import { createClient } from '@supabase/supabase-js';

function getSupabaseClient(authHeader) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader || '' } }
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { leadId, staffId, noteText } = req.body;
  if (!leadId || !staffId) {
    return res.status(400).json({ error: 'leadId and staffId are required' });
  }

  try {
    const supabase = getSupabaseClient(req.headers['authorization']);

    // Check user authentication
    const authHeader = req.headers['authorization'];
    if (!authHeader) {
      return res.status(401).json({ error: 'Unauthorized: Authentication required.' });
    }

    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return res.status(401).json({ error: 'Unauthorized: Invalid authentication credentials.' });
    }

    // Update lead
    const { data: updatedLead, error: updateError } = await supabase
      .from('leads')
      .update({
        assigned_to: staffId,
        updated_at: new Date().toISOString()
      })
      .eq('id', leadId)
      .select()
      .single();

    if (updateError) {
      return res.status(500).json({ error: updateError.message });
    }

    // Add activity record
    await supabase.from('lead_activity').insert({
      lead_id: leadId,
      user_id: user ? user.id : null,
      action: 'assigned',
      details: { new_assigned_to: staffId, note: noteText || 'Lead assigned' }
    });

    return res.status(200).json({ success: true, lead: updatedLead });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
