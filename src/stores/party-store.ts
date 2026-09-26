"use client";

import { create } from "zustand";
import { safeJson } from "@/lib/utils";

/**
 * Watch-party client store.
 *
 * Two roles:
 *  - HOST:   creates a party, gets a 6-digit code, broadcasts their playback
 *            state (subject + position) to the server every few seconds.
 *  - VIEWER: joins with a code, polls the server for the host's state, and
 *            navigates to whatever the host is playing. Auto-seeks to the
 *            host's position.
 *
 * Both roles share a chat channel.
 *
 * State sync uses polling (2s) rather than websockets to keep the
 * deployment trivial. The /api/party endpoint is in-memory per instance.
 */

export interface PartyPlaybackState {
  subjectId: string;
  detailPath: string;
  subjectType: number;
  title: string;
  poster?: string;
  se: number;
  ep: number;
  currentTime: number;
  paused: boolean;
  // Host's subtitle selection — broadcast to viewers so they can auto-
  // apply the same subtitle language. `subtitleLan` is the language code
  // (e.g. "zh", "en"), and `subtitleAutoTranslated` indicates whether the
  // host's subtitle was auto-translated (so the viewer re-triggers
  // translation rather than looking for a native track).
  subtitleLan?: string | null;
  subtitleAutoTranslated?: boolean;
  updatedAt: number;
}

export interface PartyChatMsg {
  id: string;
  user: string;
  text: string;
  ts: number;
}

type Role = "none" | "host" | "viewer";

interface PartyStore {
  role: Role;
  code: string | null;
  hostId: string | null;
  peerId: string | null;
  nickname: string;
  state: PartyPlaybackState | null;
  chat: PartyChatMsg[];
  peers: number;
  error: string | null;
  connecting: boolean;

  // setters
  setNickname: (n: string) => void;

  // host actions
  createParty: () => Promise<void>;
  broadcastState: (s: Omit<PartyPlaybackState, "updatedAt">) => Promise<void>;

  // viewer actions
  joinParty: (code: string) => Promise<void>;

  // shared
  sendMessage: (text: string) => Promise<void>;
  leaveParty: () => void;
  poll: () => Promise<void>;

  // internal
  _stopPolling: () => void;
  _startPolling: () => void;
}

// Generate a stable per-tab peer id.
function getOrCreatePeerId(): string {
  if (typeof window === "undefined") return "";
  const k = "cs-party-peerid";
  let v = sessionStorage.getItem(k);
  if (!v) {
    v = Math.random().toString(36).slice(2, 10);
    sessionStorage.setItem(k, v);
  }
  return v;
}

function getOrCreateNickname(): string {
  if (typeof window === "undefined") return "Guest";
  const k = "cs-party-nick";
  let v = sessionStorage.getItem(k);
  if (!v) {
    const animals = ["Fox", "Owl", "Cat", "Wolf", "Bear", "Hawk", "Lion", "Deer", "Seal", "Panda"];
    v = `${animals[Math.floor(Math.random() * animals.length)]}${Math.floor(Math.random() * 100)}`;
    sessionStorage.setItem(k, v);
  }
  return v;
}

let pollTimer: ReturnType<typeof setInterval> | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

export const useParty = create<PartyStore>((set, get) => ({
  role: "none",
  code: null,
  hostId: null,
  peerId: null,
  nickname: "",
  state: null,
  chat: [],
  peers: 0,
  error: null,
  connecting: false,

  setNickname: (n) => {
    const trimmed = n.slice(0, 24);
    if (typeof window !== "undefined") {
      sessionStorage.setItem("cs-party-nick", trimmed);
    }
    set({ nickname: trimmed });
  },

  createParty: async () => {
    set({ connecting: true, error: null });
    try {
      const res = await fetch("/api/party", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create" }),
      });
      const json = await safeJson<{ code: number; message?: string; data?: { code: string; hostId: string } }>(res, "Failed to create party");
      if (json.code !== 0) throw new Error(json.message || "Failed to create party");
      const { code, hostId } = json.data;
      const peerId = getOrCreatePeerId();
      const nickname = getOrCreateNickname();
      set({
        role: "host",
        code,
        hostId,
        peerId,
        nickname,
        peers: 1,
        error: null,
      });
      get()._startPolling();
    } catch (e) {
      set({ error: (e as Error).message });
    } finally {
      set({ connecting: false });
    }
  },

  joinParty: async (rawCode) => {
    const code = rawCode.trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(code)) {
      set({ error: "Code must be 6 letters/digits" });
      return;
    }
    set({ connecting: true, error: null });
    try {
      const peerId = getOrCreatePeerId();
      const nickname = getOrCreateNickname();
      const res = await fetch("/api/party", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "join", code, peerId }),
      });
      const json = await safeJson<{ code: number; message?: string; data?: any }>(res, "Party not found");
      if (json.code !== 0) throw new Error(json.message || "Party not found");
      const { hostId, state, chat, peers } = json.data;
      set({
        role: "viewer",
        code,
        hostId,
        peerId,
        nickname,
        state: state ?? null,
        chat: chat ?? [],
        peers: peers ?? 1,
        error: null,
      });
      get()._startPolling();
    } catch (e) {
      set({ error: (e as Error).message });
    } finally {
      set({ connecting: false });
    }
  },

  broadcastState: async (s) => {
    const { role, code, hostId } = get();
    if (role !== "host" || !code || !hostId) return;
    try {
      await fetch("/api/party", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update",
          code,
          hostId,
          state: { ...s, updatedAt: Date.now() },
        }),
      });
    } catch {
      // ignore — best-effort broadcast
    }
  },

  sendMessage: async (text) => {
    const { code, peerId, nickname } = get();
    const trimmed = text.trim();
    if (!code || !trimmed) return;
    // Optimistic append
    const optimistic: PartyChatMsg = {
      id: `local-${Date.now()}`,
      user: nickname,
      text: trimmed,
      ts: Date.now(),
    };
    set((s) => ({ chat: [...s.chat, optimistic] }));
    try {
      await fetch("/api/party", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "chat",
          code,
          peerId,
          user: nickname,
          text: trimmed,
        }),
      });
    } catch {
      // ignore
    }
  },

  leaveParty: () => {
    get()._stopPolling();
    set({
      role: "none",
      code: null,
      hostId: null,
      state: null,
      chat: [],
      peers: 0,
      error: null,
    });
  },

  poll: async () => {
    const { code, role } = get();
    if (!code) return;
    try {
      const res = await fetch(`/api/party?action=state&code=${encodeURIComponent(code)}`);
      const json = await safeJson<{ code: number; data?: any }>(res, "Failed to poll party state");
      if (json.code !== 0) {
        // Party may have been expired server-side
        if (json.code === 404) {
          get()._stopPolling();
          set({ error: "Party ended", role: "none", code: null, state: null });
        }
        return;
      }
      const { state, chat, peers, hostId } = json.data;
      set({
        state: state ?? null,
        chat: chat ?? [],
        peers: peers ?? 0,
        hostId: hostId ?? get().hostId,
      });
      void role;
    } catch {
      // ignore transient errors
    }
  },

  _startPolling: () => {
    get()._stopPolling();
    // Poll every 2s for state + chat.
    pollTimer = setInterval(() => {
      void get().poll();
    }, 2000);
    // Heartbeat every 10s so the server knows we're alive.
    const { code, peerId } = get();
    heartbeatTimer = setInterval(async () => {
      if (!code || !peerId) return;
      try {
        await fetch("/api/party", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "heartbeat", code, peerId }),
        });
      } catch {
        // ignore
      }
    }, 10000);
    // Initial poll immediately
    void get().poll();
  },

  _stopPolling: () => {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  },
}));
