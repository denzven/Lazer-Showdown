import React, { useState } from 'react';
import Layout from './Layout';
import { getDynamicTutorialStep } from '../core/TutorialScenario';

export default function TutorialLayout({ network, originalGame, onExit }) {
  const [hasSeenIntro, setHasSeenIntro] = useState(false);

  React.useEffect(() => {
    // Rig the toss so the user (Red) always rolls a 6 to win the toss
    window.__TUTORIAL_TOSS__ = [6];
    return () => {
      delete window.__TUTORIAL_TOSS__;
    };
  }, []);

  // Pass all methods through directly to originalGame so the player can play freely.
  const gameProxy = new Proxy(originalGame, {
    get(target, prop) {
      if (typeof target[prop] === 'function') {
        return (...args) => target[prop](...args);
      }
      return target[prop];
    }
  });

  // Calculate the current contextual step based on game state
  let step = null;
  if (!hasSeenIntro) {
    step = {
      title: "SYSTEM OVERRIDE DETECTED...",
      instruction: "Incoming transmission...\n\nGreetings, Recruit. I am Commander Zlorooklp.\n\nIn Lazer Showdown, the Attacker hunts the Defender's pieces with a Lazer. You'll play freely against our elite AI Simulation Bot, and I'll provide guidance along the way.\n\nClick PROCEED to initialize.",
      expectedAction: { type: 'next' },
      overlayPosition: 'center'
    };
  } else {
    step = getDynamicTutorialStep(originalGame);
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
        onTutorialNext={() => setHasSeenIntro(true)} 
      />
    </div>
  );
}
