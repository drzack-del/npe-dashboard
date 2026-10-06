// The real sign-up backend: the AWS signup function (aws/functions/signup on branch signup-aws).
// The page keeps a random token in this browser so a practice can leave and come back; the
// server stores only a hash of it.
const KEY = 'cadenceiq-signup-token';
const readToken = () => { try { return window.localStorage.getItem(KEY); } catch { return null; } };
const writeToken = t => { try { t ? window.localStorage.setItem(KEY, t) : window.localStorage.removeItem(KEY); } catch {} };

export function apiBackend(url) {
  async function post(body) {
    let res;
    try {
      res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    } catch {
      throw new Error('Could not reach CadenceIQ. Check your internet connection and try again.');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error || 'Something went wrong. Please try again.'),
      { status: res.status, fieldErrors: data.fieldErrors, record: data.record });
    return data;
  }
  return {
    testMode: false,
    async get() {
      const token = readToken();
      if (!token) return null;
      try { return (await post({ action: 'get', token })).record; }
      catch (e) { if (e.status === 404) { writeToken(null); return null; } throw e; }
    },
    async start() {
      const { token, record } = await post({ action: 'start' });
      writeToken(token);
      return record;
    },
    async saveDetails(details) { return (await post({ action: 'save', token: readToken(), details })).record; },
    async sign(signature, planKey) { return (await post({ action: 'sign', token: readToken(), signature, planKey })).record; },
    async checkout(method) { return { url: (await post({ action: 'checkout', token: readToken(), method })).url }; },
    async reset() { writeToken(null); return null; },
  };
}
