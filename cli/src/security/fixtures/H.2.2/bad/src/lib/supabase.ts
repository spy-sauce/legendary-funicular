import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient('url', 'key', {
  auth: { storage: AsyncStorage },
});
