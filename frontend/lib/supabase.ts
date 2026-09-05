import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Check environment variables first
const envUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const envAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

function getStoredConfig(): { url: string; anonKey: string } {
  if (typeof window === "undefined") {
    return { url: envUrl, anonKey: envAnonKey };
  }
  try {
    const localUrl = localStorage.getItem("jalari_supabase_url") || "";
    const localKey = localStorage.getItem("jalari_supabase_anon_key") || "";
    return {
      url: localUrl || envUrl,
      anonKey: localKey || envAnonKey,
    };
  } catch {
    return { url: envUrl, anonKey: envAnonKey };
  }
}

const initialConfig = getStoredConfig();

export const isSupabaseConfigured = Boolean(initialConfig.url && initialConfig.anonKey);

export function createSupabaseClient(url?: string, anonKey?: string): SupabaseClient | null {
  const targetUrl = url || getStoredConfig().url;
  const targetKey = anonKey || getStoredConfig().anonKey;

  if (!targetUrl || !targetKey) {
    return null;
  }

  return createClient(targetUrl, targetKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
}

export const supabase = isSupabaseConfigured
  ? createSupabaseClient(initialConfig.url, initialConfig.anonKey)
  : null;

export function saveRuntimeSupabaseConfig(url: string, anonKey: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (!url.trim() || !anonKey.trim()) {
      localStorage.removeItem("jalari_supabase_url");
      localStorage.removeItem("jalari_supabase_anon_key");
      return false;
    }
    localStorage.setItem("jalari_supabase_url", url.trim());
    localStorage.setItem("jalari_supabase_anon_key", anonKey.trim());
    return true;
  } catch {
    return false;
  }
}

export function clearRuntimeSupabaseConfig(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem("jalari_supabase_url");
    localStorage.removeItem("jalari_supabase_anon_key");
  } catch {
    // ignore
  }
}
