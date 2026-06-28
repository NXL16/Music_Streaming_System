import CollectionCard from "./collection-card";
import HeroCard from "./hero-card";
import StationCard from "./station-card";
import type { MediaCardProps } from "./media-card.types";

export default function MediaCardRenderer(props: MediaCardProps) {
  switch (props.cardType) {
    case "hero":
      return <HeroCard {...props} cardType="hero" />;
    case "station":
      return <StationCard {...props} cardType="station" />;
    case "collection":
      return <CollectionCard {...props} cardType="collection" />;
  }
}
