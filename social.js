(() => {
  'use strict';
  const local = ['localhost', '127.0.0.1'].includes(location.hostname);
  const API = local ? 'http://127.0.0.1:8787' : 'https://flappy-car-api.xiaoke.ai';
  const identityKey = 'flappy-car.identity.v1', pendingKey = 'flappy-car.pending.v1';
  const $ = selector => document.querySelector(selector);
  const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]);
  let identity = JSON.parse(localStorage.getItem(identityKey) || 'null');
  let identityPromise, lastResult;
  let currentTab = 'profile', rankScope = 'all';
  let previousFocus;
  const modal = document.createElement('dialog'); modal.className = 'social'; modal.id = 'social-dialog';
  modal.innerHTML = `<header class="social-header"><h2>FLAPPY CAR<small>车手俱乐部</small></h2><button class="close" aria-label="关闭车手俱乐部">×</button></header><nav class="social-nav" aria-label="车手俱乐部"><button data-tab="profile">我的车手</button><button data-tab="friends">好友</button><button data-tab="rank">排行榜</button></nav><p class="notice" role="status" aria-live="polite"></p><div class="social-content"></div>`;
  document.body.append(modal);
  const notice = (message = '', error = false, root = modal) => {
    const node = root.querySelector('.notice'); node.textContent = message; node.dataset.error = String(error);
  };
  const report = (error, root = modal) => { console.error(error); notice(error.message, true, root); };
  function saveIdentity(value) { localStorage.setItem(identityKey, JSON.stringify(value)); identity = value; }
  async function api(path, { method = 'GET', data, token = identity?.token } = {}) {
    const response = await fetch(API + '/api' + path, { method, headers: { ...(data ? { 'Content-Type':'application/json' } : {}), ...(token ? { Authorization:`Bearer ${token}` } : {}) }, ...(data ? { body:JSON.stringify(data) } : {}), signal:AbortSignal.timeout(15000) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `成绩服务返回 ${response.status}`);
    return result;
  }
  async function ensureIdentity() {
    if (identity) return identity;
    if (!identityPromise) identityPromise = api('/players', { method:'POST' }).then(value => { saveIdentity(value); return value; }).finally(() => { identityPromise = null; });
    return identityPromise;
  }
  function status(message) { const node = $('#social-status'); if (node) node.textContent = message; }
  function resultURL(id) { const url = new URL('share.html', location.href); url.search = ''; url.hash = ''; url.searchParams.set('r', id); return url.href; }
  async function submitPending() {
    const pending = JSON.parse(localStorage.getItem(pendingKey) || 'null');
    if (!pending) return;
    if (pending.playerId !== identity?.player.id) throw new Error('有另一位车手未上传的成绩，请先恢复该车手身份');
    const result = await api(`/runs/${pending.id}`, { method:'POST', data:pending });
    localStorage.removeItem(pendingKey); lastResult = result;
    const share = $('#share-result'); if (share) share.hidden = false;
    status('');
    return result;
  }
  async function prepareRound() {
    status('连接成绩服务…');
    await ensureIdentity();
    await submitPending();
    const run = await api('/runs', { method:'POST' });
    status('');
    const share = $('#share-result'); if (share) share.hidden = true;
    return run;
  }
  async function completeRound(record) {
    localStorage.setItem(pendingKey, JSON.stringify({ ...record, playerId:identity.player.id }));
    status('正在保存成绩…');
    try { return await submitPending(); }
    catch (error) { console.error(error); status(`成绩未上传：${error.message}。打开车手页面重试。`); }
  }
  function close() { modal.close(); previousFocus?.focus(); }
  modal.querySelector('.close').onclick = close;
  modal.addEventListener('cancel', () => { previousFocus?.focus(); });
  async function show(tab = 'profile') {
    previousFocus = document.activeElement;
    if (!modal.open) modal.showModal();
    currentTab = tab;
    await renderTab();
  }
  function attachActions(root) {
    root.querySelectorAll('button[data-action]').forEach(button => button.onclick = async () => {
      if (button.disabled) return;
      button.disabled = true; notice('', false, root.closest('.share-shell') || modal);
      try { await action(button.dataset.action, button.dataset.id, root); }
      catch (error) { report(error, root.closest('.share-shell') || modal); }
      finally { button.disabled = false; }
    });
  }
  async function renderTab() {
    const content = modal.querySelector('.social-content');
    modal.querySelector('.social-nav').hidden = currentTab === 'share';
    modal.querySelectorAll('[data-tab]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.tab === currentTab)));
    notice(); content.innerHTML = '<p>读取中…</p>';
    try {
      await ensureIdentity();
      if (currentTab === 'profile') {
        const me = await api('/me'); saveIdentity({ ...identity, player:me });
        const oldBest = Number(localStorage.getItem("flappy-bird-classic.best") || 0);
        content.innerHTML = `<h3>${esc(me.name)}</h3><p class="identity">车手 ID · <b>${me.id}</b></p><div class="stats"><div class="stat-box"><small>最高分</small><b class="stat">${me.best}</b></div><div class="stat-box"><small>总榜排名</small><b class="stat">${me.rank ? '#' + me.rank : '—'}</b></div></div>${oldBest > me.best ? `<p class="hint">本机旧纪录 ${oldBest} 分；榜单收录新版上传的成绩。</p>` : ''}<form id="nickname-form"><label for="nickname">昵称</label><div class="form-row"><input id="nickname" value="${esc(me.name)}" maxlength="16" required autocomplete="nickname"><button class="primary" type="submit">保存昵称</button></div></form><div class="actions" style="margin-top:20px">${me.bestRun ? `<button data-action="share" data-id="${me.bestRun}">分享最高分</button>` : ''}${localStorage.getItem(pendingKey) ? '<button data-action="retry">重试上传成绩</button>' : ''}</div><details><summary>换设备 / 恢复车手</summary><p class="hint">恢复码可找回昵称、好友和成绩，请私下保存。清除浏览器数据后需要它恢复身份。</p><button data-action="recovery">查看恢复码</button><code class="recovery" hidden></code><form id="restore-form" style="margin-top:20px"><label for="restore-code">已有恢复码</label><div class="form-row"><input id="restore-code" type="password" autocomplete="off" required placeholder="粘贴恢复码"><button type="submit">恢复车手</button></div></form></details>`;
        content.querySelector('#nickname-form').onsubmit = async event => {
          event.preventDefault(); const button = event.submitter; button.disabled = true;
          try { const player = await api('/me', { method:'PATCH', data:{ name:$('#nickname').value } }); saveIdentity({ ...identity, player }); await renderTab(); notice('昵称已保存'); }
          catch (error) { report(error); } finally { button.disabled = false; }
        };
        content.querySelector('#restore-form').onsubmit = async event => {
          event.preventDefault(); const button = event.submitter; button.disabled = true;
          try {
            if (localStorage.getItem(pendingKey)) throw new Error('请先上传当前车手的未保存成绩');
            const token = $('#restore-code').value.trim();
            if (!/^[a-f0-9]{64}$/.test(token)) throw new Error('恢复码应为 64 位字母和数字');
            const player = await api('/me', { token }); saveIdentity({ token, player }); lastResult = null;
            await renderTab(); notice('已恢复车手');
          } catch (error) { report(error); } finally { button.disabled = false; }
        };
      } else if (currentTab === 'friends') {
        const friends = await api('/friends');
        content.innerHTML = `<form id="friend-form"><label for="friend-id">添加车手</label><div class="form-row"><input id="friend-id" maxlength="8" required placeholder="输入 8 位车手 ID" autocomplete="off" autocapitalize="characters"><button type="submit" class="primary">查找</button></div></form><div id="friend-result"></div><div class="list">${friends.length ? friends.map(friend => person(friend, 'friend')).join('') : '<p class="empty">还没有好友。输入 ID，或打开好友的分享卡添加。</p>'}</div>`;
        content.querySelector('#friend-form').onsubmit = async event => {
          event.preventDefault(); const button = event.submitter; button.disabled = true;
          try {
            const id = $('#friend-id').value.trim().toUpperCase();
            if (!/^[A-F0-9]{8}$/.test(id)) throw new Error('请输入 8 位车手 ID');
            const player = await api(`/players/${id}`);
            $('#friend-result').innerHTML = `<div class="list">${person({ ...player, ...player.relation }, 'search')}</div>`; attachActions($('#friend-result'));
          } catch (error) { report(error); } finally { button.disabled = false; }
        };
      } else if (currentTab === 'rank') {
        const result = await api(`/leaderboard?scope=${rankScope}`);
        content.innerHTML = `<div class="actions"><button data-action="rank-all" aria-pressed="${rankScope === 'all'}">总榜</button><button data-action="rank-friends" aria-pressed="${rankScope === 'friends'}">好友榜</button></div><p class="hint">按最高分排名，同分并列。显示前 100 名。</p><div class="list">${result.players.length ? result.players.map(p => person(p, 'rank')).join('') : '<p class="empty">完成一局飞行后即可上榜。</p>'}</div>${result.me?.rank ? `<p class="hint">我的最高分 ${result.me.best} · 总榜第 ${result.me.rank} 名</p>` : ''}`;
      } else if (currentTab === 'share') {
        if (!lastResult) throw new Error('请先完成一局游戏');
        await renderShare(content, lastResult, true);
      }
      attachActions(content);
    } catch (error) { content.innerHTML = '<button data-action="reload">重新读取</button>'; attachActions(content); report(error); }
  }
  function person(player, type) {
    const self = player.id === identity?.player.id;
    let controls = '';
    if (!self && type !== 'rank') {
      if (player.status === 'accepted') controls = `<button data-action="remove" data-id="${player.id}">移除</button>`;
      else if (player.status === 'pending') controls = player.receiver === identity.player.id
        ? `<button class="primary" data-action="accept" data-id="${player.id}">接受</button><button data-action="remove" data-id="${player.id}">忽略</button>`
        : `<small>申请已发送</small><button data-action="remove" data-id="${player.id}">撤回</button>`;
      else controls = `<button class="primary" data-action="add" data-id="${player.id}">加好友</button>`;
    }
    return `<div class="person" data-me="${self}">${type === 'rank' ? `<b class="rank">${player.rank}</b>` : ''}<div class="name"><b>${esc(player.name)}${self ? ' · 我' : ''}</b><small>ID ${player.id}</small></div><strong>${player.best}</strong>${controls}</div>`;
  }
  async function action(name, id, root) {
    if (name === 'reload') return renderTab();
    if (name === 'recovery') { const field = root.querySelector('.recovery'); field.textContent = identity.token; field.hidden = !field.hidden; return; }
    if (name === 'retry') { await submitPending(); await renderTab(); notice('成绩已上传'); return; }
    if (name.startsWith('rank-')) { rankScope = name.slice(5); return renderTab(); }
    if (name === 'share') { lastResult = await api(`/runs/${id}`); currentTab = 'share'; return renderTab(); }
    if (name === 'add') { await ensureIdentity(); await api('/friends', { method:'POST', data:{ id } }); }
    if (name === 'accept') await api(`/friends/${id}`, { method:'PATCH' });
    if (name === 'remove') await api(`/friends/${id}`, { method:'DELETE' });
    if (['add','accept','remove'].includes(name)) {
      if (currentTab === 'friends' && modal.open) await renderTab();
      else { root.querySelectorAll('[data-action=add]').forEach(b => { const label=document.createElement('p'); label.textContent='好友申请已发送'; b.replaceWith(label); }); }
      notice(name === 'add' ? '好友申请已发送' : name === 'accept' ? '已成为好友' : '已移除', false, root.closest('.share-shell') || modal);
    }
  }
  modal.querySelectorAll('[data-tab]').forEach(button => button.onclick = () => { currentTab = button.dataset.tab; renderTab(); });
  $('#open-social')?.addEventListener('click', () => show('profile'));
  $('#share-result')?.addEventListener('click', () => show('share'));
  window.FlappySocial = { prepareRound, completeRound, status, reportGameError:error => { console.error(error); status(`无法开始：${error.message}。请点击开始重试。`); }, show, isOpen:() => modal.open };
  const glyphs = {
    A:['01110','10001','10001','11111','10001','10001','10001'], B:['11110','10001','10001','11110','10001','10001','11110'],
    C:['01111','10000','10000','10000','10000','10000','01111'], D:['11110','10001','10001','10001','10001','10001','11110'],
    E:['11111','10000','10000','11110','10000','10000','11111'], F:['11111','10000','10000','11110','10000','10000','10000'],
    I:['111','010','010','010','010','010','111'], L:['10000','10000','10000','10000','10000','10000','11111'],
    O:['01110','10001','10001','10001','10001','10001','01110'], P:['11110','10001','10001','11110','10000','10000','10000'],
    R:['11110','10001','10001','11110','10100','10010','10001'], S:['01111','10000','10000','01110','00001','00001','11110'],
    T:['11111','00100','00100','00100','00100','00100','00100'], Y:['10001','10001','01010','00100','00100','00100','00100'],
    '0':['01110','11001','10101','10101','10101','10011','01110'], '1':['010','110','010','010','010','010','111'],
    '2':['01110','10001','00001','00010','00100','01000','11111'], '3':['11110','00001','00001','01110','00001','00001','11110'],
    '4':['00010','00110','01010','10010','11111','00010','00010'], '5':['11111','10000','10000','11110','00001','00001','11110'],
    '6':['01110','10000','10000','11110','10001','10001','01110'], '7':['11111','00001','00010','00100','01000','01000','01000'],
    '8':['01110','10001','10001','01110','10001','10001','01110'], '9':['01110','10001','10001','01111','00001','00001','01110'],
  };
  function bitmap(ctx, value, x, y, scale, color) {
    ctx.fillStyle = color;
    for (const char of value) {
      const glyph = glyphs[char];
      if (!glyph) { x += 4 * scale; continue; }
      glyph.forEach((row, yy) => [...row].forEach((bit, xx) => { if (bit === '1') ctx.fillRect(x + xx * scale, y + yy * scale, scale, scale); }));
      x += (glyph[0].length + 1) * scale;
    }
  }
  const loadImage = source => new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = () => reject(new Error(`无法读取分享素材 ${source}`)); image.src = source; });
  async function paintCard(canvas, result, url) {
    const [car, medals] = await Promise.all([loadImage('assets/roadster.png'), loadImage('assets/dogecoin-medals.png')]);
    const ctx = canvas.getContext('2d'); canvas.width = 360; canvas.height = 480; ctx.imageSmoothingEnabled = false;
    const fill = (color, x, y, w, h) => { ctx.fillStyle = color; ctx.fillRect(x,y,w,h); };
    const text = (value,x,y,size=12,color='#273849') => { ctx.fillStyle=color; ctx.font=`700 ${size}px ui-monospace,"PingFang SC",monospace`; ctx.fillText(value,x,y); };
    fill('#273849',0,0,360,480); fill('#fff3ce',4,4,352,472);
    fill('#4ec0ca',4,4,352,57); fill('#273849',4,61,352,3);
    bitmap(ctx,'FLAPPY CAR',20,20,3,'#273849');
    text(result.player.name,20,90,18); text(`ID ${result.player.id}`,20,110,11,'#64767b');
    text('本次飞行',20,143,12);
    const scoreText = String(result.score), scoreScale = scoreText.length > 4 ? 6 : 9;
    bitmap(ctx,scoreText,20,155,scoreScale,'#273849');
    const frame = result.score >= 40 ? 0 : result.score >= 30 ? 1 : result.score >= 20 ? 2 : result.score >= 10 ? 3 : null;
    if (frame !== null) {
      ctx.drawImage(medals,frame*44,0,44,44,244,137,88,88);
      text(['铂金 DOGE','黄金 DOGE','白银 DOGE','青铜 DOGE'][frame],250,239,10);
    } else { text('NEXT MEDAL',248,177,11); text('10 分解锁',248,198,12); }
    fill('#c3ece0',4,254,352,90);
    // Native game pixels enlarged by whole numbers, with flat colour exhaust.
    fill('#9bd6cc',4,318,352,26); fill('#84bdb7',20,296,25,48); fill('#a8dfd2',28,282,29,62); fill('#84bdb7',300,292,28,52);
    ctx.drawImage(car,102,264,156,60);
    for (const x of [111,213]) { fill('#659eae',x-2,312,10,16); fill('#c3eff0',x,312,6,22); fill('#ffffff',x+2,312,2,16); }
    fill('#273849',4,344,352,3);
    text('最高分',20,370,11,'#64767b'); text(String(result.player.best),20,397,23);
    text('总榜排名',120,370,11,'#64767b'); text(result.player.rank ? `#${result.player.rank}` : '—',120,397,23);
    text('扫码挑战 · 添加好友',20,434,12); text('flappy-car.xiaoke.ai',20,456,10,'#64767b');
    const qr = qrcode(0,'M'); qr.addData(url); qr.make();
    const count = qr.getModuleCount(), scale = 2, side = (count+8)*scale, left = 344-side, top = 464-side;
    fill('#ffffff',left,top,side,side); ctx.fillStyle='#000000';
    for (let y=0;y<count;y++) for(let x=0;x<count;x++) if(qr.isDark(y,x)) ctx.fillRect(left+(x+4)*scale,top+(y+4)*scale,scale,scale);
    canvas.setAttribute('aria-label',`${result.player.name}，本次 ${result.score} 分，最高 ${result.player.best} 分，车手 ID ${result.player.id}。扫码可打开此成绩。`);
  }
  async function renderShare(root,result,own) {
    const url=resultURL(result.id);
    root.innerHTML=`<div class="share-layout"><canvas class="share-card" width="360" height="480" role="img"></canvas><div><h3>${own ? '分享这次飞行' : esc(result.player.name)+' 的飞行'}</h3><p>${own ? '我飞过了' : '飞过了'} <b>${result.score}</b> 组星舰喷口</p><p class="hint player-id">车手 ID · ${result.player.id}</p><div class="actions"><button class="primary" data-save-card>保存分享图</button><button data-copy-link>复制挑战链接</button>${!own && result.player.id !== identity?.player.id ? `<button data-action="add" data-id="${result.player.id}">添加好友</button>` : ''}<a class="button" href="./">${own ? '继续飞行' : '接受挑战'}</a></div><input class="link-field" aria-label="挑战链接" readonly value="${esc(url)}"><div class="result-meta"><p class="hint">${new Date(result.finishedAt).toLocaleString('zh-CN')}</p></div></div></div><figure class="export-preview" hidden><figcaption>长按图片可保存</figcaption><img alt="可保存的完整分享卡"><a class="button" download>下载 PNG</a></figure>`;
    const canvas=root.querySelector('canvas'); await paintCard(canvas,result,url);
    root.querySelector('[data-copy-link]').onclick=async()=>{
      try { await navigator.clipboard.writeText(url); notice('挑战链接已复制',false,root.closest('.share-shell')||modal); }
      catch(error) { report(new Error(`复制失败：${error.message}。可手动复制下方链接。`),root.closest('.share-shell')||modal); }
    };
    root.querySelector('[data-save-card]').onclick=async()=>{
      try {
        const output=document.createElement('canvas'); output.width=1080; output.height=1440;
        const context=output.getContext('2d'); context.imageSmoothingEnabled=false; context.drawImage(canvas,0,0,1080,1440);
        const address=output.toDataURL('image/png');
        const preview=root.querySelector('.export-preview'); preview.hidden=false; preview.querySelector('img').src=address;
        const link=preview.querySelector('a'); link.href=address; link.download=`Flappy-Car-${result.player.id}-${result.score}.png`; link.click();
      } catch(error) { report(error,root.closest('.share-shell')||modal); }
    };
    attachActions(root);
  }
  if (document.body.classList.contains('share-page')) {
    const root=$('.share-shell'), content=root.querySelector('.social-content');
    const id=new URL(location.href).searchParams.get('r');
    if (!id || !/^[a-f0-9-]{36}$/.test(id)) { content.textContent='成绩链接无效。'; }
    else api(`/runs/${id}`).then(async result=>{
      document.title=`${result.player.name} 飞了 ${result.score} 分 · Flappy Car`;
      await renderShare(content,result,false);
    }).catch(error=>{ content.innerHTML='<p>无法读取这次成绩。</p><a class="button" href="./">返回游戏</a>'; report(error,root); });
  }
})();
