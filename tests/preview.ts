// Local verification fixture; Vite's production entry excludes this page.
import '../src/styles.css';
import { GameModel, FixedStepClock, NO_INPUT } from '../src/game/model';
import { GameRenderer } from '../src/render/renderer';
import { ArcadeAudio } from '../src/audio';

const game = new GameModel(123);
const renderer = new GameRenderer();
const audio = new ArcadeAudio();
const clock = new FixedStepClock();
const mount = document.getElementById('game-canvas')!;
const button = document.getElementById('finish-wave') as HTMLButtonElement;
let started = false;
let prior = 0;
let fired = false;
const phases = new Set<string>();
game.phase = 'playing'; game.score = 1310; game.fuel = 25;
game.aliens = [{ ...game.aliens[40], homeX: 320, homeY: 320, x: 320, y: 320 }];
game.takeEvents();
await document.fonts.load('10px "Press Start 2P"');
await renderer.init(mount);
button.addEventListener('click', () => { started = true; fired = true; button.hidden = true; void audio.unlock(); });
function frame(time: number) {
  const dt = prior ? Math.min(0.1, (time - prior) / 1000) : 0; prior = time;
  if (started) clock.advance(dt, step => {
    game.step(step, fired ? { ...NO_INPUT, fire: true } : NO_INPUT); fired = false;
  });
  for (const event of game.takeEvents()) { renderer.event(event); audio.play(event); }
  phases.add(game.phase);
  mount.dataset.phase = game.phase;
  mount.dataset.countdown = String(game.countdown);
  mount.dataset.phases = [...phases].join(',');
  mount.setAttribute('aria-label', 'Wave ' + game.wave + '. Phase ' + game.phase + '. Countdown ' + game.countdown + '. Fuel ' + game.fuel.toFixed(2));
  renderer.draw(game, dt, { screen: started ? 'play' : 'start', best: 1310, newBest: false, sound: true, effects: true, fullscreen: false, keyboardRequired: false });
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
