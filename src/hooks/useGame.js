import { useState, useEffect, useCallback } from 'react';
import {
  getInitialState,
  applySandboxAction
} from '../core/GameState';
import { getBotSetupAction, getBotPlayAction, generateThreatMap, getBoardAnalysis, generatePossibilityWeb } from '../core/BotEngine';

export function useGame(network, mode, difficulty, customBoardData = null) {
  const [gameState, setGameState] = useState(() => getInitialState(customBoardData));
  const [history, setHistory] = useState({ past: [], future: [] });

  const [analysisMode, setAnalysisMode] = useState(false);
  const [analysisData, setAnalysisData] = useState(null);
  const [threatMap, setThreatMap] = useState(null);
  const [possibilityWeb, setPossibilityWeb] = useState(null);
  const [reviewIndex, setReviewIndex] = useState(null);

  // Generate Analysis Data whenever board or analysis mode changes
  useEffect(() => {
    if (!analysisMode) {
      setAnalysisData(null);
      setThreatMap(null);
      setPossibilityWeb(null);
      return;
    }

    const targetPlayer = mode === 'bot' ? 'blue' : (network.role === 'blue' ? 'blue' : 'red');
    const targetRole = targetPlayer === 'blue' 
      ? (gameState.roleBlue === 'attacker' ? 'attacker' : 'defender') 
      : (gameState.roleRed === 'attacker' ? 'attacker' : 'defender');
    
    const analysisDiff = mode === 'bot' ? difficulty : 'hard';

    setAnalysisData(getBoardAnalysis(gameState.board, targetRole, analysisDiff, gameState, targetPlayer));
    setThreatMap(generateThreatMap(gameState.board));
    setPossibilityWeb(generatePossibilityWeb(gameState.board));
  }, [analysisMode, gameState.board, gameState.roleBlue, gameState.roleRed, difficulty, mode, network.role]);

  // Handle Elo update on game over
  useEffect(() => {
    if (gameState.phase === 'game-over' && mode === 'bot' && !gameState.eloProcessed) {
      const botElo = difficulty === 'easy' ? 800 : (difficulty === 'medium' ? 1200 : 1600);
      const currentElo = parseInt(localStorage.getItem('playerElo')) || 1000;
      
      let playerWins = 0;
      if (gameState.winner === 'red') playerWins = 1;
      else if (gameState.winner === 'draw') playerWins = 0.5;

      const expectedScore = 1 / (1 + Math.pow(10, (botElo - currentElo) / 400));
      const kFactor = 32;
      const newElo = Math.round(currentElo + kFactor * (playerWins - expectedScore));
      
      localStorage.setItem('playerElo', newElo);
      setGameState(curr => ({ ...curr, eloProcessed: true, newElo, eloDiff: newElo - currentElo }));
    }
  }, [gameState.phase, gameState.winner, difficulty, mode, gameState.eloProcessed]);

  const { role, status, lastMessage, sendPayload } = network;

  // 1. Reconcile complete state on incoming WebRTC payloads
  useEffect(() => {
    if (!lastMessage) return;

    const { type, payload } = lastMessage;

    if (type === 'SYNC_GAME') {
      setGameState({
        board: payload.board,
        phase: payload.phase,
        set: payload.set,
        round: payload.round,
        roleRed: payload.roleRed,
        roleBlue: payload.roleBlue,
        turnPlayer: payload.turnPlayer,
        actionPoints: payload.actionPoints,
        hasRolledDice: payload.hasRolledDice,
        scores: payload.scores,
        winner: payload.winner,
        logs: payload.logs,
        customData: payload.customData,
        capturedPieces: payload.capturedPieces,
        challengeActive: payload.challengeActive,
        challengedPiece: payload.challengedPiece,
        tossRolls: payload.tossRolls,
        tossWinner: payload.tossWinner,
        challengeTossRolls: payload.challengeTossRolls,
        dice: payload.dice || { values: [1, 1], isRolling: false, lastRoller: null },
        turnStats: payload.turnStats || { lazerMove: 0, lazerRotate: 0, lazerFire: 0, pieceMove: 0, pieceMoveBreakdown: { 'block-20': 0, 'block-30': 0, 'block-50': 0 }, wastedAP: 0 },
        customBoardData: payload.customBoardData,
        error: null
      });
      // Clear history when syncing from a remote player to avoid invalid undo states
      setHistory({ past: [], future: [] });
    }
  }, [lastMessage]);

  // 2. Host synchronizes full state with Guest upon connection
  useEffect(() => {
    if (status === 'connected' && role === 'red') {
      sendPayload('SYNC_GAME', gameState);
    }
  }, [status, role, sendPayload]);

  /**
   * Unified dispatcher to execute actions locally and broadcast state changes over WebRTC.
   * Enables seamless integration of future action types without hook signature updates.
   * 
   * @param {Object} action - Action details: { type, ...payload }
   */
  const executeAction = useCallback((action) => {
    if (status !== 'connected' && action.type !== 'clear') return;

    setGameState((curr) => {
      // Determine the acting player based on the active phase
      const actor = (mode === 'local' || mode === 'bot') 
        ? (action.player || (() => {
            if (curr.phase === 'toss') {
              const redNeedsToAct = curr.tossRolls.red === null || curr.tossRolls.red === 'rolling';
              return redNeedsToAct ? 'red' : 'blue';
            }
            if (curr.phase === 'challenge-toss') {
              const redNeedsToAct = curr.challengeTossRolls.red === null || curr.challengeTossRolls.red === 'rolling';
              return redNeedsToAct ? 'red' : 'blue';
            }
            if (curr.phase === 'setup-defender' || curr.phase === 'challenge-setup') {
              return curr.roleRed === 'defender' ? 'red' : 'blue';
            }
            if (curr.phase === 'setup-attacker') {
              return curr.roleRed === 'attacker' ? 'red' : 'blue';
            }
            return curr.roleRed === curr.turnPlayer ? 'red' : 'blue';
          })())
        : role;

      // Execute transaction with the ruleset evaluation pipeline
      const res = applySandboxAction(curr.board, action, actor, {
        phase: curr.phase,
        roleRed: curr.roleRed,
        roleBlue: curr.roleBlue,
        set: curr.set,
        round: curr.round,
        turnPlayer: curr.turnPlayer,
        actionPoints: curr.actionPoints,
        hasRolledDice: curr.hasRolledDice,
        scores: curr.scores,
        capturedPieces: curr.capturedPieces,
        challengeActive: curr.challengeActive,
        challengedPiece: curr.challengedPiece,
        tossRolls: curr.tossRolls,
        tossWinner: curr.tossWinner,
        challengeTossRolls: curr.challengeTossRolls,
        dice: curr.dice,
        customBoardData: curr.customBoardData,
        enableTurns: true
      });

      if (!res.error) {
        const nextState = {
          board: res.board,
          phase: res.phase,
          set: res.set,
          round: res.round,
          roleRed: res.roleRed,
          roleBlue: res.roleBlue,
          turnPlayer: res.turnPlayer,
          actionPoints: res.actionPoints,
          hasRolledDice: res.hasRolledDice,
          scores: res.scores,
          winner: res.winner,
          logs: [...curr.logs, ...res.logs],
          customData: res.customData,
          capturedPieces: res.capturedPieces,
          challengeActive: res.challengeActive,
          challengedPiece: res.challengedPiece,
          tossRolls: res.tossRolls,
          tossWinner: res.tossWinner,
          challengeTossRolls: res.challengeTossRolls,
          dice: res.dice,
          turnStats: res.turnStats,
          customBoardData: res.customBoardData,
          error: null
        };
        // History management
        if (action.type === 'clear' || action.type === 'toss-select-role') {
          // Only clear history on full game reset
          setHistory({ past: [], future: [] });
        } else if (['place', 'move', 'rotate', 'laser-press', 'end-roll', 'declare-challenge', 'challenge-toss-resolve'].includes(action.type)) {
          // Record significant game actions in history for clean replayability
          setHistory(h => ({ past: [...h.past, curr], future: [] }));
        }

        // Broadcast the complete synchronized state
        if (status === 'connected') {
          sendPayload('SYNC_GAME', nextState);
        }
        return nextState;
      } else {
        return { ...curr, error: res.error };
      }
    });
  }, [status, role, sendPayload, mode]);

  // 3. Computer Opponent Bot turn loop (Official Ruleset Sequence)
  useEffect(() => {
    if (mode !== 'bot' || gameState.winner) return;

    const botPlayer = 'blue';
    const isBotAttacker = gameState.roleBlue === 'attacker';
    const isBotDefender = gameState.roleBlue === 'defender';

    // A. Setup Placements
    if (gameState.phase === 'setup-defender' && isBotDefender) {
      const timer = setTimeout(() => {
        const action = getBotSetupAction(gameState.board, gameState.phase, botPlayer, difficulty);
        if (action) executeAction({ ...action, player: botPlayer });
      }, 1000);
      return () => clearTimeout(timer);
    }

    if (gameState.phase === 'setup-attacker' && isBotAttacker) {
      const timer = setTimeout(() => {
        const action = getBotSetupAction(gameState.board, gameState.phase, botPlayer, difficulty);
        if (action) executeAction({ ...action, player: botPlayer });
      }, 1000);
      return () => clearTimeout(timer);
    }

    if (gameState.phase === 'challenge-setup' && isBotDefender) {
      const timer = setTimeout(() => {
        const action = getBotSetupAction(gameState.board, gameState.phase, botPlayer, difficulty, gameState.challengedPiece);
        if (action) executeAction({ ...action, player: botPlayer });
      }, 1000);
      return () => clearTimeout(timer);
    }

    // B. Gameplay turn
    const isBotActiveTurn = gameState.phase === 'playing' && (
      (gameState.turnPlayer === 'attacker' && isBotAttacker) ||
      (gameState.turnPlayer === 'defender' && isBotDefender)
    );

    if (isBotActiveTurn) {
      // Step 1: Roll dice if not rolled yet
      if (!gameState.hasRolledDice && !gameState.dice.isRolling) {
        const timer = setTimeout(() => {
          executeAction({ type: 'start-roll', player: botPlayer });
          setTimeout(() => {
            const v1 = Math.floor(Math.random() * 6) + 1;
            const v2 = Math.floor(Math.random() * 6) + 1;
            executeAction({ type: 'end-roll', values: [v1, v2], player: botPlayer });
          }, 600);
        }, 1000);
        return () => clearTimeout(timer);
      }

      // Step 2: Perform actions step-by-step
      if (gameState.hasRolledDice && gameState.actionPoints > 0 && !gameState.dice.isRolling) {
        const timer = setTimeout(async () => {
          const botRole = isBotAttacker ? 'attacker' : 'defender';
          const action = await getBotPlayAction(gameState.board, botRole, gameState.actionPoints, difficulty, gameState, botPlayer);
          if (action) {
            executeAction({ ...action, player: botPlayer });
          } else {
            // End turn if no useful moves are found or safe
            executeAction({ type: 'end-turn', player: botPlayer });
          }
        }, 900); // Step delay
        return () => clearTimeout(timer);
      }
    }

    // C. Challenge Declaration
    if (gameState.phase === 'challenge-declaration' && isBotAttacker) {
      const timer = setTimeout(() => {
        const roll = Math.random();
        let declare = true;

        if (difficulty === 'easy' && roll < 0.4) {
          declare = false; // 40% chance easy bot skips challenge
        } else if (difficulty === 'medium' && roll < 0.15) {
          declare = false; // 15% chance medium bot skips
        }

        if (!declare) {
          executeAction({ type: 'declare-challenge', declare: false, player: botPlayer });
          return;
        }

        const captured = gameState.capturedPieces;
        let target = 'block-50';

        if (difficulty === 'easy') {
          // Easy bot challenges a random captured piece
          target = captured[Math.floor(Math.random() * captured.length)];
        } else if (difficulty === 'medium') {
          // Medium bot has a 30% chance to make a suboptimal challenge (not 50)
          if (roll > 0.7) {
             const subOptimal = captured.filter(c => c !== 'block-50');
             target = subOptimal.length > 0 ? subOptimal[Math.floor(Math.random() * subOptimal.length)] : captured[0];
          } else {
             target = captured.includes('block-50') ? 'block-50' : captured.includes('block-30') ? 'block-30' : 'block-20';
          }
        } else {
          // Hard bot always targets the best piece
          target = captured.includes('block-50') ? 'block-50' : captured.includes('block-30') ? 'block-30' : 'block-20';
        }

        executeAction({ type: 'declare-challenge', declare: true, pieceType: target, player: botPlayer });
      }, 1500);
      return () => clearTimeout(timer);
    }

    // D. Challenge Toss Roll
    if (gameState.phase === 'challenge-toss') {
      const isRedFinished = gameState.challengeTossRolls.red !== null && gameState.challengeTossRolls.red !== 'rolling';
      if (isRedFinished && gameState.challengeTossRolls.blue === null) {
        const timer = setTimeout(() => {
          executeAction({ type: 'challenge-start-roll', player: botPlayer });
          setTimeout(() => {
            const blueVal = Math.floor(Math.random() * 6) + 1;
            executeAction({ type: 'challenge-roll', value: blueVal, player: botPlayer });
          }, 600);
        }, 1000);
        return () => clearTimeout(timer);
      }
    }

    // E. Initial Toss Roll
    if (gameState.phase === 'toss') {
      const isRedFinished = gameState.tossRolls.red !== null && gameState.tossRolls.red !== 'rolling';
      if (isRedFinished && gameState.tossRolls.blue === null) {
        const timer = setTimeout(() => {
          executeAction({ type: 'toss-start-roll', player: botPlayer });
          setTimeout(() => {
            const blueVal = Math.floor(Math.random() * 6) + 1;
            executeAction({ type: 'toss-roll', value: blueVal, player: botPlayer });
          }, 600);
        }, 1000);
        return () => clearTimeout(timer);
      }
    }

    // F. Role Selection
    if (gameState.phase === 'role-selection' && gameState.tossWinner === 'blue') {
      const timer = setTimeout(() => {
        let selectedRole = 'attacker';
        if (difficulty === 'easy') {
          selectedRole = Math.random() < 0.5 ? 'attacker' : 'defender';
        } else if (difficulty === 'medium') {
          selectedRole = 'defender';
        } else {
          selectedRole = 'attacker';
        }
        executeAction({ type: 'toss-select-role', role: selectedRole, player: botPlayer });
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [
    mode, 
    gameState.phase, 
    gameState.turnPlayer, 
    gameState.hasRolledDice, 
    gameState.actionPoints, 
    gameState.dice.isRolling, 
    gameState.winner, 
    gameState.capturedPieces, 
    gameState.challengeTossRolls, 
    gameState.tossRolls, 
    gameState.tossWinner, 
    difficulty, 
    executeAction
  ]);

  // Dice rolling callback
  const rollDice = useCallback(() => {
    if (gameState.dice.isRolling) return;
    executeAction({ type: 'start-roll' });
    setTimeout(() => {
      const v1 = Math.floor(Math.random() * 6) + 1;
      const v2 = Math.floor(Math.random() * 6) + 1;
      executeAction({ type: 'end-roll', values: [v1, v2] });
    }, 600);
  }, [executeAction, gameState.dice.isRolling]);

  // Backwards-compatible helper shortcuts for Layout.jsx and Grid.jsx
  const placeBlock = useCallback((type, r, c, rotation = 0) => {
    executeAction({ type: 'place', pieceType: type, r, c, rotation });
  }, [executeAction]);

  const moveBlock = useCallback((fromR, fromC, toR, toC) => {
    executeAction({ type: 'move', fromR, fromC, toR, toC });
  }, [executeAction]);

  const rotateBlock = useCallback((r, c, dir = 'cw') => {
    executeAction({ type: 'rotate', r, c, dir });
  }, [executeAction]);

  // NEW: handle automatic resolution of toss results
  useEffect(() => {
    if (status === 'connected' && role !== 'red') return; // Only host or local drives state transitions

    if (gameState.phase === 'toss-result') {
      const timer = setTimeout(() => {
        executeAction({ type: 'toss-resolve' });
      }, 1500);
      return () => clearTimeout(timer);
    }
    
    if (gameState.phase === 'challenge-toss-result') {
      const timer = setTimeout(() => {
        executeAction({ type: 'challenge-toss-resolve' });
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [gameState.phase, executeAction, status, role]);

  const removeBlock = useCallback((r, c) => {
    executeAction({ type: 'remove', r, c });
  }, [executeAction]);

  const clearWorkspace = useCallback((overrideBoardData = undefined) => {
    const action = { type: 'clear' };
    if (overrideBoardData !== undefined) {
      action.customBoardData = overrideBoardData;
    }
    executeAction(action);
  }, [executeAction]);

  const clearError = useCallback(() => {
    setGameState(curr => ({ ...curr, error: null }));
  }, []);

  const rollToss = useCallback(() => {
    executeAction({ type: 'toss-start-roll' });
    setTimeout(() => {
      const val = Math.floor(Math.random() * 6) + 1;
      executeAction({ type: 'toss-roll', value: val });
    }, 600);
  }, [executeAction]);

  const selectRole = useCallback((selectedRole) => {
    executeAction({ type: 'toss-select-role', role: selectedRole });
  }, [executeAction]);

  const rollChallengeToss = useCallback(() => {
    executeAction({ type: 'challenge-start-roll' });
    setTimeout(() => {
      const val = Math.floor(Math.random() * 6) + 1;
      executeAction({ type: 'challenge-roll', value: val });
    }, 600);
  }, [executeAction]);

  const declareChallenge = useCallback((declare, pieceType) => {
    executeAction({ type: 'declare-challenge', declare, pieceType });
  }, [executeAction]);

  const endTurn = useCallback(() => {
    executeAction({ type: 'end-turn' });
  }, [executeAction]);

  const undo = useCallback(() => {
    if (history.past.length === 0) return;
    const newPast = [...history.past];
    const prevState = newPast.pop();
    const newFuture = [gameState, ...history.future];
    
    setHistory({ past: newPast, future: newFuture });
    setGameState(prevState);
    sendPayload('SYNC_GAME', prevState);
  }, [history, gameState, sendPayload]);

  const redo = useCallback(() => {
    if (history.future.length === 0) return;
    const newFuture = [...history.future];
    const nextState = newFuture.shift();
    const newPast = [...history.past, gameState];
    
    setHistory({ past: newPast, future: newFuture });
    setGameState(nextState);
    sendPayload('SYNC_GAME', nextState);
  }, [history, gameState, sendPayload]);

  // Auto-end turn when action points reach 0
  useEffect(() => {
    if (
      gameState.phase === 'playing' &&
      gameState.hasRolledDice &&
      gameState.actionPoints === 0 &&
      !gameState.dice.isRolling
    ) {
      const activePlayerColor = gameState.roleRed === gameState.turnPlayer ? 'red' : 'blue';
      const isLocalTurn = (mode === 'local' || mode === 'bot')
        ? true
        : (mode === 'online' && role === activePlayerColor);

      if (isLocalTurn) {
        const timer = setTimeout(() => {
          executeAction({ type: 'end-turn' });
        }, 1200);
        return () => clearTimeout(timer);
      }
    }
  }, [
    gameState.phase, 
    gameState.hasRolledDice, 
    gameState.actionPoints, 
    gameState.dice.isRolling,
    gameState.roleRed,
    gameState.turnPlayer,
    mode,
    role,
    executeAction
  ]);

  const stepBackward = useCallback(() => {
    setReviewIndex(prev => {
      const maxIndex = history.past.length;
      if (maxIndex === 0) return null;
      if (prev === null) return maxIndex - 1;
      if (prev > 0) return prev - 1;
      return 0;
    });
  }, [history.past.length]);

  const stepForward = useCallback(() => {
    setReviewIndex(prev => {
      if (prev === null) return null;
      const maxIndex = history.past.length;
      if (prev < maxIndex - 1) return prev + 1;
      return null;
    });
  }, [history.past.length]);

  const activeState = (reviewIndex !== null && history.past[reviewIndex]) ? history.past[reviewIndex] : gameState;

  return {
    // Game States
    board: activeState.board,
    phase: activeState.phase,
    set: activeState.set,
    round: activeState.round,
    roleRed: activeState.roleRed,
    roleBlue: activeState.roleBlue,
    turnPlayer: activeState.turnPlayer,
    actionPoints: activeState.actionPoints,
    hasRolledDice: activeState.hasRolledDice,
    scores: activeState.scores,
    winner: activeState.winner,
    logs: activeState.logs,
    customData: activeState.customData,
    capturedPieces: activeState.capturedPieces,
    challengeActive: activeState.challengeActive,
    challengedPiece: activeState.challengedPiece,
    tossRolls: activeState.tossRolls,
    tossWinner: activeState.tossWinner,
    challengeTossRolls: activeState.challengeTossRolls,
    dice: activeState.dice,
    turnStats: activeState.turnStats,
    customBoardData: activeState.customBoardData,
    error: activeState.error,

    // Methods
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
    history,
    reviewIndex,
    setReviewIndex,
    stepForward,
    stepBackward,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    analysisMode,
    setAnalysisMode,
    analysisData,
    threatMap,
    possibilityWeb,
    liveState: gameState
  };
}
