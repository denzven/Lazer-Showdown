/**
 * DataChannel class wraps a PeerJS DataConnection to send and receive
 * raw JSON payloads in a structured way.
 */
export class DataChannel {
  constructor(conn) {
    this.conn = conn;
    this.messageCallbacks = [];
    this.closeCallbacks = [];
    this.errorCallbacks = [];

    this.init();
  }

  init() {
    if (!this.conn) return;

    this.conn.on('data', (data) => {
      try {
        // Parse message if it's sent as a stringified JSON (defensive against manual formats)
        let parsed = data;
        if (typeof data === 'string') {
          parsed = JSON.parse(data);
        }
        
        // Let registered listeners know
        this.messageCallbacks.forEach((cb) => cb(parsed));
      } catch (e) {
        console.error('Failed to parse incoming data packet:', e, data);
      }
    });

    this.conn.on('close', () => {
      this.closeCallbacks.forEach((cb) => cb());
    });

    this.conn.on('error', (err) => {
      console.error('Data channel error:', err);
      this.errorCallbacks.forEach((cb) => cb(err));
    });
  }

  /**
   * Send a JSON payload to the peer.
   * @param {string} type - Action type e.g., 'SYNC_ACTION', 'DICE_ROLL'
   * @param {any} payload - The action data
   */
  send(type, payload) {
    if (this.conn && this.conn.open) {
      this.conn.send({ type, payload });
    } else {
      console.warn('DataChannel is not open. Cannot send message:', type);
    }
  }

  /**
   * Listen to incoming messages.
   * @param {Function} callback - Callback function receiving { type, payload }
   */
  onMessage(callback) {
    this.messageCallbacks.push(callback);
  }

  /**
   * Listen to connection close.
   * @param {Function} callback 
   */
  onClose(callback) {
    this.closeCallbacks.push(callback);
  }

  /**
   * Listen to channel errors.
   * @param {Function} callback 
   */
  onError(callback) {
    this.errorCallbacks.push(callback);
  }

  close() {
    if (this.conn) {
      this.conn.close();
    }
  }
}
