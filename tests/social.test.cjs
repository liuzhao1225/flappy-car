const test = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { readFileSync, readdirSync } = require('node:fs');

function database() {
  const sqlite = new DatabaseSync(':memory:');
  for (const file of readdirSync('migrations').filter(name=>name.endsWith('.sql')).sort()) sqlite.exec(readFileSync('migrations/'+file,'utf8'));
  const DB = { prepare(sql) {
    const statement = sqlite.prepare(sql); let args=[];
    return {
      bind(...values) { args=values; return this; },
      async first() { return statement.get(...args) || null; },
      async all() { return { results:statement.all(...args) }; },
      async run() { const result=statement.run(...args); return { meta:{ changes:Number(result.changes) } }; },
    };
  } };
  return { DB, sqlite };
}

test('two players persist identity, request/accept friends, rank actual runs, and share public scores', async()=>{
  const worker=(await import('../api/worker.mjs')).default;
  const { DB,sqlite }=database();
  const call=async(path,method='GET',token,data)=>{
    const request=new Request('https://flappy-car-api.xiaoke.ai/api'+path,{method,headers:{Origin:'https://flappy-car.xiaoke.ai',...(token?{Authorization:'Bearer '+token}:{}),...(data?{'Content-Type':'application/json'}:{})},...(data?{body:JSON.stringify(data)}:{})});
    const response=await worker.fetch(request,{DB});
    return { status:response.status, data:await response.json(), headers:response.headers };
  };
  const a=(await call('/players','POST')).data, b=(await call('/players','POST')).data;
  assert.notEqual(a.player.id,b.player.id); assert.equal(a.token.length,64);
  assert.equal((await call('/me','GET')).status,401);
  assert.equal((await call('/me','PATCH',a.token,{name:'长名字测试车手'})).data.name,'长名字测试车手');
  assert.equal((await call('/me','GET',a.token)).data.name,'长名字测试车手');
  assert.equal((await call('/me','PATCH',a.token,{name:' '})).status,400);
  assert.equal((await call('/friends','POST',a.token,{id:a.player.id})).status,400);
  assert.equal((await call('/friends','POST',a.token,{id:b.player.id})).status,201);
  assert.equal((await call('/friends','POST',b.token,{id:a.player.id})).status,409);
  assert.equal((await call('/friends','GET',b.token)).data[0].status,'pending');
  assert.equal((await call('/friends/'+b.player.id,'PATCH',a.token)).status,404);
  assert.equal((await call('/friends/'+a.player.id,'PATCH',b.token)).status,200);
  assert.equal((await call('/friends','GET',a.token)).data[0].status,'accepted');
  const { body }=await import('../api/replay.mjs');
  const run=(await call('/runs','POST',a.token)).data;
  const game=new globalThis.FlappyModel.Game({body,random:globalThis.flappyRandom(run.seed)});
  game.ready(); game.flap(); let frames=0;
  while(game.state!=='over') { game.step(); frames++; }
  sqlite.prepare('UPDATE runs SET started_at=? WHERE id=?').run(Date.now()-frames/60*1000,run.id);
  const payload={frames,flaps:[0],score:game.score};
  assert.equal((await call('/runs/'+run.id,'POST',b.token,payload)).status,403);
  assert.equal((await call('/runs/'+run.id,'POST',a.token,{...payload,score:99999})).status,400);
  assert.equal((await call('/runs/'+run.id,'POST',a.token,payload)).status,200);
  assert.equal((await call('/runs/'+run.id,'POST',a.token,payload)).status,200,'network retry is idempotent');
  const shared=await call('/runs/'+run.id);
  assert.equal(shared.data.player.id,a.player.id); assert.equal(shared.data.score,0);
  assert.match(shared.data.inviteCode,/^[a-f0-9]{32}$/);
  assert.equal(shared.headers.get('Access-Control-Allow-Origin'),'https://flappy-car.xiaoke.ai');
  assert.ok(!JSON.stringify(shared.data).includes(a.token)); assert.ok(!JSON.stringify(shared.data).includes('token_hash'));
  const board=(await call('/leaderboard?scope=friends','GET',b.token)).data.players;
  assert.equal(board.length,1); assert.equal(board[0].id,a.player.id); assert.equal(board[0].rank,1);
  assert.equal((await call('/leaderboard?scope=all')).data.players.length,1);
  assert.equal((await call('/friends/'+a.player.id,'DELETE',b.token)).status,200);
  assert.equal((await call('/leaderboard?scope=friends','GET',b.token)).data.players.length,0);
  const badOrigin=await worker.fetch(new Request('https://api.example/api/players',{method:'POST',headers:{Origin:'https://untrusted.example'}}),{DB});
  assert.equal(badOrigin.status,403);
  sqlite.close();
});

test('QR invitations add both players immediately, upgrade requests, and tolerate repeated or self scans',async()=>{
  const worker=(await import('../api/worker.mjs')).default;
  const {DB,sqlite}=database();
  const call=async(path,token,method='POST',data)=>{
    const response=await worker.fetch(new Request('https://api.example/api'+path,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),...(data?{'Content-Type':'application/json'}:{})},...(data?{body:JSON.stringify(data)}:{})}),{DB});
    return {status:response.status,data:await response.json()};
  };
  const a=(await call('/players')).data,b=(await call('/players')).data,c=(await call('/players')).data;
  const code=sqlite.prepare('SELECT invite_code FROM players WHERE id=?').get(a.player.id).invite_code;
  assert.match(code,/^[a-f0-9]{32}$/); assert.notEqual(code,a.token);
  assert.equal((await call('/invites/'+code)).status,401);
  assert.equal((await call('/invites/'+'0'.repeat(32),b.token)).status,404);
  assert.equal((await call('/invites/'+code,a.token)).data.self,true);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM friendships').get().n,0);
  assert.equal((await call('/invites/'+code,b.token)).data.status,'accepted');
  assert.equal((await call('/invites/'+code,b.token)).status,200);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM friendships').get().n,1);
  assert.equal((await call('/friends',a.token,'GET')).data[0].id,b.player.id);
  assert.equal((await call('/friends',b.token,'GET')).data[0].id,a.player.id);
  await call('/friends',c.token,'POST',{id:a.player.id});
  assert.equal((await call('/invites/'+code,c.token)).data.status,'accepted');
  assert.ok((await call('/friends',a.token,'GET')).data.every(f=>f.status==='accepted'));
  sqlite.close();
});

test('invite migration preserves existing players and creates distinct invitation codes',()=>{
  const sqlite=new DatabaseSync(':memory:');
  sqlite.exec(readFileSync('migrations/0001_social.sql','utf8'));
  sqlite.prepare('INSERT INTO players VALUES (?,?,?,?)').run('00000001','Existing','private-hash',123);
  sqlite.prepare('INSERT INTO players VALUES (?,?,?,?)').run('00000002','Existing 2','private-hash-2',124);
  sqlite.exec(readFileSync('migrations/0002_friend_invites.sql','utf8'));
  const players=sqlite.prepare('SELECT * FROM players ORDER BY id').all();
  assert.equal(players[0].token_hash,'private-hash'); assert.equal(players[0].created_at,123);
  assert.match(players[0].invite_code,/^[a-f0-9]{32}$/); assert.notEqual(players[0].invite_code,players[1].invite_code);
  sqlite.close();
});

test('replay rejects incomplete, forged and malformed flight records',async()=>{
  const { replay,body }=await import('../api/replay.mjs');
  assert.throws(()=>replay(1,100,[0,0]),/格式无效/);
  assert.throws(()=>replay(1,10,[0]),/尚未完成/);
  const game=new globalThis.FlappyModel.Game({body,random:globalThis.flappyRandom(7)});
  game.ready(); game.flap(); let frames=0;
  while(game.state!=='over') {game.step();frames++;}
  assert.equal(replay(7,frames,[0]),game.score);
  assert.throws(()=>replay(7,frames+1,[0]),/结束帧不一致/);
  assert.throws(()=>replay(7,frames,[0,frames-1]),/结束后仍有操作/);
});

test('seeded replay preserves a complete 32-point flight and ranked ties',async()=>{
  const { replay,body }=await import('../api/replay.mjs');
  const game=new FlappyModel.Game({body,random:flappyRandom(4)}); game.ready();
  let frames=0,flaps=[];
  while(game.state!=='over' && frames<4000) {
    const pipe=game.pipes.find(p=>p.x+52>=game.birdBody().bounds.left);
    if(game.state==='ready'||(game.state==='playing'&&game.bird.velocity>0&&game.bird.y>=(pipe?pipe.top+48:256)+10)) {game.flap();flaps.push(frames);}
    game.step();frames++;
  }
  assert.equal(game.score,32); assert.equal(replay(4,frames,flaps),32);
  const worker=(await import('../api/worker.mjs')).default;
  const {DB,sqlite}=database();
  for(const [i,score] of [32,32,10].entries()) {
    const id='0000000'+i;
    sqlite.prepare('INSERT INTO players (id,name,token_hash,created_at) VALUES (?,?,?,?)').run(id,'Test '+i,'hash'+i,0);
    sqlite.prepare('INSERT INTO runs VALUES (?,?,?,?,?,?,?)').run('run'+i,id,4,0,score,1000,frames);
  }
  const response=await worker.fetch(new Request('https://api.example/api/leaderboard'),{DB});
  assert.deepEqual((await response.json()).players.map(p=>p.rank),[1,1,3]);
  sqlite.close();
});
