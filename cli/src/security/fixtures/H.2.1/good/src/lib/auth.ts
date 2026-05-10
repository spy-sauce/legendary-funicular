// GOOD: PKCE flow
import { useAuthRequest } from 'expo-auth-session';
const config = { responseType: 'code', usePKCE: true };
