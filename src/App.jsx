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
import DevsCorner from './components/DevsCorner';
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
  // 1. React States & Refs declared at the top of the component lexical scope
  const [difficulty, setDifficulty] = useState('medium'); // 'easy', 'medium', 'hard'
  const [spectateConfig, setSpectateConfig] = useState({ redBot: 'easy', blueBot: 'hard' });
  const [lorePage, setLorePage] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth > 768);
  const loreScrollRef = useRef(null);
  const [selectedBoardName, setSelectedBoardName] = useState('default');
  const [boardDropdownOpen, setBoardDropdownOpen] = useState(false);
  const [playerElo, setPlayerElo] = useState(() => parseInt(localStorage.getItem('playerElo')) || 1000);
  const [rulesTab, setRulesTab] = useState('rules');
  const network = useNetwork();

  // Hardware Back Button Interception State & Refs
  const backPressTimer = useRef(null);
  const [showExitToast, setShowExitToast] = useState(false);
  const exitReady = useRef(false);

  // Helper: Parse hash to mode
  const getModeFromHash = () => {
    const hash = window.location.hash;
    const params = new URLSearchParams(window.location.search);
    if (params.get('room')) return 'online';

    if (!hash || hash === '#/' || hash === '#/menu') return 'main-menu';
    if (hash === '#/modes') return 'mode-select';
    if (hash === '#/local') return 'local';
    
    // Parse difficulty sub-paths
    if (hash.startsWith('#/bot/')) {
      const diff = hash.substring(6);
      if (['easy', 'medium', 'hard', 'ga'].includes(diff)) {
        return 'bot';
      }
    }
    if (hash === '#/bot' || hash === '#/bot/select') return 'setup-bot';
    if (hash === '#/tutorial') return 'tutorial';
    if (hash === '#/how-to-play') return 'how-to-play';
    if (hash === '#/rules') return 'rules';
    if (hash === '#/video-guide') return 'video-guide';
    if (hash === '#/credits') return 'credits';
    if (hash === '#/devs-corner') return 'devs-corner';
    
    // Parse lore page sub-paths
    if (hash.startsWith('#/lore/')) {
      const pageIndex = parseInt(hash.substring(7), 10);
      if (!isNaN(pageIndex) && pageIndex > 0) {
        return 'lore';
      }
    }
    if (hash === '#/lore') return 'lore';
    if (hash === '#/spectate') return 'spectate';
    if (hash === '#/online' || hash === '#/online/host' || hash === '#/online/join') return 'online';

    return '404';
  };

  const [mode, setModeState] = useState(getModeFromHash);
  const isProgrammaticNav = useRef(false);

  // Sync lore scroll container back to top on page switches
  useEffect(() => {
    if (loreScrollRef.current) {
      loreScrollRef.current.scrollTop = 0;
    }
  }, [lorePage]);

  // Sync lore page updates to browser URL hash programmatically
  useEffect(() => {
    if (mode === 'lore') {
      const targetHash = `#/lore/${lorePage + 1}`;
      if (window.location.hash !== targetHash) {
        isProgrammaticNav.current = true;
        window.location.hash = targetHash;
        setTimeout(() => {
          isProgrammaticNav.current = false;
        }, 0);
      }
    }
  }, [lorePage, mode]);

  // Expose setter for child components (like ConnectionScreen)
  useEffect(() => {
    window.Lazer_setIsProgrammaticNav = (val) => {
      isProgrammaticNav.current = val;
    };
    return () => {
      delete window.Lazer_setIsProgrammaticNav;
    };
  }, []);

  // Sync mode state changes to URL hash
  const setMode = (newMode, diffOverride = null) => {
    // If returning to menu, clear peer connection parameters (like ?room=...)
    if (newMode === 'main-menu' && window.location.search) {
      window.history.replaceState({}, '', window.location.pathname);
    }

    let targetHash = '#/';
    if (newMode === 'main-menu') targetHash = '#/';
    else if (newMode === 'mode-select') targetHash = '#/modes';
    else if (newMode === 'local') targetHash = '#/local';
    else if (newMode === 'bot') {
      const activeDiff = diffOverride || difficulty;
      targetHash = `#/bot/${activeDiff}`;
    }
    else if (newMode === 'setup-bot') targetHash = '#/bot/select';
    else if (newMode === 'tutorial') targetHash = '#/tutorial';
    else if (newMode === 'how-to-play') targetHash = '#/how-to-play';
    else if (newMode === 'rules') targetHash = '#/rules';
    else if (newMode === 'video-guide') targetHash = '#/video-guide';
    else if (newMode === 'credits') targetHash = '#/credits';
    else if (newMode === 'devs-corner') targetHash = '#/devs-corner';
    else if (newMode === 'lore') {
      targetHash = `#/lore/${lorePage + 1}`;
    }
    else if (newMode === 'spectate') targetHash = '#/spectate';
    else if (newMode === 'online') targetHash = '#/online';
    else if (newMode === '404') targetHash = '#/not-found';

    if (window.location.hash !== targetHash) {
      isProgrammaticNav.current = true;
      window.location.hash = targetHash;
      setTimeout(() => {
        isProgrammaticNav.current = false;
      }, 0);
    }
    setModeState(newMode);
  };

  // Sync from hashchange events (e.g., back/forward browser buttons)
  useEffect(() => {
    const handleHashChange = () => {
      const parsedMode = getModeFromHash();
      setModeState(parsedMode);

      const hash = window.location.hash;
      // Extract difficulty if navigating directly or via history
      if (hash.startsWith('#/bot/')) {
        const diff = hash.substring(6);
        if (['easy', 'medium', 'hard', 'ga'].includes(diff)) {
          setDifficulty(diff);
        }
      }
      // Extract lore page index
      if (hash.startsWith('#/lore/')) {
        const pageIndex = parseInt(hash.substring(7), 10);
        if (!isNaN(pageIndex) && pageIndex > 0 && pageIndex <= loreFiles.length) {
          setLorePage(pageIndex - 1);
        }
      } else if (hash === '#/lore') {
        setLorePage(0);
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Sync initial settings on direct load
  useEffect(() => {
    const hash = window.location.hash;
    if (hash.startsWith('#/bot/')) {
      const diff = hash.substring(6);
      if (['easy', 'medium', 'hard', 'ga'].includes(diff)) {
        setDifficulty(diff);
      }
    }
    if (hash.startsWith('#/lore/')) {
      const pageIndex = parseInt(hash.substring(7), 10);
      if (!isNaN(pageIndex) && pageIndex > 0 && pageIndex <= loreFiles.length) {
        setLorePage(pageIndex - 1);
      }
    }
  }, []);

  const modeRef = useRef(mode);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  // Dynamic Metadata Sync for SEO Optimization (Targeting Players & Devs)
  useEffect(() => {
    let title = "Lazer Showdown — Free Online P2P Laser Strategy Board Game";
    let desc = "Play Lazer Showdown: a futuristic 1v1 laser-reflection strategy game. Challenge friends online with P2P WebRTC, play locally, or battle custom and built-in AI bots.";

    switch (mode) {
      case 'main-menu':
        title = "Lazer Showdown — Free Online P2P Laser Strategy Board Game";
        desc = "Play Lazer Showdown: a futuristic 1v1 laser-reflection strategy game. Challenge friends online with P2P WebRTC, play locally, or battle custom and built-in AI bots.";
        break;
      case 'mode-select':
        title = "Select Game Mode | Lazer Showdown";
        desc = "Choose how to play Lazer Showdown. Enter the multiplayer lobby for online PvP, play local pass & play, or challenge the AI computer.";
        break;
      case 'online': {
        const hash = window.location.hash;
        if (hash === '#/online/host') {
          title = "Host a Multiplayer Room | Lazer Showdown";
          desc = "Create a P2P multiplayer room, copy the room link, and play Lazer Showdown online with your friends.";
        } else if (hash === '#/online/join') {
          title = "Join a Multiplayer Room | Lazer Showdown";
          desc = "Join an online P2P Lazer Showdown room code directly via WebRTC peer connection.";
        } else {
          title = "Multiplayer Lobby | Lazer Showdown";
          desc = "Host or join real-time WebRTC multiplayer rooms in Lazer Showdown to duel other players online.";
        }
        break;
      }
      case 'local':
        title = "Pass & Play Local Board | Lazer Showdown";
        desc = "Play Lazer Showdown locally with a friend in Pass & Play mode. Test layouts and strategy sandbox offline.";
        break;
      case 'setup-bot':
        title = "Select AI Opponent | Lazer Showdown";
        desc = "Select your computer opponent difficulty. Play against Zlorooklp (Easy), Lizbishmir (Medium), Shahlzrmir (Hard), or the genetic-weighted Expectiminimax AI.";
        break;
      case 'bot':
        title = "Playing VS Computer AI | Lazer Showdown";
        desc = "Lazer battle in progress against the computer opponent. Outsmart the artificial intelligence grid strategies.";
        break;
      case 'tutorial':
        title = "Interactive Tactical Tutorial | Lazer Showdown";
        desc = "Learn how to play Lazer Showdown step-by-step. Master action points, mirror setups, laser firing path physics, and spatial tactics.";
        break;
      case 'how-to-play':
        title = "Tactical Guides & Tutorial | Lazer Showdown";
        desc = "Access Lazer Showdown training archives. Learn the game rules, play the interactive tutorial, or watch the guide video.";
        break;
      case 'rules':
        title = "Rules of Engagement & Score Sheets | Lazer Showdown";
        desc = "Official rules of Lazer Showdown. Learn mirror alignments, scoring system details, set sweeps, and the challenge phase mechanics.";
        break;
      case 'video-guide':
        title = "Official Video Guides | Lazer Showdown";
        desc = "Watch tutorials and video walkthroughs of Lazer Showdown matches. Learn layouts, tactical moves, and mirror setups.";
        break;
      case 'credits':
        title = "Creator Credits & Devs | Lazer Showdown";
        desc = "Meet the builders behind Lazer Showdown. Powered by React, Vite, WebRTC, and the Gemini AI coding assistant.";
        break;
      case 'devs-corner':
        title = "Developer's Corner - Upload Custom Bots | Lazer Showdown";
        desc = "Write custom bot scripts! Developer guides, API helper utilities, and headless double-round-robin tournament simulators to watch bots showdown.";
        break;
      case 'lore':
        title = `Grid Terminal Archives - Chapter ${lorePage + 1} | Lazer Showdown`;
        desc = `Read page ${lorePage + 1} of the Lazer Showdown grid terminal database. Learn the lore, histories, and secrets of the spatial matrix.`;
        break;
      case 'spectate':
        title = "Spectating Live Bot Battle | Lazer Showdown";
        desc = "Spectate live matches between built-in or custom uploaded javascript bots. Watch heuristics and tactics clash live on the board.";
        break;
      case '404':
        title = "404 Connection Compromised | Lazer Showdown";
        desc = "Signal lost. The requested coordinate sector does not map to any active grid cells.";
        break;
      default:
        break;
    }

    // Update document head metadata dynamically
    document.title = title;
    
    const descEl = document.querySelector('meta[name="description"]');
    if (descEl) descEl.setAttribute("content", desc);
    
    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) ogTitle.setAttribute("content", title);
    
    const ogDesc = document.querySelector('meta[property="og:description"]');
    if (ogDesc) ogDesc.setAttribute("content", desc);

    const twitterTitle = document.querySelector('meta[name="twitter:title"]');
    if (twitterTitle) twitterTitle.setAttribute("content", title);

    const twitterDesc = document.querySelector('meta[name="twitter:description"]');
    if (twitterDesc) twitterDesc.setAttribute("content", desc);
  }, [mode, lorePage]);

  // Back button interception popstate
  useEffect(() => {
    window.history.pushState({ app: 'lazer' }, '');

    const handlePopState = (e) => {
      if (isProgrammaticNav.current) return;

      const wasAtMainMenu = modeRef.current === 'main-menu';
      if (wasAtMainMenu) {
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

  const getBotNameWithStrategy = (diff) => {
    if (diff === 'easy') return 'Zlorooklp (EASY)';
    if (diff === 'medium') return 'Lizbishmir (MEDIUM)';
    if (diff === 'hard') return 'Shahlzrmir (HARD)';
    if (diff === 'ga') return 'GA-Bot (TUNED)';
    return `Bot (${diff.substring(0, 8)})`;
  };

  const mockSpectateNetwork = {
    status: 'connected',
    role: 'red',
    playerName: getBotNameWithStrategy(spectateConfig.redBot),
    opponentName: getBotNameWithStrategy(spectateConfig.blueBot),
    isOpponentAfk: false,
    disconnect: () => setMode('devs-corner'), // Return devs-corner on exit
    sendPayload: () => {} // No-op
  };

  const activeNetwork = mode === 'local' || mode === 'tutorial'
    ? mockLocalNetwork 
    : mode === 'bot' 
      ? mockBotNetwork 
      : mode === 'spectate'
        ? mockSpectateNetwork
        : network;

  const selectedBoardData = selectedBoardName === 'default' 
    ? null 
    : customBoards.find(b => b.name === selectedBoardName)?.data;

  const game = useGame(activeNetwork, mode, difficulty, selectedBoardData, spectateConfig);

  // Show grid if connected in online, local, bot, tutorial, or spectate mode
  const showGameLayout = mode === 'local' || mode === 'bot' || mode === 'tutorial' || mode === 'spectate' || (mode === 'online' && network.status === 'connected');

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
                onClick={() => { setDifficulty('easy'); setMode('bot', 'easy'); game.clearWorkspace(); }}
                style={{ padding: '16px', fontSize: '1rem', width: '100%', textTransform: 'uppercase' }}
              >
                ZLOROOKLP (EASY)
              </button>
              
              <button
                className="cyber-button"
                onClick={() => { setDifficulty('medium'); setMode('bot', 'medium'); game.clearWorkspace(); }}
                style={{ padding: '16px', fontSize: '1rem', width: '100%', textTransform: 'uppercase', borderColor: '#ffcc00', color: '#ffcc00' }}
              >
                LIZBISHMIR (MEDIUM)
              </button>

              <button
                className="cyber-button red"
                onClick={() => { setDifficulty('hard'); setMode('bot', 'hard'); game.clearWorkspace(); }}
                style={{ padding: '16px', fontSize: '1rem', width: '100%', textTransform: 'uppercase' }}
              >
                SHAHLZRMIR (HARD)
              </button>

              <button
                className="cyber-button"
                onClick={() => { setDifficulty('ga'); setMode('bot', 'ga'); game.clearWorkspace(); }}
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
          <div className="lobby-box glass-panel lore-layout" style={{ maxWidth: '1000px', width: '100%', padding: '0', textAlign: 'left', height: '80vh' }}>
            {/* Sidebar (Left Index Panel) */}
            <div className={`lore-sidebar ${sidebarOpen ? 'open' : ''}`}>
              <h2 className="font-display" style={{ color: 'var(--neon-blue)', fontSize: '1rem', letterSpacing: '2px', marginBottom: '20px', borderBottom: '1px solid rgba(0, 240, 255, 0.2)', paddingBottom: '8px', textTransform: 'uppercase' }}>
                📂 LOG INDEX
              </h2>
              
              {/* Index List */}
              <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
                {Object.keys(loreModules).sort().map((key, index) => {
                  const rawName = key.replace('./lore/', '').replace(/\.[^/.]+$/, '');
                  const cleanTitle = rawName
                    .replace(/_/g, ' ')
                    .replace(/^\d+[\s_-]/, '')
                    .toUpperCase();
                  
                  const isActive = lorePage === index;
                  return (
                    <div
                      key={key}
                      onClick={() => {
                        setLorePage(index);
                        if (window.innerWidth <= 768) {
                          setSidebarOpen(false);
                        }
                      }}
                      style={{
                        padding: '10px 12px',
                        cursor: 'pointer',
                        borderRadius: '4px',
                        border: isActive ? '1px solid var(--neon-blue)' : '1px solid transparent',
                        backgroundColor: isActive ? 'rgba(0, 240, 255, 0.1)' : 'transparent',
                        color: isActive ? 'var(--neon-blue)' : 'var(--text-secondary)',
                        fontSize: '0.85rem',
                        fontWeight: 'bold',
                        letterSpacing: '0.5px',
                        transition: 'all 0.2s',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                      onMouseEnter={(e) => {
                        if (!isActive) e.target.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
                      }}
                      onMouseLeave={(e) => {
                        if (!isActive) e.target.style.backgroundColor = 'transparent';
                      }}
                    >
                      <span style={{ color: 'var(--neon-blue)', opacity: 0.7 }}>0{index + 1}.</span>
                      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cleanTitle}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Reading Content Pane (Right side) */}
            <div 
              className="lore-content" 
              onClick={() => {
                if (window.innerWidth <= 768 && sidebarOpen) {
                  setSidebarOpen(false);
                }
              }}
            >
              {/* Mobile Menu Toggle Button */}
              <button 
                className="cyber-button lore-toggle"
                onClick={(e) => {
                  e.stopPropagation();
                  setSidebarOpen(!sidebarOpen);
                }}
                style={{
                  position: 'absolute',
                  top: '16px',
                  left: '16px',
                  padding: '6px 12px',
                  fontSize: '0.75rem',
                  zIndex: 5
                }}
              >
                📂 {sidebarOpen ? 'HIDE INDEX' : 'SHOW INDEX'}
              </button>

              <div ref={loreScrollRef} style={{ flex: 1, overflowY: 'auto', paddingRight: '12px' }}>
                {loreFiles.length > 0 ? (
                  <ReactMarkdown
                    components={{
                      h1: ({node, ...props}) => <h1 style={{ color: 'var(--neon-blue)', fontFamily: 'var(--font-display)', fontSize: '1.8rem', marginTop: '0', marginBottom: '16px', borderBottom: '1px solid rgba(0, 240, 255, 0.1)', paddingBottom: '12px' }} {...props} />,
                      h2: ({node, ...props}) => <h2 style={{ color: 'var(--neon-blue)', fontFamily: 'var(--font-display)', fontSize: '1.4rem', marginTop: '24px', marginBottom: '12px' }} {...props} />,
                      h3: ({node, ...props}) => <h3 style={{ color: 'var(--neon-blue)', fontFamily: 'var(--font-display)', fontSize: '1.2rem', marginTop: '20px', marginBottom: '10px' }} {...props} />,
                      p: ({node, ...props}) => <p style={{ color: '#e2e8f0', fontSize: '1.05rem', lineHeight: '1.75', marginBottom: '18px' }} {...props} />,
                      strong: ({node, ...props}) => <strong style={{ color: 'var(--neon-blue)', fontWeight: 'bold' }} {...props} />,
                      ul: ({node, ...props}) => <ul style={{ paddingLeft: '20px', marginBottom: '18px' }} {...props} />,
                      ol: ({node, ...props}) => <ol style={{ paddingLeft: '20px', marginBottom: '18px' }} {...props} />,
                      li: ({node, ...props}) => <li style={{ color: '#e2e8f0', fontSize: '1.05rem', lineHeight: '1.75', marginBottom: '8px' }} {...props} />,
                      img: ({node, ...props}) => {
                        let src = props.src || '';
                        if (src.startsWith('./')) src = src.replace('./', '');
                        const fullPath = `./lore/${src}`.toLowerCase();
                        const resolvedSrc = normalizedLoreImages[fullPath] || props.src;
                        return (
                          <img 
                            {...props} 
                            src={resolvedSrc} 
                            alt={props.alt || 'Lore Image'} 
                            draggable="false"
                            style={{ 
                              maxWidth: '100%', 
                              maxHeight: '380px',
                              objectFit: 'cover',
                              borderRadius: '8px', 
                              margin: '24px auto', 
                              display: 'block', 
                              border: '2px solid var(--neon-blue)', 
                              boxShadow: '0 0 15px rgba(0, 240, 255, 0.2)',
                              userSelect: 'none', 
                              WebkitUserDrag: 'none',
                              pointerEvents: 'none'
                            }} 
                          />
                        );
                      }
                    }}
                  >
                    {String(loreFiles[lorePage]).replace(/\[IMAGE:\s*(.+?)\]/gi, '![$1](./$1)')}
                  </ReactMarkdown>
                ) : (
                  <p style={{ color: 'var(--text-secondary)' }}>No archives found in the system.</p>
                )}

                {/* Inline controls directly at the end of the scrollable text */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '40px', paddingTop: '20px', borderTop: '1px solid rgba(0, 240, 255, 0.1)', gap: '16px' }}>
                  <button 
                    className="cyber-button" 
                    onClick={() => setLorePage(p => Math.max(0, p - 1))}
                    disabled={lorePage === 0}
                    style={{ flex: 1, padding: '12px', fontSize: '0.9rem' }}
                  >
                    ◀ PREVIOUS LOG
                  </button>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', fontWeight: 'bold', letterSpacing: '1px' }}>
                    {lorePage + 1} / {Math.max(1, loreFiles.length)}
                  </span>
                  <button 
                    className="cyber-button" 
                    onClick={() => setLorePage(p => Math.min(loreFiles.length - 1, p + 1))}
                    disabled={lorePage >= loreFiles.length - 1}
                    style={{ flex: 1, padding: '12px', fontSize: '0.9rem' }}
                  >
                    NEXT LOG ▶
                  </button>
                </div>
              </div>

              {/* Sticky close button at the bottom of the reading pane, always visible */}
              <button 
                className="cyber-button red" 
                onClick={() => setMode('main-menu')} 
                style={{ width: '100%', marginTop: '16px', padding: '12px', flexShrink: 0, fontWeight: 'bold', letterSpacing: '1px' }}
              >
                CLOSE TERMINAL
              </button>
            </div>
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
                      navigator.clipboard.writeText('Thanks for playing Lazer Showdown! Check it out here: \n' + link);
                      alert('Link copied to clipboard! Thanks for playing!');
                    }
                  }}
                >
                  <Share2 size={18} /> SHARE
                </button>
              </div>

              <button 
                className="cyber-button"
                style={{ width: '100%', marginTop: '10px', borderColor: '#39ff14', color: '#39ff14', padding: '12px' }}
                onClick={() => setMode('devs-corner')}
              >
                🚀 DEVELOPER'S CORNER
              </button>

              <p style={{ fontSize: '0.95rem', fontWeight: 'bold', color: '#b15cff', marginTop: '5px' }}>
                Made with Love by DZVN 💜
              </p>
            </div>
            <button className="cyber-button" onClick={() => setMode('main-menu')} style={{ width: '100%' }}>
              BACK
            </button>
          </div>
        </div>
      ) : mode === 'devs-corner' ? (
        <DevsCorner 
          onBack={() => setMode('credits')}
          customBoards={customBoards}
          onStartSpectate={(redBot, blueBot, boardName = 'default') => {
            setSpectateConfig({ redBot, blueBot });
            setSelectedBoardName(boardName);
            const bData = boardName === 'default' ? null : customBoards.find(b => b.name === boardName)?.data;
            game.clearWorkspace(bData);
            setMode('spectate');
          }}
        />
      ) : mode === '404' ? (
        <div className="lobby-container">
          <div className="lobby-box glass-panel glow-border-red" style={{ maxWidth: '500px', padding: '50px 40px', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', background: 'linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.25) 50%), linear-gradient(90deg, rgba(255, 0, 0, 0.06), rgba(0, 255, 0, 0.02), rgba(0, 0, 255, 0.06))', backgroundSize: '100% 4px, 6px 100%', pointerEvents: 'none', zIndex: 2 }} />
            
            <div style={{ fontSize: '5rem', fontWeight: 'bold', color: 'var(--neon-red)', textShadow: '0 0 10px rgba(255, 42, 133, 0.5), 2px 2px #ff0055, -2px -2px #00ffcc', fontFamily: 'monospace', letterSpacing: '2px', animation: 'afkPulse 1.5s infinite', margin: '0 0 10px 0' }}>
              404
            </div>
            
            <h2 className="font-display" style={{ color: 'var(--text-primary)', fontSize: '1.4rem', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '15px' }}>
              CONNECTION COMPROMISED
            </h2>
            
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.92rem', lineHeight: '1.6', marginBottom: '30px', padding: '15px', backgroundColor: 'rgba(255, 42, 133, 0.05)', border: '1px solid rgba(255, 42, 133, 0.2)', borderRadius: '8px' }}>
              <p style={{ margin: 0, color: 'var(--neon-red)', fontWeight: 'bold' }}>
                ⚠️ SIGNAL LOST IN THE LAZER MATRIX
              </p>
              <p style={{ margin: '8px 0 0 0', fontSize: '0.85rem', opacity: 0.8 }}>
                The coordinates you requested do not map to any active grid sectors. Return to the main menu terminal immediately.
              </p>
            </div>
            
            <button className="cyber-button" onClick={() => setMode('main-menu')} style={{ width: '100%', padding: '12px', fontSize: '1rem', fontWeight: 'bold', letterSpacing: '1px' }}>
              BACK TO TERMINAL
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
