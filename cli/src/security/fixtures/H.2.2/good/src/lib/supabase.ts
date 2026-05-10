import { createClient } from '@supabase/supabase-js';
import { secureStorageAdapter } from '@/lib/secureStorage';

export const supabase = createClient('url', 'key', {
  auth: { storage: secureStorageAdapter },
});
