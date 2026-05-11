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

// Map user IDs to their socket instances for easy direct delivery or online status checks
const connectedUsers = new Map<string, string>();

export const initializeChatSockets = (server: HttpServer) => {
  io = new SocketIOServer(server, {
    cors: {
      origin: process.env.ALLOWED_ORIGINS?.split(',').map(s => s.trim()) || '*',
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
    logger.info({ userId, socketId: socket.id }, '[Chat] User connected');

    // Automatically join the couple room upon connection
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { coupleAsA: true, coupleAsB: true }
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
        }
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

    // Handle incoming secure message
    socket.on('send_message', async (data: any, callback) => {
      try {
        const schema = z.object({
          content: z.string().nullable().optional(),
          mediaUrl: z.string().nullable().optional(),
          mediaType: z.string().nullable().optional(),
          senderAesKey: z.string().nullable().optional(),
          recipientAesKey: z.string().nullable().optional(),
        });
        
        const payload = schema.parse(data);
        const { coupleId } = socket.data;

        if (!coupleId) {
          if (callback) callback({ status: 'error', error: 'No active couple room' });
          return;
        }

        const message = await prisma.message.create({
          data: {
            coupleId,
            senderId: userId,
            content: payload.content || null,
            mediaUrl: payload.mediaUrl || null,
            mediaType: payload.mediaType || null,
            senderAesKey: payload.senderAesKey || null,
            recipientAesKey: payload.recipientAesKey || null,
            status: 'sent',
          },
          include: { sender: { select: { id: true, name: true } } }
        });

        // Broadcast to partner
        socket.to(coupleId).emit('receive_message', message);
        
        // Return acknowledgment to sender
        if (callback) callback({ status: 'ok', message });

        // Trigger push notification if partner is offline
        const couple = await prisma.couple.findUnique({ where: { id: coupleId } });
        if (couple) {
          const partnerId = couple.userAId === userId ? couple.userBId : couple.userAId;
          if (partnerId) {
            const isPartnerOnline = connectedUsers.has(partnerId);
            if (!isPartnerOnline) {
              await sendPush(
                partnerId, 
                message.sender.name, 
                'Sent a secure message 🔒',
                { type: 'chat_message', coupleId }
              );
            } else {
               // Mark as delivered instantly using sockets
               await prisma.message.update({
                 where: { id: message.id },
                 data: { status: 'delivered', deliveredAt: new Date() }
               });
               io.to(coupleId).emit('message_status', { messageId: message.id, status: 'delivered' });
            }
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
      if (coupleId && messageIds.length > 0) {
        await prisma.message.updateMany({
          where: { id: { in: messageIds }, coupleId, status: 'sent' },
          data: { status: 'delivered', deliveredAt: new Date() },
        });
        socket.to(coupleId).emit('message_status_batch', { messageIds, status: 'delivered' });
      }
    });

    socket.on('read_receipt', async (messageIds: string[]) => {
      const { coupleId } = socket.data;
      if (coupleId && messageIds.length > 0) {
        await prisma.message.updateMany({
          where: { id: { in: messageIds }, coupleId, status: { in: ['sent', 'delivered'] } },
          data: { status: 'read', readAt: new Date() },
        });
        socket.to(coupleId).emit('message_status_batch', { messageIds, status: 'read' });
      }
    });

    // Message Reactions
    socket.on('react_message', async (data: { messageId: string; emoji: string }) => {
      const { coupleId } = socket.data;
      if (!coupleId) return;
      
      const msg = await prisma.message.findUnique({ where: { id: data.messageId }});
      if (msg) {
        let currentReactions = (msg.reactions as any) || {};
        currentReactions[userId] = data.emoji;
        
        await prisma.message.update({
          where: { id: data.messageId },
          data: { reactions: currentReactions }
        });
        
        io.to(coupleId).emit('message_reaction', { 
          messageId: data.messageId, 
          userId, 
          emoji: data.emoji, 
          reactions: currentReactions 
        });
      }
    });

    // Message Deletions
    socket.on('delete_message', async (data: { messageId: string, type: 'for_me' | 'for_everyone' }) => {
      const { coupleId } = socket.data;
      if (!coupleId) return;

      const msg = await prisma.message.findUnique({ where: { id: data.messageId }});
      if (!msg) return;

      if (data.type === 'for_everyone' && msg.senderId === userId) {
         await prisma.message.update({
           where: { id: data.messageId },
           data: { 
             deletedForEveryone: true, 
             content: null, 
             senderAesKey: null, 
             recipientAesKey: null, 
             mediaUrl: null 
           }
         });
         io.to(coupleId).emit('message_deleted', { messageId: data.messageId, type: 'for_everyone' });
      } else if (data.type === 'for_me' && msg.senderId === userId) {
         await prisma.message.update({ 
           where: { id: data.messageId }, 
           data: { deletedForSender: true } 
         });
         socket.emit('message_deleted', { messageId: data.messageId, type: 'for_me' });
      }
    });
  });
};
