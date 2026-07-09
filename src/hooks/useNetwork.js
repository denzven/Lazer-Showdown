import { useState, useEffect, useRef, useCallback } from 'react';
import { Signaling, generateRoomCode } from '../network/Signaling';
import { DataChannel } from '../network/DataChannel';
import { PLAYERS } from '../core/Ruleset';

export function useNetwork() {
  const [status, setStatus] = useState('idle'); // idle, hosting, joining, connected, disconnected, error
  const [roomCode, setRoomCode] = useState('');
  const [role, setRole] = useState(null); // red (host) or blue (joiner)
  const [playerName, setPlayerName] = useState('');
  const [opponentName, setOpponentName] = useState('Opponent');
  const [error, setError] = useState(null);
  const [lastMessage, setLastMessage] = useState(null);
  const [isOpponentAfk, setIsOpponentAfk] = useState(false);

  const signalingRef = useRef(null);
  const dataChannelRef = useRef(null);
  const playerNameRef = useRef('');
  const sessionIdRef = useRef(crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2));
  const guestSessionIdRef = useRef(null);

  // Keep player name in ref to access it in event callbacks without recreating them
  useEffect(() => {
    playerNameRef.current = playerName;
  }, [playerName]);

  // Clean up connection on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, []);

  const cleanup = useCallback(() => {
    localStorage.removeItem('sandbox_session'); // Clear saved session on explicit leave/cleanup
    if (dataChannelRef.current) {
      dataChannelRef.current.close();
      dataChannelRef.current = null;
    }
    if (signalingRef.current) {
      signalingRef.current.destroy();
      signalingRef.current = null;
    }
    setStatus('idle');
    setRoomCode('');
    setRole(null);
    setError(null);
    setLastMessage(null);
    setOpponentName('Opponent');
    setIsOpponentAfk(false);
    guestSessionIdRef.current = null;
  }, []);

  const setupDataChannel = useCallback((conn) => {
    const channel = new DataChannel(conn);
    dataChannelRef.current = channel;

    // Send handshake immediately
    channel.send('HANDSHAKE', { name: playerNameRef.current, sessionId: sessionIdRef.current });

    // Handshake retry loop to handle asynchronous listener binding
    let handshaken = false;
    const handshakeInterval = setInterval(() => {
      if (handshaken) {
        clearInterval(handshakeInterval);
        return;
      }
      console.log('Sending handshake retry...');
      channel.send('HANDSHAKE', { name: playerNameRef.current, sessionId: sessionIdRef.current });
    }, 1000);

    channel.onMessage((message) => {
      const { type, payload } = message;

      if (type === 'HANDSHAKE') {
        if (role === PLAYERS.RED) {
          // Host receives handshake from guest
          if (guestSessionIdRef.current && guestSessionIdRef.current !== payload.sessionId) {
            // A different person is trying to join a full room
            channel.send('ROOM_FULL', {});
            setTimeout(() => channel.close(), 500);
            return;
          }
          // Accept the guest
          guestSessionIdRef.current = payload.sessionId;
        }

        handshaken = true;
        clearInterval(handshakeInterval);
        setOpponentName(payload.name || 'Opponent');
        // Reply with acknowledgment
        channel.send('HANDSHAKE_ACK', { name: playerNameRef.current, sessionId: sessionIdRef.current });
        
        // If there was an old channel and we just accepted a new one, this new one becomes active.
        // We already assigned dataChannelRef.current = channel; above.
        setStatus('connected');
      } else if (type === 'HANDSHAKE_ACK') {
        handshaken = true;
        clearInterval(handshakeInterval);
        setOpponentName(payload.name || 'Opponent');
        setStatus('connected');
      } else if (type === 'ROOM_FULL') {
        clearInterval(handshakeInterval);
        setError('Room is already full! Another player is in the game.');
        setStatus('error');
        channel.close();
      } else if (type === 'AFK_STATUS') {
        setIsOpponentAfk(payload.afk);
      } else {
        // Forward other messages to the game hook
        setLastMessage({ type, payload, timestamp: Date.now() });
      }
    });

    channel.onClose(() => {
      clearInterval(handshakeInterval);
      setStatus('disconnected');
      setError('Opponent disconnected.');
      setIsOpponentAfk(false);
    });

    channel.onError((err) => {
      clearInterval(handshakeInterval);
      console.error('Data channel connection error:', err);
      setError('Connection interrupted.');
      setStatus('error');
      setIsOpponentAfk(false);
    });
  }, []);

  const hostGame = useCallback((name, retryCount = 0) => {
    if (retryCount === 0) cleanup();
    
    const code = generateRoomCode();
    setPlayerName(name || 'Host Player');
    setRoomCode(code);
    setRole(PLAYERS.RED);
    setStatus('hosting');

    try {
      const sig = new Signaling(true, code);
      signalingRef.current = sig;

      sig.on('open', (id) => {
        console.log('Host signaling registered with PeerJS server. Peer ID:', id);
      });

      sig.on('connection', (conn) => {
        console.log('Opponent connection attempt received...');
        // If a new connection arrives and we already have a connected data channel, 
        // the new one will be validated in the HANDSHAKE step.
        setupDataChannel(conn);
      });

      sig.on('error', (err) => {
        console.error('Signaling host error:', err);
        if (err.type === 'unavailable-id') {
          if (retryCount < 3) {
            console.log('Room code collision! Retrying with a new code automatically...');
            hostGame(name, retryCount + 1);
          } else {
            setError('Room code collision. Please try hosting again.');
            setStatus('error');
          }
        } else {
          setError('Failed to establish host room.');
          setStatus('error');
        }
      });

      sig.on('close', () => {
        setStatus('disconnected');
      });

    } catch (err) {
      console.error('Host creation failed:', err);
      setError('Failed to setup signaling service.');
      setStatus('error');
    }
  }, [cleanup, setupDataChannel]);

  const joinGame = useCallback((code, name) => {
    cleanup();
    const cleanCode = code.trim().toUpperCase();
    if (cleanCode.length !== 6) {
      setError('Room code must be exactly 6 characters.');
      setStatus('error');
      return;
    }

    setPlayerName(name || 'Join Player');
    setRoomCode(cleanCode);
    setRole(PLAYERS.BLUE);
    setStatus('joining');

    try {
      const sig = new Signaling(false, cleanCode);
      signalingRef.current = sig;

      sig.on('open', (id) => {
        console.log('Joiner signaling registered with PeerJS server. Peer ID:', id);
      });

      sig.on('connection', (conn) => {
        console.log('Connected to host! Initializing data channel...');
        setupDataChannel(conn);
      });

      sig.on('error', (err) => {
        console.error('Signaling join error:', err);
        if (err.type === 'peer-unavailable') {
          setError(`Room ${cleanCode} not found. Please check the code.`);
        } else {
          setError('Failed to connect to host.');
        }
        setStatus('error');
      });

      sig.on('close', () => {
        setStatus('disconnected');
      });

    } catch (err) {
      console.error('Join connection failed:', err);
      setError('Failed to setup signaling service.');
      setStatus('error');
    }
  }, [cleanup, setupDataChannel]);

  const sendPayload = useCallback((type, payload) => {
    if (dataChannelRef.current) {
      dataChannelRef.current.send(type, payload);
    } else {
      console.warn('Cannot send payload; no active data connection.');
    }
  }, []);

  // 1. Persist session to LocalStorage upon successful connection
  useEffect(() => {
    if (status === 'connected' && roomCode && role && playerName) {
      localStorage.setItem('sandbox_session', JSON.stringify({
        roomId: roomCode,
        playerName,
        role,
        sessionId: sessionIdRef.current,
        guestSessionId: guestSessionIdRef.current
      }));
    }
  }, [status, roomCode, role, playerName]);

  // 2. Tab AFK Monitor using the Page Visibility API
  useEffect(() => {
    let afkTimeout;
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Mark AFK after 5 seconds in the background
        afkTimeout = setTimeout(() => {
          if (status === 'connected' && dataChannelRef.current) {
            dataChannelRef.current.send('AFK_STATUS', { afk: true });
          }
        }, 5000);
      } else {
        clearTimeout(afkTimeout);
        if (status === 'connected' && dataChannelRef.current) {
          dataChannelRef.current.send('AFK_STATUS', { afk: false });
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearTimeout(afkTimeout);
    };
  }, [status]);

  // 3. Auto-reconnect session when tab is refocused or on page reload
  useEffect(() => {
    const handleFocusOrReload = () => {
      const saved = localStorage.getItem('sandbox_session');
      if (!saved) return;

      const session = JSON.parse(saved);
      // Auto reconnect if we are disconnected unexpectedly
      if (status === 'disconnected' || status === 'idle' || status === 'error') {
        console.log('Re-establishing connection to persistent session...', session);
        
        // Restore session IDs for authentication
        if (session.sessionId) sessionIdRef.current = session.sessionId;
        if (session.guestSessionId) guestSessionIdRef.current = session.guestSessionId;

        if (session.role === PLAYERS.RED) {
          setPlayerName(session.playerName);
          setRoomCode(session.roomId);
          setRole(PLAYERS.RED);
          setStatus('hosting');
          try {
            const sig = new Signaling(true, session.roomId);
            signalingRef.current = sig;
            sig.on('connection', (conn) => setupDataChannel(conn));
          } catch (e) { console.error(e); }
        } else if (session.role === PLAYERS.BLUE) {
          setPlayerName(session.playerName);
          setRoomCode(session.roomId);
          setRole(PLAYERS.BLUE);
          setStatus('joining');
          try {
            const sig = new Signaling(false, session.roomId);
            signalingRef.current = sig;
            sig.on('connection', (conn) => setupDataChannel(conn));
          } catch (e) { console.error(e); }
        }
      }
    };

    window.addEventListener('focus', handleFocusOrReload);
    handleFocusOrReload(); // Run on mount in case they reloaded the tab

    return () => {
      window.removeEventListener('focus', handleFocusOrReload);
    };
  }, [status, setupDataChannel]);

  return {
    status,
    roomCode,
    role,
    playerName,
    opponentName,
    isOpponentAfk,
    error,
    lastMessage,
    hostGame,
    joinGame,
    sendPayload,
    disconnect: cleanup,
  };
}
