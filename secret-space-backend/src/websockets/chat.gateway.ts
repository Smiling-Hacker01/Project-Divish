import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HttpServer } from 'http';
import { createAdapter } from '@socket.io/redis-adapter';
import redis from '../config/redis';
import prisma from '../config/prisma';
import logger from '../config/logger';
import jwt from 'jsonwebtoken';
import { sendPush } from '../services/notification.service';
import { z } from 'zod';

export let io: SocketIOServer;

// Map user IDs to their socket instances for easy direct delivery or online status checks.
// In a multi-process deployment Redis adapter handles cross-node routing; this map is
// authoritative only for this process. Use it for local fast-path decisions, but always
// route emits through `io.to(...)` so other processes' clients receive them too.
const connectedUsers = new Map<string, string>();

// ── Helpers ──────────────────────────────────────────────────────────────────

async function unreadCountFor(userId: string, coupleId: string): Promise<number> {
  return prisma.message.count({
    where: {
      coupleId,
      senderId: { not: userId },
      status: { in: ['sent', 'delivered'] },
      deletedForEveryone: false,
    },
  });
}

// Emit the recipient's fresh unread count to their socket(s). Uses the per-user room
// pattern (`user:<id>`) so it reaches every device they have open across processes.
async function emitUnreadCount(userId: string, coupleId: string): Promise<void> {
  try {
    const count = await unreadCountFor(userId, coupleId);
    io.to(`user:${userId}`).emit('unread_count', { count });
  } catch (err) {
    logger.error({ err, userId }, '[Chat] Failed to emit unread count');
  }
}

export const initializeChatSockets = (server: HttpServer) => {
  io = new SocketIOServer(server, {
    cors: {
      origin: process.env.ALLOWED_ORIGINS?.split(',').map((s) => s.trim()) || '*',
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  // Redis Adapter for production scale horizontal scaling
  const pubClient = redis.duplicate();
  const subClient = redis.duplicate();
  io.adapter(createAdapter(pubClient, subClient));

  // Middleware: Authentication
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error('Authentication token missing'));
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string };
      socket.data.userId = decoded.userId;
      next();
    } catch (err) {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', async (socket: Socket) => {
    const userId = socket.data.userId;
    connectedUsers.set(userId, socket.id);
    // Per-user room: lets us push targeted events (unread_count, etc.) regardless of which
    // process holds the socket.
    socket.join(`user:${userId}`);
    logger.info({ userId, socketId: socket.id }, '[Chat] User connected');

    // Automatically join the couple room upon connection
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { coupleAsA: true, coupleAsB: true },
      });

      const couple = user?.coupleAsA || user?.coupleAsB;
      if (couple) {
        socket.data.coupleId = couple.id;
        socket.join(couple.id);
        logger.info({ userId, coupleId: couple.id }, '[Chat] User joined couple room');

        // Presence: Broadcast online status to partner, and check partner status
        const partnerId = couple.userAId === userId ? couple.userBId : couple.userAId;
        if (partnerId) {
          socket.to(couple.id).emit('partner_presence', { userId, status: 'online' });
          if (connectedUsers.has(partnerId)) {
            socket.emit('partner_presence', { userId: partnerId, status: 'online' });
          } else {
            socket.emit('partner_presence', { userId: partnerId, status: 'offline' });
          }

          // Catch-up: any messages the partner sent while we were offline should flip to
          // `delivered` now that we're connected, and the partner's UI should learn about it.
          try {
            const undelivered = await prisma.message.findMany({
              where: { coupleId: couple.id, senderId: partnerId, status: 'sent' },
              select: { id: true },
            });
            if (undelivered.length > 0) {
              const ids = undelivered.map((m) => m.id);
              await prisma.message.updateMany({
                where: { id: { in: ids } },
                data: { status: 'delivered', deliveredAt: new Date() },
              });
              io.to(couple.id).emit('message_status_batch', {
                messageIds: ids,
                status: 'delivered',
              });
            }
          } catch (err) {
            logger.error({ err, userId }, '[Chat] Failed catch-up delivered receipts');
          }
        }

        // Push current unread count to this freshly-connected socket so the badge syncs
        // even if the client missed live events while offline.
        await emitUnreadCount(userId, couple.id);
      }
    } catch (err) {
      logger.error({ err, userId }, '[Chat] Failed to auto-join couple room');
    }

    socket.on('disconnect', () => {
      connectedUsers.delete(userId);
      logger.info({ userId, socketId: socket.id }, '[Chat] User disconnected');
      if (socket.data.coupleId) {
        socket.to(socket.data.coupleId).emit('partner_presence', { userId, status: 'offline' });
      }
    });

    // Handle incoming secure message. Idempotent on (senderId, clientId): a retried send
    // with the same clientId returns the original row without creating a duplicate.
    socket.on('send_message', async (data: any, callback) => {
      try {
        const schema = z.object({
          content: z.string().nullable().optional(),
          mediaUrl: z.string().nullable().optional(),
          mediaType: z.string().nullable().optional(),
          senderAesKey: z.string().nullable().optional(),
          recipientAesKey: z.string().nullable().optional(),
          // Client-supplied correlation id so optimistic UIs can reconcile the temp
          // bubble with the server-issued row, and the retry queue can dedupe replays.
          clientId: z.string().nullable().optional(),
        });

        const payload = schema.parse(data);
        const { coupleId } = socket.data;

        if (!coupleId) {
          if (callback) callback({ status: 'error', error: 'No active couple room' });
          return;
        }

        // Fast path for retried sends — when the client passes a clientId we've already
        // seen, the unique index turns the second insert into an update that no-ops the
        // mutable columns. We then re-broadcast `receive_message` so the partner client
        // sees the message even if the original broadcast was missed.
        let isReplay = false;
        let message;
        if (payload.clientId) {
          const existing = await prisma.message.findUnique({
            where: { sender_client_id_unique: { senderId: userId, clientId: payload.clientId } },
            include: { sender: { select: { id: true, name: true } } },
          });
          if (existing) {
            message = existing;
            isReplay = true;
          }
        }

        if (!message) {
          message = await prisma.message.create({
            data: {
              coupleId,
              senderId: userId,
              clientId: payload.clientId ?? null,
              content: payload.content || null,
              mediaUrl: payload.mediaUrl || null,
              mediaType: payload.mediaType || null,
              senderAesKey: payload.senderAesKey || null,
              recipientAesKey: payload.recipientAesKey || null,
              status: 'sent',
            },
            include: { sender: { select: { id: true, name: true } } },
          });
        }

        const enriched = { ...message, clientId: payload.clientId ?? message.clientId };

        // Always (re)broadcast to partner — for replays the prior broadcast may have been
        // dropped while the partner was offline, so resending is the right thing to do.
        socket.to(coupleId).emit('receive_message', enriched);

        if (callback) callback({ status: 'ok', message: enriched });

        // Only run the side-effects (push, status-flip, unread bump) on the first send.
        // Replays are pure no-ops past this point so we don't double-push the partner.
        if (isReplay) return;

        const couple = await prisma.couple.findUnique({ where: { id: coupleId } });
        if (couple) {
          const partnerId = couple.userAId === userId ? couple.userBId : couple.userAId;
          if (partnerId) {
            const isPartnerOnline = connectedUsers.has(partnerId);
            if (!isPartnerOnline) {
              await sendPush(partnerId, message.sender.name, 'Sent a secure message 🔒', {
                type: 'chat_message',
                coupleId,
                messageId: message.id,
              });
            } else {
              await prisma.message.update({
                where: { id: message.id },
                data: { status: 'delivered', deliveredAt: new Date() },
              });
              io.to(coupleId).emit('message_status', { messageId: message.id, status: 'delivered' });
            }
            await emitUnreadCount(partnerId, coupleId);
          }
        }
      } catch (err) {
        logger.error({ err, userId }, '[Chat] Failed to send message');
        if (callback) callback({ status: 'error', error: 'Server error parsing message' });
      }
    });

    socket.on('typing', (isTyping: boolean) => {
      const { coupleId } = socket.data;
      if (coupleId) {
        socket.to(coupleId).emit('typing', { userId, isTyping });
      }
    });

    socket.on('delivered_receipt', async (messageIds: string[]) => {
      const { coupleId } = socket.data;
      if (coupleId && Array.isArray(messageIds) && messageIds.length > 0) {
        await prisma.message.updateMany({
          where: { id: { in: messageIds }, coupleId, status: 'sent' },
          data: { status: 'delivered', deliveredAt: new Date() },
        });
        socket.to(coupleId).emit('message_status_batch', { messageIds, status: 'delivered' });
      }
    });

    socket.on('read_receipt', async (messageIds: string[]) => {
      const { coupleId } = socket.data;
      if (coupleId && Array.isArray(messageIds) && messageIds.length > 0) {
        await prisma.message.updateMany({
          where: { id: { in: messageIds }, coupleId, status: { in: ['sent', 'delivered'] } },
          data: { status: 'read', readAt: new Date() },
        });
        socket.to(coupleId).emit('message_status_batch', { messageIds, status: 'read' });

        // Reader's own unread count just dropped — push the fresh value to their devices.
        await emitUnreadCount(userId, coupleId);
      }
    });

    // Message Reactions
    socket.on('react_message', async (data: { messageId: string; emoji: string }) => {
      const { coupleId } = socket.data;
      if (!coupleId) return;

      const msg = await prisma.message.findUnique({ where: { id: data.messageId } });
      if (msg) {
        let currentReactions = (msg.reactions as any) || {};
        currentReactions[userId] = data.emoji;

        await prisma.message.update({
          where: { id: data.messageId },
          data: { reactions: currentReactions },
        });

        io.to(coupleId).emit('message_reaction', {
          messageId: data.messageId,
          userId,
          emoji: data.emoji,
          reactions: currentReactions,
        });
      }
    });

    // Message Deletions
    socket.on('delete_message', async (data: { messageId: string; type: 'for_me' | 'for_everyone' }) => {
      const { coupleId } = socket.data;
      if (!coupleId) return;

      const msg = await prisma.message.findUnique({ where: { id: data.messageId } });
      if (!msg) return;

      const now = new Date();

      if (data.type === 'for_everyone' && msg.senderId === userId) {
        await prisma.message.update({
          where: { id: data.messageId },
          data: {
            deletedForEveryone: true,
            deletedAt: now,
            content: null,
            senderAesKey: null,
            recipientAesKey: null,
            mediaUrl: null,
            mediaType: null,
          },
        });
        io.to(coupleId).emit('message_deleted', {
          messageId: data.messageId,
          type: 'for_everyone',
          deletedAt: now.toISOString(),
        });

        // If this message was still unread for the partner, their badge needs to drop.
        const couple = await prisma.couple.findUnique({ where: { id: coupleId } });
        const partnerId = couple?.userAId === userId ? couple?.userBId : couple?.userAId;
        if (partnerId) await emitUnreadCount(partnerId, coupleId);
      } else if (data.type === 'for_me' && msg.senderId === userId) {
        await prisma.message.update({
          where: { id: data.messageId },
          data: { deletedForSender: true, deletedAt: now },
        });
        socket.emit('message_deleted', {
          messageId: data.messageId,
          type: 'for_me',
          deletedAt: now.toISOString(),
        });
      }
    });

    // Edit a message (sender only, not allowed if already deleted-for-everyone).
    socket.on('edit_message', async (data: { messageId: string; content: string }) => {
      const { coupleId } = socket.data;
      if (!coupleId) return;
      if (typeof data.content !== 'string' || data.content.trim().length === 0) return;

      const msg = await prisma.message.findUnique({ where: { id: data.messageId } });
      if (!msg) return;
      if (msg.senderId !== userId || msg.deletedForEveryone) return;

      const editedAt = new Date();
      await prisma.message.update({
        where: { id: data.messageId },
        data: { content: data.content.trim(), editedAt },
      });

      io.to(coupleId).emit('message_edited', {
        messageId: data.messageId,
        content: data.content.trim(),
        editedAt: editedAt.toISOString(),
      });
    });
  });
};
