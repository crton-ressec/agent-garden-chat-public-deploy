const ADMIN_EMAIL = "luybenbrandon35@gmail.com";
const TORONTO = "America/Toronto";
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const id = () => crypto.randomUUID();
function localDay(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TORONTO, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  return `${parts.find((p) => p.type === "year").value}-${parts.find((p) => p.type === "month").value}-${parts.find((p) => p.type === "day").value}`;
}
function rankFor(rows, target) {
  const sorted = [...rows].sort((a, b) => Number(b.points || 0) - Number(a.points || 0) || String(a.created_at).localeCompare(String(b.created_at)));
  const index = sorted.findIndex((row) => row.id === target.id);
  return { rank: index < 0 ? null : index + 1, total: sorted.length };
}
function isAdmin(request, env, body = {}) {
  const subject = String(request.headers.get("x-agent-garden-user") || body.adminUserId || "");
  const email = String(request.headers.get("x-agent-garden-email") || body.adminEmail || "").toLowerCase();
  return Boolean(env.ADMIN_EMAIL ? email === String(env.ADMIN_EMAIL).toLowerCase() : email === ADMIN_EMAIL) || Boolean(env.ADMIN_SUBJECT && subject === String(env.ADMIN_SUBJECT));
}
async function ensureUser(db, body) {
  const subject = String(body.userId || body.subject || "").slice(0, 240);
  if (!subject) throw new Error("userId is required");
  const email = body.email ? String(body.email).slice(0, 320) : null;
  const existing = await db.prepare("SELECT * FROM waitlist_users WHERE subject_ref = ?1").bind(subject).first();
  if (existing) return existing;
  const record = { id: `wl_${id()}`, subject_ref: subject, email_ref: email };
  await db.prepare("INSERT INTO waitlist_users (id, subject_ref, email_ref) VALUES (?1, ?2, ?3)").bind(record.id, record.subject_ref, record.email_ref).run();
  return await db.prepare("SELECT * FROM waitlist_users WHERE id = ?1").bind(record.id).first();
}
async function status(request, env, body) {
  const user = await ensureUser(env.DB, body);
  const rows = (await env.DB.prepare("SELECT id, points, created_at, status FROM waitlist_users WHERE status != 'frozen'").all()).results || [];
  const position = rankFor(rows, user);
  const day = localDay();
  const gift = await env.DB.prepare("SELECT points_awarded, streak_after FROM waitlist_gifts WHERE waitlist_user_id = ?1 AND local_day = ?2").bind(user.id, day).first();
  return json({ configured: true, user: { id: user.id, points: user.points, status: user.status, unlockedAt: user.unlocked_at, streak: user.streak }, rank: position.rank, total: position.total, dailyGift: { opened: Boolean(gift), pointsAwarded: gift?.points_awarded || 0, streak: gift?.streak_after || user.streak }, unlock: { waveSize: Number(env.WAITLIST_ADMIT_PER_DAY || 10), nextWave: "daily", honestMessage: user.status === "unlocked" ? "You are admitted." : "Admission is based on points, creation time, and the next available admit wave." } });
}
async function openGift(request, env, body) {
  const user = await ensureUser(env.DB, body);
  if (user.status === "frozen") return json({ error: "Waitlist access is frozen." }, 403);
  const day = localDay();
  const existing = await env.DB.prepare("SELECT id FROM waitlist_gifts WHERE waitlist_user_id = ?1 AND local_day = ?2").bind(user.id, day).first();
  if (existing) return status(request, env, body);
  const roll = crypto.getRandomValues(new Uint32Array(1))[0] % 100;
  const points = roll < 5 ? 100 : roll < 25 ? 50 : roll < 70 ? 25 : 10;
  const streak = Number(user.streak || 0) + 1;
  await env.DB.batch([
    env.DB.prepare("INSERT INTO waitlist_gifts (id, waitlist_user_id, local_day, points_awarded, streak_after) VALUES (?1, ?2, ?3, ?4, ?5)").bind(`gift_${id()}`, user.id, day, points, streak),
    env.DB.prepare("UPDATE waitlist_users SET points = points + ?1, streak = ?2, last_gift_opened_at = datetime('now'), updated_at = datetime('now') WHERE id = ?3").bind(points, streak, user.id),
  ]);
  return status(request, env, body);
}
async function admin(request, env, path, body) {
  if (!isAdmin(request, env, body)) return json({ error: "Admin access required." }, 403);
  if (path === "/v1/waitlist/stats") {
    const stats = await env.DB.prepare("SELECT status, COUNT(*) AS count FROM waitlist_users GROUP BY status").all();
    return json({ stats: stats.results || [] });
  }
  if (path === "/v1/admin/waitlist/admit-wave") {
    const count = Math.max(1, Math.min(1000, Number(body.count || env.WAITLIST_ADMIT_PER_DAY || 10)));
    const selected = (await env.DB.prepare("SELECT id FROM waitlist_users WHERE status = 'queued' ORDER BY points DESC, created_at ASC LIMIT ?1").bind(count).all()).results || [];
    if (selected.length) {
      await env.DB.prepare(`UPDATE waitlist_users SET status = 'unlocked', unlocked_at = datetime('now'), updated_at = datetime('now') WHERE id IN (${selected.map(() => "?").join(",")})`).bind(...selected.map((row) => row.id)).run();
    }
    return json({ admitted: selected.length, ids: selected.map((row) => row.id) });
  }
  if (path === "/v1/admin/waitlist/force-unlock") {
    const target = await env.DB.prepare("SELECT * FROM waitlist_users WHERE id = ?1 OR subject_ref = ?1").bind(String(body.userId || body.subject || "")).first();
    if (!target) return json({ error: "Waitlist user not found." }, 404);
    await env.DB.prepare("UPDATE waitlist_users SET status = 'unlocked', unlocked_at = datetime('now'), updated_at = datetime('now') WHERE id = ?1").bind(target.id).run();
    return json({ ok: true, userId: target.id, status: "unlocked" });
  }
  if (path === "/v1/admin/waitlist/adjust-points") {
    const target = await env.DB.prepare("SELECT * FROM waitlist_users WHERE id = ?1 OR subject_ref = ?1").bind(String(body.userId || body.subject || "")).first();
    if (!target) return json({ error: "Waitlist user not found." }, 404);
    const points = Math.max(0, Math.min(1000000, Number(body.points || 0)));
    await env.DB.prepare("UPDATE waitlist_users SET points = ?1, updated_at = datetime('now') WHERE id = ?2").bind(points, target.id).run();
    return json({ ok: true, userId: target.id, points });
  }
  return json({ error: "Unknown waitlist admin route." }, 404);
}
export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type,x-agent-garden-key,x-agent-garden-user,x-agent-garden-email", "access-control-allow-methods": "GET,POST,OPTIONS" } });
    const url = new URL(request.url);
    if (env.WORKER_KEY && request.headers.get("x-agent-garden-key") !== env.WORKER_KEY) return json({ error: "Unauthorized" }, 401);
    let body = {};
    try { body = request.method === "GET" ? Object.fromEntries(url.searchParams) : await request.json(); } catch { body = {}; }
    try {
      if (url.pathname === "/v1/waitlist/status" || url.pathname.startsWith("/v1/waitlist/status/")) return status(request, env, { ...body, userId: body.userId || decodeURIComponent(url.pathname.split("/").pop()) });
      if (url.pathname === "/v1/waitlist/gift" && request.method === "POST") return openGift(request, env, body);
      if (url.pathname.startsWith("/v1/admin/waitlist/") || url.pathname === "/v1/waitlist/stats") return admin(request, env, url.pathname, body);
      return json({ error: "Not found" }, 404);
    } catch (error) { return json({ error: error.message || "Waitlist request failed" }, 400); }
  },
};
