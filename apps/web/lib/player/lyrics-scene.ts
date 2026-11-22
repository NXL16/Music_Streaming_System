import {
  Application,
  BaseTexture,
  Container,
  Graphics,
  Sprite,
  Texture,
} from "pixi.js";
import { AdjustmentFilter } from "@pixi/filter-adjustment";
import { KawaseBlurFilter } from "@pixi/filter-kawase-blur";
import { TwistFilter } from "@pixi/filter-twist";

type MotionState = [number, number, number, number];

export class LyricsScene {
  private app: Application;
  private container: Container;
  private reduceMotionQuery: MediaQueryList;
  private currentSprites: Sprite[] = [];
  private currentMotion: MotionState = [0, 0, 0, 0];
  private outgoingSprites: Sprite[] = [];
  private outgoingMotion: MotionState | null = null;
  private fade = 0;
  private pendingTexture: { texture: Texture; onLoaded: () => void } | null =
    null;
  private destroyed = false;

  constructor(
    canvas: HTMLCanvasElement,
    artworkURL: string,
    private motionEnabled = true,
  ) {
    const { width, height } = canvas.getBoundingClientRect();
    this.app = new Application({
      width,
      height,
      view: canvas,
      powerPreference: "low-power",
      backgroundAlpha: 0,
      autoStart: false,
    });
    const background = new Graphics();
    background
      .beginFill(0xffffff)
      .drawRect(0, 0, this.app.renderer.width, this.app.renderer.height)
      .endFill();
    this.app.stage.addChild(background);
    this.reduceMotionQuery = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    );
    this.container = new Container();
    this.app.stage.addChild(this.container);
    this.initFilters();
    this.addOverlays();
    this.app.ticker.maxFPS = 30;
    this.app.ticker.add(this.animate);
    this.updateArtwork(artworkURL);
  }

  setMotionEnabled(enabled: boolean) {
    if (this.destroyed || this.motionEnabled === enabled) return;
    this.motionEnabled = enabled;
    this.syncTicker();
  }

  updateArtwork(artworkURL: string) {
    if (this.destroyed || !artworkURL) return;
    this.clearPendingTexture();
    const texture = new Texture(new BaseTexture(artworkURL));
    if (texture.baseTexture.valid) this.applyArtwork(texture);
    else {
      const onLoaded = () => {
        if (this.destroyed || this.pendingTexture?.texture !== texture) return;
        this.pendingTexture = null;
        this.applyArtwork(texture);
      };
      this.pendingTexture = { texture, onLoaded };
      texture.baseTexture.once("loaded", onLoaded);
    }
  }

  private applyArtwork(texture: Texture) {
    this.destroySprites(this.outgoingSprites);
    this.outgoingSprites = this.currentSprites;
    this.outgoingMotion = [...this.currentMotion] as MotionState;

    this.currentSprites = this.createSprites(texture);
    this.addSprites(this.currentSprites);
    this.currentMotion = [...this.outgoingMotion] as MotionState;
    this.fade = 1;
    if (!this.motionEnabled) {
      this.advanceMotion(this.currentSprites, this.currentMotion, 0);
    }
    this.syncTicker();
  }

  private clearPendingTexture() {
    const pending = this.pendingTexture;
    this.pendingTexture = null;
    if (!pending) return;
    pending.texture.baseTexture.off("loaded", pending.onLoaded);
    pending.texture.destroy(true);
  }

  private syncTicker() {
    if (this.destroyed) return;
    if (
      (this.motionEnabled && this.currentSprites.length > 0) ||
      this.outgoingMotion
    )
      this.app.start();
    else this.app.stop();
  }

  private animate = () => {
    const delta = this.app.ticker.deltaMS / 33.333333;
    if (this.motionEnabled)
      this.advanceMotion(this.currentSprites, this.currentMotion, delta);

    if (!this.outgoingMotion) return;
    if (this.motionEnabled)
      this.advanceMotion(this.outgoingSprites, this.outgoingMotion, delta);
    this.fade -= delta * 0.02;
    this.outgoingSprites.forEach((sprite) => {
      sprite.alpha = this.fade;
    });
    this.currentSprites.forEach((sprite) => {
      sprite.alpha = 1 - this.fade;
    });

    if (this.fade < 0) {
      this.destroySprites(this.outgoingSprites);
      this.outgoingSprites = [];
      this.outgoingMotion = null;
      this.currentSprites.forEach((sprite) => {
        sprite.alpha = 1;
      });
      if (!this.motionEnabled) this.app.stop();
    }
  };

  private advanceMotion(sprites: Sprite[], motion: MotionState, delta: number) {
    const [large, medium, movingLarge, movingSmall] = sprites;
    if (!large || !medium || !movingLarge || !movingSmall) return;
    if (this.reduceMotionQuery.matches) {
      motion[0] += delta * 0.001;
      motion[1] += delta * 0.001;
      motion[2] += delta * 0.001;
      motion[3] += delta * 0.001;
    } else {
      motion[0] += delta * 0.003;
      motion[1] -= delta * 0.008;
      motion[2] -= delta * 0.006;
      motion[3] += delta * 0.004;
    }
    large.rotation = motion[0];
    medium.rotation = motion[1];
    movingLarge.rotation = -motion[2];
    movingLarge.x =
      this.app.screen.width / 2 +
      (this.app.screen.width / 4) * Math.cos(motion[2] * 0.75);
    movingLarge.y =
      this.app.screen.height / 2 +
      (this.app.screen.width / 4) * Math.sin(motion[2] * 0.75);
    movingSmall.rotation = -motion[3];
    movingSmall.x =
      this.app.screen.width / 2 +
      (this.app.screen.width / 2) * 0.1 +
      (this.app.screen.width / 4) * Math.cos(motion[3] * 0.75);
    movingSmall.y =
      this.app.screen.height / 2 +
      (this.app.screen.width / 4) * Math.sin(motion[3] * 0.75);
  }

  private createSprites(texture: Texture) {
    return Array.from({ length: 4 }, () => new Sprite(texture));
  }

  private addSprites(sprites: Sprite[]) {
    const [large, medium, movingLarge, movingSmall] = sprites;
    [large, medium, movingLarge, movingSmall].forEach((sprite) =>
      sprite.anchor.set(0.5, 0.5),
    );
    large.position.set(this.app.screen.width / 2, this.app.screen.height / 2);
    medium.position.set(
      this.app.screen.width / 2.5,
      this.app.screen.height / 2.5,
    );
    movingLarge.position.set(
      this.app.screen.width / 2,
      this.app.screen.height / 2,
    );
    movingSmall.position.set(
      this.app.screen.width / 2,
      this.app.screen.height / 2,
    );
    large.width = this.app.screen.width * 1.25;
    large.height = large.width;
    medium.width = this.app.screen.width * 0.8;
    medium.height = medium.width;
    movingLarge.width = this.app.screen.width * 0.5;
    movingLarge.height = movingLarge.width;
    movingSmall.width = this.app.screen.width * 0.25;
    movingSmall.height = movingSmall.width;
    this.container.addChild(...sprites);
  }

  private destroySprites(sprites: Sprite[]) {
    if (!sprites.length) return;
    const textures = new Set(sprites.map((sprite) => sprite.texture));
    this.container.removeChild(...sprites);
    sprites.forEach((sprite) =>
      sprite.destroy({ children: true, texture: false, baseTexture: false }),
    );
    textures.forEach((texture) => texture.destroy(true));
  }

  private initFilters() {
    const blurs = [5, 10, 20, 40, 80].map((value, index) => {
      const filter = new KawaseBlurFilter();
      filter.blur = value;
      filter.quality = index < 2 ? 1 : 2;
      return filter;
    });
    const twist = new TwistFilter();
    twist.angle = -3.25;
    twist.radius = 900;
    twist.offset.set(
      this.app.renderer.screen.width / 2,
      this.app.renderer.screen.height / 2,
    );
    const adjustment = new AdjustmentFilter();
    adjustment.saturation = 2.75;
    adjustment.brightness = 0.7;
    adjustment.contrast = 1.9;
    this.container.filters = [twist, ...blurs, adjustment];
  }

  private addOverlays() {
    const dark = new Graphics();
    dark
      .beginFill(0x000000, 0.5)
      .drawRect(0, 0, this.app.screen.width, this.app.screen.height)
      .endFill();
    const light = new Graphics();
    light
      .beginFill(0xffffff, 0.05)
      .drawRect(0, 0, this.app.screen.width, this.app.screen.height)
      .endFill();
    this.app.stage.addChild(dark, light);
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.clearPendingTexture();
    this.destroySprites(this.currentSprites);
    this.destroySprites(this.outgoingSprites);
    this.currentSprites = [];
    this.outgoingSprites = [];
    this.app.destroy(true, {
      children: true,
    });
  }
}
