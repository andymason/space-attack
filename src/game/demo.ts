import type { Controls, GameModel } from './model';

/** Same simulation as live play; this pilot tracks targets and anticipates bullets. */
export function demoControls(game: GameModel): Controls {
  const threats = game.enemyMissiles.filter(m => m.y > 290 && m.y < game.player.y && Math.abs(m.x + m.vx * 0.4 - game.player.x) < 35);
  let target: number;
  if (threats.length) {
    target = game.player.x < 320 ? game.player.x + 65 : game.player.x - 65;
  } else {
    const candidates = [...game.aliens].sort((a, b) => Math.abs(a.x - game.player.x) - Math.abs(b.x - game.player.x));
    const diver = candidates.find(a => a.mode === 'diving' && a.y < 350);
    target = diver?.x ?? candidates[0]?.x ?? 320;
  }
  return { left: target < game.player.x - 6, right: target > game.player.x + 6, fire: true };
}
