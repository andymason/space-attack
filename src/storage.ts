export type Preferences = { best: number; sound: boolean; effects: boolean };
const key = 'space-attack:v1';
export function loadPreferences(): Preferences {
  const defaults: Preferences = { best: 0, sound: true, effects: true };
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? '{}');
    return { best: Number.isSafeInteger(value.best) && value.best >= 0 ? value.best : 0,
      sound: typeof value.sound === 'boolean' ? value.sound : true,
      effects: typeof value.effects === 'boolean' ? value.effects : true };
  } catch { return defaults; }
}
export function savePreferences(value: Preferences) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Private or full storage must never stop play. */ }
}
