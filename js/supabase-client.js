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

    // Check window/environment defaults
    return {
      url: (typeof window !== "undefined" && window.NEXT_PUBLIC_SUPABASE_URL) || "",
      anonKey: (typeof window !== "undefined" && window.NEXT_PUBLIC_SUPABASE_ANON_KEY) || ""
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
        this.client = null;
      }
    } else {
      this.isLive = false;
      this.client = null;
    }
  }

  /**
   * Supabase Realtime Subscription (Requirement 9)
   * Listens for incoming Meta leads from the webhook and pushes to staff screens without refresh
   */
  initRealtimeSubscriptions() {
    if (!this.client) return;

    try {
      if (this.realtimeChannel) {
        this.client.removeChannel(this.realtimeChannel);
      }

      this.realtimeChannel = this.client
        .channel("meta-crm-live-leads")
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "leads" },
          (payload) => {
            console.log("[Realtime] Incoming lead captured:", payload.new);
            if (typeof window !== "undefined") {
              const event = new CustomEvent("crm:realtime_lead_received", { detail: payload.new });
              window.dispatchEvent(event);
            }
          }
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "leads" },
          (payload) => {
            console.log("[Realtime] Lead updated remotely:", payload.new);
            if (typeof window !== "undefined") {
              const event = new CustomEvent("crm:realtime_lead_updated", { detail: payload.new });
              window.dispatchEvent(event);
            }
          }
        )
        .subscribe((status) => {
          console.log("[Realtime] Subscription status:", status);
        });
    } catch (e) {
      console.warn("[Realtime] Could not subscribe to Realtime channel:", e);
    }
  }

  // --- Real Supabase Authentication (Requirement 4) ---
  async loginWithPassword(email, password) {
    if (!this.isLive || !this.client) {
      return { success: false, mode: "demo", message: "Supabase not configured. Using local demo switcher." };
    }

    try {
      const { data, error } = await this.client.auth.signInWithPassword({ email, password });
      if (error) return { success: false, error: error.message };

      // Fetch user profile from public.users table to verify role
      const { data: profile } = await this.client
        .from("users")
        .select("*")
        .eq("id", data.user.id)
        .maybeSingle();

      return {
        success: true,
        user: { ...data.user, ...profile },
        session: data.session
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async logout() {
    if (this.isLive && this.client) {
      await this.client.auth.signOut();
    }
  }

  async getSession() {
    if (!this.isLive || !this.client) return null;
    const { data } = await this.client.auth.getSession();
    return data.session;
  }
}

// Global service instance
if (typeof window !== "undefined") {
  window.supabaseService = new SupabaseService();
}
