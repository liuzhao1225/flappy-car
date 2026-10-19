import { replay } from './replay.mjs';

const origins = new Set(['https://flappy-car.xiaoke.ai', 'https://liuzhao1225.github.io', 'http://127.0.0.1:5173', 'http://localhost:5173']);
const playerFields = 'id, name, created_at';
const bestSQL = '(SELECT MAX(score) FROM runs WHERE player_id=p.id)';
class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const fail = (status, message) => { throw new HttpError(status, message); };
const json = (value, status = 200) => Response.json(value, { status });
const hash = async value => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map(v => v.toString(16).padStart(2, '0')).join('');
const tokenOf = request => request.headers.get('Authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
const idValid = id => /^[A-F0-9]{8}$/.test(id);
async function input(request) {
  if (Number(request.headers.get('Content-Length')) > 150000) fail(413, '提交内容过大');
  const text = await request.text();
  if (text.length > 150000) fail(413, '提交内容过大');
  try { return JSON.parse(text); } catch { fail(400, '请求需要有效 JSON'); }
}
async function actor(request, db, optional = false) {
  const token = tokenOf(request);
  if (!token && optional) return null;
  if (!token) fail(401, '缺少车手身份，请恢复账号');
  const player = await db.prepare(`SELECT ${playerFields} FROM players WHERE token_hash=?`).bind(await hash(token)).first();
  if (!player) fail(401, '身份无效，请检查恢复码');
  return player;
}
async function profile(db, id) {
  const player = await db.prepare(`SELECT ${playerFields} FROM players WHERE id=?`).bind(id).first();
  if (!player) fail(404, '没有找到这个车手 ID');
  const best = await db.prepare('SELECT id, score FROM runs WHERE player_id=? AND score IS NOT NULL ORDER BY score DESC, finished_at ASC LIMIT 1').bind(id).first();
  const ranking = best ? await db.prepare('SELECT COUNT(*)+1 AS rank FROM (SELECT player_id FROM runs WHERE score IS NOT NULL GROUP BY player_id HAVING MAX(score)>?)').bind(best.score).first() : null;
  return { ...player, best: best?.score ?? 0, bestRun: best?.id ?? null, rank: ranking?.rank ?? null };
}
async function route(request, env) {
  const db = env.DB, url = new URL(request.url), path = url.pathname;
  const method = request.method;
  if (path === '/api/health' && method === 'GET') {
    await db.prepare('SELECT COUNT(*) FROM players').first();
    return json({ ok: true });
  }
  if (path === '/api/players' && method === 'POST') {
    const id = crypto.randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase();
    const token = crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '');
    const invite = crypto.randomUUID().replaceAll('-', '');
    await db.prepare('INSERT INTO players (id,name,token_hash,created_at,invite_code) VALUES (?,?,?,?,?)').bind(id, `车手 ${id.slice(-4)}`, await hash(token), Date.now(), invite).run();
    return json({ player: await profile(db, id), token }, 201);
  }
  if (path === '/api/me') {
    const me = await actor(request, db);
    if (method === 'PATCH') {
      const { name } = await input(request);
      if (typeof name !== 'string' || !name.trim() || [...name.trim()].length > 16 || /[\p{Cc}\p{Cf}]/u.test(name)) fail(400, '昵称需为 1–16 个字符');
      await db.prepare('UPDATE players SET name=? WHERE id=?').bind(name.trim(), me.id).run();
    } else if (method !== 'GET') fail(405, '不支持这个操作');
    return json(await profile(db, me.id));
  }
  const playerMatch = path.match(/^\/api\/players\/([A-F0-9]{8})$/);
  if (playerMatch && method === 'GET') {
    const player = await profile(db, playerMatch[1]);
    const me = await actor(request, db, true);
    const relation = me ? await db.prepare('SELECT sender,receiver,status FROM friendships WHERE (sender=? AND receiver=?) OR (receiver=? AND sender=?)').bind(me.id, player.id, me.id, player.id).first() : null;
    return json({ ...player, relation });
  }
  if (path === '/api/runs' && method === 'POST') {
    const me = await actor(request, db);
    const latest = await db.prepare('SELECT started_at FROM runs WHERE player_id=? ORDER BY started_at DESC LIMIT 1').bind(me.id).first();
    if (latest && Date.now() - latest.started_at < 1000) fail(429, '请稍等一秒再开始');
    const run = { id: crypto.randomUUID(), seed: crypto.getRandomValues(new Uint32Array(1))[0] };
    await db.prepare('INSERT INTO runs (id,player_id,seed,started_at) VALUES (?,?,?,?)').bind(run.id, me.id, run.seed, Date.now()).run();
    return json(run, 201);
  }
  const runMatch = path.match(/^\/api\/runs\/([a-f0-9-]{36})$/);
  if (runMatch) {
    const run = await db.prepare('SELECT r.*,p.invite_code AS inviteCode FROM runs r JOIN players p ON p.id=r.player_id WHERE r.id=?').bind(runMatch[1]).first();
    if (!run) fail(404, '这次成绩不存在');
    if (method === 'POST') {
      const me = await actor(request, db);
      if (me.id !== run.player_id) fail(403, '只能提交自己的成绩');
      if (run.score === null) {
        const { frames, flaps, score } = await input(request);
        if (frames / 60 * 1000 > Date.now() - run.started_at + 2000) fail(400, '飞行时长与记录不符');
        let verified;
        try { verified = replay(run.seed, frames, flaps); } catch (error) { fail(400, error.message); }
        if (score !== verified) fail(400, '分数与飞行记录不符');
        await db.prepare('UPDATE runs SET score=?,finished_at=?,frames=? WHERE id=? AND score IS NULL').bind(verified, Date.now(), frames, run.id).run();
        run.score = verified; run.finished_at = Date.now();
      }
    } else if (method !== 'GET') fail(405, '不支持这个操作');
    if (run.score === null) fail(404, '这次飞行还没有成绩');
    return json({ id: run.id, score: run.score, finishedAt: run.finished_at, inviteCode:run.inviteCode, player: await profile(db, run.player_id) });
  }
  const inviteMatch = path.match(/^\/api\/invites\/([a-f0-9]{32})$/);
  if (inviteMatch && method === 'POST') {
    const me = await actor(request, db);
    const inviter = await db.prepare('SELECT id,name FROM players WHERE invite_code=?').bind(inviteMatch[1]).first();
    if (!inviter) fail(404, '好友邀请无效，请重新扫描二维码');
    if (inviter.id === me.id) return json({ self:true, friend:inviter });
    // The shared QR is an invitation. Either direction of an existing request
    // becomes accepted; repeated scans preserve one unordered friendship pair.
    await db.prepare("INSERT INTO friendships (sender,receiver,status,created_at) VALUES (?,?,'accepted',?) ON CONFLICT DO UPDATE SET status='accepted'").bind(inviter.id, me.id, Date.now()).run();
    return json({ status:'accepted', friend:inviter });
  }
  if (path === '/api/friends' && method === 'GET') {
    const me = await actor(request, db);
    const { results } = await db.prepare(`SELECT p.id,p.name,COALESCE(${bestSQL},0) AS best,f.sender,f.receiver,f.status FROM friendships f JOIN players p ON p.id=CASE WHEN f.sender=? THEN f.receiver ELSE f.sender END WHERE f.sender=? OR f.receiver=? ORDER BY f.created_at DESC`).bind(me.id, me.id, me.id).all();
    return json(results);
  }
  if (path === '/api/friends' && method === 'POST') {
    const me = await actor(request, db), { id } = await input(request);
    if (typeof id !== 'string' || !idValid(id)) fail(400, '请输入 8 位车手 ID');
    if (id === me.id) fail(400, '这是你自己的 ID');
    await profile(db, id);
    const existing = await db.prepare('SELECT status FROM friendships WHERE (sender=? AND receiver=?) OR (sender=? AND receiver=?)').bind(me.id, id, id, me.id).first();
    if (existing) fail(409, existing.status === 'accepted' ? '已经是好友了' : '已有待处理的好友申请');
    await db.prepare('INSERT INTO friendships (sender,receiver,status,created_at) VALUES (?,?,?,?)').bind(me.id, id, 'pending', Date.now()).run();
    return json({ status: 'pending' }, 201);
  }
  const friendMatch = path.match(/^\/api\/friends\/([A-F0-9]{8})$/);
  if (friendMatch && ['PATCH', 'DELETE'].includes(method)) {
    const me = await actor(request, db), id = friendMatch[1];
    const result = method === 'PATCH'
      ? await db.prepare("UPDATE friendships SET status='accepted' WHERE sender=? AND receiver=? AND status='pending'").bind(id, me.id).run()
      : await db.prepare('DELETE FROM friendships WHERE (sender=? AND receiver=?) OR (sender=? AND receiver=?)').bind(id, me.id, me.id, id).run();
    if (!result.meta.changes) fail(404, '这条好友申请或关系不存在');
    return json({ ok: true });
  }
  if (path === '/api/leaderboard' && method === 'GET') {
    const friendsOnly = url.searchParams.get('scope') === 'friends';
    const me = await actor(request, db, !friendsOnly);
    const filter = friendsOnly ? `AND (p.id=? OR p.id IN (SELECT CASE WHEN sender=? THEN receiver ELSE sender END FROM friendships WHERE status='accepted' AND (sender=? OR receiver=?)))` : '';
    let statement = db.prepare(`SELECT p.id,p.name,${bestSQL} AS best,RANK() OVER (ORDER BY ${bestSQL} DESC) AS rank FROM players p WHERE ${bestSQL} IS NOT NULL ${filter} ORDER BY best DESC,p.id ASC LIMIT 100`);
    if (friendsOnly) statement = statement.bind(me.id, me.id, me.id, me.id);
    return json({ players: (await statement.all()).results, me: me ? await profile(db, me.id) : null });
  }
  fail(404, '接口不存在');
}
export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    if (origin && !origins.has(origin)) return json({ error: '不允许此来源' }, 403);
    let response;
    try {
      response = request.method === 'OPTIONS' ? new Response(null, { status: 204 }) : await route(request, env);
    } catch (error) {
      if (!error.status) console.error('Flappy Car API failed', request.method, new URL(request.url).pathname, error);
      response = json({ error: error.status ? error.message : '成绩服务出错，请重试' }, error.status || 500);
    }
    if (origin) response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Vary', 'Origin');
    response.headers.set('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type,Authorization');
    response.headers.set('Cache-Control', 'no-store');
    response.headers.set('X-Content-Type-Options', 'nosniff');
    return response;
  }
};
