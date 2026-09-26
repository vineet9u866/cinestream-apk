"use client";

import { create } from "zustand";
import { safeJson } from "@/lib/utils";

/**
 * Watch-party client store (standalone APK version).
 *
 * In standalone APK mode (no server), watch parties use a localStorage-backed
 * store. This works for solo testing on the same device. For cross-device
 * parties, the APK can be rebuilt with a public party backend URL set in
 * `PARTY_BACKEND_URL` below — when set, all party traffic routes there.
 *
 * Two roles:
 *  - HOST:   creates a party, gets a 6-digit code, broadcasts playback state.
 *  - VIEWER: joins with a code, polls for the host's state, auto-seeks.
 */

// Optional: set this to a public party backend (e.g. https://your-party.fly.dev)
// to enable cross-device parties. When empty, parties are local-only (same
// device, useful for testing the UI).
const PARTY_BACKEND_URL = "";

function partyUrl(path: string): string {
  if (!PARTY_BACKEND_URL) return path;
  return `${PARTY_BACKEND_URL}${path}`;
}

function isLocalMode(): boolean {
  return !PARTY_BACKEND_URL;
}

// LocalStorage-backed party registry (used when PARTY_BACKEND_URL is empty)
const LOCAL_PARTY_KEY = "cs-local-parties";
function getLocalParties(): Record<string, any> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(LOCAL_PARTY_KEY) || "{}");
  } catch {
    return {};
  }
}
function setLocalParties(p: Record<string, any>): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(LOCAL_PARTY_KEY, JSON.stringify(p));
}
function gcLocalParties(): void {
  if (typeof window === "undefined") return;
  const parties = getLocalParties();
  const now = Date.now();
  const TTL = 4 * 60 * 60 * 1000;
  let changed = false;
  for (const code of Object.keys(parties)) {
    if (now - (parties[code].lastSeen || 0) > TTL) {
      delete parties[code];
      changed = true;
    }
  }
  if (changed) setLocalParties(parties);
}

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
      let code: string;
      let hostId: string;
      if (isLocalMode()) {
        code = genCode();
        hostId = genId();
        const parties = getLocalParties();
        parties[code] = {
          code,
          hostId,
          state: null,
          chat: [],
          lastSeen: Date.now(),
          createdAt: Date.now(),
        };
        setLocalParties(parties);
      } else {
        const res = await fetch(partyUrl("/api/party"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "create" }),
        });
        const json = await safeJson<{ code: number; message?: string; data?: { code: string; hostId: string } }>(res, "Failed to create party");
        if (json.code !== 0) throw new Error(json.message || "Failed to create party");
        code = json.data.code;
        hostId = json.data.hostId;
      }
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
      let hostId: string;
      let state: any = null;
      let chat: PartyChatMsg[] = [];
      let peers = 1;
      if (isLocalMode()) {
        gcLocalParties();
        const parties = getLocalParties();
        const p = parties[code];
        if (!p) throw new Error("Party not found");
        p.lastSeen = Date.now();
        setLocalParties(parties);
        hostId = p.hostId;
        state = p.state;
        chat = p.chat || [];
      } else {
        const res = await fetch(partyUrl("/api/party"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "join", code, peerId }),
        });
        const json = await safeJson<{ code: number; message?: string; data?: any }>(res, "Party not found");
        if (json.code !== 0) throw new Error(json.message || "Party not found");
        hostId = json.data.hostId;
        state = json.data.state;
        chat = json.data.chat || [];
        peers = json.data.peers || 1;
      }
      set({
        role: "viewer",
        code,
        hostId,
        peerId,
        nickname,
        state: state ?? null,
        chat: chat ?? [],
        peers,
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
      if (isLocalMode()) {
        const parties = getLocalParties();
        const p = parties[code];
        if (p) {
          p.state = { ...s, updatedAt: Date.now() };
          p.lastSeen = Date.now();
          setLocalParties(parties);
        }
      } else {
        await fetch(partyUrl("/api/party"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "update",
            code,
            hostId,
            state: { ...s, updatedAt: Date.now() },
          }),
        });
      }
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
      if (isLocalMode()) {
        const parties = getLocalParties();
        const p = parties[code];
        if (p) {
          p.chat = [...(p.chat || []), optimistic].slice(-100);
          p.lastSeen = Date.now();
          setLocalParties(parties);
        }
      } else {
        await fetch(partyUrl("/api/party"), {
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
      }
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
      let state: any = null;
      let chat: PartyChatMsg[] = [];
      let peers = 1;
      let hostId: string | null = null;
      let ended = false;
      if (isLocalMode()) {
        gcLocalParties();
        const parties = getLocalParties();
        const p = parties[code];
        if (!p) {
          ended = true;
        } else {
          state = p.state;
          chat = p.chat || [];
          peers = 1;
          hostId = p.hostId;
          p.lastSeen = Date.now();
          setLocalParties(parties);
        }
      } else {
        const res = await fetch(partyUrl(`/api/party?action=state&code=${encodeURIComponent(code)}`));
        const json = await safeJson<{ code: number; data?: any }>(res, "Failed to poll party state");
        if (json.code === 404) {
          ended = true;
        } else if (json.code === 0 && json.data) {
          state = json.data.state;
          chat = json.data.chat || [];
          peers = json.data.peers || 0;
          hostId = json.data.hostId;
        }
      }
      if (ended) {
        get()._stopPolling();
        set({ error: "Party ended", role: "none", code: null, state: null });
        return;
      }
      set({
        state: state ?? null,
        chat: chat ?? [],
        peers,
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
    // Heartbeat every 10s (only needed in remote mode; local mode is always alive)
    const { code, peerId } = get();
    heartbeatTimer = setInterval(async () => {
      if (!code || !peerId) return;
      if (isLocalMode()) return; // no-op
      try {
        await fetch(partyUrl("/api/party"), {
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
