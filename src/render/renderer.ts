import { Application, Container, Graphics, Rectangle, Sprite, Text } from 'pixi.js';
import { AdvancedBloomFilter } from 'pixi-filters/advanced-bloom';
import { CRTFilter } from 'pixi-filters/crt';
import { CONFIG as C } from '../game/config';
import type { GameEvent, GameModel } from '../game/model';
import { createTextures, ROW_COLORS } from './sprites';
import { GameHud, type HudView } from './hud';

type Particle = { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; color: number; size: number };
type Popup = { label: Text; life: number };

export class GameRenderer {
  readonly app = new Application();
  private world = new Container();
  private starGraphics = new Graphics();
  private missileGraphics = new Graphics();
  private particleGraphics = new Graphics();
  private flame = new Graphics();
  private entities = new Container();
  private alienSprites = new Map<number, Sprite>();
  private player!: Sprite;
  private hud!: GameHud;
  private previousPhase = '';
  private textures!: ReturnType<typeof createTextures>;
  private bloom = new AdvancedBloomFilter({ threshold: 0.4, bloomScale: 0.8, brightness: 1, blur: 4, quality: 3 });
  private crt = new CRTFilter({ curvature: 0, lineWidth: 1, lineContrast: 0.12, noise: 0.025, vignetting: 0.22, vignettingAlpha: 0.28, vignettingBlur: 0.45 });
  private particles: Particle[] = [];
  private popups: Popup[] = [];
  private stars = Array.from({ length: 90 }, (_, i) => ({ x: (i * 173.7 + 31) % C.width, y: (i * 87.3 + 17) % C.height, speed: 7 + (i % 4) * 5, alpha: 0.17 + (i % 5) * 0.09, size: i % 9 === 0 ? 2 : 1 }));
  private shake = 0;
  private visualTime = 0;
  private mount: HTMLElement | null = null;
  private pixelRatio = 0;
  effects = true;
  reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  async init(mount: HTMLElement) {
    await this.app.init({ width: C.width, height: C.height, background: '#03070c', preference: 'webgl', antialias: false, roundPixels: true, resolution: 1, autoStart: false });
    mount.append(this.app.canvas);
    this.app.stage.addChild(this.world);
    this.world.addChild(this.starGraphics, this.entities, this.missileGraphics, this.particleGraphics);
    this.textures = createTextures();
    this.player = new Sprite(this.textures.player);
    this.player.anchor.set(0.5); this.player.scale.set(2);
    this.entities.addChild(this.flame, this.player);
    this.hud = new GameHud(this.textures);
    this.app.stage.addChild(this.hud);
    // Filters must preserve the native-resolution scene instead of reducing it to 640×480.
    this.bloom.resolution = 'inherit';
    this.crt.resolution = 'inherit';
    this.world.filterArea = new Rectangle(0, 0, C.width, C.height);
    this.setEffects(this.effects);
    this.mount = mount;
    this.resizeToDisplay();
    new ResizeObserver(() => this.resizeToDisplay()).observe(mount);
    window.addEventListener('resize', () => this.resizeToDisplay());
    document.addEventListener('fullscreenchange', () => this.resizeToDisplay());
    matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', event => { this.reducedMotion = event.matches; });
  }

  private resizeToDisplay() {
    if (!this.mount) return;
    const width = this.mount.getBoundingClientRect().width;
    if (width <= 0) return;
    this.pixelRatio = window.devicePixelRatio || 1;
    // The simulation stays 640×480; only the backing buffer grows to match physical pixels.
    const resolution = width * this.pixelRatio / C.width;
    if (Math.abs(this.app.renderer.resolution - resolution) < 0.0001) return;
    this.app.renderer.resize(C.width, C.height, resolution);
    this.bloom.pixelSize = { x: resolution, y: resolution };
    this.hud.setResolution(resolution);
    for (const popup of this.popups) popup.label.resolution = Math.max(1, resolution);
  }

  setEffects(enabled: boolean) {
    this.effects = enabled;
    this.world.filters = enabled ? [this.bloom, this.crt] : [];
  }

  clear() {
    for (const sprite of this.alienSprites.values()) sprite.destroy();
    this.alienSprites.clear();
    for (const popup of this.popups) popup.label.destroy();
    this.popups = []; this.particles = []; this.shake = 0;
  }

  event(event: GameEvent) {
    if (event.kind === 'clear') {
      for (const [index, x] of [110, 320, 530].entries()) {
        const count = this.reducedMotion ? 6 : 30;
        for (let i = 0; i < count; i++) {
          const angle = i / count * Math.PI * 2;
          const life = 0.7 + Math.random() * 0.5;
          const speed = this.reducedMotion ? 25 : 40 + Math.random() * 75;
          this.particles.push({ x, y: 240 - index % 2 * 70, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life, maxLife: life, color: [0xf7eb7b, 0x7bfbe0, 0xff667c][index], size: 2 });
        }
      }
    }
    if (event.kind === 'hit' || event.kind === 'explosion') {
      const count = this.reducedMotion ? 6 : this.effects ? (event.kind === 'hit' ? 22 : 65) : 10;
      const color = event.kind === 'hit' ? ROW_COLORS[event.row ?? 0] : 0x7bfbe0;
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 25 + Math.random() * (event.kind === 'hit' ? 110 : 190);
        const life = 0.2 + Math.random() * 0.6;
        this.particles.push({ x: event.x, y: event.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life, maxLife: life, color: i % 4 === 0 ? 0xffffff : color, size: i % 3 === 0 ? 3 : 2 });
      }
      if (!this.reducedMotion && this.effects) this.shake = event.kind === 'explosion' ? 0.35 : 0.075;
      if (event.points) this.popup(`+${event.points}`, event.x, event.y - 12, color);
    }
    if (event.kind === 'bonus') this.popup('BONUS SHIP', event.x, event.y - 40, 0xf7eb7b);
  }

  private popup(text: string, x: number, y: number, color: number) {
    const label = new Text({ text, style: { fontFamily: 'Press Start 2P', fontSize: 8, fill: color }, resolution: Math.max(1, this.app.renderer.resolution) });
    label.anchor.set(0.5); label.position.set(x, y);
    this.world.addChild(label); this.popups.push({ label, life: 0.8 });
  }

  draw(game: GameModel, dt: number, view: HudView) {
    if (this.pixelRatio !== window.devicePixelRatio) this.resizeToDisplay();
    if (game.phase === 'intermission' && this.previousPhase !== 'intermission') this.clear();
    this.previousPhase = game.phase;
    this.visualTime += dt;
    this.crt.time = this.reducedMotion ? 0 : this.visualTime;
    this.crt.seed = this.reducedMotion ? 0 : Math.floor(this.visualTime * 6) / 6;
    this.starGraphics.clear();
    for (const star of this.stars) {
      if (!this.reducedMotion) star.y = (star.y + star.speed * dt) % C.height;
      const twinkle = this.reducedMotion ? 1 : 0.8 + Math.sin(this.visualTime * 1.5 + star.x) * 0.2;
      this.starGraphics.rect(Math.round(star.x), Math.round(star.y), star.size, star.size).fill({ color: star.size === 2 ? 0x7bfbe0 : 0xc5e5d9, alpha: star.alpha * twinkle });
    }
    const ids = new Set(game.aliens.map(a => a.id));
    for (const [id, sprite] of this.alienSprites) if (!ids.has(id)) { sprite.destroy(); this.alienSprites.delete(id); }
    const frame = Math.floor(game.elapsed * 3) % 2;
    for (const alien of game.aliens) {
      let sprite = this.alienSprites.get(alien.id);
      if (!sprite) {
        sprite = new Sprite(this.textures.aliens[alien.row][0]);
        sprite.anchor.set(0.5); sprite.scale.set(2);
        this.entities.addChild(sprite); this.alienSprites.set(alien.id, sprite);
      }
      sprite.texture = this.textures.aliens[alien.row][frame];
      sprite.position.set(Math.round(alien.x), Math.round(alien.y));
    }
    this.player.position.set(Math.round(game.player.x), game.player.y);
    this.player.visible = !['dying', 'gameover', 'intermission'].includes(game.phase) && (game.player.invulnerability <= 0 || Math.floor(game.elapsed * 10) % 2 === 0);
    this.flame.clear();
    if (this.player.visible) {
      this.flame.rect(game.player.x - 2, game.player.y + 10, 4, 3 + Math.floor(game.elapsed * 20) % 4).fill({ color: 0x7bfbe0, alpha: 0.6 });
    }
    this.missileGraphics.clear();
    if (game.missile) {
      const { x, y } = game.missile;
      if (this.effects) {
        for (let i = 1; i < 6; i++) this.missileGraphics.rect(x - 1, y + i * 5, 2, 5).fill({ color: 0x7bfbe0, alpha: 0.45 * (1 - i / 6) });
      }
      this.missileGraphics.rect(x - 1, y - 6, 2, 12).fill(0xe8fff3);
    }
    for (const missile of game.enemyMissiles) {
      if (this.effects) this.missileGraphics.rect(missile.x - 1, missile.y - 12, 2, 9).fill({ color: 0xff667c, alpha: 0.18 });
      this.missileGraphics.rect(Math.round(missile.x) - 1, Math.round(missile.y) - 4, 3, 8).fill(0xff8c85);
    }
    this.particleGraphics.clear();
    for (const p of this.particles) {
      p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= Math.exp(-1.5 * dt); p.vy *= Math.exp(-1.5 * dt);
      if (p.life > 0) this.particleGraphics.rect(Math.round(p.x), Math.round(p.y), p.size, p.size).fill({ color: p.color, alpha: p.life / p.maxLife });
    }
    this.particles = this.particles.filter(p => p.life > 0);
    for (const popup of this.popups) { popup.life -= dt; popup.label.y -= dt * 22; popup.label.alpha = Math.min(1, popup.life * 3); }
    this.popups = this.popups.filter(popup => { if (popup.life <= 0) { popup.label.destroy(); return false; } return true; });
    this.shake = Math.max(0, this.shake - dt);
    const strength = this.shake * 14;
    this.world.position.set(!this.reducedMotion && this.effects ? Math.sin(this.visualTime * 80) * strength : 0, !this.reducedMotion && this.effects ? Math.cos(this.visualTime * 70) * strength : 0);
    this.hud.draw(game, view);
    this.app.render();
  }
}
