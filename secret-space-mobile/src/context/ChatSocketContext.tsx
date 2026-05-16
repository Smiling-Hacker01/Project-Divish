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

interface ChatSocketCtx {
  socket: Socket | null;
  status: ConnectionStatus;
  partnerOnline: boolean;
  unreadCount: number;
  resetUnread: () => void;
}

const Context = createContext<ChatSocketCtx | null>(null);

export function ChatSocketProvider({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, refreshProfile } = useAuth();
  const [status, setStatus] = useState<ConnectionStatus>('idle');
  const [partnerOnline, setPartnerOnline] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const socketRef = useRef<Socket | null>(null);
  // Stash the latest refreshProfile in a ref so socket listeners (set up once per
  // connection) can call the *current* function without forcing a reconnect when the
  // function identity changes.
  const refreshProfileRef = useRef(refreshProfile);
  useEffect(() => {
    refreshProfileRef.current = refreshProfile;
  }, [refreshProfile]);

  // Authoritative authenticated id this socket is bound to. Used to tear down when the
  // user changes (logout + login as different account in same session).
  const boundUserIdRef = useRef<string | null>(null);

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

    const token = await tokens.getAccess();
    if (!token) {
      setStatus('error');
      return;
    }

    const socketUrl = apiBaseUrl.replace(/\/api$/, '');
    setStatus('connecting');
    const s = io(socketUrl, {
      auth: { token },
      transports: ['websocket'],
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

    // Fetch initial count from REST so the badge is correct before the first socket
    // event arrives. Live updates take over afterwards.
    try {
      const { count } = await chatApi.unreadCount();
      setUnreadCount(Math.max(0, count));
    } catch {
      // non-fatal — socket will emit a fresh count on connect anyway.
    }
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
    }),
    // socketRef.current isn't in deps because it's a ref; consumers needing a fresh
    // socket can read it via the hook and the status state will force re-renders when
    // the connection establishes or drops.
    [status, partnerOnline, unreadCount, resetUnread]
  );

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useChatSocket(): ChatSocketCtx {
  const ctx = useContext(Context);
  if (!ctx) throw new Error('useChatSocket must be used within ChatSocketProvider');
  return ctx;
}
