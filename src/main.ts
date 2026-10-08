import './styles.css';
import { CONFIG } from './game/config';
import { FixedStepClock, GameModel } from './game/model';
import { demoControls } from './game/demo';
import { Keyboard } from './input';
import { ArcadeAudio } from './audio';
import { GameRenderer } from './render/renderer';
import { alienSvg } from './render/sprites';
import { loadPreferences, savePreferences } from './storage';

const element = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const preferences = loadPreferences();
const audio = new ArcadeAudio();
audio.enabled = preferences.sound;
const renderer = new GameRenderer();
renderer.effects = preferences.effects;
const clock = new FixedStepClock();
let game = new GameModel();
let screen: 'start' | 'play' | 'over' = 'start';
let ready = false;
let runBest = preferences.best;
let previous = 0;
const scoreText = (score: number) => String(score).padStart(6, '0');

const ui = {
  score: element('score'), best: element('best'), wave: element('wave'), fuel: element('fuel-fill'), fuelValue: element('fuel-value'), lives: element('lives'),
  start: element('start-screen'), over: element('over-screen'), paused: element('pause-screen'), transition: element('transition'),
  startButton: element<HTMLButtonElement>('start-button'), restartButton: element<HTMLButtonElement>('restart-button'),
  status: element('game-status'), sound: element('sound-button'), soundIcon: element('sound-icon'), effects: element('effects-button'),
};
ui.startButton.disabled = true;
document.querySelectorAll<HTMLElement>('[data-alien]').forEach(target => { target.innerHTML = alienSvg(Number(target.dataset.alien)); });
element('keyboard-notice').hidden = !matchMedia('(pointer: coarse)').matches;

function updatePreferences() {
  ui.sound.setAttribute('aria-pressed', String(!preferences.sound));
  ui.sound.setAttribute('aria-label', preferences.sound ? 'Mute sound' : 'Enable sound');
  ui.sound.title = `${preferences.sound ? 'Mute' : 'Enable'} sound (M)`;
  ui.soundIcon.textContent = preferences.sound ? '♪' : '∅';
  ui.effects.setAttribute('aria-pressed', String(preferences.effects));
  savePreferences(preferences);
}
function toggleSound() {
  preferences.sound = !preferences.sound;
  audio.enabled = preferences.sound;
  if (preferences.sound) void audio.unlock(); else audio.hush();
  updatePreferences();
}
function blurButton() { if (document.activeElement instanceof HTMLButtonElement) document.activeElement.blur(); }
function start() {
  if (!ready) return;
  void audio.unlock(); audio.hush();
  screen = 'play'; game = new GameModel(Math.floor(Math.random() * 0xffffffff));
  runBest = preferences.best;
  clock.clear(); keyboard.clear(); renderer.clear();
  ui.start.hidden = true; ui.over.hidden = true; ui.paused.hidden = true;
  blurButton();
  for (const event of game.takeEvents()) { renderer.event(event); audio.play(event); }
  updateHud();
}
function pause(paused: boolean) {
  if (screen !== 'play') return;
  game.paused = paused;
  keyboard.clear(); clock.clear(); audio.hush();
  ui.paused.hidden = !paused;
  if (!paused) { void audio.unlock(); blurButton(); }
  updateHud();
}

const keyboard = new Keyboard(key => {
  if (key === 'KeyM') toggleSound();
  if (key === 'Enter') { if (screen !== 'play') start(); else if (game.paused) pause(false); }
  if (key === 'Escape' && screen === 'play') pause(!game.paused);
}, () => { if (screen === 'play' && !game.paused) pause(true); });

ui.startButton.addEventListener('click', start);
ui.restartButton.addEventListener('click', start);
element('resume-button').addEventListener('click', () => pause(false));
ui.sound.addEventListener('click', () => { toggleSound(); blurButton(); });
ui.effects.addEventListener('click', () => { preferences.effects = !preferences.effects; renderer.setEffects(preferences.effects); updatePreferences(); blurButton(); });
element('fullscreen-button').addEventListener('click', async () => {
  const target = element('cabinet');
  try { if (document.fullscreenElement) await document.exitFullscreen(); else await target.requestFullscreen(); }
  catch { element('fullscreen-button').title = 'Fullscreen is unavailable in this browser'; }
  blurButton();
});
document.addEventListener('fullscreenchange', () => element('fullscreen-button').setAttribute('aria-label', document.fullscreenElement ? 'Exit fullscreen' : 'Enter fullscreen'));

function updateHud() {
  const demo = screen === 'start';
  ui.score.textContent = scoreText(demo ? 0 : game.score);
  ui.best.textContent = scoreText(Math.max(preferences.best, demo ? 0 : game.score));
  ui.wave.textContent = String(demo ? 1 : game.wave).padStart(2, '0');
  const fuel = demo ? 100 : Math.ceil(game.fuel / CONFIG.fuelSeconds * 100);
  ui.fuel.style.width = `${fuel}%`;
  ui.fuelValue.textContent = `${fuel}%`;
  element('cabinet').classList.toggle('low-fuel', !demo && game.fuel <= CONFIG.fuelSeconds * CONFIG.warningThreshold);
  const lives = demo ? CONFIG.startingLives : game.lives;
  ui.lives.textContent = '▲ '.repeat(lives).trim() || '—';
  ui.lives.setAttribute('aria-label', `${lives} ships remaining`);
  ui.transition.hidden = screen !== 'play' || game.phase !== 'intro' || game.paused;
  ui.transition.textContent = `WAVE ${String(game.wave).padStart(2, '0')} · GET READY`;
  const status = screen === 'start' ? 'READY WHEN YOU ARE' : screen === 'over' ? 'ONE MORE TRY?' : game.paused ? 'FLIGHT PAUSED' : game.phase === 'dying' ? (game.lives ? 'SHIP LOST · REDEPLOYING' : 'SIGNAL LOST') : 'MISSION IN PROGRESS';
  ui.status.innerHTML = `<span class="live-dot"></span>${status}`;
}

function finish() {
  screen = 'over'; audio.hush(); keyboard.clear();
  preferences.best = Math.max(preferences.best, game.score);
  savePreferences(preferences);
  element('final-score').textContent = scoreText(game.score);
  element('final-best').textContent = scoreText(preferences.best);
  element('final-wave').textContent = String(game.wave).padStart(2, '0');
  element('final-kills').textContent = String(game.kills);
  element('new-best').hidden = game.score <= runBest;
  ui.over.hidden = false; ui.paused.hidden = true; ui.transition.hidden = true;
  updateHud();
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
    renderer.draw(game, game.paused ? 0 : delta);
    updateHud();
  }
  requestAnimationFrame(frame);
}

async function init() {
  try {
    await renderer.init(element('game-canvas'));
    ready = true;
    ui.startButton.disabled = false;
    game.takeEvents();
    updatePreferences(); updateHud();
    requestAnimationFrame(frame);
  } catch (error) {
    console.error('Space Attack could not initialize:', error);
    ui.start.hidden = true;
    element('error-screen').hidden = false;
  }
}
void init();
