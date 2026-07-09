import React, { useState } from 'react';
import { useNetwork } from './hooks/useNetwork';
import { useGame } from './hooks/useGame';
import ConnectionScreen from './components/Lobby/ConnectionScreen';
import Layout from './components/Layout';
import { Globe, Users, Cpu } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import './index.css';

const loreModules = import.meta.glob(['./lore/*.md', './lore/*.txt'], { query: '?raw', import: 'default', eager: true });
const loreFiles = Object.keys(loreModules).sort().map(key => loreModules[key]);

// Load all image assets in the lore folder to map markdown references to Vite URLs
const loreImages = import.meta.glob('./lore/*.{png,jpg,jpeg,gif,webp,svg}', { import: 'default', eager: true });
const normalizedLoreImages = Object.fromEntries(
  Object.entries(loreImages).map(([k, v]) => [k.toLowerCase(), v])
);

function App() {
  const [mode, setMode] = useState('main-menu'); // 'main-menu', 'mode-select', 'online', 'local', 'bot', 'setup-bot', 'rules', 'credits', 'lore'
  const [difficulty, setDifficulty] = useState('medium'); // 'easy', 'medium', 'hard'
  const [lorePage, setLorePage] = useState(0);
  const network = useNetwork();

  // Create local network mock for offline local Pass & Play
  const mockLocalNetwork = {
    status: 'connected',
    role: 'red',
    playerName: 'Player 1',
    opponentName: 'Player 2',
    isOpponentAfk: false,
    disconnect: () => setMode('mode-select'), // Return mode-select on exit
    sendPayload: () => {} // No-op locally
  };

  const getBotName = (diff) => {
    if (diff === 'easy') return 'Zlorooklp (EASY)';
    if (diff === 'medium') return 'Lizbishmir (MEDIUM)';
    if (diff === 'hard') return 'Shahlzrmir (HARD)';
    return 'Computer';
  };

  // Create local network mock for offline Play with Computer
  const mockBotNetwork = {
    status: 'connected',
    role: 'red',
    playerName: 'Human',
    opponentName: getBotName(difficulty),
    isOpponentAfk: false,
    disconnect: () => setMode('mode-select'), // Return mode-select on exit
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
        <ConnectionScreen network={network} game={game} onBack={() => setMode('mode-select')} />
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
                onClick={() => { setDifficulty('easy'); setMode('bot'); game.clearWorkspace(); }}
                style={{ padding: '16px', fontSize: '1rem', width: '100%', textTransform: 'uppercase' }}
              >
                ZLOROOKLP (EASY)
              </button>
              
              <button
                className="cyber-button"
                onClick={() => { setDifficulty('medium'); setMode('bot'); game.clearWorkspace(); }}
                style={{ padding: '16px', fontSize: '1rem', width: '100%', textTransform: 'uppercase', borderColor: '#ffcc00', color: '#ffcc00' }}
              >
                LIZBISHMIR (MEDIUM)
              </button>

              <button
                className="cyber-button red"
                onClick={() => { setDifficulty('hard'); setMode('bot'); game.clearWorkspace(); }}
                style={{ padding: '16px', fontSize: '1rem', width: '100%', textTransform: 'uppercase' }}
              >
                SHAHLZRMIR (HARD)
              </button>

              <button
                className="cyber-button"
                onClick={() => setMode('mode-select')}
                style={{ padding: '12px', fontSize: '0.9rem', width: '100%', marginTop: '16px', borderColor: 'var(--text-secondary)' }}
              >
                BACK TO OPTIONS
              </button>
            </div>
          </div>
        </div>
      ) : mode === 'rules' ? (
        <div className="lobby-container">
          <div className="lobby-box glass-panel" style={{ maxWidth: '600px', padding: '50px 40px', textAlign: 'left' }}>
            <h1 className="lobby-title font-display" style={{ fontSize: '2rem', margin: '0 0 20px 0', textAlign: 'center' }}>
              RULES
            </h1>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: '1.6', marginBottom: '30px' }}>
              <p><strong>Goal:</strong> Capture all opponent's point pieces (20, 30, 50 points).</p>
              <p><strong>Setup:</strong> The Defender places 3 point pieces. The Attacker places the LAZER piece on any corner square.</p>
              <p><strong>Turn:</strong> Roll the Action Point (AP) Dice. Use APs to Move (1 AP), Rotate LAZER (1 AP), or Press LAZER (1 AP) to fire.</p>
              <p><strong>Challenge:</strong> After capturing all pieces, the Attacker can declare a challenge on one captured piece to gain extra points via a dice toss.</p>
            </div>
            <button className="cyber-button" onClick={() => setMode('main-menu')} style={{ width: '100%' }}>
              BACK
            </button>
          </div>
        </div>
      ) : mode === 'lore' ? (
        <div className="lobby-container">
          <div className="lobby-box glass-panel" style={{ maxWidth: '800px', width: '100%', padding: '40px', textAlign: 'left', display: 'flex', flexDirection: 'column', height: '80vh' }}>
            <h1 className="lobby-title font-display" style={{ fontSize: '2rem', margin: '0 0 20px 0', textAlign: 'center' }}>
              GRID TERMINAL ARCHIVES
            </h1>
            
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px', marginBottom: '20px', color: 'var(--text-secondary)', fontSize: '1rem', lineHeight: '1.6' }}>
              {loreFiles.length > 0 ? (
                <ReactMarkdown
                  components={{
                    img: ({node, ...props}) => {
                      let src = props.src || '';
                      if (src.startsWith('./')) src = src.replace('./', '');
                      const fullPath = `./lore/${src}`.toLowerCase();
                      const resolvedSrc = normalizedLoreImages[fullPath] || props.src;
                      return <img {...props} src={resolvedSrc} alt={props.alt || 'Lore Image'} style={{ maxWidth: '100%', borderRadius: '8px', margin: '10px 0', display: 'block', border: '1px solid var(--neon-blue)' }} />;
                    }
                  }}
                >
                  {String(loreFiles[lorePage]).replace(/\[IMAGE:\s*(.+?)\]/gi, '![$1](./$1)')}
                </ReactMarkdown>
              ) : (
                <p>No archives found in the system.</p>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px' }}>
              <button 
                className="cyber-button" 
                onClick={() => setLorePage(p => Math.max(0, p - 1))}
                disabled={lorePage === 0}
                style={{ flex: 1, padding: '12px' }}
              >
                PREVIOUS
              </button>
              <span style={{ fontWeight: 'bold', letterSpacing: '0.1em' }}>
                {lorePage + 1} / {Math.max(1, loreFiles.length)}
              </span>
              <button 
                className="cyber-button" 
                onClick={() => setLorePage(p => Math.min(loreFiles.length - 1, p + 1))}
                disabled={lorePage >= loreFiles.length - 1}
                style={{ flex: 1, padding: '12px' }}
              >
                NEXT
              </button>
            </div>

            <button className="cyber-button red" onClick={() => setMode('main-menu')} style={{ width: '100%', marginTop: '16px', padding: '12px' }}>
              CLOSE TERMINAL
            </button>
          </div>
        </div>
      ) : mode === 'credits' ? (
        <div className="lobby-container">
          <div className="lobby-box glass-panel" style={{ maxWidth: '600px', padding: '50px 40px', textAlign: 'center' }}>
            <h1 className="lobby-title font-display" style={{ fontSize: '2rem', margin: '0 0 20px 0' }}>
              CREDITS
            </h1>
            <div style={{ color: 'var(--text-secondary)', fontSize: '1rem', lineHeight: '1.6', marginBottom: '30px' }}>
              <p style={{ fontWeight: 'bold', color: 'var(--neon-blue)' }}>Lazer Showdown WebRTC</p>
              <p>Powered by Vite + React</p>
              <p>P2P Multiplayer via WebRTC</p>
            </div>
            <button className="cyber-button" onClick={() => setMode('main-menu')} style={{ width: '100%' }}>
              BACK
            </button>
          </div>
        </div>
      ) : mode === 'mode-select' ? (
        /* Cyberpunk Mode Selection Page */
        <div className="lobby-container">
          <div className="lobby-box glass-panel" style={{ maxWidth: '600px', padding: '50px 40px', textAlign: 'center' }}>
            <h1 className="lobby-title font-display" style={{ fontSize: '2rem', margin: '0 0 10px 0' }}>
              SELECT GAME MODE
            </h1>
            <p className="lobby-subtitle" style={{ marginBottom: '40px' }}>
              How do you want to play?
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
                onClick={() => { setMode('local'); game.clearWorkspace(); }}
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

            <button
              className="cyber-button"
              onClick={() => setMode('main-menu')}
              style={{ padding: '12px', fontSize: '0.9rem', width: '100%', marginTop: '30px', borderColor: 'var(--text-secondary)' }}
            >
              BACK TO MAIN MENU
            </button>
          </div>
        </div>
      ) : (
        /* Cyberpunk Main Menu / Home Page */
        <div className="lobby-container">
          <div className="lobby-box glass-panel" style={{ maxWidth: '600px', padding: '60px 50px', textAlign: 'center' }}>
            <h1 className="lobby-title font-display" style={{ fontSize: '3.5rem', margin: '0 0 10px 0', textShadow: '0 0 20px var(--neon-blue)' }}>
              LAZER SHOWDOWN
            </h1>
            <p className="lobby-subtitle" style={{ marginBottom: '50px', fontSize: '1.1rem' }}>
              A Collaborative real-time P2P spatial playground
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%', maxWidth: '300px', margin: '0 auto' }}>
              <button 
                className="cyber-button blue" 
                onClick={() => setMode('mode-select')} 
                style={{ padding: '18px', fontSize: '1.2rem', fontWeight: 'bold', letterSpacing: '0.1em' }}
              >
                START GAME
              </button>
              <button 
                className="cyber-button" 
                onClick={() => setMode('rules')} 
                style={{ padding: '14px', letterSpacing: '0.1em' }}
              >
                RULES
              </button>
              <button 
                className="cyber-button" 
                onClick={() => {
                  setLorePage(0);
                  setMode('lore');
                }} 
                style={{ padding: '14px', letterSpacing: '0.1em', borderColor: '#b15cff', color: '#b15cff' }}
              >
                LORE
              </button>
              <button 
                className="cyber-button" 
                onClick={() => setMode('credits')} 
                style={{ padding: '14px', letterSpacing: '0.1em' }}
              >
                CREDITS
              </button>
              <button 
                className="cyber-button red" 
                onClick={() => {
                  if (window.confirm('Are you sure you want to exit?')) {
                    window.close();
                  }
                }} 
                style={{ padding: '14px', letterSpacing: '0.1em' }}
              >
                EXIT
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default App;
