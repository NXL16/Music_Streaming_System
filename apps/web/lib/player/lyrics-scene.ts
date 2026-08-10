import {
  Application,
  Container,
  Point,
  Sprite,
  type SpriteSource,
} from "pixi.js";
import { AdjustmentFilter } from "@pixi/filter-adjustment";
import { KawaseBlurFilter } from "@pixi/filter-kawase-blur";
import { TwistFilter } from "@pixi/filter-twist";

export class LyricsScene {
  private static readonly ARTWORK_TRANSITION_MS = 800;

  private app: Application;
  private container: Container;
  private blurFilters: KawaseBlurFilter[];
  private twist: TwistFilter;
  private saturate: AdjustmentFilter;
  private currentSprites: Sprite[] = [];
  private incomingSprites: Sprite[] | null = null;
  private artworkTransitionElapsed = 0;

  constructor(canvas: HTMLCanvasElement, imageSource: SpriteSource) {
    const width = Math.max(1, Math.round(canvas.clientWidth));
    const height = Math.max(1, Math.round(canvas.clientHeight));

    this.app = new Application({
      width,
      height,
      view: canvas,
      backgroundAlpha: 0,
      powerPreference: "low-power",
    });

    this.container = new Container();
    this.app.stage.addChild(this.container);

    this.blurFilters = [
      new KawaseBlurFilter(5, 1),
      new KawaseBlurFilter(10, 1),
      new KawaseBlurFilter(20, 2),
      new KawaseBlurFilter(40, 2),
      new KawaseBlurFilter(80, 2),
    ];
    this.twist = new TwistFilter({
      angle: -3.25,
      radius: 900,
      offset: new Point(width / 2, height / 2),
    });
    this.saturate = new AdjustmentFilter({
      gamma: 1, // đường cong sáng/tối
      saturation: 1.61, // độ rực màu
      contrast: 1.36, // tương phản sáng/tối
      brightness: 0.47, // độ sáng tổng
      red: 1.4, // cường độ kênh đỏ
      green: 1.06, // cường độ kênh xanh lá
      blue: 0.8, // cường độ kênh xanh dương
      alpha: 1, // độ trong suốt tổng
    });
    this.container.filters = [this.twist, ...this.blurFilters, this.saturate];

    this.currentSprites = this.createSprites(imageSource);
    this.addSpritesToContainer(this.currentSprites);

    this.app.ticker.add(() => this.animate());
  }

  transitionToArtwork(artwork: SpriteSource) {
    if (this.incomingSprites) {
      this.container.removeChild(...this.incomingSprites);
      this.incomingSprites.forEach((sprite) => sprite.destroy());
      this.currentSprites.forEach((sprite) => {
        sprite.alpha = 1;
      });
    }

    this.incomingSprites = this.createSprites(artwork);
    this.incomingSprites.forEach((sprite, index) => {
      sprite.alpha = 0;
      sprite.rotation = this.currentSprites[index]?.rotation ?? 0;
    });
    this.addSpritesToContainer(this.incomingSprites);
    this.artworkTransitionElapsed = 0;
  }

  private createSprites(artwork: SpriteSource) {
    return Array.from({ length: 4 }, () => Sprite.from(artwork));
  }

  resize(width: number, height: number) {
    const nextWidth = Math.round(width);
    const nextHeight = Math.round(height);
    if (nextWidth <= 0 || nextHeight <= 0) return;

    const { width: currentWidth, height: currentHeight } = this.app.screen;
    if (currentWidth === nextWidth && currentHeight === nextHeight) return;

    this.app.renderer.resize(nextWidth, nextHeight);
    this.twist.offset.set(nextWidth / 2, nextHeight / 2);
    this.layoutSprites(this.currentSprites);
    if (this.incomingSprites) this.layoutSprites(this.incomingSprites);
  }

  destroy() {
    this.app.destroy(false, {
      children: true,
      texture: false,
      baseTexture: false,
    });
  }

  private addSpritesToContainer(sprites: Sprite[]) {
    for (const sprite of sprites) sprite.anchor.set(0.5, 0.5);
    this.container.addChild(...sprites);
    this.layoutSprites(sprites);
  }

  private layoutSprites(sprites: Sprite[]) {
    const [large, medium, movingLarge, movingSmall] = sprites;
    if (!large || !medium || !movingLarge || !movingSmall) return;

    const { width, height } = this.app.screen;

    large.position.set(width / 2, height / 2);
    large.width = width * 1.25;
    large.height = large.width;

    medium.position.set(width / 2.5, height / 2.5);
    medium.width = width * 0.8;
    medium.height = medium.width;

    movingLarge.position.set(width / 2, height / 2);
    movingLarge.width = width * 0.5;
    movingLarge.height = movingLarge.width;

    movingSmall.position.set(width / 2, height / 2);
    movingSmall.width = width * 0.25;
    movingSmall.height = movingSmall.width;
  }

  private animate() {
    this.updateArtworkTransition();

    const [large, medium, movingLarge, movingSmall] = this.currentSprites;
    if (!large || !medium || !movingLarge || !movingSmall) return;

    const frameScale = this.app.ticker.deltaMS / 33.333333;
    const { width, height } = this.app.screen;

    large.rotation += 0.003 * frameScale;
    medium.rotation -= 0.008 * frameScale;

    movingLarge.rotation -= 0.006 * frameScale;
    movingLarge.x =
      width / 2 + (width / 4) * Math.cos(movingLarge.rotation * 0.75);
    movingLarge.y =
      height / 2 + (width / 4) * Math.sin(movingLarge.rotation * 0.75);

    movingSmall.rotation += 0.004 * frameScale;
    movingSmall.x =
      width / 2 +
      width * 0.1 +
      (width / 4) * Math.cos(movingSmall.rotation * 0.75);
    movingSmall.y =
      height / 2 +
      width * 0.1 +
      (width / 4) * Math.sin(movingSmall.rotation * 0.75);

    this.syncIncomingSprites();
  }

  private syncIncomingSprites() {
    if (!this.incomingSprites) return;

    this.incomingSprites.forEach((sprite, index) => {
      const currentSprite = this.currentSprites[index];
      if (!currentSprite) return;

      sprite.position.copyFrom(currentSprite.position);
      sprite.rotation = currentSprite.rotation;
      sprite.scale.copyFrom(currentSprite.scale);
    });
  }

  private updateArtworkTransition() {
    if (!this.incomingSprites) return;

    this.artworkTransitionElapsed += this.app.ticker.deltaMS;
    const progress = Math.min(
      1,
      this.artworkTransitionElapsed / LyricsScene.ARTWORK_TRANSITION_MS,
    );
    this.currentSprites.forEach((sprite) => {
      sprite.alpha = 1 - progress;
    });
    this.incomingSprites.forEach((sprite) => {
      sprite.alpha = progress;
    });

    if (progress === 1) {
      this.container.removeChild(...this.currentSprites);
      this.currentSprites.forEach((sprite) => sprite.destroy());
      this.currentSprites = this.incomingSprites;
      this.incomingSprites = null;
    }
  }
}
