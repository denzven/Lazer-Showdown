import { useState, useEffect, useCallback } from 'react';
import {
  getInitialState,
  applySandboxAction
} from '../core/GameState';
import { getBotSetupAction, getBotPlayAction } from '../core/BotEngine';

export function useGame(network, mode, difficulty, customBoardData = null) {
  const [gameState, setGameState] = useState(() => getInitialState(customBoardData));
  const [history, setHistory] = useState({ past: [], future: [] });

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
          customBoardData: res.customBoardData,
          error: null
        };
        // History management
        if (['place', 'move', 'rotate', 'laser-press'].includes(action.type)) {
          setHistory(h => ({ past: [...h.past, curr], future: [] }));
        } else if (['end-turn', 'end-roll', 'toss-roll', 'toss-resolve', 'toss-start-roll', 'toss-select-role', 'challenge-start-roll', 'challenge-roll', 'challenge-toss-resolve', 'clear'].includes(action.type)) {
          setHistory({ past: [], future: [] });
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
        const timer = setTimeout(() => {
          const botRole = isBotAttacker ? 'attacker' : 'defender';
          const action = getBotPlayAction(gameState.board, botRole, gameState.actionPoints, difficulty);
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
        const captured = gameState.capturedPieces;
        const target = captured.includes('block-50') 
          ? 'block-50' 
          : captured.includes('block-30') 
            ? 'block-30' 
            : 'block-20';
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

  return {
    // Game States
    board: gameState.board,
    phase: gameState.phase,
    set: gameState.set,
    round: gameState.round,
    roleRed: gameState.roleRed,
    roleBlue: gameState.roleBlue,
    turnPlayer: gameState.turnPlayer,
    actionPoints: gameState.actionPoints,
    hasRolledDice: gameState.hasRolledDice,
    scores: gameState.scores,
    winner: gameState.winner,
    logs: gameState.logs,
    customData: gameState.customData,
    capturedPieces: gameState.capturedPieces,
    challengeActive: gameState.challengeActive,
    challengedPiece: gameState.challengedPiece,
    tossRolls: gameState.tossRolls,
    tossWinner: gameState.tossWinner,
    challengeTossRolls: gameState.challengeTossRolls,
    dice: gameState.dice,
    customBoardData: gameState.customBoardData,
    error: gameState.error,

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
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0
  };
}
