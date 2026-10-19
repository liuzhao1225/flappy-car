import '../engine.js';
import '../seed.js';
import pixels from '../assets/roadster.pixels.json' with { type: 'json' };

const data = new Uint8ClampedArray(pixels.width * pixels.height * 4);
pixels.rows.forEach((row, y) => [...row].forEach((key, x) => {
  data[(y * pixels.width + x) * 4 + 3] = parseInt(pixels.palette[key].slice(6), 16);
}));
export const body = globalThis.FlappyModel.createBody({ ...pixels, data });

export function replay(seed, frames, flaps) {
  if (!Number.isSafeInteger(frames) || frames < 1 || frames > 108000
      || !Array.isArray(flaps) || flaps.length > 15000 || flaps[0] !== 0
      || flaps.some((frame, i) => !Number.isSafeInteger(frame) || frame < 0 || frame >= frames || (i && frame <= flaps[i - 1]))) {
    throw new Error('飞行记录格式无效');
  }
  const game = new globalThis.FlappyModel.Game({ body, random: globalThis.flappyRandom(seed) });
  game.ready();
  let next = 0;
  for (let frame = 0; frame < frames; frame++) {
    if (flaps[next] === frame) {
      if (!['ready', 'playing'].includes(game.state)) throw new Error('飞行结束后仍有操作');
      game.flap(); next++;
    }
    game.step();
    game.drainEvents();
    if (game.state === 'over' && frame !== frames - 1) throw new Error('飞行结束帧不一致');
  }
  if (game.state !== 'over') throw new Error('这次飞行尚未完成');
  return game.score;
}
