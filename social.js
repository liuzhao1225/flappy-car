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
  let previousFocus, peopleView, peopleObserver;
  const modal = document.createElement('dialog'); modal.className = 'social'; modal.id = 'social-dialog';
  modal.innerHTML = `<header class="social-header"><h2>我的车手</h2><button class="close" aria-label="关闭车手俱乐部">×</button></header><nav class="social-nav" aria-label="车手俱乐部"><button data-tab="profile">我的车手</button><button data-tab="friends">好友</button><button data-tab="rank">排行榜</button></nav><p class="notice" role="status" aria-live="polite"></p><div class="social-content"></div>`;
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
  async function acceptInvite(code) {
    const banner=$('#invite-status');
    banner.textContent='正在添加好友…';
    try {
      if (!/^[a-f0-9]{32}$/.test(code)) throw new Error('好友邀请无效，请重新扫描二维码');
      await ensureIdentity();
      const result=await api(`/invites/${code}`,{method:'POST'});
      banner.textContent=result.self ? '这是你的邀请二维码' : `已与 ${result.friend.name} 成为好友`;
      const url=new URL(location.href); url.searchParams.delete('invite');
      history.replaceState(null,'',url);
    } catch(error) {
      console.error(error);
      banner.textContent=`添加好友失败：${error.message} `;
      const retry=document.createElement('button'); retry.textContent='重试'; retry.className='pixel-button';
      retry.onclick=()=>acceptInvite(code); banner.append(retry);
    }
  }
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
    modal.querySelector('h2').textContent = {profile:'我的车手',friends:'好友',rank:'排行榜',share:'成绩分享',recovery:'恢复车手'}[currentTab];
    peopleObserver?.disconnect();
    peopleView = null;
    content.dataset.tab = currentTab;
    modal.querySelector('.social-nav').hidden = currentTab === 'share';
    modal.querySelectorAll('[data-tab]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.tab === currentTab)));
    notice(); content.innerHTML = '<p>读取中…</p>';
    try {
      await ensureIdentity();
      if (currentTab === 'profile') {
        const me = await api('/me'); saveIdentity({ ...identity, player:me });
        const oldBest = Number(localStorage.getItem("flappy-bird-classic.best") || 0);
        content.innerHTML = `<p class="identity">车手 ID · <b>${me.id}</b></p><div class="stats"><div class="stat-box"><small>最高分</small><b class="stat">${me.best}</b></div><div class="stat-box"><small>总榜排名</small><b class="stat">${me.rank ? '#' + me.rank : '—'}</b></div></div>${oldBest > me.best ? `<p class="hint">本机旧纪录 ${oldBest} 分；榜单收录新版上传的成绩。</p>` : ''}<form id="nickname-form"><label for="nickname">昵称</label><div class="form-row"><input id="nickname" value="${esc(me.name)}" maxlength="16" required autocomplete="nickname"><button class="primary" type="submit">保存昵称</button></div></form><div class="actions" style="margin-top:8px">${me.bestRun ? `<button data-action="share" data-id="${me.bestRun}">分享最高分</button>` : ''}${localStorage.getItem(pendingKey) ? '<button data-action="retry">重试上传成绩</button>' : ''}</div><button class="recovery-entry" data-action="recovery-panel">换设备 / 恢复车手</button>`;
        content.querySelector('#nickname-form').onsubmit = async event => {
          event.preventDefault(); const button = event.submitter; button.disabled = true;
          try { const player = await api('/me', { method:'PATCH', data:{ name:$('#nickname').value } }); saveIdentity({ ...identity, player }); await renderTab(); notice('昵称已保存'); }
          catch (error) { report(error); } finally { button.disabled = false; }
        };
      } else if (currentTab === 'recovery') {
        content.innerHTML='<h3>恢复车手</h3><p class="hint">恢复码可找回昵称、好友和成绩，请私下保存。</p><button data-action="recovery">查看我的恢复码</button><code class="recovery" hidden></code><form id="restore-form"><label for="restore-code">已有恢复码</label><div class="form-row"><input id="restore-code" type="password" autocomplete="off" required placeholder="粘贴恢复码"><button type="submit">恢复车手</button></div></form><button class="recovery-entry" data-action="profile">返回车手</button>';
        content.querySelector('#restore-form').onsubmit = async event => {
          event.preventDefault(); const button = event.submitter; button.disabled = true;
          try {
            if (localStorage.getItem(pendingKey)) throw new Error('请先上传当前车手的未保存成绩');
            const token = $('#restore-code').value.trim();
            if (!/^[a-f0-9]{64}$/.test(token)) throw new Error('恢复码应为 64 位字母和数字');
            const player = await api('/me', { token }); saveIdentity({ token, player }); lastResult = null;
            currentTab='profile'; await renderTab(); notice('已恢复车手');
          } catch (error) { report(error); } finally { button.disabled = false; }
        };
      } else if (currentTab === 'friends') {
        const friends = await api('/friends');
        content.innerHTML = `<form id="friend-form"><label for="friend-id">添加车手</label><div class="form-row"><input id="friend-id" maxlength="8" required placeholder="输入 8 位车手 ID" autocomplete="off" autocapitalize="characters"><button type="submit" class="primary">查找</button></div></form><div id="friend-result"></div>${people(friends,'friend')}`;
        content.querySelector('#friend-form').onsubmit = async event => {
          event.preventDefault(); const button = event.submitter; button.disabled = true;
          try {
            const id = $('#friend-id').value.trim().toUpperCase();
            if (!/^[A-F0-9]{8}$/.test(id)) throw new Error('请输入 8 位车手 ID');
            const player = await api(`/players/${id}`);
            $('#friend-result').innerHTML = `<div class="list">${person({ ...player, ...player.relation }, 'search')}</div>`; attachActions($('#friend-result')); layoutPeople();
          } catch (error) { report(error); } finally { button.disabled = false; }
        };
      } else if (currentTab === 'rank') {
        const result = await api(`/leaderboard?scope=${rankScope}`);
        content.innerHTML = `<div class="actions"><button data-action="rank-all" aria-pressed="${rankScope === 'all'}">总榜</button><button data-action="rank-friends" aria-pressed="${rankScope === 'friends'}">好友榜</button></div><p class="hint">按最高分排名，同分并列。显示前 100 名。</p>${people(result.players,'rank')}${result.me?.rank ? `<p class="hint">我的最高分 ${result.me.best} · 总榜第 ${result.me.rank} 名</p>` : ''}`;
      } else if (currentTab === 'share') {
        if (!lastResult) throw new Error('请先完成一局游戏');
        await renderShare(content, lastResult, true);
      }
      attachActions(content);
      if (content.querySelector('[data-people]')) {
        layoutPeople();
        peopleObserver=new ResizeObserver(layoutPeople);
        peopleObserver.observe(content.querySelector('[data-people]'));
      }
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
    return `<div class="person" data-me="${self}">${type === 'rank' ? `<b class="rank">${player.rank}</b>` : ''}<div class="name"><b>${esc(player.name)}${self ? ' · 我' : ''}</b><small>ID ${player.id}</small></div><strong>${FlappyUI.scoreMarkup(player.best)}</strong>${controls}</div>`;
  }
  function people(players, type) {
    peopleView = { players, type, page:0 };
    return '<div class="list" data-people></div><nav class="pagination" aria-label="列表翻页"><button data-page="-1">上一页</button><span data-page-count></span><button data-page="1">下一页</button></nav>';
  }
  function layoutPeople() {
    if (!peopleView) return;
    const list=modal.querySelector('[data-people]');
    if (!list) return;
    const pager=modal.querySelector('.pagination');
    pager.hidden=!peopleView.players.length;
    if (!peopleView.players.length) { list.innerHTML='<p class="empty">暂无车手</p>'; return; }
    const styles=getComputedStyle(list), row=Number.parseFloat(styles.getPropertyValue('--person-height')), gap=Number.parseFloat(styles.rowGap);
    const size=Math.max(1,Math.floor((list.clientHeight+gap)/(row+gap)));
    const pages=Math.ceil(peopleView.players.length/size);
    peopleView.page=Math.min(peopleView.page,pages-1);
    list.innerHTML=peopleView.players.slice(peopleView.page*size,(peopleView.page+1)*size).map(p=>person(p,peopleView.type)).join('');
    pager.querySelector('[data-page-count]').textContent=`${peopleView.page+1} / ${pages}`;
    pager.querySelectorAll('button').forEach(button=>{
      const step=Number(button.dataset.page);
      button.disabled=step<0 ? peopleView.page===0 : peopleView.page===pages-1;
      button.onclick=()=>{ peopleView.page+=step; layoutPeople(); };
    });
    attachActions(list);
  }
  window.addEventListener('resize',layoutPeople);
  async function action(name, id, root) {
    if (name === 'recovery-panel' || name === 'profile') { currentTab=name==='profile' ? 'profile' : 'recovery'; return renderTab(); }
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
  let qrLoading;
  function loadQRCode() {
    if (!qrLoading) qrLoading = new Promise((resolve,reject) => {
      const script=document.createElement('script'); script.src='vendor/qrcode.js';
      script.onload=resolve; script.onerror=()=>reject(new Error('二维码组件加载失败'));
      document.head.append(script);
    });
    return qrLoading;
  }
  async function paintCard(canvas, result, url) {
    if (!/^[a-f0-9]{32}$/.test(result.inviteCode)) throw new Error('分享邀请信息缺失，请重新读取成绩');
    await loadQRCode();
    const inviteURL = new URL('./',url); inviteURL.searchParams.set('invite',result.inviteCode);
    await FlappyUI.paintCard(canvas, { score:result.score, best:result.player.best, url:inviteURL.href, name:result.player.name, identity:`ID ${result.player.id}`, invitation:true });
    canvas.setAttribute('aria-label',`${result.player.name}，本次 ${result.score} 分，最高 ${result.player.best} 分，车手 ID ${result.player.id}。扫码开始飞行并自动加好友。`);
  }
  async function renderShare(root,result,own) {
    const url=resultURL(result.id);
    root.innerHTML=`<div class="share-layout"><div class="share-art"><canvas class="share-card" width="360" height="480" role="img"></canvas><img class="export-image" alt="可保存的完整分享卡" hidden></div><div class="share-info"><h3>${own ? '分享这次飞行' : esc(result.player.name)+' 的飞行'}</h3><p>${own ? '我飞过了' : '飞过了'} <b>${result.score}</b> 组星舰喷口</p><p class="hint player-id">车手 ID · ${result.player.id}</p><div class="save-hint hint" hidden>长按图片，选择“保存图片”存入相册。</div><div class="actions"><button class="primary" data-save-card disabled>正在生成图片…</button><button data-copy-link>复制挑战链接</button>${!own && result.player.id !== identity?.player.id ? `<button data-action="add" data-id="${result.player.id}">添加好友</button>` : ''}<a class="button" href="./">${own ? '继续飞行' : '接受挑战'}</a></div><input class="link-field" aria-label="挑战链接" readonly value="${esc(url)}"><div class="result-meta"><p class="hint">${new Date(result.finishedAt).toLocaleString('zh-CN')}</p></div></div></div>`;
    const canvas=root.querySelector('canvas'); await paintCard(canvas,result,url);
    // Prepare the PNG before the tap: native sharing needs transient activation.
    const output=document.createElement('canvas'); output.width=canvas.width; output.height=canvas.height;
    const context=output.getContext('2d'); context.imageSmoothingEnabled=false; context.drawImage(canvas,0,0);
    const blob=await new Promise((resolve,reject)=>output.toBlob(value=>value ? resolve(value) : reject(new Error('分享图片生成失败')),'image/png'));
    const file=new File([blob],`Flappy-Car-${result.player.id}-${result.score}.png`,{type:'image/png'});
    const address=await new Promise((resolve,reject)=>{
      const reader=new FileReader();
      reader.onload=()=>resolve(reader.result);
      reader.onerror=()=>reject(reader.error);
      reader.readAsDataURL(blob);
    });
    const preview=root.querySelector('.export-image');
    preview.src=address; preview.alt=canvas.getAttribute('aria-label');
    await preview.decode();
    preview.hidden=false; canvas.hidden=true;
    const mobile=navigator.maxTouchPoints>0 || matchMedia('(pointer: coarse)').matches;
    const wechat=/MicroMessenger/i.test(navigator.userAgent);
    const nativeSave=mobile && !wechat && !!navigator.share && !!navigator.canShare?.({files:[file]});
    const save=root.querySelector('[data-save-card]'), noticeRoot=root.closest('.share-shell')||modal;
    root.querySelector('.save-hint').hidden=!mobile;
    save.hidden=mobile && !nativeSave;
    save.textContent=mobile ? '保存到照片' : '下载分享图';
    save.disabled=false;
    FlappyUI.bindCopy(root.querySelector('[data-copy-link]'), root.querySelector('.link-field'), (message,error) => notice(message,error,noticeRoot));
    save.onclick=async()=>{
      try {
        if (nativeSave) {
          notice('请在系统菜单中选择“存储图像”或“保存图片”。',false,noticeRoot);
          await navigator.share({files:[file]});
        } else if (!mobile) {
          const link=document.createElement('a'); link.href=address; link.download=file.name; link.click();
        }
      } catch(error) {
        if (error.name==='AbortError') notice('保存已取消，或没有可用的保存方式。可长按图片保存。',false,noticeRoot);
        else report(new Error(`打开保存菜单失败（${error.name}）：${error.message}。可长按图片保存。`),noticeRoot);
      }
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
  } else {
    const invitation=new URL(location.href).searchParams.get('invite');
    if (invitation !== null) acceptInvite(invitation);
  }
})();
