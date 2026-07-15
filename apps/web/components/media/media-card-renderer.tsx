import React from "react";
import CircleCard from "./circle-card";
import CollectionCard from "./collection-card";
import HeroCard from "./hero-card";
import SocialCard from "./social-card";
import StationCard from "./station-card";
import type { MediaCardProps } from "./media-card.types";

type MediaCardRendererProps = MediaCardProps & {
  priority?: boolean;
};

export default React.memo(function MediaCardRenderer(
  props: MediaCardRendererProps,
) {
  switch (props.cardType) {
    case "hero":
      return <HeroCard {...props} cardType="hero" />;
    case "station":
      return <StationCard {...props} cardType="station" />;
    case "circle":
      return <CircleCard {...props} cardType="circle" />;
    case "social":
      return <SocialCard {...props} cardType="social" />;
    case "collection":
      return <CollectionCard {...props} cardType="collection" />;
  }
});
