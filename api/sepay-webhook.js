/**
 * Proxy: Sepay webhook  →  Google Apps Script.
 *
 * Sepay's webhook client treats Apps Script's 302 redirect (every GAS web-app
 * response is a 302 to script.googleusercontent.com) as a delivery failure
 * ("HTTP 302"). This function receives Sepay's POST, forwards it to GAS, and
 * returns a clean 200 that Sepay accepts.
 *
 * Sepay webhook URL  →  https://www.themassivecircle.com/api/sepay-webhook?key=<SHARED_SECRET>
 * The ?key is passed straight through; GAS is the authority that validates it.
 */

const GAS_EXEC =
  'https://script.google.com/macros/s/AKfycbzsyYmvOSnLOIhzgkKYEP4CkqasY22p1ENPM41Q7wSU_3ySEQnEjhPemzLAdNi0EZt-/exec';

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ success: false, error: 'POST only' });
    return;
  }

  const key = typeof req.query.key === 'string' ? req.query.key : '';
  if (!key) {
    res.status(401).json({ success: false, error: 'Missing key' });
    return;
  }

  // Sepay sends application/json → Vercel parses it into req.body (object).
  const payload =
    typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});

  const target = GAS_EXEC + '?key=' + encodeURIComponent(key);

  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 50000);
    const gasRes = await fetch(target, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      redirect: 'follow',
      signal: controller.signal,
    });
    clearTimeout(t);

    const text = await gasRes.text();
    // Always 200 to Sepay so it stops treating the call as failed. GAS has
    // already run doPost by this point regardless of what it returned.
    res.status(200);
    res.setHeader('Content-Type', 'application/json');
    res.send(text && text.trim() ? text : '{"success":true}');
  } catch (err) {
    // GAS still received and processed the POST; report soft-fail so Sepay may retry.
    res.status(502).json({ success: false, error: String(err && err.message || err) });
  }
}
