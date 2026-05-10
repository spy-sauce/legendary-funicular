// BAD: service_role in client code
import { createClient } from '@supabase/supabase-js';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
export const adminClient = createClient('url', SUPABASE_SERVICE_ROLE_KEY!);
