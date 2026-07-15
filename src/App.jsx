import React, { useState, useEffect, useRef } from 'react';
import { useNetwork } from './hooks/useNetwork';
import { useGame } from './hooks/useGame';
import ConnectionScreen from './components/Lobby/ConnectionScreen';
import Layout from './components/Layout';
import TutorialLayout from './components/TutorialLayout';
import { Globe, Users, Cpu, ChevronDown, Share2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import './index.css';
import InstallPWA from './components/InstallPWA';

const loreModules = import.meta.glob(['./lore/*.md', './lore/*.txt'], { query: '?raw', import: 'default', eager: true });
const loreFiles = Object.keys(loreModules).sort().map(key => loreModules[key]);

// Load all image assets in the lore folder to map markdown references to Vite URLs
const loreImages = import.meta.glob('./lore/*.{png,jpg,jpeg,gif,webp,svg}', { import: 'default', eager: true });
const normalizedLoreImages = Object.fromEntries(
  Object.entries(loreImages).map(([k, v]) => [k.toLowerCase(), v])
);

// Load custom boards
const boardModules = import.meta.glob('./boards/*.json', { import: 'default', eager: true });
const customBoards = Object.keys(boardModules).map(key => ({
  name: key.replace('./boards/', '').replace('.json', ''),
  data: boardModules[key]
}));

const RULES_MARKDOWN = `
### 🏗️ Structure
- **Game**: 2 Sets
- **Set**: 3 Rounds
- **Round**: Defender's Roll + Attacker's Roll

### ⚙️ Setup
1. **Toss**: Both players roll one die. The higher roller wins and **chooses their role**.
2. **Defender** places **3 Point Pieces** anywhere on the board *except* the four corners.
3. **Attacker** places the **LAZER Piece** on any corner square, facing any direction.

### 🎲 Your Turn
Roll both dice to get your **Action Points (AP)**. Spend AP on:
- **MOVE (1 AP)**: Attacker moves LAZER 1 square (H/V). Defender moves a Point Piece 1 square.
- **ROTATE (1 AP)**: Attacker rotates the LAZER piece 90 degrees.
- **LAZER PRESS (1 AP)**: Fires the laser. It travels, bounces off mirrors, and captures any piece it hits.

*(Unused AP is forfeited. Actions can be taken in any order.)*

### 💥 The Laser
When fired, the laser travels straight until it:
- **Bounces** off a mirror (90° reflection).
- **Captures** a Point Piece (piece is removed, points awarded).
- **Exits** the board.

### 🏆 Scoring
- **Small Piece**: 20 pts
- **Medium Piece**: 30 pts
- **Large Piece**: 50 pts
- **Attacker** wants to capture pieces. **Defender** wants to evade.

### ⚡ Challenge Mechanic
If the Attacker captures **all 3 pieces** before the set ends, they may declare a **CHALLENGE**:
1. Attacker nominates one captured piece.
2. A toss is rolled (one die per player).
3. **Attacker wins** → Defender re-places all pieces. Capturing the challenged piece again adds its value to the score.
4. **Attacker loses** → The nominated piece's value is deducted.

### 🔄 Between Sets
After Set 1, **roles are swapped**. The player with the **highest total score** after both sets wins!
`;

function App() {
  const [mode, setMode] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('room') ? 'online' : 'main-menu';
  }); // 'main-menu', 'mode-select', 'online', 'local', 'bot', 'setup-bot', 'rules', 'credits', 'lore'
  const [difficulty, setDifficulty] = useState('medium'); // 'easy', 'medium', 'hard'
  const [lorePage, setLorePage] = useState(0);
  const [selectedBoardName, setSelectedBoardName] = useState('default');
  const [boardDropdownOpen, setBoardDropdownOpen] = useState(false);
  const [playerElo, setPlayerElo] = useState(() => parseInt(localStorage.getItem('playerElo')) || 1000);
  const [rulesTab, setRulesTab] = useState('rules');
  const network = useNetwork();

  // Hardware Back Button Interception
  const backPressTimer = useRef(null);
  const [showExitToast, setShowExitToast] = useState(false);
  const exitReady = useRef(false);

  useEffect(() => {
    window.history.pushState({ app: 'lazer' }, '');

    const handlePopState = (e) => {
      if (!exitReady.current) {
        exitReady.current = true;
        setShowExitToast(true);
        window.history.pushState({ app: 'lazer' }, ''); // Push state again to intercept

        if (backPressTimer.current) clearTimeout(backPressTimer.current);
        backPressTimer.current = setTimeout(() => {
          exitReady.current = false;
          setShowExitToast(false);
        }, 2000);
      } else {
        // Second press - let it exit
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

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

  const activeNetwork = mode === 'local' || mode === 'tutorial'
    ? mockLocalNetwork 
    : mode === 'bot' 
      ? mockBotNetwork 
      : network;

  const selectedBoardData = selectedBoardName === 'default' 
    ? null 
    : customBoards.find(b => b.name === selectedBoardName)?.data;

  const game = useGame(activeNetwork, mode, difficulty, selectedBoardData);

  // Show grid if connected in online, local, bot, or tutorial mode
  const showGameLayout = mode === 'local' || mode === 'bot' || mode === 'tutorial' || (mode === 'online' && network.status === 'connected');

  return (
    <>
      <InstallPWA show={mode === 'main-menu'} />
      {showGameLayout ? (
        mode === 'tutorial' ? (
          <TutorialLayout network={activeNetwork} originalGame={game} onExit={() => setMode('how-to-play')} />
        ) : (
          <Layout network={activeNetwork} game={game} mode={mode} difficulty={difficulty} />
        )
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
                onClick={() => { setDifficulty('ga'); setMode('bot'); game.clearWorkspace(); }}
                style={{ padding: '16px', fontSize: '1rem', width: '100%', textTransform: 'uppercase', borderColor: '#ff00ff', color: '#ff00ff' }}
              >
                AI (EXPECTIMINIMAX)
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
      ) : mode === 'how-to-play' ? (
        <div className="lobby-container">
          <div className="lobby-box glass-panel" style={{ maxWidth: '400px' }}>
            <h1 className="lobby-title font-display">HOW TO PLAY</h1>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginTop: '30px' }}>
              <button className="cyber-button" onClick={() => setMode('rules')} style={{ padding: '16px', fontSize: '1rem', width: '100%' }}>
                RULES OF ENGAGEMENT
              </button>
              <button className="cyber-button" onClick={() => { game.clearWorkspace(); setMode('tutorial'); }} style={{ padding: '16px', fontSize: '1rem', width: '100%' }}>
                INTERACTIVE TUTORIAL
              </button>
              <button className="cyber-button" onClick={() => setMode('video-guide')} style={{ padding: '16px', fontSize: '1rem', width: '100%' }}>
                VIDEO GUIDE
              </button>
              <button className="cyber-button" onClick={() => setMode('main-menu')} style={{ padding: '12px', fontSize: '0.9rem', width: '100%', marginTop: '16px', borderColor: 'var(--text-secondary)' }}>
                BACK TO MAIN MENU
              </button>
            </div>
          </div>
        </div>
      ) : mode === 'rules' ? (
        <div className="lobby-container">
          <div className="lobby-box glass-panel" style={{ maxWidth: '750px', padding: '40px 30px', textAlign: 'left', display: 'flex', flexDirection: 'column', height: '85vh' }}>
            <h1 className="lobby-title font-display" style={{ fontSize: '2rem', margin: '0 0 20px 0', textAlign: 'center' }}>
              RULES OF ENGAGEMENT
            </h1>
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px', marginBottom: '20px', color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: '1.6' }}>
              <ReactMarkdown
                components={{
                  h3: ({node, ...props}) => <h3 style={{ color: 'var(--neon-blue)', marginTop: '24px', marginBottom: '12px', borderBottom: '1px solid rgba(0, 240, 255, 0.2)', paddingBottom: '8px' }} {...props} />,
                  ul: ({node, ...props}) => <ul style={{ paddingLeft: '20px', marginBottom: '16px' }} {...props} />,
                  ol: ({node, ...props}) => <ol style={{ paddingLeft: '20px', marginBottom: '16px' }} {...props} />,
                  li: ({node, ...props}) => <li style={{ marginBottom: '6px' }} {...props} />,
                  strong: ({node, ...props}) => <strong style={{ color: 'var(--text-primary)' }} {...props} />
                }}
              >
                {RULES_MARKDOWN}
              </ReactMarkdown>
            </div>
            <button className="cyber-button" onClick={() => setMode('how-to-play')} style={{ width: '100%', padding: '12px', flexShrink: 0 }}>
              BACK
            </button>
          </div>
        </div>
      ) : mode === 'video-guide' ? (
        <div className="lobby-container">
          <div className="lobby-box glass-panel" style={{ maxWidth: '600px', padding: '40px 30px', textAlign: 'center', display: 'flex', flexDirection: 'column' }}>
            <h1 className="lobby-title font-display" style={{ fontSize: '2rem', margin: '0 0 20px 0' }}>
              VIDEO GUIDE
            </h1>
            <div style={{ margin: '20px 0', color: 'var(--text-secondary)' }}>
              <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0, overflow: 'hidden', maxWidth: '100%', marginBottom: '20px', borderRadius: '8px', border: '1px solid var(--neon-blue)' }}>
                <iframe 
                  style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
                  src="https://www.youtube.com/embed/dQw4w9WgXcQ" 
                  title="YouTube video player" 
                  frameBorder="0" 
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" 
                  allowFullScreen>
                </iframe>
              </div>
              <p style={{ color: 'var(--neon-blue)', fontStyle: 'italic' }}>Sorry for rickrolling you, tutorial video soon!</p>
            </div>
            <button className="cyber-button" onClick={() => setMode('how-to-play')} style={{ width: '100%', padding: '12px', flexShrink: 0 }}>
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
            <div style={{ color: 'var(--text-secondary)', fontSize: '1rem', lineHeight: '1.6', marginBottom: '30px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div>
                <p style={{ fontWeight: 'bold', color: 'var(--neon-blue)', fontSize: '1.2rem', marginBottom: '5px' }}>Lazer Showdown</p>
                <p style={{ fontSize: '0.9rem' }}>
                  The idea of the board game started for <strong>ARISE 2025</strong>, a chemical departmental fest in <strong>BVCOENM Kharghar</strong>.
                </p>
                <p style={{ fontSize: '0.9rem', marginTop: '5px' }}>
                  Created by <strong>Bhavna S Pillai</strong>, <strong>Ayush Raut</strong>, and <strong>Denzven Ignatius</strong>.
                </p>
              </div>
              
              <div style={{ padding: '15px', backgroundColor: 'rgba(0, 240, 255, 0.05)', border: '1px solid rgba(0, 240, 255, 0.2)', borderRadius: '8px' }}>
                <p style={{ fontSize: '0.85rem', opacity: 0.9 }}>
                  This PWA website/game app is made with <strong>Vite + React</strong> using <strong>Antigravity</strong> and <strong>Gemini 3.1 Pro (High) AI Agent</strong>.
                </p>
                <p style={{ fontSize: '0.85rem', opacity: 0.9, marginTop: '5px' }}>
                  P2P Multiplayer powered by WebRTC.
                </p>
              </div>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginTop: '10px' }}>
                <a 
                  href="https://github.com/denzven/Lazer-Showdown" 
                  target="_blank" 
                  rel="noreferrer"
                  className="cyber-button"
                  style={{ textDecoration: 'none', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '10px' }}
                >
                  GITHUB
                </a>
                <button 
                  className="cyber-button blue"
                  style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '10px' }}
                  onClick={() => {
                    const link = window.location.origin + window.location.pathname;
                    if (navigator.share) {
                      navigator.share({ title: 'Lazer Showdown', text: 'Thanks for playing Lazer Showdown! Check it out here:', url: link }).catch(console.error);
                    } else {
                      navigator.clipboard.writeText('Thanks for playing Lazer Showdown! Check it out here: \\n' + link);
                      alert('Link copied to clipboard! Thanks for playing!');
                    }
                  }}
                >
                  <Share2 size={18} /> SHARE
                </button>
              </div>

              <p style={{ fontSize: '0.95rem', fontWeight: 'bold', color: '#b15cff', marginTop: '5px' }}>
                Made with Love by DZVN 💜
              </p>
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
            <p className="lobby-subtitle" style={{ marginBottom: '20px' }}>
              How do you want to play?
            </p>

            <div style={{ marginBottom: '30px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', position: 'relative' }}>
              <label style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Select Board</label>
              
              <div 
                className="cyber-input"
                onClick={() => setBoardDropdownOpen(!boardDropdownOpen)}
                style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center',
                  padding: '12px 16px', 
                  fontSize: '1rem', 
                  width: '100%', 
                  maxWidth: '300px', 
                  backgroundColor: 'rgba(0, 0, 0, 0.5)', 
                  color: 'var(--neon-blue)', 
                  border: '1px solid var(--neon-blue)', 
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  boxShadow: boardDropdownOpen ? '0 0 10px rgba(0, 240, 255, 0.3)' : 'none'
                }}
              >
                <span>{selectedBoardName === 'default' ? 'DEFAULT BOARD' : selectedBoardName.replace(/_/g, ' ').toUpperCase()}</span>
                <ChevronDown size={18} style={{ transform: boardDropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
              </div>

              {boardDropdownOpen && (
                <div 
                  className="glass-panel"
                  style={{
                    position: 'absolute',
                    top: '100%',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    width: '100%',
                    maxWidth: '300px',
                    marginTop: '4px',
                    zIndex: 10,
                    display: 'flex',
                    flexDirection: 'column',
                    padding: '8px 0',
                    border: '1px solid var(--neon-blue)',
                    maxHeight: '200px',
                    overflowY: 'auto'
                  }}
                >
                  <div 
                    onClick={() => {
                      setSelectedBoardName('default');
                      game.clearWorkspace(null);
                      setBoardDropdownOpen(false);
                    }}
                    style={{
                      padding: '10px 16px',
                      cursor: 'pointer',
                      color: selectedBoardName === 'default' ? 'var(--neon-blue)' : 'var(--text-primary)',
                      backgroundColor: selectedBoardName === 'default' ? 'rgba(0, 240, 255, 0.1)' : 'transparent',
                      textAlign: 'left',
                      fontWeight: selectedBoardName === 'default' ? 'bold' : 'normal'
                    }}
                    onMouseEnter={(e) => e.target.style.backgroundColor = 'rgba(0, 240, 255, 0.2)'}
                    onMouseLeave={(e) => e.target.style.backgroundColor = selectedBoardName === 'default' ? 'rgba(0, 240, 255, 0.1)' : 'transparent'}
                  >
                    DEFAULT BOARD
                  </div>
                  {customBoards.map(b => (
                    <div 
                      key={b.name}
                      onClick={() => {
                        setSelectedBoardName(b.name);
                        game.clearWorkspace(b.data);
                        setBoardDropdownOpen(false);
                      }}
                      style={{
                        padding: '10px 16px',
                        cursor: 'pointer',
                        color: selectedBoardName === b.name ? 'var(--neon-blue)' : 'var(--text-primary)',
                        backgroundColor: selectedBoardName === b.name ? 'rgba(0, 240, 255, 0.1)' : 'transparent',
                        textAlign: 'left',
                        fontWeight: selectedBoardName === b.name ? 'bold' : 'normal'
                      }}
                      onMouseEnter={(e) => e.target.style.backgroundColor = 'rgba(0, 240, 255, 0.2)'}
                      onMouseLeave={(e) => e.target.style.backgroundColor = selectedBoardName === b.name ? 'rgba(0, 240, 255, 0.1)' : 'transparent'}
                    >
                      {b.name.replace(/_/g, ' ').toUpperCase()}
                    </div>
                  ))}
                </div>
              )}
            </div>

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
                onClick={() => setMode('how-to-play')} 
                style={{ padding: '14px', letterSpacing: '0.1em' }}
              >
                HOW TO PLAY
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
      
      {showExitToast && (
        <div style={{
          position: 'fixed',
          bottom: '10%',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(0, 240, 255, 0.1)',
          backdropFilter: 'blur(10px)',
          color: 'var(--neon-blue)',
          padding: '12px 24px',
          borderRadius: '30px',
          zIndex: 9999,
          fontSize: '0.95rem',
          fontWeight: 'bold',
          border: '1px solid var(--neon-blue)',
          boxShadow: '0 0 15px var(--neon-blue-glow)',
          pointerEvents: 'none',
          animation: 'fadeInOut 2s ease-in-out forwards'
        }}>
          Press back again to exit
        </div>
      )}
    </>
  );
}

export default App;
