(() => {
  'use strict';
  const loadImage = source => new Promise((resolve, reject) => {
    const image = new Image(); image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`分享素材加载失败：${source}`)); image.src = source;
  });
  let artwork;
  function scoreMarkup(value) {
    const digits = String(value);
    if (!/^\d+$/.test(digits)) throw new Error('成绩数字无效');
    return `<span class="game-digits" role="img" aria-label="${digits}">${[...digits].map(digit => {
      const [x,y] = FLAPPY_ATLAS[`number_score_0${digit}`];
      return `<i aria-hidden="true" style="background-position:-${x}px -${y}px"></i>`;
    }).join('')}</span>`;
  }
  function bindCopy(button, field, notify) {
    const policy = document.permissionsPolicy || document.featurePolicy;
    const allowed = !!navigator.clipboard?.writeText && (!policy || policy.allowsFeature('clipboard-write'));
    if (!allowed) button.textContent = '选择链接';
    const select = () => { field.focus(); field.select(); field.setSelectionRange(0, field.value.length); };
    field.onclick = select;
    button.onclick = async () => {
      if (!allowed) { select(); notify('此页面限制自动复制。链接已选中，请长按或按 Ctrl/Cmd+C 复制。'); return; }
      try { await navigator.clipboard.writeText(field.value); notify('链接已复制'); }
      catch (error) {
        console.error('复制链接失败', error);
        select(); notify('复制失败：浏览器未允许写入剪贴板。请长按或按 Ctrl/Cmd+C 复制已选链接。', true);
      }
    };
  }
  async function paintCard(canvas, { score, best, url, name = '', identity = '', invitation = false }) {
    if (!artwork) artwork = Promise.all([
      loadImage('assets/atlas.png'), loadImage('assets/dogecoin-medals.png'), loadImage('assets/roadster.png'), loadImage('assets/starship-booster.png'),
    ]);
    const [atlas, medals, car, booster] = await artwork;
    const fonts = await document.fonts.load('12px "Flappy Pixel"', `FLAPPY CAR ${name} ${identity} 扫码挑战自动加好友`);
    if (!fonts.length) throw new Error('分享字体加载失败');
    const card = document.createElement('canvas'); card.width = 288; card.height = 480;
    const ctx = card.getContext('2d'); ctx.imageSmoothingEnabled = false;
    const sprite = (key,x,y) => {
      const [sx,sy,w,h] = FLAPPY_ATLAS[key]; ctx.drawImage(atlas,sx,sy,w,h,x,y,w,h);
    };
    const number = (value,right,y) => {
      const digits = [...String(value)], width = digits.length * 15 + 1;
      digits.forEach((digit,index) => sprite(`number_score_0${digit}`,right-width+index*15,y));
    };
    const text = (value,x,y,maxWidth,align='left') => {
      ctx.font = '12px "Flappy Pixel"'; ctx.fillStyle = '#543847'; ctx.textAlign = align;
      while (ctx.measureText(value).width > maxWidth) value = value.slice(0,-2) + '…';
      ctx.fillText(value,x,y);
    };
    sprite('bg_day',0,0); sprite('land',0,448);
    ctx.font = '24px "Flappy Pixel"'; ctx.textAlign = 'center'; ctx.fillStyle = '#543847';
    ctx.fillText('FLAPPY CAR',144,36);
    text(name,144,56,256,'center');
    // Static gameplay artwork: the original booster and the car's two downward jets.
    ctx.save(); ctx.beginPath(); ctx.rect(0,64,288,144); ctx.clip();
    ctx.drawImage(booster,214,202-booster.height);
    ctx.translate(52,118); ctx.scale(2,2);
    for (const x of [3,37]) {
      ctx.fillStyle = '#659eae'; ctx.fillRect(x-1,18,4,16);
      ctx.fillStyle = '#c3eff0'; ctx.fillRect(x,16,2,19);
      ctx.fillStyle = '#fff'; ctx.fillRect(x+1,16,1,15);
      ctx.fillStyle = '#e5f6f4'; ctx.globalAlpha = .65;
      ctx.fillRect(x-3,35,3,3); ctx.fillRect(x+2,37,3,2); ctx.fillRect(x-1,40,3,2);
      ctx.globalAlpha = 1;
    }
    ctx.drawImage(car,0,0); ctx.restore();
    // The same native atlas panel, numeral spacing and medal thresholds as game.js.
    const panelY = 216;
    sprite('score_panel',25,panelY);
    const medal = score >= 40 ? 0 : score >= 30 ? 1 : score >= 20 ? 2 : score >= 10 ? 3 : null;
    if (medal !== null) ctx.drawImage(medals,medal*44,0,44,44,57,panelY+44,44,44);
    number(score,237,panelY+34); number(best,237,panelY+76);
    text(identity,24,382,116);
    text('扫码挑战',24,416,116);
    if (invitation) text('自动加好友',24,432,116);
    const qr = qrcode(0,'M'); qr.addData(url); qr.make();
    const count = qr.getModuleCount(), scale = Math.floor(128/(count+8));
    if (scale < 1) throw new Error('挑战链接过长，无法生成清晰二维码');
    const side = (count+8)*scale, left = Math.round(208-side/2), top = Math.round(408-side/2);
    ctx.fillStyle = '#fff'; ctx.fillRect(left,top,side,side); ctx.fillStyle = '#000';
    for (let y=0;y<count;y++) for(let x=0;x<count;x++) if(qr.isDark(y,x)) ctx.fillRect(left+(x+4)*scale,top+(y+4)*scale,scale,scale);
    canvas.width = card.width*3; canvas.height = card.height*3;
    const output = canvas.getContext('2d'); output.imageSmoothingEnabled = false; output.drawImage(card,0,0,canvas.width,canvas.height);
  }
  window.FlappyUI = { scoreMarkup, bindCopy, paintCard };
})();
