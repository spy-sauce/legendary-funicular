// GOOD: anon key only
import { createClient } from '@supabase/supabase-js';
export const supabase = createClient('url', 'anonKey');
