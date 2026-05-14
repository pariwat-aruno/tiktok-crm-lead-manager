/**
 * Cloudflare Worker — proxy ระหว่าง LINE/LIFF กับ Apps Script
 *
 * ปัญหาที่แก้:
 *   Apps Script /exec คืน 302 redirect → script.googleusercontent.com
 *   - LINE webhook ไม่ follow redirect → reject
 *   - LIFF: domain เปลี่ยนหลัง redirect → liff.init() ค้าง (domain mismatch)
 *
 * Worker นี้ทำหน้าที่ proxy — domain workers.dev คงที่ ไม่ redirect:
 *   GET            → ดึง HTML จาก Apps Script (follow redirect ภายใน) → ส่งคืน 200
 *   POST + events  → LINE webhook → fire-and-forget → Apps Script
 *   POST + action  → apiCall จาก frontend → proxy → return JSON
 *
 * Setup:
 *   1. workers.cloudflare.com → Worker → Edit code → paste ไฟล์นี้
 *   2. Save and deploy
 *   3. ใน LINE Developers Console:
 *      - LIFF Endpoint URL = https://<worker>.workers.dev
 *      - Messaging API Webhook URL = https://<worker>.workers.dev
 *   4. ใน Apps Script: setWorkerUrl('https://<worker>.workers.dev')
 */

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyIffdlua-m7zW4iqfW81EbIVljPrW31I-OCGveSS1biImW-UpkywwslPf0LJAH2vKoWQ/exec';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // ───── POST ─────
    if (request.method === 'POST') {
      const body = await request.text();
      let parsed = {};
      try { parsed = JSON.parse(body); } catch (e) {}

      // LINE webhook (มี events[]) → ตอบ 200 ทันที + forward เบื้องหลัง
      if (Array.isArray(parsed.events)) {
        ctx.waitUntil(
          fetch(APPS_SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: body,
            redirect: 'follow',
          }).catch((e) => console.error('webhook forward failed:', e))
        );
        return new Response('OK', { status: 200 });
      }

      // apiCall จาก frontend → proxy แล้ว return JSON กลับ
      try {
        const resp = await fetch(APPS_SCRIPT_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: body,
          redirect: 'follow',
        });
        const text = await resp.text();
        return new Response(text, {
          status: 200,
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Access-Control-Allow-Origin': '*',
          },
        });
      } catch (e) {
        return new Response(JSON.stringify({ ok: false, error: 'proxy_error', detail: String(e) }), {
          status: 200,
          headers: { 'Content-Type': 'application/json; charset=utf-8' },
        });
      }
    }

    // ───── GET → proxy HTML ─────
    // liff.line.me/<id>/app → worker path /app → forward เป็น Apps Script pathInfo
    let target = APPS_SCRIPT_URL;
    if (url.pathname && url.pathname !== '/') {
      target += url.pathname; // /app, /id, /leave, /menu ...
    }
    target += url.search; // ?page=... &tab=... ฯลฯ

    try {
      const resp = await fetch(target, { redirect: 'follow' });
      const html = await resp.text();
      return new Response(html, {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
        },
      });
    } catch (e) {
      return new Response('Proxy error: ' + String(e), {
        status: 502,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }
  },
};
