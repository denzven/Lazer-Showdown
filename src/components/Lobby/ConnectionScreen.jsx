import React, { useState } from 'react';
import { ArrowLeft, Plus, LogIn } from 'lucide-react';

export default function ConnectionScreen({ network, game, onBack }) {
  const { status, roomCode, error, hostGame, joinGame, disconnect } = network;

  const [view, setView] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('room') ? 'setup-join' : 'menu';
  });
  const [hostName, setHostName] = useState(() => localStorage.getItem('lazer_nickname') || '');
  const [joinName, setJoinName] = useState(() => localStorage.getItem('lazer_nickname') || '');
  const [inputCode, setInputCode] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return (params.get('room') || '').toUpperCase().slice(0, 6);
  });
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const handleHost = (e) => {
    e.preventDefault();
    const finalName = hostName.trim() || 'Host Player';
    localStorage.setItem('lazer_nickname', finalName);
    if (game?.clearWorkspace) game.clearWorkspace();
    hostGame(finalName);
  };

  const handleJoin = (e) => {
    e.preventDefault();
    if (inputCode.length !== 6) return;
    const finalName = joinName.trim() || 'Guest Player';
    localStorage.setItem('lazer_nickname', finalName);
    if (game?.clearWorkspace) game.clearWorkspace();
    joinGame(inputCode, finalName);
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(roomCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleCopyLink = () => {
    const link = `${window.location.origin}${window.location.pathname}?room=${roomCode}`;
    const shareData = {
      title: 'Lazer Showdown',
      text: `Join my Lazer Showdown match! Room code: ${roomCode}`,
      url: link
    };

    if (navigator.share) {
      navigator.share(shareData).catch((err) => console.error('Error sharing:', err));
    } else {
      navigator.clipboard.writeText(`${shareData.text} \n${shareData.url}`);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  const handleCancel = () => {
    disconnect();
    setView('menu');
    const url = new URL(window.location);
    url.searchParams.delete('room');
    window.history.replaceState({}, '', url);
  };

  // If in connection or error stages, override menus with state displays
  const isConnecting = status === 'hosting' || status === 'joining';
  const hasError = status === 'error';

  return (
    <div className="lobby-container">
      <div className="lobby-box glass-panel">
        <h1 className="lobby-title font-display">LAZER SHOWDOWN</h1>

        {error && !isConnecting && (
          <div style={{ color: 'var(--neon-red)', marginBottom: '20px', fontSize: '0.9rem', fontWeight: 'bold' }}>
            {error}
          </div>
        )}

        {/* 1. LOBBY SUB-MENU */}
        {status === 'idle' && view === 'menu' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', width: '100%' }}>
            <p className="lobby-subtitle" style={{ marginBottom: '10px' }}>Online Multiplayer PvP Lobby</p>

            <div style={{ display: 'flex', gap: '16px' }}>
              <button
                className="cyber-button red"
                onClick={() => setView('setup-host')}
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '16px' }}
              >
                <Plus size={16} /> HOST ROOM
              </button>

              <button
                className="cyber-button blue"
                onClick={() => setView('setup-join')}
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '16px' }}
              >
                <LogIn size={16} /> JOIN ROOM
              </button>
            </div>

            <button
              className="cyber-button"
              onClick={onBack}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', borderColor: 'var(--text-secondary)' }}
            >
              <ArrowLeft size={16} /> BACK TO HOME
            </button>
          </div>
        )}

        {/* 2. HOST SETUP VIEW */}
        {status === 'idle' && view === 'setup-host' && (
          <form className="lobby-form" onSubmit={handleHost}>
            <p className="lobby-subtitle">Setup Room Hosting</p>

            <div className="input-group">
              <label className="input-label">YOUR NICKNAME</label>
              <input
                type="text"
                className="cyber-input"
                placeholder="ENTER HOST NICKNAME"
                value={hostName}
                onChange={(e) => setHostName(e.target.value.slice(0, 15))}
                onFocus={(e) => e.target.select()}
                required
              />
            </div>

            <div style={{ display: 'flex', gap: '12px', width: '100%', marginTop: '10px' }}>
              <button
                type="button"
                className="cyber-button"
                onClick={() => setView('menu')}
                style={{ flex: 1 }}
              >
                CANCEL
              </button>
              <button
                type="submit"
                className="cyber-button red"
                style={{ flex: 2 }}
              >
                CREATE ROOM
              </button>
            </div>
          </form>
        )}

        {/* 3. JOIN SETUP VIEW */}
        {status === 'idle' && view === 'setup-join' && (
          <form className="lobby-form" onSubmit={handleJoin}>
            <p className="lobby-subtitle">Join Host Room</p>

            <div className="input-group">
              <label className="input-label">YOUR NICKNAME</label>
              <input
                type="text"
                className="cyber-input"
                placeholder="ENTER YOUR NICKNAME"
                value={joinName}
                onChange={(e) => setJoinName(e.target.value.slice(0, 15))}
                onFocus={(e) => e.target.select()}
                required
              />
            </div>

            <div className="input-group">
              <label className="input-label">ENTER ROOM CODE</label>
              <input
                type="text"
                className="cyber-input"
                placeholder="6-CHARACTER CODE"
                value={inputCode}
                onChange={(e) => setInputCode(e.target.value.toUpperCase().slice(0, 6))}
                onFocus={(e) => e.target.select()}
                required
              />
            </div>

            <div style={{ display: 'flex', gap: '12px', width: '100%', marginTop: '10px' }}>
              <button
                type="button"
                className="cyber-button"
                onClick={() => setView('menu')}
                style={{ flex: 1 }}
              >
                CANCEL
              </button>
              <button
                type="submit"
                className="cyber-button blue"
                style={{ flex: 2 }}
                disabled={inputCode.length !== 6}
              >
                JOIN ROOM
              </button>
            </div>
          </form>
        )}

        {/* 4. LOADING & WAIT SCREENS */}
        {isConnecting && (
          <div className="loader-container">
            {status === 'hosting' ? (
              <>
                <div className="room-display">
                  <div className="input-label">YOUR ROOM CODE</div>
                  <div className="room-code glow-text-red">{roomCode}</div>
                  <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                    <button
                      type="button"
                      className="cyber-button"
                      style={{ padding: '6px 12px', fontSize: '0.75rem' }}
                      onClick={handleCopyCode}
                    >
                      {copiedCode ? 'COPIED!' : 'COPY CODE'}
                    </button>
                    <button
                      type="button"
                      className="cyber-button"
                      style={{ padding: '6px 12px', fontSize: '0.75rem', borderColor: '#b15cff', color: '#b15cff' }}
                      onClick={handleCopyLink}
                    >
                      {copiedLink ? 'LINK COPIED!' : 'SHARE LINK'}
                    </button>
                  </div>
                </div>
                <div className="cyber-loader"></div>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                  WAITING FOR OPPONENT...
                </p>
              </>
            ) : (
              <>
                <div className="room-display">
                  <div className="input-label">CONNECTING TO ROOM</div>
                  <div className="room-code glow-text-blue">{roomCode}</div>
                </div>
                <div className="cyber-loader"></div>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                  ESTABLISHING DIRECT P2P LINK...
                </p>
              </>
            )}

            <button
              className="cyber-button"
              style={{ marginTop: '20px' }}
              onClick={handleCancel}
            >
              CANCEL
            </button>
          </div>
        )}

        {/* 5. CONNECTION ERROR STATE */}
        {hasError && (
          <div className="loader-container" style={{ gap: '16px' }}>
            <p style={{ color: 'var(--neon-red)', fontWeight: 'bold' }}>CONNECTION ERROR</p>
            <button className="cyber-button red" onClick={handleCancel}>
              BACK TO PVP MENU
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
