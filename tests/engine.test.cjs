const { test } = require('node:test');
const assert = require('node:assert/strict');
require('../engine.js');
const { Game, CONFIG, createBody, intersectsRect } = globalThis.FlappyModel;
const sprite = require('../assets/roadster.pixels.json');
const data = Uint8ClampedArray.from(sprite.rows.flatMap(row => [...row].flatMap(pixel =>
  sprite.palette[pixel].match(/../g).map(byte => parseInt(byte, 16)))));
const body = createBody({ width: sprite.width, height: sprite.height, data });

function start(best = 0) {
  const game = new Game({ body, random: () => 0.5, best });
  game.ready();
  game.flap();
  game.drainEvents();
  return game;
}

test('first flap starts the round and repeated flaps reset upward velocity', () => {
  const game = start();
  const y = game.bird.y;
  game.step();
  assert.equal(game.state, 'playing');
  assert.ok(game.bird.y < y);
  game.flap();
  assert.equal(game.bird.velocity, CONFIG.flap);
  assert.equal(game.bird.angleVelocity, -10);
});

test('a complete controlled flight scores each pipe once and preserves spacing', () => {
  const game = start();
  for (let frame = 0; frame < 2400; frame++) {
    const pipe = game.pipes.find(item => item.x + CONFIG.pipeWidth >= game.birdBody().bounds.left);
    const target = pipe.top + CONFIG.gap / 2;
    if (game.bird.y >= target + 18 && game.bird.velocity > 0) game.flap();
    game.step();
    assert.equal(game.state, 'playing', `unexpected collision at frame ${frame}`);
    for (let index = 1; index < game.pipes.length; index++) {
      assert.equal(game.pipes[index].x - game.pipes[index - 1].x, CONFIG.spacing);
    }
  }
  const pointEvents = game.drainEvents().filter(event => event === 'point');
  assert.ok(game.score >= 20);
  assert.equal(pointEvents.length, game.score);
});

test('upper and lower pipe collisions stop play without awarding a point', () => {
  for (const y of [150, 280]) {
    const game = start();
    game.pipes = [{ x: CONFIG.birdX - 10, top: 160, scored: false }];
    game.bird.y = y;
    game.bird.velocity = 0;
    game.step();
    assert.equal(game.state, 'dying');
    assert.equal(game.score, 0);
    assert.deepEqual(game.drainEvents(), ['hit']);
  }
});

test('ground impact freezes pipes, completes death and keeps the best score', () => {
  const game = start(3);
  game.score = 7;
  game.bird.y = CONFIG.ground - 7;
  game.bird.velocity = 5;
  const pipeX = game.pipes[0].x;
  game.step();
  assert.equal(game.state, 'dying');
  assert.equal(game.best, 7);
  assert.deepEqual(game.drainEvents(), ['hit', 'best']);
  for (let i = 0; i < 90; i++) game.step();
  assert.equal(game.state, 'over');
  assert.equal(game.pipes[0].x, pipeX);
  assert.ok(!game.drainEvents().includes('die'), 'ground impact must not play a second impact sound');
  game.ready();
  assert.equal(game.state, 'ready');
  assert.equal(game.score, 0);
  assert.equal(game.best, 7);
  assert.equal(game.pipes.length, 0);
});

test('pipe impact plays the fall sound once and lands before showing results', () => {
  const game = start();
  game.die(false);
  for (let i = 0; i < 180; i++) game.step();
  assert.equal(game.state, 'over');
  assert.equal(game.bird.angle, 90);
  assert.equal(game.birdBody().bounds.bottom, CONFIG.ground);
  assert.equal(game.drainEvents().filter(event => event === 'die').length, 1);
});

test('pause freezes physics and ignores flaps until resumed', () => {
  const game = start();
  game.togglePause();
  const before = JSON.stringify(game);
  for (let i = 0; i < 120; i++) { game.step(); game.flap(); }
  assert.equal(JSON.stringify(game), before);
  game.togglePause();
  game.step();
  assert.ok(game.bird.y < CONFIG.birdY);
});

test('above the ceiling, flaps are ignored until the visible car falls back', () => {
  const game = start();
  game.bird.y = 7;
  game.flap();
  game.step();
  assert.ok(game.birdBody().bounds.top < 0);
  const velocity = game.bird.velocity;
  game.flap();
  assert.equal(game.bird.velocity, velocity);
  assert.equal(game.state, 'playing');
  game.die(false);
  game.ready();
  assert.equal(game.deathFrames, 0);
  assert.equal(game.overFrames, 0);
  assert.equal(game.newBest, false);
});

test('random pipe openings stay within the playable area', () => {
  for (const random of [() => 0, () => 0.999999]) {
    const game = new Game({ body, random });
    game.ready();
    game.flap();
    const pipe = game.pipes[0];
    assert.ok(pipe.top >= CONFIG.minGapTop);
    assert.ok(pipe.top <= CONFIG.maxGapTop);
    assert.ok(pipe.top + CONFIG.gap < CONFIG.ground);
    assert.ok(game.color >= 0 && game.color <= 2);
  }
});

test('single-flap trajectory matches the original Android integer-position trace', () => {
  const game = start();
  // Original Bird.java starts its 20-pixel hitbox at y=246. These are
  // top-left positions from its float32 velocity / integer position update.
  const trace = new Map([[1, 241], [5, 223], [10, 208], [15, 200], [16, 199], [20, 200], [25, 207], [30, 222], [35, 244], [36, 249]]);
  let minimumY = game.bird.y;
  for (let frame = 1; frame <= 36; frame++) {
    game.step();
    minimumY = Math.min(minimumY, game.bird.y);
    if (trace.has(frame)) assert.equal(game.bird.y - 10, trace.get(frame), `trajectory at frame ${frame}`);
  }
  assert.equal(CONFIG.birdY - minimumY, 47);
  assert.ok(game.bird.y >= CONFIG.birdY);
});

test('a tap during fast descent immediately restores the original upward impulse', () => {
  const game = start();
  for (let frame = 0; frame < 38; frame++) game.step();
  assert.ok(game.bird.velocity > 5);
  const y = game.bird.y;
  game.flap();
  game.step();
  assert.equal(game.bird.y, y - 5);
});

test('car stays level after takeoff, pitches down while falling, and smoothly levels on a new flap', () => {
  const game = start();
  let risingFrames = 0;
  let sawNoseDown = false;
  for (let frame = 0; frame < 38; frame++) {
    game.step();
    if (game.bird.velocity < 0) {
      risingFrames++;
      assert.equal(game.bird.angle, 0, `car tilted during ascent at frame ${frame}`);
    }
    if (game.bird.velocity > 0 && game.bird.angle > 0) sawNoseDown = true;
  }
  assert.ok(risingFrames > 0);
  assert.ok(sawNoseDown);
  assert.ok(game.bird.angle > 0);
  const fallingAngle = game.bird.angle;
  game.flap();
  assert.equal(game.bird.angle, fallingAngle, 'flap must preserve the current angle');
  game.step();
  assert.ok(game.bird.angle > 0 && game.bird.angle < fallingAngle);
  for (let frame = 1; frame < 16; frame++) {
    const previousAngle = game.bird.angle;
    game.step();
    assert.ok(game.bird.angle >= 0 && game.bird.angle <= previousAngle);
  }
  assert.equal(game.bird.angle, 0);
});

test('even a vertical dive rotates back to level within the upward phase', () => {
  const game = start();
  game.bird.angle = 90;
  game.flap();
  assert.equal(game.bird.angle, 90);
  game.step();
  assert.equal(game.bird.angle, 80);
  let frame = 1;
  while (game.bird.angle > 0 && frame < 16) {
    game.step();
    frame++;
  }
  assert.equal(frame, 12);
  assert.equal(game.bird.angle, 0);
  assert.ok(game.bird.velocity < 0);
});

function collisionScene({ x, y, angle = 0, top = 160 }) {
  const game = start();
  game.bird.y = y;
  game.bird.angle = angle;
  game.bird.angleVelocity = 0;
  game.bird.velocity = -Math.fround(CONFIG.gravity);
  game.pipes = [{ x: x + CONFIG.speed, top, scored: false }];
  return game;
}

test('collision reuse invalidates with pose changes and leaves previous shapes intact', () => {
  const game = start();
  const initial = game.birdBody();
  const snapshot = JSON.stringify(initial);
  assert.equal(game.birdBody(), initial);
  for (const key of ['x', 'y', 'angle']) {
    const before = game.birdBody();
    game.bird[key] += 1;
    assert.notEqual(game.birdBody(), before);
    assert.equal(game.birdBody(), game.birdBody());
  }
  assert.equal(JSON.stringify(initial), snapshot);
});

test('vehicle collision follows opaque pixels, excluding padding, wheel gaps and exhaust', () => {
  const game = start();
  game.bird.y = 100;
  const shape = game.birdBody();
  assert.deepEqual(shape.bounds, { left: 64, top: 93, right: 116, bottom: 107 });
  const cell = (x, y) => ({ left: x + 0.1, right: x + 0.9, top: y + 0.1, bottom: y + 0.9 });
  // Check every source cell against its native alpha, including empty cells
  // inside the overall bounds. This also checks the sprite-centre offset.
  for (let y = 0; y < sprite.height; y++) {
    for (let x = 0; x < sprite.width; x++) {
      assert.equal(intersectsRect(shape, cell(64 + x, 90 + y)),
        data[(y * sprite.width + x) * 4 + 3] > 0, `source pixel (${x}, ${y})`);
    }
  }
  assert.equal(intersectsRect(shape, cell(67, 115)), false, 'exhaust is decorative');
  game.bird.angle = 90;
  assert.deepEqual(game.birdBody().bounds, { left: 83, top: 74, right: 97, bottom: 126 });
});

test('transparent top and bottom padding can pass within two pixels of the pipes', () => {
  for (const y of [169, 247]) {
    const game = collisionScene({ x: 70, y });
    game.step();
    assert.equal(game.state, 'playing', `padding collided at y=${y}`);
    assert.ok(!game.drainEvents().includes('hit'));
  }
});

test('the nose and tail collide before the old centre box reaches a pipe', () => {
  for (const x of [108, 16]) {
    const game = collisionScene({ x, y: 100, top: 240 });
    game.step();
    assert.equal(game.state, 'dying', `missed car end at pipe x=${x}`);
    assert.equal(game.score, 0);
    assert.deepEqual(game.drainEvents(), ['hit']);
  }
});

test('tilted car empty corners stay clear while rotated body pixels collide', () => {
  const clear = collisionScene({ x: 105, y: 100, angle: 45, top: 85 });
  const bounds = clear.birdBody().bounds;
  assert.ok(bounds.right > 105 && bounds.top < 85, 'fixture must overlap the enclosing rectangle');
  clear.step();
  assert.equal(clear.state, 'playing');

  // At 90 degrees the nose reaches y=126; the horizontal car ends at y=107.
  for (const angle of [0, 90]) {
    const game = collisionScene({ x: 85, y: 100, angle, top: 28 });
    game.step();
    assert.equal(game.state, angle === 90 ? 'dying' : 'playing');
  }
});

test('rotated body matches both opaque and transparent source cells at seven angles', () => {
  const game = start();
  game.bird.y = 100;
  for (const angle of [0, 15, 30, 45, 60, 75, 90]) {
    game.bird.angle = angle;
    const shape = game.birdBody();
    const radians = angle * Math.PI / 180;
    for (let y = 0; y < sprite.height; y++) {
      for (let x = 0; x < sprite.width; x++) {
        const opaque = data[(y * sprite.width + x) * 4 + 3] > 0;
        const dx = x + 0.5 - sprite.width / 2, dy = y + 0.5 - sprite.height / 2;
        const px = game.bird.x + dx * Math.cos(radians) - dy * Math.sin(radians);
        const py = game.bird.y + dx * Math.sin(radians) + dy * Math.cos(radians);
        assert.equal(intersectsRect(shape, { left: px - 0.01, right: px + 0.01, top: py - 0.01, bottom: py + 0.01 }), opaque,
          `wrong opacity at (${x}, ${y}), ${angle} degrees`);
      }
    }
  }
});

test('ground contact uses the visible body at level, diagonal and vertical angles', () => {
  for (const angle of [0, 15, 45, 75, 90]) {
    const game = collisionScene({ x: 550, y: 100, angle });
    const bottomOffset = game.birdBody().bounds.bottom - game.bird.y;
    game.bird.y = Math.ceil(CONFIG.ground - bottomOffset) - 1;
    game.step();
    assert.equal(game.state, 'playing', `early ground collision at ${angle} degrees`);
    game.bird.y++;
    game.bird.velocity = -Math.fround(CONFIG.gravity);
    game.bird.angleVelocity = 0;
    game.step();
    assert.equal(game.state, 'dying');
    const bottom = game.birdBody().bounds.bottom;
    assert.ok(bottom <= CONFIG.ground && bottom > CONFIG.ground - 1, 'body must rest within one native pixel of ground');
  }
});
