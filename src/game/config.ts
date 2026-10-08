export const CONFIG = {
  width: 640,
  height: 480,
  step: 1 / 60,
  playerY: 430,
  playerSpeed: 290,
  playerMissileSpeed: 510,
  fuelSeconds: 90,
  warningThreshold: 0.2,
  startingLives: 3,
  bonusScore: 5000,
  invulnerabilitySeconds: 2,
  celebrationSeconds: 1.4,
  intermissionSeconds: 0.7,
  assemblySeconds: 1.8,
  countdownSeconds: 3,
  launchSeconds: 0.4,
  respawnSeconds: 1.2,
  rowCounts: [2, 5, 7, 9, 9, 9],
  formationPoints: [60, 50, 40, 30, 30, 30],
  divingPoints: [200, 100, 80, 60, 60, 60],
} as const;

export function difficulty(wave: number) {
  const level = Math.min(Math.max(wave - 1, 0), 15);
  return {
    diveInterval: Math.max(0.65, 2.2 - level * 0.12),
    diveDuration: Math.max(1.85, 3.4 - level * 0.1),
    maxDivers: Math.min(5, 1 + Math.floor(level / 2)),
    shotInterval: Math.max(0.7, 2.4 - level * 0.12),
    shotSpeed: Math.min(290, 145 + level * 11),
  };
}
