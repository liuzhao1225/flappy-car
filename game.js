(() => {
  'use strict';

  const { CONFIG, Game, createBody } = globalThis.FlappyModel;
  const canvas = document.querySelector('#screen');
  const context = canvas.getContext('2d', { alpha: false });
  const container = document.querySelector('#game');
  const announcement = document.querySelector('#announcement');
  const buttons = Object.fromEntries(['play', 'scores', 'pause', 'resume', 'menu'].map(id => [id, document.getElementById(id)]));
  const texture = new Image();
  const roadster = new Image();
  const booster = new Image();
  const dogecoinMedals = new Image();
  const exhaustDuration = 18;
  const sounds = {};
  let audioContext, soundGain, audioLoading;
  const bestKey = 'flappy-bird-classic.best';
  let game;
  let failed = false;
  let muted = false;
  let previousTime;
  let accumulatedTime = 0;
  let previousControls = '';
  let pressed = '';
  let starting = false;
  let round;
  let roundFrames = 0;
  let flaps = [];
  let recording = false;

  async function startRound() {
    if (starting) return;
    starting = true;
    try {
      // Resume audio inside the tap gesture, while the ranked round loads.
      const audioReady = prepareAudio();
      [round] = await Promise.all([FlappySocial.prepareRound(), audioReady]);
      game.random = flappyRandom(round.seed);
      roundFrames = 0; flaps = []; recording = false;
      game.ready();
      handleEvents(); render();
      canvas.focus({ preventScroll: true });
    } catch (error) { FlappySocial.reportGameError(error); }
    finally { starting = false; }
  }

  function flap() {
    if (game.paused || !round || game.birdBody().bounds.top < 0) return;
    if (game.state === 'ready') recording = true;
    if (flaps.at(-1) !== roundFrames) flaps.push(roundFrames);
    game.flap();
  }

  function reportFailure(error) {
    failed = true;
    console.error(error);
    const element = document.getElementById('error');
    element.textContent = `游戏出错：${error.message}。请刷新页面重试。`;
    element.hidden = false;
    Object.values(buttons).forEach(button => { button.hidden = true; });
  }

  function loadTexture(image, path) {
    return new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error(`无法读取 ${path}`));
      image.src = path;
    });
  }

  async function prepareAudio() {
    if (!audioContext) {
      audioContext = new AudioContext();
      soundGain = audioContext.createGain();
      soundGain.gain.value = muted ? 0 : 0.55;
      soundGain.connect(audioContext.destination);
    }
    const resumed = audioContext.resume();
    if (!audioLoading) audioLoading = Promise.all(['wing', 'point', 'hit', 'die', 'swooshing'].map(async name => {
      const response = await fetch(`assets/audio/${name}.mp3`);
      if (!response.ok) throw new Error(`无法读取音效 ${name}.mp3：${response.status}`);
      sounds[name] = await audioContext.decodeAudioData(await response.arrayBuffer());
    }));
    await Promise.all([resumed, audioLoading]);
  }

  function playSound(name) {
    if (muted) return;
    if (!sounds[name]) throw new Error(`音效 ${name} 尚未加载`);
    const voice = audioContext.createBufferSource();
    voice.buffer = sounds[name];
    voice.connect(soundGain);
    voice.onended = () => voice.disconnect();
    voice.start();
  }

  function handleEvents() {
    for (const event of game.drainEvents()) {
      if (event === 'best') localStorage.setItem(bestKey, String(game.best));
      else playSound(event);
    }
  }

  function sprite(name, x, y, opacity = 1) {
    const [sx, sy, width, height] = FLAPPY_ATLAS[name];
    context.globalAlpha = opacity;
    context.drawImage(texture, sx, sy, width, height, Math.round(x), Math.round(y), width, height);
    context.globalAlpha = 1;
  }

  function number(value, x, y, small = false, align = 'center') {
    const names = String(value).split('').map(digit => small ? `number_score_0${digit}` : `font_0${48 + Number(digit)}`);
    const spacing = small ? -1 : -2;
    const width = names.reduce((sum, name) => sum + FLAPPY_ATLAS[name][2], 0) + (names.length - 1) * spacing;
    let left = align === 'right' ? x - width : x - width / 2;
    for (const name of names) {
      sprite(name, left, y);
      left += FLAPPY_ATLAS[name][2] + spacing;
    }
  }

  function drawRoadster(x = game.bird.x, y = game.bird.y) {
    context.save();
    context.translate(Math.round(x), Math.round(y));
    context.rotate(game.bird.angle * Math.PI / 180);
    if (game.state === 'playing' && game.bird.flapTicks < exhaustDuration) {
      drawExhaust(game.bird.flapTicks);
    }
    context.drawImage(roadster, -roadster.width / 2, -roadster.height / 2);
    context.restore();
  }

  function drawBooster(x, tip, inverted = false) {
    context.save();
    context.translate(Math.round(x), Math.round(tip));
    if (inverted) context.scale(1, -1);
    // Native pixel size; the nozzle tips define the existing gap edges.
    context.drawImage(booster, 0, -booster.height);
    context.restore();
  }

  function drawExhaust(age) {
    const pulse = Math.floor(age / 2) % 3;
    const strength = Math.min(1, (exhaustDuration - age) / 7);
    const length = Math.round((19 + [0, 4, -2][pulse]) * strength);
    // Native sprite nozzles occupy columns 3–4 and 37–38, ending at row 15.
    // The rear nozzle is aft of the rear wheel; both end above the tyre bottoms.
    for (const column of [3, 37]) {
      const x = column - roadster.width / 2;
      const y = 16 - roadster.height / 2;
      context.fillStyle = '#659eae';
      context.fillRect(x - 1, y + 2, 4, Math.max(2, length - 3));
      context.fillStyle = '#c3eff0';
      context.fillRect(x, y, 2, length);
      context.fillStyle = '#ffffff';
      context.fillRect(x + 1, y, 1, Math.max(2, length - 4));
      context.globalAlpha = strength * 0.65;
      context.fillStyle = '#e5f6f4';
      context.fillRect(x - 3 - pulse, y + length, 3, 3);
      context.fillRect(x + 2 + pulse, y + length + 2, 3, 2);
      context.fillRect(x - 1, y + length + 5 + pulse, 3, 2);
      context.globalAlpha = 1;
    }
  }

  const letters = {
    A: ['01110','10001','10001','11111','10001','10001','10001'],
    D: ['11110','10001','10001','10001','10001','10001','11110'],
    E: ['11111','10000','10000','11110','10000','10000','11111'],
    F: ['11111','10000','10000','11110','10000','10000','10000'],
    L: ['10000','10000','10000','10000','10000','10000','11111'],
    O: ['01110','10001','10001','10001','10001','10001','01110'],
    P: ['11110','10001','10001','11110','10000','10000','10000'],
    R: ['11110','10001','10001','11110','10100','10010','10001'],
    S: ['01111','10000','10000','01110','00001','00001','11110'],
    T: ['11111','00100','00100','00100','00100','00100','00100'],
    Y: ['10001','10001','01010','00100','00100','00100','00100'],
  };

  const textSprites = new Map();
  function pixelText(text, center, y, scale, color) {
    const key = `${text}:${scale}:${color}`;
    if (textSprites.has(key)) {
      const image = textSprites.get(key);
      context.drawImage(image, Math.round(center - (image.width - 2) / 2) - 1, y - 1);
      return;
    }
    const image = document.createElement('canvas');
    image.width = (text.length * 6 - 1) * scale + 2; image.height = 7 * scale + 3;
    const pen = image.getContext('2d');
    const paint = (dx, dy, fill) => {
      pen.fillStyle = fill;
      [...text].forEach((letter, index) => {
        letters[letter].forEach((row, rowIndex) => {
          [...row].forEach((pixel, column) => {
            if (pixel === '1') pen.fillRect(1 + (index * 6 + column) * scale + dx, 1 + rowIndex * scale + dy, scale, scale);
          });
        });
      });
    };
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 2]]) paint(dx, dy, '#293739');
    paint(0, 0, color);
    textSprites.set(key, image);
    context.drawImage(image, Math.round(center - (image.width - 2) / 2) - 1, y - 1);
  }

  function drawTitle(y) {
    pixelText('FLAPPY', CONFIG.width / 2, y, 2, '#d4f6f3');
    pixelText('ROADSTER', CONFIG.width / 2, y + 23, 4, '#ffffff');
  }

  function drawTutorial() {
    // Use the tap/finger strip of the original tutorial, leaving its bird out.
    const [sx, sy, width, height] = FLAPPY_ATLAS.tutorial;
    const tapStrip = 60;
    context.drawImage(texture, sx, sy + tapStrip, width, height - tapStrip,
      Math.round(game.bird.x - width / 2), CONFIG.birdY + 18, width, height - tapStrip);
  }

  function drawButton(id, name, x, y) {
    sprite(name, x, y + (pressed === id ? 2 : 0));
  }

  function drawScorePanel(y, score, best, showNew, animate) {
    sprite('score_panel', 25, y);
    const medal = score >= 40 ? 0 : score >= 30 ? 1 : score >= 20 ? 2 : score >= 10 ? 3 : null;
    if (medal !== null) {
      context.drawImage(dogecoinMedals, medal * 44, 0, 44, 44, 57, Math.round(y + 44), 44, 44);
      const spark = Math.floor(game.frame / 8) % 3;
      sprite(`blink_0${spark}`, 60 + Math.round((Math.sin(game.frame / 21) + 1) * 16), y + 47 + Math.round((Math.cos(game.frame / 17) + 1) * 16));
    }
    const displayScore = animate ? Math.min(score, Math.floor(Math.max(0, game.overFrames - 32) / 3)) : score;
    number(displayScore, 237, y + 34, true, 'right');
    number(best, 237, y + 76, true, 'right');
    if (showNew && displayScore === score) sprite('new', 165, y + 80);
  }

  function syncControls() {
    const state = `${game.state}:${game.paused}:${game.state === 'over' && game.overFrames >= 50}`;
    if (state === previousControls) return;
    previousControls = state;
    Object.values(buttons).forEach(button => { button.hidden = true; });
    if (game.state === 'home' || (game.state === 'over' && game.overFrames >= 50)) {
      buttons.play.hidden = false;
      buttons.scores.hidden = false;
    }
    if (game.state === 'playing' || game.state === 'ready') buttons[game.paused ? 'resume' : 'pause'].hidden = false;
    if (game.state === 'scores') buttons.menu.hidden = false;
    container.dataset.state = game.paused ? 'paused' : game.state;
    container.dataset.score = String(game.score);
    if (game.state === 'over') announcement.textContent = `游戏结束，得分 ${game.score}，最高分 ${game.best}。按空格或开始按钮再玩一局。`;
    if (game.state === 'ready') announcement.textContent = '准备。点击画面或按空格开始飞行。';
    if (game.paused) announcement.textContent = '已暂停。点击画面或按 P 继续。';
  }

  function render() {
    context.imageSmoothingEnabled = false;
    context.save();
    if (game.state === 'dying' && game.deathFrames < 12) {
      context.translate(game.deathFrames % 2 === 0 ? 2 : -2, 0);
    }
    sprite(`bg_${game.theme}`, 0, 0);
    for (const pipe of game.pipes) {
      drawBooster(pipe.x, pipe.top);
      drawBooster(pipe.x, pipe.top + CONFIG.gap, true);
    }
    if (game.state !== 'scores') drawRoadster(game.state === 'home' ? 144 : game.bird.x, game.state === 'home' ? game.bird.y - CONFIG.birdY + 228 : game.bird.y);
    sprite('land', -game.groundOffset, CONFIG.ground);

    if (game.state === 'home') {
      drawTitle(139);
      drawButton('play', 'button_play', 20, 320);
      drawButton('scores', 'button_score', 152, 320);
    } else if (game.state === 'ready') {
      sprite('text_ready', 46, 146);
      drawTutorial();
      number(0, 144, 44);
    } else if (game.state === 'playing') {
      number(game.score, 144, 44);
      if (container.dataset.score !== String(game.score)) container.dataset.score = String(game.score);
    } else if (game.state === 'dying') {
      const opacity = Math.max(0, 1 - game.deathFrames / 12);
      context.fillStyle = `rgba(255,255,255,${opacity})`;
      context.fillRect(0, 0, CONFIG.width, CONFIG.height);
    } else if (game.state === 'over') {
      const titleProgress = Math.min(1, game.overFrames / 20);
      sprite('text_game_over', 42, 126 - Math.sin(titleProgress * Math.PI) * 10, titleProgress);
      const panelProgress = Math.min(1, Math.max(0, game.overFrames - 14) / 20);
      if (panelProgress > 0) drawScorePanel(198 + (1 - panelProgress) ** 3 * 320, game.score, game.best, game.newBest, true);
      if (game.overFrames >= 50) {
        drawButton('play', 'button_play', 20, 320);
        drawButton('scores', 'button_score', 152, 320);
      }
    } else if (game.state === 'scores') {
      drawTitle(104);
      drawScorePanel(198, game.best, game.best, false, false);
      drawButton('menu', 'button_menu', 104, 330);
    }

    if (game.paused) {
      context.fillStyle = 'rgba(0,0,0,.25)';
      context.fillRect(0, 0, CONFIG.width, CONFIG.height);
      sprite('button_resume', 10, 10);
    } else if (game.state === 'ready' || game.state === 'playing') {
      drawButton('pause', 'button_pause', 10, 10);
    }
    context.restore();
    syncControls();
  }

  function act(action) {
    if (!game || failed) return;
    try {
      action();
      handleEvents();
      render();
    } catch (error) { reportFailure(error); }
  }

  function primaryAction() {
    if (game.paused) game.togglePause();
    else if (game.state === 'home') startRound();
    else if (game.state === 'ready' || game.state === 'playing') flap();
    else if (game.state === 'over' && game.overFrames >= 50) startRound();
    else if (game.state === 'scores') game.home();
  }

  canvas.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0) return;
    event.preventDefault();
    canvas.focus({ preventScroll: true });
    act(primaryAction);
  });

  const actions = {
    play: () => startRound(), scores: () => FlappySocial.show('rank'),
    pause: () => game.togglePause(), resume: () => game.togglePause(), menu: () => game.home(),
  };
  for (const [id, button] of Object.entries(buttons)) {
    button.addEventListener('pointerdown', () => { pressed = id; });
    button.addEventListener('pointerleave', () => { pressed = ''; });
    button.addEventListener('click', event => {
      event.stopPropagation();
      pressed = '';
      act(actions[id]);
      canvas.focus({ preventScroll: true });
    });
  }
  window.addEventListener('pointerup', () => { pressed = ''; });
  window.addEventListener('keydown', event => {
    if (event.repeat || !game || failed || FlappySocial.isOpen() || ['INPUT','TEXTAREA','SELECT'].includes(event.target.tagName)) return;
    if (event.target instanceof HTMLButtonElement && ['Space', 'Enter'].includes(event.code)) return;
    if (['Space', 'ArrowUp', 'KeyW', 'Enter'].includes(event.code)) {
      event.preventDefault();
      act(primaryAction);
    } else if (['KeyP', 'Escape'].includes(event.code)) {
      event.preventDefault();
      act(() => game.togglePause());
    } else if (event.code === 'KeyM') {
      muted = !muted;
      if (soundGain) soundGain.gain.value = muted ? 0 : 0.55;
      announcement.textContent = muted ? '音效已关闭' : '音效已开启';
    }
  });

  function pauseWhenHidden() {
    if (!game || failed) return;
    if ((game.state === 'playing' || game.state === 'ready') && !game.paused) act(() => game.togglePause());
    previousTime = undefined;
    accumulatedTime = 0;
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden) pauseWhenHidden(); });
  window.addEventListener('blur', pauseWhenHidden);

  function frame(time) {
    if (failed) return;
    try {
      if (document.hidden || FlappySocial.isOpen()) {
        previousTime = undefined;
        requestAnimationFrame(frame);
        return;
      }
      if (previousTime !== undefined) accumulatedTime += Math.min(time - previousTime, 100);
      previousTime = time;
      const stepDuration = 1000 / CONFIG.fps;
      let advanced = false;
      while (accumulatedTime >= stepDuration) {
        advanced = true;
        const active = recording && !game.paused;
        game.step();
        if (active) {
          roundFrames++;
          if (game.state === 'over') {
            recording = false;
            FlappySocial.completeRound({ id:round.id, frames:roundFrames, flaps, score:game.score }).catch(FlappySocial.reportGameError);
          }
        }
        accumulatedTime -= stepDuration;
      }
      handleEvents();
      if (advanced && !game.paused) render();
      requestAnimationFrame(frame);
    } catch (error) { reportFailure(error); }
  }

  Promise.all([loadTexture(texture, 'assets/atlas.png'), loadTexture(roadster, 'assets/roadster.png'), loadTexture(booster, 'assets/starship-booster.png'), loadTexture(dogecoinMedals, 'assets/dogecoin-medals.png')])
    .then(() => {
      const saved = localStorage.getItem(bestKey);
      const best = saved === null ? 0 : Number(saved);
      if (!Number.isSafeInteger(best) || best < 0) throw new Error('最高分存档无效');
      const bodyCanvas = document.createElement('canvas');
      bodyCanvas.width = roadster.naturalWidth;
      bodyCanvas.height = roadster.naturalHeight;
      const bodyContext = bodyCanvas.getContext('2d');
      bodyContext.drawImage(roadster, 0, 0);
      const body = createBody(bodyContext.getImageData(0, 0, bodyCanvas.width, bodyCanvas.height));
      game = new Game({ best, body });
      render();
      requestAnimationFrame(frame);
    })
    .catch(reportFailure);
})();
