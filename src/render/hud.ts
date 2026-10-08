import { Container, Graphics, Sprite, Text } from 'pixi.js';
import { CONFIG as C } from '../game/config';
import type { GameModel } from '../game/model';
import type { createTextures } from './sprites';

export type Screen = 'start' | 'play' | 'over';
export type HudView = { screen: Screen; best: number; newBest: boolean; sound: boolean; effects: boolean; fullscreen: boolean; keyboardRequired: boolean };
export const BUTTONS = {
  start: { x: 196, y: 274, width: 248, height: 36 },
  restart: { x: 196, y: 328, width: 248, height: 36 },
  resume: { x: 196, y: 260, width: 248, height: 36 },
  sound: { x: 468, y: 450, width: 64, height: 24 },
  effects: { x: 536, y: 450, width: 36, height: 24 },
  fullscreen: { x: 580, y: 450, width: 44, height: 24 },
} as const;
const MINT = 0x7bfbe0;
const WHITE = 0xe5fff6;
const MUTED = 0x719a99;
const YELLOW = 0xf7eb7b;
const scoreText = (score: number) => String(score).padStart(6, '0');

/** All visible screens and HUD elements belong to the same 640×480 Pixi scene. */
export class GameHud extends Container {
  private overlay = new Container();
  private screenShade = new Graphics().rect(0, 54, 640, 392).fill({ color: 0x020508, alpha: 0.78 });
  private header = new Graphics();
  private fuel = new Graphics();
  private ships: Sprite[] = [];
  private score: Text;
  private best: Text;
  private wave: Text;
  private fuelValue: Text;
  private title: Text;
  private help: Text;
  private secondaryHelp: Text;
  private button = new Graphics();
  private buttonLabel: Text;
  private results: Text;
  private resultValues: Text;
  private newBest: Text;
  private transition: Text;
  private transitionValue: Text;
  private sound: Text;
  private effectsLabel: Text;
  private fullscreen: Text;

  constructor(textures: ReturnType<typeof createTextures>) {
    super();
    this.addChild(this.header, this.fuel, this.overlay);
    this.header.moveTo(18, 54).lineTo(622, 54).stroke({ color: MINT, alpha: 0.13, width: 1 });
    this.header.moveTo(18, 446).lineTo(622, 446).stroke({ color: MINT, alpha: 0.13, width: 1 });
    this.makeText('1UP', 20, 13, 8, MINT);
    this.score = this.makeText('000000', 20, 29, 13, WHITE);
    this.makeText('HI-SCORE', 320, 13, 8, MINT, 0.5);
    this.best = this.makeText('000000', 320, 29, 13, WHITE, 0.5);
    this.makeText('WAVE', 620, 13, 8, YELLOW, 1);
    this.wave = this.makeText('01', 620, 29, 13, WHITE, 1);
    this.makeText('FUEL', 20, 459, 7, MINT);
    this.fuelValue = this.makeText('100%', 196, 459, 7, MUTED);
    this.makeText('SHIPS', 278, 459, 7, MINT);
    for (let i = 0; i < 5; i++) {
      const ship = new Sprite(textures.player);
      ship.scale.set(1); ship.anchor.set(0.5); ship.position.set(333 + i * 20, 462);
      this.addChild(ship); this.ships.push(ship);
    }
    this.sound = this.makeText('SOUND', 500, 459, 7, MINT, 0.5);
    this.effectsLabel = this.makeText('FX', 554, 459, 7, MINT, 0.5);
    this.fullscreen = this.makeText('FULL', 602, 459, 7, MINT, 0.5);
    this.overlay.addChild(this.screenShade, this.button);
    this.title = this.makeText('', 320, 132, 42, MINT, 0.5, this.overlay);
    this.buttonLabel = this.makeText('', 320, 286, 10, 0x04241d, 0.5, this.overlay);
    this.help = this.makeText('', 320, 334, 8, WHITE, 0.5, this.overlay);
    this.secondaryHelp = this.makeText('', 320, 375, 7, MUTED, 0.5, this.overlay);
    this.results = this.makeText('', 172, 214, 9, MUTED, 0, this.overlay);
    this.resultValues = this.makeText('', 468, 214, 9, WHITE, 1, this.overlay);
    this.newBest = this.makeText('NEW HIGH SCORE', 320, 176, 9, YELLOW, 0.5, this.overlay);
    this.transition = this.makeText('', 320, 293, 12, MINT, 0.5);
    this.transitionValue = this.makeText('', 320, 322, 36, WHITE, 0.5);
  }

  private makeText(text: string, x: number, y: number, size: number, color: number, anchor = 0, parent: Container = this) {
    const label = new Text({ text, style: { fontFamily: 'Press Start 2P', fontSize: size, fill: color, lineHeight: size * 1.4 }, resolution: 2 });
    label.anchor.set(anchor, 0); label.position.set(x, y);
    parent.addChild(label);
    return label;
  }

  private primary(kind: 'start' | 'restart' | 'resume', label: string) {
    const rect = BUTTONS[kind];
    this.button.clear().rect(rect.x, rect.y, rect.width, rect.height).fill(MINT);
    this.buttonLabel.text = label;
    this.buttonLabel.y = rect.y + 13;
  }

  draw(game: GameModel, view: HudView) {
    const demo = view.screen === 'start';
    this.score.text = scoreText(demo ? 0 : game.score);
    this.best.text = scoreText(Math.max(view.best, demo ? 0 : game.score));
    this.wave.text = String(demo ? 1 : game.wave).padStart(2, '0');
    const fuel = demo ? 1 : game.fuel / C.fuelSeconds;
    const lowFuel = fuel <= C.warningThreshold;
    const fuelColor = lowFuel ? 0xff8189 : MINT;
    const alpha = lowFuel && Math.sin(game.elapsed * 9) < 0 ? 0.4 : 1;
    this.fuel.clear().rect(70, 459, 113, 6).fill({ color: MINT, alpha: 0.1 });
    this.fuel.rect(70, 459, Math.max(0, fuel * 113), 6).fill({ color: fuelColor, alpha });
    this.fuelValue.text = `${Math.ceil(fuel * 100)}%`;
    this.fuelValue.style.fill = lowFuel ? fuelColor : MUTED;
    this.ships.forEach((ship, i) => { ship.visible = i < (demo ? C.startingLives : game.lives); });
    this.sound.style.fill = view.sound ? MINT : 0x405a60;
    this.effectsLabel.style.fill = view.effects ? MINT : 0x405a60;
    this.fullscreen.style.fill = view.fullscreen ? WHITE : MUTED;

    this.overlay.visible = view.screen !== 'play' || game.paused;
    this.results.visible = this.resultValues.visible = view.screen === 'over';
    this.newBest.visible = view.screen === 'over' && view.newBest;
    this.title.style.fill = MINT;
    if (view.screen === 'start') {
      this.title.text = 'SPACE\nATTACK'; this.title.y = 120; this.title.style.fontSize = 42;
      this.primary('start', 'START GAME');
      this.help.text = 'ENTER TO START'; this.help.y = 328;
      this.secondaryHelp.text = view.keyboardRequired ? 'KEYBOARD REQUIRED\nPLAY ON A DESKTOP' : '< > MOVE     SPACE FIRE\nESC PAUSE     M SOUND\n\nBONUS SHIP AT 5,000';
      this.secondaryHelp.y = 361;
    } else if (game.paused && view.screen === 'play') {
      this.title.text = 'PAUSED'; this.title.y = 193; this.title.style.fontSize = 26;
      this.primary('resume', 'RESUME');
      this.help.text = 'ESC TO RESUME'; this.help.y = 315;
      this.secondaryHelp.text = '';
    } else if (view.screen === 'over') {
      this.title.text = 'GAME OVER'; this.title.y = 124; this.title.style.fontSize = 30; this.title.style.fill = 0xff8189;
      this.results.text = 'SCORE\nBEST\nWAVE\nALIENS'; this.results.style.lineHeight = 25;
      this.resultValues.text = `${scoreText(game.score)}\n${scoreText(view.best)}\n${String(game.wave).padStart(2, '0')}\n${game.kills}`;
      this.resultValues.style.lineHeight = 25;
      this.primary('restart', 'PLAY AGAIN');
      this.help.text = 'ENTER TO RESTART'; this.help.y = 386;
      this.secondaryHelp.text = '';
    }

    this.transition.visible = this.transitionValue.visible = view.screen === 'play' && !game.paused;
    this.transition.style.fill = MINT;
    this.transition.y = 293;
    this.transitionValue.style.fontSize = 36;
    this.transitionValue.y = 322;
    if (game.phase === 'celebrating') {
      this.transition.text = `WAVE ${String(game.wave).padStart(2, '0')}`;
      this.transition.style.fill = YELLOW;
      this.transitionValue.text = 'CLEARED!'; this.transitionValue.style.fontSize = 24;
    } else if (game.phase === 'assembling') {
      this.transition.text = `WAVE ${String(game.wave).padStart(2, '0')}`;
      this.transitionValue.text = '';
    } else if (game.phase === 'countdown') {
      this.transition.text = `WAVE ${String(game.wave).padStart(2, '0')}`;
      this.transitionValue.text = String(game.countdown);
    } else if (game.phase === 'launching') {
      this.transition.text = ''; this.transitionValue.text = 'GO!'; this.transitionValue.style.fill = MINT;
    } else {
      this.transition.text = ''; this.transitionValue.text = '';
    }
    if (game.phase !== 'launching') this.transitionValue.style.fill = WHITE;
  }
}
