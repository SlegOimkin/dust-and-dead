"use strict";

class TokenBucket {
  constructor(ratePerSecond, burst, clock) {
    this.ratePerSecond = Math.max(1, Number(ratePerSecond) || 1);
    this.burst = Math.max(this.ratePerSecond, Number(burst) || this.ratePerSecond);
    this.tokens = this.burst;
    this.clock = clock || Date.now;
    this.updatedAt = this.clock();
  }

  take(cost) {
    const now = this.clock();
    const elapsed = Math.max(0, now - this.updatedAt) / 1000;
    this.updatedAt = now;
    this.tokens = Math.min(this.burst, this.tokens + elapsed * this.ratePerSecond);
    const wanted = Math.max(1, Number(cost) || 1);
    if (this.tokens < wanted) return false;
    this.tokens -= wanted;
    return true;
  }
}

module.exports = {
  TokenBucket,
};
