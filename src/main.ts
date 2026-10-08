import './styles.css';
import { CONFIG } from './game/config';
import { FixedStepClock, GameModel } from './game/model';
import { demoControls } from './game/demo';
import { Keyboard } from './input';
import { ArcadeAudio } from './audio';
import { GameRenderer } from './render/renderer';
import { BUTTONS, type Screen } from './render/hud';
import { loadPreferences, savePreferences } from './storage';

const element = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const preferences = loadPreferences();
const audio = new ArcadeAudio();
audio.enabled = preferences.sound;
const renderer = new GameRenderer();
renderer.effects = preferences.effects;
const clock = new FixedStepClock();
let game = new GameModel();
let screen: Screen = 'start';
let ready = false;
let runBest = preferences.best;
let previous = 0;
let lastAccessibleUpdate = 0;
let lastAnnouncement = '';
const keyboardRequired = matchMedia('(pointer: coarse)').matches;
const ui = {
  start: element<HTMLButtonElement>('start-button'),
  restart: element<HTMLButtonElement>('restart-button'),
  resume: element<HTMLButtonElement>('resume-button'),
  sound: element<HTMLButtonElement>('sound-button'),
  effects: element<HTMLButtonElement>('effects-button'),
  fullscreen: element<HTMLButtonElement>('fullscreen-button'),
  canvas: element('game-canvas'),
  announcement: element('game-announcement'),
};
for (const [name, rect] of Object.entries(BUTTONS)) {
  const button = ui[name as keyof typeof BUTTONS];
  button.style.left = rect.x / CONFIG.width * 100 + '%';
  button.style.top = rect.y / CONFIG.height * 100 + '%';
  button.style.width = rect.width / CONFIG.width * 100 + '%';
  button.style.height = rect.height / CONFIG.height * 100 + '%';
  button.disabled = true;
}

function syncControls() {
  ui.start.hidden = screen !== 'start';
  ui.restart.hidden = screen !== 'over';
  ui.resume.hidden = screen !== 'play' || !game.paused;
  ui.sound.setAttribute('aria-pressed', String(!preferences.sound));
  ui.sound.setAttribute('aria-label', preferences.sound ? 'Mute sound' : 'Enable sound');
  ui.effects.setAttribute('aria-pressed', String(preferences.effects));
  ui.fullscreen.setAttribute('aria-label', document.fullscreenElement ? 'Exit fullscreen' : 'Enter fullscreen');
}

function toggleSound() {
  preferences.sound = !preferences.sound;
  audio.enabled = preferences.sound;
  if (preferences.sound) void audio.unlock(); else audio.hush();
  savePreferences(preferences);
  syncControls();
}

function focusGame() { ui.canvas.focus({ preventScroll: true }); }

function start() {
  if (!ready) return;
  audio.hush();
  screen = 'play';
  game = new GameModel(Math.floor(Math.random() * 0xffffffff));
  const startingGame = game;
  runBest = preferences.best;
  clock.clear(); keyboard.clear(); renderer.clear();
  game.takeEvents();
  void audio.unlock().then(() => {
    if (game === startingGame && screen === 'play' && !game.paused) audio.play({ kind: 'wave', x: 320, y: 240 });
  });
  focusGame(); syncControls(); accessibleState();
}

function pause(paused: boolean) {
  if (screen !== 'play') return;
  game.paused = paused;
  keyboard.clear(); clock.clear(); audio.hush();
  if (!paused) { void audio.unlock(); focusGame(); }
  syncControls(); accessibleState();
}

const keyboard = new Keyboard(key => {
  if (key === 'KeyM') toggleSound();
  if (key === 'Enter') { if (screen !== 'play') start(); else if (game.paused) pause(false); }
  if (key === 'Escape' && screen === 'play') pause(!game.paused);
}, () => { if (screen === 'play' && !game.paused) pause(true); });

ui.start.addEventListener('click', start);
ui.restart.addEventListener('click', start);
ui.resume.addEventListener('click', () => pause(false));
ui.sound.addEventListener('click', () => { toggleSound(); focusGame(); });
ui.effects.addEventListener('click', () => {
  preferences.effects = !preferences.effects;
  renderer.setEffects(preferences.effects);
  savePreferences(preferences);
  focusGame(); syncControls();
});
ui.fullscreen.addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await element('cabinet').requestFullscreen();
  } catch { ui.fullscreen.title = 'Fullscreen is unavailable in this browser'; }
  focusGame(); syncControls();
});
document.addEventListener('fullscreenchange', syncControls);

function accessibleState() {
  const demo = screen === 'start';
  const phase = game.paused ? 'paused' : game.phase;
  ui.canvas.dataset.screen = screen;
  ui.canvas.dataset.phase = phase;
  ui.canvas.dataset.countdown = String(game.countdown);
  ui.canvas.setAttribute('aria-label', demo ? 'Space Attack attract mode' :
    'Space Attack. Score ' + game.score + '. Best ' + Math.max(preferences.best, game.score) +
    '. Wave ' + game.wave + '. Ships ' + game.lives + '. Fuel ' + Math.ceil(game.fuel / CONFIG.fuelSeconds * 100) +
    ' percent. ' + phase + '.');
  const message = demo ? 'Press Enter to start.' : screen === 'over' ? 'Game over. Score ' + game.score + '. Enter to restart.' :
    game.paused ? 'Paused. Escape to resume.' : game.phase === 'celebrating' ? 'Wave ' + game.wave + ' cleared!' :
    game.phase === 'countdown' ? 'Wave ' + game.wave + '. ' + game.countdown :
    game.phase === 'launching' ? 'Go!' : game.phase === 'assembling' ? 'Wave ' + game.wave + ' incoming.' :
    game.phase === 'dying' ? 'Ship lost.' : game.phase === 'playing' ? 'Playing.' : '';
  if (message !== lastAnnouncement) { ui.announcement.textContent = message; lastAnnouncement = message; }
}

function finish() {
  screen = 'over'; audio.hush(); keyboard.clear();
  preferences.best = Math.max(preferences.best, game.score);
  savePreferences(preferences);
  syncControls(); accessibleState();
}

function frame(time: number) {
  const delta = previous ? Math.min((time - previous) / 1000, 0.1) : 0;
  previous = time;
  if (!document.hidden) {
    clock.advance(delta, dt => {
      if (screen === 'start') {
        if (game.phase === 'gameover') { game = new GameModel(); renderer.clear(); }
        game.step(dt, demoControls(game));
      } else if (screen === 'play') game.step(dt, keyboard.controls);
    });
    for (const event of game.takeEvents()) {
      renderer.event(event);
      if (screen === 'play' && !game.paused) audio.play(event);
    }
    if (screen === 'play' && game.phase === 'gameover') finish();
    renderer.draw(game, game.paused ? 0 : delta, {
      screen, best: preferences.best, newBest: game.score > runBest,
      sound: preferences.sound, effects: preferences.effects,
      fullscreen: !!document.fullscreenElement, keyboardRequired,
    });
    if (time - lastAccessibleUpdate > 100) { accessibleState(); lastAccessibleUpdate = time; }
  }
  requestAnimationFrame(frame);
}

async function init() {
  try {
    await document.fonts.load('10px "Press Start 2P"');
    await renderer.init(ui.canvas);
    ready = true;
    for (const name of Object.keys(BUTTONS)) ui[name as keyof typeof BUTTONS].disabled = false;
    game.takeEvents();
    syncControls(); accessibleState();
    requestAnimationFrame(frame);
  } catch (error) {
    console.error('Space Attack could not initialize:', error);
    for (const name of Object.keys(BUTTONS)) ui[name as keyof typeof BUTTONS].hidden = true;
    element('error-screen').hidden = false;
  }
}
void init();
