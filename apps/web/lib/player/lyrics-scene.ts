import {
  Application,
  Container,
  Filter,
  Point,
  RenderTexture,
  Sprite,
  type SpriteSource,
} from "pixi.js";
import { AdjustmentFilter } from "@pixi/filter-adjustment";
import { KawaseBlurFilter } from "@pixi/filter-kawase-blur";
import { TwistFilter } from "@pixi/filter-twist";

export type ArtworkTone = "dark" | "balanced" | "bright";

const TONE_FILTER_SETTINGS: Record<
  ArtworkTone,
  ConstructorParameters<typeof AdjustmentFilter>[0]
> = {
  dark: {
    gamma: 1,
    saturation: 1.75,
    contrast: 1.4,
    brightness: 0.32,
    red: 1.34,
    green: 1.06,
    blue: 1.06,
  },
  balanced: {
    gamma: 1,
    saturation: 2.36,
    contrast: 1.69,
    brightness: 0.36,
    red: 0.92,
    green: 1.2,
    blue: 1,
  },
  bright: {
    gamma: 1.02,
    saturation: 1.18,
    contrast: 1.18,
    brightness: 0.37,
    red: 1.06,
    green: 1.06,
    blue: 1,
  },
};

export class LyricsScene {
  private static readonly ARTWORK_TRANSITION_MS = 1200;
  private static readonly TARGET_FPS = 30;
  private static readonly MAX_FRAME_STEP_MS = 1000 / LyricsScene.TARGET_FPS;

  private app: Application;
  private container: Container;
  private currentLayer: Container;
  private currentSprites: Sprite[] = [];
  private currentTone: ArtworkTone;
  private currentTexture: RenderTexture;
  private outgoingTexture: RenderTexture | null = null;
  private output: Sprite;
  private colorMixFilter: Filter | null = null;
  private artworkTransitionElapsed = 0;
  private elapsedSeconds = 0;

  constructor(
    canvas: HTMLCanvasElement,
    imageSource: SpriteSource,
    tone: ArtworkTone = "balanced",
  ) {
    const width = Math.max(1, Math.round(canvas.clientWidth));
    const height = Math.max(1, Math.round(canvas.clientHeight));

    this.app = new Application({
      width,
      height,
      view: canvas,
      backgroundAlpha: 0,
      powerPreference: "high-performance",
    });
    // The liquid scene is intentionally rendered at a stable cinematic rate.
    // It avoids wasting GPU work at 60/120 Hz while keeping every motion step
    // consistent with the simulation's 30 FPS time base.
    this.app.ticker.maxFPS = LyricsScene.TARGET_FPS;

    this.container = new Container();
    this.app.stage.addChild(this.container);

    this.currentSprites = this.createSprites(imageSource);
    this.currentTone = tone;
    this.currentLayer = this.createArtworkLayer(this.currentSprites, tone);
    this.currentTexture = this.createRenderTexture(width, height);
    this.output = new Sprite(this.currentTexture);
    this.colorMixFilter = this.createOutputFilter(this.currentTexture);
    this.output.filters = [this.colorMixFilter];
    this.container.addChild(this.output);
    this.renderCurrentLayer();

    this.app.ticker.add(() => this.animate());
  }

  transitionToArtwork(artwork: SpriteSource, tone: ArtworkTone = "balanced") {
    this.outgoingTexture?.destroy(true);
    this.colorMixFilter?.destroy();
    this.outgoingTexture = this.currentTexture;

    const nextSprites = this.createSprites(artwork);
    nextSprites.forEach((sprite, index) => {
      sprite.rotation = this.currentSprites[index]?.rotation ?? 0;
    });
    const nextLayer = this.createArtworkLayer(nextSprites, tone);

    this.currentLayer.destroy({
      children: true,
      texture: false,
      baseTexture: false,
    });

    this.currentSprites = nextSprites;
    this.currentTone = tone;
    this.currentLayer = nextLayer;
    this.currentTexture = this.createRenderTexture(
      this.app.screen.width,
      this.app.screen.height,
    );
    // Populate the incoming texture before the first blend frame. Otherwise
    // the shader briefly mixes the outgoing artwork with a transparent target.
    this.updateMovingSprites();
    this.renderCurrentLayer();
    this.output.texture = this.outgoingTexture;
    this.colorMixFilter = this.createOutputFilter(this.currentTexture, 0);
    this.output.filters = [this.colorMixFilter];
    this.artworkTransitionElapsed = 0;
  }

  resize(width: number, height: number) {
    const nextWidth = Math.round(width);
    const nextHeight = Math.round(height);
    if (nextWidth <= 0 || nextHeight <= 0) return;

    const { width: currentWidth, height: currentHeight } = this.app.screen;
    if (currentWidth === nextWidth && currentHeight === nextHeight) return;

    this.app.renderer.resize(nextWidth, nextHeight);
    this.layoutSprites(this.currentSprites);
    this.setLayerFilters(this.currentLayer, this.currentTone);
    this.updateMovingSprites();
    this.outgoingTexture?.destroy(true);
    this.outgoingTexture = null;
    this.currentTexture.destroy(true);
    this.currentTexture = this.createRenderTexture(nextWidth, nextHeight);
    this.output.texture = this.currentTexture;
    this.colorMixFilter?.destroy();
    this.colorMixFilter = this.createOutputFilter(this.currentTexture);
    this.output.filters = [this.colorMixFilter];
    this.artworkTransitionElapsed = 0;
    this.renderCurrentLayer();
    // A renderer resize clears WebGL's backing buffer. Rendering in the same
    // frame prevents the transparent canvas from exposing the CSS fallback.
    this.app.renderer.render(this.app.stage);
  }

  private createSprites(artwork: SpriteSource) {
    const opacities = [1, 0.88, 0.82, 0.9];
    return opacities.map((alpha) => {
      const sprite = Sprite.from(artwork);
      sprite.alpha = alpha;
      return sprite;
    });
  }

  private createRenderTexture(width: number, height: number) {
    return RenderTexture.create({ width, height, resolution: 1 });
  }

  private createOutputFilter(nextTexture: RenderTexture, progress = 1) {
    return new Filter(undefined, COLOR_MIX_FRAGMENT, {
      uNextSampler: nextTexture,
      uProgress: progress,
      uTime: this.elapsedSeconds,
    });
  }

  private renderCurrentLayer() {
    this.app.renderer.render(this.currentLayer, {
      renderTexture: this.currentTexture,
      clear: true,
    });
  }

  destroy() {
    this.outgoingTexture?.destroy(true);
    this.currentTexture.destroy(true);
    this.colorMixFilter?.destroy();
    this.currentLayer.destroy({
      children: true,
      texture: false,
      baseTexture: false,
    });
    this.app.destroy(false, {
      children: true,
      texture: false,
      baseTexture: false,
    });
  }

  private createArtworkLayer(sprites: Sprite[], tone: ArtworkTone) {
    const layer = new Container();
    for (const sprite of sprites) sprite.anchor.set(0.5, 0.5);
    layer.addChild(...sprites);
    this.setLayerFilters(layer, tone);
    this.layoutSprites(sprites);
    return layer;
  }

  private setLayerFilters(layer: Container, tone: ArtworkTone) {
    const { width, height } = this.app.screen;
    const blurScale = Math.min(1, Math.max(0.5, Math.min(width, height) / 900));
    layer.filters?.forEach((filter) => filter.destroy());
    layer.filters = [
      new TwistFilter({
        angle: -2,
        radius: 900,
        offset: new Point(width / 2, height / 2),
      }),

      new KawaseBlurFilter(5 * blurScale, 1),
      new KawaseBlurFilter(10 * blurScale, 1),
      new KawaseBlurFilter(20 * blurScale, 2),
      new KawaseBlurFilter(40 * blurScale, 2),
      new KawaseBlurFilter(80 * blurScale, 2),

      new AdjustmentFilter({
        ...TONE_FILTER_SETTINGS[tone],
        alpha: 1,
      }),
    ];
  }

  private layoutSprites(sprites: Sprite[]) {
    const [large, medium, movingLarge, movingSmall] = sprites;
    if (!large || !medium || !movingLarge || !movingSmall) return;

    const { width, height } = this.app.screen;
    const viewportSize = Math.max(width, height);

    large.position.set(width / 2, height / 2);
    large.width = viewportSize * 1.45;
    large.height = large.width;

    medium.position.set(width * 0.35, height * 0.38);
    medium.width = viewportSize * 0.92;
    medium.height = medium.width;

    movingLarge.position.set(width / 2, height / 2);
    movingLarge.width = viewportSize * 0.62;
    movingLarge.height = movingLarge.width;

    movingSmall.position.set(width / 2, height / 2);
    movingSmall.width = viewportSize * 0.34;
    movingSmall.height = movingSmall.width;
  }

  private animate() {
    const [large, medium, movingLarge, movingSmall] = this.currentSprites;
    if (!large || !medium || !movingLarge || !movingSmall) return;

    // A delayed frame must not advance the liquid scene by a large distance.
    // Capping its time step favors continuous motion over catching up abruptly.
    const frameDeltaMs = Math.min(
      this.app.ticker.deltaMS,
      LyricsScene.MAX_FRAME_STEP_MS,
    );
    const frameScale = frameDeltaMs / 33.333333;
    this.elapsedSeconds += frameDeltaMs / 1000;

    large.rotation += 0.0026 * frameScale;
    medium.rotation -= 0.006 * frameScale;

    movingLarge.rotation -= 0.0043 * frameScale;
    movingSmall.rotation += 0.0048 * frameScale;

    this.updateMovingSprites();
    this.renderCurrentLayer();
    this.updateArtworkTransition(frameDeltaMs);
    if (this.colorMixFilter) {
      this.colorMixFilter.uniforms.uTime = this.elapsedSeconds;
    }
  }

  private updateMovingSprites() {
    const [, , movingLarge, movingSmall] = this.currentSprites;
    if (!movingLarge || !movingSmall) return;

    const { width, height } = this.app.screen;
    const motionRadius = Math.min(width, height) / 5.5;
    const motionOffset = Math.min(width, height) * 0.07;

    movingLarge.x =
      width / 2 + motionRadius * Math.cos(movingLarge.rotation * 0.75);
    movingLarge.y =
      height / 2 + motionRadius * Math.sin(movingLarge.rotation * 0.75);

    movingSmall.x =
      width / 2 +
      motionOffset +
      motionRadius * Math.cos(movingSmall.rotation * 0.75);
    movingSmall.y =
      height / 2 +
      motionOffset +
      motionRadius * Math.sin(movingSmall.rotation * 0.75);
  }

  private updateArtworkTransition(frameDeltaMs: number) {
    if (!this.outgoingTexture || !this.colorMixFilter) return;

    this.artworkTransitionElapsed += frameDeltaMs;
    const progress = Math.min(
      1,
      this.artworkTransitionElapsed / LyricsScene.ARTWORK_TRANSITION_MS,
    );
    const easedProgress = progress * progress * (3 - 2 * progress);
    this.colorMixFilter.uniforms.uProgress = easedProgress;

    if (progress === 1) {
      this.outgoingTexture.destroy(true);
      this.outgoingTexture = null;
      this.output.texture = this.currentTexture;
      this.colorMixFilter.destroy();
      this.colorMixFilter = this.createOutputFilter(this.currentTexture);
      this.output.filters = [this.colorMixFilter];
    }
  }
}

const COLOR_MIX_FRAGMENT = `
  varying vec2 vTextureCoord;
  uniform sampler2D uSampler;
  uniform sampler2D uNextSampler;
  uniform float uProgress;
  uniform float uTime;

  vec3 srgbToLinear(vec3 color) {
    return pow(color, vec3(2.2));
  }

  vec3 linearToSrgb(vec3 color) {
    return pow(max(color, vec3(0.0)), vec3(1.0 / 2.2));
  }

  vec2 fluidWarp(vec2 uv) {
    float drift = uTime * 0.06;
    vec2 centerA = vec2(0.32 + sin(drift) * 0.07, 0.38);
    vec2 centerB = vec2(0.7, 0.66 + cos(drift * 0.8) * 0.06);
    vec2 offsetA = uv - centerA;
    vec2 offsetB = uv - centerB;
    float falloffA = exp(-dot(offsetA, offsetA) * 14.0);
    float falloffB = exp(-dot(offsetB, offsetB) * 16.0);

    // Smooth Gaussian vortices bend colour into broad pools. Unlike a sine
    // field, this has no repeating bands that can read as horizontal/vertical
    // stripes after the artwork has been blurred.
    vec2 flowA = vec2(-offsetA.y, offsetA.x) * falloffA * 0.075;
    vec2 flowB = vec2(offsetB.y, -offsetB.x) * falloffB * 0.06;
    float edge = smoothstep(0.0, 0.14, uv.x) * smoothstep(0.0, 0.14, uv.y)
      * smoothstep(0.0, 0.14, 1.0 - uv.x) * smoothstep(0.0, 0.14, 1.0 - uv.y);
    return uv + (flowA + flowB) * edge;
  }

  void main(void) {
    // Clamp samples just inside the texture. Filtered render textures can have
    // transparent edge pixels, which show up as flickering seams while moving.
    vec2 uv = clamp(fluidWarp(vTextureCoord), vec2(0.0015), vec2(0.9985));
    vec4 fromColor = texture2D(uSampler, uv);
    vec4 toColor = texture2D(uNextSampler, uv);
    vec3 mixedColor = mix(
      srgbToLinear(fromColor.rgb),
      srgbToLinear(toColor.rgb),
      uProgress
    );

    gl_FragColor = vec4(linearToSrgb(mixedColor), 1.0);
  }
`;
