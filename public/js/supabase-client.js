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

  init() {
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
        console.warn("[Supabase] Failed to initialize client. Running in Demo Mode.", err);
        this.isLive = false;
      }
    } else {
      this.isLive = false;
    }
  }

  initRealtimeSubscriptions() {
    if (!this.client) return;

    try {
      // Subscribe to inbound leads table updates via WebSocket
      this.realtimeChannel = this.client
        .channel('public:leads')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'leads' }, payload => {
          console.log('[Supabase Realtime] Inbound lead received:', payload.new);
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent('crm:remote_lead_received', { detail: payload.new }));
          }
        })
        .subscribe();
    } catch (e) {
      console.warn("[Supabase Realtime] Subscription error:", e);
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
