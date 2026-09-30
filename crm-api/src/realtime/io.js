import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { jwtVerify, createRemoteJWKSet } from 'jose';
import config from '../config.js';
import { logger } from '../logger.js';
import { redis } from '../redis.js';
import { chatSendSchema } from '@propflow/shared';
import { ChatMessage, PropertyNote } from '../models.js';
import { getPropertyScopedForSocket } from './authz.js';

const JWKS = createRemoteJWKSet(new URL(config.authJwksUrl), { cache: true, cacheMaxAge: 10 * 60 * 1000 });

export let io = null;

export async function attachRealtime(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: config.corsOrigin, credentials: true },
    transports: ['websocket'],
  });

  const pub = redis.duplicate();
  const sub = redis.duplicate();
  await Promise.all([pub.connect(), sub.connect()]);
  io.adapter(createAdapter(pub, sub));

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('unauthorized'));
      const { payload } = await jwtVerify(token, JWKS, { issuer: config.jwtIssuer, audience: config.jwtAudience });
      socket.data.user = { sub: payload.sub, tid: payload.tid ?? null, role: payload.role };
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const user = socket.data.user;
    socket.join(`user:${user.sub}`);
    socket.data.properties = new Set();

    socket.on('property:join', async ({ propertyId }, ack) => {
      try {
        const p = await getPropertyScopedForSocket(propertyId, user);
        const room = `property:${p.id}`;
        socket.join(room);
        socket.data.properties.add(String(p.id));
        const presenceKey = `presence:property:${p.id}`;
        await redis.hset(presenceKey, user.sub, JSON.stringify({ name: socket.data.name ?? user.sub, at: Date.now() }));
        await redis.expire(presenceKey, 300);
        const members = await redis.hkeys(presenceKey);
        const recent = await ChatMessage.findAll({
          where: { propertyId: p.id },
          order: [['created_at', 'DESC']],
          limit: 50,
        });
        const ackPayload = {
          ok: true,
          messages: recent.reverse().map(hydrateMessage),
          online: members,
        };
        if (typeof ack === 'function') ack(ackPayload);
        io.to(room).emit('presence:update', { online: members });
      } catch (err) {
        if (typeof ack === 'function') ack({ ok: false, error: err.message ?? 'forbidden' });
      }
    });

    socket.on('chat:send', async (payload, ack) => {
      try {
        const data = chatSendSchema.parse(payload);
        const room = `property:${Number(data.propertyId)}`;
        if (!socket.data.properties?.has(String(Number(data.propertyId)))) {
          throw new Error('join the property room first');
        }
        // Idempotency: unique (property_id, client_msg_id); replay returns the original row.
        const [message, created] = await ChatMessage.findOrCreate({
          where: { propertyId: Number(data.propertyId), clientMsgId: data.clientMsgId },
          defaults: {
            propertyId: Number(data.propertyId),
            tenantId: user.tid,
            userId: user.sub,
            clientMsgId: data.clientMsgId,
            body: data.body,
          },
        });
        const dto = hydrateMessage(message);
        if (typeof ack === 'function') ack({ ok: true, message: dto, duplicate: !created });
        if (created) io.to(room).emit('chat:new', dto);
      } catch (err) {
        if (typeof ack === 'function') ack({ ok: false, error: err.message ?? 'send failed' });
      }
    });

    socket.on('typing', ({ propertyId, typing }) => {
      const room = `property:${Number(propertyId)}`;
      if (!socket.data.properties?.has(String(Number(propertyId)))) return;
      socket.to(room).emit('typing', { propertyId: String(propertyId), userId: user.sub, typing: Boolean(typing) });
    });

    socket.on('note:new', async ({ propertyId, body }, ack) => {
      try {
        const pid = Number(propertyId);
        if (!socket.data.properties?.has(String(pid))) throw new Error('join the property room first');
        if (typeof body !== 'string' || !body.trim() || body.length > 500) throw new Error('invalid note');
        const note = await PropertyNote.create({ propertyId: pid, tenantId: user.tid, userId: user.sub, body: body.trim() });
        const dto = { id: String(note.id), propertyId: String(pid), userId: user.sub, body: note.body, createdAt: note.createdAt };
        if (typeof ack === 'function') ack({ ok: true, note: dto });
        io.to(`property:${pid}`).emit('note:new', dto);
      } catch (err) {
        if (typeof ack === 'function') ack({ ok: false, error: err.message });
      }
    });

    socket.on('disconnecting', () => {
      for (const pid of socket.data.properties ?? []) {
        redis.hdel(`presence:property:${pid}`, user.sub).catch(() => {});
      }
    });
  });

  logger.info('socket.io attached (redis adapter)');
  return io;
}

function hydrateMessage(m) {
  return {
    id: String(m.id),
    propertyId: String(m.propertyId),
    userId: m.userId,
    clientMsgId: m.clientMsgId,
    body: m.body,
    createdAt: m.createdAt,
  };
}
