import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getInitialState,
  applySandboxAction
} from '../core/GameState';
import { getBotSetupAction, getBotPlayAction, getBotChallengeAction, generateThreatMap, getBoardAnalysis, generatePossibilityWeb } from '../core/BotEngine';

function getBotActionDelay(difficulty, action, gameState, humanPaceAvg) {
  let baseDelay = 300;
  if (difficulty === 'easy') baseDelay = 250;
  else if (difficulty === 'medium') baseDelay = 550;
  else if (difficulty === 'hard') baseDelay = 850;
  else if (difficulty === 'ga') baseDelay = 700;

  const paceFactor = Math.max(0.6, Math.min(1.6, humanPaceAvg / 1000));
  let pacedDelay = baseDelay * paceFactor;

  let decisionWeight = 0;
  if (action) {
    if (action.type === 'laser-press') {
      decisionWeight = 800; 
    } else if (action.type === 'place') {
      decisionWeight = 300;
    } else if (action.type === 'move') {
      const targetPiece = gameState.board[action.toR]?.[action.toC];
      if (targetPiece && targetPiece.type !== 'empty') {
        decisionWeight = 500;
      }
    } else if (action.type === 'rotate') {
      decisionWeight = 200;
    }
  }

  const roundFactor = Math.min(gameState.round * 50, 200);
  return Math.max(200, Math.min(3000, pacedDelay + decisionWeight + roundFactor));
}

export function useGame(network, mode, difficulty, customBoardData = null, spectateConfig = null) {
  const [gameState, setGameState] = useState(() => getInitialState(customBoardData, mode));
  const [history, setHistory] = useState({ past: [], future: [] });

  // Reset when mode changes
  useEffect(() => {
    setGameState(getInitialState(customBoardData, mode));
    setHistory({ past: [], future: [] });
    botChallengeAttempted.current = false;
  }, [mode, customBoardData]);

  // Track whether the bot has already attempted a challenge this set (tutorial only)
  const botChallengeAttempted = useRef(false);

  const lastActionTimestamp = useRef(Date.now());
  const humanMoveTimeAvg = useRef(1000);
  const botTimeoutRef = useRef(null);

  // Reset human action timestamp when it becomes the human's active turn
  useEffect(() => {
    const isHumanActiveTurn = gameState.phase === 'playing' && 
      ((gameState.turnPlayer === 'attacker' && gameState.roleBlue !== 'attacker') ||
       (gameState.turnPlayer === 'defender' && gameState.roleBlue !== 'defender'));
       
    if (isHumanActiveTurn) {
      lastActionTimestamp.current = Date.now();
    }
  }, [gameState.turnPlayer, gameState.phase, gameState.roleBlue]);

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

    const isHumanAct = (mode === 'bot' || mode === 'tutorial') && 
      action.player !== 'blue' &&
      ['place', 'move', 'rotate', 'laser-press'].includes(action.type);

    if (isHumanAct) {
      const now = Date.now();
      const elapsed = now - lastActionTimestamp.current;
      if (elapsed > 100 && elapsed < 6000) {
        humanMoveTimeAvg.current = (humanMoveTimeAvg.current * 0.7) + (elapsed * 0.3);
      }
      lastActionTimestamp.current = now;
    }

    setGameState((curr) => {
      // Determine the acting player based on the active phase
      const actor = (mode === 'local' || mode === 'bot' || mode === 'tutorial' || mode === 'spectate') 
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

  useEffect(() => {
    if ((mode !== 'bot' && mode !== 'tutorial' && mode !== 'spectate') || gameState.winner) return;

    const redBotStrategy = mode === 'spectate' ? (spectateConfig?.redBot || 'easy') : null;
    const blueBotStrategy = mode === 'spectate' ? (spectateConfig?.blueBot || 'hard') : (mode === 'bot' || mode === 'tutorial' ? difficulty : null);

    const getBotStrategyForColor = (color) => {
      return color === 'red' ? redBotStrategy : blueBotStrategy;
    };

    const redRole = gameState.roleRed;
    const blueRole = gameState.roleBlue;

    const colorOfRole = (role) => {
      if (redRole === role) return 'red';
      if (blueRole === role) return 'blue';
      return null;
    };

    let activeBotColor = null;
    let activeBotStrategy = null;

    // Determine whose action is required:
    if (gameState.phase === 'setup-defender' || gameState.phase === 'challenge-setup') {
      const activeColor = colorOfRole('defender');
      if (activeColor && getBotStrategyForColor(activeColor)) {
        activeBotColor = activeColor;
        activeBotStrategy = getBotStrategyForColor(activeColor);
      }
    } else if (gameState.phase === 'setup-attacker') {
      const activeColor = colorOfRole('attacker');
      if (activeColor && getBotStrategyForColor(activeColor)) {
        activeBotColor = activeColor;
        activeBotStrategy = getBotStrategyForColor(activeColor);
      }
    } else if (gameState.phase === 'playing') {
      const activeColor = colorOfRole(gameState.turnPlayer);
      if (activeColor && getBotStrategyForColor(activeColor)) {
        activeBotColor = activeColor;
        activeBotStrategy = getBotStrategyForColor(activeColor);
      }
    } else if (gameState.phase === 'challenge-declaration') {
      const activeColor = colorOfRole('attacker');
      if (activeColor && getBotStrategyForColor(activeColor)) {
        activeBotColor = activeColor;
        activeBotStrategy = getBotStrategyForColor(activeColor);
      }
    } else if (gameState.phase === 'role-selection') {
      const winner = gameState.tossWinner;
      if (winner && getBotStrategyForColor(winner)) {
        activeBotColor = winner;
        activeBotStrategy = getBotStrategyForColor(winner);
      }
    } else if (gameState.phase === 'toss') {
      const isRedFinished = gameState.tossRolls.red !== null && gameState.tossRolls.red !== 'rolling';
      if (gameState.tossRolls.red === null && getBotStrategyForColor('red')) {
        activeBotColor = 'red';
        activeBotStrategy = getBotStrategyForColor('red');
      } else if (isRedFinished && gameState.tossRolls.blue === null && getBotStrategyForColor('blue')) {
        activeBotColor = 'blue';
        activeBotStrategy = getBotStrategyForColor('blue');
      }
    } else if (gameState.phase === 'challenge-toss') {
      const isRedFinished = gameState.challengeTossRolls.red !== null && gameState.challengeTossRolls.red !== 'rolling';
      if (gameState.challengeTossRolls.red === null && getBotStrategyForColor('red')) {
        activeBotColor = 'red';
        activeBotStrategy = getBotStrategyForColor('red');
      } else if (isRedFinished && gameState.challengeTossRolls.blue === null && getBotStrategyForColor('blue')) {
        activeBotColor = 'blue';
        activeBotStrategy = getBotStrategyForColor('blue');
      }
    }

    if (!activeBotColor) return;

    // A. Setup Placements
    if (gameState.phase === 'setup-defender' || gameState.phase === 'challenge-setup' || gameState.phase === 'setup-attacker') {
      const timer = setTimeout(() => {
        const action = getBotSetupAction(gameState.board, gameState.phase, activeBotColor, activeBotStrategy, gameState.challengedPiece);
        if (action) executeAction({ ...action, player: activeBotColor });
      }, 300);
      return () => clearTimeout(timer);
    }

    // B. Gameplay turn
    if (gameState.phase === 'playing') {
      // Step 1: Roll dice if not rolled yet
      if (!gameState.hasRolledDice && !gameState.dice.isRolling) {
        const timer = setTimeout(() => {
          executeAction({ type: 'start-roll', player: activeBotColor });
          setTimeout(() => {
            const v1 = Math.floor(Math.random() * 6) + 1;
            const v2 = Math.floor(Math.random() * 6) + 1;
            executeAction({ type: 'end-roll', values: [v1, v2], player: activeBotColor });
          }, 200);
        }, 300);
        return () => clearTimeout(timer);
      }

      // Step 2: Perform actions step-by-step
      if (gameState.hasRolledDice && gameState.actionPoints > 0 && !gameState.dice.isRolling) {
        const botRole = activeBotColor === colorOfRole('attacker') ? 'attacker' : 'defender';
        
        getBotPlayAction(gameState.board, botRole, gameState.actionPoints, activeBotStrategy, gameState, activeBotColor).then(action => {
          if (action) {
            const delay = getBotActionDelay(activeBotStrategy, action, gameState, humanMoveTimeAvg.current);
            botTimeoutRef.current = setTimeout(() => {
              executeAction({ ...action, player: activeBotColor });
            }, delay);
          } else {
            botTimeoutRef.current = setTimeout(() => {
              executeAction({ type: 'end-turn', player: activeBotColor });
            }, 300);
          }
        });

        return () => {
          if (botTimeoutRef.current) clearTimeout(botTimeoutRef.current);
        };
      }

      // Step 3: End turn if no AP left
      if (gameState.hasRolledDice && gameState.actionPoints === 0 && !gameState.dice.isRolling) {
        const timer = setTimeout(() => {
          executeAction({ type: 'end-turn', player: activeBotColor });
        }, 300);
        return () => clearTimeout(timer);
      }
    }

    // C. Challenge Declaration
    if (gameState.phase === 'challenge-declaration') {
      const timer = setTimeout(() => {
        // In tutorial mode, bot only challenges once — if it lost the toss it just ends the set
        if (mode === 'tutorial') {
          if (!botChallengeAttempted.current) {
            botChallengeAttempted.current = true;
            const captured = gameState.capturedPieces || [];
            const target = captured.includes('block-50') ? 'block-50' : captured.includes('block-30') ? 'block-30' : (captured[0] || 'block-50');
            executeAction({ type: 'declare-challenge', declare: true, pieceType: target, player: activeBotColor });
          } else {
            executeAction({ type: 'declare-challenge', declare: false, player: activeBotColor });
          }
          return;
        }

        const action = getBotChallengeAction(gameState.board, gameState, activeBotColor, activeBotStrategy);
        if (action) {
          executeAction({ ...action, player: activeBotColor });
        } else {
          executeAction({ type: 'declare-challenge', declare: false, player: activeBotColor });
        }
      }, 400);
      return () => clearTimeout(timer);
    }

    // D. Challenge Toss Roll
    if (gameState.phase === 'challenge-toss') {
      const isRedFinished = gameState.challengeTossRolls.red !== null && gameState.challengeTossRolls.red !== 'rolling';
      
      if (activeBotColor === 'red') {
        const timer = setTimeout(() => {
          executeAction({ type: 'challenge-start-roll', player: 'red' });
          setTimeout(() => {
            const val = Math.floor(Math.random() * 6) + 1;
            executeAction({ type: 'challenge-roll', value: val, player: 'red' });
          }, 200);
        }, 300);
        return () => clearTimeout(timer);
      } else if (activeBotColor === 'blue') {
        const timer = setTimeout(() => {
          executeAction({ type: 'challenge-start-roll', player: 'blue' });
          setTimeout(() => {
            const blueVal = mode === 'tutorial' ? (Math.random() < 0.8 ? 1 : 2) : (Math.floor(Math.random() * 6) + 1);
            executeAction({ type: 'challenge-roll', value: blueVal, player: 'blue' });
          }, 200);
        }, 300);
        return () => clearTimeout(timer);
      }
    }

    // E. Initial Toss Roll
    if (gameState.phase === 'toss') {
      const isRedFinished = gameState.tossRolls.red !== null && gameState.tossRolls.red !== 'rolling';
      
      if (activeBotColor === 'red') {
        const timer = setTimeout(() => {
          executeAction({ type: 'toss-start-roll', player: 'red' });
          setTimeout(() => {
            const val = Math.floor(Math.random() * 6) + 1;
            executeAction({ type: 'toss-roll', value: val, player: 'red' });
          }, 200);
        }, 300);
        return () => clearTimeout(timer);
      } else if (activeBotColor === 'blue') {
        const timer = setTimeout(() => {
          executeAction({ type: 'toss-start-roll', player: 'blue' });
          setTimeout(() => {
            const blueVal = mode === 'tutorial' ? (Math.random() < 0.8 ? 1 : 2) : (Math.floor(Math.random() * 6) + 1);
            executeAction({ type: 'toss-roll', value: blueVal, player: 'blue' });
          }, 200);
        }, 300);
        return () => clearTimeout(timer);
      }
    }

    // F. Role Selection
    if (gameState.phase === 'role-selection') {
      const timer = setTimeout(() => {
        let selectedRole = 'attacker';
        if (activeBotStrategy === 'easy') {
          selectedRole = Math.random() < 0.5 ? 'attacker' : 'defender';
        } else if (activeBotStrategy === 'medium') {
          selectedRole = 'defender';
        } else {
          selectedRole = 'attacker';
        }
        executeAction({ type: 'toss-select-role', role: selectedRole, player: activeBotColor });
      }, 300);
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
    gameState.roleRed,
    gameState.roleBlue,
    difficulty, 
    spectateConfig,
    executeAction
  ]);

  // Dice rolling callback
  const rollDice = useCallback(() => {
    if (gameState.dice.isRolling) return;
    executeAction({ type: 'start-roll' });
    setTimeout(() => {
      let v1 = Math.floor(Math.random() * 6) + 1;
      let v2 = Math.floor(Math.random() * 6) + 1;
      
      executeAction({ type: 'end-roll', values: [v1, v2] });
    }, 600);
  }, [executeAction, gameState.dice.isRolling, mode]);

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

  // NEW: handle automatic state transitions
  useEffect(() => {
    if (status === 'connected' && role !== 'red') return; // Only host or local drives state transitions

    // Auto-end turn when AP reaches 0
    if (gameState.phase === 'playing' && gameState.hasRolledDice && gameState.actionPoints === 0 && !gameState.dice.isRolling) {
      // If it's the bot's turn, the bot loop handles it faster, but this acts as a fallback or for human players
      const timer = setTimeout(() => {
        executeAction({ type: 'end-turn' });
      }, 1500);
      return () => clearTimeout(timer);
    }

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
      let val = Math.floor(Math.random() * 6) + 1;
      if (mode === 'tutorial' && window.__TUTORIAL_TOSS__) {
        val = window.__TUTORIAL_TOSS__[0];
      }
      executeAction({ type: 'toss-roll', value: val });
    }, 600);
  }, [executeAction, mode]);

  const selectRole = useCallback((selectedRole) => {
    executeAction({ type: 'toss-select-role', role: selectedRole });
  }, [executeAction]);

  const rollChallengeToss = useCallback(() => {
    executeAction({ type: 'challenge-start-roll' });
    setTimeout(() => {
      // In tutorial mode, bias the player toward winning the challenge toss
      let v = mode === 'tutorial' ? (Math.random() < 0.8 ? 6 : 5) : (Math.floor(Math.random() * 6) + 1);
      executeAction({ type: 'challenge-roll', value: v });
    }, 600);
  }, [executeAction, mode]);

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
