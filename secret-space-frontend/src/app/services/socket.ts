import { io, Socket } from 'socket.io-client';

const baseURL = import.meta.env.VITE_API_BASE_URL 
  ? import.meta.env.VITE_API_BASE_URL.replace('/api', '') 
  : 'http://localhost:5050';

class SocketManager {
  public socket: Socket | null = null;
  private listeners: Map<string, Array<(...args: any[]) => void>> = new Map();

  connect() {
    const token = localStorage.getItem('accessToken');
    if (!token) {
      console.warn('[SocketManager] Cannot connect, missing access token');
      return;
    }

    if (this.socket?.connected) {
      return;
    }

    this.socket = io(baseURL, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
    });

    this.socket.on('connect', () => {
      console.log('[SocketManager] Connected to socket server');
    });

    this.socket.on('disconnect', (reason) => {
      console.log('[SocketManager] Disconnected:', reason);
    });

    this.socket.on('connect_error', (err) => {
      console.error('[SocketManager] Connection Error:', err.message);
    });

    // Reattach listeners if socket was recreated
    this.listeners.forEach((fns, event) => {
      fns.forEach((fn) => {
        this.socket?.on(event, fn);
      });
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  on(event: string, fn: (...args: any[]) => void) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(fn);

    if (this.socket) {
      this.socket.on(event, fn);
    }
  }

  off(event: string, fn: (...args: any[]) => void) {
    if (this.listeners.has(event)) {
      const fns = this.listeners.get(event)!;
      this.listeners.set(event, fns.filter(f => f !== fn));
    }
    if (this.socket) {
      this.socket.off(event, fn);
    }
  }

  emit(event: string, data: any, callback?: (response: any) => void) {
    if (!this.socket || !this.socket.connected) {
      console.warn(`[SocketManager] Cannot emit '${event}', socket not connected`);
      // Could queue messages here for offline support
      if (callback) callback({ status: 'error', error: 'Socket disconnected' });
      return;
    }
    
    if (callback) {
      this.socket.emit(event, data, callback);
    } else {
      this.socket.emit(event, data);
    }
  }
}

export const socketManager = new SocketManager();
