import { traceLaserBeam, BOARD_SIZE } from './Ruleset.js';

// Pick a message from a pool based on a numeric seed so it varies without being random on every render
const pick = (arr, seed) => arr[Math.abs(seed) % arr.length];

export const getDynamicTutorialStep = (gameState, completedSteps = {}) => {
  if (!gameState) return null;

  const { phase, turnPlayer, round, winner, roleRed, roleBlue, challengeActive, actionPoints, hasRolledDice, capturedPieces } = gameState;
  const isPlayerAttacker = roleRed === 'attacker';
  const isPlayerDefender = roleRed === 'defender';
  const currentTurnRole = turnPlayer === 'red' ? roleRed : roleBlue;

  // Use multiple game values for a varied but stable seed per state
  const seed = (round || 0) * 31 + (actionPoints || 0) * 17 + (hasRolledDice ? 7 : 0) + (capturedPieces?.length || 0) * 3;

  // ─── GAME OVER ────────────────────────────────────────────────────────────────
  if (winner) {
    return {
      title: "SIMULATION COMPLETE",
      instruction: "A stunning conclusion! Just like my first friendly match with a human soldier after the Treaty of 3042. You are now ready for a real match! Click **LEAVE** to exit.",
      highlightButton: 'leave-game',
      overlayPosition: 'bottom'
    };
  }

  // ─── TOSS PHASE ───────────────────────────────────────────────────────────────
  if (phase === 'toss') {
    if (!completedSteps['info_toss']) {
      return {
        title: "THE TOSS",
        instruction: "Welcome to Lazer Showdown. Before every match, both sides roll a Toss to see who gets to choose their role (**Attacker** or **Defender**). Click **PROCEED** to continue.",
        expectedAction: { type: 'next' },
        stepId: 'info_toss',
        overlayPosition: 'bottom'
      };
    }
    return {
      title: "YOUR TURN",
      instruction: "Click **ROLL TOSS** to roll the dice. I have rigged the simulation so you will win the toss.",
      highlightButton: 'roll-toss',
      overlayPosition: 'bottom'
    };
  }

  // ─── ROLE SELECTION ───────────────────────────────────────────────────────────
  if (phase === 'role-selection') {
    return {
      title: "TOSS WON — CHOOSE ROLE",
      instruction: "Excellent! You rolled a 6 and won the toss. The **ATTACKER** controls the **Lazer** and hunts pieces. The **DEFENDER** hides pieces to survive.\n\nSelect **ATTACKER** to take the offensive role for this simulation.",
      highlightButton: 'select-role-attacker',
      overlayPosition: 'bottom'
    };
  }

  // ─── SETUP: DEFENDER ──────────────────────────────────────────────────────────
  if (phase === 'setup-defender') {
    if (isPlayerDefender) {
      if (!completedSteps['info_setup_def_1']) {
        return {
          title: "DEFENDER SETUP",
          instruction: "As the **Defender**, you must hide your 20, 30, and 50 point pieces anywhere on your half of the board. You also get two mirrors to deflect the **Lazer**.",
          expectedAction: { type: 'next' },
          stepId: 'info_setup_def_1',
          overlayPosition: 'top'
        };
      }
      if (!completedSteps['info_setup_def_2']) {
        return {
          title: "RESTRICTED ZONES",
          instruction: "Important: You may NOT place point pieces in the four corners of the board. Those are reserved for the **Attacker's** **Lazer**.",
          expectedAction: { type: 'next' },
          stepId: 'info_setup_def_2',
          overlayPosition: 'top'
        };
      }
      return {
        title: "DEFENSIVE SETUP",
        instruction: "Place your point pieces and mirrors strategically. I've highlighted some suggested locations. Click **CONFIRM** when ready.",
        highlightButton: 'confirm-setup',
        highlights: [{ r: 8, c: 2 }, { r: 7, c: 6 }, { r: 9, c: 8 }, { r: 6, c: 4 }, { r: 8, c: 7 }],
        overlayPosition: 'top'
      };
    } else {
      return {
        title: "WAITING FOR DEFENDER",
        instruction: "The AI Bot is currently hiding its point pieces and mirrors. Watch carefully—you might notice patterns.",
        overlayPosition: 'top'
      };
    }
  }

  // ─── SETUP: ATTACKER ──────────────────────────────────────────────────────────
  if (phase === 'setup-attacker') {
    if (isPlayerAttacker) {
      if (!completedSteps['info_setup_atk_1']) {
        return {
          title: "ATTACKER SETUP",
          instruction: "As the **Attacker**, your only piece is the **Lazer**. It MUST be placed on one of your two corner squares.",
          expectedAction: { type: 'next' },
          stepId: 'info_setup_atk_1',
          overlayPosition: 'top'
        };
      }
      let closestCorner = null;
      let minDist = Infinity;

      let piece50 = null;
      for (let r = 0; r < 12; r++) {
        for (let c = 0; c < 12; c++) {
          if (gameState.board[r] && gameState.board[r][c] && gameState.board[r][c].type === 'block-50') {
            piece50 = { r, c };
            break;
          }
        }
        if (piece50) break;
      }

      if (piece50) {
        const isRedAttacker = roleRed === 'attacker';
        const backRow = isRedAttacker ? 0 : BOARD_SIZE - 1;
        const corners = [{ r: backRow, c: 0 }, { r: backRow, c: BOARD_SIZE - 1 }];
        let bestCorner = null;
        let bestScore = -1;
        let bestPathLen = Infinity;

        for (const corner of corners) {
          for (const rot of [0, 90, 180, 270]) {
            const trace = traceLaserBeam(gameState.board, corner, rot);
            if (!trace.hitPiece) continue;
            const hits50 = trace.hitPiece.cell && trace.hitPiece.cell.type === 'block-50';
            const bounces = trace.path ? trace.path.filter(p => p.type === 'mirror-bounce').length : 0;
            const pathLen = trace.path ? trace.path.length : 99;
            let score = 0;
            if (hits50 && bounces === 0) score = 3;
            else if (hits50 && bounces > 0) score = 2;
            else score = 1;

            if (score > bestScore || (score === bestScore && pathLen < bestPathLen)) {
              bestScore = score;
              bestPathLen = pathLen;
              bestCorner = corner;
            }
          }
        }

        if (!bestCorner) {
          corners.forEach(corner => {
            const dist = Math.abs(corner.r - piece50.r) + Math.abs(corner.c - piece50.c);
            if (dist < minDist) {
              minDist = dist;
              bestCorner = corner;
            }
          });
        }
        closestCorner = bestCorner;
      }

      return {
        title: "PLACE LAZER",
        instruction: "Click the highlighted corner to place your **Lazer**, click the piece to rotate it to face the enemy, then click **CONFIRM**.",
        highlightButton: 'confirm-setup',
        highlight: closestCorner,
        overlayPosition: 'top'
      };
    } else {
      return {
        title: "WAITING FOR ATTACKER",
        instruction: "The AI Bot is positioning its **Lazer** on a corner square. Prepare your evasive maneuvers!",
        overlayPosition: 'top'
      };
    }
  }

  // ─── PLAYING PHASE ────────────────────────────────────────────────────────────
  if (phase === 'playing') {
    if (gameState.customData && gameState.customData.lazerHitMessage) {
      const hitStepId = `lazer_fired_${round}_${turnPlayer}_${actionPoints}`;
      if (!completedSteps[hitStepId]) {
        return {
          stepId: hitStepId,
          title: "LAZER FIRED!",
          instruction: `Result: ${gameState.customData.lazerHitMessage}`,
          overlayPosition: 'center',
          expectedAction: { type: 'next' }
        };
      }
    }

    let hasLock = false;
    let lazerPos = null;
    let lazerDir = 0;
    if (gameState.board) {
      for (let r = 0; r < 12; r++) {
        for (let c = 0; c < 12; c++) {
          if (gameState.board[r] && gameState.board[r][c] && gameState.board[r][c].type === 'block-lazer') {
            lazerPos = { r, c };
            lazerDir = gameState.board[r][c].rotation || 0;
            break;
          }
        }
      }
      if (lazerPos) {
        const trace = traceLaserBeam(gameState.board, lazerPos, lazerDir);
        if (trace.hitPiece && ['block-20', 'block-30', 'block-50'].includes(trace.hitPiece.cell.type)) {
          hasLock = true;
        }
      }
    }

    // ── ATTACKER, PLAYER'S TURN ──
    if (turnPlayer === 'attacker' && isPlayerAttacker) {
      if (round === 1 && !actionPoints && !hasRolledDice && !completedSteps['info_play_atk_1']) {
        return {
          title: "ACTION POINTS",
          instruction: "You roll two dice every turn to get **Action Points (AP)**.",
          expectedAction: { type: 'next' },
          stepId: 'info_play_atk_1',
          overlayPosition: 'top'
        };
      }
      if (round === 1 && !actionPoints && !hasRolledDice && !completedSteps['info_play_atk_2']) {
        return {
          title: "USING AP",
          instruction: "It costs 1 AP to **MOVE**, 1 AP to **ROTATE**, and 1 AP to **FIRE**. When the **Lazer** hits a mirror, it bounces 90 degrees.",
          expectedAction: { type: 'next' },
          stepId: 'info_play_atk_2',
          overlayPosition: 'top'
        };
      }
      
      if (!actionPoints && !hasRolledDice) {
         return {
           title: "ROLL DICE",
           instruction: "Click **ROLL AP DICE** to generate **Action Points** for this turn.",
           highlightButton: 'roll-dice',
           overlayPosition: 'top'
         };
      }

      const lockMsgs = [
        "I've got a **lock** on a point piece! **Fire** when ready!",
        "Target acquired! The **Lazer** has a clear line of sight. **Fire** before they move!",
        "Direct targeting solution achieved! **Fire the Lazer** now — don't give them time to dodge!"
      ];
      const idleMsgs = [
        "Move your **Lazer** into position! It costs **1 AP** to move, **1 AP** to rotate, and **1 AP** to fire. Plan carefully!",
        "Hunting for a clear shot? Inch the **Lazer** closer and rotate to find the perfect angle. Use your **AP** wisely!",
        "The **mirrors** on the board can deflect your beam — but they can also deflect the enemy's! Use them to bounce shots around corners."
      ];
      return {
        title: `ROUND ${round} — YOUR TURN TO ATTACK`,
        instruction: hasLock ? pick(lockMsgs, seed) : pick(idleMsgs, seed),
        highlightButton: hasLock ? 'fire-lazer' : null,
        overlayPosition: 'top'
      };
    }

    // ── ATTACKER'S TURN, PLAYER IS DEFENDER ──
    if (turnPlayer === 'attacker' && !isPlayerAttacker) {
      return {
        title: `ROUND ${round} — EVASIVE MANEUVERS!`,
        instruction: "The enemy **Lazer** is moving. Watch carefully — every position it reaches tells you something about their plan.",
        overlayPosition: 'top'
      };
    }

    // ── DEFENDER'S TURN, PLAYER IS DEFENDER ──
    if (turnPlayer === 'defender' && isPlayerDefender) {
      if (round === 1 && !actionPoints && !hasRolledDice && !completedSteps['info_play_def_1']) {
        return {
          title: "DEFENDER DYNAMICS",
          instruction: "As **Defender**, you score points simply by surviving! If your pieces survive 3 full rounds, you get their point value.",
          expectedAction: { type: 'next' },
          stepId: 'info_play_def_1',
          overlayPosition: 'bottom'
        };
      }
      if (!actionPoints && !hasRolledDice) {
         return {
           title: "ROLL DICE",
           instruction: "Click **ROLL AP DICE** to generate **Action Points**. You can use **AP** to shuffle your pieces out of the line of fire.",
           highlightButton: 'roll-dice',
           overlayPosition: 'bottom'
         };
      }

      return {
        title: `ROUND ${round} — DEFEND YOURSELF`,
        instruction: "Stay out of their line of sight! Shuffle your pieces to unpredictable positions. Use your **mirrors** to block shots.",
        overlayPosition: 'bottom'
      };
    }

    // 🛡️ DEFENDER'S TURN, PLAYER IS ATTACKER 🛡️
    if (turnPlayer === 'defender' && !isPlayerDefender) {
      return {
        title: `ROUND ${round} — ENEMY'S TURN`,
        instruction: "The **Defender** is repositioning. Watch carefully — wherever they move their pieces tells you where NOT to aim next turn.",
        overlayPosition: 'bottom'
      };
    }
  }

  // ─── CHALLENGE DECLARATION ────────────────────────────────────────────────────
  if (phase === 'challenge-declaration') {
    if (isPlayerAttacker) {
      if (!completedSteps['info_challenge_1']) {
        return {
          title: "TOTAL ANNIHILATION",
          instruction: "Outstanding! You destroyed every last piece before the 3 rounds were up!",
          expectedAction: { type: 'next' },
          stepId: 'info_challenge_1',
          overlayPosition: 'bottom'
        };
      }
      return {
        title: "CHALLENGE PHASE",
        instruction: "As the **Attacker**, you may now call a 50-point **Challenge**. Declare it to win a **Challenge Toss** for one final shot!",
        overlayPosition: 'bottom'
      };
    } else {
      return {
        title: "ANNIHILATION — DEFEND YOUR HONOR",
        instruction: "All your pieces are gone! The enemy **Attacker** is deciding whether to call a **Challenge**.",
        overlayPosition: 'bottom'
      };
    }
  }

  // ─── CHALLENGE TOSS ───────────────────────────────────────────────────────────
  if (phase === 'challenge-toss') {
    return {
      title: "CHALLENGE TOSS",
      instruction: "Both sides must roll! Roll high to win the toss. Click **ROLL TOSS**.",
      highlightButton: 'roll-toss',
      overlayPosition: 'bottom'
    };
  }

  // ─── CHALLENGE TOSS RESULT ────────────────────────────────────────────────────
  if (phase === 'challenge-toss-result') {
    return {
      title: "CHALLENGE TOSS — RESOLVING...",
      instruction: "The results are in! Watch the dice...",
      overlayPosition: 'bottom'
    };
  }

  // ─── CHALLENGE SETUP ──────────────────────────────────────────────────────────
  if (phase === 'challenge-setup') {
    if (isPlayerAttacker) {
      return {
        title: "FINAL STRIKE",
        instruction: "You won the **Challenge Toss**! The **Defender** must place their piece back on the board. Move your **Lazer** into the best position for one final shot!",
        overlayPosition: 'top'
      };
    } else {
      return {
        title: "CHALLENGE SETUP",
        instruction: "The enemy won the **Challenge Toss**. Place your piece back on the board — try to hide it behind a **mirror** if possible.",
        overlayPosition: 'top'
      };
    }
  }

  // ─── FALLBACK ─────────────────────────────────────────────────────────────────
  return {
    title: "COMBAT SIMULATION",
    instruction: "Stay sharp, human! Maintain situational awareness.",
    overlayPosition: 'bottom'
  };
};
