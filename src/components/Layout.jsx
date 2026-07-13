import React, { useState, useEffect } from 'react';
import { Trash2, LogOut, Info, AlertTriangle, X, Zap, Undo2 } from 'lucide-react';
import Grid from './Board/Grid';
import AnalysisPanel from './AnalysisPanel';
import { BLOCK_TYPES, PLAYERS, getReachableCells } from '../core/Ruleset';
import { getPieceThreatLevels, getBoardAnalysis, classifyMove, getChallengeRecommendation } from '../core/BotStrategies';
import { getBoardAnalysisAsync, getBotEngineLinesAsync } from '../core/BotEngine';

const GlitchTypewriter = ({ text, speed = 25 }) => {
  const [revealedCount, setRevealedCount] = useState(0);

  const tokens = React.useMemo(() => {
    let totalLen = 0;
    return text.split('**').map((part, index) => {
      const start = totalLen;
      totalLen += part.length;
      
      const gibberish = Array.from(part).map(char => {
        if (char === ' ' || char === '\n') return char;
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        return chars[Math.floor(Math.random() * chars.length)];
      }).join('');
      
      return { text: part, gibberish, highlight: index % 2 === 1, start, length: part.length };
    });
  }, [text]);

  const totalChars = React.useMemo(() => tokens.reduce((acc, t) => acc + t.length, 0), [tokens]);

  useEffect(() => {
    setRevealedCount(0);
    let current = 0;
    const interval = setInterval(() => {
      if (current < totalChars) {
        const jump = Math.floor(Math.random() * 3) + 4; // 4, 5, or 6
        current = Math.min(current + jump, totalChars);
        setRevealedCount(current);
      } else {
        clearInterval(interval);
      }
    }, speed);
    return () => clearInterval(interval);
  }, [totalChars, speed]);

  return (
    <span style={{ fontFamily: 'monospace' }}>
      {tokens.map((token, tokenIdx) => {
        let content = [];
        for (let i = 0; i < token.length; i++) {
          const globalIdx = token.start + i;
          if (globalIdx < revealedCount) {
            content.push(token.text[i]);
          } else if (globalIdx === revealedCount) {
            content.push('_'); // cursor
          } else {
            content.push(token.gibberish[i]);
          }
        }
        
        if (content.length === 0) return null;
        
        const rendered = content.join('');
        return (
          <span 
            key={tokenIdx} 
            style={token.highlight ? { 
              color: 'var(--neon-blue)', 
              fontWeight: 'bold', 
              textShadow: '0 0 8px rgba(0, 240, 255, 0.8)',
              letterSpacing: '1px'
            } : {
              opacity: 0.9
            }}
          >
            {rendered}
          </span>
        );
      })}
    </span>
  );
};

// ── GameOverScreen ─────────────────────────────────────────────────────────────
const GameOverScreen = ({ outcome, redScore, blueScore, playerName, opponentName, mode, game, history, tutorialStep, onReview, onPlayAgain, onLeave }) => {
  const canvasRef = React.useRef(null);
  const animRef = React.useRef(null);

  const isWin = outcome === 'win';
  const isDraw = outcome === 'draw';
  const isLoss = outcome === 'loss';

  const accentColor = isWin ? '#39ff14' : isDraw ? '#00f0ff' : '#ff003c';
  const accentGlow = isWin ? 'rgba(57,255,20,0.4)' : isDraw ? 'rgba(0,240,255,0.4)' : 'rgba(255,0,60,0.4)';

  const headline = isWin ? 'VICTORY' : isDraw ? 'DRAW' : 'DEFEAT';
  const subline = isWin
    ? 'The enemy has been annihilated!'
    : isDraw
    ? 'An honourable stalemate!'
    : 'The Lazer has claimed your forces.';

  // ── Canvas particle burst
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;

    const W = canvas.width;
    const H = canvas.height;

    const winColors = ['#39ff14', '#00f0ff', '#ffffff', '#aaff80', '#80ffee'];
    const lossColors = ['#ff003c', '#ff6060', '#cc0022', '#ff80a0', '#550011'];
    const drawColors = ['#00f0ff', '#ffffff', '#7f80ff', '#ff80ff'];
    const palette = isWin ? winColors : isDraw ? drawColors : lossColors;

    const particles = Array.from({ length: isWin ? 120 : isDraw ? 60 : 50 }, () => ({
      x: W / 2 + (Math.random() - 0.5) * W * 0.6,
      y: H * 0.4,
      vx: (Math.random() - 0.5) * (isWin ? 8 : 4),
      vy: -(Math.random() * (isWin ? 12 : 7) + 2),
      size: Math.random() * (isWin ? 8 : 5) + 2,
      color: palette[Math.floor(Math.random() * palette.length)],
      alpha: 1,
      spin: (Math.random() - 0.5) * 0.3,
      shape: isLoss ? 'circle' : Math.random() > 0.5 ? 'rect' : 'circle',
      decay: 0.008 + Math.random() * 0.012,
    }));

    let frame = 0;
    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      particles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.25;
        p.alpha -= p.decay;
        p.spin += 0.05;
        if (p.alpha <= 0) return;
        ctx.save();
        ctx.globalAlpha = Math.max(0, p.alpha);
        ctx.fillStyle = p.color;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.spin);
        if (p.shape === 'rect') {
          ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.5);
        } else {
          ctx.beginPath();
          ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      });
      frame++;
      if (frame < 200) animRef.current = requestAnimationFrame(draw);
    };
    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, [outcome]);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 2000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.88)',
      backdropFilter: 'blur(6px)',
    }}>
      {/* Particle canvas */}
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} />

      {/* Card */}
      <div style={{
        position: 'relative',
        width: '92%', maxWidth: '480px',
        background: 'linear-gradient(160deg, rgba(4,8,20,0.98) 0%, rgba(10,18,40,0.98) 100%)',
        border: `2px solid ${accentColor}`,
        borderRadius: '16px',
        padding: '40px 32px 32px',
        textAlign: 'center',
        boxShadow: `0 0 60px ${accentGlow}, 0 0 120px ${accentGlow}, inset 0 0 40px rgba(0,0,0,0.6)`,
        animation: 'gameOverEntrance 0.6s cubic-bezier(0.16,1,0.3,1) both',
      }}>
        {/* Corner accents */}
        {['topLeft','topRight','bottomLeft','bottomRight'].map(pos => (
          <div key={pos} style={{
            position: 'absolute',
            width: '20px', height: '20px',
            ...(pos.includes('top') ? { top: '-2px' } : { bottom: '-2px' }),
            ...(pos.includes('Left') ? { left: '-2px', borderLeft: `3px solid ${accentColor}`, borderTop: `3px solid ${accentColor}` } : { right: '-2px', borderRight: `3px solid ${accentColor}`, borderTop: pos.includes('top') ? `3px solid ${accentColor}` : undefined, borderBottom: pos.includes('bottom') ? `3px solid ${accentColor}` : undefined }),
            borderRadius: pos.includes('top') && pos.includes('Left') ? '4px 0 0 0' : pos.includes('top') ? '0 4px 0 0' : pos.includes('Left') ? '0 0 0 4px' : '0 0 4px 0',
          }} />
        ))}

        {/* Outcome icon */}
        <div style={{
          fontSize: isWin ? '4rem' : isDraw ? '3.5rem' : '3.5rem',
          marginBottom: '8px',
          filter: `drop-shadow(0 0 16px ${accentColor})`,
          animation: 'outcomeIconPop 0.5s 0.3s cubic-bezier(0.34,1.56,0.64,1) both',
        }}>
          {isWin ? '🏆' : isDraw ? '⚖️' : '💀'}
        </div>

        {/* Headline */}
        <div style={{
          fontSize: '3rem', fontWeight: '900', letterSpacing: '6px',
          color: accentColor,
          textShadow: `0 0 20px ${accentColor}, 0 0 40px ${accentColor}, 0 0 80px ${accentGlow}`,
          fontFamily: 'monospace',
          animation: 'glowPulseText 2s ease-in-out infinite',
          marginBottom: '4px',
        }}>
          {headline}
        </div>

        <div style={{
          color: 'rgba(255,255,255,0.6)', fontSize: '0.9rem',
          letterSpacing: '2px', marginBottom: '28px',
          fontFamily: 'monospace',
        }}>
          {subline}
        </div>

        {/* Score bar */}
        <div style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '12px', padding: '16px 20px',
          marginBottom: '20px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: '0.65rem', color: 'var(--neon-red)', letterSpacing: '2px', fontWeight: 'bold', marginBottom: '4px' }}>
                {mode === 'online' ? (playerName || 'RED') : 'YOU'}
              </div>
              <div style={{ fontSize: '2rem', fontWeight: '900', color: 'var(--neon-red)', textShadow: '0 0 12px rgba(255,0,60,0.6)' }}>
                {redScore}
              </div>
            </div>
            <div style={{ fontSize: '1.2rem', color: 'rgba(255,255,255,0.2)', fontWeight: 'bold' }}>VS</div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.65rem', color: 'var(--neon-blue)', letterSpacing: '2px', fontWeight: 'bold', marginBottom: '4px' }}>
                {mode === 'bot' ? 'BOT' : mode === 'online' ? (opponentName || 'BLUE') : 'BLUE'}
              </div>
              <div style={{ fontSize: '2rem', fontWeight: '900', color: 'var(--neon-blue)', textShadow: '0 0 12px rgba(0,240,255,0.6)' }}>
                {blueScore}
              </div>
            </div>
          </div>
          {/* Score bar */}
          <div style={{ height: '6px', borderRadius: '99px', background: 'rgba(255,255,255,0.08)', overflow: 'hidden', position: 'relative' }}>
            <div style={{
              position: 'absolute', left: 0, top: 0, bottom: 0,
              width: `${redScore + blueScore > 0 ? (redScore / (redScore + blueScore)) * 100 : 50}%`,
              background: 'linear-gradient(90deg, var(--neon-red), #ff6680)',
              borderRadius: '99px',
              transition: 'width 1s ease',
              boxShadow: '0 0 8px rgba(255,0,60,0.6)',
            }} />
          </div>
        </div>

        {/* ELO rating */}
        {mode === 'bot' && game?.eloProcessed && (
          <div style={{
            marginBottom: '20px', padding: '10px 16px',
            background: 'rgba(255,204,0,0.08)', border: '1px solid rgba(255,204,0,0.25)',
            borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
          }}>
            <span style={{ color: '#ffcc00', fontSize: '0.75rem', letterSpacing: '1px' }}>ELO RATING</span>
            <span style={{ fontWeight: 'bold', color: '#ffcc00', fontSize: '1.1rem' }}>
              {game.newElo}
              <span style={{ fontSize: '0.85rem', marginLeft: '8px', color: game.eloDiff >= 0 ? '#39ff14' : '#ff003c' }}>
                ({game.eloDiff >= 0 ? '+' : ''}{game.eloDiff})
              </span>
            </span>
          </div>
        )}

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          {mode !== 'tutorial' && (
            <button className="cyber-button blue" onClick={onReview} style={{ flex: 1, minWidth: '100px' }}>
              📋 REVIEW
            </button>
          )}
          <button className="cyber-button" onClick={onPlayAgain}
            style={{ flex: 1, minWidth: '100px', borderColor: accentColor, color: accentColor, boxShadow: `0 0 10px ${accentGlow}` }}>
            ↺ PLAY AGAIN
          </button>
          <button className="cyber-button" onClick={onLeave} style={{
            flex: 1, minWidth: '100px',
            animation: tutorialStep?.highlightButton === 'leave-game' ? 'afkPulse 1.2s infinite' : 'none',
            border: tutorialStep?.highlightButton === 'leave-game' ? `2px solid var(--neon-blue)` : undefined,
            boxShadow: tutorialStep?.highlightButton === 'leave-game' ? '0 0 15px var(--neon-blue)' : undefined,
          }}>
            ⬅ LEAVE
          </button>
        </div>
      </div>
    </div>
  );
};


// ── TutorialDrawer ────────────────────────────────────────────────────────────
// Collapses to a slim tab so it never blocks gameplay. Auto-expands when
// the message changes, then the player can collapse it manually.
const TutorialDrawer = ({ tutorialStep, tutorialError, onTutorialNext }) => {
  const [isOpen, setIsOpen] = useState(true);
  const prevInstruction = React.useRef('');

  // Auto-open whenever the instruction changes
  useEffect(() => {
    if (tutorialStep?.instruction && tutorialStep.instruction !== prevInstruction.current) {
      prevInstruction.current = tutorialStep.instruction;
      setIsOpen(true);
    }
  }, [tutorialStep?.instruction]);

  if (!tutorialStep) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      zIndex: 1000,
      pointerEvents: 'none', // let clicks pass through except on the drawer itself
    }}>
      <div
        style={{
          margin: '0 auto',
          maxWidth: '600px',
          pointerEvents: 'all',
          background: 'rgba(4, 8, 18, 0.97)',
          borderTop: '2px solid var(--neon-blue)',
          borderLeft: '1px solid rgba(0,240,255,0.2)',
          borderRight: '1px solid rgba(0,240,255,0.2)',
          borderRadius: '12px 12px 0 0',
          boxShadow: '0 -4px 24px rgba(0,240,255,0.15), 0 -2px 48px rgba(0,0,0,0.8)',
          overflow: 'hidden',
          transition: 'max-height 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
          maxHeight: isOpen ? '320px' : '48px',
        }}
      >
        {/* ── Tab Handle ── */}
        <div
          onClick={() => setIsOpen(o => !o)}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 16px',
            height: '48px',
            cursor: 'pointer',
            userSelect: 'none',
            background: isOpen ? 'rgba(0,240,255,0.06)' : 'transparent',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {/* Avatar dot */}
            <div style={{
              width: '28px', height: '28px', borderRadius: '50%',
              background: 'linear-gradient(135deg, #0f2027, #2c5364)',
              border: '1.5px solid var(--neon-blue)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--neon-blue)', fontSize: '0.8rem', fontWeight: 'bold',
              boxShadow: '0 0 6px var(--neon-blue)',
              flexShrink: 0,
            }}>Z</div>
            <span style={{
              color: 'var(--neon-blue)', fontWeight: 'bold',
              fontSize: '0.7rem', letterSpacing: '1.5px', textTransform: 'uppercase'
            }}>
              CMDR ZLOROOKLP
            </span>
            {/* Pulsing dot when closed to signal new message */}
            {!isOpen && (
              <span style={{
                width: '7px', height: '7px', borderRadius: '50%',
                background: 'var(--neon-blue)',
                display: 'inline-block',
                animation: 'afkPulse 1s infinite',
                boxShadow: '0 0 6px var(--neon-blue)',
              }} />
            )}
          </div>
          {/* Chevron */}
          <span style={{
            color: 'var(--neon-blue)', fontSize: '1rem',
            transition: 'transform 0.3s',
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            lineHeight: 1,
          }}>▲</span>
        </div>

        {/* ── Expanded content ── */}
        <div style={{
          padding: '0 16px 16px',
          opacity: isOpen ? 1 : 0,
          transition: 'opacity 0.2s',
          overflowY: 'auto',
          maxHeight: '260px',
        }}>
          {/* Title */}
          <div style={{
            color: 'var(--neon-blue)', fontWeight: 'bold',
            fontSize: '1rem', letterSpacing: '0.5px',
            marginBottom: '8px',
            textShadow: '0 0 8px rgba(0,240,255,0.5)',
          }}>
            {tutorialStep.title}
          </div>

          {/* Message with glitch decode */}
          <div style={{
            color: 'var(--text-primary)', fontSize: '0.88rem',
            lineHeight: '1.5', fontFamily: 'monospace',
          }}>
            <GlitchTypewriter text={tutorialStep.instruction} speed={80} />
          </div>

          {/* Error */}
          {tutorialError && (
            <div style={{
              color: 'var(--neon-red)', fontSize: '0.82rem',
              fontWeight: 'bold', marginTop: '8px',
              animation: 'pulse 1s infinite',
            }}>
              {tutorialError}
            </div>
          )}

          {/* Proceed button */}
          {tutorialStep?.expectedAction?.type === 'next' && (
            <button
              className="cyber-button"
              onClick={onTutorialNext}
              style={{ marginTop: '12px', padding: '8px 20px', fontSize: '0.85rem', animation: 'afkPulse 1s infinite', width: '100%' }}
            >
              PROCEED
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default function Layout({ network, game, mode, difficulty, tutorialStep, tutorialError, onExitTutorial, onTutorialNext }) {
  const { status, role, playerName, opponentName, disconnect } = network;
  const {
    board,
    phase,
    set,
    round,
    roleRed,
    roleBlue,
    turnPlayer,
    actionPoints,
    hasRolledDice,
    scores,
    winner,
    logs,
    customData,
    capturedPieces,
    challengeActive,
    challengedPiece,
    tossRolls,
    tossWinner,
    challengeTossRolls,
    dice,
    error,
    executeAction,
    placeBlock,
    moveBlock,
    rotateBlock,
    removeBlock,
    clearWorkspace,
    clearError,
    rollDice,
    rollToss,
    selectRole,
    rollChallengeToss,
    declareChallenge,
    endTurn,
    undo,
    redo,
    canUndo,
    canRedo,
    analysisMode,
    setAnalysisMode,
    analysisData,
    threatMap,
    history,
    reviewIndex,
    setReviewIndex,
    stepForward,
    stepBackward
  } = game;

  const [selectedCell, setSelectedCell] = useState(null);
  const [selectedPaletteBlock, setSelectedPaletteBlock] = useState(null);
  const [showLaserBeam, setShowLaserBeam] = useState(false);
  
  const [engineType, setEngineType] = useState('math'); // 'math', 'neural', or 'comparison'
  
  const showHeatmap = engineType === 'math' || engineType === 'comparison';
  const showGhostRays = engineType === 'math';
  const showPieceThreats = engineType === 'math';
  const showQHeatmap = engineType === 'neural' || engineType === 'comparison';

  const [qHeatmapData, setQHeatmapData] = useState(null);
  const [highlightedCell, setHighlightedCell] = useState(null);

  const challengeRecommendation = React.useMemo(() => {
    if (!analysisMode) return null;
    const attackerScore = game.roleRed === 'attacker' ? game.scores.red : game.scores.blue;
    const defenderScore = game.roleRed === 'attacker' ? game.scores.blue : game.scores.red;
    return getChallengeRecommendation(game.capturedPieces || [], game.round, game.actionPoints, attackerScore, defenderScore, game.set);
  }, [game.capturedPieces, game.round, game.actionPoints, game.scores, game.roleRed, game.set, analysisMode]);

  const [boardAnalysis, setBoardAnalysis] = useState(null);
  const [moveClassification, setMoveClassification] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [neuralThreatMap, setNeuralThreatMap] = useState(null);

  useEffect(() => {
    if (!showQHeatmap) {
      setQHeatmapData(null);
      return;
    }
    let isMounted = true;
    const fetchQHeatmap = async () => {
      const currentGameState = {
        roleRed, roleBlue, turnPlayer,
        scores: game.scores, actionPoints: game.actionPoints, round: game.round, set: game.set, capturedPieces: game.capturedPieces
      };
      
      const { generateQValueHeatmapAsync } = await import('../core/NeuralBot.js');
      const botRole = turnPlayer; // Evaluate from the perspective of the current turn player
      const heatmap = await generateQValueHeatmapAsync(board, botRole, game.actionPoints, currentGameState);
      
      if (isMounted) setQHeatmapData(heatmap);
    };
    fetchQHeatmap();
    return () => { isMounted = false; };
  }, [board, showQHeatmap, turnPlayer, roleRed, roleBlue, game.scores, game.actionPoints, game.round, game.set, game.capturedPieces]);

  useEffect(() => {
    if (!analysisMode) {
      setBoardAnalysis(null);
      return;
    }
    let isMounted = true;
    const analyze = async () => {
      const activeRole = role === 'attacker' ? (roleRed === 'attacker' ? 'red' : 'blue') : (roleRed === 'defender' ? 'red' : 'blue');
      const difficultyToUse = engineType === 'neural' ? 'neural' : (difficulty || 'hard');
      const res = await getBoardAnalysisAsync(board, role, difficultyToUse, { turnPlayer, roleRed, roleBlue }, activeRole);
      if (isMounted) setBoardAnalysis(res);

      if (engineType === 'neural') {
        const { generateNeuralThreatMapAsync } = await import('../core/NeuralBot.js');
        const currentGameState = {
          roleRed, roleBlue, turnPlayer,
          scores: game.scores, actionPoints: game.actionPoints, round: game.round, set: game.set, capturedPieces: game.capturedPieces
        };
        const neuralMap = await generateNeuralThreatMapAsync(board, currentGameState);
        if (isMounted) setNeuralThreatMap(neuralMap);
      }
    };
    analyze();
    return () => { isMounted = false; };
  }, [board, role, difficulty, analysisMode, turnPlayer, roleRed, roleBlue, engineType, game.scores, game.actionPoints, game.round, game.set, game.capturedPieces]);

  const activeThreatMap = engineType === 'neural' ? neuralThreatMap : threatMap;

  useEffect(() => {
    if (!analysisMode) {
      setMoveClassification(null);
      return;
    }
    
    let beforeState = null;
    let afterState = null;

    if (reviewIndex === null) {
      if (history.past.length === 0) return;
      beforeState = history.past[history.past.length - 1];
      afterState = game.liveState || game;
    } else {
      if (reviewIndex === 0) {
        setMoveClassification(null);
        return;
      }
      beforeState = history.past[reviewIndex - 1];
      afterState = history.past[reviewIndex];
    }

    if (!beforeState || !afterState) {
      setMoveClassification(null);
      return;
    }

    const actorPlayer = beforeState.turnPlayer;
    const actorRole = actorPlayer === 'red' ? beforeState.roleRed : beforeState.roleBlue;
    const difficultyToUse = engineType === 'neural' ? 'neural' : (difficulty || 'hard');

    let isMounted = true;
    const analyzeMove = async () => {
      setIsAnalyzing(true);
      try {
        const beforeAnalysis = await getBoardAnalysisAsync(beforeState.board, actorRole, difficultyToUse, beforeState, actorPlayer);
        const afterAnalysis = await getBoardAnalysisAsync(afterState.board, actorRole, difficultyToUse, afterState, actorPlayer);
        
        if (isMounted) {
          const classification = classifyMove(beforeAnalysis.totalScore, afterAnalysis.totalScore, actorRole);
          setMoveClassification(classification);
        }
      } catch (e) {
        console.error(e);
      } finally {
        if (isMounted) setIsAnalyzing(false);
      }
    };
    analyzeMove();
    return () => { isMounted = false; };
  }, [reviewIndex, analysisMode, history.past, difficulty, engineType, game]);

  const [engineLines, setEngineLines] = useState([]);

  useEffect(() => {
    let isMounted = true;
    if (!analysisMode) {
      if (isMounted) setEngineLines([]);
      return;
    }
    const fetchLines = async () => {
      try {
        const difficultyToUse = engineType === 'neural' ? 'neural' : (difficulty || 'medium');
        const lines = await getBotEngineLinesAsync(board, turnPlayer, game.actionPoints || 2, difficultyToUse, game);
        if (isMounted) setEngineLines(lines);
      } catch (e) {
        console.error("Failed to fetch engine lines", e);
      }
    };
    fetchLines();
    return () => { isMounted = false; };
  }, [board, turnPlayer, difficulty, game, analysisMode, engineType]);

  const pieceThreats = React.useMemo(() => {
    if (!analysisMode) return [];
    return getPieceThreatLevels(board);
  }, [board, analysisMode]);

  const startOfTurnThreats = React.useMemo(() => {
    if (!analysisMode || history.past.length === 0) return [];
    
    const activeIndex = reviewIndex !== null ? reviewIndex : history.past.length - 1;
    let startState = null;
    
    for (let i = activeIndex; i >= 0; i--) {
      // Look for the boundary of a turn (roll dice just happened, or it's not playing phase)
      if (!history.past[i].hasRolledDice || history.past[i].phase !== 'playing') {
        if (i + 1 <= activeIndex && history.past[i + 1]) {
          startState = history.past[i + 1];
        } else {
          startState = history.past[i];
        }
        break;
      }
    }
    if (!startState) startState = game.liveState || game;
    return getPieceThreatLevels(startState.board);
  }, [history.past, reviewIndex, game, analysisMode]);



  useEffect(() => {
    if (customData?.laserFired) {
      setShowLaserBeam(true);
      const timer = setTimeout(() => {
        setShowLaserBeam(false);
      }, 1500);
      return () => clearTimeout(timer);
    } else {
      setShowLaserBeam(false);
    }
  }, [customData?.laserFired, logs?.length]);

  const handleDragStart = (e, blockType) => {
    e.dataTransfer.setData('text/plain', JSON.stringify({ source: 'palette', blockType }));
    window.draggedItem = { source: 'palette', blockType };
  };

  const handlePaletteClick = (blockType) => {
    setSelectedCell(null); // Clear board selections when selecting from palette
    setSelectedPaletteBlock((curr) => (curr === blockType ? null : blockType));
  };

  const getBlockColor = (type) => {
    switch (type) {
      case BLOCK_TYPES.BLOCK_20: return '#00f0ff';
      case BLOCK_TYPES.BLOCK_30: return '#ffcc00';
      case BLOCK_TYPES.BLOCK_50: return '#b026ff';
      case BLOCK_TYPES.BLOCK_LAZER: return '#ff003c';
      default: return '#ffffff';
    }
  };

  const laserPath = customData?.laserPath || [];
  const lazerPos = customData?.lazerPos;

  const { values = [1, 1], isRolling = false, lastRoller = null } = dice || {};

  const getStatusText = () => {
    if (phase === 'setup-defender') return 'STATUS: Defender Placing Point Pieces';
    if (phase === 'setup-attacker') return 'STATUS: Attacker Placing LAZER';
    if (phase === 'playing') {
      const activePlayerColor = roleRed === turnPlayer ? 'red' : 'blue';
      if (mode === 'bot') {
        return activePlayerColor === 'blue' ? 'STATUS: Computer Turn' : 'STATUS: Your Turn';
      } else if (mode === 'local') {
        return `STATUS: Player ${activePlayerColor === 'red' ? '1' : '2'} Turn (${turnPlayer.toUpperCase()})`;
      }
      return `STATUS: ${activePlayerColor === role ? 'Your Turn' : 'Opponent Turn'}`;
    }
    return `STATUS: ${phase.toUpperCase()}`;
  };

  const getVisiblePaletteKeys = () => {
    if (phase === 'setup-defender') {
      const placedPieces = new Set();
      for (let r = 0; r < board.length; r++) {
        for (let c = 0; c < board[r].length; c++) {
          const cell = board[r][c];
          if (cell) placedPieces.add(cell.type);
        }
      }
      const keys = [];
      if (!placedPieces.has('block-20')) keys.push('BLOCK_20');
      if (!placedPieces.has('block-30')) keys.push('BLOCK_30');
      if (!placedPieces.has('block-50')) keys.push('BLOCK_50');
      return keys;
    }
    if (phase === 'challenge-setup') {
      const hasPlacedChallengedPiece = board.some(row => row.some(cell => cell && cell.type === challengedPiece));
      if (hasPlacedChallengedPiece) return [];
      
      if (challengedPiece === 'block-20') return ['BLOCK_20'];
      if (challengedPiece === 'block-30') return ['BLOCK_30'];
      if (challengedPiece === 'block-50') return ['BLOCK_50'];
    }
    if (phase === 'setup-attacker') {
      const hasPlacedLazer = board.some(row => row.some(cell => cell && cell.type === 'block-lazer'));
      if (hasPlacedLazer) return [];
      return ['BLOCK_LAZER'];
    }
    return []; // No palette elements during gameplay rounds
  };

  const activePlayerColor = phase === 'setup-defender' || phase === 'challenge-setup'
    ? (roleRed === 'defender' ? 'red' : 'blue')
    : phase === 'setup-attacker'
      ? (roleRed === 'attacker' ? 'red' : 'blue')
      : (roleRed === turnPlayer ? 'red' : 'blue');

  const isLocalTurn = mode === 'local'
    ? true
    : (mode === 'tutorial' || mode === 'bot')
      ? activePlayerColor === 'red'  // player is always RED; bot is BLUE
      : (mode === 'online' && role === activePlayerColor);

  const renderSetupBanner = () => {
    if (phase === 'setup-defender' || phase === 'challenge-setup') {
      const isMyTurn = (mode === 'local') ? true : (mode === 'bot' ? (roleRed === 'defender') : (roleRed === 'defender' ? role === 'red' : role === 'blue'));
      const text = phase === 'challenge-setup' ? 'CHALLENGE SETUP: Drag and place the challenged piece onto the grid.' : 'DEFENDER SETUP: Drag and place 3 Point Pieces onto the grid (Corners and Mirror stands are blocked).';
      return (
        <div style={{ background: 'rgba(0, 240, 255, 0.08)', border: '1px solid var(--neon-blue)', padding: '10px 16px', borderRadius: '8px', color: 'var(--neon-blue)', fontSize: '0.85rem', fontWeight: 'bold', width: '100%', textAlign: 'center', marginBottom: '16px', textShadow: '0 0 4px var(--neon-blue-glow)' }}>
          {isMyTurn ? text : 'WAITING: Defender is placing point pieces...'}
        </div>
      );
    }

    if (phase === 'setup-attacker') {
      const isMyTurn = (mode === 'local') ? true : (mode === 'bot' ? (roleRed === 'attacker') : (roleRed === 'attacker' ? role === 'red' : role === 'blue'));
      
      return (
        <div style={{ background: 'rgba(255, 42, 133, 0.08)', border: '1px solid var(--neon-red)', padding: '10px 16px', borderRadius: '8px', color: 'var(--neon-red)', fontSize: '0.85rem', fontWeight: 'bold', width: '100%', textAlign: 'center', marginBottom: '16px', textShadow: '0 0 4px var(--neon-red-glow)' }}>
          {isMyTurn ? 'ATTACKER SETUP: Drag and place the LAZER Piece on one of the 4 corner squares. Tap it to rotate facing direction.' : 'WAITING: Attacker is placing LAZER piece...'}
        </div>
      );
    }

    return null;
  };

  const renderOverlay = () => {
    // 1. TOSS PHASE
    if (phase === 'toss' || phase === 'toss-result') {
      const isRedRolled = tossRolls.red !== null && tossRolls.red !== 'rolling';
      const isBlueRolled = tossRolls.blue !== null && tossRolls.blue !== 'rolling';
      
      let canRoll = false;
      let btnText = 'ROLL DICE';
      let btnClass = 'blue';

      if (phase === 'toss') {
        if (mode === 'local') {
          canRoll = tossRolls.red === null || (isRedRolled && tossRolls.blue === null);
          btnText = tossRolls.red === null ? 'RED: ROLL DICE' : 'BLUE: ROLL DICE';
          btnClass = tossRolls.red === null ? 'red' : 'blue';
        } else if (mode === 'bot' || mode === 'tutorial') {
          canRoll = tossRolls.red === null;
          btnText = 'ROLL DICE';
          btnClass = 'red';
        } else if (mode === 'online') {
          canRoll = (role === 'red' && tossRolls.red === null) || (role === 'blue' && tossRolls.blue === null);
          btnText = 'ROLL DICE';
          btnClass = role === 'red' ? 'red' : 'blue';
        }
      }

      return (
        <div className="modal-overlay">
          <div className="modal-content glass-panel" style={{ maxWidth: '450px' }}>
            <h2 className="modal-title glow-text-blue">Roll for Toss</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '10px' }}>
              Roll to see who wins the toss and chooses their role!
            </p>
            
            <div style={{ display: 'flex', gap: '20px', margin: '20px 0', justifyContent: 'center' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--neon-red)', fontWeight: 'bold' }}>RED ROLL</div>
                <div className={`dice-visual red ${tossRolls.red === 'rolling' ? 'rolling' : ''}`} style={{ marginTop: '8px' }}>
                  {tossRolls.red === 'rolling' ? '?' : (tossRolls.red || '?')}
                </div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--neon-blue)', fontWeight: 'bold' }}>BLUE ROLL</div>
                <div className={`dice-visual blue ${tossRolls.blue === 'rolling' ? 'rolling' : ''}`} style={{ marginTop: '8px' }}>
                  {tossRolls.blue === 'rolling' ? '?' : (tossRolls.blue || '?')}
                </div>
              </div>
            </div>

            {canRoll && (
              <button 
                className={`cyber-button ${btnClass}`} 
                onClick={rollToss} 
                style={{ 
                  width: '100%', 
                  marginBottom: (phase === 'toss' && tossRolls.red === null && tossRolls.blue === null) ? '10px' : '0',
                  animation: mode === 'tutorial' && tutorialStep?.highlightButton === 'roll-toss' ? 'afkPulse 1s infinite' : 'none',
                  boxShadow: mode === 'tutorial' && tutorialStep?.highlightButton === 'roll-toss' ? '0 0 15px var(--neon-blue)' : undefined
                }}>
                {btnText}
              </button>
            )}
            {phase === 'toss' && tossRolls.red === null && tossRolls.blue === null && (
              <button className="cyber-button" onClick={disconnect} style={{ width: '100%' }}>
                BACK
              </button>
            )}
            {!canRoll && phase === 'toss' && mode === 'online' && (
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Waiting for opponent to roll...
              </p>
            )}
            {!canRoll && phase === 'toss' && mode === 'local' && (
              <p style={{ fontSize: '0.8rem', color: 'var(--neon-blue)', fontWeight: 'bold', marginTop: '10px' }}>
                Rolling...
              </p>
            )}
            {phase === 'toss-result' && (
              <p style={{ fontSize: '0.9rem', color: 'var(--neon-blue)', fontWeight: 'bold', marginTop: '10px' }}>
                Evaluating results...
              </p>
            )}
          </div>
        </div>
      );
    }

    // 2. ROLE SELECTION
    if (phase === 'role-selection') {
      const isTossWinnerLocal = (mode === 'local')
        ? true
        : ((mode === 'bot' || mode === 'tutorial') ? (tossWinner === 'red') : (tossWinner === role));

      return (
        <div className="modal-overlay">
          <div className="modal-content glass-panel" style={{ maxWidth: '450px' }}>
            <h2 className="modal-title glow-text-red">Choose Role</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              <span style={{ color: tossWinner === 'red' ? 'var(--neon-red)' : 'var(--neon-blue)', fontWeight: 'bold' }}>{tossWinner.toUpperCase()}</span> won the toss! Choose your role:
            </p>

            {isTossWinnerLocal ? (
              <div style={{ display: 'flex', gap: '16px', marginTop: '20px', width: '100%' }}>
                <button 
                  className="cyber-button red" 
                  onClick={() => selectRole('attacker')} 
                  style={{ 
                    flex: 1,
                    animation: mode === 'tutorial' && tutorialStep?.highlightButton === 'select-role' ? 'afkPulse 1s infinite' : 'none',
                    boxShadow: mode === 'tutorial' && tutorialStep?.highlightButton === 'select-role' ? '0 0 15px var(--neon-red)' : undefined
                  }}
                >
                  ATTACKER
                </button>
                <button 
                  className="cyber-button blue" 
                  onClick={() => selectRole('defender')} 
                  style={{ 
                    flex: 1,
                    animation: mode === 'tutorial' && tutorialStep?.highlightButton === 'select-role' ? 'afkPulse 1s infinite' : 'none',
                    boxShadow: mode === 'tutorial' && tutorialStep?.highlightButton === 'select-role' ? '0 0 15px var(--neon-blue)' : undefined
                  }}
                >
                  DEFENDER
                </button>
              </div>
            ) : (
              <p style={{ marginTop: '20px', color: 'var(--neon-blue)', fontWeight: 'bold', animation: 'afkPulse 1.5s infinite' }}>
                Opponent is selecting role...
              </p>
            )}
          </div>
        </div>
      );
    }

    // 3. CHALLENGE DECLARATION
    if (phase === 'challenge-declaration') {
      const attColor = roleRed === 'attacker' ? 'red' : 'blue';
      const isAttackerLocal = (mode === 'local')
        ? true
        : (mode === 'bot' ? (attColor === 'red') : (attColor === role));

      return (
        <div className="modal-overlay">
          <div className="modal-content glass-panel" style={{ maxWidth: '450px' }}>
            <h2 className="modal-title glow-text-blue">Declare Challenge?</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
              All point pieces captured! Attacker can declare a challenge on one captured piece to gain extra points.
            </p>

            {isAttackerLocal ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '20px', width: '100%' }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textAlign: 'left' }}>SELECT PIECE TO CHALLENGE:</div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {[...new Set(capturedPieces)].map((type, idx) => (
                    <button 
                      key={idx} 
                      className="cyber-button" 
                      onClick={() => declareChallenge(true, type)}
                      style={{ flex: 1, fontSize: '0.8rem', padding: '10px' }}
                    >
                      {type.split('-')[1]} Pts
                    </button>
                  ))}
                </div>
                <button className="cyber-button red" onClick={() => declareChallenge(false, null)} style={{ marginTop: '8px' }}>
                  DECLINE & END SET
                </button>
              </div>
            ) : (
              <p style={{ marginTop: '20px', color: 'var(--neon-blue)', fontWeight: 'bold', animation: 'afkPulse 1.5s infinite' }}>
                Attacker is deciding on challenge...
              </p>
            )}
          </div>
        </div>
      );
    }

    // 4. CHALLENGE TOSS
    if (phase === 'challenge-toss' || phase === 'challenge-toss-result') {
      const isRedRolled = challengeTossRolls.red !== null && challengeTossRolls.red !== 'rolling';
      const isBlueRolled = challengeTossRolls.blue !== null && challengeTossRolls.blue !== 'rolling';

      let canRoll = false;
      let btnText = 'ROLL DICE';
      let btnClass = 'blue';

      if (phase === 'challenge-toss') {
        if (mode === 'local') {
          canRoll = challengeTossRolls.red === null || (isRedRolled && challengeTossRolls.blue === null);
          btnText = challengeTossRolls.red === null ? 'RED: ROLL DICE' : 'BLUE: ROLL DICE';
          btnClass = challengeTossRolls.red === null ? 'red' : 'blue';
        } else if (mode === 'bot' || mode === 'tutorial') {
          canRoll = challengeTossRolls.red === null;
          btnText = 'ROLL DICE';
          btnClass = 'red';
        } else if (mode === 'online') {
          canRoll = (role === 'red' && challengeTossRolls.red === null) || (role === 'blue' && challengeTossRolls.blue === null);
          btnText = 'ROLL DICE';
          btnClass = role === 'red' ? 'red' : 'blue';
        }
      }

      return (
        <div className="modal-overlay">
          <div className="modal-content glass-panel" style={{ maxWidth: '450px' }}>
            <h2 className="modal-title glow-text-red">Challenge Toss</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              Roll for Challenge! Attacker needs a higher roll to win the challenge.
            </p>

            <div style={{ display: 'flex', gap: '20px', margin: '20px 0', justifyContent: 'center' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--neon-red)', fontWeight: 'bold' }}>RED ROLL</div>
                <div className={`dice-visual red ${challengeTossRolls.red === 'rolling' ? 'rolling' : ''}`} style={{ marginTop: '8px' }}>
                  {challengeTossRolls.red === 'rolling' ? '?' : (challengeTossRolls.red || '?')}
                </div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--neon-blue)', fontWeight: 'bold' }}>BLUE ROLL</div>
                <div className={`dice-visual blue ${challengeTossRolls.blue === 'rolling' ? 'rolling' : ''}`} style={{ marginTop: '8px' }}>
                  {challengeTossRolls.blue === 'rolling' ? '?' : (challengeTossRolls.blue || '?')}
                </div>
              </div>
            </div>

            {canRoll && (
              <button className={`cyber-button ${btnClass}`} onClick={rollChallengeToss} style={{ width: '100%' }}>
                {btnText}
              </button>
            )}
            {!canRoll && phase === 'challenge-toss' && mode === 'online' && (
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Waiting for opponent to roll...
              </p>
            )}
            {!canRoll && phase === 'challenge-toss' && mode === 'local' && (
              <p style={{ fontSize: '0.8rem', color: 'var(--neon-red)', fontWeight: 'bold' }}>
                Rolling...
              </p>
            )}
            {phase === 'challenge-toss-result' && (
              <p style={{ fontSize: '0.9rem', color: 'var(--neon-red)', fontWeight: 'bold' }}>
                Evaluating challenge...
              </p>
            )}
          </div>
        </div>
      );
    }

    // 5. GAME OVER
    if (phase === 'game-over' && reviewIndex === null) {
      const redScore = scores.red;
      const blueScore = scores.blue;
      const finalWinner = redScore > blueScore ? 'RED PLAYER' : blueScore > redScore ? 'BLUE PLAYER' : 'DRAW';

      return (
        <div className="modal-overlay">
          <div className="modal-content glass-panel" style={{ maxWidth: '450px', padding: '40px' }}>
            <h2 className="modal-title glow-text-red" style={{ fontSize: '2.5rem' }}>Game Over</h2>
            <p className="glow-text-blue" style={{ fontSize: '1.25rem', fontWeight: 'bold', margin: '15px 0' }}>
              {finalWinner === 'DRAW' ? "IT'S A DRAW!" : `${finalWinner} WINS!`}
            </p>
            <div style={{ margin: '20px 0', background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)', width: '100%' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ color: 'var(--neon-red)', fontWeight: 'bold' }}>RED PLAYER:</span>
                <span style={{ fontWeight: 'bold' }}>{redScore} pts</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--neon-blue)', fontWeight: 'bold' }}>BLUE PLAYER:</span>
                <span style={{ fontWeight: 'bold' }}>{blueScore} pts</span>
              </div>
            </div>

            {mode === 'bot' && game.eloProcessed && (
              <div style={{ marginBottom: '20px', padding: '12px', backgroundColor: 'rgba(255, 204, 0, 0.1)', border: '1px solid rgba(255, 204, 0, 0.3)', borderRadius: '8px' }}>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', textTransform: 'uppercase', marginBottom: '4px' }}>Rating Update</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#ffcc00' }}>
                  {game.newElo} ELO 
                  <span style={{ fontSize: '0.9rem', marginLeft: '8px', color: game.eloDiff >= 0 ? '#39ff14' : 'var(--neon-red)' }}>
                    ({game.eloDiff >= 0 ? '+' : ''}{game.eloDiff})
                  </span>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px' }}>
              <button 
                className="cyber-button blue" 
                onClick={() => {
                  setAnalysisMode(true);
                  const firstPlayingIndex = history.past.findIndex(state => state.phase === 'playing');
                  setReviewIndex(firstPlayingIndex !== -1 ? firstPlayingIndex : 0);
                }} 
                style={{ flex: 1 }}
              >
                GAME REVIEW
              </button>
              <button className="cyber-button" onClick={clearWorkspace} style={{ flex: 1, borderColor: 'var(--neon-blue)', color: 'var(--neon-blue)' }}>
                PLAY AGAIN
              </button>
              <button 
                className="cyber-button" 
                onClick={onExitTutorial || disconnect} 
                style={{ 
                  flex: 1,
                  animation: mode === 'tutorial' && tutorialStep?.highlightButton === 'leave-game' ? 'afkPulse 1.2s infinite' : 'none',
                  border: mode === 'tutorial' && tutorialStep?.highlightButton === 'leave-game' ? '2px solid var(--neon-blue)' : undefined,
                  boxShadow: mode === 'tutorial' && tutorialStep?.highlightButton === 'leave-game' ? '0 0 15px var(--neon-blue)' : undefined
                }}
              >
                LEAVE
              </button>
            </div>
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="game-layout">
      {/* Sidebar Left: Connection, Controls, Actions */}
      <div className="sidebar-panel sidebar-left glass-panel" style={{ justifyContent: 'flex-start' }}>
        <div className="game-controls-header">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: '1.2rem', marginBottom: '8px' }}>Game Controls</h2>
            <button 
              className={`cyber-button ${analysisMode ? 'blue' : ''}`}
              style={{ fontSize: '0.65rem', padding: '4px 8px' }}
              onClick={() => setAnalysisMode(!analysisMode)}
            >
              {analysisMode ? 'HIDE ANALYSIS' : 'ANALYSIS'}
            </button>
          </div>
          <div>
            <div style={{ fontSize: '0.85rem', color: role === 'red' ? 'var(--neon-red)' : 'var(--neon-blue)', fontWeight: 'bold' }}>
              ROLE: {role ? role.toUpperCase() : ''}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
              {getStatusText()}
            </div>
          </div>
        </div>

        {/* Dice Rolling Panel */}
        {phase === 'playing' && (
          <div className="dice-container" style={{ margin: '10px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', gap: '8px' }}>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', width: '100%' }}>
              <div className={`dice-visual ${isRolling ? 'rolling' : ''} ${lastRoller === 'red' ? 'red' : lastRoller === 'blue' ? 'blue' : ''}`}>
                {isRolling ? '?' : values[0]}
              </div>
              <div className={`dice-visual ${isRolling ? 'rolling' : ''} ${lastRoller === 'red' ? 'red' : lastRoller === 'blue' ? 'blue' : ''}`}>
                {isRolling ? '?' : values[1]}
              </div>
            </div>
            {!hasRolledDice && isLocalTurn && (
              <button 
                className="cyber-button"
                onClick={rollDice}
                disabled={isRolling}
                style={{ 
                  width: '100%', fontSize: '0.8rem', fontWeight: 'bold', letterSpacing: '0.05em', 
                  animation: mode === 'tutorial' && tutorialStep?.highlightButton === 'roll-dice' ? 'afkPulse 1.2s infinite' : 'none',
                  border: mode === 'tutorial' && tutorialStep?.highlightButton === 'roll-dice' ? '2px solid var(--neon-blue)' : undefined,
                  boxShadow: mode === 'tutorial' && tutorialStep?.highlightButton === 'roll-dice' ? '0 0 15px var(--neon-blue)' : undefined
                }}
              >
                ROLL AP DICE
              </button>
            )}
          </div>
        )}

        {/* Setup Defender Panel */}
        {(phase === 'setup-defender' || phase === 'challenge-setup') && isLocalTurn && (() => {
          const placedCount = board.reduce((count, row) => count + row.filter(cell => cell && ['block-20', 'block-30', 'block-50'].includes(cell.type)).length, 0);
          const requiredCount = phase === 'challenge-setup' ? 1 : 3;
          if (placedCount === requiredCount) {
            return (
              <div className="setup-panel" style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%', marginTop: '10px' }}>
                <button
                  className="cyber-button blue"
                  onClick={() => executeAction({ type: 'confirm-setup' })}
                  style={{ 
                    width: '100%', fontSize: '0.8rem', fontWeight: 'bold',
                    animation: mode === 'tutorial' && tutorialStep?.highlightButton === 'confirm-defender' ? 'afkPulse 1.2s infinite' : 'none',
                    border: mode === 'tutorial' && tutorialStep?.highlightButton === 'confirm-defender' ? '2px solid var(--neon-blue)' : undefined,
                    boxShadow: mode === 'tutorial' && tutorialStep?.highlightButton === 'confirm-defender' ? '0 0 15px var(--neon-blue)' : undefined
                  }}
                >
                  CONFIRM POINT PLACEMENTS
                </button>
              </div>
            );
          }
          return null;
        })()}

        {/* Setup Attacker Panel */}
        {phase === 'setup-attacker' && isLocalTurn && board.some(row => row.some(cell => cell && cell.type === 'block-lazer')) && (
          <div className="setup-panel" style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                className="cyber-button"
                onClick={() => executeAction({ type: 'rotate', dir: 'ccw' })}
                style={{ flex: 1, fontSize: '0.75rem', padding: '10px 0' }}
              >
                ROTATE CCW
              </button>
              <button
                className="cyber-button"
                onClick={() => executeAction({ type: 'rotate', dir: 'cw' })}
                style={{ flex: 1, fontSize: '0.75rem', padding: '10px 0' }}
              >
                ROTATE CW
              </button>
            </div>
            <button
              className="cyber-button red"
              onClick={() => executeAction({ type: 'confirm-setup' })}
              style={{ 
                width: '100%', fontSize: '0.8rem', fontWeight: 'bold',
                animation: mode === 'tutorial' && tutorialStep?.highlightButton === 'confirm-attacker' ? 'afkPulse 1.2s infinite' : 'none',
                border: mode === 'tutorial' && tutorialStep?.highlightButton === 'confirm-attacker' ? '2px solid var(--neon-red)' : undefined,
                boxShadow: mode === 'tutorial' && tutorialStep?.highlightButton === 'confirm-attacker' ? '0 0 15px var(--neon-red)' : undefined
              }}
            >
              CONFIRM LAZER PLACEMENT
            </button>
          </div>
        )}

        {/* Action Panel */}
        {phase === 'playing' && hasRolledDice && isLocalTurn && (
          <div className="action-panel" style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
            {turnPlayer === 'attacker' && (
              <>
                <button
                  className="cyber-button red"
                  onClick={() => executeAction({ type: 'laser-press' })}
                  disabled={actionPoints <= 0}
                  style={{ 
                    width: '100%', fontSize: '0.8rem', fontWeight: 'bold',
                    animation: mode === 'tutorial' && tutorialStep?.highlightButton === 'fire-lazer' ? 'afkPulse 1.2s infinite' : 'none',
                    border: mode === 'tutorial' && tutorialStep?.highlightButton === 'fire-lazer' ? '2px solid var(--neon-red)' : undefined,
                    boxShadow: mode === 'tutorial' && tutorialStep?.highlightButton === 'fire-lazer' ? '0 0 15px var(--neon-red)' : undefined
                  }}
                >
                  PRESS LAZER
                </button>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    className="cyber-button"
                    onClick={() => rotateBlock(0, 0, 'ccw')}
                    disabled={actionPoints <= 0}
                    style={{ flex: 1, fontSize: '0.75rem', padding: '10px 0' }}
                  >
                    ROTATE CCW
                  </button>
                  <button
                    className="cyber-button"
                    onClick={() => rotateBlock(0, 0, 'cw')}
                    disabled={actionPoints <= 0}
                    style={{ flex: 1, fontSize: '0.75rem', padding: '10px 0' }}
                  >
                    ROTATE CW
                  </button>
                </div>
              </>
            )}

            <div style={{ display: 'flex', gap: '6px', marginTop: '10px' }}>
              <button
                className="cyber-button"
                onClick={undo}
                disabled={!canUndo}
                style={{ flex: 1, fontSize: '0.75rem', padding: '10px 0', borderColor: 'var(--neon-blue)', color: 'var(--neon-blue)', opacity: canUndo ? 1 : 0.5 }}
              >
                UNDO
              </button>
              <button
                className="cyber-button"
                onClick={redo}
                disabled={!canRedo}
                style={{ flex: 1, fontSize: '0.75rem', padding: '10px 0', borderColor: 'var(--neon-blue)', color: 'var(--neon-blue)', opacity: canRedo ? 1 : 0.5 }}
              >
                REDO
              </button>
            </div>

            <button
              className="cyber-button"
              onClick={endTurn}
              style={{ 
                width: '100%', fontSize: '0.8rem', marginTop: '10px', borderColor: 'var(--text-secondary)', color: 'var(--text-secondary)',
                animation: mode === 'tutorial' && tutorialStep?.highlightButton === 'end-turn' ? 'afkPulse 1.2s infinite' : 'none',
                border: mode === 'tutorial' && tutorialStep?.highlightButton === 'end-turn' ? '2px solid var(--neon-blue)' : undefined,
                boxShadow: mode === 'tutorial' && tutorialStep?.highlightButton === 'end-turn' ? '0 0 15px var(--neon-blue)' : undefined
              }}
            >
              END TURN
            </button>
          </div>
        )}

        <div className="control-buttons-wrapper" style={{ marginTop: 'auto' }}>
          <button
            className="cyber-button red"
            onClick={clearWorkspace}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
          >
            <Trash2 size={14} /> RESET GAME
          </button>

          <button
            className="cyber-button"
            onClick={onExitTutorial || disconnect}
            style={{ 
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              animation: mode === 'tutorial' && tutorialStep?.highlightButton === 'leave-game' ? 'afkPulse 1.2s infinite' : 'none',
              border: mode === 'tutorial' && tutorialStep?.highlightButton === 'leave-game' ? '2px solid var(--neon-blue)' : undefined,
              boxShadow: mode === 'tutorial' && tutorialStep?.highlightButton === 'leave-game' ? '0 0 15px var(--neon-blue)' : undefined
            }}
          >
            <LogOut size={14} /> LEAVE
          </button>
        </div>
      </div>

      {/* Center Panel: Collaborative Grid */}
      <div className="main-board-panel" style={{ position: 'relative' }}>
        
        {/* Render Analysis Panel */}
        {analysisMode && (
          <AnalysisPanel 
            data={boardAnalysis} 
            history={game.history}
            dice={game.dice}
            threatMap={activeThreatMap}
            lazerPos={lazerPos}
            engineLines={engineLines}
            pieceThreats={pieceThreats}
            showHeatmap={showHeatmap}
            showGhostRays={showGhostRays}
            showPieceThreats={showPieceThreats}
            showQHeatmap={showQHeatmap}
            startOfTurnThreats={startOfTurnThreats}
            onClose={() => setAnalysisMode(false)}
            reviewIndex={reviewIndex}
            stepForward={stepForward}
            stepBackward={stepBackward}
            moveClassification={moveClassification}
            maxHistoryIndex={game.history.past.length - 1}
            phase={reviewIndex !== null && game.history.past[reviewIndex] ? game.history.past[reviewIndex].phase : phase}
            onHighlightMove={(r, c) => {
              if (highlightedCell && highlightedCell.r === r && highlightedCell.c === c) {
                setHighlightedCell(null); // toggle off
              } else {
                setHighlightedCell({ r, c });
              }
            }}
            engineType={engineType}
            setEngineType={setEngineType}
            isAnalyzing={isAnalyzing}
            phase={phase}
            challengeRecommendation={challengeRecommendation}
          />
        )}

        <div className="hud-header">
          {/* Host Info */}
          <div className={`hud-player red ${roleRed === turnPlayer && phase === 'playing' ? 'active' : ''}`} style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
            <div className="player-dot red" />
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 'bold' }}>
                {roleRed ? roleRed.toUpperCase() : 'HOST'}
              </div>
              <div style={{ fontSize: '0.95rem', fontWeight: 'bold', marginBottom: '2px' }}>
                {playerName}
              </div>
            </div>
            <div style={{ fontSize: '1.25rem', fontWeight: '800', color: 'var(--neon-red)', marginLeft: '10px', textShadow: '0 0 8px var(--neon-red-glow)' }}>
              {scores.red} pts
            </div>
          </div>

          <div className="font-display" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
            <span style={{ fontSize: '1rem', color: 'var(--neon-blue)', textShadow: '0 0 8px var(--neon-blue-glow)' }}>LAZER SHOWDOWN</span>
          </div>

          {/* Guest Info */}
          <div className={`hud-player blue ${roleBlue === turnPlayer && phase === 'playing' ? 'active' : ''}`} style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
            <div style={{ fontSize: '1.25rem', fontWeight: '800', color: 'var(--neon-blue)', marginRight: '10px', textShadow: '0 0 8px var(--neon-blue-glow)' }}>
              {scores.blue} pts
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 'bold', textAlign: 'right' }}>
                {roleBlue ? roleBlue.toUpperCase() : 'GUEST'}
              </div>
              <div style={{ fontSize: '0.95rem', fontWeight: 'bold', textAlign: 'right', marginBottom: '2px' }}>
                {opponentName}
              </div>
            </div>
            <div className="player-dot blue" />
          </div>
        </div>

        {/* Set & Round HUD Panel (Central Pill) */}
        {phase !== 'toss' && phase !== 'role-selection' && phase !== 'game-over' && (
          <div className="hud-panel-horizontal" style={{
            display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '16px',
            background: 'linear-gradient(90deg, rgba(0,0,0,0.6) 0%, rgba(30,30,40,0.8) 50%, rgba(0,0,0,0.6) 100%)', 
            border: '1px solid rgba(255,255,255,0.15)',
            padding: '8px 24px', borderRadius: '999px', margin: '0 auto 12px auto', width: 'fit-content',
            boxShadow: '0 4px 16px rgba(0,0,0,0.6), inset 0 0 12px rgba(255,255,255,0.05)',
            backdropFilter: 'blur(8px)'
          }}>
            {/* Set Indicator */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }} title={`Set ${set} of 2`}>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.7rem', fontWeight: 'bold', letterSpacing: '1px' }}>SET</span>
              <div style={{ display: 'flex', gap: '4px' }}>
                {[1, 2].map(s => (
                  <div key={s} style={{ 
                    width: '10px', height: '10px', borderRadius: '50%', 
                    background: s <= set ? 'var(--neon-blue)' : 'rgba(255,255,255,0.15)',
                    boxShadow: s <= set ? '0 0 8px var(--neon-blue)' : 'none',
                    transition: 'all 0.3s ease'
                  }} />
                ))}
              </div>
            </div>

            <div style={{ width: '1px', height: '16px', background: 'rgba(255,255,255,0.15)' }} />

            {/* Round Indicator */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }} title={`Round ${round} of 3`}>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.7rem', fontWeight: 'bold', letterSpacing: '1px' }}>RND</span>
              <div style={{ display: 'flex', gap: '4px' }}>
                {[1, 2, 3].map(r => (
                  <div key={r} style={{ 
                    width: '10px', height: '10px', transform: 'rotate(45deg)', 
                    background: r <= round ? 'var(--neon-red)' : 'rgba(255,255,255,0.15)',
                    boxShadow: r <= round ? '0 0 8px var(--neon-red)' : 'none',
                    transition: 'all 0.3s ease'
                  }} />
                ))}
              </div>
            </div>

            <div style={{ width: '1px', height: '16px', background: 'rgba(255,255,255,0.15)' }} />

            {/* Turn Indicator */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }} title={`${turnPlayer}'s turn`}>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.7rem', fontWeight: 'bold', letterSpacing: '1px' }}>TURN</span>
              <div style={{ 
                width: '12px', height: '12px', borderRadius: '3px',
                background: activePlayerColor === 'red' ? 'var(--neon-red)' : 'var(--neon-blue)',
                boxShadow: activePlayerColor === 'red' ? '0 0 10px var(--neon-red)' : '0 0 10px var(--neon-blue)',
                transition: 'all 0.3s ease'
              }} />
            </div>

            {phase === 'playing' && (
              <>
                <div style={{ width: '1px', height: '16px', background: 'rgba(255,255,255,0.15)' }} />
                {/* AP Indicator */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }} title={`${actionPoints} Action Points remaining`}>
                  <Zap size={14} color="#39ff14" style={{ filter: 'drop-shadow(0 0 4px #39ff14)' }} />
                  <span style={{ fontWeight: '900', color: '#39ff14', fontSize: '1.1rem', textShadow: '0 0 8px #39ff14' }}>
                    {actionPoints}
                  </span>
                </div>
              </>
            )}
          </div>
        )}

        {/* Full screen blur for intro step */}
        {mode === 'tutorial' && tutorialStep && tutorialStep.blurBackground && (
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            backdropFilter: 'blur(8px)', backgroundColor: 'rgba(5, 10, 20, 0.7)',
            zIndex: 999, pointerEvents: 'none'
          }} />
        )}

        {/* Tutorial Drawer — collapsible, mobile-friendly */}
        {mode === 'tutorial' && tutorialStep && (
          <TutorialDrawer
            tutorialStep={tutorialStep}
            tutorialError={tutorialError}
            onTutorialNext={onTutorialNext}
          />
        )}

        {/* Regular Setup Banner (if not tutorial) */}
        {mode !== 'tutorial' && renderSetupBanner()}

        {/* Board Grid */}
        <Grid
          board={board}
          selectedCell={selectedCell}
          setSelectedCell={setSelectedCell}
          selectedPaletteBlock={selectedPaletteBlock}
          setSelectedPaletteBlock={setSelectedPaletteBlock}
          placeBlock={placeBlock}
          moveBlock={moveBlock}
          rotateBlock={rotateBlock}
          removeBlock={removeBlock}
          laserPath={laserPath}
          lazerPos={lazerPos}
          mode={mode}
          phase={phase}
          isLocalTurn={isLocalTurn}
          roleRed={roleRed}
          role={role}
          activePlayerColor={activePlayerColor}
          reachableCells={selectedCell ? getReachableCells(board, selectedCell.r, selectedCell.c, actionPoints, turnPlayer) : []}
          showLaserBeam={showLaserBeam}
          threatMap={showHeatmap ? activeThreatMap : null}
          possibilityWeb={showGhostRays ? game.possibilityWeb : null}
          engineType={engineType}
          qHeatmapData={showQHeatmap ? qHeatmapData : null}
          highlightedCell={highlightedCell}
          tutorialHighlight={tutorialStep?.highlight}
          tutorialHighlights={tutorialStep?.highlights}
        />

        <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
          <Info size={14} />
          {mode === 'bot' && activePlayerColor === 'blue' && phase === 'playing' ? (
            <span style={{ color: 'var(--neon-blue)', fontWeight: 'bold', animation: 'afkPulse 1s infinite' }}>COMPUTER IS THINKING...</span>
          ) : (
            <span>Setup: Place pieces correctly. Roll Phase: roll dice to get Action Points. Play Phase: move, rotate Lazer, or press Lazer.</span>
          )}
        </div>
      </div>

      {/* Sidebar Right: Palette of Infinite Blocks */}
      {getVisiblePaletteKeys().length > 0 && (
        <div className="sidebar-panel sidebar-right glass-panel">
          <div className="tray-title font-display">Setup inventory</div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '10px' }}>
            {getVisiblePaletteKeys().map((key) => {
            const blockType = BLOCK_TYPES[key];
            const color = getBlockColor(blockType);
            const isSelected = selectedPaletteBlock === blockType;

            const displayName = blockType === BLOCK_TYPES.BLOCK_LAZER
              ? 'Lazer Block'
              : `${blockType.split('-')[1]} Block`;

            const isTutorialTarget = mode === 'tutorial' && tutorialStep && tutorialStep.highlightPalette === blockType;

            let activeStyle = isSelected ? {
              borderColor: color,
              boxShadow: `0 0 12px ${color}66`,
              background: 'rgba(255, 255, 255, 0.05)'
            } : {};

            if (isTutorialTarget && !isSelected) {
              activeStyle = {
                ...activeStyle,
                border: `2px solid ${color}`,
                boxShadow: `0 0 15px ${color}, inset 0 0 10px ${color}`,
                animation: 'afkPulse 1.5s infinite'
              };
            }

            return (
              <div
                key={blockType}
                className="tray-item"
                draggable
                onDragStart={(e) => handleDragStart(e, blockType)}
                onClick={() => handlePaletteClick(blockType)}
                style={{ 
                  flexDirection: 'row', 
                  gap: '16px', 
                  padding: '16px', 
                  cursor: 'grab',
                  ...activeStyle
                }}
              >
                <svg viewBox="0 0 40 40" style={{ width: '32px', height: '32px', flexShrink: 0 }}>
                  <rect
                    x="6"
                    y="6"
                    width="28"
                    height="28"
                    rx="6"
                    fill="none"
                    stroke={color}
                    strokeWidth="3.5"
                  />
                  {blockType === BLOCK_TYPES.BLOCK_LAZER ? (
                    <>
                      <circle cx="20" cy="20" r="5" fill="none" stroke={color} strokeWidth="2" />
                      <line x1="20" y1="15" x2="20" y2="7" stroke={color} strokeWidth="2.5" />
                      <polygon points="20,4 16,9 24,9" fill={color} />
                    </>
                  ) : (
                    <>
                      <rect x="11" y="11" width="18" height="18" rx="3" fill={color} opacity="0.15" />
                      <text
                        x="50%"
                        y="55%"
                        dominantBaseline="middle"
                        textAnchor="middle"
                        fill={color}
                        fontSize="15"
                        fontWeight="900"
                        fontFamily="monospace"
                        letterSpacing="0px"
                      >
                        {blockType === BLOCK_TYPES.BLOCK_20 ? '20' : blockType === BLOCK_TYPES.BLOCK_30 ? '30' : '50'}
                      </text>
                    </>
                  )}
                </svg>
                <div style={{ display: 'flex', flexDirection: 'column', textTransform: 'capitalize' }}>
                  <span style={{ fontWeight: 'bold', fontSize: '0.85rem' }}>{displayName}</span>
                  <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>Tap or drag to place</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      )}

      {/* Overlays (Toss, Challenge, Game Over) */}
      {(!tutorialStep || tutorialStep.expectedAction?.type !== 'next') && renderOverlay()}

      {/* Error alert banner */}
      {error && (
        <div className="error-banner">
          <AlertTriangle size={18} />
          <span>{error}</span>
          <button className="error-close-btn" onClick={clearError}>
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
