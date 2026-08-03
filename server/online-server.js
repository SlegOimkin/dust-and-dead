"use strict";

const crypto = require("node:crypto");
const { WebSocket, WebSocketServer } = require("ws");

const protocol = require("../multiplayer-protocol.js");
const { Matchmaker } = require("./matchmaker.js");
const { TokenBucket } = require("./rate-limit.js");
const { SessionStore } = require("./session-store.js");
const { decodeGameMessage, encodeGameMessage } = require("./wire.js");

const ONLINE_PATH = "/online";
const MAX_ENVELOPE_BYTES = Math.ceil(protocol.MAX_WIRE_BYTES * 4 / 3) + 16 * 1024;
const MAX_RELIABLE_QUEUE_BYTES = 4 * 1024 * 1024;
const MAX_SOCKET_BUFFER_BYTES = 2 * 1024 * 1024;
const SESSION_JOIN_TIMEOUT_MS = 10000;
const RETURN_TO_LOBBY_DELAY_MS = 250;
const DEFAULT_MAX_CONNECTIONS = 256;
const DEFAULT_MAX_CONNECTIONS_PER_IP = 32;
const DEFAULT_MAX_SESSIONS = 512;
const DEFAULT_IDLE_LOBBY_TTL_MS = 10 * 60 * 1000;
// One extra token per 16 KiB of frame, so the per-connection budget bounds bytes
// as well as message count. Normal gameplay frames stay at a cost of one.
const RATE_LIMIT_BYTES_PER_TOKEN = 16 * 1024;
// The authority retransmits its terminal control messages until acknowledged, so
// a room that has already returned to the lobby has to keep absorbing the acks
// for the match it just finished instead of answering them with an error.
const POST_MATCH_GRACE_MS = 20000;
// Returning to the lobby after a match is player-driven (a click on the results
// screen). Players who idle there would otherwise hold the room in "ended" and
// its match worker — a whole Chromium context — forever. After this long the
// server returns the room on its own; a real click just gets there sooner.
const DEFAULT_POST_MATCH_AUTO_RETURN_MS = 90000;

// Every profile is echoed to all players inside startPrepare/start, so its
// serialized size must leave room for MAX_PLAYERS of them plus the rest of the
// message inside one wire frame. Enforcing it at ingestion is what keeps
// encodeGameMessage from throwing later, on a synchronous path where the throw
// would escape the socket handler and take the whole process down.
const MAX_PROFILE_BYTES = Math.floor(protocol.MAX_WIRE_BYTES / (protocol.MAX_PLAYERS * 4));
const FORBIDDEN_PROFILE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

const CLIENT_GAME_TYPES = new Set([
  "hello",
  "startAck",
  "input",
  "decision",
  "progressionChoice",
  "matchEndAck",
  "returnLobbyAck",
  "returnLobbyRequest",
]);
const POST_MATCH_GAME_TYPES = new Set(["matchEndAck", "returnLobbyAck", "returnLobbyRequest"]);

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function sanitizeProfile(value) {
  if (!isPlainObject(value)) return null;
  const state = { nodes: 0 };
  function visit(entry, depth) {
    state.nodes += 1;
    if (state.nodes > 4096 || depth > 8) return false;
    if (entry == null || typeof entry === "boolean") return true;
    if (typeof entry === "number") return Number.isFinite(entry);
    if (typeof entry === "string") return entry.length <= 512;
    if (Array.isArray(entry)) {
      return entry.length <= 256 && entry.every((item) => visit(item, depth + 1));
    }
    if (!isPlainObject(entry)) return false;
    const keys = Object.keys(entry);
    return keys.length <= 256 && keys.every((key) => (
      key.length <= 96 && !FORBIDDEN_PROFILE_KEYS.has(key) && visit(entry[key], depth + 1)
    ));
  }
  if (!visit(value, 0)) return null;
  let serialized;
  try {
    serialized = JSON.stringify(value);
  } catch (error) {
    return null;
  }
  if (!serialized || Buffer.byteLength(serialized) > MAX_PROFILE_BYTES) return null;
  return value;
}

// X-Forwarded-For grows left-to-right, so the leftmost entry is the one a client
// can write freely. With `hops` trusted proxies in front, the honest entry is the
// hops-th from the right; anything shorter than that means the header did not
// come through the expected chain and the real peer address is used instead.
function getClientAddress(request, trustProxy, trustedHops) {
  if (trustProxy) {
    const hops = Math.max(1, Number(trustedHops) || 1);
    const parts = String(request.headers["x-forwarded-for"] || "")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
    if (parts.length >= hops) return parts[parts.length - hops].slice(0, 80);
  }
  return String(request.socket && request.socket.remoteAddress || "unknown").slice(0, 80);
}

function randomId(prefix) {
  return String(prefix || "id") + "_" + crypto.randomBytes(16).toString("base64url");
}

function randomMapSeed() {
  return crypto.randomInt(1, 0x7fffffff);
}

function safeCloseSocket(socket, code, reason) {
  if (!socket || socket.readyState === WebSocket.CLOSED || socket.readyState === WebSocket.CLOSING) return;
  try {
    socket.close(code || 1000, String(reason || "").slice(0, 120));
  } catch (error) {
    try { socket.terminate(); } catch (ignored) {}
  }
}

function waitWithTimeout(promise, timeoutMs, timeoutValue) {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(timeoutValue);
    }, timeoutMs);
    Promise.resolve(promise).then((value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    }, () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(timeoutValue);
    });
  });
}

function publicRoster(room) {
  return Array.from(room.players.values()).map((player) => ({
    id: player.id,
    name: player.name,
    ready: true,
    connected: player.connected !== false,
    unlocks: player.unlocks || null,
    cosmetics: player.cosmetics || null,
  }));
}

class OutboundQueue {
  constructor(socket, onSlowClient) {
    this.socket = socket;
    this.onSlowClient = typeof onSlowClient === "function" ? onSlowClient : function () {};
    this.reliable = [];
    this.reliableBytes = 0;
    this.latest = new Map();
    this.sending = false;
    this.closed = false;
    this.retryTimer = null;
  }

  enqueue(message, latestKey) {
    if (this.closed) return false;
    let text;
    try {
      text = JSON.stringify(message);
    } catch (error) {
      return false;
    }
    const item = { text, bytes: Buffer.byteLength(text), key: String(latestKey || "") };
    if (item.key) {
      this.latest.set(item.key, item);
    } else {
      // Checked before appending, and the queue is closed rather than merely
      // signalled: onSlowClient only starts a close handshake, which a stalled
      // peer can drag out while further messages keep piling up behind it.
      if (this.reliableBytes + item.bytes > MAX_RELIABLE_QUEUE_BYTES) {
        this.close();
        this.onSlowClient();
        return false;
      }
      this.reliable.push(item);
      this.reliableBytes += item.bytes;
    }
    this.pump();
    return true;
  }

  nextItem() {
    if (this.reliable.length) {
      const item = this.reliable.shift();
      this.reliableBytes = Math.max(0, this.reliableBytes - item.bytes);
      return item;
    }
    const iterator = this.latest.entries().next();
    if (iterator.done) return null;
    const [key, item] = iterator.value;
    this.latest.delete(key);
    return item;
  }

  pump() {
    if (this.closed || this.sending || this.retryTimer) return;
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    if (this.socket.bufferedAmount > MAX_SOCKET_BUFFER_BYTES) {
      this.retryTimer = setTimeout(() => {
        this.retryTimer = null;
        this.pump();
      }, 10);
      if (this.retryTimer && typeof this.retryTimer.unref === "function") this.retryTimer.unref();
      return;
    }
    const item = this.nextItem();
    if (!item) return;
    this.sending = true;
    this.socket.send(item.text, (error) => {
      this.sending = false;
      if (error) {
        this.close();
        return;
      }
      this.pump();
    });
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.reliable.length = 0;
    this.latest.clear();
    this.reliableBytes = 0;
  }
}

class OnlineMultiplayerServer {
  constructor(options) {
    const settings = options || {};
    if (!settings.httpServer) throw new Error("http_server_required");
    if (!settings.workerManager) throw new Error("worker_manager_required");
    this.httpServer = settings.httpServer;
    this.workerManager = settings.workerManager;
    this.config = settings.config || {};
    this.path = String(settings.path || ONLINE_PATH);
    this.log = typeof settings.log === "function" ? settings.log : function () {};
    this.draining = false;
    this.closed = false;
    this.peers = new Set();
    this.peerBySocket = new WeakMap();
    this.pendingStarts = new Map();
    this.returnTimers = new Map();
    this.recentMatches = new Map();
    this.ipAdmissionBuckets = new Map();
    this.activeConnectionsByIp = new Map();
    this.idleLobbyTimers = new Map();
    this.metricsState = {
      acceptedConnections: 0,
      rejectedConnections: 0,
      messagesReceived: 0,
      sessionsCreated: 0,
      sessionsResumed: 0,
      matchesStarted: 0,
      matchStartFailures: 0,
      reconnects: 0,
      idleLobbyExpirations: 0,
      pingsAnswered: 0,
    };
    this.sessionStore = settings.sessionStore || new SessionStore({
      secret: this.config.resumeTokenSecret,
    });
    this.matchmaker = settings.matchmaker || new Matchmaker({
      autoStartDelayMs: this.config.autoStartDelayMs || protocol.AUTO_START_DELAY_MS,
      onRoomState: (room, reason) => this.handleRoomState(room, reason),
      onStartRequested: (room, details) => this.prepareMatch(room, details),
      onRoomRemoved: (room, reason) => this.handleRoomRemoved(room, reason),
    });
    this.wss = new WebSocketServer({
      noServer: true,
      clientTracking: false,
      perMessageDeflate: false,
      maxPayload: MAX_ENVELOPE_BYTES,
    });
    this.upgradeHandler = (request, socket, head) => this.handleUpgrade(request, socket, head);
    this.httpServer.on("upgrade", this.upgradeHandler);
    this.wss.on("connection", (socket, request) => this.handleConnection(socket, request));
    const heartbeatMs = Math.max(1000, Number(this.config.heartbeatIntervalMs) || 15000);
    this.heartbeatTimer = setInterval(() => this.heartbeat(), heartbeatMs);
    if (this.heartbeatTimer && typeof this.heartbeatTimer.unref === "function") this.heartbeatTimer.unref();
  }

  isOriginAllowed(request) {
    const configured = Array.isArray(this.config.allowedOrigins) ? this.config.allowedOrigins : [];
    // An unset ALLOWED_ORIGINS narrows to the deployment's own origin rather than
    // opening the server to every site on the internet. With neither set (tests
    // and local development) there is nothing to enforce.
    const allowed = configured.length
      ? configured
      : (this.config.publicOrigin ? [String(this.config.publicOrigin)] : []);
    if (!allowed.length) return true;
    const origin = String(request.headers.origin || "");
    // Origin is a browser-supplied header: a native or scripted client can omit
    // it, and one that omits it could equally well forge an allowed value. The
    // allowlist therefore only keeps *browsers* on other sites from connecting;
    // it is not an authentication boundary, and nothing downstream treats it
    // as one.
    return !origin || allowed.includes(origin);
  }

  getMaxConnections() {
    return Math.max(1, Number(this.config.maxConnections) || DEFAULT_MAX_CONNECTIONS);
  }

  getMaxConnectionsPerIp() {
    return Math.max(1, Number(this.config.maxConnectionsPerIp) || DEFAULT_MAX_CONNECTIONS_PER_IP);
  }

  getMaxSessions() {
    return Math.max(1, Number(this.config.maxSessions) || DEFAULT_MAX_SESSIONS);
  }

  getIdleLobbyTtlMs() {
    return Math.max(25, Number(this.config.idleLobbyTtlMs) || DEFAULT_IDLE_LOBBY_TTL_MS);
  }

  trackActiveConnection(address) {
    const key = String(address || "unknown");
    this.activeConnectionsByIp.set(key, (this.activeConnectionsByIp.get(key) || 0) + 1);
  }

  untrackActiveConnection(address) {
    const key = String(address || "unknown");
    const next = Math.max(0, (this.activeConnectionsByIp.get(key) || 0) - 1);
    if (next) this.activeConnectionsByIp.set(key, next);
    else this.activeConnectionsByIp.delete(key);
  }

  handleUpgrade(request, socket, head) {
    let pathname = "";
    try {
      pathname = new URL(request.url || "/", "http://localhost").pathname;
    } catch (error) {
      pathname = "";
    }
    const forbidden = !this.isOriginAllowed(request);
    const unavailable = this.draining || this.closed;
    const missing = pathname !== this.path;
    const clientAddress = getClientAddress(request, this.config.trustProxy === true, this.config.trustProxyHops);
    const globalCapacityLimited = !forbidden && !unavailable && !missing &&
      this.peers.size >= this.getMaxConnections();
    const ipCapacityLimited = !forbidden && !unavailable && !missing &&
      (this.activeConnectionsByIp.get(clientAddress) || 0) >= this.getMaxConnectionsPerIp();
    let admissionLimited = false;
    if (!forbidden && !unavailable && !missing && !globalCapacityLimited && !ipCapacityLimited) {
      let bucket = this.ipAdmissionBuckets.get(clientAddress);
      if (!bucket) {
        bucket = new TokenBucket(12, 30);
        this.ipAdmissionBuckets.set(clientAddress, bucket);
      }
      admissionLimited = !bucket.take(1);
    }
    if (forbidden || unavailable || missing || globalCapacityLimited || ipCapacityLimited || admissionLimited) {
      this.metricsState.rejectedConnections += 1;
      const status = missing ? "404 Not Found"
        : unavailable ? "503 Service Unavailable"
          : globalCapacityLimited ? "503 Service Unavailable"
            : ipCapacityLimited ? "429 Too Many Requests"
          : admissionLimited ? "429 Too Many Requests"
            : "403 Forbidden";
      try {
        socket.write("HTTP/1.1 " + status + "\r\nConnection: close\r\n\r\n");
      } finally {
        socket.destroy();
      }
      return;
    }
    this.wss.handleUpgrade(request, socket, head, (webSocket) => {
      this.wss.emit("connection", webSocket, request);
    });
  }

  handleConnection(socket, request) {
    const clientAddress = getClientAddress(request, this.config.trustProxy === true, this.config.trustProxyHops);
    const peer = {
      socket,
      request,
      session: null,
      alive: true,
      closed: false,
      superseded: false,
      retired: false,
      clientAddress,
      rate: new TokenBucket(
        this.config.connectionRatePerSecond || 90,
        this.config.connectionBurst || 180
      ),
      outbound: null,
      joinTimer: null,
    };
    peer.outbound = new OutboundQueue(socket, () => {
      safeCloseSocket(socket, 1008, "slow_client");
    });
    peer.joinTimer = setTimeout(() => {
      if (!peer.session) {
        this.sendError(peer, "join_timeout");
        safeCloseSocket(socket, 1008, "join_timeout");
      }
    }, SESSION_JOIN_TIMEOUT_MS);
    if (peer.joinTimer && typeof peer.joinTimer.unref === "function") peer.joinTimer.unref();
    this.peers.add(peer);
    this.trackActiveConnection(clientAddress);
    this.peerBySocket.set(socket, peer);
    this.metricsState.acceptedConnections += 1;
    socket.on("pong", () => { peer.alive = true; });
    socket.on("message", (data, isBinary) => this.handleMessage(peer, data, isBinary));
    socket.on("error", () => {});
    socket.on("close", () => this.handleClose(peer));
    this.send(peer, {
      type: "server.hello",
      protocolVersion: protocol.VERSION,
      reconnectGraceMs: this.config.reconnectGraceMs || protocol.RECONNECT_GRACE_MS,
      regionId: String(this.config.regionId || ""),
      regionLabel: String(this.config.regionLabel || ""),
      serverNow: Date.now(),
    });
  }

  send(peer, message, latestKey) {
    return !!(peer && !peer.closed && peer.outbound && peer.outbound.enqueue(message, latestKey));
  }

  sendError(peer, code, details) {
    return this.send(peer, {
      type: "session.error",
      code: String(code || "unknown_error").slice(0, 80),
      details: details ? String(details).slice(0, 160) : "",
      serverNow: Date.now(),
    });
  }

  parseEnvelope(data, isBinary) {
    if (isBinary) throw new Error("binary_not_supported");
    const text = Buffer.isBuffer(data) ? data.toString("utf8") : String(data || "");
    if (!text || Buffer.byteLength(text) > MAX_ENVELOPE_BYTES) throw new Error("message_too_large");
    const message = JSON.parse(text);
    if (!isPlainObject(message) || typeof message.type !== "string") throw new Error("invalid_message");
    return message;
  }

  handleMessage(peer, data, isBinary) {
    if (!peer || peer.closed) return;
    // A retired peer's session has already been destroyed elsewhere; frames that
    // were sitting in the socket buffer must not resurrect it as a room member.
    if (peer.retired) return;
    // Weighted by size before parsing: a flat one-token charge would let a peer
    // push MAX_ENVELOPE_BYTES frames at the full message budget.
    const frameBytes = Buffer.isBuffer(data) ? data.length : Buffer.byteLength(String(data || ""));
    if (!peer.rate.take(1 + Math.floor(frameBytes / RATE_LIMIT_BYTES_PER_TOKEN))) {
      this.sendError(peer, "rate_limited");
      safeCloseSocket(peer.socket, 1008, "rate_limited");
      return;
    }
    let message;
    try {
      message = this.parseEnvelope(data, isBinary);
    } catch (error) {
      this.sendError(peer, "invalid_message");
      safeCloseSocket(peer.socket, 1008, "invalid_message");
      return;
    }
    this.metricsState.messagesReceived += 1;
    // Answered before a session exists so a client can measure application-level
    // round trip against several regions and only then commit to one of them.
    if (message.type === "session.ping") {
      this.metricsState.pingsAnswered += 1;
      if (peer.session) peer.session.lastSeenAt = Date.now();
      this.send(peer, {
        type: "session.pong",
        nonce: typeof message.nonce === "string" ? message.nonce.slice(0, 64) : "",
        clientTime: Number.isFinite(Number(message.clientTime)) ? Number(message.clientTime) : 0,
        regionId: String(this.config.regionId || ""),
        serverNow: Date.now(),
      });
      return;
    }
    if (!peer.session) {
      if (message.type !== "session.join") {
        this.sendError(peer, "session_required");
        return;
      }
      this.joinSession(peer, message);
      return;
    }
    peer.session.lastSeenAt = Date.now();
    if (message.type === "room.ready") {
      this.setReady(peer, message);
    } else if (message.type === "queue.leave") {
      this.leaveQueue(peer);
    } else if (message.type === "queue.join") {
      this.joinQueue(peer, message.searchCode);
    } else if (message.type === "game") {
      this.handleGameEnvelope(peer, message);
    } else if (message.type === "match.leave") {
      this.leaveActiveMatch(peer);
    } else {
      // An unknown type is a broken or hostile client, not a recoverable state:
      // answering forever would let it hold the connection open for free.
      this.sendError(peer, "unsupported_message");
      safeCloseSocket(peer.socket, 1008, "unsupported_message");
    }
  }

  leaveActiveMatch(peer) {
    const session = peer && peer.session;
    const room = session ? this.matchmaker.getRoomForPlayer(session.playerId) : null;
    if (!room || (room.phase !== "match" && room.phase !== "ended")) {
      this.sendError(peer, "match_not_running");
      return false;
    }
    const matchId = room.matchId;
    this.removePlayerFromRoom(session, room, "match_left", true);
    this.send(peer, { type: "match.left", matchId, serverNow: Date.now() });
    this.retireSession(peer, session);
    safeCloseSocket(peer.socket, 1000, "match_left");
    return true;
  }

  // Destroying a session while the peer still points at it lets any frame already
  // buffered on the socket act as that player again — most damagingly by joining
  // a fresh room that no session can ever be resolved back to, which then sits in
  // public matchmaking forever. Retiring detaches both directions at once.
  retireSession(peer, session) {
    if (peer) {
      peer.superseded = true;
      peer.retired = true;
      peer.session = null;
    }
    if (session) this.sessionStore.delete(session.id);
  }

  removePlayerFromRoom(session, room, reason, disconnectWorker) {
    if (!session || !room || !room.players.has(session.playerId)) return false;
    const matchId = String(room.matchId || "");
    const isLastPlayer = room.size <= 1;
    if (disconnectWorker && !isLastPlayer && matchId) {
      const worker = this.workerManager.get(matchId);
      if (worker) Promise.resolve(worker.disconnect(session.playerId)).catch(() => {});
    }
    const removed = this.matchmaker.leave(session.playerId, reason || "player_left");
    if (removed) session.roomId = "";
    return removed;
  }

  joinSession(peer, message) {
    if (!protocol.isProtocolVersion(message.protocolVersion)) {
      this.sendError(peer, "version_mismatch", String(protocol.VERSION));
      safeCloseSocket(peer.socket, 1008, "version_mismatch");
      return;
    }
    const hasResume = !!(message.sessionId || message.resumeToken);
    let resumed = false;
    let result = null;
    if (hasResume) {
      if (!message.sessionId || !message.resumeToken) {
        this.sendError(peer, "session_expired");
        safeCloseSocket(peer.socket, 1008, "session_expired");
        return;
      }
      result = this.sessionStore.resume(message.sessionId, message.resumeToken);
      if (!result) {
        this.sendError(peer, "session_expired");
        safeCloseSocket(peer.socket, 1008, "session_expired");
        return;
      }
      resumed = true;
      this.metricsState.sessionsResumed += 1;
    } else {
      if (this.sessionStore.sessions.size >= this.getMaxSessions()) {
        this.sendError(peer, "server_capacity");
        safeCloseSocket(peer.socket, 1013, "server_capacity");
        return;
      }
      result = this.sessionStore.create({
        name: message.name,
        unlocks: sanitizeProfile(message.unlocks),
        cosmetics: sanitizeProfile(message.cosmetics),
      });
      this.metricsState.sessionsCreated += 1;
    }

    const session = result.session;
    if (session.expiryTimer) clearTimeout(session.expiryTimer);
    session.expiryTimer = null;
    if (resumed) {
      session.name = protocol.normalizePlayerName(message.name || session.name);
      const unlocks = sanitizeProfile(message.unlocks);
      const cosmetics = sanitizeProfile(message.cosmetics);
      if (unlocks) session.unlocks = unlocks;
      if (cosmetics) session.cosmetics = cosmetics;
    }
    const previousSocket = session.socket;
    if (previousSocket && previousSocket !== peer.socket) {
      const previousPeer = this.peerBySocket.get(previousSocket);
      if (previousPeer) previousPeer.superseded = true;
      safeCloseSocket(previousSocket, 4001, "session_replaced");
    }
    session.socket = peer.socket;
    session.connected = true;
    session.disconnectedAt = 0;
    session.connectionEpoch += 1;
    session.lastSeenAt = Date.now();
    peer.session = session;
    if (peer.joinTimer) clearTimeout(peer.joinTimer);
    peer.joinTimer = null;
    const room = this.matchmaker.getRoomForPlayer(session.playerId);
    this.send(peer, {
      type: "session.welcome",
      protocolVersion: protocol.VERSION,
      sessionId: session.id,
      resumeToken: result.resumeToken,
      playerId: session.playerId,
      connectionEpoch: session.connectionEpoch,
      reconnectGraceMs: this.config.reconnectGraceMs || protocol.RECONNECT_GRACE_MS,
      resumed,
      // Lets a resumed client distinguish "your room is coming" from "you have
      // no room" without waiting on a room.state that would never arrive.
      roomId: resumed && room ? room.id : "",
      serverNow: Date.now(),
    });

    if (resumed && room) {
      const roomPlayer = room.players.get(session.playerId);
      if (roomPlayer) {
        roomPlayer.name = session.name;
        roomPlayer.unlocks = session.unlocks;
        roomPlayer.cosmetics = session.cosmetics;
      }
      room.setConnected(session.playerId, true);
      session.roomId = room.id;
      if (room.phase === "match" && room.matchId) {
        // A client that still holds this match's state names it in session.join;
        // one that reloaded cannot. The fresh page needs its counters reset on
        // the authority and the start sequence replayed, or it would sit in the
        // lobby watching a match it can no longer enter.
        const continuing = String(message.resumeMatchId || "") === room.matchId;
        const worker = this.workerManager.get(room.matchId);
        if (worker) Promise.resolve(worker.reconnect(session.playerId, !continuing)).catch(() => {});
        if (!continuing) this.replayMatchStart(peer, room);
      }
      this.metricsState.reconnects += 1;
      this.broadcastRoom(room);
      return;
    }
    session.roomId = "";
    // Only a NEW session is auto-queued (the client undoes it if the player
    // canceled mid-handshake). A resumed session with no room is a reloaded
    // page sitting in the lobby — throwing it into the public queue would
    // matchmake a player who never asked.
    if (!resumed) this.joinQueue(peer, message.searchCode);
  }

  // Re-sends the committed match's startPrepare/start pair to one rejoining
  // peer. The legacy guest flow rebuilds the map from the same seed, answers
  // with a startAck (absorbed by acceptStartAck as a rejoin ack), and the
  // worker's forced keyframe then fills the world back in.
  replayMatchStart(peer, room) {
    if (!room || room.phase !== "match" || !room.matchId) return false;
    const base = {
      authority: "server",
      startId: room.matchId,
      version: protocol.VERSION,
      mapSeed: room.mapSeed,
      hostPlayerId: Array.from(room.players.keys())[0] || "",
      players: publicRoster(room),
    };
    let prepare;
    let start;
    try {
      prepare = encodeGameMessage(Object.assign({ type: "startPrepare" }, base));
      start = encodeGameMessage(Object.assign({ type: "start" }, base));
    } catch (error) {
      this.log("warn", "match_replay_encode_failed", {
        roomId: room.id,
        matchId: room.matchId,
        error: error && error.message || "unknown",
      });
      return false;
    }
    this.send(peer, { type: "game", data: prepare, latestKind: "" });
    this.send(peer, { type: "game", data: start, latestKind: "" });
    return true;
  }

  createPlayerForSession(session) {
    return {
      id: session.playerId,
      name: session.name,
      ready: false,
      connected: true,
      unlocks: session.unlocks,
      cosmetics: session.cosmetics,
    };
  }

  joinQueue(peer, searchCode) {
    const session = peer && peer.session;
    if (!session) return false;
    const existing = this.matchmaker.getRoomForPlayer(session.playerId);
    if (existing) {
      this.sendError(peer, "already_in_room");
      this.broadcastRoom(existing);
      return false;
    }
    const room = this.matchmaker.join(this.createPlayerForSession(session), searchCode);
    session.roomId = room.id;
    this.send(peer, {
      type: "queue.joined",
      roomId: room.id,
      searchCode: room.searchCode,
      serverNow: Date.now(),
    });
    this.broadcastRoom(room);
    return true;
  }

  leaveQueue(peer) {
    const session = peer && peer.session;
    if (!session) return false;
    const room = this.matchmaker.getRoomForPlayer(session.playerId);
    if (room && (room.phase === "preparing" || room.phase === "match")) {
      this.sendError(peer, "room_locked");
      return false;
    }
    if (room) this.removePlayerFromRoom(
      session,
      room,
      "queue_left",
      room.phase === "ended"
    );
    session.roomId = "";
    this.send(peer, { type: "queue.left", serverNow: Date.now() });
    return true;
  }

  setReady(peer, message) {
    const session = peer && peer.session;
    const room = session ? this.matchmaker.getRoomForPlayer(session.playerId) : null;
    if (!room || room.phase !== "lobby") {
      this.sendError(peer, "room_unavailable");
      return false;
    }
    if (typeof message.ready !== "boolean") {
      this.sendError(peer, "invalid_ready_state");
      return false;
    }
    const unlocks = sanitizeProfile(message.unlocks);
    const cosmetics = sanitizeProfile(message.cosmetics);
    if (unlocks) session.unlocks = unlocks;
    if (cosmetics) session.cosmetics = cosmetics;
    const changed = this.matchmaker.setReady(session.playerId, message.ready, {
      unlocks: session.unlocks,
      cosmetics: session.cosmetics,
    });
    if (!changed) {
      this.sendError(peer, "ready_rejected");
      return false;
    }
    // setReady intentionally avoids a revision for an idempotent intent. Send
    // the current snapshot anyway so the client's pending button always clears.
    this.broadcastRoom(room);
    return true;
  }

  handleRoomState(room) {
    if (!room || room.disposed) return;
    this.broadcastRoom(room);
  }

  clearIdleLobbyTimer(roomId) {
    const id = String(roomId || "");
    const entry = this.idleLobbyTimers.get(id);
    if (!entry) return false;
    if (entry.timer) clearTimeout(entry.timer);
    this.idleLobbyTimers.delete(id);
    return true;
  }

  scheduleIdleLobbyTimer(entry, delayMs) {
    if (!entry) return;
    if (entry.timer) clearTimeout(entry.timer);
    entry.timer = setTimeout(() => {
      if (this.idleLobbyTimers.get(entry.roomId) !== entry) return;
      entry.timer = null;
      this.expireIdleLobby(entry.roomId, entry.playerId);
    }, Math.max(25, Number(delayMs) || 25));
    if (entry.timer && typeof entry.timer.unref === "function") entry.timer.unref();
  }

  refreshIdleLobbyTimer(room) {
    if (!room || room.disposed || room.phase !== "lobby" || room.size !== 1) {
      if (room) this.clearIdleLobbyTimer(room.id);
      return false;
    }
    const player = Array.from(room.players.values())[0];
    const session = player ? this.sessionStore.getByPlayerId(player.id) : null;
    if (!player || player.connected === false || !session || !session.connected) {
      this.clearIdleLobbyTimer(room.id);
      return false;
    }
    const now = Date.now();
    let entry = this.idleLobbyTimers.get(room.id);
    if (!entry || entry.playerId !== player.id) {
      this.clearIdleLobbyTimer(room.id);
      entry = {
        roomId: room.id,
        playerId: player.id,
        lastActivityAt: now,
        timer: null,
      };
      this.idleLobbyTimers.set(room.id, entry);
    } else {
      entry.lastActivityAt = Math.max(entry.lastActivityAt, Number(session.lastSeenAt) || 0);
    }
    const remaining = this.getIdleLobbyTtlMs() - Math.max(0, now - entry.lastActivityAt);
    this.scheduleIdleLobbyTimer(entry, remaining);
    return true;
  }

  expireIdleLobby(roomId, playerId) {
    const entry = this.idleLobbyTimers.get(String(roomId || ""));
    const room = this.matchmaker.getRoom(roomId);
    if (
      !entry ||
      entry.playerId !== playerId ||
      !room ||
      room.disposed ||
      room.phase !== "lobby" ||
      room.size !== 1 ||
      !room.players.has(playerId)
    ) {
      this.clearIdleLobbyTimer(roomId);
      return false;
    }
    const player = room.players.get(playerId);
    const session = this.sessionStore.getByPlayerId(playerId);
    if (!player || player.connected === false || !session || !session.connected) {
      // A disconnected session is owned exclusively by reconnectGraceMs and
      // must never be evicted by an older lobby-idle deadline.
      this.clearIdleLobbyTimer(roomId);
      return false;
    }
    const now = Date.now();
    entry.lastActivityAt = Math.max(entry.lastActivityAt, Number(session.lastSeenAt) || 0);
    const idleFor = Math.max(0, now - entry.lastActivityAt);
    const ttlMs = this.getIdleLobbyTtlMs();
    if (idleFor < ttlMs) {
      this.scheduleIdleLobbyTimer(entry, ttlMs - idleFor);
      return false;
    }
    this.clearIdleLobbyTimer(roomId);
    const peer = session.socket ? this.peerBySocket.get(session.socket) : null;
    if (peer) {
      this.send(peer, {
        type: "session.error",
        code: "idle_lobby_timeout",
        details: "",
        fatal: true,
        serverNow: now,
      });
    }
    this.removePlayerFromRoom(session, room, "idle_lobby_timeout", false);
    this.retireSession(peer, session);
    if (peer) safeCloseSocket(peer.socket, 1008, "idle_lobby_timeout");
    this.metricsState.idleLobbyExpirations += 1;
    this.log("info", "idle_lobby_expired", { roomId, playerId });
    return true;
  }

  handleRoomRemoved(room, reason) {
    if (!room) return;
    this.clearIdleLobbyTimer(room.id);
    this.recentMatches.delete(room.id);
    const returnTimer = this.returnTimers.get(room.id);
    if (returnTimer) clearTimeout(returnTimer.timer);
    this.returnTimers.delete(room.id);
    const matchIds = new Set();
    if (room.matchId) matchIds.add(room.matchId);
    const pending = this.pendingStarts.get(room.id);
    if (pending) {
      pending.cancelled = true;
      if (pending.timer) clearTimeout(pending.timer);
      this.pendingStarts.delete(room.id);
      if (pending.matchId) matchIds.add(pending.matchId);
    }
    for (const matchId of matchIds) {
      Promise.resolve(this.workerManager.closeMatch(matchId)).catch(() => {});
    }
    // A room is removed every time its last player leaves, so at info level a
    // client cycling queue.join/queue.leave would write the disk full for free.
    this.log(room.matchId ? "info" : "debug", "room_removed", {
      roomId: room.id,
      matchId: room.matchId || "",
      reason: String(reason || "room_removed"),
    });
  }

  broadcastRoom(room) {
    if (!room || room.disposed) return;
    this.refreshIdleLobbyTimer(room);
    const snapshot = room.snapshot();
    const envelope = {
      type: "room.state",
      room: snapshot,
      serverNow: snapshot.serverNow,
    };
    for (const player of room.players.values()) {
      const session = this.sessionStore.getByPlayerId(player.id);
      const peer = session && session.socket ? this.peerBySocket.get(session.socket) : null;
      if (peer && session.connected) this.send(peer, envelope, "room.state");
    }
  }

  prepareMatch(room) {
    if (!room || room.disposed || room.phase !== "preparing") return false;
    if (this.pendingStarts.has(room.id)) return false;
    const players = Array.from(room.players.values());
    if (players.length < protocol.MIN_PLAYERS || players.some((player) => player.connected === false || !player.ready)) {
      room.failStart("roster_not_ready");
      return false;
    }
    const startId = randomId("match");
    const pending = {
      roomId: room.id,
      // The legacy client protocol names the committed match after startId.
      // Keep one server-generated id across prepare, worker and gameplay.
      startId,
      matchId: startId,
      mapSeed: randomMapSeed(),
      hostPlayerId: players[0].id,
      playerIds: players.map((player) => player.id),
      acks: new Set(),
      committing: false,
      cancelled: false,
      timer: null,
    };
    this.pendingStarts.set(room.id, pending);
    const prepareMessage = {
      type: "startPrepare",
      authority: "server",
      startId: pending.startId,
      version: protocol.VERSION,
      mapSeed: pending.mapSeed,
      hostPlayerId: pending.hostPlayerId,
      players: publicRoster(room),
    };
    let data;
    try {
      data = encodeGameMessage(prepareMessage);
    } catch (error) {
      // A roster too large to encode is a bad room, not a bad server: fail the
      // start instead of letting the throw unwind into the socket handler.
      this.abortPreparation(room, error && error.message || "match_payload_too_large");
      return false;
    }
    for (const player of players) this.sendGameToPlayer(room, player.id, data, "");
    const timeoutMs = Math.max(1000, Number(this.config.startAckTimeoutMs) || protocol.START_ACK_TIMEOUT_MS);
    pending.timer = setTimeout(() => this.abortPreparation(room, "start_ack_timeout"), timeoutMs);
    if (pending.timer && typeof pending.timer.unref === "function") pending.timer.unref();
    this.broadcastRoom(room);
    return true;
  }

  abortPreparation(room, reason) {
    if (!room) return false;
    const pending = this.pendingStarts.get(room.id);
    if (pending) {
      pending.cancelled = true;
      if (pending.timer) clearTimeout(pending.timer);
      pending.timer = null;
      this.pendingStarts.delete(room.id);
      Promise.resolve(this.workerManager.closeMatch(pending.matchId)).catch(() => {});
    }
    if (room.phase === "preparing") room.failStart(reason || "match_start_failed");
    this.metricsState.matchStartFailures += 1;
    this.broadcastRoom(room);
    return true;
  }

  handleGameEnvelope(peer, envelope) {
    const session = peer && peer.session;
    const room = session ? this.matchmaker.getRoomForPlayer(session.playerId) : null;
    if (!room || typeof envelope.data !== "string") {
      this.sendError(peer, "invalid_game_message");
      return;
    }
    let message;
    try {
      message = decodeGameMessage(envelope.data);
    } catch (error) {
      this.sendError(peer, "invalid_game_message");
      return;
    }
    if (!CLIENT_GAME_TYPES.has(message.type)) {
      this.sendError(peer, "forbidden_game_message");
      return;
    }
    if (message.type === "hello") {
      const unlocks = sanitizeProfile(message.unlocks);
      const cosmetics = sanitizeProfile(message.cosmetics);
      if (unlocks) session.unlocks = unlocks;
      if (cosmetics) session.cosmetics = cosmetics;
      return;
    }
    if (message.type === "startAck") {
      this.acceptStartAck(peer, room, message);
      return;
    }
    // A late ack for the match this room just finished is expected traffic, not a
    // client error: swallow it quietly instead of pushing the lobby into an
    // error state the player never caused.
    if (POST_MATCH_GAME_TYPES.has(message.type) && this.isRecentMatch(room.id, message.matchId)) return;
    const canRouteRunning = room.phase === "match";
    const canRoutePostMatch = room.phase === "ended" && POST_MATCH_GAME_TYPES.has(message.type);
    if ((!canRouteRunning && !canRoutePostMatch) || !room.matchId) {
      this.sendError(peer, "match_not_running");
      return;
    }
    if (String(message.matchId || "") !== room.matchId) {
      this.sendError(peer, "match_mismatch");
      return;
    }
    const worker = this.workerManager.get(room.matchId);
    if (!worker || !worker.receiveWire(session.playerId, envelope.data, message.type)) {
      this.sendError(peer, "match_unavailable");
    }
  }

  acceptStartAck(peer, room, message) {
    const session = peer.session;
    const pending = this.pendingStarts.get(room.id);
    if (!pending || room.phase !== "preparing" || message.startId !== pending.startId) {
      // A rejoining client acknowledges the replayed start of the match that is
      // already running; that is expected traffic, not a protocol violation.
      if (room.phase === "match" && String(message.startId || "") === room.matchId) return true;
      this.sendError(peer, "start_not_pending");
      return false;
    }
    if (!pending.playerIds.includes(session.playerId)) {
      this.sendError(peer, "start_not_pending");
      return false;
    }
    const player = room.players.get(session.playerId);
    if (player) {
      const unlocks = sanitizeProfile(message.unlocks);
      const cosmetics = sanitizeProfile(message.cosmetics);
      if (unlocks) {
        session.unlocks = unlocks;
        player.unlocks = unlocks;
      }
      if (cosmetics) {
        session.cosmetics = cosmetics;
        player.cosmetics = cosmetics;
      }
    }
    pending.acks.add(session.playerId);
    if (pending.playerIds.every((playerId) => pending.acks.has(playerId))) {
      this.commitMatch(room, pending).catch((error) => {
        this.log("error", "match_start_failed", { roomId: room.id, error: error && error.message });
        // Only this invocation's own preparation may be torn down. A newer
        // attempt can already own the room by the time an old commit rejects.
        if (this.pendingStarts.get(room.id) === pending && room.phase === "preparing") {
          this.abortPreparation(room, error && error.message || "match_start_failed");
        } else if (room.matchId === pending.matchId) {
          // The failure landed after the room was already committed, so there is
          // no preparation left to abort — retire the match instead of leaving
          // the room wedged with a live worker nobody is talking to.
          this.failCommittedMatch(room, pending.matchId, error && error.message || "match_start_failed");
        }
      });
    }
    return true;
  }

  failCommittedMatch(room, matchId, reason) {
    if (!room || room.matchId !== matchId) return false;
    this.metricsState.matchStartFailures += 1;
    this.log("error", "match_commit_failed", { roomId: room.id, matchId, reason: String(reason || "") });
    if (room.phase === "match") room.markMatchEnded();
    this.scheduleReturnToLobby(room, matchId);
    return true;
  }

  async commitMatch(room, pending) {
    if (!pending || pending.committing || pending.cancelled) return false;
    pending.committing = true;
    if (pending.timer) clearTimeout(pending.timer);
    pending.timer = null;
    const roster = publicRoster(room).map((player) => ({
      id: player.id,
      endpointId: player.id,
      name: player.name,
      unlocks: player.unlocks,
      cosmetics: player.cosmetics,
    }));
    let worker;
    try {
      worker = await this.workerManager.createMatch({
        matchId: pending.matchId,
        startId: pending.matchId,
        mapSeed: pending.mapSeed,
        players: roster,
        onPacket: (packet) => this.handleWorkerPacket(room.id, pending.matchId, packet),
        onFatal: (error) => this.handleWorkerFatal(room.id, pending.matchId, error),
      });
    } catch (error) {
      if (!pending.cancelled) this.abortPreparation(room, error && error.message || "match_start_failed");
      return false;
    }
    if (
      pending.cancelled ||
      this.pendingStarts.get(room.id) !== pending ||
      room.phase !== "preparing" ||
      pending.playerIds.some((playerId) => {
        const player = room.players.get(playerId);
        return !player || player.connected === false;
      })
    ) {
      await Promise.resolve(this.workerManager.closeMatch(pending.matchId)).catch(() => {});
      // Abort only if this invocation still owns the room's preparation: a newer
      // attempt may already have replaced it while createMatch was in flight.
      if (this.pendingStarts.get(room.id) === pending && room.phase === "preparing") {
        this.abortPreparation(room, "roster_changed");
      }
      return false;
    }
    const startMessage = {
      type: "start",
      authority: "server",
      startId: pending.matchId,
      version: protocol.VERSION,
      mapSeed: pending.mapSeed,
      hostPlayerId: pending.hostPlayerId,
      players: publicRoster(room),
    };
    // Encoded before the room is committed so an oversized roster fails the start
    // cleanly instead of stranding a started match nobody was told about.
    let data;
    try {
      data = encodeGameMessage(startMessage);
    } catch (error) {
      this.abortPreparation(room, error && error.message || "match_payload_too_large");
      return false;
    }
    this.pendingStarts.delete(room.id);
    room.markMatchStarted(pending.matchId, pending.mapSeed);
    for (const playerId of pending.playerIds) this.sendGameToPlayer(room, playerId, data, "");
    this.metricsState.matchesStarted += 1;
    this.broadcastRoom(room);
    return !!worker;
  }

  sendGameToPlayer(room, playerId, data, latestKind) {
    if (!room || !room.players.has(playerId)) return false;
    const session = this.sessionStore.getByPlayerId(playerId);
    const peer = session && session.socket ? this.peerBySocket.get(session.socket) : null;
    if (!peer || !session.connected) return false;
    return this.send(
      peer,
      { type: "game", data, latestKind: latestKind || "" },
      latestKind === "snapshot" ? "game.snapshot" : ""
    );
  }

  handleWorkerPacket(roomId, matchId, packet) {
    const room = this.matchmaker.getRoom(roomId);
    if (!room || room.matchId !== matchId || !packet || !packet.endpointId || !packet.data) return false;
    let message;
    try {
      message = decodeGameMessage(packet.data);
    } catch (error) {
      this.handleWorkerFatal(roomId, matchId, new Error("invalid_worker_packet"));
      return false;
    }
    const latestKind = packet.latestOnly || packet.latestKind === "snapshot" || message.type === "snapshot"
      ? "snapshot"
      : "";
    const sent = this.sendGameToPlayer(room, String(packet.endpointId), packet.data, latestKind);
    if (message.type === "matchEnd" && room.phase === "match") {
      room.markMatchEnded();
      // Fallback so players idling on the results screen cannot hold the room in
      // "ended" and its Chromium worker forever. A real return click replaces
      // this with the short timer.
      this.scheduleReturnToLobby(room, matchId, this.getPostMatchAutoReturnMs());
      this.broadcastRoom(room);
    } else if (message.type === "returnLobby") {
      this.scheduleReturnToLobby(room, matchId);
    }
    return sent;
  }

  handleWorkerFatal(roomId, matchId, error) {
    const room = this.matchmaker.getRoom(roomId);
    if (!room || room.matchId !== matchId) return;
    this.log("error", "authoritative_match_failed", {
      roomId,
      matchId,
      error: error && error.message || "unknown",
    });
    // This runs from a worker callback, so an encode failure here must never
    // escape: the room is already broken, and the players still need telling.
    let matchEnd = "";
    let returnLobby = "";
    try {
      matchEnd = encodeGameMessage({
        type: "matchEnd",
        version: protocol.VERSION,
        mapSeed: room.mapSeed,
        matchId,
        winnerIds: [],
        reason: "serverError",
      });
      returnLobby = encodeGameMessage({
        type: "returnLobby",
        version: protocol.VERSION,
        mapSeed: room.mapSeed,
        matchId,
        hostPlayerId: Array.from(room.players.keys())[0] || "",
        players: publicRoster(room),
      });
    } catch (encodeError) {
      this.log("error", "match_teardown_encode_failed", {
        roomId,
        matchId,
        error: encodeError && encodeError.message || "unknown",
      });
    }
    for (const player of room.players.values()) {
      if (matchEnd) this.sendGameToPlayer(room, player.id, matchEnd, "");
      if (returnLobby) this.sendGameToPlayer(room, player.id, returnLobby, "");
      const session = this.sessionStore.getByPlayerId(player.id);
      const peer = session && session.socket ? this.peerBySocket.get(session.socket) : null;
      if (peer) this.sendError(peer, "match_failed");
    }
    if (room.phase === "match") room.markMatchEnded();
    this.scheduleReturnToLobby(room, matchId);
  }

  // A later call with an earlier deadline replaces the pending timer, so the
  // slow post-match fallback never delays a player who actually clicked return.
  scheduleReturnToLobby(room, matchId, delayMs) {
    if (!room) return;
    const delay = Math.max(25, Number(delayMs) || RETURN_TO_LOBBY_DELAY_MS);
    const firesAt = Date.now() + delay;
    const existing = this.returnTimers.get(room.id);
    if (existing) {
      if (existing.firesAt <= firesAt) return;
      clearTimeout(existing.timer);
      this.returnTimers.delete(room.id);
    }
    const timer = setTimeout(() => {
      this.returnTimers.delete(room.id);
      this.returnRoomToLobby(room, matchId).catch(() => {});
    }, delay);
    if (timer && typeof timer.unref === "function") timer.unref();
    this.returnTimers.set(room.id, { timer, firesAt });
  }

  getPostMatchAutoReturnMs() {
    return Math.max(1000, Number(this.config.postMatchAutoReturnMs) || DEFAULT_POST_MATCH_AUTO_RETURN_MS);
  }

  isRecentMatch(roomId, matchId) {
    const id = String(matchId || "");
    if (!id) return false;
    const entry = this.recentMatches.get(String(roomId || ""));
    if (!entry) return false;
    if (entry.until <= Date.now()) {
      this.recentMatches.delete(String(roomId || ""));
      return false;
    }
    return entry.matchId === id;
  }

  async returnRoomToLobby(room, matchId) {
    if (!room || room.disposed || room.matchId !== matchId) return false;
    for (const player of Array.from(room.players.values())) {
      const session = this.sessionStore.getByPlayerId(player.id);
      if (!session || !session.connected) {
        if (session) session.roomId = "";
        this.matchmaker.leave(player.id, "expired_player_removed");
      }
    }
    if (!room.size) return true;
    await Promise.resolve(this.workerManager.closeMatch(matchId)).catch(() => {});
    this.recentMatches.set(room.id, { matchId, until: Date.now() + POST_MATCH_GRACE_MS });
    room.returnToLobby();
    this.broadcastRoom(room);
    return true;
  }

  handleClose(peer) {
    if (!peer || peer.closed) return;
    peer.closed = true;
    if (peer.joinTimer) clearTimeout(peer.joinTimer);
    peer.joinTimer = null;
    if (peer.outbound) peer.outbound.close();
    this.peers.delete(peer);
    this.untrackActiveConnection(peer.clientAddress);
    const session = peer.session;
    if (!session || peer.superseded || session.socket !== peer.socket) return;
    session.socket = null;
    session.connected = false;
    session.disconnectedAt = Date.now();
    const room = this.matchmaker.getRoomForPlayer(session.playerId);
    if (room) {
      room.setConnected(session.playerId, false);
      if (room.phase === "preparing") this.abortPreparation(room, "player_disconnected");
      this.broadcastRoom(room);
    }
    const graceMs = Math.max(1000, Number(this.config.reconnectGraceMs) || protocol.RECONNECT_GRACE_MS);
    session.expiryTimer = setTimeout(() => this.expireSession(session.id, session.connectionEpoch), graceMs);
    if (session.expiryTimer && typeof session.expiryTimer.unref === "function") session.expiryTimer.unref();
  }

  expireSession(sessionId, expectedEpoch) {
    const session = this.sessionStore.get(sessionId);
    if (!session || session.connected || session.connectionEpoch !== expectedEpoch) return false;
    session.expiryTimer = null;
    const room = this.matchmaker.getRoomForPlayer(session.playerId);
    if (room) this.removePlayerFromRoom(
      session,
      room,
      "reconnect_expired",
      room.phase === "match" || room.phase === "ended"
    );
    this.sessionStore.delete(session.id);
    return true;
  }

  heartbeat() {
    for (const peer of this.peers) {
      if (peer.closed) continue;
      if (!peer.alive) {
        try { peer.socket.terminate(); } catch (error) {}
        continue;
      }
      peer.alive = false;
      try { peer.socket.ping(); } catch (error) { try { peer.socket.terminate(); } catch (ignored) {} }
    }
    const now = Date.now();
    const staleBefore = now - 2 * 60 * 1000;
    for (const [address, bucket] of this.ipAdmissionBuckets) {
      if (bucket.updatedAt < staleBefore) this.ipAdmissionBuckets.delete(address);
    }
    for (const [roomId, entry] of this.recentMatches) {
      if (entry.until <= now) this.recentMatches.delete(roomId);
    }
  }

  readiness() {
    const worker = this.workerManager.readiness();
    return Object.assign({}, worker, {
      ready: !this.draining && !this.closed && worker.ready !== false,
      acceptingConnections: !this.draining && !this.closed,
    });
  }

  // Codes of rooms that a newcomer could still be placed into. The director uses
  // this as ground truth for search-code stickiness, so two friends typing the
  // same code always land in the same region even when their latency differs.
  openSearchCodes(limit) {
    const maximum = Math.max(1, Number(limit) || 512);
    const codes = new Set();
    for (const room of this.matchmaker.rooms.values()) {
      if (codes.size >= maximum) break;
      if (!room.searchCode || !room.canJoin()) continue;
      codes.add(room.searchCode);
    }
    return Array.from(codes);
  }

  playerCount() {
    let total = 0;
    for (const room of this.matchmaker.rooms.values()) total += room.size;
    return total;
  }

  regionSnapshot() {
    const worker = this.workerManager.readiness();
    return {
      protocolVersion: protocol.VERSION,
      ready: !this.closed && worker.ready !== false,
      accepting: !this.draining && !this.closed,
      activeMatches: Number(worker.activeMatches) || 0,
      maxMatches: Number(worker.maxMatches) || 0,
      connections: this.peers.size,
      maxConnections: this.getMaxConnections(),
      players: this.playerCount(),
      codes: this.openSearchCodes(),
    };
  }

  metrics() {
    return Object.assign({}, this.metricsState, {
      activeConnections: this.peers.size,
      maxConnections: this.getMaxConnections(),
      maxConnectionsPerIp: this.getMaxConnectionsPerIp(),
      activeSessions: this.sessionStore.sessions.size,
      maxSessions: this.getMaxSessions(),
      rooms: this.matchmaker.rooms.size,
      idleLobbyTimers: this.idleLobbyTimers.size,
      pendingStarts: this.pendingStarts.size,
      worker: this.workerManager.readiness(),
    });
  }

  async close() {
    if (this.closed) return;
    this.draining = true;
    this.closed = true;
    this.httpServer.removeListener("upgrade", this.upgradeHandler);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
    for (const entry of this.returnTimers.values()) clearTimeout(entry.timer);
    this.returnTimers.clear();
    this.recentMatches.clear();
    for (const entry of this.idleLobbyTimers.values()) {
      if (entry.timer) clearTimeout(entry.timer);
    }
    this.idleLobbyTimers.clear();
    for (const pending of this.pendingStarts.values()) {
      pending.cancelled = true;
      if (pending.timer) clearTimeout(pending.timer);
    }
    this.pendingStarts.clear();
    const closingPeers = Array.from(this.peers);
    for (const peer of closingPeers) {
      safeCloseSocket(peer.socket, 1001, "server_shutdown");
      peer.closed = true;
      if (peer.outbound) peer.outbound.close();
    }
    this.peers.clear();
    const closePromise = new Promise((resolve) => this.wss.close(() => resolve("closed")));
    const closeResult = await waitWithTimeout(closePromise, 1500, "timeout");
    if (closeResult === "timeout") {
      for (const peer of closingPeers) {
        try { peer.socket.terminate(); } catch (error) {}
      }
      await waitWithTimeout(closePromise, 250, "timeout");
    }
    this.ipAdmissionBuckets.clear();
    this.activeConnectionsByIp.clear();
    this.matchmaker.dispose();
    this.sessionStore.dispose();
  }
}

module.exports = {
  CLIENT_GAME_TYPES,
  MAX_ENVELOPE_BYTES,
  ONLINE_PATH,
  OnlineMultiplayerServer,
  OutboundQueue,
  getClientAddress,
  isPlainObject,
  randomMapSeed,
  sanitizeProfile,
  waitWithTimeout,
};
