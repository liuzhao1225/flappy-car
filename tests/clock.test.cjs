const test = require('node:test');
const assert = require('node:assert/strict');
require('../clock.js');
const Clock = globalThis.FlappyClock;

test('rounded 60 Hz display timestamps produce one fixed physics tick per frame', () => {
  const clock = new Clock(60);
  let ticks = 0;
  assert.equal(clock.advance(0, () => ticks++), 0);
  for (let frame = 1; frame <= 3600; frame++) {
    const time = Math.round(frame * 1000 / 60 * 10) / 10;
    assert.equal(clock.advance(time, () => ticks++), 1, `display frame ${frame}`);
  }
  assert.equal(ticks, 3600);
});

test('rounded 120 Hz display timestamps advance physics on every second callback without 25 ms gaps', () => {
  const clock = new Clock(60);
  clock.advance(0, () => {});
  for (let frame = 1; frame <= 1200; frame++) {
    const time = Math.round(frame * 1000 / 120 * 10) / 10;
    assert.equal(clock.advance(time, () => {}), frame % 2 === 0 ? 1 : 0);
  }
});

test('30/60/90/120/144 Hz and jittered displays advance the same 60 Hz simulation', () => {
  for (const fps of [30, 60, 90, 120, 144]) {
    for (const jitter of [0, 1]) {
      const clock = new Clock(60);
      let ticks = 0;
      clock.advance(0, () => ticks++);
      for (let frame = 1; frame <= fps * 60; frame++) {
        const time = frame * 1000 / fps + (frame === fps * 60 ? 0 : Math.sin(frame) * jitter);
        clock.advance(time, () => ticks++);
        assert.equal(ticks, Math.floor((time + 1) * 60 / 1000));
      }
      assert.equal(ticks, 3600, `${fps} Hz, jitter ${jitter}`);
    }
  }
});

test('long display stalls retain every physics tick and bound each callback to six', () => {
  const clock = new Clock(60);
  let ticks = 0;
  clock.advance(0, () => ticks++);
  assert.equal(clock.advance(1000, () => ticks++), 6);
  assert.equal(ticks, 6);
  for (let i = 0; i < 9; i++) assert.equal(clock.advance(1000, () => ticks++), 6);
  assert.equal(ticks, 60);
  assert.equal(clock.advance(1000, () => ticks++), 0);
});

test('pause and background time never get applied to the resumed simulation', () => {
  const clock = new Clock(60);
  let ticks = 0;
  clock.advance(0, () => ticks++);
  clock.advance(50, () => ticks++);
  assert.equal(ticks, 3);
  clock.reset();
  clock.advance(100000, () => ticks++);
  assert.equal(ticks, 3);
  clock.advance(100000 + 1000 / 60, () => ticks++);
  assert.equal(ticks, 4);
});

test('a frame-recorded flight replays identically under different display schedules', async () => {
  const { body, replay } = await import('../api/replay.mjs');
  const { Game } = globalThis.FlappyModel;
  const makeGame = () => new Game({ body, random: globalThis.flappyRandom(42) });
  const reference = makeGame(); reference.ready();
  const flaps = [], states = [];
  for (let frame = 0; reference.state !== 'over'; frame++) {
    const pipe = reference.pipes.find(p => p.x + 52 >= reference.bird.x - 26);
    if (frame === 0 || (frame < 3000 && reference.state === 'playing' && reference.bird.velocity > 0 && reference.bird.y >= pipe.top + 66)) {
      flaps.push(frame); reference.flap();
    }
    reference.step();
    states.push(JSON.stringify({ bird:reference.bird, pipes:reference.pipes, score:reference.score, state:reference.state, events:reference.drainEvents() }));
  }
  assert.equal(replay(42, states.length, flaps), reference.score);
  for (const fps of [30, 60, 90, 120, 144]) {
    const game = makeGame(); game.ready();
    const clock = new Clock(60);
    let tick = 0, input = 0;
    for (let display = 0; tick < states.length; display++) {
      const time = Math.round(display * 1000 / fps * 10) / 10 + (display > fps * 2 ? 250 : 0);
      clock.advance(time, () => {
        if (tick >= states.length) return;
        if (flaps[input] === tick) { game.flap(); input++; }
        game.step();
        assert.equal(JSON.stringify({ bird:game.bird, pipes:game.pipes, score:game.score, state:game.state, events:game.drainEvents() }), states[tick], `${fps} Hz at tick ${tick}`);
        tick++;
      });
    }
    assert.equal(game.score, reference.score);
    assert.equal(input, flaps.length);
  }
});
