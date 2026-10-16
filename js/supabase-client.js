/**
 * Client-Side Supabase Production Integration Layer
 * 
 * Manages:
 * 1. Supabase Client initialization (Real PostgreSQL + Auth + Realtime)
 * 2. Realtime WebSocket subscriptions for live lead intake
 * 3. Supabase Auth session management (JWT)
 * 4. Graceful fallback to Demo Mode if Supabase credentials are not configured yet
 */

class SupabaseService {
  constructor() {
    this.storageKey = "meta_crm_supabase_config_v1";
    this.authSessionKey = "meta_crm_supabase_session_v1";
    this.config = this.loadConfig();
    this.client = null;
    this.realtimeChannel = null;
    this.isLive = false;

    this.init();
  }

  loadConfig() {
    try {
      const saved = localStorage.getItem(this.storageKey);
      if (saved) return JSON.parse(saved);
    } catch (e) {}

    return {
      url: (typeof window !== "undefined" && window.NEXT_PUBLIC_SUPABASE_URL) || "",
      anonKey: (typeof window !== "undefined" && (window.NEXT_PUBLIC_SUPABASE_ANON_KEY || window.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)) || ""
    };
  }

  saveConfig(url, anonKey) {
    this.config = { url: (url || "").trim(), anonKey: (anonKey || "").trim() };
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.config));
    } catch (e) {}
    this.init();
    return this.isLive;
  }

  async init() {
    // If config is missing, fetch from canonical /api/config
    if ((!this.config.url || !this.config.anonKey) && typeof window !== "undefined") {
      try {
        const res = await fetch("/api/config").catch(() => null);
        if (res && res.ok) {
          const cfg = await res.json();
          if (cfg.supabaseUrl && cfg.supabaseAnonKey) {
            this.config = { url: cfg.supabaseUrl, anonKey: cfg.supabaseAnonKey };
            try { localStorage.setItem(this.storageKey, JSON.stringify(this.config)); } catch (e) {}
          }
        }
      } catch (err) {}
    }

    // Check if Supabase JS SDK is loaded and credentials are provided
    if (typeof window !== "undefined" && window.supabase && this.config.url && this.config.anonKey) {
      try {
        this.client = window.supabase.createClient(this.config.url, this.config.anonKey, {
          auth: {
            persistSession: true,
            storageKey: this.authSessionKey
          }
        });
        this.isLive = true;
        console.log("[Supabase] Connected to live Supabase PostgreSQL instance:", this.config.url);
        this.initRealtimeSubscriptions();
      } catch (err) {
        console.warn("[Supabase] Failed to initialize client:", err);
        this.isLive = false;
      }
    } else {
      this.isLive = false;
    }
  }

  initRealtimeSubscriptions() {
    if (!this.client) return;

    try {
      let wasDisconnected = false;
      const onStatusChange = (channelName) => (status) => {
        if (status === 'SUBSCRIBED') {
          if (wasDisconnected) {
            wasDisconnected = false;
            console.log(`[Supabase Realtime] Reconnected on channel ${channelName}`);
            if (typeof window !== "undefined") {
              window.dispatchEvent(new CustomEvent('crm:realtime_reconnected', { detail: { channel: channelName } }));
            }
          }
        } else if (status === 'TIMED_OUT' || status === 'CHANNEL_ERROR' || status === 'CLOSED') {
          wasDisconnected = true;
          console.warn(`[Supabase Realtime] Disrupted on channel ${channelName}: ${status}`);
        }
      };

      // 1. Inbound Leads Realtime Stream
      this.realtimeChannel = this.client
        .channel('public:leads')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'leads' }, payload => {
          console.log('[Supabase Realtime] Inbound lead received:', payload.new);
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent('crm:remote_lead_received', { detail: payload.new }));
          }
        })
        .subscribe(onStatusChange('leads'));

      // 2. Inbound Messages Realtime Stream (Instant messaging across Facebook/Instagram)
      this.messagesChannel = this.client
        .channel('public:messages')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
          console.log('[Supabase Realtime] Inbound message received:', payload.new);
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent('crm:remote_message_received', { detail: payload.new }));
          }
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, payload => {
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent('crm:remote_message_updated', { detail: payload.new }));
          }
        })
        .subscribe(onStatusChange('messages'));

      // 3. Conversation Recency & Unread Counter Stream
      this.conversationsChannel = this.client
        .channel('public:conversations')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, payload => {
          console.log('[Supabase Realtime] Conversation updated:', payload.new);
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent('crm:remote_conversation_updated', { detail: payload.new }));
          }
        })
        .subscribe(onStatusChange('conversations'));
    } catch (e) {
      console.warn("[Supabase Realtime] Subscription error:", e);
    }
  }

  unsubscribeRealtime() {
    if (this.client) {
      if (this.realtimeChannel) this.client.removeChannel(this.realtimeChannel);
      if (this.messagesChannel) this.client.removeChannel(this.messagesChannel);
      if (this.conversationsChannel) this.client.removeChannel(this.conversationsChannel);
    }
  }

  // --- Auth helpers ---
  async login(email, password) {
    if (!this.isLive) {
      return { data: null, error: new Error("Supabase is not configured.") };
    }
    return await this.client.auth.signInWithPassword({ email, password });
  }

  async logout() {
    if (!this.isLive) return;
    return await this.client.auth.signOut();
  }

  async getSession() {
    if (!this.isLive) return null;
    const { data } = await this.client.auth.getSession();
    return data.session;
  }
}

// Global Singleton
if (typeof window !== "undefined") {
  window.supabaseService = new SupabaseService();
}
