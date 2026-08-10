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
  private static readonly TRANSITION_MIN_ALPHA = 0.45;

  app: Application;
  container: Container;
  blurFilters: KawaseBlurFilter[];
  twist: TwistFilter;
  saturate: AdjustmentFilter;
  pendingArtwork: SpriteSource | null = null;
  artworkTransitionElapsed = 0;
  artworkSwapDone = false;
  transitionStartAlpha = 1;
  paused = false;

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

    this.addSpritesToContainer(
      Array.from({ length: 4 }, () => Sprite.from(imageSource)),
    );

    this.app.ticker.add(() => this.animate());
  }

  transitionToArtwork(artwork: SpriteSource) {
    this.pendingArtwork = artwork;
    this.artworkTransitionElapsed = 0;
    this.artworkSwapDone = false;
    this.transitionStartAlpha = this.container.alpha;
  }

  private updateArtwork(artwork: SpriteSource) {
    const previousSprites = this.container.children as Sprite[];
    const sprites = Array.from({ length: 4 }, (_, index) => {
      const sprite = Sprite.from(artwork);
      const previous = previousSprites[index];

      if (previous) sprite.rotation = previous.rotation;
      return sprite;
    });

    this.container.removeChildren();
    this.addSpritesToContainer(sprites);
  }

  resize(width: number, height: number) {
    if (width <= 0 || height <= 0) return;

    this.app.renderer.resize(width, height);
    this.twist.offset.set(width / 2, height / 2);
    this.layoutSprites();
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
    this.layoutSprites();
  }

  private layoutSprites() {
    const [large, medium, movingLarge, movingSmall] = this.container
      .children as Sprite[];
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
    if (this.paused) return;

    this.updateArtworkTransition();

    const [large, medium, movingLarge, movingSmall] = this.container
      .children as Sprite[];
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
  }

  private updateArtworkTransition() {
    if (!this.pendingArtwork) return;

    this.artworkTransitionElapsed += this.app.ticker.deltaMS;
    const halfDuration = LyricsScene.ARTWORK_TRANSITION_MS / 2;
    const minAlpha = LyricsScene.TRANSITION_MIN_ALPHA;

    if (this.artworkTransitionElapsed < halfDuration) {
      const progress = this.artworkTransitionElapsed / halfDuration;
      this.container.alpha =
        this.transitionStartAlpha + (minAlpha - this.transitionStartAlpha) * progress;
      return;
    }

    if (!this.artworkSwapDone) {
      this.updateArtwork(this.pendingArtwork);
      this.artworkSwapDone = true;
    }

    const progress = Math.min(
      1,
      (this.artworkTransitionElapsed - halfDuration) / halfDuration,
    );
    this.container.alpha = minAlpha + (1 - minAlpha) * progress;

    if (progress === 1) {
      this.pendingArtwork = null;
      this.container.alpha = 1;
    }
  }
}
