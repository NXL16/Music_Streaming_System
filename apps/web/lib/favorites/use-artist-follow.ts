"use client";

import { useEffect, useRef, useState } from "react";
import { getArtistFollow, setArtistFollow } from "./artist-follow.api";
import { subscribeArtistFollowChanges } from "./artist-follow-events";

export function useArtistFollow(artistId: string, userId?: string) {
  const [snapshot, setSnapshot] = useState<{
    artistId: string;
    userId: string;
    followed: boolean;
  } | null>(null);
  const [pending, setPending] = useState(false);
  const revision = useRef(0);
  const mutationPending = useRef(false);
  const loaded = snapshot?.artistId === artistId && snapshot?.userId === userId;
  const isFollowing = Boolean(userId && loaded && snapshot?.followed);

  useEffect(() => {
    if (!userId || !artistId) return;
    let active = true;
    const refresh = () => {
      const requestRevision = ++revision.current;
      void getArtistFollow(artistId)
        .then((followed) => {
          if (!active || revision.current !== requestRevision) return;
          setSnapshot({ artistId, userId, followed });
        })
        .catch(() => {
          // Keep follow disabled when its initial state could not be established.
        });
    };
    const unsubscribe = subscribeArtistFollowChanges((change) => {
      if (change.artistId === artistId) {
        revision.current += 1;
        setSnapshot({ artistId, userId, followed: change.isFollowed });
      } else if (!change.pending) {
        refresh();
      }
    });
    refresh();
    return () => {
      active = false;
      unsubscribe();
    };
  }, [artistId, userId]);

  const toggle = async () => {
    if (!userId || !loaded || mutationPending.current) return;
    mutationPending.current = true;
    setPending(true);
    try {
      await setArtistFollow(artistId, !isFollowing);
    } finally {
      mutationPending.current = false;
      setPending(false);
    }
  };
  return { isFollowing, loading: pending || !loaded, toggle };
}
