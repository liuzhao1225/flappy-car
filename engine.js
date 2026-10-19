/* Fixed 60 Hz. Physics follows reFlappy's original branch, commit 5ef7b7b.
 * See PHYSICS.md for source links and measured trajectory. */
(() => {
  const CONFIG = Object.freeze({
    width: 288, height: 512, ground: 400, fps: 60,
    birdX: 90, birdY: 256,
    gravity: 0.3, flap: -5, terminalVelocity: 8,
    speed: 2, pipeWidth: 52, gap: 96, spacing: 157,
    firstPipeX: 550, minGapTop: 84, maxGapTop: 264,
  });

  // Kept only for the original integer-position trace and scoring threshold.
  const originalBirdHalfSize = 10;
  const contactEpsilon = 1e-9;

  function createBody({ width, height, data }) {
    // Merge adjacent opaque pixels on each row. Rotated row rectangles retain
    // the exact native silhouette, including the gaps around the wheels.
    const spans = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width;) {
        if (!data[(y * width + x) * 4 + 3]) { x++; continue; }
        const start = x;
        while (x < width && data[(y * width + x) * 4 + 3]) x++;
        spans.push({ x: (start + x - width) / 2, y: y + 0.5 - height / 2, halfWidth: (x - start) / 2 });
      }
    }
    if (!spans.length) throw new Error('车辆图片没有可用于碰撞的非透明像素');
    return spans;
  }

  function intersectsRect(body, rect) {
    const bounds = body.bounds;
    if (bounds.right < rect.left || bounds.left > rect.right || bounds.bottom < rect.top || bounds.top > rect.bottom) return false;
    const halfWidth = (rect.right - rect.left) / 2;
    const halfHeight = (rect.bottom - rect.top) / 2;
    const x = (rect.left + rect.right) / 2;
    const y = (rect.top + rect.bottom) / 2;
    const { cos, sin } = body;
    const ac = Math.abs(cos), as = Math.abs(sin);
    // Separating axes: world x/y and the car's rotated x/y. A bounding-box
    // overlap alone must not count as a hit in empty corners of a tilted car.
    return body.spans.some(span => {
      const dx = x - span.x, dy = y - span.y;
      return Math.abs(dx) <= halfWidth + span.halfWidth * ac + 0.5 * as + contactEpsilon
        && Math.abs(dy) <= halfHeight + span.halfWidth * as + 0.5 * ac + contactEpsilon
        && Math.abs(dx * cos + dy * sin) <= span.halfWidth + halfWidth * ac + halfHeight * as + contactEpsilon
        && Math.abs(-dx * sin + dy * cos) <= 0.5 + halfWidth * as + halfHeight * ac + contactEpsilon;
    });
  }

  class Game {
    constructor({ body, random = Math.random, best = 0 } = {}) {
      if (!body?.length) throw new Error('缺少车辆碰撞轮廓');
      this.body = body;
      this.random = random;
      this.best = best;
      this.state = 'home';
      this.frame = 0;
      this.groundOffset = 0;
      this.theme = 'day';
      this.color = 0;
      this.events = [];
      this.resetRound();
    }

    resetRound() {
      this.score = 0;
      this.bird = { x: CONFIG.birdX, y: CONFIG.birdY, velocity: 0, angle: 0, angleVelocity: 0, flapTicks: 0 };
      this.pipes = [];
      this.paused = false;
      this.deathFrames = 0;
      this.overFrames = 0;
      this.newBest = false;
    }

    ready() {
      this.resetRound();
      this.state = 'ready';
      this.theme = this.random() < 0.6 ? 'day' : 'night';
      this.color = Math.floor(this.random() * 3);
      this.events.push('swooshing');
    }

    home() {
      this.resetRound();
      this.state = 'home';
      this.events.push('swooshing');
    }

    showScores() {
      this.state = 'scores';
      this.events.push('swooshing');
    }

    togglePause() {
      if (this.state === 'playing' || this.state === 'ready') this.paused = !this.paused;
    }

    addPipe(x) {
      this.pipes.push({ x, top: Math.floor(CONFIG.minGapTop + this.random() * (CONFIG.maxGapTop - CONFIG.minGapTop + 1)), scored: false });
    }

    flap() {
      if (this.paused) return;
      if (this.state === 'ready') {
        this.state = 'playing';
        this.bird.y = CONFIG.birdY;
        this.addPipe(CONFIG.firstPipeX);
      }
      if (this.state !== 'playing' || this.birdBody().bounds.top < 0) return;
      this.bird.velocity = CONFIG.flap;
      this.bird.angleVelocity = -10;
      this.bird.flapTicks = 0;
      this.events.push('wing');
    }

    advanceBird() {
      // The Android game uses Java float arithmetic and truncates TOP-LEFT y
      // to an integer every tick. Floating-point positions change jump height.
      const halfHeight = originalBirdHalfSize;
      this.bird.velocity = Math.min(CONFIG.terminalVelocity, Math.fround(this.bird.velocity + Math.fround(CONFIG.gravity)));
      this.bird.y = Math.trunc(Math.fround((this.bird.y - halfHeight) + this.bird.velocity)) + halfHeight;
      // Preserve the original gradual rotation, stopping at level on ascent.
      this.bird.angle = Math.max(0, Math.min(90, Math.fround(this.bird.angle + this.bird.angleVelocity)));
      this.bird.angleVelocity = Math.fround(this.bird.angleVelocity + Math.fround(0.4));
      this.bird.flapTicks++;
      const bottom = this.birdBody().bounds.bottom;
      if (bottom >= CONFIG.ground) {
        // Keep the rendered integer centre above the ground at every angle.
        this.bird.y -= Math.ceil(bottom - CONFIG.ground);
        this.bird.velocity = 0;
        return true;
      }
      return false;
    }

    birdBody() {
      const angle = this.bird.angle * Math.PI / 180;
      const cos = this.bird.angle === 90 ? 0 : Math.cos(angle);
      const sin = Math.sin(angle);
      // Match drawRoadster's centre, rotation and native pixel size exactly.
      const x = Math.round(this.bird.x), y = Math.round(this.bird.y);
      const bounds = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
      const spans = this.body.map(span => {
        const sx = x + span.x * cos - span.y * sin;
        const sy = y + span.x * sin + span.y * cos;
        const extentX = span.halfWidth * Math.abs(cos) + 0.5 * Math.abs(sin);
        const extentY = span.halfWidth * Math.abs(sin) + 0.5 * Math.abs(cos);
        bounds.left = Math.min(bounds.left, sx - extentX);
        bounds.right = Math.max(bounds.right, sx + extentX);
        bounds.top = Math.min(bounds.top, sy - extentY);
        bounds.bottom = Math.max(bounds.bottom, sy + extentY);
        return { x: sx, y: sy, halfWidth: span.halfWidth };
      });
      return { spans, bounds, cos, sin };
    }

    die(onGround) {
      this.state = 'dying';
      this.deathFrames = 0;
      this.groundDeath = onGround;
      this.events.push('hit');
      this.newBest = this.score > this.best;
      if (this.newBest) {
        this.best = this.score;
        this.events.push('best');
      }
    }

    step() {
      if (this.paused) return;
      this.frame++;
      if (['home', 'ready', 'scores', 'playing'].includes(this.state)) {
        this.groundOffset = (this.groundOffset + CONFIG.speed) % 24;
      }
      if (this.state === 'home' || this.state === 'ready') {
        this.bird.y = CONFIG.birdY + Math.trunc(Math.sin(this.frame * 8 * Math.PI / 180) * 4);
        return;
      }
      if (this.state === 'over') { this.overFrames++; return; }
      if (this.state === 'dying') {
        this.deathFrames++;
        if (this.deathFrames === 34 && !this.groundDeath) this.events.push('die');
        const onGround = this.advanceBird();
        if (onGround && this.deathFrames >= 67) {
          this.state = 'over';
          this.overFrames = 0;
          this.events.push('swooshing');
        }
        return;
      }
      if (this.state !== 'playing') return;

      if (this.advanceBird()) {
        this.die(true);
        return;
      }

      const body = this.birdBody();
      for (const pipe of this.pipes) {
        pipe.x -= CONFIG.speed;
        // Obstacles retain their original full rectangular collision areas.
        const left = Math.round(pipe.x), right = left + CONFIG.pipeWidth;
        const top = Math.round(pipe.top), bottom = top + CONFIG.gap;
        if (intersectsRect(body, { left, right, top: Math.min(body.bounds.top, top), bottom: top })
          || intersectsRect(body, { left, right, top: bottom, bottom: Math.max(body.bounds.bottom, bottom) })) {
          this.die(false);
          return;
        }
        if (!pipe.scored && pipe.x <= this.bird.x - originalBirdHalfSize) {
          pipe.scored = true;
          this.score++;
          this.events.push('point');
        }
      }
      if (this.pipes.at(-1).x <= CONFIG.width - CONFIG.spacing) {
        this.addPipe(this.pipes.at(-1).x + CONFIG.spacing);
      }
      this.pipes = this.pipes.filter(pipe => pipe.x + CONFIG.pipeWidth > 0);
    }

    drainEvents() { return this.events.splice(0); }
  }

  globalThis.FlappyModel = { CONFIG, Game, createBody, intersectsRect };
})();
