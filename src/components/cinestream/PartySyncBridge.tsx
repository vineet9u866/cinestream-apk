"use client";

import { useEffect, useRef } from "react";
import { useApp } from "@/stores/app-store";
import { useParty } from "@/stores/party-store";
import { getSubtitlePref } from "@/lib/subtitle-pref";

/**
 * Headless bridge that keeps the watch-party state in sync with the app.
 *
 * HOST behaviour:
 *  - When the host navigates to a detail page, broadcasts that title.
 *  - The VideoPlayer reports its currentTime/paused back via a shared
 *    "video sync" element (window.__csVideoSync), and this bridge reads
 *    it on an interval and pushes updates to the server.
 *
 * VIEWER behaviour:
 *  - Watches the server-pushed party state.
 *  - If the host's subjectId differs from the current view, navigates
 *    to the host's title.
 *  - Exposes the host's currentTime/paused to the VideoPlayer via
 *    window.__csPartyView so the player can auto-seek.
 *
 * This component renders nothing.
 */

interface VideoSync {
  subjectId: string;
  se: number;
  ep: number;
  currentTime: number;
  paused: boolean;
  getSnapshot: () => { currentTime: number; paused: boolean } | null;
}

// Extended video sync that includes metadata for the broadcast.
// We attach these to the same window object so the bridge can read them.
declare global {
  interface Window {
    __csVideoSync?: VideoSync & {
      title?: string;
      poster?: string;
      detailPath?: string;
      subjectType?: number;
    };
    __csPartyView?: PartyView;
  }
}

interface PartyView {
  state: {
    subjectId: string;
    detailPath: string;
    subjectType: number;
    title: string;
    poster?: string;
    se: number;
    ep: number;
    currentTime: number;
    paused: boolean;
    updatedAt: number;
  } | null;
}

export function PartySyncBridge() {
  const role = useParty((s) => s.role);
  const code = useParty((s) => s.code);
  const hostId = useParty((s) => s.hostId);
  const broadcastState = useParty((s) => s.broadcastState);

  const view = useApp((s) => s.view);
  const go = useApp((s) => s.go);

  // Keep latest view in a ref so the host interval can read it.
  const viewRef = useRef(view);
  viewRef.current = view;

  /* ---------------- HOST: broadcast ---------------- */
  // The host broadcasts its playback state every 2 seconds (matching the
  // viewer's poll interval) so viewers see play/pause changes quickly.
  // The getSnapshot() in VideoPlayer uses userPausedRef instead of
  // v.paused, so buffering stalls don't get broadcast as "paused".
  useEffect(() => {
    if (role !== "host" || !code || !hostId) return;

    let stopped = false;
    const push = async () => {
      if (stopped) return;
      const v = viewRef.current;
      if (v.kind !== "detail") {
        // Host is not on a detail page; don't overwrite the state.
        return;
      }
      // Read live playback position from the video element via the
      // shared hook the VideoPlayer installs.
      const sync = window.__csVideoSync;
      let currentTime = 0;
      let paused = true;
      if (sync && sync.subjectId === v.subjectId) {
        const snap = sync.getSnapshot?.();
        if (snap) {
          currentTime = snap.currentTime;
          paused = snap.paused;
        }
      }
      // Read the host's subtitle preference so it can be broadcast to
      // viewers. This lets viewers auto-apply the same subtitle language.
      const subPref = getSubtitlePref();
      await broadcastState({
        subjectId: v.subjectId,
        detailPath: sync?.detailPath ?? "",
        subjectType: v.subjectType,
        title: sync?.title ?? "",
        poster: sync?.poster,
        se: sync?.se ?? 0,
        ep: sync?.ep ?? 0,
        currentTime,
        paused,
        subtitleLan: subPref.preferredLan,
        subtitleAutoTranslated: subPref.autoTranslated,
      });
    };

    // Broadcast on navigation changes
    push();
    // Broadcast every 2 seconds (matches viewer poll interval) so
    // play/pause changes propagate quickly without flooding the server.
    const t = setInterval(push, 2000);
    return () => {
      stopped = true;
      clearInterval(t);
    };
  }, [role, code, hostId, view.kind, view.kind === "detail" ? view.subjectId : "", broadcastState]);

  /* ---------------- VIEWER: follow host ---------------- */
  const partyState = useParty((s) => s.state);
  useEffect(() => {
    if (role !== "viewer") return;
    if (!partyState) {
      window.__csPartyView = { state: null };
      return;
    }
    // Expose to VideoPlayer so it can auto-seek
    window.__csPartyView = { state: partyState };

    // Navigate to host's title if different
    const v = viewRef.current;
    if (
      partyState.subjectId &&
      (v.kind !== "detail" || v.subjectId !== partyState.subjectId)
    ) {
      go({
        kind: "detail",
        subjectId: partyState.subjectId,
        subjectType: partyState.subjectType || 1,
      });
    }
  }, [role, partyState, go]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      delete window.__csPartyView;
    };
  }, []);

  return null;
}
