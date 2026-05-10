declare const u: { email: string };
declare const user: { phone: string };
declare const analytics: { track: (e: string, p: object) => void };

console.log('user signed in', { email: u.email });
console.error('payment failed for', user.phone);
analytics.track('signup_complete', { email: u.email });
