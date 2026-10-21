(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]);
  const bestKey = 'flappy-car.toy.best.v1';
  const lastKey = 'flappy-car.toy.last.v1';
  const shareUrl = 'https://www.bilibili.com/toy/flappy-car';
  // Match the official SDK's environment detection. UA only selects guidance;
  // the authenticated getMyRank response decides whether ranking is available.
  const inBiliApp = /BiliApp/i.test(navigator.userAgent);
  const externalMobile = !inBiliApp && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  const inWechat = /MicroMessenger/i.test(navigator.userAgent);
  let lastResult = JSON.parse(localStorage.getItem(lastKey) || 'null');
  let period = 'all', previousFocus, rows = [], mine = null, page = 0;
  let view = 'rank', loginState = 'checking', loginError, guest = false, resumeRound;
  const modal = document.createElement('dialog');
  modal.className = 'social';
  modal.innerHTML = '<header class="social-header"><h2>排行榜</h2><div class="header-actions"><button data-refresh>刷新</button><button class="close" aria-label="关闭">×</button></div></header><p class="notice" role="status" aria-live="polite"></p><div class="social-content"></div>';
  document.body.append(modal);
  const content = modal.querySelector('.social-content');
  const status = message => { $('#social-status').textContent = message; };
  function notice(message = '', error = false) {
    const element = modal.querySelector('.notice');
    element.textContent = message; element.dataset.error = String(error);
  }
  function report(error) { console.error(error); notice(error.message, true); }
  function sdk() {
    if (!window.toy) throw new Error('Toy 服务未加载，请刷新页面重试。');
    return window.toy;
  }
  async function withButton(button, action) {
    button.disabled = true; notice();
    try { await action(); } catch (error) { report(error); }
    finally { button.disabled = false; }
  }
  const loginButton = document.createElement('button');
  loginButton.className = 'pixel-button'; loginButton.hidden = true;
  loginButton.textContent = externalMobile ? 'B站打开' : '登录上榜';
  loginButton.onclick = showLogin;
  $('#social-actions').append(loginButton);
  const needsLogin = error => error.type === 'not_logged_in' || error.code === -101;
  function setLogin(state, error) {
    loginState = state; loginError = error;
    loginButton.hidden = state === 'ready' || state === 'checking';
  }
  async function checkLogin() {
    try {
      await sdk().getMyRank({ board:1, period:'all' });
      setLogin('ready'); guest = false;
    } catch (error) {
      console.error('Toy 登录检查失败', error);
      setLogin(needsLogin(error) ? 'login' : 'error', error);
    }
  }
  function close() {
    if (view === 'login' && loginState !== 'ready') guest = true;
    modal.close(); previousFocus?.focus();
    if (view === 'login') { resumeRound?.(); resumeRound = null; }
  }
  modal.querySelector('.close').onclick = close;
  modal.querySelector('[data-refresh]').onclick = event => withButton(event.currentTarget, rank);
  modal.addEventListener('cancel', event => { event.preventDefault(); close(); });
  function showLogin() {
    if (!modal.open) previousFocus = document.activeElement;
    view = 'login';
    modal.querySelector('h2').textContent = loginState === 'error' ? '登录检查失败' : '登录上榜';
    modal.querySelector('[data-refresh]').hidden = true;
    modal.querySelector('.close').setAttribute('aria-label', '关闭并试玩');
    notice();
    if (loginState === 'error') report(loginError);
    const guideExternal = externalMobile && loginState === 'login';
    const direction = loginState === 'error' ? '暂时无法确认登录状态，请点「重新检测」。' : externalMobile
      ? '点击页面右上角「打开App」，登录 B站后再玩。'
      : inBiliApp ? '请先登录 B站 App，再点「重新检测」。' : '请先在 B站页面登录，再点「重新检测」。';
    content.innerHTML = `<div class="login-guide">${guideExternal ? '<div class="open-app-arrow" aria-hidden="true">↗</div>' : ''}<p>${direction}</p><p class="hint">试玩成绩仅存本机，不上榜。</p><div class="actions"><button class="primary" data-check-login>重新检测</button><button data-guest>先试玩</button></div>${guideExternal ? `<details><summary>打不开？</summary><p>${inWechat ? '点微信右上角「…」，选择在浏览器打开，再点页面「打开App」。' : '确认已安装 B站 App，再点页面右上角「打开App」。'}</p><button data-copy>复制游戏链接</button><input class="link-field" aria-label="Toy 游戏链接" readonly value="${shareUrl}"></details>` : ''}</div>`;
    content.querySelector('[data-guest]').onclick = close;
    content.querySelector('[data-check-login]').onclick = event => withButton(event.currentTarget, async () => {
      await checkLogin();
      if (loginState === 'ready') { status(''); close(); }
      else { showLogin(); if (loginState === 'login') notice('尚未登录 B站'); }
    });
    if (guideExternal) {
      FlappyUI.bindCopy(content.querySelector('[data-copy]'), content.querySelector('.link-field'), notice);
    }
    if (!modal.open) modal.showModal();
  }

  function layoutRows() {
    const list = content.querySelector('[data-people]');
    if (!list) return;
    const pager = content.querySelector('.pagination');
    if (!rows.length) { pager.hidden = true; list.innerHTML = '<p class="empty">暂无成绩</p>'; return; }
    const style = getComputedStyle(list);
    const gap = parseFloat(style.rowGap), height = parseFloat(style.getPropertyValue('--person-height'));
    const size = Math.max(1, Math.floor((list.clientHeight + gap) / (height + gap)));
    const pages = Math.ceil(rows.length / size);
    pager.hidden = pages <= 1;
    page = Math.min(page, pages - 1);
    list.innerHTML = rows.slice(page * size, (page + 1) * size).map(row => {
      const me = mine?.ranked === true && row.rank === mine.rank && row.score === mine.score;
      const avatar = row.avatar ? `<img class="avatar" src="${esc(row.avatar)}" alt="" referrerpolicy="no-referrer">` : '<span class="avatar" aria-hidden="true"></span>';
      return `<div class="person" data-me="${me}"><b class="rank">${esc(row.rank)}</b>${avatar}<div class="name"><b>${esc(row.nickname)}</b></div>${me ? '<small class="me-tag">我</small>' : ''}<strong>${FlappyUI.scoreMarkup(row.score)}</strong></div>`;
    }).join('');
    pager.querySelector('[data-page-count]').textContent = `${page + 1} / ${pages}`;
    pager.querySelectorAll('button').forEach(button => {
      const step = Number(button.dataset.page);
      button.disabled = step < 0 ? page === 0 : page === pages - 1;
      button.onclick = () => { page += step; layoutRows(); };
    });
  }
  new ResizeObserver(layoutRows).observe(content);
  async function rank() {
    content.innerHTML = '<p>读取排行榜…</p>';
    const [listResult, mineResult] = await Promise.allSettled([
      sdk().getRankList({ board:1, period, limit:100 }),
      sdk().getMyRank({ board:1, period }),
    ]);
    if (listResult.status === 'rejected') { content.innerHTML = ''; throw listResult.reason; }
    rows = listResult.value;
    mine = mineResult.status === 'fulfilled' ? mineResult.value : null;
    page = 0;
    content.innerHTML = `<div class="rank-periods">${[['all','总榜'],['month','月榜'],['week','周榜'],['day','日榜']].map(([key,label]) => `<button data-period="${key}" aria-pressed="${period === key}">${label}</button>`).join('')}</div><div class="list" data-people></div><nav class="pagination" aria-label="排行榜翻页"><button data-page="-1">上一页</button><span data-page-count></span><button data-page="1">下一页</button></nav>`;
    content.querySelectorAll('[data-period]').forEach(button => button.onclick = () => withButton(button, async () => { period = button.dataset.period; await rank(); }));
    layoutRows();
    if (mineResult.status === 'rejected') {
      if (needsLogin(mineResult.reason)) {
        console.error('Toy 本人排名读取失败', mineResult.reason);
        setLogin('login', mineResult.reason);
        notice('B站未登录');
        const button = document.createElement('button'); button.textContent = '登录上榜';
        button.onclick = showLogin; modal.querySelector('.notice').append(' ', button);
      } else report(new Error(`本人排名读取失败：${mineResult.reason.message}`, { cause:mineResult.reason }));
    }
  }
  async function share() {
    if (!lastResult) throw new Error('完成一局后可分享成绩。');
    content.innerHTML = '<p>生成分享图…</p>';
    const result = { ...lastResult };
    const card = document.createElement('canvas');
    await FlappyUI.paintCard(card, { score:result.score, best:result.best, url:shareUrl });
    const address = card.toDataURL('image/png');
    const canSave = await sdk().isSupport('saveImageToAlbum');
    const canShare = await sdk().isSupport('sharePicture');
    content.innerHTML = `<div class="share-layout"><div class="share-art"><img class="export-image" alt="本次 ${result.score} 分，本机最高 ${result.best} 分；二维码打开本 Toy。"></div><div class="share-info"><h3>分享成绩</h3><p>本次 ${result.score} 分</p><div class="actions"><button class="primary" data-save>${canSave ? '保存到相册' : '下载分享图'}</button>${canShare ? '<button data-share>分享成绩图</button>' : ''}<button data-copy>复制挑战链接</button></div><input class="link-field" aria-label="Toy 挑战链接" readonly value="${esc(shareUrl)}"></div></div>`;
    content.querySelector('.export-image').src = address;
    content.querySelector('[data-save]').onclick = event => withButton(event.currentTarget, async () => {
      if (canSave) await sdk().saveImageToAlbum({ base64Data:address, hintMsg:'保存 Flappy Car 成绩图' });
      else { const link = document.createElement('a'); link.href = address; link.download = `Flappy-Car-Toy-${result.score}.png`; link.click(); }
    });
    content.querySelector('[data-share]')?.addEventListener('click', event => withButton(event.currentTarget, () => sdk().sharePicture({ base64Data:address })));
    FlappyUI.bindCopy(content.querySelector('[data-copy]'), content.querySelector('.link-field'), notice);
  }
  async function show(tab = 'rank') {
    view = tab;
    previousFocus = document.activeElement;
    if (!modal.open) modal.showModal();
    modal.querySelector('h2').textContent = tab === 'share' ? '成绩分享' : '排行榜';
    modal.querySelector('[data-refresh]').hidden = tab === 'share';
    modal.querySelector('.close').setAttribute('aria-label', '关闭');
    notice();
    try { if (tab === 'share') await share(); else await rank(); }
    catch (error) { content.innerHTML = ''; report(error); }
  }
  $('#open-social').textContent = '排行榜';
  $('#open-social').onclick = () => show('rank');
  $('#share-result').onclick = () => show('share');
  const initialLogin = checkLogin().then(() => { if (loginState !== 'ready') showLogin(); });
  window.FlappySocial = {
    async prepareRound() {
      await initialLogin;
      if (loginState !== 'ready' && !guest) await new Promise(resolve => { resumeRound = resolve; showLogin(); });
      status(''); $('#share-result').hidden = true;
      return { id:crypto.randomUUID(), seed:crypto.getRandomValues(new Uint32Array(1))[0] };
    },
    async completeRound(record) {
      if (!Number.isSafeInteger(record.score) || record.score < 0 || record.score > 16777215) throw new Error('本局分数超出 Toy 排行榜范围。');
      lastResult = { score:record.score, best:Math.max(record.score, Number(localStorage.getItem(bestKey) || 0)), finishedAt:Date.now() };
      localStorage.setItem(lastKey, JSON.stringify(lastResult));
      $('#share-result').hidden = false;
      if (guest) {
        status('本局仅保存在本机，未上传排行榜。');
        return { ...lastResult, uploaded:false };
      }
      try { await sdk().submitScore({ board:1, score:record.score }); }
      catch (error) {
        if (needsLogin(error)) {
          setLogin('login', error); showLogin();
          throw new Error('本局未上传：请登录 B站后重新挑战。', { cause:error });
        }
        throw new Error(`成绩上传失败：${error.message}`, { cause:error });
      }
      return { ...lastResult, uploaded:true };
    },
    status, show, isOpen:() => modal.open,
    reportGameError(error) { console.error(error); status(`操作失败：${error.message}`); },
  };
})();
