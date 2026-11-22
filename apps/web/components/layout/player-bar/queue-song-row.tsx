"use client";
import { playerSongKey } from "@/lib/player/use-player-store";

import type { CSSProperties } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import ResponsiveArtwork from "@/components/media/common/responsive-artwork";
import AmpContextMenuButton from "@/components/custom-elements/AmpContextMenuButton";
import type { PlayerSong } from "@/lib/player/use-player-store";
import { formatDuration } from "@/lib/format/duration";

export function PlayerSongArtwork({ song }: { song: PlayerSong }) {
  const isVideo = song.playbackKind === "video";
  const videoPoster =
    song.video?.posterSrcSet ??
    song.video?.poster ??
    song.thumbnailArtworkSrcSet ??
    song.artworkSrcSet;
  return (
    <div
      className="bg-(--override-placeholder-bg-color,var(--placeholder-bg-color,var(--genericJoeColor))) rounded-[inherit] box-border contain-content h-(--artwork-override-height,auto) max-h-(--artwork-override-max-height,none) max-w-(--artwork-override-max-width,none) min-h-(--artwork-override-min-height,0px) min-w-(--artwork-override-min-width,0px) overflow-hidden relative w-(--artwork-override-width,100%) z-(--z-default) after:block after:absolute after:top-0 after:w-full after:h-0 after:min-h-full after:min-w-full after:max-h-full after:max-w-full after:rounded-(--afterShadowBorderRadius,inherit) after:shadow-(--artworkShadowInset) after:opacity-(--containerInnerStrokeAlpha,0.25) after:pointer-events-none after:z-[calc(var(--z-default)+1)]"
      style={
        {
          "--aspect-ratio": "1",
          "--placeholder-bg-color": "transparent",
        } as CSSProperties
      }
    >
      <ResponsiveArtwork
        alt=""
        className="block h-(--artwork-override-height,auto) max-h-(--artwork-override-max-height,none) max-w-(--artwork-override-max-width,none) min-h-(--artwork-override-min-height,0px) min-w-(--artwork-override-min-width,0px) [object-fit:var(--artwork-override-object-fit,fill)] object-(--artwork-override-object-position,center) w-(--artwork-override-width,100%) rounded-[inherit] transition-(--global-transition,opacity_.1s_ease-in)"
        height={40}
        pictureClassName="block size-full"
        role="presentation"
        sizes="40px"
        src="/assets/artwork/1x1.gif"
        srcSet={
          isVideo
            ? videoPoster
            : (song.thumbnailArtworkSrcSet ?? song.artworkSrcSet)
        }
        style={{ opacity: 1 }}
        width={40}
      />
      {isVideo && (
        <div
          data-video-playbar-media="true"
          className="absolute inset-0 z-[calc(var(--z-default)+1)]"
        />
      )}
    </div>
  );
}

function QueueDragHandleIcon() {
  return (
    <svg
      viewBox="0 0 26 26"
      xmlns="http://www.w3.org/2000/svg"
      clipRule="evenodd"
      fillRule="evenodd"
      strokeLinejoin="round"
      strokeMiterlimit="2"
    >
      <path
        d="m21 15.75c0-.414-.336-.75-.75-.75h-16.5c-.414 0-.75.336-.75.75s.336.75.75.75h16.5c.414 0 .75-.336.75-.75zm0-4c0-.414-.336-.75-.75-.75h-16.5c-.414 0-.75.336-.75.75s.336.75.75.75h16.5c.414 0 .75-.336.75-.75zm0-4c0-.414-.336-.75-.75-.75h-16.5c-.414 0-.75.336-.75.75s.336.75.75.75h16.5c.414 0 .75-.336.75-.75z"
        fillRule="nonzero"
      />
    </svg>
  );
}

type SortableQueueSongProps = {
  song: PlayerSong;
  userId?: string;
  isFavorite: boolean;
  draggable: boolean;
  dragHandle?: boolean;
  selected: boolean;
  onSelect: (songId: string) => void;
};

export default function SortableQueueSong({
  song,
  userId,
  isFavorite,
  draggable,
  dragHandle = false,
  selected,
  onSelect,
}: SortableQueueSongProps) {
  const {
    attributes,
    isDragging,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: playerSongKey(song), disabled: !draggable });

  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      onClick={() => onSelect(playerSongKey(song))}
      {...(draggable && !dragHandle ? attributes : {})}
      {...(draggable && !dragHandle ? listeners : {})}
      tabIndex={0}
      className={`${draggable && !dragHandle ? "cursor-grab active:cursor-grabbing" : ""} up-next-item ${selected ? "selected" : ""} ${isDragging ? "is-dragging" : ""}`}
    >
      <div className="rounded-[3px] col-[left-edge/artwork-edge] row-span-full relative">
        <PlayerSongArtwork song={song} />
      </div>

      <div className="up-next-item-title">
        <div className="title">{song.title}</div>
        <div className="subtitle">{song.artist}</div>
      </div>

      <div className="time-and-controls">
        {draggable && dragHandle && (
          <button
            type="button"
            aria-label={`Reorder ${song.title}`}
            className="queue-drag-handle"
            onClick={(event) => event.stopPropagation()}
            {...attributes}
            {...listeners}
          >
            <QueueDragHandleIcon />
          </button>
        )}

        {!dragHandle && (
          <>
            <div className="up-next-item-time">
              {formatDuration(song.durationSec)}
            </div>

            <div className="controls">
              <AmpContextMenuButton
                id={`up-next-song-${playerSongKey(song)}`}
                context={{
                  kind: "song",
                  songId: song.id,
                  releaseTrackId: song.releaseTrackId,
                  sourceAlbumId: song.sourceAlbumId ?? song.albumId,
                  title: song.title,
                  userId,
                  isFavorite,
                  queueItemId: playerSongKey(song),
                }}
              />
            </div>
          </>
        )}
      </div>
    </li>
  );
}
