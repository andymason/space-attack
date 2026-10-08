import { describe, expect, it } from 'vitest';
import { CONFIG as C } from '../src/game/config';
import { FixedStepClock, GameModel, NO_INPUT, type Alien, type Controls } from '../src/game/model';

function advance(game: GameModel, seconds: number, input: Controls = NO_INPUT) {
  for (let i = 0; i < Math.round(seconds / C.step); i++) game.step(C.step, input);
}

function aimAtLastAlien(game: GameModel, row = 5, diving = false) {
  const alien: Alien = { ...game.aliens.find(a => a.row === row)!, homeX: 320, homeY: 320, x: 320, y: 320,
    startX: 320, startY: 320, targetX: 320, progress: 0, mode: diving ? 'diving' : 'formation' };
  game.aliens = [alien]; game.phase = 'playing';
  game.missile = { id: 1000, x: 320, y: 330, vx: 0, vy: -510 };
}

describe('wave choreography', () => {
  it('celebrates the final kill, clears the screen, enters the next formation, then counts down', () => {
    const game = new GameModel();
    aimAtLastAlien(game); game.fuel = 25;
    game.enemyMissiles = [{ id: 2000, x: 30, y: 40, vx: 0, vy: 150 }];
    game.takeEvents(); game.step(C.step);
    expect(game.phase).toBe('celebrating'); expect(game.wave).toBe(1);
    expect(game.score).toBe(30); expect(game.aliens).toHaveLength(0);
    expect(game.enemyMissiles).toHaveLength(0); expect(game.missile).toBeNull();
    expect(game.takeEvents().map(e => e.kind)).toEqual(['hit', 'clear']);
    const fuelAtClear = game.fuel;
    advance(game, C.celebrationSeconds);
    expect(game.phase).toBe('intermission'); expect(game.aliens).toHaveLength(0);
    expect(game.fuel).toBe(fuelAtClear);
    advance(game, C.intermissionSeconds);
    expect(game.phase).toBe('assembling'); expect(game.wave).toBe(2);
    expect(game.fuel).toBe(90); expect(game.aliens).toHaveLength(41);
    expect(game.aliens.every(a => a.y < 0)).toBe(true);
    advance(game, C.assemblySeconds / 2);
    expect(game.aliens.some(a => a.y > 0 && a.y < a.homeY)).toBe(true);
    advance(game, C.assemblySeconds / 2);
    expect(game.phase).toBe('countdown'); expect(game.countdown).toBe(3);
    const events = game.takeEvents();
    expect(events.some(e => e.kind === 'wave')).toBe(true);
    expect(events.filter(e => e.kind === 'countdown').map(e => e.count)).toEqual([3]);
    advance(game, 1); expect(game.countdown).toBe(2);
    advance(game, 1); expect(game.countdown).toBe(1);
    advance(game, 1); expect(game.phase).toBe('launching');
    expect(game.takeEvents().map(e => e.kind)).toEqual(['countdown', 'countdown', 'go']);
    advance(game, C.launchSeconds);
    expect(game.phase).toBe('playing'); expect(game.fuel).toBe(90);
    game.step(C.step); expect(game.fuel).toBeLessThan(90);
  });

  it('blocks firing, movement, attacks and fuel drain until the countdown finishes', () => {
    const game = new GameModel();
    const firing: Controls = { left: true, right: false, fire: true };
    advance(game, C.assemblySeconds + C.countdownSeconds, firing);
    expect(game.phase).toBe('launching'); expect(game.missile).toBeNull();
    expect(game.enemyMissiles).toHaveLength(0); expect(game.player.x).toBe(320);
    expect(game.fuel).toBe(90);
    expect(game.takeEvents().filter(e => e.kind === 'attack' || e.kind === 'shot')).toHaveLength(0);
  });

  it('freezes all transition state when paused and resumes at the same countdown', () => {
    const game = new GameModel();
    advance(game, C.assemblySeconds + 1.5);
    expect(game.countdown).toBe(2);
    const elapsed = game.elapsed;
    game.paused = true; advance(game, 5);
    expect(game.elapsed).toBe(elapsed); expect(game.countdown).toBe(2);
    game.paused = false; advance(game, 0.5);
    expect(game.countdown).toBe(1);
  });

  it('has identical simulation results at 30, 60 and 144 rendering frames per second', () => {
    function run(fps: number) {
      const game = new GameModel(123); const clock = new FixedStepClock();
      aimAtLastAlien(game);
      for (let i = 0; i < 12 * fps; i++) clock.advance(1 / fps, dt => game.step(dt));
      return { phase: game.phase, wave: game.wave, fuel: game.fuel, elapsed: game.elapsed,
        aliens: game.aliens, enemyMissiles: game.enemyMissiles, events: game.takeEvents() };
    }
    expect(run(30)).toEqual(run(60)); expect(run(144)).toEqual(run(60));
  });
});

describe('combat remains intact', () => {
  it.each(C.formationPoints.map((points, row) => [row, points]))('awards formation points for row %i', (row, points) => {
    const game = new GameModel(); aimAtLastAlien(game, row); game.step(C.step);
    expect(game.score).toBe(points); expect(game.kills).toBe(1);
  });
  it.each(C.divingPoints.map((points, row) => [row, points]))('awards diving points for row %i', (row, points) => {
    const game = new GameModel(); aimAtLastAlien(game, row, true); game.step(C.step);
    expect(game.score).toBe(points);
  });
  it('grants the 5,000 point bonus ship once', () => {
    const game = new GameModel(); aimAtLastAlien(game); game.score = 4980; game.step(C.step);
    expect(game.score).toBe(5010); expect(game.lives).toBe(4);
    advance(game, C.celebrationSeconds + C.intermissionSeconds);
    aimAtLastAlien(game); game.step(C.step);
    expect(game.lives).toBe(4);
  });
  it('warns on low fuel, loses one ship at empty, and refills on respawn', () => {
    const game = new GameModel(); game.phase = 'playing'; game.fuel = 18.001; game.takeEvents();
    game.step(C.step); expect(game.takeEvents().map(e => e.kind)).toContain('warning');
    game.fuel = 0.001; game.step(C.step);
    expect(game.phase).toBe('dying'); expect(game.lives).toBe(2);
    advance(game, C.respawnSeconds);
    expect(game.phase).toBe('playing'); expect(game.fuel).toBe(90);
    expect(game.player.invulnerability).toBe(2);
  });
  it('clears incoming fire after a hit and ends the run after the last ship', () => {
    const game = new GameModel(); game.phase = 'playing'; game.lives = 1;
    game.enemyMissiles = [{ id: 2000, x: 320, y: C.playerY, vx: 0, vy: 100 }];
    game.step(C.step);
    expect(game.lives).toBe(0); expect(game.enemyMissiles).toHaveLength(0);
    advance(game, C.respawnSeconds); expect(game.phase).toBe('gameover');
    const restarted = new GameModel();
    expect(restarted.score).toBe(0); expect(restarted.lives).toBe(3);
    expect(restarted.wave).toBe(1); expect(restarted.phase).toBe('assembling');
  });
});
