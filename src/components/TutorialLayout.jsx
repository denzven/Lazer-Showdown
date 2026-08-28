import React, { useState, useEffect, useRef } from 'react';
import Layout from './Layout';
import { getDynamicTutorialStep } from '../core/TutorialScenario';
import { getBotPlayAction, getBotSetupAction } from '../core/BotEngine';

export default function TutorialLayout({ network, originalGame, onExit }) {
  const [hasSeenIntro, setHasSeenIntro] = useState(false);
  const [completedSteps, setCompletedSteps] = useState({});
  const [tutorialHint, setTutorialHint] = useState(null);

  const idleTimerRef = useRef(null);
  const originalGameRef = useRef(originalGame);

  useEffect(() => {
    originalGameRef.current = originalGame;
  }, [originalGame]);

  const resetIdleTimer = () => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    setTutorialHint(null);
    const randomWaitTime = Math.floor(Math.random() * 2000) + 3000;
    idleTimerRef.current = setTimeout(async () => {
      const state = originalGameRef.current.gameState;
      const isPlayerAttacker = state.roleRed === 'attacker';
      const isPlayerTurn = (state.turnPlayer === 'attacker' && isPlayerAttacker) || (state.turnPlayer === 'defender' && !isPlayerAttacker);
      
      const isSetupPhase = state.phase === 'setup-defender' || state.phase === 'setup-attacker';
      const isPlayerSetupTurn = (state.phase === 'setup-defender' && !isPlayerAttacker) || (state.phase === 'setup-attacker' && isPlayerAttacker);

      // Provide hint only during the player's turn to play
      if (state.phase === 'playing' && isPlayerTurn && state.actionPoints > 0) {
        try {
          const action = await getBotPlayAction(state.board, state.turnPlayer, state.actionPoints, 'hard', state, 'red');
          if (action) {
            setTutorialHint(action);
          }
        } catch (e) {
          console.error("Failed to fetch tutorial hint:", e);
        }
      } else if (isSetupPhase && isPlayerSetupTurn) {
        try {
          const action = getBotSetupAction(state.board, state.phase, 'red', 'hard', state.challengedPiece, state.boardHeatmap, state);
          if (action) {
            setTutorialHint(action);
          }
        } catch (e) {
          console.error("Failed to fetch tutorial setup hint:", e);
        }
      }
    }, randomWaitTime);
  };

  useEffect(() => {
    // Rig the toss so the user (Red) always rolls a 6 to win the toss
    window.__TUTORIAL_TOSS__ = [6];
    
    // Add event listeners for inactivity
    window.addEventListener('keydown', resetIdleTimer);
    window.addEventListener('click', resetIdleTimer);
    
    resetIdleTimer();

    return () => {
      delete window.__TUTORIAL_TOSS__;
      window.removeEventListener('keydown', resetIdleTimer);
      window.removeEventListener('click', resetIdleTimer);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, []);

  // Pass all methods through directly to originalGame so the player can play freely.
  let modifiedGameState = originalGame.gameState;
  if (tutorialHint && tutorialHint.type === 'move') {
    const newBoard = modifiedGameState.board.map(row => [...row]);
    const piece = newBoard[tutorialHint.fromR][tutorialHint.fromC];
    if (piece) {
      // Create a ghost copy of the piece at the destination
      newBoard[tutorialHint.toR] = [...newBoard[tutorialHint.toR]];
      newBoard[tutorialHint.toR][tutorialHint.toC] = { ...piece, isGhost: true };
    }
    modifiedGameState = { ...modifiedGameState, board: newBoard };
  } else if (tutorialHint && tutorialHint.type === 'place') {
    const newBoard = modifiedGameState.board.map(row => [...row]);
    newBoard[tutorialHint.r] = [...newBoard[tutorialHint.r]];
    newBoard[tutorialHint.r][tutorialHint.c] = { ...tutorialHint.piece, isGhost: true };
    modifiedGameState = { ...modifiedGameState, board: newBoard };
  }

  const gameProxy = {
    ...originalGame,
    gameState: modifiedGameState,
    activeState: (originalGame.reviewIndex !== null && originalGame.history?.past?.[originalGame.reviewIndex]) 
      ? originalGame.history.past[originalGame.reviewIndex] 
      : modifiedGameState
  };

  // Calculate the current contextual step based on game state
  let step = null;
  if (!hasSeenIntro) {
    step = {
      title: "SYSTEM OVERRIDE DETECTED...",
      instruction: "Incoming transmission...\n\nGreetings, Recruit. I am Commander Zlorooklp.\n\nIn Lazer Showdown, the **Attacker** hunts the **Defender's** pieces with a Lazer. You'll play freely against our elite **AI Simulation Bot**, and I'll provide guidance along the way.\n\nClick **PROCEED** to initialize.",
      expectedAction: { type: 'next' },
      overlayPosition: 'center'
    };
  } else {
    step = getDynamicTutorialStep(originalGame, completedSteps);
    if (tutorialHint) {
       let highlights = [];
       let highlightButton = null;

       if (tutorialHint.type === 'move') {
           highlights = [
               { r: tutorialHint.fromR, c: tutorialHint.fromC },
               { r: tutorialHint.toR, c: tutorialHint.toC }
           ];
       } else if (tutorialHint.type === 'rotate') {
           highlights = [{ r: tutorialHint.r, c: tutorialHint.c }];
           // We need to highlight the rotate cw/ccw buttons
           highlightButton = tutorialHint.dir === 'cw' ? 'rotate-cw' : 'rotate-ccw';
       } else if (tutorialHint.type === 'laser-press') {
           highlightButton = 'fire-lazer';
       } else if (tutorialHint.type === 'place') {
           highlights = [{ r: tutorialHint.r, c: tutorialHint.c }];
       }

       step = {
         ...step,
         title: "TACTICAL SUGGESTION",
         instruction: "Stuck? The **Expectiminimax tactical simulation** advises this **move**.",
         highlights: highlights,
         highlightButton: highlightButton,
         overlayPosition: 'top' // push the overlay out of the way of the board
       };
    }
  }

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}>
      <Layout 
        network={network} 
        game={gameProxy} 
        mode="tutorial"
        tutorialStep={step}
        tutorialError={''} 
        onExitTutorial={onExit}
        onTutorialNext={(stepId) => {
          if (stepId) {
            setCompletedSteps(prev => ({ ...prev, [stepId]: true }));
          } else {
            setHasSeenIntro(true);
          }
        }}
      />
    </div>
  );
}
