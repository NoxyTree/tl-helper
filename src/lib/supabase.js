import { createClient } from "@supabase/supabase-js";

// Shared client for the main site and the admin page. Both keys are public
// (anon) — write access is enforced by RLS (profiles.is_admin), never here.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;
