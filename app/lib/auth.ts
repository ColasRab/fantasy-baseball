import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type AuthUser = {
  id?: string;
  email: string;
  name: string;
  picture?: string;
  provider: "supabase" | "dev";
};

export type SavedGamePayload = {
  teams: unknown[];
  freeAgents: unknown[];
  selections: Record<string, unknown>;
};

const authKey = "diamond-manager-auth-user";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let browserClient: SupabaseClient | null = null;

export function isSupabaseConfigured() {
  return Boolean(supabaseUrl && supabaseKey);
}

export function getSupabaseClient() {
  if (!supabaseUrl || !supabaseKey) return null;
  browserClient ??= createClient(supabaseUrl, supabaseKey);
  return browserClient;
}

export function loadAuthUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(authKey);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

export function saveAuthUser(user: AuthUser) {
  window.localStorage.setItem(authKey, JSON.stringify(user));
}

export function clearAuthUser() {
  window.localStorage.removeItem(authKey);
}

export async function getSupabaseAuthUser() {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user?.email) return null;
  return {
    id: data.user.id,
    email: data.user.email.toLowerCase(),
    name:
      (data.user.user_metadata?.full_name as string | undefined) ??
      (data.user.user_metadata?.name as string | undefined) ??
      data.user.email,
    picture: data.user.user_metadata?.avatar_url as string | undefined,
    provider: "supabase" as const,
  };
}

export async function signInWithGoogle() {
  const supabase = getSupabaseClient();
  if (!supabase) return { error: "Supabase env vars are not configured." };
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${window.location.origin}/office`,
    },
  });
  return { error: error?.message };
}

export async function signInWithMagicLink(email: string) {
  const supabase = getSupabaseClient();
  if (!supabase) return { error: "Supabase env vars are not configured." };
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${window.location.origin}/office`,
    },
  });
  return { error: error?.message };
}

export async function signOutSupabase() {
  const supabase = getSupabaseClient();
  if (supabase) {
    await supabase.auth.signOut();
  }
}

export async function loadRemoteSave(userId: string) {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("manager_saves")
    .select("save_data")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.warn("Supabase save load failed", error.message);
    return null;
  }
  return (data?.save_data as SavedGamePayload | undefined) ?? null;
}

export async function saveRemoteSave(user: AuthUser, saveData: SavedGamePayload) {
  if (!user.id) return;
  const supabase = getSupabaseClient();
  if (!supabase) return;
  const { error } = await supabase.from("manager_saves").upsert({
    user_id: user.id,
    email: user.email,
    save_data: saveData,
    updated_at: new Date().toISOString(),
  });
  if (error) {
    console.warn("Supabase save failed", error.message);
  }
}
