import { Request, Response, NextFunction } from 'express';
import prisma from '../config/prisma';
import logger from '../config/logger';
import { uploadBuffer, deleteFile } from '../services/storage.service';
import {
  createDiarySchema,
  likeEntrySchema,
  addCommentSchema,
  reactToCommentSchema,
} from '../utils/validators';
import { io } from '../websockets/chat.gateway';

// ── Realtime helper ────────────────────────────────────────────────────────────
// Couples-only broadcast. Single event name with a discriminator avoids socket-event
// proliferation while still letting the mobile client refresh just what changed.
type DiaryChange =
  | { action: 'created'; entryId: string }
  | { action: 'updated'; entryId: string }
  | { action: 'deleted'; entryId: string }
  | { action: 'reaction'; entryId: string };

const broadcastDiaryChange = (coupleId: string, change: DiaryChange): void => {
  try {
    io?.to(coupleId).emit('diary_changed', change);
  } catch (err: any) {
    logger.warn({ err: err?.message, coupleId }, '[Diary] Broadcast failed (non-fatal)');
  }
};

// Cloudinary URL → publicId, used to delete an orphan if the DB insert fails after the
// upload succeeded. Matches the parser in settings.controller.
const publicIdFromCloudinaryUrl = (url: string): string | null => {
  const m = url.match(/\/upload\/(?:v\d+\/)?(.+)\.[a-z0-9]+$/i);
  return m ? m[1] : null;
};

// Derive a poster URL for a Cloudinary-hosted video using their `so_0` transformation.
// This is a derived URL — no extra storage cost, and Cloudinary computes the frame on
// first access then caches it on their CDN.
const videoPosterUrl = (videoUrl: string): string | null => {
  // .../upload/v.../folder/file.mp4 → .../upload/so_0,f_jpg/v.../folder/file.jpg
  const m = videoUrl.match(/^(https?:\/\/[^/]+\/[^/]+\/video\/upload\/)(.+)\.(mp4|mov|webm)$/i);
  if (!m) return null;
  return `${m[1]}so_0,f_jpg/${m[2]}.jpg`;
};

// ── POST /api/diary/upload ─────────────────────────────────────────────────────
// True multipart endpoint. The mobile client uploads via FileSystem.uploadAsync so the
// bytes never have to be base64-encoded across the React Native bridge. Returns the
// Cloudinary URL the client then sends back to POST /api/diary as `mediaUrl`.
export const uploadMedia = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'Missing file in form-data field "file"' });
      return;
    }
    const declaredType = req.body?.type;
    if (declaredType !== 'image' && declaredType !== 'video') {
      res.status(400).json({ error: 'type must be "image" or "video"' });
      return;
    }
    // Trust-but-verify: multer's filter already rejected unsupported MIMEs, but cross-
    // check that the declared type matches the MIME family the file actually claims.
    const mimeFamily = req.file.mimetype.split('/')[0];
    if (
      (declaredType === 'image' && mimeFamily !== 'image') ||
      (declaredType === 'video' && mimeFamily !== 'video')
    ) {
      res.status(400).json({ error: `File MIME ${req.file.mimetype} doesn't match type=${declaredType}` });
      return;
    }

    const uploaded = await uploadBuffer(req.file.buffer, `diary/${declaredType}`);
    const thumbnailUrl = declaredType === 'video' ? videoPosterUrl(uploaded.url) ?? undefined : undefined;
    res.json({ url: uploaded.url, thumbnailUrl, type: declaredType });
  } catch (err: any) {
    logger.error({ err: err?.message }, '[Diary] Multipart upload failed');
    res.status(400).json({ error: err?.message ?? 'Upload failed' });
  }
};

// ── GET /api/diary ─────────────────────────────────────────────────────────────
// Cursor-paginated feed. The old endpoint loaded every reaction row for every entry to
// count likes/comments — replaced with Prisma `_count` so we hit a single aggregated
// query. `userLiked` is fetched in a separate findMany scoped to the page so we don't
// blow up scaling with the couple's history size.
export const getEntries = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const coupleId = req.coupleId!;
    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
    const limit = Math.min(50, Math.max(1, Number(req.query.limit ?? 20)));

    const entries = await prisma.diaryEntry.findMany({
      where: { coupleId },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        author: { select: { id: true, name: true, avatarUrl: true } },
        _count: {
          select: {
            // Default `where` isn't accepted on _count in Prisma 5; we filter likes via
            // a separate aggregate below to keep this query simple.
            reactions: true,
          },
        },
      },
    });

    let nextCursor: string | null = null;
    if (entries.length > limit) {
      const last = entries.pop()!;
      nextCursor = last.id;
    }

    if (entries.length === 0) {
      res.json({ entries: [], nextCursor: null });
      return;
    }

    // One round-trip per metric for the visible page only. With limit ≤ 50, the queries
    // are small and Postgres can answer all three in parallel.
    const pageIds = entries.map((e) => e.id);
    const [likeAgg, commentAgg, myLikes] = await Promise.all([
      prisma.diaryReaction.groupBy({
        by: ['entryId'],
        where: { entryId: { in: pageIds }, type: 'heart' },
        _count: { _all: true },
      }),
      prisma.diaryReaction.groupBy({
        by: ['entryId'],
        where: { entryId: { in: pageIds }, type: 'comment' },
        _count: { _all: true },
      }),
      prisma.diaryReaction.findMany({
        where: { entryId: { in: pageIds }, userId, type: 'heart' },
        select: { entryId: true },
      }),
    ]);

    const likeCount = new Map(likeAgg.map((r) => [r.entryId, r._count._all]));
    const commentCount = new Map(commentAgg.map((r) => [r.entryId, r._count._all]));
    const liked = new Set(myLikes.map((r) => r.entryId));

    const mapped = entries.map((entry) => ({
      id: entry.id,
      author: entry.authorId === userId ? 'you' : 'partner',
      authorName: entry.author.name,
      authorAvatar: entry.author.avatarUrl,
      type: entry.type,
      // Discrete media fields — clients render based on `type`, no more
      // string-overloading of `content`. Back-compat: `content` still echoes the text or
      // URL for older clients that haven't been updated.
      text: entry.content,
      mediaUrl: entry.mediaUrl,
      thumbnailUrl: entry.thumbnailUrl,
      milestone: entry.milestone,
      content: entry.content || entry.mediaUrl || '',
      timestamp: entry.createdAt.toISOString(),
      likes: likeCount.get(entry.id) ?? 0,
      comments: commentCount.get(entry.id) ?? 0,
      userLiked: liked.has(entry.id),
      deletedAt: entry.deletedAt ? entry.deletedAt.toISOString() : null,
      editedAt: entry.editedAt ? entry.editedAt.toISOString() : null,
    }));

    res.json({ entries: mapped, nextCursor });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/diary/:id ─────────────────────────────────────────────────────────
export const getEntry = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const coupleId = req.coupleId!;
    const { id } = req.params;

    const entry = await prisma.diaryEntry.findFirst({
      where: { id, coupleId },
      include: {
        author: { select: { id: true, name: true, avatarUrl: true } },
        reactions: {
          include: { user: { select: { id: true, name: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!entry) {
      res.status(404).json({ error: 'Entry not found' });
      return;
    }

    const likes = entry.reactions.filter((r) => r.type === 'heart').length;
    const userLiked = entry.reactions.some((r) => r.type === 'heart' && r.userId === userId);
    const commentsList = entry.reactions
      .filter((r) => r.type === 'comment')
      .map((r) => {
        const commentReactions = entry.reactions.filter(
          (rr) => (rr as any).parentId === r.id && rr.type === 'reaction'
        );
        const reactionMap = new Map<string, { count: number; userReacted: boolean }>();
        for (const cr of commentReactions) {
          const emoji = (cr as any).emoji;
          if (!emoji) continue;
          const current = reactionMap.get(emoji) || { count: 0, userReacted: false };
          reactionMap.set(emoji, {
            count: current.count + 1,
            userReacted: current.userReacted || cr.userId === userId,
          });
        }
        return {
          id: r.id,
          author: r.userId === userId ? 'You' : r.user.name,
          text: r.commentText || '',
          timestamp: r.createdAt.toISOString(),
          reactions: Array.from(reactionMap.entries()).map(([emoji, data]) => ({ emoji, ...data })),
        };
      });

    res.json({
      id: entry.id,
      author: entry.authorId === userId ? 'you' : 'partner',
      authorName: entry.author.name,
      authorAvatar: entry.author.avatarUrl,
      type: entry.type,
      text: entry.content,
      mediaUrl: entry.mediaUrl,
      thumbnailUrl: entry.thumbnailUrl,
      milestone: entry.milestone,
      content: entry.content || entry.mediaUrl || '',
      timestamp: entry.createdAt.toISOString(),
      likes,
      userLiked,
      comments: commentsList.length,
      commentsList,
      deletedAt: entry.deletedAt ? entry.deletedAt.toISOString() : null,
      editedAt: entry.editedAt ? entry.editedAt.toISOString() : null,
    });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/diary ────────────────────────────────────────────────────────────
// The base64-in-content legacy path is gone. Clients upload media to /diary/upload
// first, then POST here with the returned URL.
export const createEntry = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const parsed = createDiarySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }
    const userId = req.user!.userId;
    const coupleId = req.coupleId!;
    const data = parsed.data;

    let entry;
    try {
      entry = await prisma.diaryEntry.create({
        data: {
          coupleId,
          authorId: userId,
          type: data.type,
          content: data.type === 'text' ? data.content : data.content ?? null,
          mediaUrl: data.type === 'text' ? null : data.mediaUrl,
          thumbnailUrl: data.type === 'text' ? null : data.thumbnailUrl ?? null,
          milestone: data.milestone ?? false,
        },
      });
    } catch (err) {
      // The Cloudinary asset is orphaned if we got here. Best-effort delete; never
      // mask the original error from the response.
      if (data.type !== 'text') {
        const publicId = publicIdFromCloudinaryUrl(data.mediaUrl);
        if (publicId) deleteFile(publicId).catch(() => undefined);
      }
      throw err;
    }

    broadcastDiaryChange(coupleId, { action: 'created', entryId: entry.id });

    res.status(201).json({
      id: entry.id,
      author: 'you',
      authorName: undefined,
      authorAvatar: undefined,
      type: entry.type,
      text: entry.content,
      mediaUrl: entry.mediaUrl,
      thumbnailUrl: entry.thumbnailUrl,
      milestone: entry.milestone,
      content: entry.content || entry.mediaUrl || '',
      timestamp: entry.createdAt.toISOString(),
      likes: 0,
      comments: 0,
      userLiked: false,
      commentsList: [],
    });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/diary/:id/like ───────────────────────────────────────────────────
export const likeEntry = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const parsed = likeEntrySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }
    const { liked } = parsed.data;
    const userId = req.user!.userId;
    const { id } = req.params;
    const coupleId = req.coupleId!;

    const entry = await prisma.diaryEntry.findFirst({ where: { id, coupleId } });
    if (!entry) {
      res.status(404).json({ error: 'Entry not found' });
      return;
    }

    if (liked) {
      const existing = await prisma.diaryReaction.findFirst({
        where: { entryId: id, userId, type: 'heart' },
      });
      if (!existing) {
        await prisma.diaryReaction.create({ data: { entryId: id, userId, type: 'heart' } });
      }
    } else {
      await prisma.diaryReaction.deleteMany({ where: { entryId: id, userId, type: 'heart' } });
    }

    broadcastDiaryChange(coupleId, { action: 'reaction', entryId: id });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/diary/:id/comments ───────────────────────────────────────────────
export const addComment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const parsed = addCommentSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }
    const { text } = parsed.data;
    const userId = req.user!.userId;
    const { id } = req.params;
    const coupleId = req.coupleId!;

    const entry = await prisma.diaryEntry.findFirst({ where: { id, coupleId } });
    if (!entry) {
      res.status(404).json({ error: 'Entry not found' });
      return;
    }

    await prisma.diaryReaction.create({
      data: { entryId: id, userId, type: 'comment', commentText: text },
    });

    broadcastDiaryChange(coupleId, { action: 'reaction', entryId: id });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/diary/:id/comments/:commentId/react ────────────────────────────
export const reactToComment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const parsed = reactToCommentSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }
    const { emoji } = parsed.data;
    const userId = req.user!.userId;
    const { id, commentId } = req.params;
    const coupleId = req.coupleId!;

    const entry = await prisma.diaryEntry.findFirst({ where: { id, coupleId } });
    if (!entry) {
      res.status(404).json({ error: 'Entry not found' });
      return;
    }

    const comment = await prisma.diaryReaction.findFirst({
      where: { id: commentId, type: 'comment', entryId: id },
    });
    if (!comment) {
      res.status(404).json({ error: 'Comment not found' });
      return;
    }

    const existingReaction = await (prisma.diaryReaction as any).findFirst({
      where: { parentId: commentId, userId, type: 'reaction', emoji },
    });

    if (existingReaction) {
      await prisma.diaryReaction.delete({ where: { id: existingReaction.id } });
    } else {
      await (prisma.diaryReaction as any).create({
        data: { entryId: id, userId, type: 'reaction', parentId: commentId, emoji },
      });
    }

    broadcastDiaryChange(coupleId, { action: 'reaction', entryId: id });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

// ── PUT /api/diary/:id ─────────────────────────────────────────────────────────
export const editEntry = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;
    const coupleId = req.coupleId!;
    const { content } = req.body;

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      res.status(400).json({ error: 'Content is required' });
      return;
    }
    if (content.length > 10000) {
      res.status(400).json({ error: 'Entry is too long' });
      return;
    }

    const entry = await prisma.diaryEntry.findFirst({ where: { id, coupleId } });
    if (!entry) {
      res.status(404).json({ error: 'Entry not found' });
      return;
    }
    if (entry.authorId !== userId) {
      res.status(403).json({ error: 'You can only edit your own entries' });
      return;
    }
    if (entry.type !== 'text') {
      res.status(400).json({ error: 'Only text entries can be edited' });
      return;
    }

    const editedAt = new Date();
    await prisma.diaryEntry.update({
      where: { id },
      data: { content: content.trim(), editedAt },
    });

    broadcastDiaryChange(coupleId, { action: 'updated', entryId: id });
    res.json({ success: true, editedAt: editedAt.toISOString() });
  } catch (err) {
    next(err);
  }
};

// ── DELETE /api/diary/:id ──────────────────────────────────────────────────────
// Soft-delete: replaces content with a tombstone message instead of removing the row.
// Drops the Cloudinary asset if there was one — no point keeping orphaned media.
export const deleteEntry = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const { id } = req.params;
    const coupleId = req.coupleId!;

    const entry = await prisma.diaryEntry.findFirst({
      where: { id, coupleId },
      include: { author: { select: { name: true } } },
    });
    if (!entry) {
      res.status(404).json({ error: 'Entry not found' });
      return;
    }
    if (entry.authorId !== userId) {
      res.status(403).json({ error: 'You can only delete your own entries' });
      return;
    }

    const tombstone = `${entry.author.name} removed this diary entry.`;
    const deletedAt = new Date();

    // Best-effort drop of the underlying Cloudinary asset. Non-fatal if it fails.
    if (entry.mediaUrl) {
      const publicId = publicIdFromCloudinaryUrl(entry.mediaUrl);
      if (publicId) {
        deleteFile(publicId).catch((err) =>
          logger.warn({ err: err?.message, id }, '[Diary] Media delete failed (non-fatal)')
        );
      }
    }

    await prisma.diaryEntry.update({
      where: { id },
      data: {
        content: tombstone,
        mediaUrl: null,
        thumbnailUrl: null,
        type: 'text',
        deletedAt,
      },
    });
    await prisma.diaryReaction.deleteMany({ where: { entryId: id } });

    broadcastDiaryChange(coupleId, { action: 'deleted', entryId: id });
    res.json({ success: true, deletedAt: deletedAt.toISOString() });
  } catch (err) {
    next(err);
  }
};
