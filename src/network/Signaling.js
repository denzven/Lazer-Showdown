import { Peer } from 'peerjs';

/**
 * Signaling class manages the connection to the PeerJS signaling server.
 * It coordinates room hosting and room joining using a 6-character code.
 */
export class Signaling {
  constructor(isHost, code) {
    this.isHost = isHost;
    this.code = code.toUpperCase();
    this.peerId = isHost ? `lazershowdown-${this.code}` : null;
    this.peer = null;
    this.callbacks = {
      open: [],
      connection: [],
      error: [],
      close: [],
    };

    this.init();
  }

  init() {
    try {
      const options = {
        host: '0.peerjs.com',
        port: 443,
        path: '/',
        secure: true,
        debug: 1, // Log warnings and errors
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
          ],
        },
      };

      if (this.isHost) {
        this.peer = new Peer(this.peerId, options);
      } else {
        this.peer = new Peer(options);
      }

      this.peer.on('open', (id) => {
        this.callbacks.open.forEach((cb) => cb(id));
        
        if (!this.isHost) {
          // Joiner connects to the host
          const conn = this.peer.connect(`lazershowdown-${this.code}`, {
            reliable: true,
          });
          
          conn.on('open', () => {
            this.callbacks.connection.forEach((cb) => cb(conn));
          });
          
          conn.on('error', (err) => {
            this.callbacks.error.forEach((cb) => cb(err));
          });
        }
      });

      this.peer.on('connection', (conn) => {
        // Only host receives connection triggers. Wait for connection to open.
        conn.on('open', () => {
          this.callbacks.connection.forEach((cb) => cb(conn));
        });
        conn.on('error', (err) => {
          this.callbacks.error.forEach((cb) => cb(err));
        });
      });

      this.peer.on('error', (err) => {
        console.error('PeerJS signaling error:', err);
        this.callbacks.error.forEach((cb) => cb(err));
      });

      this.peer.on('close', () => {
        this.callbacks.close.forEach((cb) => cb());
      });

      this.peer.on('disconnected', () => {
        // Attempt reconnection to the signaling server
        this.peer.reconnect();
      });

    } catch (e) {
      console.error('Failed to initialize PeerJS:', e);
      this.callbacks.error.forEach((cb) => cb(e));
    }
  }

  /**
   * Bind event handlers.
   * @param {string} event - 'open' | 'connection' | 'error' | 'close'
   * @param {Function} callback 
   */
  on(event, callback) {
    if (this.callbacks[event]) {
      this.callbacks[event].push(callback);
    }
  }

  destroy() {
    if (this.peer) {
      this.peer.destroy();
    }
  }
}

export function generateRoomCode() {
  const chars = 'ACEFGHJKLMNPRTUVWXY34679';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}
