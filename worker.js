const enc = new TextEncoder(), now = () => Date.now() / 1000;
const b64u = b => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = s => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
const rnd = () => b64u(crypto.getRandomValues(new Uint8Array(6)));
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const safeEq = (a, b) => { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; };
const SEC = { "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY", "Referrer-Policy": "strict-origin-when-cross-origin", "Strict-Transport-Security": "max-age=31536000" };
const jout = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...SEC } });
const DEF = { name: "DINAR", version: "Terbaru", tg: "", notice: "", update_note: "", clicks: 5, waitSec: 2, faq: [], apk_key: "", apk_url: "", verify_url: "", verify_label: "Buka link verifikasi", verifyWait: 10 };
const cfg = async env => ({ ...DEF, ...((await env.CONFIG.get("config", "json")) || {}) });
const secret = env => env.TOKEN_SECRET || ("x" + env.ADMIN_PASSWORD);
async function hmac(env, data) { const k = await crypto.subtle.importKey("raw", enc.encode(secret(env)), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]); return b64u(await crypto.subtle.sign("HMAC", k, enc.encode(data))); }
async function sign(env, p) { const j = b64u(enc.encode(JSON.stringify(p))); return j + "." + await hmac(env, j); }
async function verify(env, t) {
  if (typeof t !== "string" || t.split(".").length !== 2) return null;
  const [j, m] = t.split("."); if (!safeEq(await hmac(env, j), m)) return null;
  let p; try { p = JSON.parse(new TextDecoder().decode(unb64u(j))); } catch { return null; }
  return p && p.exp > now() ? p : null;
}
const body = async req => { try { return await req.json(); } catch { return {}; } };

export default {
  async fetch(req, env) {
    const u = new URL(req.url), p = u.pathname, post = req.method === "POST";
    try {
      if (!env.ADMIN_PASSWORD && !env.TOKEN_SECRET && p.startsWith("/api/")) return jout({ error: "Server belum dikonfigurasi (secret)" }, 503);
      if (p === "/api/config") return pubConfig(env);
      if (p === "/api/start" && post) return jout({ token: await sign(env, { n: 0, t: now(), exp: now() + 1800, k: rnd() }) });
      if (p === "/api/link" && post) { const q = await verify(env, (await body(req)).token); if (!q || q.n == null) return jout({ error: "Sesi tidak valid" }, 401); if (!q.v) q.v = now(); return jout({ token: await sign(env, q) }); }
      if (p === "/api/step" && post) return step(req, env);
      if (p === "/api/download") return download(env, u);
      if (p === "/admin" || p === "/admin/") return admin(req, env);
      if (p === "/" || p === "/index.html") return home(req, env);
      return env.ASSETS.fetch(req);
    } catch (e) { return jout({ error: "Kesalahan server" }, 500); }
  }
};

async function pubConfig(env) {
  const c = await cfg(env);
  return jout({ version: c.version, tg: c.tg, notice: c.notice, updateNote: c.update_note, clicks: +c.clicks, waitSec: +c.waitSec, faq: c.faq, verifyUrl: c.verify_url, verifyLabel: c.verify_label, verifyWait: +c.verifyWait, ready: !!(c.apk_key || c.apk_url) });
}
async function step(req, env) {
  const p = await verify(env, (await body(req)).token);
  if (!p || p.n == null) return jout({ error: "Sesi tidak valid, muat ulang halaman" }, 401);
  const c = await cfg(env), t = now();
  if (!c.apk_key && !c.apk_url) return jout({ error: "File belum tersedia" }, 503);
  if (t - p.t < c.waitSec - 0.4) return jout({ error: "Terlalu cepat, tunggu sebentar" }, 429);
  if (c.verify_url && p.n === 0 && (!p.v || t - p.v < c.verifyWait - 1)) return jout({ error: "Selesaikan verifikasi link dulu" }, 403);
  const n = p.n + 1;
  if (n >= c.clicks) return jout({ n, download: "/api/download?t=" + await sign(env, { dl: 1, exp: t + 300, k: rnd() }) });
  return jout({ n, token: await sign(env, { n, t, exp: t + 1800, k: p.k }) });
}
async function download(env, u) {
  const p = await verify(env, u.searchParams.get("t"));
  if (!p || !p.dl) return new Response("Link tidak valid atau sudah kedaluwarsa. Ulangi verifikasi.", { status: 403 });
  const c = await cfg(env);
  if (c.apk_key && env.APK) {
    const o = await env.APK.get(c.apk_key);
    if (!o) return new Response("File tidak ditemukan.", { status: 404 });
    const fn = (c.name || "game").replace(/[^A-Za-z0-9_-]+/g, "_");
    return new Response(o.body, { headers: { "Content-Type": "application/vnd.android.package-archive", "Content-Disposition": `attachment; filename="${fn}.apk"`, "Content-Length": String(o.size), "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  }
  if (/^https:\/\//.test(c.apk_url)) return Response.redirect(c.apk_url, 302);
  return new Response("File belum tersedia.", { status: 404 });
}
async function home(req, env) {
  const c = await cfg(env), nm = esc(c.name.trim() || "DINAR");
  const ini = esc(nm.split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase() || "GM");
  let h = await (await env.ASSETS.fetch(new Request(new URL("/", req.url)))).text();
  h = h.replaceAll("{{NAME}}", nm).replaceAll("{{INI}}", ini);
  return new Response(h, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", ...SEC, "Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'" } });
}

/* ---------- ADMIN ---------- */
async function loginLimit(env, req) { // batas kasar via KV (hanya untuk login, agar kuota tulis KV aman)
  const ip = req.headers.get("CF-Connecting-IP") || "0", key = `rl:login:${ip}:${Math.floor(now() / 900)}`;
  const c = parseInt(await env.CONFIG.get(key) || "0") + 1; await env.CONFIG.put(key, String(c), { expirationTtl: 1800 }); return c <= 5;
}
const dig = async s => b64u(await crypto.subtle.digest("SHA-256", enc.encode(s)));
const num = (v, a, b, d) => { const x = parseFloat(v); return Math.max(a, Math.min(b, isNaN(x) ? d : x)); };
const httpsOr = u => { u = (u || "").trim(); return u === "" || /^https:\/\/[^\s<>"']+$/.test(u) ? u : false; };
const parseFaq = s => String(s || "").trim().split(/\r?\n\s*\r?\n/).map(b => b.trim().match(/^Q:\s*(.+?)\r?\n+A:\s*([\s\S]+)$/)).filter(Boolean).map(m => ({ q: m[1].trim(), a: m[2].trim() })).slice(0, 30);
const faqText = f => f.map(x => `Q: ${x.q}\nA: ${x.a}`).join("\n\n");
function page(inner, status = 200) {
  const css = "body{font:16px system-ui;background:#f3f6f4;margin:0}main{max-width:720px;margin:auto;padding:24px}.c{background:#fff;border-radius:16px;padding:22px;margin-bottom:16px}label{display:block;font-size:13px;color:#566;margin:14px 0 4px}input,textarea,select{width:100%;padding:11px;border:1px solid #cfd8d2;border-radius:10px;font:inherit;box-sizing:border-box}button{padding:12px 22px;border:0;border-radius:99px;background:#08a62a;color:#fff;font:600 16px system-ui;cursor:pointer}.g{display:grid;grid-template-columns:1fr 1fr;gap:12px}.e{color:#c22}.k{color:#080}small{color:#566}";
  return new Response(`<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>Admin</title><style>${css}</style><main>${inner}</main>`, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", ...SEC, "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'" } });
}
async function admin(req, env) {
  if (!env.ADMIN_PASSWORD) return page("<div class=c><h2>Belum dikonfigurasi</h2><p>Atur secret <b>ADMIN_PASSWORD</b> di Settings → Variables and Secrets.</p></div>", 503);
  const ck = Object.fromEntries((req.headers.get("Cookie") || "").split(/;\s*/).map(x => x.split(/=(.*)/s).slice(0, 2)));
  const sess = await verify(env, ck.gr_admin), post = req.method === "POST", form = post ? await req.formData() : null, act = form && form.get("act");
  let msg = "", ok = "";
  if (act === "login") {
    if (!await loginLimit(env, req)) msg = "Terlalu banyak percobaan. Coba lagi 15 menit lagi.";
    else if (safeEq(await dig(form.get("pw") || ""), await dig(env.ADMIN_PASSWORD))) {
      const tok = await sign(env, { adm: 1, exp: now() + 28800, k: rnd() });
      return new Response(null, { status: 303, headers: { Location: "/admin", "Set-Cookie": `gr_admin=${tok}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=28800` } });
    } else msg = "Kata sandi salah.";
  }
  if (!sess || !sess.adm) return page(`<div class=c><h2>Masuk admin</h2>${msg ? `<p class=e>${esc(msg)}</p>` : ""}<form method=post><input type=hidden name=act value=login><input type=password name=pw placeholder="Kata sandi" required autofocus><p><button>Masuk</button></p></form></div>`);
  const csrf = (await hmac(env, "csrf" + sess.k)).slice(0, 32), good = form && safeEq(String(form.get("csrf") || ""), csrf);
  if (act === "logout" && good) return new Response(null, { status: 303, headers: { Location: "/admin", "Set-Cookie": "gr_admin=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0" } });
  let c = await cfg(env);
  if (act === "save") {
    if (!good) msg = "Sesi kedaluwarsa, muat ulang.";
    else {
      const tg = httpsOr(form.get("tg")), url = httpsOr(form.get("apk_url")), vu = httpsOr(form.get("verify_url")), key = String(form.get("apk_key") || "");
      if (tg === false || url === false || vu === false) msg = "Link harus diawali https://";
      else if (key && !(env.APK && key.toLowerCase().endsWith(".apk") && await env.APK.head(key))) msg = "File APK tidak ditemukan di R2.";
      else {
        c = { ...c, name: String(form.get("name") || "").trim().slice(0, 40) || "DINAR", version: String(form.get("version") || "").trim().slice(0, 30), tg, apk_url: url, apk_key: key, notice: String(form.get("notice") || "").trim().slice(0, 200), update_note: String(form.get("update_note") || "").trim().slice(0, 120), clicks: Math.round(num(form.get("clicks"), 1, 20, 5)), waitSec: num(form.get("waitSec"), 0, 30, 2), verify_url: vu, verify_label: String(form.get("verify_label") || "").trim().slice(0, 40) || "Buka link verifikasi", verifyWait: num(form.get("verifyWait"), 0, 120, 10), faq: parseFaq(form.get("faq")) };
        await env.CONFIG.put("config", JSON.stringify(c)); ok = "Tersimpan dan langsung aktif di website.";
      }
    }
  }
  const keys = env.APK ? (await env.APK.list({ limit: 200 })).objects.map(o => o.key).filter(k => k.toLowerCase().endsWith(".apk")) : [];
  const opt = ["", ...keys].map(k => `<option value="${esc(k)}"${k === c.apk_key ? " selected" : ""}>${k ? esc(k) : "(tidak ada)"}</option>`).join("");
  const f = (l, n, v, x = "") => `<label>${l}</label><input name=${n} value="${esc(v)}" ${x}>`;
  return page(`<div class=c><h2>Panel admin</h2>${msg ? `<p class=e>${esc(msg)}</p>` : ""}${ok ? `<p class=k>${esc(ok)}</p>` : ""}
<form method=post><input type=hidden name=act value=save><input type=hidden name=csrf value="${csrf}">
${f("Nama game / situs", "name", c.name, "maxlength=40")}
<label>File APK dari R2 ${env.APK ? "(upload ke bucket R2 lewat dashboard Cloudflare dulu)" : "(R2 tidak aktif, pakai link eksternal di bawah)"}</label><select name=apk_key>${opt}</select>
${f("atau link APK eksternal (https), dipakai bila tidak memilih file R2", "apk_url", c.apk_url)}
<div class=g><div>${f("Versi", "version", c.version)}</div><div>${f("Link Telegram", "tg", c.tg)}</div>
<div>${f("Jumlah klik verifikasi (1-20)", "clicks", c.clicks, "type=number min=1 max=20")}</div><div>${f("Tunggu per klik, detik (0-30)", "waitSec", c.waitSec, "type=number step=0.5 min=0 max=30")}</div></div>
${f("Pengumuman (kosong = sembunyikan)", "notice", c.notice)}${f("Catatan update (banner untuk pengunjung versi lama)", "update_note", c.update_note, "maxlength=120")}
${f("Link verifikasi (https, kosong = nonaktif)", "verify_url", c.verify_url)}
<div class=g><div>${f("Teks tombol verifikasi", "verify_label", c.verify_label)}</div><div>${f("Tunggu setelah buka link, detik (0-120)", "verifyWait", c.verifyWait, "type=number min=0 max=120")}</div></div>
<label>FAQ (baris Q: pertanyaan, baris A: jawaban, pisahkan item dengan baris kosong)</label><textarea name=faq rows=10>${esc(faqText(c.faq))}</textarea>
<p><button>Simpan &amp; publikasikan</button></p></form>
<form method=post><input type=hidden name=act value=logout><input type=hidden name=csrf value="${csrf}"><button style="background:#555">Keluar</button></form></div>`);
}
