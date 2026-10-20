// Presentation only: never writes back to the deterministic game model.
(() => {
  class Motion {
    reset() { this.previousFrame = undefined; }

    capture(game) {
      this.previousFrame = game.frame;
      this.previousState = game.state;
      this.previousY = game.bird.y;
      this.previousAngle = game.bird.angle;
      this.previousGround = game.groundOffset;
    }

    update(game, fraction = 1) {
      const continuous = this.previousFrame === game.frame - 1
        && this.previousState === game.state && !game.paused;
      const t = continuous ? fraction : 1;
      this.y = t === 1 ? game.bird.y : this.previousY + (game.bird.y - this.previousY) * t;
      this.angle = t === 1 ? game.bird.angle : this.previousAngle + (game.bird.angle - this.previousAngle) * t;
      // Ground scroll wraps every 24 native pixels; interpolate forward across
      // the seam instead of moving backwards. New pipes spawn off screen.
      const travel = continuous ? (game.groundOffset - this.previousGround + 24) % 24 : 0;
      this.groundOffset = (game.groundOffset - travel * (1 - t) + 24) % 24;
      this.pipeOffset = continuous && game.state === 'playing' ? FlappyModel.CONFIG.speed * (1 - t) : 0;
    }
  }
  globalThis.FlappyMotion = Motion;
})();
