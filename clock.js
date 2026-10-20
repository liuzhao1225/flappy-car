// Presentation timestamps never change the fixed 60 Hz physics step.
(() => {
  class FixedStepClock {
    constructor(fps) {
      this.fps = fps;
      this.reset();
    }

    reset() {
      this.startTime = undefined;
      this.steps = 0;
    }

    advance(time, step) {
      if (this.startTime === undefined) this.startTime = time;
      // Allow 1 ms of timestamp rounding/jitter at a tick boundary. Keep the
      // absolute origin so this tolerance never accumulates or changes speed.
      const target = Math.floor((time - this.startTime + 1) * this.fps / 1000);
      // Bound work per display frame, retaining ALL remaining time as debt.
      // A slow frame must never drop physics ticks or change their duration.
      const count = Math.min(6, target - this.steps);
      for (let i = 0; i < count; i++) step();
      this.steps += count;
      return count;
    }

    fraction(time) {
      if (this.startTime === undefined) return 1;
      // Presentation stays between the last two completed ticks. Retained
      // catch-up debt must never extrapolate through an untested collision.
      return Math.max(0, Math.min(1, (time - this.startTime + 1) * this.fps / 1000 - this.steps));
    }
  }
  globalThis.FlappyClock = FixedStepClock;
})();
