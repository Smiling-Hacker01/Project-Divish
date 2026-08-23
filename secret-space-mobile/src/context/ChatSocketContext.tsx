import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { io, Socket } from 'socket.io-client';
import { apiBaseUrl, chatApi, tokens } from '@/api';
import { useAuth } from '@/context/AuthContext';

/**
 * Global chat socket — lives above the navigation stack and owns the single Socket.IO
 * connection for the authenticated session. Screens (ChatScreen, HomeScreen header) read
 * presence, unread count, and the raw socket from here instead of opening their own.
 *
 * Why a context (and not a screen-local socket): the unread badge on Home needs live
 * `receive_message` events even when ChatScreen isn't mounted; presence and read receipts
 * need to keep flowing if the user closes the chat and re-opens it.
 */

export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'error';

export type DiaryChangeEvent =
  | { action: 'created'; entryId: string }
  | { action: 'updated'; entryId: string }
  | { action: 'deleted'; entryId: string }
  | { action: 'reaction'; entryId: string };

type DiaryListener = (e: DiaryChangeEvent) => void;

export type CouponChangeEvent =
  | { action: 'created'; couponId: string }
  | { action: 'status'; couponId: string; status: string }
  | { action: 'fulfilled'; couponId: string }
  | { action: 'reviewed'; couponId: string }
  | { action: 'updated'; couponId: string }
  | { action: 'deleted'; couponId: string };

type CouponListener = (e: CouponChangeEvent) => void;

interface ChatSocketCtx {
  socket: Socket | null;
  status: ConnectionStatus;
  partnerOnline: boolean;
  unreadCount: number;
  resetUnread: () => void;
  // Subscribe to live diary-feed mutations. Returns an unsubscribe fn for cleanup.
  subscribeDiary: (fn: DiaryListener) => () => void;
  // Subscribe to coupon lifecycle changes (created, status, fulfilled, reviewed).
  subscribeCoupons: (fn: CouponListener) => () => void;
}

const Context = createContext<ChatSocketCtx | null>(null);

export function ChatSocketProvider({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, refreshProfile, logout } = useAuth();
  const [status, setStatus] = useState<ConnectionStatus>('idle');
  const [partnerOnline, setPartnerOnline] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const socketRef = useRef<Socket | null>(null);
  // Stash the latest refreshProfile + logout in refs so socket listeners (set up
  // once per connection) can call the *current* function without forcing a reconnect
  // when their identity changes.
  const refreshProfileRef = useRef(refreshProfile);
  const logoutRef = useRef(logout);
  useEffect(() => {
    refreshProfileRef.current = refreshProfile;
    logoutRef.current = logout;
  }, [refreshProfile, logout]);

  // Diary listeners — registered by screens (Feed/Detail) and fired whenever the server
  // broadcasts a `diary_changed` event. Kept in a ref so subscribing doesn't tear down
  // the socket. Multiple subscribers coexist (e.g. Feed + Detail both mounted).
  const diaryListenersRef = useRef<Set<DiaryListener>>(new Set());
  const subscribeDiary = useCallback((fn: DiaryListener) => {
    diaryListenersRef.current.add(fn);
    return () => {
      diaryListenersRef.current.delete(fn);
    };
  }, []);

  // Coupon listeners — same fan-out pattern. CouponsList + CouponDetail both mount
  // sometimes (list under list-stack, detail pushed on top) and both want updates.
  const couponListenersRef = useRef<Set<CouponListener>>(new Set());
  const subscribeCoupons = useCallback((fn: CouponListener) => {
    couponListenersRef.current.add(fn);
    return () => {
      couponListenersRef.current.delete(fn);
    };
  }, []);

  // Authoritative authenticated id this socket is bound to. Used to tear down when the
  // user changes (logout + login as different account in same session).
  const boundUserIdRef = useRef<string | null>(null);
  const connectInFlightRef = useRef(false);

  const resetUnread = useCallback(() => setUnreadCount(0), []);

  const teardown = useCallback(() => {
    const s = socketRef.current;
    socketRef.current = null;
    boundUserIdRef.current = null;
    setStatus('idle');
    setPartnerOnline(false);
    setUnreadCount(0);
    if (s) {
      // removeAllListeners avoids leaks if the socket lingers in the event-loop briefly.
      s.removeAllListeners();
      s.disconnect();
    }
  }, []);

  const connect = useCallback(async (userId: string) => {
    // Cheap idempotency guard: avoid stacking sockets if connect() is called while one
    // is already alive for the same user.
    if (socketRef.current && boundUserIdRef.current === userId) return;
    if (socketRef.current) teardown();
    if (connectInFlightRef.current) return;
    connectInFlightRef.current = true;

    const token = await tokens.getAccess();
    if (!token) {
      setStatus('error');
      connectInFlightRef.current = false;
      return;
    }

    const socketUrl = apiBaseUrl.replace(/\/api$/, '');
    setStatus('connecting');
    const s = io(socketUrl, {
      auth: { token },
      // Order matters: try websocket first (fast), fall back to long-polling if the
      // WS upgrade fails. Tunneled connections (ngrok, dev tunnels) occasionally fail
      // the WS handshake on the first hop; polling keeps the chat working until the
      // socket can upgrade.
      transports: ['websocket', 'polling'],
      // socket.io defaults already enable reconnection; we make them explicit and tune
      // backoff for mobile networks that flap (cell ↔ wifi handoff).
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 800,
      reconnectionDelayMax: 5000,
      timeout: 15000,
    });
    socketRef.current = s;
    boundUserIdRef.current = userId;

    s.on('connect', () => setStatus('connected'));
    s.on('disconnect', () => setStatus('connecting'));
    s.on('connect_error', (err) => {
      console.warn('[ChatSocket] connect_error', err?.message);
      setStatus('error');
    });

    s.on('partner_presence', (data: { userId: string; status: 'online' | 'offline' }) => {
      if (data.userId !== userId) {
        setPartnerOnline(data.status === 'online');
      }
    });

    s.on('unread_count', (data: { count: number }) => {
      if (typeof data?.count === 'number') setUnreadCount(Math.max(0, data.count));
    });

    // Profile changes (avatar / name) from either side of the couple — pull the latest
    // profile so partner avatars + names refresh instantly everywhere they're rendered.
    s.on('profile_updated', () => {
      refreshProfileRef.current?.().catch(() => undefined);
    });

    // Diary mutations from the partner (or this user on another device). Fan out to
    // anyone who has subscribed — the listener set is mutated by subscribe/unsubscribe.
    s.on('diary_changed', (e: DiaryChangeEvent) => {
      diaryListenersRef.current.forEach((fn) => {
        try {
          fn(e);
        } catch (err) {
          if (__DEV__) console.log('[ChatSocket] diary listener threw', err);
        }
      });
    });

    // Space dissolution — emitted by the backend right before it deletes the couple
    // row when the creator hits "Leave the space." The receiving partner runs the
    // same client-side cleanup as the dissolver (clears chat/diary queues + keypair
    // via logout) so they're not stuck on a screen whose backend just 403'd.
    s.on('space_dissolved', () => {
      logoutRef.current?.().catch(() => undefined);
    });

    // Coupon lifecycle — created / status flip / fulfilled / reviewed. Fired to both
    // partners' connected sockets so the list reflects the partner's redemption in
    // real time, no manual pull-to-refresh needed.
    s.on('coupon_changed', (e: CouponChangeEvent) => {
      couponListenersRef.current.forEach((fn) => {
        try {
          fn(e);
        } catch (err) {
          if (__DEV__) console.log('[ChatSocket] coupon listener threw', err);
        }
      });
    });

    // Fetch initial count from REST so the badge is correct before the first socket
    // event arrives. Live updates take over afterwards.
    try {
      const { count } = await chatApi.unreadCount();
      setUnreadCount(Math.max(0, count));
    } catch {
      // non-fatal — socket will emit a fresh count on connect anyway.
    }
    connectInFlightRef.current = false;
    connectInFlightRef.current = false;
  }, [teardown]);

  // Connect when authenticated; teardown when not.
  useEffect(() => {
    if (isAuthenticated && user?.id) {
      void connect(user.id);
    } else {
      teardown();
    }
    return () => {
      // Only tear down on unmount; intermediate auth-id changes are handled by the
      // boundUserIdRef check inside connect().
    };
  }, [isAuthenticated, user?.id, connect, teardown]);

  // Reconnect on foreground. Socket.IO will usually auto-reconnect, but if the OS killed
  // the websocket while backgrounded for a long time we want a fresh handshake.
  useEffect(() => {
    const handler = (state: AppStateStatus) => {
      if (state === 'active' && user?.id && isAuthenticated) {
        const s = socketRef.current;
        if (!s || !s.connected) void connect(user.id);
      }
    };
    const sub = AppState.addEventListener('change', handler);
    return () => sub.remove();
  }, [user?.id, isAuthenticated, connect]);

  // Final cleanup on provider unmount.
  useEffect(() => {
    return () => {
      teardown();
    };
  }, [teardown]);

  const value = useMemo<ChatSocketCtx>(
    () => ({
      socket: socketRef.current,
      status,
      partnerOnline,
      unreadCount,
      resetUnread,
      subscribeDiary,
      subscribeCoupons,
    }),
    // socketRef.current isn't in deps because it's a ref; consumers needing a fresh
    // socket can read it via the hook and the status state will force re-renders when
    // the connection establishes or drops.
    [status, partnerOnline, unreadCount, resetUnread, subscribeDiary, subscribeCoupons]
  );

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useChatSocket(): ChatSocketCtx {
  const ctx = useContext(Context);
  if (!ctx) throw new Error('useChatSocket must be used within ChatSocketProvider');
  return ctx;
}
