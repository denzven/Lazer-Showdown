import React, { useState, useEffect } from 'react';
import { Trash2, LogOut, Info, AlertTriangle, X, Zap } from 'lucide-react';
import Grid from './Board/Grid';
import { BLOCK_TYPES, PLAYERS, getReachableCells } from '../core/Ruleset';

export default function Layout({ network, game, mode, difficulty }) {
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
    canRedo
  } = game;

  const [selectedCell, setSelectedCell] = useState(null);
  const [selectedPaletteBlock, setSelectedPaletteBlock] = useState(null);
  const [showLaserBeam, setShowLaserBeam] = useState(false);

  useEffect(() => {
    if (customData?.laserFired) {
      setShowLaserBeam(true);
      const timer = setTimeout(() => {
        setShowLaserBeam(false);
      }, 1500);
      return () => clearTimeout(timer);
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
  const hitPiece = customData?.hitPiece || null;
  const blockStates = {}; // Points pieces hit are marked appropriately in Grid/Cell

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
      if (challengedPiece === 'block-20') return ['BLOCK_20'];
      if (challengedPiece === 'block-30') return ['BLOCK_30'];
      if (challengedPiece === 'block-50') return ['BLOCK_50'];
    }
    if (phase === 'setup-attacker') {
      return ['BLOCK_LAZER'];
    }
    return []; // No palette elements during gameplay rounds
  };

  const activePlayerColor = phase === 'setup-defender' || phase === 'challenge-setup'
    ? (roleRed === 'defender' ? 'red' : 'blue')
    : phase === 'setup-attacker'
      ? (roleRed === 'attacker' ? 'red' : 'blue')
      : (roleRed === turnPlayer ? 'red' : 'blue');

  const isLocalTurn = (mode === 'local') 
    ? true 
    : (mode === 'bot' && activePlayerColor === 'red')
      ? true
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
        } else if (mode === 'bot') {
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
              <button className={`cyber-button ${btnClass}`} onClick={rollToss} style={{ width: '100%' }}>
                {btnText}
              </button>
            )}
            {!canRoll && phase === 'toss' && mode !== 'local' && (
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Waiting for opponent to roll...
              </p>
            )}
            {!canRoll && phase === 'toss' && mode === 'local' && (
              <p style={{ fontSize: '0.8rem', color: 'var(--neon-blue)', fontWeight: 'bold' }}>
                Rolling...
              </p>
            )}
            {phase === 'toss-result' && (
              <p style={{ fontSize: '0.9rem', color: 'var(--neon-blue)', fontWeight: 'bold' }}>
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
        : (mode === 'bot' ? (tossWinner === 'red') : (tossWinner === role));

      return (
        <div className="modal-overlay">
          <div className="modal-content glass-panel" style={{ maxWidth: '450px' }}>
            <h2 className="modal-title glow-text-red">Choose Role</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              {tossWinner.toUpperCase()} won the toss! Choose your role:
            </p>

            {isTossWinnerLocal ? (
              <div style={{ display: 'flex', gap: '16px', marginTop: '20px', width: '100%' }}>
                <button className="cyber-button red" onClick={() => selectRole('attacker')} style={{ flex: 1 }}>
                  ATTACKER
                </button>
                <button className="cyber-button blue" onClick={() => selectRole('defender')} style={{ flex: 1 }}>
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
                  {capturedPieces.map((type, idx) => (
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
        } else if (mode === 'bot') {
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
            {!canRoll && phase === 'challenge-toss' && mode !== 'local' && (
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
    if (phase === 'game-over') {
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
            <button className="cyber-button" onClick={clearWorkspace} style={{ width: '100%', borderColor: 'var(--neon-blue)', color: 'var(--neon-blue)' }}>
              PLAY AGAIN
            </button>
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="game-layout">
      {/* Sidebar Left: Connection, Controls, Actions */}
      <div className="sidebar-panel glass-panel" style={{ justifyContent: 'flex-start' }}>
        <div>
          <h2 style={{ fontSize: '1.2rem', marginBottom: '8px' }}>Game Controls</h2>
          <div style={{ fontSize: '0.85rem', color: role === 'red' ? 'var(--neon-red)' : 'var(--neon-blue)', fontWeight: 'bold' }}>
            ROLE: {role ? role.toUpperCase() : ''}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
            {getStatusText()}
          </div>
        </div>

        {/* Set & Round HUD Panel */}
        {phase !== 'toss' && phase !== 'role-selection' && phase !== 'game-over' && (
          <div style={{ border: '1px solid rgba(255,255,255,0.05)', padding: '12px', borderRadius: '8px', background: 'rgba(0,0,0,0.1)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>SET:</span>
              <span style={{ fontWeight: 'bold' }}>{set} of 2</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>ROUND:</span>
              <span style={{ fontWeight: 'bold' }}>{round} of 3</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>ROLLER:</span>
              <span style={{ fontWeight: 'bold', color: activePlayerColor === 'red' ? 'var(--neon-red)' : 'var(--neon-blue)' }}>
                {turnPlayer.toUpperCase()}
              </span>
            </div>
            {phase === 'playing' && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '8px', marginTop: '4px' }}>
                <span style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Zap size={12} color="#39ff14" /> AP LEFT:
                </span>
                <span style={{ fontWeight: 'bold', color: '#39ff14' }}>{actionPoints} AP</span>
              </div>
            )}
          </div>
        )}

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
                style={{ width: '100%', fontSize: '0.8rem', fontWeight: 'bold', letterSpacing: '0.05em', animation: 'afkPulse 1.2s infinite' }}
              >
                ROLL AP DICE
              </button>
            )}
          </div>
        )}

        {/* Action Panel */}
        {phase === 'playing' && hasRolledDice && isLocalTurn && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
            {turnPlayer === 'attacker' && (
              <>
                <button
                  className="cyber-button red"
                  onClick={() => executeAction({ type: 'laser-press' })}
                  disabled={actionPoints <= 0}
                  style={{ width: '100%', fontSize: '0.8rem', fontWeight: 'bold' }}
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
              style={{ width: '100%', fontSize: '0.8rem', marginTop: '10px', borderColor: 'var(--text-secondary)', color: 'var(--text-secondary)' }}
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
            onClick={disconnect}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
          >
            <LogOut size={14} /> LEAVE
          </button>
        </div>
      </div>

      {/* Center Panel: Collaborative Grid */}
      <div className="main-board-panel">
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

        {/* Setup Banner prompts */}
        {renderSetupBanner()}

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
          lazerPos={customData?.lazerPos}
          mode={mode}
          phase={phase}
          isLocalTurn={isLocalTurn}
          roleRed={roleRed}
          role={role}
          activePlayerColor={activePlayerColor}
          reachableCells={selectedCell ? getReachableCells(board, selectedCell.r, selectedCell.c, actionPoints, turnPlayer) : []}
          showLaserBeam={showLaserBeam}
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
      <div className="sidebar-panel glass-panel">
        <div className="tray-title font-display">Setup inventory</div>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '10px' }}>
          {getVisiblePaletteKeys().length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textAlign: 'center', marginTop: '20px' }}>
              Inventory inactive. Pieces can only be placed during initial setup.
            </p>
          ) : getVisiblePaletteKeys().map((key) => {
            const blockType = BLOCK_TYPES[key];
            const color = getBlockColor(blockType);
            const isSelected = selectedPaletteBlock === blockType;

            const displayName = blockType === BLOCK_TYPES.BLOCK_LAZER
              ? 'Lazer Block'
              : `${blockType.split('-')[1]} Block`;

            const activeStyle = isSelected ? {
              borderColor: color,
              boxShadow: `0 0 12px ${color}66`,
              background: 'rgba(255, 255, 255, 0.05)'
            } : {};

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
                        y="58%"
                        dominantBaseline="middle"
                        textAnchor="middle"
                        fill={color}
                        fontSize="12.5"
                        fontWeight="800"
                        fontFamily="monospace"
                        letterSpacing="-0.5px"
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

      {/* Overlays (Toss, Challenge, Game Over) */}
      {renderOverlay()}

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
