import { CONFIG as C, difficulty } from './config';

export type Phase = 'intro' | 'playing' | 'dying' | 'gameover';
export type Controls = { left: boolean; right: boolean; fire: boolean };
export const NO_INPUT: Controls = { left: false, right: false, fire: false };
export type Alien = {
  id: number; row: number; homeX: number; homeY: number; x: number; y: number;
  mode: 'formation' | 'diving' | 'returning'; progress: number;
  startX: number; startY: number; targetX: number; direction: number;
};
export type Missile = { id: number; x: number; y: number; vx: number; vy: number };
export type GameEvent = { kind: 'shot' | 'attack' | 'hit' | 'explosion' | 'wave' | 'warning' | 'bonus'; x: number; y: number; row?: number; points?: number };

/** Pure simulation: no browser, audio, rendering or storage dependencies. */
export class GameModel {
  phase: Phase = 'intro';
  paused = false;
  score = 0;
  lives: number = C.startingLives;
  wave = 1;
  kills = 0;
  fuel: number = C.fuelSeconds;
  elapsed = 0;
  player = { x: C.width / 2, y: C.playerY, invulnerability: 0 };
  aliens: Alien[] = [];
  missile: Missile | null = null;
  enemyMissiles: Missile[] = [];
  private events: GameEvent[] = [];
  private timer: number = C.transitionSeconds;
  private diveTimer = 1;
  private shotTimer = 1.5;
  private warningTimer = 0;
  private bonusAwarded = false;
  private nextId = 0;
  private randomState: number;

  constructor(seed = 1982) {
    this.randomState = seed >>> 0 || 1;
    this.createWave();
  }

  private random() {
    this.randomState = (Math.imul(1664525, this.randomState) + 1013904223) >>> 0;
    return this.randomState / 0x100000000;
  }

  private createWave() {
    this.aliens = C.rowCounts.flatMap((count, row) => Array.from({ length: count }, (_, col) => {
      const x = 320 + (col - (count - 1) / 2) * 43;
      const y = 66 + row * 29;
      return { id: this.nextId++, row, homeX: x, homeY: y, x, y, mode: 'formation' as const,
        progress: 0, startX: x, startY: y, targetX: x, direction: 1 };
    }));
    this.fuel = C.fuelSeconds;
    this.missile = null;
    this.enemyMissiles = [];
    this.diveTimer = 1;
    this.shotTimer = 1.5;
    this.warningTimer = 0;
    this.phase = 'intro';
    this.timer = C.transitionSeconds;
    this.events.push({ kind: 'wave', x: 320, y: 240 });
  }

  takeEvents(): GameEvent[] {
    return this.events.splice(0);
  }

  step(dt: number, input: Controls = NO_INPUT) {
    if (this.paused || this.phase === 'gameover') return;
    this.elapsed += dt;
    if (this.phase === 'intro' || this.phase === 'dying') {
      this.timer -= dt;
      this.updateFormation();
      if (this.timer <= 0) {
        if (this.phase === 'dying' && this.lives === 0) { this.phase = 'gameover'; return; }
        if (this.phase === 'dying') {
          this.player.x = C.width / 2;
          this.player.invulnerability = C.invulnerabilitySeconds;
          this.fuel = C.fuelSeconds;
          this.warningTimer = 0;
        }
        this.phase = 'playing';
      }
      return;
    }

    this.player.invulnerability = Math.max(0, this.player.invulnerability - dt);
    const direction = Number(input.right) - Number(input.left);
    this.player.x = Math.max(22, Math.min(C.width - 22, this.player.x + direction * C.playerSpeed * dt));
    this.fuel = Math.max(0, this.fuel - dt);
    if (this.fuel <= 0) { this.loseShip(); return; }
    if (this.fuel <= C.fuelSeconds * C.warningThreshold) {
      this.warningTimer -= dt;
      if (this.warningTimer <= 0) {
        this.events.push({ kind: 'warning', x: this.player.x, y: this.player.y });
        this.warningTimer = 1.5;
      }
    }

    if (input.fire && !this.missile) {
      this.missile = { id: this.nextId++, x: this.player.x, y: this.player.y - 12, vx: 0, vy: -C.playerMissileSpeed };
      this.events.push({ kind: 'shot', x: this.player.x, y: this.player.y - 12 });
    }
    const d = difficulty(this.wave);
    this.updateFormation();
    this.diveTimer -= dt;
    if (this.diveTimer <= 0) {
      const available = this.aliens.filter(a => a.mode === 'formation');
      if (available.length && this.aliens.filter(a => a.mode !== 'formation').length < d.maxDivers) {
        const alien = available[Math.floor(this.random() * available.length)];
        alien.mode = 'diving'; alien.progress = 0;
        alien.startX = alien.x; alien.startY = alien.y;
        alien.targetX = this.player.x;
        alien.direction = this.random() < 0.5 ? -1 : 1;
        this.events.push({ kind: 'attack', x: alien.x, y: alien.y, row: alien.row });
      }
      this.diveTimer = d.diveInterval * (0.75 + this.random() * 0.5);
    }
    for (const alien of this.aliens) {
      if (alien.mode === 'diving') {
        const before = alien.progress;
        alien.progress += dt / d.diveDuration;
        const t = alien.progress;
        const approach = Math.min(1, t * 1.65);
        alien.x = alien.startX + (alien.targetX - alien.startX) * approach + Math.sin(t * Math.PI * 2) * 58 * alien.direction;
        alien.x = Math.max(18, Math.min(C.width - 18, alien.x));
        alien.y = alien.startY + (C.height + 35 - alien.startY) * t;
        if ((before < 0.28 && t >= 0.28) || (before < 0.56 && t >= 0.56)) this.enemyShot(alien);
        if (t >= 1) { alien.mode = 'returning'; alien.y = -24; alien.startX = alien.x; alien.progress = 0; }
      } else if (alien.mode === 'returning') {
        alien.progress += dt / 0.8;
        const t = Math.min(1, alien.progress);
        alien.x = alien.startX + (this.formationX(alien) - alien.startX) * t;
        alien.y = -24 + (alien.homeY + 24) * t;
        if (t >= 1) { alien.mode = 'formation'; alien.progress = 0; }
      }
    }
    this.shotTimer -= dt;
    if (this.shotTimer <= 0) {
      const available = this.aliens.filter(a => a.mode === 'formation');
      if (available.length) this.enemyShot(available[Math.floor(this.random() * available.length)]);
      this.shotTimer = d.shotInterval * (0.7 + this.random() * 0.6);
    }
    this.updateMissiles(dt);
    if (this.player.invulnerability <= 0) {
      const missileHit = this.enemyMissiles.some(m => Math.abs(m.x - this.player.x) < 14 && Math.abs(m.y - this.player.y) < 12);
      const alienHit = this.aliens.some(a => Math.abs(a.x - this.player.x) < 23 && Math.abs(a.y - this.player.y) < 17);
      if (missileHit || alienHit) { this.loseShip(); return; }
    }
    if (!this.aliens.length) { this.wave++; this.createWave(); }
  }

  private formationX(alien: Alien) { return alien.homeX + Math.sin(this.elapsed * 0.85) * 26; }
  private updateFormation() {
    for (const alien of this.aliens) if (alien.mode === 'formation') {
      alien.x = this.formationX(alien);
      alien.y = alien.homeY + Math.sin(this.elapsed * 1.6) * 2;
    }
  }

  private enemyShot(alien: Alien) {
    if (alien.y > C.playerY - 35 || this.enemyMissiles.length >= 18) return;
    const speed = difficulty(this.wave).shotSpeed;
    const dx = this.player.x - alien.x;
    const dy = Math.max(80, this.player.y - alien.y);
    const length = Math.hypot(dx, dy);
    this.enemyMissiles.push({ id: this.nextId++, x: alien.x, y: alien.y + 8, vx: dx / length * speed, vy: dy / length * speed });
  }

  private updateMissiles(dt: number) {
    if (this.missile) {
      const missile = this.missile;
      const oldY = missile.y;
      missile.y += missile.vy * dt;
      // Find the first target along the swept segment, so a fast shot cannot tunnel.
      const hit = this.aliens.filter(a => Math.abs(a.x - missile.x) < 15 && a.y + 11 >= missile.y && a.y - 11 <= oldY)
        .sort((a, b) => b.y - a.y)[0];
      if (hit) {
        const points = hit.mode === 'formation' ? C.formationPoints[hit.row] : C.divingPoints[hit.row];
        this.score += points;
        this.kills++;
        this.aliens = this.aliens.filter(a => a.id !== hit.id);
        this.events.push({ kind: 'hit', x: hit.x, y: hit.y, row: hit.row, points });
        this.missile = null;
        if (!this.bonusAwarded && this.score >= C.bonusScore) {
          this.bonusAwarded = true; this.lives++;
          this.events.push({ kind: 'bonus', x: this.player.x, y: this.player.y });
        }
      } else if (missile.y < -16) this.missile = null;
    }
    for (const missile of this.enemyMissiles) {
      missile.x += missile.vx * dt;
      missile.y += missile.vy * dt;
    }
    this.enemyMissiles = this.enemyMissiles.filter(m => m.y < C.height + 20 && m.x > -20 && m.x < C.width + 20);
  }

  private loseShip() {
    this.lives = Math.max(0, this.lives - 1);
    this.events.push({ kind: 'explosion', x: this.player.x, y: this.player.y });
    this.missile = null;
    this.enemyMissiles = [];
    for (const alien of this.aliens) { alien.mode = 'formation'; alien.progress = 0; }
    this.phase = 'dying';
    this.timer = C.respawnSeconds;
    this.diveTimer = 2;
    this.shotTimer = 1.8;
  }
}

export class FixedStepClock {
  private accumulator = 0;
  advance(seconds: number, update: (dt: number) => void) {
    this.accumulator += Math.min(Math.max(seconds, 0), 0.25);
    while (this.accumulator + 1e-10 >= C.step) {
      update(C.step);
      this.accumulator -= C.step;
    }
  }
  clear() { this.accumulator = 0; }
}
