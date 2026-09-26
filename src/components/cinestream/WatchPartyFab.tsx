"use client";

import { useEffect, useRef, useState } from "react";
import { useParty } from "@/stores/party-store";
import { useApp } from "@/stores/app-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Users, X, Crown, LogOut, Send, Copy, Check, Play } from "lucide-react";

/**
 * Floating watch-party widget.
 *
 * - A tiny round icon pinned to the bottom-right corner.
 * - Clicking it opens a compact popup with two modes:
 *   * IDLE:    "Host a party" + "Join a party" buttons.
 *   * HOST:    Shows the 6-digit code (with copy), party size, and chat.
 *   * VIEWER:  Shows the code, host's current title, and chat.
 * - Chat is shared between host and viewers in real time (2s poll).
 *
 * The popup is intentionally small ("tiny screen") so it overlays the
 * movie without taking over the page.
 */
export function WatchPartyFab() {
  const [open, setOpen] = useState(false);

  const role = useParty((s) => s.role);
  const code = useParty((s) => s.code);
  const peers = useParty((s) => s.peers);
  const chat = useParty((s) => s.chat);
  const state = useParty((s) => s.state);
  const error = useParty((s) => s.error);
  const connecting = useParty((s) => s.connecting);
  const nickname = useParty((s) => s.nickname);
  const setNickname = useParty((s) => s.setNickname);
  const createParty = useParty((s) => s.createParty);
  const joinParty = useParty((s) => s.joinParty);
  const sendMessage = useParty((s) => s.sendMessage);
  const leaveParty = useParty((s) => s.leaveParty);

  const [mode, setMode] = useState<"idle" | "host" | "join">("idle");
  const [joinCode, setJoinCode] = useState("");
  const [chatInput, setChatInput] = useState("");
  const [copied, setCopied] = useState(false);
  const [nickEdit, setNickEdit] = useState(false);
  const [nickDraft, setNickDraft] = useState(nickname);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  // Reset to idle when party ends
  useEffect(() => {
    if (role === "none" && !open) {
      setMode("idle");
    }
  }, [role, open]);

  // Auto-scroll chat to bottom on new messages
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chat, open]);

  const handleCreate = async () => {
    await createParty();
    setMode("host");
  };

  const handleJoin = async () => {
    await joinParty(joinCode);
  };

  const handleCopy = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = chatInput.trim();
    if (!t) return;
    setChatInput("");
    await sendMessage(t);
  };

  const handleLeave = () => {
    leaveParty();
    setMode("idle");
    setJoinCode("");
  };

  const saveNick = () => {
    setNickname(nickDraft.trim() || "Guest");
    setNickEdit(false);
  };

  const inParty = role !== "none" && code;

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Watch party"
        className={`fixed bottom-4 right-4 z-50 flex h-11 w-11 items-center justify-center rounded-full shadow-xl ring-1 ring-border transition-all hover:scale-105 lg:bottom-6 lg:right-6 ${
          inParty
            ? "bg-primary text-primary-foreground"
            : "bg-card/90 backdrop-blur-md text-foreground hover:bg-secondary"
        }`}
      >
        <Users className="h-5 w-5" />
        {inParty && peers > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-green-500 px-1 text-[10px] font-bold text-black">
            {peers}
          </span>
        )}
      </button>

      {/* Popup */}
      {open && (
        <>
          {/* Click-away backdrop (transparent) */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div
            className="fixed bottom-20 right-4 z-50 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-popover/95 backdrop-blur-md shadow-2xl lg:bottom-24 lg:right-6"
            role="dialog"
            aria-label="Watch party"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold">Watch Party</span>
                {inParty && (
                  <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-secondary-foreground">
                    {role === "host" ? "Hosting" : "Viewer"} · {peers} online
                  </span>
                )}
              </div>
              <button
                onClick={() => setOpen(false)}
                className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Body */}
            <div className="max-h-80 overflow-y-auto">
              {error && (
                <div className="mx-3 mt-2 rounded-md bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
                  {error}
                </div>
              )}

              {!inParty && mode === "idle" && (
                <div className="p-3 space-y-3">
                  {/* Nickname editor */}
                  <div>
                    <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                      Your name
                    </label>
                    {nickEdit ? (
                      <div className="mt-1 flex gap-1">
                        <Input
                          value={nickDraft}
                          onChange={(e) => setNickDraft(e.target.value)}
                          className="h-8 text-sm"
                          autoFocus
                          maxLength={24}
                          onKeyDown={(e) => e.key === "Enter" && saveNick()}
                        />
                        <Button size="sm" className="h-8 px-2" onClick={saveNick}>
                          <Check className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setNickDraft(nickname);
                          setNickEdit(true);
                        }}
                        className="mt-1 flex w-full items-center justify-between rounded-md bg-secondary/50 px-2 py-1.5 text-sm text-foreground hover:bg-secondary"
                      >
                        <span>{nickname || "Guest"}</span>
                        <span className="text-[10px] text-muted-foreground">edit</span>
                      </button>
                    )}
                  </div>

                  <button
                    disabled={connecting}
                    onClick={handleCreate}
                    className="flex w-full items-center gap-3 rounded-lg bg-primary/15 px-3 py-3 text-left transition-colors hover:bg-primary/25 disabled:opacity-50"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                      <Crown className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-foreground">Host a Party</div>
                      <div className="text-[11px] text-muted-foreground">
                        Create a 6-digit code &amp; invite friends
                      </div>
                    </div>
                  </button>

                  <button
                    disabled={connecting}
                    onClick={() => setMode("join")}
                    className="flex w-full items-center gap-3 rounded-lg bg-secondary/50 px-3 py-3 text-left transition-colors hover:bg-secondary disabled:opacity-50"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary-foreground/15 text-foreground">
                      <Users className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-foreground">Join a Party</div>
                      <div className="text-[11px] text-muted-foreground">
                        Enter a friend&apos;s code to watch together
                      </div>
                    </div>
                  </button>
                </div>
              )}

              {!inParty && mode === "join" && (
                <div className="p-3 space-y-3">
                  <div>
                    <label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                      Enter party code
                    </label>
                    <Input
                      value={joinCode}
                      onChange={(e) => setJoinCode(e.target.value.toUpperCase().slice(0, 6))}
                      placeholder="ABC123"
                      className="mt-1 text-center text-lg font-bold tracking-[0.3em]"
                      autoFocus
                      onKeyDown={(e) => e.key === "Enter" && handleJoin()}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => setMode("idle")}
                    >
                      Back
                    </Button>
                    <Button
                      size="sm"
                      className="flex-1"
                      disabled={connecting || joinCode.length !== 6}
                      onClick={handleJoin}
                    >
                      {connecting ? "Joining..." : "Join"}
                    </Button>
                  </div>
                </div>
              )}

              {inParty && (
                <div className="flex flex-col">
                  {/* Code display */}
                  <div className="border-b border-border p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                        Party code
                      </span>
                      <button
                        onClick={handleCopy}
                        className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-secondary hover:text-foreground"
                      >
                        {copied ? (
                          <>
                            <Check className="h-3 w-3" /> Copied
                          </>
                        ) : (
                          <>
                            <Copy className="h-3 w-3" /> Copy
                          </>
                        )}
                      </button>
                    </div>
                    <div className="mt-1 text-center text-2xl font-extrabold tracking-[0.4em] text-primary">
                      {code}
                    </div>
                  </div>

                  {/* Now playing */}
                  {state && (
                    <div className="border-b border-border px-3 py-2">
                      <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                        {role === "host" ? "You are playing" : "Host is playing"}
                      </div>
                      <div className="mt-0.5 flex items-center gap-2">
                        {state.poster ? (
                          <img
                            src={state.poster}
                            alt=""
                            className="h-8 w-6 shrink-0 rounded object-cover"
                          />
                        ) : null}
                        <div className="min-w-0">
                          <div className="truncate text-xs font-semibold text-foreground">
                            {state.title || "Unknown title"}
                          </div>
                          <div className="text-[10px] text-muted-foreground">
                            {state.paused ? "Paused" : "Playing"} ·{" "}
                            {formatTime(state.currentTime)}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  {role === "host" && !state && (
                    <div className="border-b border-border px-3 py-2 text-[11px] text-muted-foreground">
                      Play any movie or series — friends will follow along.
                    </div>
                  )}
                  {role === "viewer" && !state && (
                    <div className="border-b border-border px-3 py-2 text-[11px] text-muted-foreground">
                      Waiting for host to start a movie...
                    </div>
                  )}

                  {/* Chat */}
                  <div
                    ref={chatScrollRef}
                    className="max-h-40 min-h-[80px] overflow-y-auto px-3 py-2 space-y-1.5"
                  >
                    {chat.length === 0 ? (
                      <p className="text-center text-[11px] text-muted-foreground py-3">
                        No messages yet. Say hi! 👋
                      </p>
                    ) : (
                      chat.map((m) => {
                        const mine = m.user === nickname;
                        return (
                          <div
                            key={m.id}
                            className={`flex flex-col ${
                              mine ? "items-end" : "items-start"
                            }`}
                          >
                            <span className="text-[10px] text-muted-foreground px-1">
                              {mine ? "You" : m.user}
                            </span>
                            <span
                              className={`max-w-[80%] rounded-lg px-2 py-1 text-xs ${
                                mine
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-secondary text-secondary-foreground"
                              }`}
                            >
                              {m.text}
                            </span>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Chat input */}
                  <form
                    onSubmit={handleSend}
                    className="flex items-center gap-1 border-t border-border p-2"
                  >
                    <Input
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      placeholder="Type a message..."
                      className="h-8 text-sm"
                      maxLength={500}
                    />
                    <Button
                      type="submit"
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 shrink-0"
                      disabled={!chatInput.trim()}
                      aria-label="Send"
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  </form>

                  {/* Leave */}
                  <button
                    onClick={handleLeave}
                    className="flex items-center justify-center gap-1.5 border-t border-border py-2 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    Leave party
                  </button>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}

function formatTime(s: number): string {
  if (!s || s < 0) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}
