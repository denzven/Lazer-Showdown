import React, { useState, useEffect } from 'react';
import { X, Minus, Maximize2, ChevronDown, ChevronRight } from 'lucide-react';
import { Rnd } from 'react-rnd';
import { 
  evaluateBoardAttacker, 
  evaluateBoardDefender, 
  getDefenderCautiousness,
  DEFAULT_WEIGHTS,
  formatActionText,
  getEngineLines,
  applyLightweightAction,
  getBoardState
} from '../core/BotHelpers';
import { getBotSetupAction } from '../core/BotEngine';
import { traceLaserBeam, BLOCK_TYPES } from '../core/Ruleset';

export default function AnalysisPanel({ 
  gameState,
  reviewIndex,
  maxHistoryIndex,
  stepForward,
  stepBackward,
  engineLines: currentEngineLines,
  onHighlightMove,
  onBotMindsUpdate,
  onSimulationUpdate,
  isAnalyzing = false,
  onClose
}) {
  const board = gameState?.board;
  const [isMinimized, setIsMinimized] = useState(false);
  const [panelState, setPanelState] = useState({
    x: 20,
    y: typeof window !== 'undefined' ? window.innerHeight - 550 : 20,
    width: 380,
    height: 650
  });
  const [botMinds, setBotMinds] = useState({ attacker: null, defender: null });
  const [currentRole, setCurrentRole] = useState('attacker');
  const [viewingRole, setViewingRole] = useState('attacker');
  const [isSimulating, setIsSimulating] = useState(false);
  const [isMindsExpanded, setIsMindsExpanded] = useState(true);

  // Keep Layout's highlights in sync with the currently viewed role
  useEffect(() => {
    if (botMinds && botMinds[viewingRole]) {
      onBotMindsUpdate?.(botMinds[viewingRole]);
    }
  }, [botMinds, viewingRole, onBotMindsUpdate]);

  useEffect(() => {
    if (!gameState || !board) return;
    
    // Determine whose turn it is in the active state
    let role = gameState.turnPlayer;
    if (gameState.phase === 'setup-attacker') role = 'attacker';
    if (gameState.phase === 'setup-defender' || gameState.phase === 'challenge-setup') role = 'defender';
    // Fallback if turnPlayer was somehow red/blue (legacy handling)
    if (role === 'red') role = gameState.roleRed;
    if (role === 'blue') role = gameState.roleBlue;

    setCurrentRole(role);
    setViewingRole(role); // Default to current player's role
    
    // Evaluate across difficulties asynchronously to avoid locking UI
    let isMounted = true;
    setTimeout(() => {
      if (!isMounted) return;
      const difficulties = ['easy', 'medium', 'hard', 'ga'];
      const minds = { attacker: {}, defender: {} };
      
      for (const r of ['attacker', 'defender']) {
        for (const diff of difficulties) {
          const diffToUse = diff === 'ga' ? 'hard' : diff; // GA usually maps to hard in engine eval
          
          if (gameState.phase.startsWith('setup-')) {
            // Setup phase
            if (r !== role) {
              minds[r][diff] = null; // Only the active player places during their setup turn
            } else {
              const playerColor = role === gameState.roleRed ? 'red' : 'blue';
              
              // Predict the entire setup sequence for the remaining pieces
              const setupSequence = [];
              let currentSetupBoard = board.map(row => row.slice());
              
              for (let i = 0; i < 5; i++) {
                const setupAction = getBotSetupAction(currentSetupBoard, gameState.phase, playerColor, diffToUse);
                if (!setupAction || setupAction.type === 'confirm-setup') break;
                setupSequence.push(setupAction);
                currentSetupBoard = applyLightweightAction(currentSetupBoard, setupAction);
              }

              if (setupSequence.length > 0) {
                 minds[r][diff] = {
                   sequence: setupSequence,
                   score: 0,
                   name: 'Setup Placements'
                 };
              } else {
                 minds[r][diff] = null;
              }
            }
          } else {
            // Playing phase
            const lines = getEngineLines(board, r, diffToUse, gameState);
            minds[r][diff] = lines.length > 0 ? lines[0] : null; // Top line
          }
        }
      }
      
      setBotMinds(minds);
    }, 50);

    return () => { isMounted = false; };
  }, [gameState, board]);



  const handleSimulate = async (sequence) => {
    if (isSimulating) return;
    setIsSimulating(true);
    let currentBoard = board.map(row => row.slice());
    
    // Clear initial bot minds highlight by passing an empty array or letting Layout filter 
    // We don't necessarily need to clear botHighlights as the simulation is a separate concern

    for (const action of sequence) {
      if (action.type === 'laser-press') {
         const { lazerPos, lazerDir } = getBoardState(currentBoard);
         if (lazerPos) {
           const trace = traceLaserBeam(currentBoard, lazerPos, lazerDir);
           onSimulationUpdate?.(currentBoard, { path: trace.path, pos: lazerPos, color: trace.laserColor || '#ff003c' });
           await new Promise(r => setTimeout(r, 800)); // Show beam
           currentBoard = applyLightweightAction(currentBoard, action); // Apply capture
           onSimulationUpdate?.(currentBoard, null); // Hide beam
           await new Promise(r => setTimeout(r, 400));
         }
      } else {
         currentBoard = applyLightweightAction(currentBoard, action);
         onSimulationUpdate?.(currentBoard, null);
         await new Promise(r => setTimeout(r, 600)); // Wait between moves
      }
    }
    
    // Hold final state for 1.2 seconds, then clear
    await new Promise(r => setTimeout(r, 1200));
    onSimulationUpdate?.(null, null);
    setIsSimulating(false);
  };

  const getAdvantage = (scores) => {
    return (scores.red / 5000) - (scores.blue / 300);
  };

  if (!board) return null;

  // Evaluate the board
  const cautiousness = getDefenderCautiousness(board);
  const attackerScore = evaluateBoardAttacker(board, cautiousness, DEFAULT_WEIGHTS.average_tied);
  const defenderScore = evaluateBoardDefender(board, cautiousness, DEFAULT_WEIGHTS.average_tied);
  
  // Calculate advantage (Attacker score scale is roughly 5000, Defender is roughly 300)
  const rawAdvantage = (attackerScore / 5000) - (defenderScore / 300);
  const advantage = Math.max(-10, Math.min(10, rawAdvantage));
  
  const barColor = advantage >= 0 ? '#ff003c' : '#39ff14'; // Red = Attacker, Green = Defender
  
  let interpretation = "Balanced Position";
  if (advantage > 6) interpretation = "Attacker is dominating";
  else if (advantage > 2) interpretation = "Attacker has a strong advantage";
  else if (advantage > 0.5) interpretation = "Attacker is slightly better";
  else if (advantage < -6) interpretation = "Defender is dominating";
  else if (advantage < -2) interpretation = "Defender has a strong advantage";
  else if (advantage < -0.5) interpretation = "Defender is slightly better";

  return (
    <Rnd
      size={isMinimized ? { width: 250, height: 'auto' } : { width: panelState.width, height: panelState.height }}
      position={{ x: panelState.x, y: panelState.y }}
      onDragStop={(e, d) => setPanelState(prev => ({ ...prev, x: d.x, y: d.y }))}
      onResizeStop={(e, direction, ref, delta, position) => {
        setPanelState({
          width: parseInt(ref.style.width),
          height: parseInt(ref.style.height),
          ...position,
        });
      }}
      minWidth={isMinimized ? 250 : 320}
      minHeight={isMinimized ? 'auto' : 400}
      maxWidth={window.innerWidth - 20}
      maxHeight={window.innerHeight - 20}
      disableDragging={false}
      enableResizing={!isMinimized}
      dragHandleClassName="analysis-panel-header"
      className={`analysis-panel-container ${isMinimized ? 'minimized' : 'expanded'}`}
      style={{
        backgroundColor: 'rgba(4, 8, 20, 0.95)',
        border: '1px solid var(--neon-blue)',
        borderRadius: '8px',
        boxShadow: '0 0 20px rgba(0, 240, 255, 0.2)',
        color: '#fff',
        zIndex: 9999,
        position: 'fixed',
        fontFamily: 'monospace',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', boxSizing: 'border-box' }}>
      {/* Header (Draggable) */}
      <div
        className="analysis-panel-header"
        style={{
          padding: '10px 16px',
          background: 'linear-gradient(90deg, rgba(0, 240, 255, 0.1), transparent)',
          borderBottom: '1px solid rgba(0, 240, 255, 0.2)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: 'grab'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--neon-blue)', fontWeight: 'bold' }}>
          <span>LIVE ANALYSIS</span>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button 
            onClick={(e) => { e.stopPropagation(); setIsMinimized(!isMinimized); }}
            style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
          >
            {isMinimized ? <Maximize2 size={16} /> : <Minus size={16} />}
          </button>
          <button 
            onClick={(e) => { e.stopPropagation(); onClose?.(); }}
            style={{ background: 'none', border: 'none', color: 'var(--neon-red)', cursor: 'pointer' }}
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {!isMinimized && (
        <div className="analysis-scroll" style={{ padding: '16px', flex: 1, height: 'calc(100% - 40px)', overflowY: 'auto', display: 'block', boxSizing: 'border-box', position: 'relative' }}>
          
          {(isAnalyzing || isSimulating) && (
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(4,8,20,0.85)', zIndex: 50, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)', borderRadius: '8px' }}>
              <div style={{ width: '40px', height: '40px', border: '3px solid rgba(0, 240, 255, 0.2)', borderTop: '3px solid var(--neon-blue)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
              <div style={{ marginTop: '16px', color: 'var(--neon-blue)', fontSize: '0.9rem', fontWeight: 'bold', letterSpacing: '2px', textShadow: '0 0 8px var(--neon-blue)' }}>
                {isSimulating ? 'SIMULATING...' : 'ANALYZING...'}
              </div>
            </div>
          )}

          {/* Advantage Bar */}
          <div style={{ marginBottom: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.8rem' }}>
              <span style={{ color: 'var(--neon-red)' }}>Attacker</span>
              <span style={{ color: advantage >= 0 ? 'var(--neon-red)' : 'var(--neon-green)', fontWeight: 'bold' }}>
                {advantage > 0 ? '+' : ''}{Math.abs(advantage).toFixed(2)}
              </span>
              <span style={{ color: 'var(--neon-green)' }}>Defender</span>
            </div>
            
            <div style={{ height: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', overflow: 'hidden', position: 'relative' }}>
              {/* Center line */}
              <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: '2px', background: 'rgba(255,255,255,0.5)', zIndex: 2 }} />
              
              {/* Advantage fill */}
              <div style={{
                position: 'absolute',
                top: 0, bottom: 0,
                background: barColor,
                boxShadow: `0 0 10px ${barColor}`,
                width: `${Math.min(Math.abs(advantage) * 5, 50)}%`,
                left: advantage >= 0 ? '50%' : undefined,
                right: advantage < 0 ? '50%' : undefined,
                transition: 'width 0.3s ease, left 0.3s ease, right 0.3s ease'
              }} />
            </div>
            <div style={{ textAlign: 'center', marginTop: '8px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              {interpretation}
            </div>
          </div>

          {/* Scores Breakdown */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
            <div style={{ background: 'rgba(255, 0, 60, 0.05)', border: '1px solid rgba(255, 0, 60, 0.2)', padding: '12px', borderRadius: '8px' }}>
              <div style={{ color: 'var(--neon-red)', fontSize: '0.75rem', marginBottom: '4px' }}>ATTACKER SCORE</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 'bold' }}>{Math.round(attackerScore)}</div>
            </div>
            <div style={{ background: 'rgba(57, 255, 20, 0.05)', border: '1px solid rgba(57, 255, 20, 0.2)', padding: '12px', borderRadius: '8px' }}>
              <div style={{ color: 'var(--neon-green)', fontSize: '0.75rem', marginBottom: '4px' }}>DEFENDER SCORE</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 'bold' }}>{Math.round(defenderScore)}</div>
            </div>
          </div>
          
          <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '12px', borderRadius: '8px' }}>
             <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', marginBottom: '4px' }}>DEFENDER CAUTIOUSNESS</div>
             <div style={{ fontSize: '1rem' }}>{cautiousness.toFixed(2)} / 1.0</div>
          </div>

          {/* Bot Minds Section */}
          <div style={{ 
            marginTop: '16px',
            background: 'rgba(0, 0, 0, 0.3)',
            border: '1px solid rgba(0, 240, 255, 0.3)',
            boxShadow: 'inset 0 0 10px rgba(0, 240, 255, 0.05)',
            borderRadius: '8px',
            overflow: 'hidden',
            transition: 'all 0.3s ease'
          }}>
            <div 
              style={{ 
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', 
                padding: '12px', cursor: 'pointer',
                background: isMindsExpanded ? 'rgba(0, 240, 255, 0.05)' : 'transparent',
                borderBottom: isMindsExpanded ? '1px solid rgba(0, 240, 255, 0.3)' : 'none'
              }}
              onClick={() => setIsMindsExpanded(!isMindsExpanded)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--neon-blue)', fontSize: '0.8rem', fontWeight: 'bold' }}>
                {isMindsExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                BOT MINDS (Thought Process)
              </div>
            </div>

            {isMindsExpanded && (
              <div style={{ padding: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', gap: '4px', background: 'rgba(255,255,255,0.05)', padding: '2px', borderRadius: '6px' }}>
                    <button 
                  onClick={() => setViewingRole('attacker')}
                  style={{
                    padding: '4px 8px', fontSize: '0.7rem', borderRadius: '4px', fontWeight: 'bold',
                    background: viewingRole === 'attacker' ? 'var(--neon-red)' : 'transparent',
                    color: viewingRole === 'attacker' ? '#000' : '#ccc',
                    border: 'none', cursor: 'pointer'
                  }}
                >
                  ATTACKER
                </button>
                <button 
                  onClick={() => setViewingRole('defender')}
                  style={{
                    padding: '4px 8px', fontSize: '0.7rem', borderRadius: '4px', fontWeight: 'bold',
                    background: viewingRole === 'defender' ? 'var(--neon-green)' : 'transparent',
                    color: viewingRole === 'defender' ? '#000' : '#ccc',
                    border: 'none', cursor: 'pointer'
                  }}
                >
                  DEFENDER
                </button>
              </div>
            </div>

            {botMinds && botMinds[viewingRole] ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {['easy', 'medium', 'hard', 'ga'].map(diff => {
                  const line = botMinds[viewingRole][diff];
                  const label = diff.toUpperCase();
                  if (!line) return (
                    <div key={diff} style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.1)', padding: '8px', borderRadius: '6px', fontSize: '0.85rem', color: 'gray' }}>
                      <span style={{ display: 'inline-block', width: '60px', color: 'var(--neon-blue)' }}>{label}</span>
                      <span>No valid moves found.</span>
                    </div>
                  );

                  const advantageStr = line.score > 0 ? `+${line.score.toFixed(1)}` : line.score.toFixed(1);
                  const evalColor = line.score >= 0 ? 'var(--neon-red)' : 'var(--neon-green)';
                  const displayRole = viewingRole === 'attacker' ? 'Attacker' : 'Defender';
                  
                  return (
                    <div 
                      key={diff} 
                      style={{ 
                        background: 'rgba(0,0,0,0.4)', 
                        border: '1px solid rgba(255,255,255,0.1)', 
                        padding: '12px', 
                        borderRadius: '6px',
                        fontSize: '0.85rem',
                        lineHeight: '1.4'
                      }}
                    >
                      <div style={{ marginBottom: '6px', display: 'flex', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <span style={{ color: 'var(--neon-blue)', fontWeight: 'bold' }}>{label} BOT</span>
                          <button 
                            disabled={isSimulating}
                            onClick={() => handleSimulate(line.sequence)}
                            style={{ 
                              background: isSimulating ? 'rgba(255,255,255,0.1)' : 'var(--neon-blue)', 
                              color: '#000', border: 'none', borderRadius: '4px', padding: '2px 8px', 
                              fontSize: '0.65rem', fontWeight: 'bold', cursor: isSimulating ? 'not-allowed' : 'pointer' 
                            }}
                          >
                            {isSimulating ? 'SIMULATING...' : '▶ SIMULATE'}
                          </button>
                        </div>
                        <span style={{ color: evalColor, fontWeight: 'bold' }}>Eval: {advantageStr}</span>
                      </div>
                      <div style={{ color: '#ccc' }}>
                        "If I were the {displayRole}, my best plan is to{' '}
                        {line.sequence.map((action, i) => {
                          const isLast = i === line.sequence.length - 1;
                          const connector = i === 0 ? '' : (isLast ? ' and then ' : ', then ');
                          
                          let actionText = '';
                          if (action.type === 'move') {
                            actionText = `move my piece at (${action.fromR}, ${action.fromC}) to (${action.toR}, ${action.toC})`;
                          } else if (action.type === 'rotate') {
                            actionText = `rotate my piece at (${action.r}, ${action.c}) ${action.dir === 'cw' ? 'clockwise' : 'counter-clockwise'}`;
                          } else if (action.type === 'laser-press') {
                            actionText = `fire the Lazer`;
                          } else if (action.type === 'place') {
                            actionText = `place a piece at (${action.r}, ${action.c})`;
                          }

                          return (
                            <React.Fragment key={i}>
                              {connector}
                              <span 
                                style={{ 
                                  color: '#fff', 
                                  cursor: 'pointer', 
                                  borderBottom: '1px dashed rgba(255,255,255,0.5)',
                                  padding: '0 2px'
                                }}
                                onClick={() => {
                                  if (action.type === 'move') onHighlightMove?.(action.fromR, action.fromC);
                                  else if (action.type === 'rotate') onHighlightMove?.(action.r, action.c);
                                }}
                                title="Click to highlight on board"
                              >
                                {actionText}
                              </span>
                            </React.Fragment>
                          );
                        })}."
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ fontSize: '0.8rem', color: 'gray' }}>Evaluating bot minds...</div>
            )}
              </div>
            )}
          </div>

          {/* History Playback */}
          {(maxHistoryIndex !== undefined && maxHistoryIndex > 0) && (
            <div style={{ marginTop: '16px', background: 'rgba(0, 240, 255, 0.05)', border: '1px solid rgba(0, 240, 255, 0.2)', padding: '12px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <button 
                onClick={stepBackward} 
                disabled={reviewIndex === 0}
                style={{ background: 'rgba(0, 240, 255, 0.2)', border: 'none', color: '#fff', padding: '6px 12px', borderRadius: '4px', cursor: reviewIndex === 0 ? 'not-allowed' : 'pointer', opacity: reviewIndex === 0 ? 0.5 : 1 }}
              >
                ◀ BACK
              </button>
              <div style={{ fontSize: '0.8rem', color: 'var(--neon-blue)', fontWeight: 'bold' }}>
                TURN {reviewIndex !== null ? reviewIndex + 1 : maxHistoryIndex + 1} / {maxHistoryIndex + 1}
              </div>
              <button 
                onClick={stepForward} 
                disabled={reviewIndex === null}
                style={{ background: 'rgba(0, 240, 255, 0.2)', border: 'none', color: '#fff', padding: '6px 12px', borderRadius: '4px', cursor: reviewIndex === null ? 'not-allowed' : 'pointer', opacity: reviewIndex === null ? 0.5 : 1 }}
              >
                FWD ▶
              </button>
            </div>
          )}

        </div>
      )}
      </div>
    </Rnd>
  );
}
