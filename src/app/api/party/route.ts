import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

export const dynamic = "force-dynamic";

/**
 * Database-backed watch-party registry.
 *
 * Parties are stored in the Prisma database (not in-memory) so they
 * persist across serverless function invocations on platforms like
 * Netlify, Vercel, etc. where each request may hit a new instance.
 *
 * Parties are keyed by a 6-digit code. Each party stores:
 *  - hostId: a random id for the host (so viewers can tell who's leading)
 *  - state: JSON-encoded playback state (subjectId, currentTime, paused, etc.)
 *  - chat: JSON-encoded array of { id, user, text, ts } messages
 *  - lastSeen: timestamp of the last heartbeat/broadcast (for GC)
 */

export interface PartyState {
  subjectId: string;
  detailPath: string;
  subjectType: number;
  title: string;
  poster?: string;
  se: number;
  ep: number;
  currentTime: number;
  paused: boolean;
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

// Use a single Prisma instance across hot-reloads in dev.
const prisma = (globalThis as any).__prisma as PrismaClient | undefined;
const db = prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") {
  (globalThis as any).__prisma = db;
}

// Expire parties that haven't been touched in 4 hours.
const PARTY_TTL_MS = 4 * 60 * 60 * 1000;

async function gc() {
  const cutoff = new Date(Date.now() - PARTY_TTL_MS);
  try {
    await db.party.deleteMany({ where: { lastSeen: { lt: cutoff } } });
  } catch {
    // ignore — GC is best-effort
  }
}

function genCode(): string {
  // 6-digit code, no ambiguous chars (0/O, 1/I)
  const chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  let s = "";
  for (let i = 0; i < 6; i++) {
    s += chars[Math.floor(Math.random() * chars.length)];
  }
  return s;
}

function genId(): string {
  return Math.random().toString(36).slice(2, 10);
}

/**
 * GET  /api/party?action=state&code=XXX
 * POST /api/party  with body:
 *   { action: "create" }                              -> { code, hostId }
 *   { action: "join", code, peerId }                  -> { ok, party }
 *   { action: "heartbeat", code, peerId, isHost }     -> { ok }
 *   { action: "update", code, hostId, state }         -> { ok }
 *   { action: "chat", code, peerId, user, text }      -> { ok, msg }
 */
export async function GET(req: NextRequest) {
  gc(); // fire-and-forget GC
  const sp = req.nextUrl.searchParams;
  const action = sp.get("action");
  const code = (sp.get("code") || "").toUpperCase();

  if (action === "state") {
    if (!code) {
      return NextResponse.json({ code: 400, message: "code required" }, { status: 400 });
    }
    const party = await db.party.findUnique({ where: { code } });
    if (!party) {
      return NextResponse.json({ code: 404, message: "party not found" }, { status: 404 });
    }
    const state: PartyState | null = party.state ? JSON.parse(party.state) : null;
    const chat: PartyChatMsg[] = party.chat ? JSON.parse(party.chat) : [];
    return NextResponse.json({
      code: 0,
      data: {
        code: party.code,
        hostId: party.hostId,
        state,
        chat: chat.slice(-50),
        peers: 1, // peer count is approximate in DB mode (we don't track per-peer)
        createdAt: party.createdAt.getTime(),
      },
    });
  }

  return NextResponse.json({ code: 400, message: "unknown action" }, { status: 400 });
}

export async function POST(req: NextRequest) {
  gc();
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ code: 400, message: "invalid json" }, { status: 400 });
  }
  const action = body.action;

  if (action === "create") {
    // Generate a unique code (retry if collision)
    let code = genCode();
    let attempts = 0;
    while (await db.party.findUnique({ where: { code } })) {
      code = genCode();
      if (++attempts > 10) break;
    }
    const hostId = genId();
    await db.party.create({
      data: {
        code,
        hostId,
        state: null,
        chat: "[]",
        lastSeen: new Date(),
      },
    });
    return NextResponse.json({ code: 0, data: { code, hostId } });
  }

  if (action === "join") {
    const code = String(body.code || "").toUpperCase();
    const peerId = String(body.peerId || genId());
    const party = await db.party.findUnique({ where: { code } });
    if (!party) {
      return NextResponse.json({ code: 404, message: "party not found" }, { status: 404 });
    }
    // Update lastSeen to keep the party alive
    await db.party.update({
      where: { code },
      data: { lastSeen: new Date() },
    });
    const state: PartyState | null = party.state ? JSON.parse(party.state) : null;
    const chat: PartyChatMsg[] = party.chat ? JSON.parse(party.chat) : [];
    return NextResponse.json({
      code: 0,
      data: {
        code: party.code,
        hostId: party.hostId,
        peerId,
        state,
        chat: chat.slice(-50),
        peers: 1,
      },
    });
  }

  if (action === "heartbeat") {
    const code = String(body.code || "").toUpperCase();
    const peerId = String(body.peerId || "");
    const party = await db.party.findUnique({ where: { code } });
    if (!party) {
      return NextResponse.json({ code: 404, message: "party not found" }, { status: 404 });
    }
    await db.party.update({
      where: { code },
      data: { lastSeen: new Date() },
    });
    const state: PartyState | null = party.state ? JSON.parse(party.state) : null;
    const chat: PartyChatMsg[] = party.chat ? JSON.parse(party.chat) : [];
    return NextResponse.json({
      code: 0,
      data: {
        peers: 1,
        state,
        chat: chat.slice(-50),
      },
    });
  }

  if (action === "update") {
    const code = String(body.code || "").toUpperCase();
    const hostId = String(body.hostId || "");
    const party = await db.party.findUnique({ where: { code } });
    if (!party) {
      return NextResponse.json({ code: 404, message: "party not found" }, { status: 404 });
    }
    if (party.hostId !== hostId) {
      return NextResponse.json({ code: 403, message: "only host can update state" }, { status: 403 });
    }
    const newState: PartyState = {
      subjectId: String(body.state?.subjectId ?? ""),
      detailPath: String(body.state?.detailPath ?? ""),
      subjectType: Number(body.state?.subjectType ?? 1),
      title: String(body.state?.title ?? ""),
      poster: body.state?.poster,
      se: Number(body.state?.se ?? 0),
      ep: Number(body.state?.ep ?? 0),
      currentTime: Number(body.state?.currentTime ?? 0),
      paused: Boolean(body.state?.paused),
      subtitleLan: body.state?.subtitleLan ?? null,
      subtitleAutoTranslated: Boolean(body.state?.subtitleAutoTranslated),
      updatedAt: Date.now(),
    };
    await db.party.update({
      where: { code },
      data: {
        state: JSON.stringify(newState),
        lastSeen: new Date(),
      },
    });
    return NextResponse.json({ code: 0, data: { ok: true } });
  }

  if (action === "chat") {
    const code = String(body.code || "").toUpperCase();
    const user = String(body.user || "Guest").slice(0, 24);
    const text = String(body.text || "").slice(0, 500).trim();
    if (!text) {
      return NextResponse.json({ code: 400, message: "text required" }, { status: 400 });
    }
    const party = await db.party.findUnique({ where: { code } });
    if (!party) {
      return NextResponse.json({ code: 404, message: "party not found" }, { status: 404 });
    }
    const msg: PartyChatMsg = {
      id: genId(),
      user,
      text,
      ts: Date.now(),
    };
    const chat: PartyChatMsg[] = party.chat ? JSON.parse(party.chat) : [];
    chat.push(msg);
    // Keep only the last 100 messages
    const trimmedChat = chat.slice(-100);
    await db.party.update({
      where: { code },
      data: {
        chat: JSON.stringify(trimmedChat),
        lastSeen: new Date(),
      },
    });
    return NextResponse.json({ code: 0, data: { msg } });
  }

  return NextResponse.json({ code: 400, message: "unknown action" }, { status: 400 });
}
