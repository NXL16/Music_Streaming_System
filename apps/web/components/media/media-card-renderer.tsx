"use client";

import React, { useSyncExternalStore } from "react";
import CircleCard from "./circle-card";
import CollectionCard from "./collection-card";
import HeroCard from "./hero-card";
import SocialCard from "./social-card";
import StationCard from "./station-card";
import type { MediaCardProps } from "./media-card.types";
import {
  getMediaEntity,
  subscribeMediaEntity,
} from "@/lib/media/media-entity-store";
import { projectMediaCardArtwork } from "@/lib/media/project-media-card-artwork";

type MediaCardRendererProps = MediaCardProps & {
  priority?: boolean;
};

export default React.memo(function MediaCardRenderer(
  props: MediaCardRendererProps,
) {
  const entity = useSyncExternalStore(
    (listener) => subscribeMediaEntity(props, listener),
    () => getMediaEntity(props),
    () => undefined,
  );
  const card = projectMediaCardArtwork(
    // A page's latest response is the source of truth. The scoped entity is
    // only a fallback for optional metadata absent from that response.
    entity ? { ...entity, ...props } : props,
  );

  switch (card.cardType) {
    case "hero":
      return <HeroCard {...card} cardType="hero" />;
    case "station":
      return <StationCard {...card} cardType="station" />;
    case "circle":
      return <CircleCard {...card} cardType="circle" />;
    case "social":
      return <SocialCard {...card} cardType="social" />;
    case "collection":
      return <CollectionCard {...card} cardType="collection" />;
  }
});
