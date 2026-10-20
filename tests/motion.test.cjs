const test = require('node:test');
const assert = require('node:assert/strict');
require('../engine.js');
require('../clock.js');
require('../motion.js');
const { Game } = globalThis.FlappyModel;
const Motion = globalThis.FlappyMotion, Clock = globalThis.FlappyClock;

test('120 Hz presentation moves every display frame while physics stays at 60 Hz', () => {
  const clock = new Clock(60), view = new Motion();
  const game = { frame:0, state:'playing', bird:{y:256,angle:0}, groundOffset:0, paused:false };
  let x=550;
  const positions=[];
  for(let frame=0;frame<=120;frame++) {
    const time=frame*1000/120;
    clock.advance(time,()=>{view.capture(game);game.frame++;x-=2;game.groundOffset=(game.groundOffset+2)%24;});
    view.update(game,clock.fraction(time));
    positions.push(Math.round(x+view.pipeOffset));
  }
  assert.equal(game.frame,60);
  for(let i=3;i<positions.length;i++)assert.equal(positions[i-1]-positions[i],1);
});

test('touch-like 5 ms callback jitter stays on the elapsed-time path without 0/4 pixel jumps', () => {
  const clock=new Clock(60),view=new Motion();
  const game={frame:0,state:'playing',bird:{y:256,angle:0},groundOffset:0,paused:false};
  let x=550,previous,holds=0,jumps=0;
  for(let frame=0;frame<=180;frame++) {
    const time=frame*1000/60+(frame%30===1?-5:0);
    clock.advance(time,()=>{view.capture(game);game.frame++;x-=2;game.groundOffset=(game.groundOffset+2)%24;});
    view.update(game,clock.fraction(time));
    const position=Math.round(x+view.pipeOffset);
    if(frame>2){
      const expected=550-2*((time+1)*60/1000-1);
      assert.ok(Math.abs(position-expected)<=.5+1e-9);
      if(position===previous)holds++;
      if(previous-position>=4)jumps++;
    }
    previous=position;
  }
  assert.equal(holds,0);assert.equal(jumps,0);assert.equal(game.frame,180);
});

test('ground seam moves forward and a collision immediately renders the authoritative pose', () => {
  const view=new Motion();
  const game={frame:10,state:'playing',bird:{y:200,angle:30},groundOffset:22,paused:false};
  view.capture(game);game.frame++;game.bird.y=204;game.bird.angle=40;game.groundOffset=0;
  view.update(game,.5);
  assert.equal(view.groundOffset,23);assert.equal(view.y,202);assert.equal(view.angle,35);
  game.state='dying';view.update(game,.1);
  assert.equal(view.y,204);assert.equal(view.angle,40);assert.equal(view.pipeOffset,0);
  game.paused=true;view.update(game,0);assert.equal(view.y,204);
  view.reset();game.paused=false;view.update(game,0);assert.equal(view.y,204);
});

test('display sampling never changes physics, collisions, scoring or the replay input record', async () => {
  const {body,replay}=await import('../api/replay.mjs');
  require('../seed.js');
  for(const hz of [30,60,90,120,144]) {
    const game=new Game({body,random:flappyRandom(42)}),reference=new Game({body,random:flappyRandom(42)});
    game.ready();reference.ready();
    const clock=new Clock(60),view=new Motion(),flaps=[];
    let tick=0;
    for(let display=0;game.state!=='over'&&display<hz*90;display++) {
      const time=display*1000/hz+(display%30===1?-5:0);
      clock.advance(time,()=>{
        const pipe=game.pipes.find(p=>p.x+52>=64);
        if(tick===0||(tick<1800&&game.state==='playing'&&game.bird.velocity>0&&game.bird.y>=pipe.top+66)) {
          game.flap();reference.flap();flaps.push(tick);
        }
        view.capture(game);game.step();reference.step();tick++;
        assert.equal(JSON.stringify(game),JSON.stringify(reference));
      });
      const unchanged=JSON.stringify(game);
      view.update(game,clock.fraction(time));
      assert.equal(JSON.stringify(game),unchanged);
      assert.ok(view.angle>=0&&view.angle<=90);
    }
    assert.equal(game.state,'over');
    assert.equal(replay(42,tick,flaps),game.score);
  }
});

test('long frames retain simulation debt and never extrapolate past the latest collision-tested state',()=>{
  const clock=new Clock(60);clock.advance(0,()=>{});clock.advance(1000,()=>{});
  assert.equal(clock.steps,6);assert.equal(clock.fraction(1000),1);
  clock.reset();assert.equal(clock.fraction(100000),1);
});
