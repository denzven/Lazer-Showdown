import React, { useState, useEffect, useRef } from 'react';
import { 
  Upload, Play, Award, HelpCircle, BookOpen, Terminal, 
  RefreshCw, ChevronLeft, ChevronDown, ArrowRight, Info, AlertTriangle, CheckCircle,
  Cpu, Grid, Trash2, Download
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import botsDocRaw from '../../docs/BOTS.md?raw';
import { 
  EasyStrategy, MediumStrategy, HardStrategy, GAStrategy, CUSTOM_STRATEGIES,
  getBoardState, getPossibleActions, applyLightweightAction, getPieceThreatLevels,
  generateThreatMap, computeSafetySteps, bfsToNearestFiringCell, getReverseFiringCells,
  getChallengeRecommendation
} from '../core/BotStrategies';
import { BLOCK_TYPES, traceLaserBeam, validatePlacement, validateMovement } from '../core/Ruleset';
import { getInitialState, applySandboxAction } from '../core/GameState';
import { getBotSetupAction } from '../core/BotEngine';

const SAMPLE_BOT_CODE = `// Example simple custom bot (MyBot.js)
//
// 💡 DESIGNING YOUR BOT STRATEGY:
// Write your custom strategy here. You can construct look-ahead algorithms, heuristic 
// evaluation trees, or minimax search routines by using the global helper APIs below.
//
// 🛠️ AVAILABLE LAZERAI HELPER FUNCTIONS:
// - getBoardState(board): Extracts board metadata -> { lazerPos: {r, c}, lazerDir: 0|90|180|270, pointPieces: [], emptyCells: [] }
// - getPossibleActions(board, role): Lists all legal moves/actions -> Array of Action Objects
// - applyLightweightAction(board, action): Clones the board & simulates the action -> returns cloned 8x8 Board
// - traceLaserBeam(board, position, direction): Traces laser raycast -> { path: [{r, c}], hitPiece: {r, c, cell} | null }
// - validatePlacement(board, r, c, pieceType): Checks setup placements -> { valid: boolean, error: string }
// - validateMovement(board, fromR, fromC, toR, toC): Checks movement rules -> { valid: boolean, error: string }
// - generateThreatMap(board): Evaluates danger levels for all tiles -> 8x8 grid of threats (0.0 to 1.0)
// - getPieceThreatLevels(board): Lists point pieces sorted by active threat levels
// - computeSafetySteps(board, r, c, threatMap): Computes BFS path length to reach a safe cell (threat <= 0.25)
// - bfsToNearestFiringCell(board, r, c): Computes BFS path to a grid coordinate from which a laser can fire and hit target
// - getReverseFiringCells(board): Maps target elements back to coordinates that hit them
const { 
  getBoardState, 
  getPossibleActions, 
  applyLightweightAction, 
  traceLaserBeam, 
  validatePlacement,
  generateThreatMap,
  getPieceThreatLevels,
  computeSafetySteps
} = LazerAI;

/**
 * 🎮 STEP 1: DEFINE GAMEPLAY DECISIONS
 * getPlayAction is called when it is your turn to move.
 * Evaluate legal actions here using board look-aheads and heuristic evaluations.
 */
export function getPlayAction(board, role, actionPoints, gameState, botPlayer) {
  const actions = getPossibleActions(board, role);
  if (actions.length === 0) return null;
  
  // Example Heuristic: If Attacker, fire laser immediately if aligned, otherwise select a random move
  if (role === 'attacker') {
    const { lazerPos, lazerDir } = getBoardState(board);
    if (lazerPos) {
      // Trace the path of the laser ray
      const trace = traceLaserBeam(board, lazerPos, lazerDir);
      
      // If the beam is currently pointing at a high-value point piece, fire!
      if (trace.hitPiece && ['block-20', 'block-30', 'block-50'].includes(trace.hitPiece.cell.type)) {
        return { type: 'laser-press' };
      }
    }
  }
  
  // Fallback: return a random legal action (you can replace this with Minimax, Alpha-Beta, or GA weights)
  return actions[Math.floor(Math.random() * actions.length)];
}

/**
 * 🏗️ STEP 2: DEFINE PIECE PLACEMENTS
 * getSetupAction is called during setup rounds.
 * Customize your startup placement coordinates and mirror block structures here.
 */
export function getSetupAction(board, phase, playerColor, challengedPiece) {
  if (phase === 'setup-defender') {
    // Count pieces currently placed
    let placedCount = 0;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const cell = board[r][c];
        if (cell && ['block-20', 'block-30', 'block-50'].includes(cell.type)) placedCount++;
      }
    }
    // Defender needs to place exactly 3 point blocks
    if (placedCount >= 3) {
      return { type: 'confirm-setup' };
    }
    // Place point pieces on safe middle rows (r: 2 to 5)
    const pieceTypes = ['block-20', 'block-30', 'block-50'];
    const pieceType = pieceTypes[placedCount] || 'block-20';
    for (let r = 2; r <= 5; r++) {
      for (let c = 1; c <= 6; c++) {
        // Validate coordinates to avoid mirror stands and corners
        if (validatePlacement && validatePlacement(board, r, c, pieceType).valid) {
          return { type: 'place', pieceType, r, c, rotation: 0 };
        } else if (!board[r][c]) {
          return { type: 'place', pieceType, r, c, rotation: 0 };
        }
      }
    }
  } else if (phase === 'challenge-setup') {
    // Find if the challenged piece has been placed
    let isPlaced = false;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const cell = board[r][c];
        if (cell && cell.type === challengedPiece) {
          isPlaced = true;
          break;
        }
      }
    }
    if (isPlaced) {
      return { type: 'confirm-setup' };
    }
    // Place the challenged piece on a safe coordinate
    for (let r = 2; r <= 5; r++) {
      for (let c = 1; c <= 6; c++) {
        if (validatePlacement && validatePlacement(board, r, c, challengedPiece).valid) {
          return { type: 'place', pieceType: challengedPiece, r, c, rotation: 0 };
        } else if (!board[r][c]) {
          return { type: 'place', pieceType: challengedPiece, r, c, rotation: 0 };
        }
      }
    }
  } else if (phase === 'setup-attacker') {
    // Place laser in top-left corner facing down (rotation: 90 degrees)
    if (!board[0][0]) {
      return { type: 'place', pieceType: 'block-lazer', r: 0, c: 0, rotation: 90 };
    }
  }
  return { type: 'confirm-setup' };
}

/**
 * 🎲 STEP 3: DEFINE BLUFFING AND CHALLENGES
 * getChallengeAction is called when the opponent captures one of your pieces.
 * Choose whether to initiate a dice roll challenge based on point values.
 */
export function getChallengeAction(board, gameState, playerColor) {
  // Simple heuristic: Risk a challenge roll if a 50-point piece has been captured
  const captured = gameState.capturedPieces || [];
  if (captured.includes('block-50')) {
    return { type: 'declare-challenge', declare: true, pieceType: 'block-50' };
  }
  return { type: 'declare-challenge', declare: false };
}`;

// Custom Javascript Syntax Highlighter Tokenizer
function highlightJsCode(code) {
  const tokens = [];
  const rules = [
    { type: 'comment', regex: /^\/\/.*$/ },
    { type: 'string', regex: /^"(?:[^"\\]|\\.)*"|^'(?:[^'\\]|\\.)*'|^`(?:[^`\\]|\\.)*`/ },
    { type: 'keyword', regex: /^(?:const|let|var|export|function|return|if|else|import|typeof|null|true|false)\b/ },
    { type: 'builtin', regex: /^(?:LazerAI|Math|random|floor|length|includes|BLOCK_TYPES|getBoardState|getPossibleActions|applyLightweightAction|traceLaserBeam|lazerPos|lazerDir|hitPiece)\b/ },
    { type: 'number', regex: /^\b\d+\b/ },
    { type: 'operator', regex: /^[+\-*\/%&|^!=<>:~?]+/ },
    { type: 'punctuation', regex: /^[{}()\[\],.;]+/ },
    { type: 'identifier', regex: /^[a-zA-Z_$][a-zA-Z0-9_$]*/ },
    { type: 'whitespace', regex: /^\s+/ },
    { type: 'text', regex: /^./ }
  ];

  let remaining = code;
  while (remaining.length > 0) {
    let matched = false;
    for (const rule of rules) {
      const match = remaining.match(rule.regex);
      if (match) {
        tokens.push({ type: rule.type, text: match[0] });
        remaining = remaining.substring(match[0].length);
        matched = true;
        break;
      }
    }
    if (!matched) {
      tokens.push({ type: 'text', text: remaining.charAt(0) });
      remaining = remaining.substring(1);
    }
  }

  return tokens.map((token, idx) => {
    let color = 'var(--text-primary)';
    let fontWeight = 'normal';
    if (token.type === 'comment') {
      color = '#6a9955';
    } else if (token.type === 'string') {
      color = '#ce9178';
    } else if (token.type === 'keyword') {
      color = '#c586c0';
      fontWeight = 'bold';
    } else if (token.type === 'builtin') {
      color = '#4fc1ff';
    } else if (token.type === 'number') {
      color = '#b5cea8';
    } else if (token.type === 'operator') {
      color = '#d4d4d4';
    } else if (token.type === 'punctuation') {
      color = '#ffd700';
    } else if (token.type === 'identifier') {
      color = '#9cdcfe';
    }
    return (
      <span key={idx} style={{ color, fontWeight }}>
        {token.text}
      </span>
    );
  });
}

// Custom Markdown Code Block component with highlighting and copy capability
function MarkdownCodeBlock({ className, children, ...props }) {
  const match = /language-(\w+)/.exec(className || '');
  const isInline = !className;
  
  if (isInline) {
    return (
      <code 
        style={{ 
          backgroundColor: 'rgba(255,255,255,0.05)', 
          padding: '2px 6px', 
          borderRadius: '4px', 
          fontFamily: 'monospace',
          fontSize: '0.85em',
          color: 'var(--neon-blue)'
        }} 
        {...props}
      >
        {children}
      </code>
    );
  }

  const codeText = String(children).replace(/\n$/, '');
  const language = match ? match[1] : '';
  const [copied, setCopied] = useState(false);

  return (
    <div style={{ position: 'relative', margin: '16px 0' }}>
      <button 
        className="cyber-button"
        onClick={() => {
          navigator.clipboard.writeText(codeText);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
        style={{
          position: 'absolute',
          top: '8px',
          right: '8px',
          padding: '4px 10px',
          fontSize: '0.68rem',
          zIndex: 5,
          minHeight: 'auto'
        }}
      >
        {copied ? 'COPIED! ✓' : 'COPY'}
      </button>
      <pre style={{ 
        padding: '16px', 
        backgroundColor: '#07080e', 
        border: '1px solid var(--border-color)', 
        borderRadius: '8px', 
        overflowX: 'auto', 
        fontSize: '0.78rem', 
        fontFamily: 'monospace', 
        tabSize: 2,
        userSelect: 'text',
        WebkitUserSelect: 'text',
        MozUserSelect: 'text',
        msUserSelect: 'text',
        lineHeight: '1.5',
        textAlign: 'left'
      }}>
        <code>
          {language === 'javascript' || language === 'js'
            ? highlightJsCode(codeText)
            : codeText
          }
        </code>
      </pre>
    </div>
  );
}

// Custom Cyberpunk Styled Checkbox Component
function CustomCheckbox({ checked, onChange, label, disabled = false }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1, userSelect: 'none' }}>
      <input 
        type="checkbox" 
        checked={checked} 
        disabled={disabled}
        onChange={onChange} 
        style={{ display: 'none' }} 
      />
      <div style={{
        width: '20px',
        height: '20px',
        border: checked ? '2px solid var(--neon-blue)' : '2px solid rgba(255, 255, 255, 0.2)',
        borderRadius: '4px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: checked ? 'rgba(0, 240, 255, 0.15)' : 'rgba(0, 0, 0, 0.4)',
        boxShadow: checked ? '0 0 8px rgba(0, 240, 255, 0.4)' : 'none',
        transition: 'all 0.2s ease',
        flexShrink: 0
      }}>
        {checked && (
          <div style={{
            width: '10px',
            height: '10px',
            backgroundColor: 'var(--neon-blue)',
            borderRadius: '2px',
            boxShadow: '0 0 6px var(--neon-blue)'
          }} />
        )}
      </div>
      <span style={{ fontSize: '0.88rem', color: checked ? 'var(--text-primary)' : 'var(--text-secondary)', transition: 'color 0.2s' }}>
        {label}
      </span>
    </label>
  );
}

// Custom Cyberpunk Styled Dropdown Component
function CustomSelect({ value, onChange, options, colorTheme = 'blue' }) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  const activeThemeColor = colorTheme === 'red' ? 'var(--neon-red)' : 'var(--neon-blue)';
  const activeBgColor = colorTheme === 'red' ? 'rgba(255, 42, 133, 0.12)' : 'rgba(0, 240, 255, 0.12)';

  const selectedOption = options.find(o => o.id === value) || options[0];

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={dropdownRef} style={{ position: 'relative', width: '100%', zIndex: isOpen ? 100 : 1 }}>
      {/* Toggle bar */}
      <div 
        onClick={() => setIsOpen(!isOpen)}
        style={{
          width: '100%',
          padding: '10px 14px',
          background: 'rgba(5, 5, 10, 0.85)',
          border: `1px solid ${activeThemeColor}`,
          color: '#fff',
          borderRadius: '6px',
          fontWeight: 'bold',
          fontSize: '0.85rem',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxShadow: isOpen ? `0 0 10px ${activeThemeColor}40` : 'none',
          transition: 'all 0.2s ease',
          userSelect: 'none'
        }}
      >
        <span>{selectedOption ? selectedOption.name : 'Select Bot...'}</span>
        <ChevronDown 
          size={16} 
          style={{ 
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', 
            transition: 'transform 0.2s ease',
            color: activeThemeColor
          }} 
        />
      </div>

      {/* Options list */}
      {isOpen && (
        <div 
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            width: '100%',
            background: 'rgba(10, 10, 15, 0.98)',
            border: `1px solid ${activeThemeColor}`,
            borderRadius: '6px',
            boxShadow: `0 4px 20px rgba(0, 0, 0, 0.8), 0 0 15px ${activeThemeColor}20`,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            padding: '4px 0'
          }}
        >
          {options.map(opt => {
            const isSelected = opt.id === value;
            return (
              <div
                key={opt.id}
                onClick={() => {
                  onChange(opt.id);
                  setIsOpen(false);
                }}
                style={{
                  padding: '10px 14px',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                  color: isSelected ? activeThemeColor : 'var(--text-primary)',
                  backgroundColor: isSelected ? activeBgColor : 'transparent',
                  fontWeight: isSelected ? 'bold' : 'normal',
                  transition: 'all 0.15s ease',
                  textAlign: 'left'
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) {
                    e.target.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) {
                    e.target.style.backgroundColor = 'transparent';
                  }
                }}
              >
                {opt.name}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function DevsCorner({ onBack, onStartSpectate, customBoards = [], onImportBoard, subMode = 'bot', onSubModeChange, activeTab = 'contract', onTabChange }) {
  const [customBots, setCustomBots] = useState({ a: null, b: null });
  const [uploadStatus, setUploadStatus] = useState({ a: 'idle', b: 'idle' });
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  
  // Headless Tournament States
  const [selectedBots, setSelectedBots] = useState({
    easy: true,
    medium: true,
    hard: true,
    ga: true,
    customA: false,
    customB: false
  });
  const [gameCount, setGameCount] = useState(10);
  const [isSimulating, setIsSimulating] = useState(false);
  const [simProgress, setSimProgress] = useState(0);
  const [consoleLogs, setConsoleLogs] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  
  // Spectating Config
  const [specRed, setSpecRed] = useState('easy');
  const [specBlue, setSpecBlue] = useState('hard');
  const [specBoard, setSpecBoard] = useState('default');
  const spectatorBoardInputRef = useRef(null);
  const [spectatorBoardError, setSpectatorBoardError] = useState(null);

  const validateSpectatorBoardJson = (data) => {
    if (!Array.isArray(data)) {
      throw new Error("Invalid format: Root of JSON must be an array of mirror objects.");
    }
    
    const testBoard = Array(8).fill(null).map(() => Array(8).fill(null));
    for (const m of data) {
      if (m.type === 'mirror' && Array.isArray(m.grid_pos) && m.grid_pos.length === 2) {
        const [r, c] = m.grid_pos;
        if (r < 0 || r >= 8 || c < 0 || c >= 8) {
          throw new Error(`Mirror position (${r}, ${c}) is out of bounds.`);
        }
        const isCorner = (r === 0 || r === 7) && (c === 0 || c === 7);
        if (isCorner) {
          throw new Error("Mirrors cannot be placed in the laser starting coordinates (corner cells).");
        }
        testBoard[r][c] = { type: 'mirror', orientation: m.angle === 90 ? '\\' : '/' };
      }
    }

    const corners = [
      { cr: 0, cc: 0, a1: [0, 1], a2: [1, 0] },
      { cr: 0, cc: 7, a1: [0, 6], a2: [1, 7] },
      { cr: 7, cc: 0, a1: [7, 1], a2: [6, 0] },
      { cr: 7, cc: 7, a1: [7, 6], a2: [6, 7] }
    ];

    for (const c of corners) {
      const cell1 = testBoard[c.a1[0]][c.a1[1]];
      const cell2 = testBoard[c.a2[0]][c.a2[1]];
      if (cell1 && cell2) {
        throw new Error(`Corner (${c.cr}, ${c.cc}) cannot be locked in by mirrors on both exit paths (${c.a1[0]}, ${c.a1[1]}) and (${c.a2[0]}, ${c.a2[1]}).`);
      }
    }
    return true;
  };

  const handleImportSpectatorBoardJson = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSpectatorBoardError(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target.result);
        validateSpectatorBoardJson(data);

        const cleanName = file.name.replace('.json', '').replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
        onImportBoard(cleanName, data);
        setSpecBoard(cleanName);
      } catch (err) {
        setSpectatorBoardError(`Import failed: ${err.message}`);
      }
    };
    reader.readAsText(file);
  };

  const getSelectableBoards = () => {
    const list = [
      { id: 'default', name: 'Default Board' }
    ];
    customBoards.forEach(b => {
      list.push({ id: b.name, name: b.name.replace(/_/g, ' ').toUpperCase() });
    });
    list.push({ id: 'import', name: 'IMPORT CUSTOM BOARD...' });
    return list;
  };

  const handleSelectRandomBoard = () => {
    const boards = getSelectableBoards();
    if (boards.length === 0) return;
    const randomBoard = boards[Math.floor(Math.random() * boards.length)];
    setSpecBoard(randomBoard.id);
  };

  const consoleEndRef = useRef(null);
  const simCancelRef = useRef(false);

  // Board Editor states
  const [editorBoard, setEditorBoard] = useState(() => Array(8).fill(null).map(() => Array(8).fill(null)));
  const [editorBoardName, setEditorBoardName] = useState('my_custom_board');
  const [editorError, setEditorError] = useState(null);
  const [editorSuccess, setEditorSuccess] = useState(null);

  // Laser Simulator states
  const [simLaserActive, setSimLaserActive] = useState(false);
  const [simLaserR, setSimLaserR] = useState(0);
  const [simLaserC, setSimLaserC] = useState(0);
  const [simLaserDir, setSimLaserDir] = useState(180); // 0 (UP), 90 (RIGHT), 180 (DOWN), 270 (LEFT)

  const checkAdjacencyBlocking = (board) => {
    const corners = [
      { cr: 0, cc: 0, a1: [0, 1], a2: [1, 0] },
      { cr: 0, cc: 7, a1: [0, 6], a2: [1, 7] },
      { cr: 7, cc: 0, a1: [7, 1], a2: [6, 0] },
      { cr: 7, cc: 7, a1: [7, 6], a2: [6, 7] }
    ];

    for (const c of corners) {
      const cell1 = board[c.a1[0]][c.a1[1]];
      const cell2 = board[c.a2[0]][c.a2[1]];
      if (cell1 && cell2) {
        return `Corner (${c.cr}, ${c.cc}) cannot be locked in by mirrors on both exit paths (${c.a1[0]}, ${c.a1[1]}) and (${c.a2[0]}, ${c.a2[1]}).`;
      }
    }
    return null;
  };

  const handleCellClick = (r, c) => {
    const isCorner = (r === 0 || r === 7) && (c === 0 || c === 7);
    if (isCorner) {
      setEditorError("Mirrors cannot be placed in the laser starting coordinates (corner cells).");
      return;
    }

    let blockError = null;

    setEditorBoard(prev => {
      const next = prev.map(row => row.slice());
      const cell = next[r][c];
      if (!cell) {
        next[r][c] = { type: 'mirror', orientation: '/' };
      } else if (cell.orientation === '/') {
        next[r][c] = { type: 'mirror', orientation: '\\' };
      } else {
        next[r][c] = null;
      }

      blockError = checkAdjacencyBlocking(next);
      if (blockError) {
        return prev; // Revert change!
      }
      return next;
    });

    if (blockError) {
      setEditorError(blockError);
      setEditorSuccess(null);
    } else {
      setEditorError(null);
      setEditorSuccess(null);
    }
  };

  const tracePath = simLaserActive 
    ? traceLaserBeam(editorBoard, { r: simLaserR, c: simLaserC }, simLaserDir).path 
    : [];

  const renderLaserBeam = (r, c) => {
    if (!simLaserActive) return null;
    
    // Check if cell is the starting position
    if (r === simLaserR && c === simLaserC) {
      const elements = [];
      // Draw exit half-beam
      if (simLaserDir === 0) {
        elements.push(<div key="start-beam" style={{ position: 'absolute', bottom: '50%', top: 0, left: '50%', width: '4px', background: '#ff2a85', boxShadow: '0 0 8px #ff2a85, 0 0 15px #ff2a85', transform: 'translateX(-50%)', pointerEvents: 'none', zIndex: 10 }} />);
      } else if (simLaserDir === 90) {
        elements.push(<div key="start-beam" style={{ position: 'absolute', left: '50%', right: 0, top: '50%', height: '4px', background: '#ff2a85', boxShadow: '0 0 8px #ff2a85, 0 0 15px #ff2a85', transform: 'translateY(-50%)', pointerEvents: 'none', zIndex: 10 }} />);
      } else if (simLaserDir === 180) {
        elements.push(<div key="start-beam" style={{ position: 'absolute', top: '50%', bottom: 0, left: '50%', width: '4px', background: '#ff2a85', boxShadow: '0 0 8px #ff2a85, 0 0 15px #ff2a85', transform: 'translateX(-50%)', pointerEvents: 'none', zIndex: 10 }} />);
      } else if (simLaserDir === 270) {
        elements.push(<div key="start-beam" style={{ position: 'absolute', right: '50%', left: 0, top: '50%', height: '4px', background: '#ff2a85', boxShadow: '0 0 8px #ff2a85, 0 0 15px #ff2a85', transform: 'translateY(-50%)', pointerEvents: 'none', zIndex: 10 }} />);
      }
      // Glowing laser center dot
      elements.push(
        <div key="start-source" style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          width: '12px',
          height: '12px',
          borderRadius: '50%',
          background: '#fff',
          border: '2px solid #ff2a85',
          boxShadow: '0 0 8px #ff2a85, 0 0 15px #ff2a85',
          transform: 'translate(-50%, -50%)',
          pointerEvents: 'none',
          zIndex: 11
        }} />
      );
      return elements;
    }

    const pathIndex = tracePath.findIndex(p => p.r === r && p.c === c);
    if (pathIndex === -1) return null;

    const step = tracePath[pathIndex];
    const prev = pathIndex > 0 ? tracePath[pathIndex - 1] : { r: simLaserR, c: simLaserC };
    const next = pathIndex < tracePath.length - 1 ? tracePath[pathIndex + 1] : null;

    // Direction vectors
    const fromDirR = r - prev.r;
    const fromDirC = c - prev.c;
    const toDirR = next ? next.r - r : fromDirR;
    const toDirC = next ? next.c - c : fromDirC;

    const isBounce = step.type === 'mirror-bounce';

    if (!isBounce) {
      if (fromDirR !== 0) {
        // Vertical line
        return (
          <div style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: '50%',
            width: '4px',
            background: '#ff2a85',
            boxShadow: '0 0 8px #ff2a85, 0 0 15px #ff2a85',
            transform: 'translateX(-50%)',
            pointerEvents: 'none',
            zIndex: 10
          }} />
        );
      } else {
        // Horizontal line
        return (
          <div style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: '50%',
            height: '4px',
            background: '#ff2a85',
            boxShadow: '0 0 8px #ff2a85, 0 0 15px #ff2a85',
            transform: 'translateY(-50%)',
            pointerEvents: 'none',
            zIndex: 10
          }} />
        );
      }
    } else {
      const elements = [];
      
      // Entry segment
      if (fromDirR < 0) { // entered from bottom
        elements.push(<div key="in" style={{ position: 'absolute', bottom: '50%', top: 0, left: '50%', width: '4px', background: '#ff2a85', boxShadow: '0 0 8px #ff2a85', transform: 'translateX(-50%)', pointerEvents: 'none', zIndex: 10 }} />);
      } else if (fromDirR > 0) { // entered from top
        elements.push(<div key="in" style={{ position: 'absolute', top: '50%', bottom: 0, left: '50%', width: '4px', background: '#ff2a85', boxShadow: '0 0 8px #ff2a85', transform: 'translateX(-50%)', pointerEvents: 'none', zIndex: 10 }} />);
      } else if (fromDirC < 0) { // entered from right
        elements.push(<div key="in" style={{ position: 'absolute', right: '50%', left: 0, top: '50%', height: '4px', background: '#ff2a85', boxShadow: '0 0 8px #ff2a85', transform: 'translateY(-50%)', pointerEvents: 'none', zIndex: 10 }} />);
      } else if (fromDirC > 0) { // entered from left
        elements.push(<div key="in" style={{ position: 'absolute', left: '50%', right: 0, top: '50%', height: '4px', background: '#ff2a85', boxShadow: '0 0 8px #ff2a85', transform: 'translateY(-50%)', pointerEvents: 'none', zIndex: 10 }} />);
      }

      // Exit segment
      if (toDirR < 0) { // exited towards top
        elements.push(<div key="out" style={{ position: 'absolute', bottom: '50%', top: 0, left: '50%', width: '4px', background: '#ff2a85', boxShadow: '0 0 8px #ff2a85', transform: 'translateX(-50%)', pointerEvents: 'none', zIndex: 10 }} />);
      } else if (toDirR > 0) { // exited towards bottom
        elements.push(<div key="out" style={{ position: 'absolute', top: '50%', bottom: 0, left: '50%', width: '4px', background: '#ff2a85', boxShadow: '0 0 8px #ff2a85', transform: 'translateX(-50%)', pointerEvents: 'none', zIndex: 10 }} />);
      } else if (toDirC < 0) { // exited towards left
        elements.push(<div key="out" style={{ position: 'absolute', right: '50%', left: 0, top: '50%', height: '4px', background: '#ff2a85', boxShadow: '0 0 8px #ff2a85', transform: 'translateY(-50%)', pointerEvents: 'none', zIndex: 10 }} />);
      } else if (toDirC > 0) { // exited towards right
        elements.push(<div key="out" style={{ position: 'absolute', left: '50%', right: 0, top: '50%', height: '4px', background: '#ff2a85', boxShadow: '0 0 8px #ff2a85', transform: 'translateY(-50%)', pointerEvents: 'none', zIndex: 10 }} />);
      }

      // Bounce node center dot
      elements.push(
        <div key="center" style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          background: '#fff',
          border: '2px solid #ff2a85',
          boxShadow: '0 0 8px #ff2a85, 0 0 15px #ff2a85',
          transform: 'translate(-50%, -50%)',
          pointerEvents: 'none',
          zIndex: 11
        }} />
      );

      return elements;
    }
  };

  const handleClearEditorBoard = () => {
    setEditorBoard(Array(8).fill(null).map(() => Array(8).fill(null)));
    setEditorError(null);
    setEditorSuccess("Grid cleared.");
  };

  const handleLoadDefaultMirrors = () => {
    const nextBoard = Array(8).fill(null).map(() => Array(8).fill(null));
    const FIXED_MIRRORS = [
      { r: 1, c: 2, orientation: '/' },
      { r: 1, c: 5, orientation: '\\' },
      { r: 3, c: 3, orientation: '\\' },
      { r: 3, c: 4, orientation: '/' },
      { r: 4, c: 3, orientation: '/' },
      { r: 4, c: 4, orientation: '\\' },
      { r: 6, c: 2, orientation: '\\' },
      { r: 6, c: 5, orientation: '/' }
    ];
    for (const m of FIXED_MIRRORS) {
      nextBoard[m.r][m.c] = { type: 'mirror', orientation: m.orientation };
    }
    setEditorBoard(nextBoard);
    setEditorBoardName('default_modified');
    setEditorError(null);
    setEditorSuccess("Loaded default fixed mirror configuration.");
  };

  const handleExportJsonFile = () => {
    const list = [];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const cell = editorBoard[r][c];
        if (cell && cell.type === 'mirror') {
          list.push({
            type: 'mirror',
            grid_pos: [r, c],
            angle: cell.orientation === '\\' ? 90 : 0
          });
        }
      }
    }
    
    const formattedName = editorBoardName.trim().replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
    if (!formattedName) {
      setEditorError("Please enter a valid board name.");
      return;
    }

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(list, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `${formattedName}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();

    setEditorSuccess(`Successfully exported ${formattedName}.json!`);
  };

  const handleImportJsonFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setEditorError(null);
    setEditorSuccess(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target.result);
        if (!Array.isArray(data)) {
          throw new Error("JSON file must be an array of objects representing mirrors.");
        }
        
        const nextBoard = Array(8).fill(null).map(() => Array(8).fill(null));
        for (const m of data) {
          if (m.type === 'mirror' && Array.isArray(m.grid_pos) && m.grid_pos.length === 2) {
            const r = m.grid_pos[0];
            const c = m.grid_pos[1];
            if (r >= 0 && r < 8 && c >= 0 && c < 8) {
              const isCorner = (r === 0 || r === 7) && (c === 0 || c === 7);
              if (isCorner) continue; // Skip corner positions (where lasers live)
              const orientation = m.angle === 90 ? '\\' : '/';
              nextBoard[r][c] = { type: 'mirror', orientation };
            }
          }
        }

        const blockError = checkAdjacencyBlocking(nextBoard);
        if (blockError) {
          throw new Error(blockError);
        }

        setEditorBoard(nextBoard);
        setEditorBoardName(file.name.replace('.json', '').replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase());
        setEditorSuccess(`Loaded board: ${file.name}`);
      } catch (err) {
        setEditorError(`Import failed: ${err.message}`);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  useEffect(() => {
    if (consoleEndRef.current) {
      consoleEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [consoleLogs]);

  // Update selection availability based on custom bots upload
  useEffect(() => {
    setSelectedBots(prev => ({
      ...prev,
      customA: customBots.a ? prev.customA : false,
      customB: customBots.b ? prev.customB : false
    }));
  }, [customBots]);

  // Expose custom bots to spectating dropdowns
  useEffect(() => {
    if (customBots.a && specRed === 'easy') setSpecRed(customBots.a.id);
    if (customBots.b && specBlue === 'hard') setSpecBlue(customBots.b.id);
  }, [customBots]);

  const handleBotUpload = async (e, slot) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setUploadStatus(prev => ({ ...prev, [slot]: 'parsing' }));

    try {
      const content = await file.text();

      // Expose LazerAI globally so the uploaded bot can resolve imports
      window.LazerAI = {
        BLOCK_TYPES,
        getBoardState,
        getPossibleActions,
        applyLightweightAction,
        traceLaserBeam,
        validatePlacement,
        validateMovement,
        generateThreatMap,
        getPieceThreatLevels,
        computeSafetySteps,
        bfsToNearestFiringCell,
        getReverseFiringCells
      };

      // Create a Blob from the Javascript code
      const blob = new Blob([content], { type: 'application/javascript' });
      const objectUrl = URL.createObjectURL(blob);

      // Dynamically import the module
      const module = await import(/* @vite-ignore */ objectUrl);

      const missing = [];
      if (typeof module.getPlayAction !== 'function') missing.push('getPlayAction(board, role, actionPoints, gameState, botPlayer)');
      if (typeof module.getSetupAction !== 'function') missing.push('getSetupAction(board, phase, playerColor, challengedPiece)');
      if (typeof module.getChallengeAction !== 'function') missing.push('getChallengeAction(board, gameState, playerColor)');

      if (missing.length > 0) {
        throw new Error(`Missing required exports: ${missing.join(', ')}`);
      }

      const botName = file.name.replace('.js', '').substring(0, 15);
      const strategyId = `custom_${slot}_${Date.now()}`;

      // Write into the strategies registry without fallback defaults
      CUSTOM_STRATEGIES[strategyId] = {
        getPlayAction: module.getPlayAction,
        getSetupAction: module.getSetupAction,
        getChallengeAction: module.getChallengeAction
      };

      setCustomBots(prev => ({
        ...prev,
        [slot]: { id: strategyId, name: botName, file }
      }));
      setUploadStatus(prev => ({ ...prev, [slot]: 'success' }));
    } catch (err) {
      console.error(err);
      setError(`Verification failed for Slot ${slot.toUpperCase()}: ${err.message}`);
      setUploadStatus(prev => ({ ...prev, [slot]: 'error' }));
    }
  };

  // Headless game simulation
  const simulateHeadlessGame = (bot1, bot2, gameIndex) => {
    const boards = customBoards.length > 0 ? customBoards.map(b => b.data) : [null];
    const boardData = boards[gameIndex % boards.length];
    
    let state = getInitialState(boardData);
    
    // Assign colors
    const color1 = Math.random() > 0.5 ? 'red' : 'blue';
    const color2 = color1 === 'red' ? 'blue' : 'red';
    
    const role1 = gameIndex % 2 === 0 ? 'attacker' : 'defender';
    
    state.roleRed = (role1 === 'attacker')
      ? (color1 === 'red' ? 'attacker' : 'defender')
      : (color1 === 'red' ? 'defender' : 'attacker');
    state.roleBlue = state.roleRed === 'attacker' ? 'defender' : 'attacker';
    
    const rollDie = () => Math.floor(Math.random() * 6) + 1;
    let turns = 0;
    const MAX_TURNS = 1000;
    
    const getBotPlay = (stratId, board, role, ap, s) => {
      if (stratId === 'easy') return EasyStrategy.getPlayAction(board, role, ap, s, 'easy');
      if (stratId === 'medium') return MediumStrategy.getPlayAction(board, role, ap, s, 'medium');
      if (stratId === 'hard') return HardStrategy.getPlayAction(board, role, ap, s, 'hard');
      if (stratId === 'ga') return GAStrategy.getPlayAction(board, role, ap, s, 'ga');
      if (CUSTOM_STRATEGIES[stratId]) return CUSTOM_STRATEGIES[stratId].getPlayAction(board, role, ap, s, stratId);
      return null;
    };
    
    const getBotSetup = (stratId, board, phase, color, chal) => {
      if (stratId === 'easy') return EasyStrategy.getSetupAction(board, phase, color, chal);
      if (stratId === 'medium') return MediumStrategy.getSetupAction(board, phase, color, chal);
      if (stratId === 'hard') return HardStrategy.getSetupAction(board, phase, color, chal);
      if (stratId === 'ga') return GAStrategy.getSetupAction(board, phase, color, chal);
      if (CUSTOM_STRATEGIES[stratId]) return CUSTOM_STRATEGIES[stratId].getSetupAction(board, phase, color, chal);
      return null;
    };

    const getBotChallenge = (stratId, board, s, color) => {
      if (stratId === 'easy') return EasyStrategy.getChallengeAction ? EasyStrategy.getChallengeAction(board, s, color) : null;
      if (stratId === 'medium') return MediumStrategy.getChallengeAction ? MediumStrategy.getChallengeAction(board, s, color) : null;
      if (stratId === 'hard') return HardStrategy.getChallengeAction ? HardStrategy.getChallengeAction(board, s, color) : null;
      if (stratId === 'ga') return GAStrategy.getChallengeAction ? GAStrategy.getChallengeAction(board, s, color) : null;
      if (CUSTOM_STRATEGIES[stratId]) return CUSTOM_STRATEGIES[stratId].getChallengeAction ? CUSTOM_STRATEGIES[stratId].getChallengeAction(board, s, color) : null;
      return null;
    };

    while (!state.winner && turns < MAX_TURNS) {
      turns++;
      
      if (state.phase === 'toss') {
        state = applySandboxAction(state.board, { type: 'toss-roll', value: rollDie() }, 'red', state);
        state = applySandboxAction(state.board, { type: 'toss-roll', value: rollDie() }, 'blue', state);
        if (state.phase === 'toss') continue;
      }
      if (state.phase === 'toss-result') {
        state = applySandboxAction(state.board, { type: 'toss-resolve' }, 'SYSTEM', state);
        continue;
      }
      if (state.phase === 'role-selection') {
        const tossWinnerColor = state.tossWinner.toLowerCase();
        const tossWinnerTargetRole = tossWinnerColor === color1 ? role1 : (role1 === 'attacker' ? 'defender' : 'attacker');
        state = applySandboxAction(state.board, { type: 'toss-select-role', role: tossWinnerTargetRole }, tossWinnerColor, state);
        continue;
      }
      if (state.phase === 'challenge-toss') {
        state = applySandboxAction(state.board, { type: 'challenge-start-roll' }, 'red', state);
        state = applySandboxAction(state.board, { type: 'challenge-start-roll' }, 'blue', state);
        state = applySandboxAction(state.board, { type: 'challenge-roll', value: rollDie() }, 'red', state);
        state = applySandboxAction(state.board, { type: 'challenge-roll', value: rollDie() }, 'blue', state);
        continue;
      }
      if (state.phase === 'challenge-toss-result') {
        state = applySandboxAction(state.board, { type: 'challenge-toss-resolve' }, 'system', state);
        continue;
      }
      
      const activeRole = state.phase === 'setup-defender' || state.phase === 'challenge-setup' ? 'defender' :
                         state.phase === 'setup-attacker' ? 'attacker' : state.turnPlayer;
      const activeColor = state.roleRed === activeRole ? 'red' : 'blue';
      const activeStrategy = activeColor === color1 ? bot1.id : bot2.id;
      
      if (state.phase === 'setup-defender' || state.phase === 'challenge-setup' || state.phase === 'setup-attacker') {
        let action = getBotSetup(activeStrategy, state.board, state.phase, activeColor, state.challengedPiece);
        if (action) {
          state = applySandboxAction(state.board, action, activeColor.toLowerCase(), state);
        } else {
          state = applySandboxAction(state.board, { type: 'confirm-setup' }, activeColor.toLowerCase(), state);
        }
        continue;
      }
      
      if (state.phase === 'playing') {
        if (!state.hasRolledDice) {
          state = applySandboxAction(state.board, { type: 'end-roll', values: [rollDie(), rollDie()] }, activeColor.toLowerCase(), state);
          continue;
        }
        let action = null;
        if (state.actionPoints > 0) {
          action = getBotPlay(activeStrategy, state.board, activeRole, state.actionPoints, state);
        }
        if (action) {
          state = applySandboxAction(state.board, action, activeColor.toLowerCase(), state);
        } else {
          state = applySandboxAction(state.board, { type: 'end-turn' }, activeColor.toLowerCase(), state);
        }
        continue;
      }
      
      if (state.phase === 'challenge-declaration') {
        const action = getBotChallenge(activeStrategy, state.board, state, activeColor);
        if (action) {
          state = applySandboxAction(state.board, action, activeColor.toLowerCase(), state);
        } else {
          state = applySandboxAction(state.board, { type: 'declare-challenge', declare: false }, activeColor.toLowerCase(), state);
        }
        continue;
      }
    }
    
    if (!state.winner && turns >= MAX_TURNS) {
      const redScore = state.scores?.red || 0;
      const blueScore = state.scores?.blue || 0;
      if (redScore > blueScore) state.winner = 'red';
      else if (blueScore > redScore) state.winner = 'blue';
      else state.winner = 'draw';
    }
    
    const win1 = state.winner === color1;
    const win2 = state.winner === color2;
    const isDraw = state.winner === 'draw' || (!win1 && !win2);
    const score1 = state.scores?.[color1] || 0;
    const score2 = state.scores?.[color2] || 0;
    
    return { win1, win2, isDraw, score1, score2, turns };
  };

  const startHeadlessTournament = () => {
    // Collect checked bots
    const botsToRun = [];
    if (selectedBots.easy) botsToRun.push({ id: 'easy', name: 'Zlorooklp (Easy)' });
    if (selectedBots.medium) botsToRun.push({ id: 'medium', name: 'Lizbishmir (Medium)' });
    if (selectedBots.hard) botsToRun.push({ id: 'hard', name: 'Shahlzrmir (Hard)' });
    if (selectedBots.ga) botsToRun.push({ id: 'ga', name: 'GA-Bot (Tuned)' });
    if (selectedBots.customA && customBots.a) botsToRun.push({ id: customBots.a.id, name: `${customBots.a.name} (Custom A)` });
    if (selectedBots.customB && customBots.b) botsToRun.push({ id: customBots.b.id, name: `${customBots.b.name} (Custom B)` });

    if (botsToRun.length < 2) {
      setError('Select at least 2 bots to hold a tournament.');
      return;
    }

    setError(null);
    setIsSimulating(true);
    setSimProgress(0);
    setConsoleLogs([`🚀 INITIATING HEADLESS CHALLENGE TOURNAMENT: ${botsToRun.length} BOTS...`]);
    setLeaderboard([]);
    simCancelRef.current = false;

    // Create match pairs (round-robin)
    const matches = [];
    for (let i = 0; i < botsToRun.length; i++) {
      for (let j = i + 1; j < botsToRun.length; j++) {
        matches.push({ bot1: botsToRun[i], bot2: botsToRun[j] });
      }
    }

    // Init statistics
    const stats = {};
    for (const b of botsToRun) {
      stats[b.id] = { id: b.id, name: b.name, matchesPlayed: 0, wins: 0, losses: 0, draws: 0, totalScore: 0, totalTurns: 0 };
    }

    const queue = [];
    for (const match of matches) {
      for (let g = 0; g < gameCount; g++) {
        queue.push({ match, gameIndex: g });
      }
    }

    let completed = 0;

    const runBatch = () => {
      if (simCancelRef.current) {
        setConsoleLogs(prev => [...prev, '⚠️ Simulation canceled by user.']);
        setIsSimulating(false);
        return;
      }

      if (completed >= queue.length) {
        // Tournament Finished - Generate Leaderboard
        const result = Object.values(stats).map(b => {
          const winRate = ((b.wins / b.matchesPlayed) * 100).toFixed(1);
          const avgScore = (b.totalScore / b.matchesPlayed).toFixed(1);
          const avgTurns = (b.totalTurns / b.matchesPlayed).toFixed(1);
          return {
            id: b.id,
            name: b.name,
            wins: b.wins,
            losses: b.losses,
            draws: b.draws,
            winRate: `${winRate}%`,
            avgScore,
            avgTurns
          };
        }).sort((a, b) => b.wins - a.wins);

        setLeaderboard(result);
        setConsoleLogs(prev => [...prev, '🎉 Headless tournament complete! Check the leaderboard below.']);
        setIsSimulating(false);
        return;
      }

      const task = queue[completed];
      const { bot1, bot2 } = task.match;
      
      const res = simulateHeadlessGame(bot1, bot2, task.gameIndex);

      // Update statistics
      stats[bot1.id].matchesPlayed++;
      stats[bot2.id].matchesPlayed++;
      stats[bot1.id].totalScore += res.score1;
      stats[bot2.id].totalScore += res.score2;
      stats[bot1.id].totalTurns += res.turns;
      stats[bot2.id].totalTurns += res.turns;

      let logMsg = '';
      if (res.win1) {
        stats[bot1.id].wins++;
        stats[bot2.id].losses++;
        logMsg = `[Game ${task.gameIndex + 1}/${gameCount}] ${bot1.name} wins vs ${bot2.name} (Attacker: ${task.gameIndex % 2 === 0 ? bot1.name : bot2.name}, ${res.turns} turns, ${res.score1} vs ${res.score2} pts)`;
      } else if (res.win2) {
        stats[bot2.id].wins++;
        stats[bot1.id].losses++;
        logMsg = `[Game ${task.gameIndex + 1}/${gameCount}] ${bot2.name} wins vs ${bot1.name} (Attacker: ${task.gameIndex % 2 === 0 ? bot1.name : bot2.name}, ${res.turns} turns, ${res.score2} vs ${res.score1} pts)`;
      } else {
        stats[bot1.id].draws++;
        stats[bot2.id].draws++;
        logMsg = `[Game ${task.gameIndex + 1}/${gameCount}] DRAW: ${bot1.name} vs ${bot2.name} (${res.turns} turns, ${res.score1} vs ${res.score2} pts)`;
      }

      setConsoleLogs(prev => [...prev, logMsg]);
      completed++;
      setSimProgress(Math.round((completed / queue.length) * 100));

      setTimeout(runBatch, 5); // 5ms delay to let React paint
    };

    runBatch();
  };

  const getSelectableBots = () => {
    const list = [
      { id: 'easy', name: 'Zlorooklp (Easy)' },
      { id: 'medium', name: 'Lizbishmir (Medium)' },
      { id: 'hard', name: 'Shahlzrmir (Hard)' },
      { id: 'ga', name: 'GA-Bot (Tuned)' }
    ];
    if (customBots.a) list.push({ id: customBots.a.id, name: `${customBots.a.name} (Custom A)` });
    if (customBots.b) list.push({ id: customBots.b.id, name: `${customBots.b.name} (Custom B)` });
    return list;
  };

  return (
    <div className="lobby-container" style={{ alignItems: 'flex-start', padding: '40px 20px', minHeight: '100vh', overflowY: 'auto' }}>
      <div className="glass-panel" style={{ width: '100%', maxWidth: '850px', margin: '0 auto', padding: '40px 30px', position: 'relative' }}>
        
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
          <button className="cyber-button" onClick={onBack} style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <ChevronLeft size={16} /> BACK TO CREDITS
          </button>
          <div style={{ textAlign: 'right' }}>
            <h1 className="lobby-title font-display" style={{ fontSize: '1.8rem', margin: 0 }}>DEV'S CORNER</h1>
            <p style={{ color: 'var(--neon-blue)', fontSize: '0.75rem', fontWeight: 'bold', margin: '2px 0 0 0', textTransform: 'uppercase', letterSpacing: '1px' }}>AI Bot Arena & Sandbox</p>
          </div>
        </div>

        {/* Sub-mode Choice Selection */}
        <div style={{ display: 'flex', gap: '16px', marginBottom: '24px' }}>
          <button 
            className={`cyber-button ${subMode === 'bot' ? 'blue' : ''}`}
            onClick={() => onSubModeChange('bot')}
            style={{ flex: 1, padding: '12px 20px', fontSize: '0.95rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
          >
            <Cpu size={18} /> BOT DEVELOPER HUB
          </button>
          <button 
            className={`cyber-button ${subMode === 'editor' ? 'blue' : ''}`}
            onClick={() => onSubModeChange('editor')}
            style={{ flex: 1, padding: '12px 20px', fontSize: '0.95rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
          >
            <Grid size={18} /> BOARD EDITOR
          </button>
        </div>

        {/* Tab Navigation (only visible in Bot Dev mode) */}
        {subMode === 'bot' && (
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', marginBottom: '24px', gap: '8px', flexWrap: 'wrap' }}>
            <button 
              className={`cyber-button ${activeTab === 'contract' ? 'blue' : ''}`}
              onClick={() => onTabChange('contract')}
              style={{ borderBottom: activeTab === 'contract' ? '1px solid var(--neon-blue)' : 'none', borderRadius: '8px 8px 0 0', padding: '10px 16px', flex: 1, minWidth: '120px' }}
            >
              <HelpCircle size={16} style={{ marginRight: '6px', display: 'inline' }} /> Bot Contract
            </button>
            <button 
              className={`cyber-button ${activeTab === 'guide' ? 'blue' : ''}`}
              onClick={() => onTabChange('guide')}
              style={{ borderBottom: activeTab === 'guide' ? '1px solid var(--neon-blue)' : 'none', borderRadius: '8px 8px 0 0', padding: '10px 16px', flex: 1, minWidth: '120px' }}
            >
              <BookOpen size={16} style={{ marginRight: '6px', display: 'inline' }} /> Dev Guide
            </button>
            <button 
              className={`cyber-button ${activeTab === 'simulator' ? 'blue' : ''}`}
              onClick={() => onTabChange('simulator')}
              style={{ borderBottom: activeTab === 'simulator' ? '1px solid var(--neon-blue)' : 'none', borderRadius: '8px 8px 0 0', padding: '10px 16px', flex: 1, minWidth: '120px' }}
            >
              <Terminal size={16} style={{ marginRight: '6px', display: 'inline' }} /> Headless Tournament
            </button>
            <button 
              className={`cyber-button ${activeTab === 'spectate' ? 'blue' : ''}`}
              onClick={() => onTabChange('spectate')}
              style={{ borderBottom: activeTab === 'spectate' ? '1px solid var(--neon-blue)' : 'none', borderRadius: '8px 8px 0 0', padding: '10px 16px', flex: 1, minWidth: '120px' }}
            >
              <Play size={16} style={{ marginRight: '6px', display: 'inline' }} /> Visual Spectator
            </button>
          </div>
        )}

        {/* Global Error Banner */}
        {error && (
          <div style={{ padding: '12px 16px', background: 'rgba(255, 42, 133, 0.08)', border: '1px solid var(--neon-red)', borderRadius: '8px', color: 'var(--neon-red)', fontSize: '0.85rem', fontWeight: 'bold', display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '20px' }}>
            <AlertTriangle size={18} />
            <span>{error}</span>
          </div>
        )}

        {/* TAB 1: Bot Contract & Guide */}
        {subMode === 'bot' && activeTab === 'contract' && (
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: '1.6', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div className="glass-panel" style={{ padding: '20px', borderLeft: '3px solid var(--neon-blue)', background: 'rgba(0, 240, 255, 0.02)', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <h3 style={{ color: 'var(--text-primary)', marginBottom: '8px' }}>🤖 Dynamic Custom Bot Loading</h3>
                <p>
                  You can write your own bot strategies in JavaScript and upload them directly below! Custom bots run in a secure ES module context on the main thread and can access Lazer Showdown's physical evaluation and raycasting logic via a global helper namespace named <strong>LazerAI</strong>.
                </p>
              </div>
              <button 
                className="cyber-button"
                onClick={() => onTabChange('guide')}
                style={{ alignSelf: 'flex-start', padding: '10px 20px', fontSize: '0.85rem', borderColor: 'var(--neon-blue)', color: 'var(--neon-blue)', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}
              >
                <BookOpen size={16} /> READ FULL DEV GUIDE (BOTS.md)
              </button>
            </div>

            {/* Upload Slots */}
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
              {/* Slot A */}
              <div className="glass-panel" style={{ flex: 1, minWidth: '280px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <h4 style={{ color: 'var(--text-primary)', display: 'flex', justifyContent: 'space-between' }}>
                  <span>CUSTOM BOT (SLOT A)</span>
                  {uploadStatus.a === 'success' && <span style={{ color: '#39ff14', fontSize: '0.75rem', fontWeight: 'bold' }}>VERIFIED</span>}
                </h4>
                <div style={{ fontSize: '0.8rem', opacity: 0.8 }}>
                  {customBots.a ? `Loaded: ${customBots.a.name}` : 'No custom bot uploaded.'}
                </div>
                <label className="cyber-button blue" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: 'pointer', justifySelf: 'flex-start', padding: '8px 16px', fontSize: '0.8rem', width: 'fit-content' }}>
                  <Upload size={14} /> UPLOAD JS FILE
                  <input type="file" accept=".js" onChange={(e) => handleBotUpload(e, 'a')} style={{ display: 'none' }} />
                </label>
              </div>

              {/* Slot B */}
              <div className="glass-panel" style={{ flex: 1, minWidth: '280px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <h4 style={{ color: 'var(--text-primary)', display: 'flex', justifyContent: 'space-between' }}>
                  <span>CUSTOM BOT (SLOT B)</span>
                  {uploadStatus.b === 'success' && <span style={{ color: '#39ff14', fontSize: '0.75rem', fontWeight: 'bold' }}>VERIFIED</span>}
                </h4>
                <div style={{ fontSize: '0.8rem', opacity: 0.8 }}>
                  {customBots.b ? `Loaded: ${customBots.b.name}` : 'No custom bot uploaded.'}
                </div>
                <label className="cyber-button blue" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: 'pointer', justifySelf: 'flex-start', padding: '8px 16px', fontSize: '0.8rem', width: 'fit-content' }}>
                  <Upload size={14} /> UPLOAD JS FILE
                  <input type="file" accept=".js" onChange={(e) => handleBotUpload(e, 'b')} style={{ display: 'none' }} />
                </label>
              </div>
            </div>

            <div className="glass-panel" style={{ padding: '20px' }}>
              <h3 style={{ color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                <Terminal size={18} /> API Skeleton & Contract Structure
              </h3>
              <p style={{ marginBottom: '12px' }}>
                Write your script as an ES module file and export the required functions. Access board parsing helpers, distance computations, and laser beam tracers directly from the global <code>LazerAI</code> object:
              </p>
              <div style={{ position: 'relative', marginTop: '12px' }}>
                <button 
                  className="cyber-button"
                  onClick={() => {
                    navigator.clipboard.writeText(SAMPLE_BOT_CODE);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                  style={{
                    position: 'absolute',
                    top: '12px',
                    right: '12px',
                    padding: '6px 12px',
                    fontSize: '0.7rem',
                    zIndex: 5,
                    minHeight: 'auto'
                  }}
                >
                  {copied ? 'COPIED! ✓' : 'COPY CODE'}
                </button>
                <pre style={{ 
                  padding: '18px', 
                  backgroundColor: '#07080e', 
                  border: '1px solid var(--border-color)', 
                  borderRadius: '8px', 
                  overflowX: 'auto', 
                  fontSize: '0.78rem', 
                  fontFamily: 'monospace', 
                  tabSize: 2,
                  userSelect: 'text',
                  WebkitUserSelect: 'text',
                  MozUserSelect: 'text',
                  msUserSelect: 'text',
                  lineHeight: '1.5',
                  textAlign: 'left'
                }}>
                  <code>
                    {highlightJsCode(SAMPLE_BOT_CODE)}
                  </code>
                </pre>
              </div>
            </div>

            <div className="glass-panel" style={{ padding: '20px', borderLeft: '3px solid #b15cff', background: 'rgba(177, 92, 255, 0.02)' }}>
              <h3 style={{ color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <Info size={18} /> Submit Your Bot to the Galactic Leaderboard!
              </h3>
              <p>
                Think your strategy can beat the Expectiminimax GA bot? Fork our GitHub repository, register your bot file in `src/core/BotStrategies.js`, test it, and submit a <strong>Pull Request</strong>! If verified, your bot will be added as a selectable boss character in the official online release.
              </p>
              <a 
                href="https://github.com/denzven/Lazer-Showdown" 
                target="_blank" 
                rel="noreferrer" 
                className="cyber-button"
                style={{ marginTop: '12px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px', borderColor: '#b15cff', color: '#b15cff' }}
              >
                GITHUB REPOSITORY <ArrowRight size={14} />
              </a>
            </div>
          </div>
        )}

        {/* TAB 1.5: Developer Guide (BOTS.md) */}
        {subMode === 'bot' && activeTab === 'guide' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div className="glass-panel" style={{ padding: '30px', maxHeight: '60vh', overflowY: 'auto', textAlign: 'left', color: 'var(--text-secondary)' }}>
              <ReactMarkdown
                components={{
                  h1: ({node, ...props}) => <h1 style={{ color: 'var(--neon-blue)', fontFamily: 'var(--font-display)', fontSize: '1.8rem', marginTop: '0', marginBottom: '16px', borderBottom: '1px solid rgba(0, 240, 255, 0.1)', paddingBottom: '12px' }} {...props} />,
                  h2: ({node, ...props}) => <h2 style={{ color: 'var(--neon-blue)', fontFamily: 'var(--font-display)', fontSize: '1.4rem', marginTop: '24px', marginBottom: '12px' }} {...props} />,
                  h3: ({node, ...props}) => <h3 style={{ color: 'var(--neon-blue)', fontFamily: 'var(--font-display)', fontSize: '1.2rem', marginTop: '20px', marginBottom: '10px' }} {...props} />,
                  p: ({node, ...props}) => <p style={{ color: '#e2e8f0', fontSize: '0.95rem', lineHeight: '1.7', marginBottom: '16px' }} {...props} />,
                  strong: ({node, ...props}) => <strong style={{ color: 'var(--neon-blue)', fontWeight: 'bold' }} {...props} />,
                  ul: ({node, ...props}) => <ul style={{ paddingLeft: '20px', marginBottom: '16px' }} {...props} />,
                  ol: ({node, ...props}) => <ol style={{ paddingLeft: '20px', marginBottom: '16px' }} {...props} />,
                  li: ({node, ...props}) => <li style={{ color: '#e2e8f0', fontSize: '0.95rem', lineHeight: '1.7', marginBottom: '8px' }} {...props} />,
                  pre: ({children}) => <>{children}</>,
                  code: MarkdownCodeBlock
                }}
              >
                {botsDocRaw}
              </ReactMarkdown>
            </div>
          </div>
        )}

        {/* TAB 2: Headless Tournament Simulator */}
        {subMode === 'bot' && activeTab === 'simulator' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
              
              {/* Bot Checklist */}
              <div className="glass-panel" style={{ flex: 1.5, minWidth: '300px', padding: '20px' }}>
                <h3 style={{ color: 'var(--text-primary)', fontSize: '1rem', marginBottom: '12px' }}>1. CHOOSE PARTICIPANTS</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <CustomCheckbox 
                    checked={selectedBots.easy} 
                    onChange={(e) => setSelectedBots(curr => ({ ...curr, easy: e.target.checked }))} 
                    label="Zlorooklp (Easy Heuristic)" 
                  />
                  <CustomCheckbox 
                    checked={selectedBots.medium} 
                    onChange={(e) => setSelectedBots(curr => ({ ...curr, medium: e.target.checked }))} 
                    label="Lizbishmir (Medium Evaluator)" 
                  />
                  <CustomCheckbox 
                    checked={selectedBots.hard} 
                    onChange={(e) => setSelectedBots(curr => ({ ...curr, hard: e.target.checked }))} 
                    label="Shahlzrmir (Hard Depth-3)" 
                  />
                  <CustomCheckbox 
                    checked={selectedBots.ga} 
                    onChange={(e) => setSelectedBots(curr => ({ ...curr, ga: e.target.checked }))} 
                    label="GA-Bot (Tuned Expectiminimax)" 
                  />
                  <CustomCheckbox 
                    checked={selectedBots.customA} 
                    disabled={!customBots.a}
                    onChange={(e) => setSelectedBots(curr => ({ ...curr, customA: e.target.checked }))} 
                    label={customBots.a ? `Custom Bot A: ${customBots.a.name}` : 'Custom Bot A: [Upload in Tab 1]'} 
                  />
                  <CustomCheckbox 
                    checked={selectedBots.customB} 
                    disabled={!customBots.b}
                    onChange={(e) => setSelectedBots(curr => ({ ...curr, customB: e.target.checked }))} 
                    label={customBots.b ? `Custom Bot B: ${customBots.b.name}` : 'Custom Bot B: [Upload in Tab 1]'} 
                  />
                </div>
              </div>

              {/* Tournament Settings */}
              <div className="glass-panel" style={{ flex: 1, minWidth: '220px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <h3 style={{ color: 'var(--text-primary)', fontSize: '1rem' }}>2. CONFIGURATION</h3>
                
                <div>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Games per Matchup (even count):</label>
                  <input 
                    type="number" 
                    value={gameCount} 
                    onChange={(e) => setGameCount(Math.max(2, parseInt(e.target.value, 10) || 2))}
                    style={{ width: '100%', marginTop: '6px', padding: '8px', background: 'rgba(0,0,0,0.5)', border: '1px solid var(--border-color)', color: '#fff', borderRadius: '4px' }}
                  />
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px' }}>Bots alternate Attacker/Defender roles for fairness.</div>
                </div>

                {!isSimulating ? (
                  <button className="cyber-button blue" onClick={startHeadlessTournament} style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '12px' }}>
                    <Play size={16} /> START CHALLENGE
                  </button>
                ) : (
                  <button className="cyber-button red" onClick={() => { simCancelRef.current = true; }} style={{ marginTop: 'auto', padding: '12px' }}>
                    ABORT SIMULATION
                  </button>
                )}
              </div>
            </div>

            {/* Simulation Log Console */}
            {(isSimulating || consoleLogs.length > 0) && (
              <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <h3 style={{ color: 'var(--text-primary)', fontSize: '1rem', display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                  <span>TERMINAL OUTPUT LOG</span>
                  {isSimulating && <span style={{ color: 'var(--neon-blue)', fontSize: '0.8rem', animation: 'afkPulse 1s infinite' }}>SIMULATING: {simProgress}%</span>}
                </h3>
                
                {/* Progress bar */}
                {isSimulating && (
                  <div style={{ width: '100%', height: '4px', background: 'rgba(255,255,255,0.05)', borderRadius: '2px', overflow: 'hidden' }}>
                    <div style={{ width: `${simProgress}%`, height: '100%', background: 'linear-gradient(90deg, var(--neon-red), var(--neon-blue))', transition: 'width 0.1s ease' }} />
                  </div>
                )}

                <div style={{ height: '220px', overflowY: 'auto', background: '#05060b', border: '1px solid rgba(0,240,255,0.15)', borderRadius: '8px', padding: '12px 16px', fontFamily: 'monospace', fontSize: '0.75rem', color: '#39ff14', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {consoleLogs.map((log, idx) => (
                    <div key={idx} style={{ opacity: log.includes('wins') || log.includes('complete') ? 1 : 0.7 }}>
                      {log}
                    </div>
                  ))}
                  <div ref={consoleEndRef} />
                </div>
              </div>
            )}

            {/* Leaderboard Result */}
            {leaderboard.length > 0 && (
              <div className="glass-panel" style={{ padding: '20px' }}>
                <h3 style={{ color: 'var(--text-primary)', fontSize: '1rem', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Award size={18} /> TOURNAMENT FINAL LEADERBOARD
                </h3>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                        <th style={{ padding: '10px 8px', color: 'var(--text-secondary)' }}>POS</th>
                        <th style={{ padding: '10px 8px', color: 'var(--text-secondary)' }}>BOT NAME</th>
                        <th style={{ padding: '10px 8px', color: 'var(--text-secondary)', textAlign: 'center' }}>WINS</th>
                        <th style={{ padding: '10px 8px', color: 'var(--text-secondary)', textAlign: 'center' }}>LOSSES</th>
                        <th style={{ padding: '10px 8px', color: 'var(--text-secondary)', textAlign: 'center' }}>DRAWS</th>
                        <th style={{ padding: '10px 8px', color: 'var(--text-secondary)', textAlign: 'center' }}>WIN RATE</th>
                        <th style={{ padding: '10px 8px', color: 'var(--text-secondary)', textAlign: 'center' }}>AVG SCORE</th>
                        <th style={{ padding: '10px 8px', color: 'var(--text-secondary)', textAlign: 'center' }}>AVG TURNS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {leaderboard.map((row, idx) => (
                        <tr key={row.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', backgroundColor: idx === 0 ? 'rgba(0,240,255,0.02)' : 'transparent' }}>
                          <td style={{ padding: '12px 8px', fontWeight: 'bold', color: idx === 0 ? 'var(--neon-blue)' : 'var(--text-secondary)' }}>{idx + 1}</td>
                          <td style={{ padding: '12px 8px', fontWeight: 'bold' }}>{row.name}</td>
                          <td style={{ padding: '12px 8px', textAlign: 'center', color: '#39ff14', fontWeight: 'bold' }}>{row.wins}</td>
                          <td style={{ padding: '12px 8px', textAlign: 'center', color: 'var(--neon-red)' }}>{row.losses}</td>
                          <td style={{ padding: '12px 8px', textAlign: 'center', opacity: 0.7 }}>{row.draws}</td>
                          <td style={{ padding: '12px 8px', textAlign: 'center', fontWeight: 'bold', color: 'var(--neon-blue)' }}>{row.winRate}</td>
                          <td style={{ padding: '12px 8px', textAlign: 'center', opacity: 0.9 }}>{row.avgScore}</td>
                          <td style={{ padding: '12px 8px', textAlign: 'center', opacity: 0.7 }}>{row.avgTurns}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: Visual Spectator Launcher */}
        {subMode === 'bot' && activeTab === 'spectate' && (
          <div className="glass-panel" style={{ padding: '30px', display: 'flex', flexDirection: 'column', gap: '20px', alignItems: 'center' }}>
            <h3 style={{ color: 'var(--text-primary)', fontSize: '1.2rem', marginBottom: '10px', textAlign: 'center' }}>
              LAUNCH VISUAL SPECTATOR MODE
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', textAlign: 'center', maxWidth: '500px', lineHeight: '1.5' }}>
              Load the game board UI and watch the bots fight! Both players (Red & Blue) are controlled by AI, automatically rolling dice, deploying defensive blocks, rotating and firing the laser.
            </p>

            <div style={{ display: 'flex', gap: '24px', width: '100%', maxWidth: '550px', alignItems: 'center', margin: '15px 0' }}>
              {/* Red Bot selection */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--neon-red)', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px' }}>RED PLAYER BOT:</label>
                <CustomSelect 
                  value={specRed} 
                  onChange={setSpecRed} 
                  options={getSelectableBots()} 
                  colorTheme="red"
                />
              </div>

              <div style={{ color: 'var(--text-muted)', fontWeight: 'bold', fontSize: '1.2rem', marginTop: '20px' }}>VS</div>

              {/* Blue Bot selection */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--neon-blue)', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px' }}>BLUE PLAYER BOT:</label>
                <CustomSelect 
                  value={specBlue} 
                  onChange={setSpecBlue} 
                  options={getSelectableBots()} 
                  colorTheme="blue"
                />
              </div>
            </div>

            {/* Board Selection */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%', maxWidth: '550px', marginBottom: '15px' }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--neon-blue)', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px' }}>BATTLE GRID BOARD LAYOUT:</label>
              <div style={{ display: 'flex', gap: '12px', width: '100%' }}>
                <div style={{ flex: 1 }}>
                  <CustomSelect 
                    value={specBoard} 
                    onChange={setSpecBoard} 
                    options={getSelectableBoards()} 
                    colorTheme="cyan"
                  />
                </div>
                <button 
                  className="cyber-button" 
                  onClick={handleSelectRandomBoard}
                  style={{ padding: '0 20px', minHeight: 'auto', display: 'flex', alignItems: 'center', gap: '8px', borderColor: 'var(--neon-blue)', color: 'var(--neon-blue)', fontWeight: 'bold' }}
                >
                  <RefreshCw size={16} /> RANDOM
                </button>
              </div>
            </div>

            {specBoard === 'import' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'center', margin: '0 0 15px 0' }}>
                <button 
                  className="cyber-button"
                  onClick={() => spectatorBoardInputRef.current?.click()}
                  style={{ 
                    fontSize: '0.85rem', 
                    padding: '8px 16px', 
                    borderColor: 'var(--neon-green)', 
                    color: 'var(--neon-green)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    minHeight: 'auto'
                  }}
                >
                  <Upload size={14} /> UPLOAD BOARD JSON
                </button>
                <input 
                  type="file" 
                  ref={spectatorBoardInputRef} 
                  accept=".json" 
                  onChange={handleImportSpectatorBoardJson} 
                  style={{ display: 'none' }} 
                />
                {spectatorBoardError && (
                  <div style={{ color: 'var(--neon-red)', fontSize: '0.78rem', marginTop: '2px', maxWidth: '280px' }}>
                    ⚠️ {spectatorBoardError}
                  </div>
                )}
              </div>
            )}

            <button 
              className="cyber-button blue" 
              onClick={() => onStartSpectate(specRed, specBlue, specBoard)}
              style={{ padding: '16px 36px', fontSize: '1.1rem', fontWeight: 'bold', letterSpacing: '1px', marginTop: '10px', animation: 'afkPulse 1.5s infinite' }}
            >
              LAUNCH LIVE SPECTATE <ArrowRight size={18} style={{ marginLeft: '8px', display: 'inline' }} />
            </button>
          </div>
        )}

        {/* SUB MODE: Board Layout Editor */}
        {subMode === 'editor' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            
            {/* Explanatory Banner */}
            <div className="glass-panel" style={{ padding: '20px', borderLeft: '3px solid var(--neon-blue)', background: 'rgba(0, 240, 255, 0.02)' }}>
              <h3 style={{ color: 'var(--text-primary)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Grid size={18} style={{ color: 'var(--neon-blue)' }} /> Design Custom Board Maps
              </h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: '1.6' }}>
                Build custom mirror grids! Click on any empty square to place a <strong>/ (0°)</strong> mirror. Click it again to toggle to a <strong>\ (90°)</strong> mirror. Click a third time to clear the square. Save your layout and import it into the local match board or visual spectator mode.
              </p>
            </div>

            {/* Editor Grid and Info */}
            <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'flex-start' }}>
              
              {/* The 8x8 Grid Container */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                {/* Column Headers */}
                <div style={{ display: 'flex', paddingLeft: '24px', width: '100%', minWidth: '344px', marginBottom: '4px' }}>
                  {Array(8).fill(null).map((_, idx) => (
                    <div key={idx} style={{ flex: 1, textAlign: 'center', fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--neon-blue)', opacity: 0.8 }}>
                      {idx}
                    </div>
                  ))}
                </div>

                <div style={{ display: 'flex', gap: '6px' }}>
                  {/* Row Headers */}
                  <div style={{ display: 'flex', flexDirection: 'column', height: '320px', justifyContent: 'space-around', paddingRight: '4px' }}>
                    {Array(8).fill(null).map((_, idx) => (
                      <div key={idx} style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--neon-blue)', opacity: 0.8, height: '40px', display: 'flex', alignItems: 'center' }}>
                        {idx}
                      </div>
                    ))}
                  </div>

                  {/* 8x8 Grid Canvas */}
                  <div 
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(8, 40px)',
                      gridTemplateRows: 'repeat(8, 40px)',
                      gap: '2px',
                      background: 'rgba(0, 0, 0, 0.6)',
                      border: '2px solid var(--border-color)',
                      boxShadow: '0 0 15px rgba(0, 240, 255, 0.1)',
                      borderRadius: '8px',
                      padding: '4px'
                    }}
                  >
                    {Array(8).fill(null).map((_, r) => (
                      Array(8).fill(null).map((_, c) => {
                        const cell = editorBoard[r][c];
                        const isCorner = (r === 0 && c === 0) || (r === 0 && c === 7) || (r === 7 && c === 0) || (r === 7 && c === 7);
                        return (
                          <div 
                            key={`${r}-${c}`}
                            onClick={() => handleCellClick(r, c)}
                            style={{
                              position: 'relative',
                              width: '40px',
                              height: '40px',
                              background: isCorner ? 'rgba(255, 42, 133, 0.05)' : 'rgba(5, 5, 10, 0.8)',
                              border: isCorner ? '1px dashed rgba(255, 42, 133, 0.3)' : '1px solid rgba(255, 255, 255, 0.05)',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              transition: 'all 0.15s ease'
                            }}
                          >
                            {/* Dotted target inside cell */}
                            {!cell && !isCorner && (
                              <div style={{ width: '4px', height: '4px', borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.1)' }} />
                            )}
                            
                            {/* Attacker Corner Marks */}
                            {isCorner && !cell && (
                              <div style={{ fontSize: '0.6rem', color: 'var(--neon-red)', fontWeight: 'bold', opacity: 0.6 }}>LAZR</div>
                            )}

                            {/* Glowing Slash Mirror preview */}
                            {cell && cell.type === 'mirror' && (
                              <div style={{
                                position: 'absolute',
                                top: '50%',
                                left: '50%',
                                width: '28px',
                                height: '3px',
                                background: 'var(--neon-blue)',
                                boxShadow: '0 0 8px var(--neon-blue), 0 0 15px var(--neon-blue)',
                                transform: `translate(-50%, -50%) rotate(${cell.orientation === '/' ? '-45deg' : '45deg'})`,
                                pointerEvents: 'none'
                              }} />
                            )}

                            {/* Laser Simulator Beam Segment */}
                            {renderLaserBeam(r, c)}
                          </div>
                        );
                      })
                    ))}
                  </div>
                </div>
              </div>

              {/* Design Controls */}
              <div style={{ flex: 1, minWidth: '280px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <h4 style={{ color: 'var(--text-primary)', margin: '0 0 4px 0', fontSize: '0.95rem' }}>GRID CONTROLS</h4>
                  
                  {/* File name inputs */}
                  <div>
                    <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>Board Name identifier:</label>
                    <input 
                      type="text"
                      value={editorBoardName}
                      onChange={(e) => setEditorBoardName(e.target.value)}
                      placeholder="custom_board_name"
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        background: 'rgba(0, 0, 0, 0.4)',
                        border: '1px solid var(--border-color)',
                        color: 'var(--text-primary)',
                        borderRadius: '4px',
                        fontSize: '0.85rem'
                      }}
                    />
                  </div>

                  {/* Status Logs */}
                  {editorError && (
                    <div style={{ padding: '8px 12px', background: 'rgba(255, 42, 133, 0.08)', border: '1px solid var(--neon-red)', borderRadius: '4px', color: 'var(--neon-red)', fontSize: '0.8rem', fontWeight: 'bold' }}>
                      {editorError}
                    </div>
                  )}

                  {editorSuccess && (
                    <div style={{ padding: '8px 12px', background: 'rgba(57, 255, 20, 0.08)', border: '1px solid #39ff14', borderRadius: '4px', color: '#39ff14', fontSize: '0.8rem', fontWeight: 'bold' }}>
                      {editorSuccess}
                    </div>
                  )}

                  {/* Actions buttons grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <button 
                      className="cyber-button blue"
                      onClick={handleExportJsonFile}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: '0.8rem', padding: '10px 8px' }}
                    >
                      <Download size={14} style={{ display: 'inline-block' }} /> DOWNLOAD JSON
                    </button>

                    <label 
                      className="cyber-button"
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: '0.8rem', padding: '10px 8px', cursor: 'pointer' }}
                    >
                      <Upload size={14} style={{ display: 'inline-block' }} /> IMPORT FILE
                      <input type="file" accept=".json" onChange={handleImportJsonFile} style={{ display: 'none' }} />
                    </label>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <button 
                      className="cyber-button"
                      onClick={handleLoadDefaultMirrors}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: '0.8rem', padding: '10px 8px', borderColor: 'var(--neon-blue)', color: 'var(--neon-blue)' }}
                    >
                      <RefreshCw size={14} style={{ display: 'inline-block' }} /> LOAD DEFAULT
                    </button>

                    <button 
                      className="cyber-button red"
                      onClick={handleClearEditorBoard}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: '0.8rem', padding: '10px 8px' }}
                    >
                      <Trash2 size={14} style={{ display: 'inline-block' }} /> CLEAR GRID
                    </button>
                  </div>
                </div>

                {/* Laser Simulation Controls */}
                <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <h4 style={{ color: 'var(--text-primary)', margin: '0', fontSize: '0.95rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>⚡ LAZER SIMULATION</span>
                    <CustomCheckbox 
                      checked={simLaserActive} 
                      onChange={(e) => setSimLaserActive(e.target.checked)} 
                      label=""
                    />
                  </h4>

                  {simLaserActive && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '12px' }}>
                      
                      {/* Laser Source Position */}
                      <div>
                        <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '8px' }}>Laser Source Corner:</label>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                          <button 
                            className={`cyber-button ${simLaserR === 0 && simLaserC === 0 ? 'blue' : ''}`}
                            onClick={() => { setSimLaserR(0); setSimLaserC(0); }}
                            style={{ fontSize: '0.75rem', padding: '6px', minHeight: 'auto' }}
                          >
                            Top-Left (0,0)
                          </button>
                          <button 
                            className={`cyber-button ${simLaserR === 0 && simLaserC === 7 ? 'blue' : ''}`}
                            onClick={() => { setSimLaserR(0); setSimLaserC(7); }}
                            style={{ fontSize: '0.75rem', padding: '6px', minHeight: 'auto' }}
                          >
                            Top-Right (0,7)
                          </button>
                          <button 
                            className={`cyber-button ${simLaserR === 7 && simLaserC === 0 ? 'blue' : ''}`}
                            onClick={() => { setSimLaserR(7); setSimLaserC(0); }}
                            style={{ fontSize: '0.75rem', padding: '6px', minHeight: 'auto' }}
                          >
                            Bottom-Left (7,0)
                          </button>
                          <button 
                            className={`cyber-button ${simLaserR === 7 && simLaserC === 7 ? 'blue' : ''}`}
                            onClick={() => { setSimLaserR(7); setSimLaserC(7); }}
                            style={{ fontSize: '0.75rem', padding: '6px', minHeight: 'auto' }}
                          >
                            Bottom-Right (7,7)
                          </button>
                        </div>
                      </div>

                      {/* Laser Fire Direction */}
                      <div>
                        <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '8px' }}>Firing Direction:</label>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                          <button 
                            className={`cyber-button ${simLaserDir === 0 ? 'blue' : ''}`}
                            onClick={() => setSimLaserDir(0)}
                            style={{ fontSize: '0.75rem', padding: '6px', minHeight: 'auto' }}
                          >
                            UP ⬆️
                          </button>
                          <button 
                            className={`cyber-button ${simLaserDir === 90 ? 'blue' : ''}`}
                            onClick={() => setSimLaserDir(90)}
                            style={{ fontSize: '0.75rem', padding: '6px', minHeight: 'auto' }}
                          >
                            RIGHT ➡️
                          </button>
                          <button 
                            className={`cyber-button ${simLaserDir === 180 ? 'blue' : ''}`}
                            onClick={() => setSimLaserDir(180)}
                            style={{ fontSize: '0.75rem', padding: '6px', minHeight: 'auto' }}
                          >
                            DOWN ⬇️
                          </button>
                          <button 
                            className={`cyber-button ${simLaserDir === 270 ? 'blue' : ''}`}
                            onClick={() => setSimLaserDir(270)}
                            style={{ fontSize: '0.75rem', padding: '6px', minHeight: 'auto' }}
                          >
                            LEFT ⬅️
                          </button>
                        </div>
                      </div>

                    </div>
                  )}
                </div>

                {/* Import guideline details */}
                <div className="glass-panel" style={{ padding: '15px 20px', fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: '1.5' }}>
                  💡 <strong>How to Use Custom JSONs:</strong><br />
                  Once downloaded, place the file in the project's <code>src/boards/</code> directory (e.g. <code>src/boards/my_maze.json</code>). Vite will automatically scan and register the new layout. You will then see it selectable under both the Main Menu board options and Dev's Corner visual spectating dropdowns!
                </div>
              </div>

            </div>
          </div>
        )}

      </div>
    </div>
  );
}
