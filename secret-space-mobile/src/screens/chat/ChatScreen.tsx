import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { Audio } from 'expo-av';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ScreenContainer, TopBar, Text, Avatar, Button } from '@/components';
import { useTheme } from '@/theme';
import { chatApi, tokens, ChatAttachmentKind } from '@/api';
import { ChatMessage } from '@/types/api';
import { useAuth } from '@/context/AuthContext';
import { useChatSocket } from '@/context/ChatSocketContext';
import {
  generateAESKey,
  encryptTextAES,
  encryptAESKeyWithRSA,
  decryptAESKeyWithRSA,
  decryptTextAES,
} from '@/services/encryption';
import { getOrCreateKeyPair, ensurePublicKeyRegistered, getKeypairCreatedAt } from '@/services/cryptoIdentity';
import { chatQueue, ChatQueueEntry } from '@/services/chatQueue';

const QUICK_REACTIONS = ['❤️', '😂', '😮', '😢', '😠', '🔥'];
// Local-only "delete for me" — backend forbids non-senders from setting deletedForSender,
// so we keep a per-user hide-list on disk and filter on render.
const LOCAL_HIDDEN_KEY = 'secretspace.chat.hiddenIds';
// Cache the partner's public key on disk for instant chat-open. Refreshed on every
// chat-screen mount so a partner reinstalling re-syncs within a single round-trip.
const PARTNER_KEY_CACHE = (partnerId: string) => `secretspace.partnerPubKey:${partnerId}`;

// 5 MB cutoff for base64 vs multipart uploads. Below this the base64 path is faster (one
// round-trip, no multipart framing). Above it, base64 across the RN bridge starts to
// stutter on iOS Simulator and we use a true multipart POST.
const BASE64_LIMIT = 5 * 1024 * 1024;

type SendStatus = 'queued' | 'failed';

export function ChatScreen() {
  const theme = useTheme();
  const { user } = useAuth();
  const { socket, status: socketStatus, partnerOnline, resetUnread } = useChatSocket();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [partnerTyping, setPartnerTyping] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [recordSeconds, setRecordSeconds] = useState(0);
  // Audio preview state — sits between recording-stopped and sending. Lets the user
  // listen back, re-record, or discard before committing.
  const [audioPreview, setAudioPreview] = useState<{ uri: string; durationMs: number } | null>(null);
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const previewSoundRef = useRef<Audio.Sound | null>(null);
  const [actionFor, setActionFor] = useState<ChatMessage | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());

  // ── E2EE state ───────────────────────────────────────────────────────────────
  // Plaintext cache keyed by message id (or clientId for in-flight optimistic msgs).
  // Anything in `decryptedCache` is what gets rendered in the bubble; entries without
  // a value show "Decrypting…" instead. This mirrors the web client.
  const [decryptedCache, setDecryptedCache] = useState<Record<string, string>>({});
  // Live mirror of decryptedCache for the decryption pump to read without
  // taking decryptedCache as an effect dependency. If the pump depended on
  // decryptedCache directly, every batch it committed would re-trigger the
  // whole effect — overlapping runs. Reading the latest values through a ref
  // (synced just below) lets the pump drop that dependency entirely.
  const decryptedCacheRef = useRef(decryptedCache);
  useEffect(() => {
    decryptedCacheRef.current = decryptedCache;
  }, [decryptedCache]);
  const [myKeys, setMyKeys] = useState<{ publicKey: string; privateKey: string } | null>(null);
  // Timestamp at which the currently-active keypair was first held on this
  // device. Loaded once at mount. Messages older than this can't be
  // decrypted by us — see the decrypt pump for why.
  const [keypairCreatedAt, setKeypairCreatedAt] = useState<string | null>(null);
  const [partnerPubKey, setPartnerPubKey] = useState<string | null>(null);
  const [cryptoReady, setCryptoReady] = useState(false);

  // ── Retry / queue state ──────────────────────────────────────────────────────
  // Mirror of the persistent chatQueue keyed by clientId — used by the UI to render
  // queued/failed badges on optimistic bubbles. The authoritative copy lives on disk.
  const [sendStates, setSendStates] = useState<Record<string, SendStatus>>({});

  const recordTickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inputRef = useRef<TextInput | null>(null);
  const flatListRef = useRef<FlatList<ChatMessage> | null>(null);

  // Resolvers waiting for the attach sheet to finish dismissing on iOS. The Modal's
  // onDismiss fires *after* the sheet animation completes, which is the only reliable
  // moment to present another modal (the system image/document picker).
  const dismissResolvers = useRef<Array<() => void>>([]);
  const awaitSheetDismiss = useCallback(
    () =>
      new Promise<void>((resolve) => {
        dismissResolvers.current.push(resolve);
      }),
    []
  );
  const handleSheetDismiss = useCallback(() => {
    const fns = dismissResolvers.current;
    dismissResolvers.current = [];
    fns.forEach((fn) => fn());
  }, []);

  // ── Local hidden-ids restore (per-user delete-for-me hide list) ──────────────
  useEffect(() => {
    AsyncStorage.getItem(LOCAL_HIDDEN_KEY)
      .then((raw) => {
        if (raw) setHiddenIds(new Set(JSON.parse(raw) as string[]));
      })
      .catch(() => {});
  }, []);

  const addLocalHide = (id: string) => {
    setHiddenIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      AsyncStorage.setItem(LOCAL_HIDDEN_KEY, JSON.stringify(Array.from(next))).catch(() => {});
      return next;
    });
  };

  // Hide messages the current user deleted just for themselves.
  const visibleMessages = useMemo(
    () =>
      messages.filter(
        (m) => !hiddenIds.has(m.id) && !(m.deletedForSender && m.senderId === user?.id)
      ),
    [messages, user?.id, hiddenIds]
  );

  // Auto-scroll to bottom when new messages arrive.
  useEffect(() => {
    const t = setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 80);
    return () => clearTimeout(t);
  }, [visibleMessages.length]);

  // ── Crypto bootstrap ─────────────────────────────────────────────────────────
  // Load (or generate) my keypair, register the public key with the backend, fetch the
  // partner's public key from cache (instant) then refresh from network (eventual). On
  // first install the keygen step takes 3-8s — the "Securing your space…" banner covers
  // it like the web client.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const keys = await getOrCreateKeyPair();
        if (cancelled) return;
        setMyKeys(keys);

        // Pull the keypair-birth timestamp once at mount. The decrypt pump
        // reads this synchronously to classify any failure as "legacy
        // (expected)" or "real bug (unexpected)" — see the catch block in
        // the decrypt useEffect below.
        getKeypairCreatedAt().then((ts) => {
          if (!cancelled) setKeypairCreatedAt(ts);
        });

        // Re-register on every chat open (cheap, idempotent) so a partner who just
        // reinstalled immediately sees an up-to-date pub key when they query.
        ensurePublicKeyRegistered().catch(() => undefined);

        if (user?.partnerId) {
          const cached = await AsyncStorage.getItem(PARTNER_KEY_CACHE(user.partnerId));
          if (cached && !cancelled) setPartnerPubKey(cached);
          try {
            const { publicKey } = await chatApi.getPartnerKey(user.partnerId);
            if (cancelled) return;
            if (publicKey) {
              setPartnerPubKey(publicKey);
              AsyncStorage.setItem(PARTNER_KEY_CACHE(user.partnerId), publicKey).catch(() => undefined);
            }
          } catch (err) {
            if (__DEV__) console.log('[Chat] Partner key fetch failed (will retry next focus)', err);
          }
        }
      } catch (err) {
        console.warn('[Chat] Crypto init failed', err);
      } finally {
        if (!cancelled) setCryptoReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.partnerId]);

  // ── History load ─────────────────────────────────────────────────────────────
  useEffect(() => {
    chatApi
      .history()
      .then((r) => setMessages(r.messages.slice().reverse()))
      .catch(() => {});
  }, []);

  // Restore the persistent send-queue state on mount so the user sees their failed
  // bubbles' state correctly.
  useEffect(() => {
    chatQueue
      .list()
      .then((entries) => {
        if (entries.length === 0) return;
        const states: Record<string, SendStatus> = {};
        const preview: Record<string, string> = {};
        entries.forEach((e) => {
          states[e.clientId] = e.lastError ? 'failed' : 'queued';
          if (e.kind === 'text') preview[e.clientId] = e.plainPreview;
        });
        setSendStates(states);
        setDecryptedCache((prev) => ({ ...preview, ...prev }));
        // Hydrate optimistic bubbles for queued messages so the user can see + retry them
        // even after an app restart.
        const queuedBubbles: ChatMessage[] = entries.map<ChatMessage>((e) => ({
          id: e.clientId,
          coupleId: '',
          senderId: user?.id ?? '',
          sender: { id: user?.id ?? '', name: user?.name ?? 'You' },
          content: e.kind === 'text' ? e.encryptedContent : null,
          mediaUrl: e.kind === 'media' ? e.mediaUrl : null,
          mediaType: e.kind === 'media' ? e.mediaType : null,
          status: 'sent',
          reactions: {},
          deletedForEveryone: false,
          deletedForSender: false,
          createdAt: new Date(e.queuedAt).toISOString(),
        }));
        setMessages((prev) => {
          const existing = new Set(prev.map((m) => m.id));
          const additions = queuedBubbles.filter((m) => !existing.has(m.id));
          return additions.length ? [...prev, ...additions] : prev;
        });
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Decryption pump ──────────────────────────────────────────────────────────
  // Walks new messages and decrypts whatever we haven't cached yet. Sender-side bubbles
  // are already in the cache from the send path; receiver-side bubbles get decrypted
  // here. Mirrors web's processDecryption().
  useEffect(() => {
    if (!myKeys || !user?.id) return;
    let cancelled = false;

    (async () => {
      // Read the current cache through the ref (not the state in deps) so this
      // effect doesn't re-run every time we commit a batch below.
      const cache = decryptedCacheRef.current;
      const toDecrypt = messages.filter(
        (m) =>
          !m.deletedForEveryone &&
          m.content !== null &&
          cache[m.id] === undefined &&
          !m.id.startsWith('temp-') // optimistic bubbles already have plaintext cached
      );
      if (toDecrypt.length === 0) return;

      // Decrypt newest-first (the messages at the bottom of the list the user
      // is actually looking at) and commit in small batches with a yield
      // between them. decryptAESKeyWithRSA uses pure-JS node-forge RSA, which
      // is synchronous and CPU-heavy: decrypting a large backlog in one tight
      // loop monopolizes the single JS thread for tens of seconds, which froze
      // navigation and touch when leaving the chat ("stuck, then recovers").
      // Yielding (setTimeout 0) between batches lets the navigator, gesture
      // handler, and renderer interleave, so the UI stays responsive while
      // bubbles fill in progressively instead of all-at-once-after-a-freeze.
      const ordered = [...toDecrypt].reverse();
      const BATCH_SIZE = 6;
      let batch: Record<string, string> = {};
      let sinceYield = 0;

      const commit = (updates: Record<string, string>) => {
        if (cancelled || Object.keys(updates).length === 0) return;
        setDecryptedCache((prev) => ({ ...prev, ...updates }));
      };

      for (const msg of ordered) {
        if (cancelled) return;
        try {
          const isMine = msg.senderId === user.id;
          const wrappedKey = isMine ? msg.senderAesKey : msg.recipientAesKey;
          if (!wrappedKey) {
            // No wrapped key for our side — treat content as plaintext (web's fallback
            // for messages sent before the keypair was registered).
            batch[msg.id] = msg.content ?? '';
          } else {
            const aesKey = await decryptAESKeyWithRSA(wrappedKey, myKeys.privateKey);
            const plain = await decryptTextAES(msg.content!, aesKey);
            batch[msg.id] = plain;
          }
        } catch (err) {
          // Classify: was this message authored BEFORE the device's current
          // keypair was created? If so, the failure is expected — the AES key
          // was wrapped to the previous public key and the matching private
          // key is gone (likely a reinstall or APK signing-key change wiped
          // SecureStore). Show the user a soft, honest line instead of a
          // scary "Decryption Error". If the message is NEWER than our
          // keypair birth, this is a real bug — we still surface the same
          // friendly copy to the user (no scary technical messages reach
          // them per product direction) but we ALSO log the full error so
          // it shows up in console / Sentry-equivalent for investigation.
          const isLegacy =
            keypairCreatedAt !== null &&
            !!msg.createdAt &&
            new Date(msg.createdAt).getTime() < new Date(keypairCreatedAt).getTime();
          if (!isLegacy) {
            console.error(
              '[Chat] Decryption failed for a post-keypair message — this is unexpected and worth investigating:',
              { messageId: msg.id, createdAt: msg.createdAt, keypairCreatedAt, error: err }
            );
          } else if (__DEV__) {
            console.log('[Chat] Legacy message (pre-keypair) failed to decrypt:', msg.id);
          }
          batch[msg.id] = '__LOCKED__';
        }

        if (++sinceYield >= BATCH_SIZE) {
          commit(batch);
          batch = {};
          sinceYield = 0;
          // Hand the JS thread back to the event loop before the next batch.
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      }

      // Flush any trailing partial batch.
      commit(batch);
    })();

    return () => {
      cancelled = true;
    };
  }, [messages, myKeys, user?.id, keypairCreatedAt]);

  // ── Socket event wiring ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;

    const onReceive = (msg: ChatMessage & { clientId?: string | null }) => {
      // If this is our own message echoing back (replay from server, e.g. another
      // device or after reconnect), reconcile by clientId.
      if (msg.clientId && msg.senderId === user?.id) {
        setMessages((prev) =>
          prev.map((m) => (m.id === msg.clientId ? { ...m, ...msg } : m))
        );
        // We may have already cached the plaintext under clientId — copy to server id.
        setDecryptedCache((prev) =>
          prev[msg.clientId!] !== undefined && prev[msg.id] === undefined
            ? { ...prev, [msg.id]: prev[msg.clientId!] }
            : prev
        );
        chatQueue.remove(msg.clientId).catch(() => undefined);
        setSendStates((prev) => {
          if (!(msg.clientId! in prev)) return prev;
          const next = { ...prev };
          delete next[msg.clientId!];
          return next;
        });
        return;
      }

      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
      if (msg.senderId !== user?.id) {
        socket.emit('delivered_receipt', [msg.id]);
        socket.emit('read_receipt', [msg.id]);
      }
    };

    const onStatus = (data: { messageId: string; status: ChatMessage['status'] }) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === data.messageId ? { ...m, status: data.status } : m))
      );
    };

    const onStatusBatch = (data: { messageIds: string[]; status: ChatMessage['status'] }) => {
      const ids = new Set(data.messageIds);
      setMessages((prev) => prev.map((m) => (ids.has(m.id) ? { ...m, status: data.status } : m)));
    };

    const onTyping = ({ isTyping }: { isTyping: boolean }) => setPartnerTyping(isTyping);

    const onReaction = (data: { messageId: string; reactions: Record<string, string> }) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === data.messageId ? { ...m, reactions: data.reactions ?? {} } : m))
      );
    };

    const onDeleted = (data: {
      messageId: string;
      type: 'for_me' | 'for_everyone';
      deletedAt?: string;
    }) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id !== data.messageId
            ? m
            : {
                ...m,
                deletedForEveryone: data.type === 'for_everyone' ? true : m.deletedForEveryone,
                deletedForSender: data.type === 'for_me' ? true : m.deletedForSender,
                deletedAt: data.deletedAt ?? new Date().toISOString(),
                content: data.type === 'for_everyone' ? null : m.content,
                mediaUrl: data.type === 'for_everyone' ? null : m.mediaUrl,
                mediaType: data.type === 'for_everyone' ? null : m.mediaType,
              }
        )
      );
    };

    const onEdited = (data: { messageId: string; content: string; editedAt: string }) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === data.messageId ? { ...m, content: data.content, editedAt: data.editedAt } : m
        )
      );
      // Edits arrive already-encrypted from the server too; clear the cache so the
      // decryption pump re-runs.
      setDecryptedCache((prev) => {
        if (prev[data.messageId] === undefined) return prev;
        const next = { ...prev };
        delete next[data.messageId];
        return next;
      });
    };

    socket.on('receive_message', onReceive);
    socket.on('message_status', onStatus);
    socket.on('message_status_batch', onStatusBatch);
    socket.on('typing', onTyping);
    socket.on('message_reaction', onReaction);
    socket.on('message_deleted', onDeleted);
    socket.on('message_edited', onEdited);

    return () => {
      socket.off('receive_message', onReceive);
      socket.off('message_status', onStatus);
      socket.off('message_status_batch', onStatusBatch);
      socket.off('typing', onTyping);
      socket.off('message_reaction', onReaction);
      socket.off('message_deleted', onDeleted);
      socket.off('message_edited', onEdited);
    };
  }, [socket, user?.id]);

  // ── Read receipts on focus ───────────────────────────────────────────────────
  useFocusEffect(
    useCallback(() => {
      resetUnread();
      if (!socket) return;
      const unreadIds = messages
        .filter((m) => m.senderId !== user?.id && m.status !== 'read')
        .map((m) => m.id);
      if (unreadIds.length > 0) {
        socket.emit('read_receipt', unreadIds);
      }
    }, [socket, messages, user?.id, resetUnread])
  );

  // ── Optimistic bubble + queue reconciliation helpers ─────────────────────────
  const optimisticAppend = (overrides: Partial<ChatMessage> & { clientId: string }): ChatMessage => {
    const temp: ChatMessage = {
      id: overrides.clientId,
      coupleId: '',
      senderId: user?.id ?? '',
      sender: { id: user?.id ?? '', name: user?.name ?? 'You' },
      content: null,
      mediaUrl: null,
      mediaType: null,
      status: 'sent',
      reactions: {},
      deletedForEveryone: false,
      deletedForSender: false,
      createdAt: new Date().toISOString(),
      ...overrides,
    };
    setMessages((prev) => [...prev, temp]);
    return temp;
  };

  const reconcileAck = (clientId: string, serverMsg: ChatMessage) => {
    setMessages((prev) => prev.map((m) => (m.id === clientId ? { ...serverMsg } : m)));
    // Move plaintext cache entry from clientId to the server-assigned id.
    setDecryptedCache((prev) =>
      prev[clientId] !== undefined && prev[serverMsg.id] === undefined
        ? { ...prev, [serverMsg.id]: prev[clientId] }
        : prev
    );
    setSendStates((prev) => {
      if (!(clientId in prev)) return prev;
      const next = { ...prev };
      delete next[clientId];
      return next;
    });
    chatQueue.remove(clientId).catch(() => undefined);
  };

  const markFailed = useCallback(async (clientId: string, errMsg: string) => {
    const result = await chatQueue.recordFailure(clientId, errMsg).catch(() => null);
    if (!result) return;
    setSendStates((prev) => ({ ...prev, [clientId]: 'failed' }));
  }, []);

  // ── Send: text (E2EE) ────────────────────────────────────────────────────────
  // Encryption strategy mirrors web exactly: fresh AES key per message; AES key wrapped
  // separately for sender (so sender can re-decrypt history) and partner. If the partner
  // hasn't registered a pub key yet, we degrade to plaintext — same fallback as web.
  const encryptForSend = async (
    plaintext: string
  ): Promise<{
    content: string;
    senderAesKey: string | null;
    recipientAesKey: string | null;
  }> => {
    if (!myKeys || !partnerPubKey) {
      // No pub key for partner yet — send plaintext. Receiver decryptor handles the
      // missing-wrapped-key case by treating content as plain.
      return { content: plaintext, senderAesKey: null, recipientAesKey: null };
    }
    const aesKey = await generateAESKey();
    const content = await encryptTextAES(plaintext, aesKey);
    const senderAesKey = await encryptAESKeyWithRSA(aesKey, myKeys.publicKey);
    const recipientAesKey = await encryptAESKeyWithRSA(aesKey, partnerPubKey);
    return { content, senderAesKey, recipientAesKey };
  };

  const sendText = async () => {
    const text = draft.trim();
    if (!text || !socket) return;
    if (!cryptoReady) {
      Alert.alert('Securing your space', 'Still setting up encryption — try again in a moment.');
      return;
    }

    if (editingId) {
      // Edits are emitted in plaintext here; backend stores them as-is (matches web's
      // current behavior — edits aren't re-encrypted).
      socket.emit('edit_message', { messageId: editingId, content: text });
      setMessages((prev) =>
        prev.map((m) =>
          m.id === editingId ? { ...m, content: text, editedAt: new Date().toISOString() } : m
        )
      );
      setDecryptedCache((prev) => ({ ...prev, [editingId]: text }));
      setEditingId(null);
      setDraft('');
      return;
    }

    setDraft('');
    const clientId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    let encrypted: { content: string; senderAesKey: string | null; recipientAesKey: string | null };
    try {
      encrypted = await encryptForSend(text);
    } catch (e: any) {
      Alert.alert('Encryption failed', e?.message ?? 'Could not encrypt the message.');
      return;
    }

    // Optimistic bubble carries plaintext-only in the cache; the ciphertext travels on
    // the socket and lives in `messages[*].content` after the ack reconciliation.
    optimisticAppend({ clientId, content: encrypted.content });
    setDecryptedCache((prev) => ({ ...prev, [clientId]: text }));
    setSendStates((prev) => ({ ...prev, [clientId]: 'queued' }));

    await chatQueue.enqueue({
      kind: 'text',
      clientId,
      content: text,
      encryptedContent: encrypted.content,
      senderAesKey: encrypted.senderAesKey,
      recipientAesKey: encrypted.recipientAesKey,
      plainPreview: text,
      retries: 0,
      lastError: null,
      queuedAt: Date.now(),
    });

    socket.emit(
      'send_message',
      {
        content: encrypted.content,
        senderAesKey: encrypted.senderAesKey,
        recipientAesKey: encrypted.recipientAesKey,
        clientId,
      },
      (ack: { status: 'ok' | 'error'; message?: ChatMessage; error?: string }) => {
        if (ack?.status === 'ok' && ack.message) {
          reconcileAck(clientId, ack.message);
        } else {
          markFailed(clientId, ack?.error ?? 'Send failed');
        }
      }
    );
  };

  // ── Replay queue on reconnect ────────────────────────────────────────────────
  // Whenever the socket flips to `connected`, walk the queue and re-emit anything that
  // hasn't failed permanently. Server is idempotent on (senderId, clientId).
  const replayQueue = useCallback(async () => {
    if (!socket || socketStatus !== 'connected') return;
    const entries = await chatQueue.list();
    for (const entry of entries) {
      if (entry.retries >= chatQueue.MAX_RETRIES) continue;
      try {
        if (entry.kind === 'text') {
          socket.emit(
            'send_message',
            {
              content: entry.encryptedContent,
              senderAesKey: entry.senderAesKey,
              recipientAesKey: entry.recipientAesKey,
              clientId: entry.clientId,
            },
            (ack: { status: 'ok' | 'error'; message?: ChatMessage; error?: string }) => {
              if (ack?.status === 'ok' && ack.message) {
                reconcileAck(entry.clientId, ack.message);
              } else {
                markFailed(entry.clientId, ack?.error ?? 'Replay failed');
              }
            }
          );
        } else if (entry.kind === 'media') {
          // If media wasn't uploaded yet (network died mid-upload), give up — the user
          // has to manually retry from the failed bubble, which restarts the upload.
          if (!entry.mediaUrl) continue;
          socket.emit(
            'send_message',
            { mediaUrl: entry.mediaUrl, mediaType: entry.mediaType, clientId: entry.clientId },
            (ack: { status: 'ok' | 'error'; message?: ChatMessage; error?: string }) => {
              if (ack?.status === 'ok' && ack.message) {
                reconcileAck(entry.clientId, ack.message);
              } else {
                markFailed(entry.clientId, ack?.error ?? 'Replay failed');
              }
            }
          );
        }
      } catch (err) {
        // Per-entry failures shouldn't break the loop.
        if (__DEV__) console.log('[Chat] Replay error', entry.clientId, err);
      }
    }
  }, [socket, socketStatus, markFailed]);

  useEffect(() => {
    if (socketStatus === 'connected') replayQueue();
  }, [socketStatus, replayQueue]);

  // ── Manual retry (failed bubble → tap) ───────────────────────────────────────
  const retryEntry = async (clientId: string) => {
    if (!socket) return;
    await chatQueue.resetRetries(clientId);
    setSendStates((prev) => ({ ...prev, [clientId]: 'queued' }));
    const entry = await chatQueue.get(clientId);
    if (!entry) return;
    if (entry.kind === 'text') {
      socket.emit(
        'send_message',
        {
          content: entry.encryptedContent,
          senderAesKey: entry.senderAesKey,
          recipientAesKey: entry.recipientAesKey,
          clientId,
        },
        (ack: { status: 'ok' | 'error'; message?: ChatMessage; error?: string }) => {
          if (ack?.status === 'ok' && ack.message) reconcileAck(clientId, ack.message);
          else markFailed(clientId, ack?.error ?? 'Retry failed');
        }
      );
    } else {
      // Media — if URL is already cached on the queue entry we just resend; otherwise
      // we surface an "upload again" hint. The user re-picks; in practice the queued
      // file URI from the first try is no longer guaranteed to be valid.
      if (entry.mediaUrl) {
        socket.emit(
          'send_message',
          { mediaUrl: entry.mediaUrl, mediaType: entry.mediaType, clientId },
          (ack: { status: 'ok' | 'error'; message?: ChatMessage; error?: string }) => {
            if (ack?.status === 'ok' && ack.message) reconcileAck(clientId, ack.message);
            else markFailed(clientId, ack?.error ?? 'Retry failed');
          }
        );
      } else {
        Alert.alert(
          'File no longer available',
          'The original file was cleaned up. Please re-attach it from the picker.'
        );
      }
    }
  };

  const removeFailed = async (clientId: string) => {
    await chatQueue.remove(clientId);
    setSendStates((prev) => {
      const next = { ...prev };
      delete next[clientId];
      return next;
    });
    setMessages((prev) => prev.filter((m) => m.id !== clientId));
    setDecryptedCache((prev) => {
      const next = { ...prev };
      delete next[clientId];
      return next;
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraft('');
  };

  // ── Long-press menu actions ──────────────────────────────────────────────────
  const closeMenu = () => setActionFor(null);

  const handleReact = (emoji: string) => {
    if (!actionFor || !socket) return;
    if (actionFor.id.startsWith('temp-')) {
      closeMenu();
      return;
    }
    socket.emit('react_message', { messageId: actionFor.id, emoji });
    setMessages((prev) =>
      prev.map((m) =>
        m.id === actionFor.id
          ? { ...m, reactions: { ...(m.reactions ?? {}), [user?.id ?? '']: emoji } }
          : m
      )
    );
    closeMenu();
  };

  const handleCopy = async () => {
    if (!actionFor) {
      closeMenu();
      return;
    }
    const plain = decryptedCache[actionFor.id];
    // Skip empty AND the locked sentinel — without this guard, "Copy" on a
    // bubble that failed to decrypt would put the literal "__LOCKED__"
    // string in the clipboard.
    if (!plain || plain === '__LOCKED__') {
      closeMenu();
      return;
    }
    await Clipboard.setStringAsync(plain);
    closeMenu();
  };

  const handleEdit = () => {
    if (!actionFor) {
      closeMenu();
      return;
    }
    if (actionFor.id.startsWith('temp-')) {
      closeMenu();
      return;
    }
    const plain = decryptedCache[actionFor.id];
    // Skip the locked sentinel — without this, editing one of your OWN
    // pre-keypair-rotation messages would pre-fill the composer with the
    // literal "__LOCKED__" sentinel string.
    if (!plain || plain === '__LOCKED__') {
      closeMenu();
      return;
    }
    setEditingId(actionFor.id);
    setDraft(plain);
    closeMenu();
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const handleDelete = (type: 'for_me' | 'for_everyone') => {
    if (!actionFor) return;
    const target = actionFor;
    const isMine = target.senderId === user?.id;
    closeMenu();

    if (type === 'for_me') {
      if (isMine && socket && !target.id.startsWith('temp-')) {
        socket.emit('delete_message', { messageId: target.id, type: 'for_me' });
      }
      addLocalHide(target.id);
      return;
    }

    if (!isMine) return;
    if (!socket) {
      Alert.alert('Not connected', 'Cannot delete right now — check your connection.');
      return;
    }
    if (target.id.startsWith('temp-')) return;

    socket.emit('delete_message', { messageId: target.id, type: 'for_everyone' });
    setMessages((prev) =>
      prev.map((m) =>
        m.id === target.id
          ? {
              ...m,
              deletedForEveryone: true,
              deletedAt: new Date().toISOString(),
              content: null,
              mediaUrl: null,
              mediaType: null,
            }
          : m
      )
    );
  };

  // ── Attachments (unchanged transports) ───────────────────────────────────────
  // Image/video/file go via Cloudinary URL with no encryption — matches web's behavior
  // (web doesn't support media attachments via the encrypted path).
  const closeSheetAndRun = async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    setAttachOpen(false);
    if (Platform.OS === 'ios') {
      await awaitSheetDismiss();
    } else {
      await new Promise((r) => setTimeout(r, 50));
    }
    try {
      return await fn();
    } catch (e: any) {
      Alert.alert('Could not open picker', e?.message ?? 'Try again.');
    }
    return undefined;
  };

  const sendBase64Attachment = async (
    source: { base64?: string; uri?: string },
    kind: ChatAttachmentKind,
    mime: string
  ) => {
    if (!socket) {
      Alert.alert('Not connected', 'Still reaching the chat server. Try again in a moment.');
      return;
    }
    setUploadProgress(0);
    try {
      let base64 = source.base64;
      if (!base64 && source.uri) {
        base64 = await FileSystem.readAsStringAsync(source.uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
      }
      if (!base64 || base64.length < 10) {
        throw new Error('Could not read the selected file.');
      }
      const dataUrl = `data:${mime};base64,${base64}`;
      setUploadProgress(0.4);
      const { url } = await chatApi.uploadAttachment(dataUrl, kind);
      if (!url) throw new Error('Upload finished but no URL was returned.');
      setUploadProgress(0.95);

      const clientId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      optimisticAppend({ clientId, mediaUrl: url, mediaType: kind });
      setSendStates((prev) => ({ ...prev, [clientId]: 'queued' }));
      await chatQueue.enqueue({
        kind: 'media',
        clientId,
        mediaUrl: url,
        mediaUri: source.uri ?? null,
        mediaType: kind,
        mime,
        encryptedContent: null,
        senderAesKey: null,
        recipientAesKey: null,
        retries: 0,
        lastError: null,
        queuedAt: Date.now(),
      });

      socket.emit(
        'send_message',
        { mediaUrl: url, mediaType: kind, clientId },
        (ack: { status: 'ok' | 'error'; message?: ChatMessage; error?: string }) => {
          if (ack?.status === 'ok' && ack.message) reconcileAck(clientId, ack.message);
          else markFailed(clientId, ack?.error ?? 'Send failed');
        }
      );
    } catch (e: any) {
      const status = e?.response?.status;
      const msg =
        status === 401
          ? 'Your session expired. Please sign in again.'
          : e?.response?.data?.error ??
            (e?.message?.includes('Network')
              ? 'Cannot reach the server. Is the backend running?'
              : e?.message ?? 'Upload failed. Try again.');
      Alert.alert('Upload failed', msg);
    } finally {
      setUploadProgress(null);
    }
  };

  const sendMultipartAttachment = async (uri: string, kind: ChatAttachmentKind, mime: string) => {
    if (!socket) {
      Alert.alert('Not connected', 'Still reaching the chat server. Try again in a moment.');
      return;
    }
    const accessToken = await tokens.getAccess();
    if (!accessToken) {
      Alert.alert('Session expired', 'Please sign in again.');
      return;
    }

    setUploadProgress(0);
    try {
      const task = FileSystem.createUploadTask(
        chatApi.multipartUploadUrl(),
        uri,
        {
          httpMethod: 'POST',
          uploadType: FileSystem.FileSystemUploadType.MULTIPART,
          fieldName: 'file',
          mimeType: mime,
          parameters: { kind },
          headers: { Authorization: `Bearer ${accessToken}` },
        },
        (p) => {
          if (p.totalBytesExpectedToSend > 0) {
            setUploadProgress(p.totalBytesSent / p.totalBytesExpectedToSend);
          }
        }
      );
      const result = await task.uploadAsync();
      if (!result || result.status < 200 || result.status >= 300) {
        const detail = (() => {
          try {
            return JSON.parse(result?.body ?? '{}').error ?? `HTTP ${result?.status}`;
          } catch {
            return `HTTP ${result?.status}`;
          }
        })();
        throw new Error(detail);
      }
      const { url } = JSON.parse(result.body) as { url: string };
      if (!url) throw new Error('Upload finished but no URL was returned.');

      const clientId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      optimisticAppend({ clientId, mediaUrl: url, mediaType: kind });
      setSendStates((prev) => ({ ...prev, [clientId]: 'queued' }));
      await chatQueue.enqueue({
        kind: 'media',
        clientId,
        mediaUrl: url,
        mediaUri: uri,
        mediaType: kind,
        mime,
        encryptedContent: null,
        senderAesKey: null,
        recipientAesKey: null,
        retries: 0,
        lastError: null,
        queuedAt: Date.now(),
      });
      socket.emit(
        'send_message',
        { mediaUrl: url, mediaType: kind, clientId },
        (ack: { status: 'ok' | 'error'; message?: ChatMessage; error?: string }) => {
          if (ack?.status === 'ok' && ack.message) reconcileAck(clientId, ack.message);
          else markFailed(clientId, ack?.error ?? 'Send failed');
        }
      );
    } catch (e: any) {
      Alert.alert('Upload failed', e?.message ?? 'Try again.');
    } finally {
      setUploadProgress(null);
    }
  };

  const sendAttachment = async (
    source: { uri: string; base64?: string; size?: number },
    kind: ChatAttachmentKind,
    mime: string
  ) => {
    const big = (source.size ?? 0) > BASE64_LIMIT;
    if (kind === 'video' || kind === 'file' || big) {
      await sendMultipartAttachment(source.uri, kind, mime);
    } else {
      await sendBase64Attachment({ base64: source.base64, uri: source.uri }, kind, mime);
    }
  };

  const pickPhoto = (source: 'camera' | 'library') =>
    closeSheetAndRun(async () => {
      if (source === 'camera') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) throw new Error('Camera permission was denied.');
      } else {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) throw new Error('Photo library permission was denied.');
      }
      const opts: ImagePicker.ImagePickerOptions = {
        mediaTypes: ['images'],
        quality: 0.7,
        base64: true,
      };
      const r =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync(opts)
          : await ImagePicker.launchImageLibraryAsync(opts);
      if (r.canceled || !r.assets?.[0]) return;
      const a = r.assets[0];
      await sendAttachment(
        { uri: a.uri, base64: a.base64 ?? undefined, size: a.fileSize ?? undefined },
        'image',
        a.mimeType ?? 'image/jpeg'
      );
    });

  const pickVideo = () =>
    closeSheetAndRun(async () => {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) throw new Error('Photo library permission was denied.');
      const r = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['videos'],
        videoMaxDuration: 30,
        quality: 0.6,
      });
      if (r.canceled || !r.assets?.[0]) return;
      const a = r.assets[0];
      await sendAttachment(
        { uri: a.uri, size: a.fileSize ?? undefined },
        'video',
        a.mimeType ?? 'video/mp4'
      );
    });

  const pickDocument = () =>
    closeSheetAndRun(async () => {
      const r = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
      if (r.canceled || !r.assets?.[0]) return;
      const a = r.assets[0];
      await sendAttachment(
        { uri: a.uri, size: a.size ?? undefined },
        'file',
        a.mimeType ?? 'application/octet-stream'
      );
    });

  // ── Voice recording ──────────────────────────────────────────────────────────
  const startRecordingTick = () => {
    setRecordSeconds(0);
    recordTickRef.current = setInterval(() => setRecordSeconds((s) => s + 1), 1000);
  };
  const stopRecordingTick = () => {
    if (recordTickRef.current) clearInterval(recordTickRef.current);
    recordTickRef.current = null;
  };

  useEffect(() => {
    return () => {
      stopRecordingTick();
    };
  }, []);

  const startRecording = async () => {
    try {
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Mic permission needed', 'Enable microphone access in Settings to send voice messages.');
        return;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const rec = new Audio.Recording();
      await rec.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await rec.startAsync();
      setRecording(rec);
      startRecordingTick();
    } catch (e: any) {
      Alert.alert('Could not start recording', e?.message ?? 'Try again.');
    }
  };

  // Stop recording and move to PREVIEW state — does not send yet. The user can play
  // back, discard, or send from the preview UI. This matches the WhatsApp / iMessage
  // voice-note convention; the previous one-tap stop-and-send was too easy to
  // accidentally fire.
  const stopAndPreviewRecording = async () => {
    const rec = recording;
    if (!rec) return;
    try {
      await rec.stopAndUnloadAsync();
      stopRecordingTick();
      setRecording(null);
      const uri = rec.getURI();
      if (!uri) return;
      // Recording status carries the final duration; fall back to our tick counter
      // (in seconds) if it isn't reported by the platform.
      const status = await rec.getStatusAsync().catch(() => null);
      const durationMs =
        status && typeof status.durationMillis === 'number' && status.durationMillis > 0
          ? status.durationMillis
          : recordSeconds * 1000;
      setAudioPreview({ uri, durationMs });
    } catch (e: any) {
      Alert.alert('Could not save recording', e?.message ?? 'Try again.');
    }
  };

  const cancelRecording = async () => {
    const rec = recording;
    if (!rec) return;
    try {
      await rec.stopAndUnloadAsync();
    } catch {
      // ignore
    }
    stopRecordingTick();
    setRecording(null);
  };

  // ── Audio preview controls ──────────────────────────────────────────────────
  // The preview sound is created lazily on first play. We unload it on discard /
  // send / unmount so we don't accumulate native audio handles across recordings.
  const previewToggle = async () => {
    if (!audioPreview) return;
    try {
      if (previewPlaying) {
        await previewSoundRef.current?.pauseAsync();
        setPreviewPlaying(false);
        return;
      }
      // iOS routes recording-mode audio through the earpiece; switch back to playback
      // mode so the preview plays through the loud speaker like the user expects.
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
      if (!previewSoundRef.current) {
        const { sound } = await Audio.Sound.createAsync({ uri: audioPreview.uri });
        previewSoundRef.current = sound;
        sound.setOnPlaybackStatusUpdate((s) => {
          if (s.isLoaded && s.didJustFinish) {
            setPreviewPlaying(false);
            sound.setPositionAsync(0).catch(() => undefined);
          }
        });
      }
      await previewSoundRef.current.playAsync();
      setPreviewPlaying(true);
    } catch (e: any) {
      Alert.alert('Could not play preview', e?.message ?? 'Try again.');
    }
  };

  const discardAudioPreview = async () => {
    await previewSoundRef.current?.unloadAsync().catch(() => undefined);
    previewSoundRef.current = null;
    setPreviewPlaying(false);
    // Best-effort cleanup of the temp file Expo wrote during recording.
    if (audioPreview?.uri) {
      FileSystem.deleteAsync(audioPreview.uri, { idempotent: true }).catch(() => undefined);
    }
    setAudioPreview(null);
  };

  const sendAudioPreview = async () => {
    if (!audioPreview) return;
    const uri = audioPreview.uri;
    // Tear down the player BEFORE the upload starts so we're not holding a native
    // handle to a file we're about to upload.
    await previewSoundRef.current?.unloadAsync().catch(() => undefined);
    previewSoundRef.current = null;
    setPreviewPlaying(false);
    setAudioPreview(null);
    await sendAttachment(
      { uri },
      'audio',
      Platform.OS === 'ios' ? 'audio/m4a' : 'audio/mp4'
    );
  };

  // Unload the preview sound on screen unmount so we don't leak the native handle.
  useEffect(() => {
    return () => {
      previewSoundRef.current?.unloadAsync().catch(() => undefined);
      previewSoundRef.current = null;
    };
  }, []);

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <ScreenContainer>
      <TopBar
        leadingElement={null}
        showBack
        centerElement={
          <View style={{ alignItems: 'center', flexShrink: 1, maxWidth: '100%' }}>
            <View
              style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 1 }}
            >
              <Avatar
                uri={user?.partnerAvatar ?? null}
                name={user?.partnerName ?? 'Partner'}
                size={32}
                ring="gold"
              />
              <View style={{ marginLeft: 10, flexShrink: 1 }}>
                <Text variant="bodyMedium" numberOfLines={1} style={{ maxWidth: 180 }}>
                  {user?.partnerName ?? 'Partner'}
                </Text>
                <Text
                  variant="caption"
                  numberOfLines={1}
                  style={{
                    color: partnerTyping ? theme.colors.success : theme.colors.muted,
                    fontStyle: 'italic',
                  }}
                >
                  {partnerTyping ? 'Typing…' : partnerOnline ? 'Active now' : 'Offline'}
                </Text>
              </View>
            </View>
          </View>
        }
        rightActions={[
          {
            icon: 'video',
            onPress: () => Alert.alert('Coming soon', 'Video calls will arrive in a later update.'),
          },
        ]}
      />

      {socketStatus !== 'connected' && (
        <View
          style={[
            styles.connectionBanner,
            {
              backgroundColor:
                socketStatus === 'error' ? 'rgba(232,99,122,0.16)' : theme.colors.surface,
              borderColor:
                socketStatus === 'error' ? 'rgba(232,99,122,0.4)' : theme.colors.hairline,
            },
          ]}
        >
          <View
            style={[
              styles.recordDot,
              {
                backgroundColor:
                  socketStatus === 'error' ? theme.colors.destructive : theme.colors.muted,
              },
            ]}
          />
          <Text variant="caption" color="muted" style={{ marginLeft: 8 }}>
            {socketStatus === 'error'
              ? 'Cannot reach the server. Check the backend.'
              : 'Connecting…'}
          </Text>
        </View>
      )}

      {!cryptoReady && (
        <View
          style={[
            styles.connectionBanner,
            { backgroundColor: theme.colors.surface, borderColor: theme.colors.hairline },
          ]}
        >
          <Feather name="lock" size={12} color={theme.colors.muted} />
          <Text variant="caption" color="muted" style={{ marginLeft: 8, flex: 1 }}>
            Securing your messages…
          </Text>
        </View>
      )}

      {cryptoReady && !partnerPubKey && user?.partnerId && (
        <View
          style={[
            styles.connectionBanner,
            { backgroundColor: theme.colors.surface, borderColor: theme.colors.hairline },
          ]}
        >
          <Feather name="info" size={12} color={theme.colors.muted} />
          <Text variant="caption" color="muted" style={{ marginLeft: 8 }}>
            Partner hasn't joined chat yet — messages will be unencrypted until they sign in.
          </Text>
        </View>
      )}

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.select({ ios: 0, android: 24 })}
      >
        <FlatList
          ref={flatListRef}
          data={visibleMessages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: theme.screenPadding, gap: 8 }}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
          renderItem={({ item }) => (
            <Bubble
              msg={item}
              mineId={user?.id}
              plaintext={decryptedCache[item.id]}
              sendState={sendStates[item.id]}
              onLongPress={() => setActionFor(item)}
              onMenu={() => setActionFor(item)}
              onRetry={() => retryEntry(item.id)}
              onDeleteFailed={() => removeFailed(item.id)}
            />
          )}
        />

        {editingId && (
          <View
            style={[
              styles.editBanner,
              { backgroundColor: theme.colors.surface, borderColor: theme.colors.hairline },
            ]}
          >
            <Feather name="edit-2" size={14} color={theme.colors.primary} />
            <Text variant="bodySmall" weight="medium" style={{ marginLeft: 8, flex: 1 }}>
              Editing message
            </Text>
            <Pressable onPress={cancelEdit} hitSlop={8}>
              <Feather name="x" size={16} color={theme.colors.muted} />
            </Pressable>
          </View>
        )}

        {uploadProgress !== null && (
          <View
            style={[
              styles.uploadBar,
              { backgroundColor: theme.colors.surface, borderColor: theme.colors.hairline },
            ]}
          >
            <View
              style={[
                styles.uploadFill,
                {
                  width: `${Math.min(100, Math.round(uploadProgress * 100))}%`,
                  backgroundColor: theme.colors.primary,
                },
              ]}
            />
            <Text variant="caption" color="muted" style={styles.uploadLabel}>
              Uploading… {Math.round(uploadProgress * 100)}%
            </Text>
          </View>
        )}

        {recording ? (
          <View style={[styles.composer, { borderTopColor: theme.colors.hairline }]}>
            <View
              style={[
                styles.recordPill,
                { backgroundColor: theme.colors.surface, borderColor: theme.colors.hairline },
              ]}
            >
              <View style={[styles.recordDot]} />
              <Text variant="bodyMedium" style={{ marginLeft: 10 }}>
                Recording…
              </Text>
              <Text variant="bodySmall" color="muted" style={{ marginLeft: 8 }}>
                {String(Math.floor(recordSeconds / 60)).padStart(1, '0')}:
                {String(recordSeconds % 60).padStart(2, '0')}
              </Text>
            </View>
            <Pressable
              onPress={cancelRecording}
              style={[styles.iconBtn, { backgroundColor: theme.colors.surface }]}
            >
              <Feather name="x" size={18} color={theme.colors.foreground} />
            </Pressable>
            {/* Stop → moves into preview state (does NOT send immediately). The
                square icon mirrors the iMessage / WhatsApp convention. */}
            <Pressable onPress={stopAndPreviewRecording}>
              <LinearGradient
                colors={theme.gradientStops as unknown as readonly [string, string]}
                style={[styles.iconBtn, theme.shadows.glowSoft]}
              >
                <Feather name="square" size={14} color="#fff" />
              </LinearGradient>
            </Pressable>
          </View>
        ) : audioPreview ? (
          /* ────── Voice-note preview ────────────────────────────────────────
             Sits between record and send: tap play to verify the take, tap trash
             to discard + re-record, tap send to commit. */
          <View style={[styles.composer, { borderTopColor: theme.colors.hairline }]}>
            <Pressable
              onPress={discardAudioPreview}
              style={[styles.iconBtn, { backgroundColor: theme.colors.surface }]}
              hitSlop={6}
            >
              <Feather name="trash-2" size={18} color={theme.colors.destructive} />
            </Pressable>
            <View
              style={[
                styles.recordPill,
                { backgroundColor: theme.colors.surface, borderColor: theme.colors.hairline },
              ]}
            >
              <Pressable
                onPress={previewToggle}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  backgroundColor: theme.colors.primarySoft,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                hitSlop={6}
              >
                <Feather
                  name={previewPlaying ? 'pause' : 'play'}
                  size={14}
                  color={theme.colors.foreground}
                />
              </Pressable>
              <View style={[styles.waveform, { flex: 1, marginLeft: 12 }]}>
                {Array.from({ length: 18 }).map((_, i) => (
                  <View
                    key={i}
                    style={[
                      styles.waveBar,
                      {
                        height: 4 + ((i * 11) % 18),
                        backgroundColor: previewPlaying
                          ? theme.colors.primary
                          : theme.colors.muted,
                      },
                    ]}
                  />
                ))}
              </View>
              <Text variant="caption" color="muted" style={{ marginLeft: 8 }}>
                {`${String(Math.floor(audioPreview.durationMs / 60000)).padStart(1, '0')}:${String(
                  Math.floor((audioPreview.durationMs % 60000) / 1000)
                ).padStart(2, '0')}`}
              </Text>
            </View>
            <Pressable onPress={sendAudioPreview} hitSlop={6}>
              <LinearGradient
                colors={theme.gradientStops as unknown as readonly [string, string]}
                style={[styles.iconBtn, theme.shadows.glowSoft]}
              >
                <Feather name="send" size={16} color="#fff" />
              </LinearGradient>
            </Pressable>
          </View>
        ) : (
          <View
            style={[
              styles.composer,
              { borderTopColor: theme.colors.hairline, backgroundColor: theme.colors.glassStrong },
            ]}
          >
            <Pressable
              onPress={() => setAttachOpen(true)}
              style={[styles.iconBtn, { backgroundColor: theme.colors.surface }]}
              disabled={!!editingId}
            >
              <Feather
                name="plus"
                size={18}
                color={editingId ? theme.colors.muted : theme.colors.foreground}
              />
            </Pressable>
            <View
              style={[
                styles.inputWrap,
                { backgroundColor: theme.colors.surface, borderColor: theme.colors.hairline },
              ]}
            >
              <TextInput
                ref={inputRef}
                value={draft}
                onChangeText={(t) => {
                  setDraft(t);
                  socket?.emit('typing', t.length > 0);
                }}
                onBlur={() => socket?.emit('typing', false)}
                // First name only — partner names like "Vishal Singh Kushwaha" wrap to
                // two lines inside the composer pill, breaking the bottom bar layout.
                placeholder={
                  editingId
                    ? 'Edit your message…'
                    : `Message ${(user?.partnerName ?? 'them').split(' ')[0]}…`
                }
                placeholderTextColor={theme.colors.muted}
                // textAlignVertical: 'top' is the key to natural multiline growth on
                // Android — without it, lines drift toward the vertical center of the
                // pill instead of stacking from the top edge as text wraps. iOS does
                // this correctly by default but the prop is harmless there.
                // includeFontPadding: false strips Android's default font metric
                // padding so single-line text sits on the same baseline as iOS and
                // the wrap's symmetric paddingVertical actually centers it.
                textAlignVertical="top"
                style={[
                  styles.composerInput,
                  {
                    color: theme.colors.foreground,
                    fontFamily: theme.typography.body.fontFamily,
                  },
                  Platform.OS === 'android' && { includeFontPadding: false },
                ]}
                multiline
              />
            </View>
            {draft.trim().length === 0 && !editingId ? (
              <Pressable
                onPress={startRecording}
                style={[styles.iconBtn, { backgroundColor: theme.colors.surface }]}
              >
                <Feather name="mic" size={18} color={theme.colors.foreground} />
              </Pressable>
            ) : (
              <Pressable onPress={sendText}>
                <LinearGradient
                  colors={theme.gradientStops as unknown as readonly [string, string]}
                  style={[styles.iconBtn, theme.shadows.glowSoft]}
                >
                  <Feather name={editingId ? 'check' : 'send'} size={16} color="#fff" />
                </LinearGradient>
              </Pressable>
            )}
          </View>
        )}
      </KeyboardAvoidingView>

      {/* ────── Attachment sheet ────── */}
      <Modal
        visible={attachOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setAttachOpen(false)}
        onDismiss={Platform.OS === 'ios' ? handleSheetDismiss : undefined}
      >
        <Pressable style={styles.scrim} onPress={() => setAttachOpen(false)}>
          <Pressable
            onPress={() => {}}
            style={[styles.sheet, { backgroundColor: theme.colors.surface }]}
          >
            <View style={[styles.handle, { backgroundColor: theme.colors.hairlineStrong }]} />
            <Text variant="h3" align="center" style={{ marginTop: 16, marginBottom: 16 }}>
              Send something
            </Text>
            <Button label="Take a photo" leadingIcon="camera" fullWidth onPress={() => pickPhoto('camera')} />
            <Button
              label="Photo library"
              leadingIcon="image"
              variant="secondary"
              style={{ marginTop: 12 }}
              fullWidth
              onPress={() => pickPhoto('library')}
            />
            <Button
              label="Video"
              leadingIcon="film"
              variant="secondary"
              style={{ marginTop: 12 }}
              fullWidth
              onPress={pickVideo}
            />
            <Button
              label="Document"
              leadingIcon="paperclip"
              variant="secondary"
              style={{ marginTop: 12 }}
              fullWidth
              onPress={pickDocument}
            />
          </Pressable>
        </Pressable>
      </Modal>

      {/* ────── Long-press action menu ────── */}
      <Modal visible={!!actionFor} transparent animationType="fade" onRequestClose={closeMenu}>
        <Pressable style={styles.actionScrim} onPress={closeMenu}>
          {actionFor && (
            <Pressable
              onPress={() => {}}
              style={[
                styles.actionMenu,
                { backgroundColor: theme.colors.surface, borderColor: theme.colors.hairline },
              ]}
            >
              {!actionFor.deletedForEveryone && (
                <View style={styles.reactionRow}>
                  {QUICK_REACTIONS.map((emoji) => {
                    const isMine = actionFor.reactions?.[user?.id ?? ''] === emoji;
                    return (
                      <Pressable
                        key={emoji}
                        onPress={() => handleReact(emoji)}
                        style={[
                          styles.reactionBtn,
                          isMine && { backgroundColor: theme.colors.primarySoft },
                        ]}
                      >
                        <Text style={{ fontSize: 24, lineHeight: 28 }}>{emoji}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}

              <View style={[styles.divider, { backgroundColor: theme.colors.hairline }]} />

              {actionFor.content && !actionFor.deletedForEveryone && (
                <ActionRow icon="copy" label="Copy" onPress={handleCopy} />
              )}
              {actionFor.senderId === user?.id &&
                actionFor.content &&
                !actionFor.mediaUrl &&
                !actionFor.deletedForEveryone && (
                  <ActionRow icon="edit-2" label="Edit" onPress={handleEdit} />
                )}
              {!actionFor.deletedForEveryone && (
                <ActionRow
                  icon="eye-off"
                  label="Hide on my device"
                  onPress={() => handleDelete('for_me')}
                  destructive
                />
              )}
              {actionFor.senderId === user?.id && !actionFor.deletedForEveryone && (
                <ActionRow
                  icon="trash-2"
                  label="Delete for both of us"
                  onPress={() => handleDelete('for_everyone')}
                  destructive
                />
              )}
            </Pressable>
          )}
        </Pressable>
      </Modal>
    </ScreenContainer>
  );
}

function ActionRow({
  icon,
  label,
  onPress,
  destructive,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  onPress: () => void;
  destructive?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.actionRow, pressed && { opacity: 0.6 }]}>
      <Feather
        name={icon}
        size={18}
        color={destructive ? theme.colors.destructive : theme.colors.foreground}
      />
      <Text
        variant="bodyMedium"
        style={{
          marginLeft: 12,
          color: destructive ? theme.colors.destructive : theme.colors.foreground,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function Bubble({
  msg,
  mineId,
  plaintext,
  sendState,
  onLongPress,
  onMenu,
  onRetry,
  onDeleteFailed,
}: {
  msg: ChatMessage;
  mineId?: string;
  plaintext: string | undefined;
  sendState?: SendStatus;
  onLongPress: () => void;
  onMenu: () => void;
  onRetry: () => void;
  onDeleteFailed: () => void;
}) {
  const theme = useTheme();
  const mine = msg.senderId === mineId;

  if (msg.deletedForEveryone) {
    const ts = msg.deletedAt ? new Date(msg.deletedAt) : new Date(msg.createdAt);
    return (
      <View style={{ alignItems: mine ? 'flex-end' : 'flex-start' }}>
        <View
          style={[
            styles.bubble,
            styles.tombstone,
            { backgroundColor: theme.colors.surface, borderColor: theme.colors.hairline },
          ]}
        >
          <Feather name="slash" size={14} color={theme.colors.muted} />
          <Text variant="bodySmall" color="muted" style={{ marginLeft: 8, fontStyle: 'italic' }}>
            {mine ? 'You deleted this message' : 'This message was deleted'}
          </Text>
        </View>
        <Text variant="caption" color="muted" style={{ marginTop: 4, marginHorizontal: 4 }}>
          {ts.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
        </Text>
      </View>
    );
  }

  const wrapper = (children: React.ReactNode) =>
    mine ? (
      <LinearGradient
        colors={theme.gradientStops as unknown as readonly [string, string]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          styles.bubble,
          { borderBottomRightRadius: 6, padding: msg.mediaUrl ? 6 : 12 },
          theme.shadows.glowSoft,
        ]}
      >
        {children}
      </LinearGradient>
    ) : (
      <View
        style={[
          styles.bubble,
          {
            backgroundColor: theme.colors.surfaceAlt,
            borderBottomLeftRadius: 6,
            padding: msg.mediaUrl ? 6 : 12,
          },
        ]}
      >
        {children}
      </View>
    );

  let inner: React.ReactNode = null;
  if (msg.mediaUrl && msg.mediaType === 'image') {
    inner = <Image source={{ uri: msg.mediaUrl }} style={styles.mediaImage} resizeMode="cover" />;
  } else if (msg.mediaUrl && msg.mediaType === 'video') {
    inner = (
      <View
        style={[
          styles.mediaImage,
          { backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
        ]}
      >
        <Feather name="play-circle" size={48} color="#fff" />
      </View>
    );
  } else if (msg.mediaUrl && msg.mediaType === 'audio') {
    inner = <VoiceBubble url={msg.mediaUrl} mine={mine} />;
  } else if (msg.mediaUrl && msg.mediaType === 'file') {
    inner = (
      <View
        style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, paddingVertical: 2 }}
      >
        <Feather name="paperclip" size={18} color={mine ? '#fff' : theme.colors.foreground} />
        <Text
          variant="bodySmall"
          style={{ color: mine ? '#fff' : theme.colors.foreground, marginLeft: 8 }}
        >
          Attachment
        </Text>
      </View>
    );
  } else {
    // Text bubble — three states:
    //   - plaintext set, not __LOCKED__: render normally
    //   - plaintext set to the __LOCKED__ sentinel: render the friendly
    //     "Locked. Sent from a previous device." copy in italic + muted
    //     styling. No scary lock emoji, no "decryption error" wording —
    //     the failure is honestly communicated as a key-rotation artifact
    //     rather than as something broken.
    //   - plaintext undefined: still decrypting, show italic placeholder.
    const locked = plaintext === '__LOCKED__';
    const text = locked
      ? 'Locked. Sent from a previous device.'
      : plaintext !== undefined
        ? plaintext
        : msg.content === null
          ? ''
          : 'Decrypting…';
    const isPlaceholder = locked || (plaintext === undefined && msg.content !== null);
    inner = (
      <Text
        variant="body"
        style={{
          color: mine ? '#fff' : theme.colors.foreground,
          fontStyle: isPlaceholder ? 'italic' : 'normal',
          opacity: isPlaceholder ? 0.7 : 1,
        }}
      >
        {text}
      </Text>
    );
  }

  const reactionEntries = Object.entries(msg.reactions ?? {});
  const reactionCounts = reactionEntries.reduce<Record<string, number>>((acc, [, emoji]) => {
    if (!emoji) return acc;
    acc[emoji] = (acc[emoji] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <Pressable
      onLongPress={onLongPress}
      delayLongPress={200}
      style={{ alignItems: mine ? 'flex-end' : 'flex-start' }}
    >
      <View
        style={{
          maxWidth: '78%',
          flexDirection: mine ? 'row-reverse' : 'row',
          alignItems: 'flex-end',
        }}
      >
        <View>{wrapper(inner)}</View>
        <Pressable
          onPress={onMenu}
          hitSlop={8}
          style={[
            styles.bubbleMenuBtn,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.hairline,
              [mine ? 'marginRight' : 'marginLeft']: 6,
            },
          ]}
        >
          <Feather name="more-vertical" size={14} color={theme.colors.muted} />
        </Pressable>
      </View>
      <View style={{ maxWidth: '78%', alignSelf: mine ? 'flex-end' : 'flex-start' }}>
        {Object.keys(reactionCounts).length > 0 && (
          <View
            style={[
              styles.reactionPill,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.hairline,
                alignSelf: mine ? 'flex-end' : 'flex-start',
              },
            ]}
          >
            {Object.entries(reactionCounts).map(([emoji, count]) => (
              <View key={emoji} style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ fontSize: 13, lineHeight: 16 }}>{emoji}</Text>
                {count > 1 && (
                  <Text variant="caption" color="muted" style={{ marginLeft: 2 }}>
                    {count}
                  </Text>
                )}
              </View>
            ))}
          </View>
        )}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            marginTop: 4,
            alignSelf: mine ? 'flex-end' : 'flex-start',
          }}
        >
          {msg.editedAt && (
            <Text variant="caption" color="muted" style={{ marginRight: 6, fontStyle: 'italic' }}>
              edited
            </Text>
          )}
          <Text variant="caption" color="muted">
            {new Date(msg.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
          </Text>
          {mine && (
            <SendStateIndicator
              status={msg.status}
              sendState={sendState}
              onRetry={onRetry}
              onDeleteFailed={onDeleteFailed}
            />
          )}
        </View>
      </View>
    </Pressable>
  );
}

// Combined indicator: in-flight clock, failed exclamation+retry, or read-receipt ticks.
// Priority order: failed > queued > server status.
function SendStateIndicator({
  status,
  sendState,
  onRetry,
  onDeleteFailed,
}: {
  status: ChatMessage['status'];
  sendState?: SendStatus;
  onRetry: () => void;
  onDeleteFailed: () => void;
}) {
  const theme = useTheme();
  if (sendState === 'failed') {
    return (
      <Pressable
        onPress={onRetry}
        onLongPress={onDeleteFailed}
        hitSlop={8}
        style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 6 }}
      >
        <Feather name="alert-circle" size={12} color={theme.colors.destructive} />
        <Text
          variant="caption"
          style={{ color: theme.colors.destructive, marginLeft: 4, fontWeight: '600' }}
        >
          Tap to retry
        </Text>
      </Pressable>
    );
  }
  if (sendState === 'queued') {
    return <Feather name="clock" size={10} color={theme.colors.muted} style={{ marginLeft: 4 }} />;
  }
  const color = status === 'read' ? theme.colors.success : theme.colors.muted;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 4 }}>
      <Feather name="check" size={10} color={color} />
      {status !== 'sent' && <Feather name="check" size={10} color={color} style={{ marginLeft: -3 }} />}
    </View>
  );
}

function VoiceBubble({ url, mine }: { url: string; mine: boolean }) {
  const theme = useTheme();
  const soundRef = useRef<Audio.Sound | null>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    return () => {
      soundRef.current?.unloadAsync();
    };
  }, []);

  const toggle = async () => {
    if (playing) {
      await soundRef.current?.pauseAsync();
      setPlaying(false);
      return;
    }
    if (!soundRef.current) {
      const { sound } = await Audio.Sound.createAsync({ uri: url });
      soundRef.current = sound;
      sound.setOnPlaybackStatusUpdate((s) => {
        if (s.isLoaded && s.didJustFinish) setPlaying(false);
      });
    }
    await soundRef.current.playAsync();
    setPlaying(true);
  };

  return (
    <Pressable onPress={toggle} style={{ flexDirection: 'row', alignItems: 'center', padding: 6 }}>
      <Feather name={playing ? 'pause' : 'play'} size={18} color={mine ? '#fff' : theme.colors.foreground} />
      <View style={[styles.waveform]}>
        {Array.from({ length: 14 }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.waveBar,
              {
                height: 4 + ((i * 7) % 14),
                backgroundColor: mine ? 'rgba(255,255,255,0.85)' : theme.colors.muted,
              },
            ]}
          />
        ))}
      </View>
      <Text variant="caption" style={{ color: mine ? '#fff' : theme.colors.muted, marginLeft: 8 }}>
        Voice
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bubble: { borderRadius: 20 },
  tombstone: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
  },
  composer: {
    flexDirection: 'row',
    // alignItems: 'flex-end' so the +, mic, and send buttons stay pinned to
    // the bottom edge of the pill as the input grows past one line — matches
    // the convention in modern messaging apps where the action affordances
    // never drift up with the typing cursor.
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    // Slightly tighter vertical padding now that the pill itself owns its
    // internal spacing — keeps the composer feeling compact when collapsed.
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  inputWrap: {
    flex: 1,
    // minHeight 40 matches iconBtn height so a single-line composer reads as
    // a row of equal-height pills. maxHeight 120 = ~5 lines at lineHeight 20;
    // beyond that the input scrolls internally and the chat list above stays
    // visible.
    minHeight: 40,
    maxHeight: 120,
    borderRadius: 20,
    borderWidth: 1,
    // Owning padding here (instead of relying on justifyContent: 'center')
    // means text grows top-down naturally on both platforms. The 10/14
    // split + lineHeight 20 places single-line text exactly on the pill's
    // vertical center without any flex tricks.
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  composerInput: {
    // No flex: 1 here — letting the TextInput size to its content (within the
    // wrap's maxHeight) is what gives us smooth top-down growth. The wrap
    // already owns horizontal padding, so the input itself runs edge-to-edge
    // inside it.
    padding: 0,
    margin: 0,
    fontSize: 15,
    // Explicit lineHeight is critical: without it, Android and iOS pick
    // different defaults driven by the font, and multiline wrapping ends up
    // with uneven gaps between lines that read as "cramped" on Android and
    // "loose" on iOS.
    lineHeight: 20,
  },
  mediaImage: { width: 220, height: 220, borderRadius: 16 },
  waveform: { flexDirection: 'row', alignItems: 'center', gap: 2, marginLeft: 12 },
  waveBar: { width: 2, borderRadius: 1 },
  recordPill: {
    flex: 1,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
  },
  recordDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#E8637A' },
  connectionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  uploadBar: {
    marginHorizontal: 12,
    marginBottom: 4,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  uploadFill: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    opacity: 0.6,
  },
  uploadLabel: { textAlign: 'center' },
  bubbleMenuBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: {
    padding: 24,
    paddingBottom: 32,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2 },
  editBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 12,
    marginBottom: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  reactionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    marginTop: -8,
    gap: 6,
  },
  actionScrim: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  actionMenu: { width: '100%', maxWidth: 320, borderRadius: 20, borderWidth: 1, paddingVertical: 8 },
  reactionRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  reactionBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: 12 },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
});
