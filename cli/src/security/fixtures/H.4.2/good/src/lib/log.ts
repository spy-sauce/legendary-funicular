declare const u: { id: string; plan: string };
declare const analytics: { track: (e: string, p: object) => void };

console.log('user signed in', { user_id: u.id });
analytics.track('signup_complete', { user_id: u.id, plan: u.plan });
