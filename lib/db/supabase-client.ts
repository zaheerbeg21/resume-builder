import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | undefined;

/**
 * Returns a singleton Supabase client configured for browser environments.
 */
export function createClient(): SupabaseClient {
  if (client) return client;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'mock-anon-key';

  client = createBrowserClient(supabaseUrl, supabaseAnonKey, {
    isSingleton: true,
  });

  return client;
}
