import React, { useState } from 'react';
import { useNetwork } from './hooks/useNetwork';
import { useGame } from './hooks/useGame';
import ConnectionScreen from './components/Lobby/ConnectionScreen';
import Layout from './components/Layout';
import { Globe, Users, Cpu } from 'lucide-react';
import './index.css';

function App() {
  const [mode, setMode] = useState('home'); // 'home', 'online', 'local', 'bot', 'setup-bot'
  const [difficulty, setDifficulty] = useState('medium'); // 'easy', 'medium', 'hard'
  const network = useNetwork();

  // Create local network mock for offline local Pass & Play
  const mockLocalNetwork = {
    status: 'connected',
    role: 'red',
    playerName: 'Player 1',
    opponentName: 'Player 2',
    isOpponentAfk: false,
    disconnect: () => setMode('home'), // Return home on exit
    sendPayload: () => {} // No-op locally
  };

  // Create local network mock for offline Play with Computer
  const mockBotNetwork = {
    status: 'connected',
    role: 'red',
    playerName: 'Human',
    opponentName: `Computer (${difficulty.toUpperCase()})`,
    isOpponentAfk: false,
    disconnect: () => setMode('home'), // Return home on exit
    sendPayload: () => {} // No-op locally
  };

  const activeNetwork = mode === 'local' 
    ? mockLocalNetwork 
    : mode === 'bot' 
      ? mockBotNetwork 
      : network;

  const game = useGame(activeNetwork, mode, difficulty);

  // Show grid if connected in online, local, or bot mode
  const showGameLayout = mode === 'local' || mode === 'bot' || (mode === 'online' && network.status === 'connected');

  return (
    <>
      {showGameLayout ? (
        <Layout network={activeNetwork} game={game} mode={mode} difficulty={difficulty} />
      ) : mode === 'online' ? (
        <ConnectionScreen network={network} onBack={() => setMode('home')} />
      ) : mode === 'setup-bot' ? (
        /* Cyberpunk Difficulty Selection View */
        <div className="lobby-container">
          <div className="lobby-box glass-panel" style={{ maxWidth: '500px', padding: '50px 40px', textAlign: 'center' }}>
            <h1 className="lobby-title font-display" style={{ fontSize: '2rem', margin: '0 0 10px 0' }}>
              SELECT DIFFICULTY
            </h1>
            <p className="lobby-subtitle" style={{ marginBottom: '30px' }}>
              Choose your computer opponent difficulty
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%' }}>
              <button
                className="cyber-button blue"
                onClick={() => { setDifficulty('easy'); setMode('bot'); }}
                style={{ padding: '16px', fontSize: '1rem', width: '100%', textTransform: 'uppercase' }}
              >
                EASY BOT
              </button>
              
              <button
                className="cyber-button"
                onClick={() => { setDifficulty('medium'); setMode('bot'); }}
                style={{ padding: '16px', fontSize: '1rem', width: '100%', textTransform: 'uppercase', borderColor: '#ffcc00', color: '#ffcc00' }}
              >
                MEDIUM BOT
              </button>

              <button
                className="cyber-button red"
                onClick={() => { setDifficulty('hard'); setMode('bot'); }}
                style={{ padding: '16px', fontSize: '1rem', width: '100%', textTransform: 'uppercase' }}
              >
                HARD BOT
              </button>

              <button
                className="cyber-button"
                onClick={() => setMode('home')}
                style={{ padding: '12px', fontSize: '0.9rem', width: '100%', marginTop: '16px', borderColor: 'var(--text-secondary)' }}
              >
                BACK TO MENU
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* Cyberpunk Main Menu / Home Page */
        <div className="lobby-container">
          <div className="lobby-box glass-panel" style={{ maxWidth: '600px', padding: '50px 40px', textAlign: 'center' }}>
            <h1 className="lobby-title font-display" style={{ fontSize: '3rem', margin: '0 0 10px 0' }}>
              LAZER SHOWDOWN
            </h1>
            <p className="lobby-subtitle" style={{ marginBottom: '40px' }}>
              A Collaborative real-time P2P spatial playground
            </p>

            <div className="menu-button-row" style={{ display: 'flex', gap: '16px', justifyContent: 'center', width: '100%', flexWrap: 'wrap' }}>
              <button
                className="cyber-button blue"
                onClick={() => setMode('online')}
                style={{ flex: '1 1 170px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', padding: '20px 10px', height: 'auto' }}
              >
                <Globe size={24} />
                <span style={{ fontWeight: 'bold', fontSize: '0.9rem', letterSpacing: '0.05em' }}>ONLINE PVP</span>
                <span style={{ fontSize: '0.65rem', opacity: 0.7, fontWeight: 'normal' }}>P2P via room code</span>
              </button>

              <button
                className="cyber-button red"
                onClick={() => setMode('local')}
                style={{ flex: '1 1 170px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', padding: '20px 10px', height: 'auto' }}
              >
                <Users size={24} />
                <span style={{ fontWeight: 'bold', fontSize: '0.9rem', letterSpacing: '0.05em' }}>PASS & PLAY</span>
                <span style={{ fontSize: '0.65rem', opacity: 0.7, fontWeight: 'normal' }}>Local offline sandbox</span>
              </button>

              <button
                className="cyber-button"
                onClick={() => setMode('setup-bot')}
                style={{ flex: '1 1 170px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', padding: '20px 10px', height: 'auto', borderColor: '#39ff14', color: '#39ff14' }}
              >
                <Cpu size={24} />
                <span style={{ fontWeight: 'bold', fontSize: '0.9rem', letterSpacing: '0.05em' }}>VS COMPUTER</span>
                <span style={{ fontSize: '0.65rem', opacity: 0.7, fontWeight: 'normal' }}>Play offline vs bot</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default App;
