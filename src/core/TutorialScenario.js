import { traceLaserBeam, BOARD_SIZE } from './Ruleset.js';

// Pick a message from a pool based on a numeric seed so it varies without being random on every render
const pick = (arr, seed) => arr[Math.abs(seed) % arr.length];

export const getDynamicTutorialStep = (gameState) => {
  if (!gameState) return null;

  const { phase, turnPlayer, round, winner, roleRed, roleBlue, challengeActive, actionPoints, hasRolledDice, capturedPieces } = gameState;
  const isPlayerAttacker = roleRed === 'attacker';
  const isPlayerDefender = roleRed === 'defender';

  // Use multiple game values for a varied but stable seed per state
  const seed = (round || 0) * 31 + (actionPoints || 0) * 17 + (hasRolledDice ? 7 : 0) + (capturedPieces?.length || 0) * 3;

  // ─── GAME OVER ────────────────────────────────────────────────────────────────
  if (winner) {
    const msgs = [
      "A stunning conclusion! Just like my first friendly match with a human soldier after the Treaty of 3042. You are now ready for a real match! Click **LEAVE** to exit.",
      "La-Sir-She-Dan has been played — and played well! The veterans of planet Ser would salute you. Click **LEAVE** to return to the hall.",
      "Simulation complete, recruit! That was textbook La-Sir-She-Dan. You have earned the right to face a real opponent. Click **LEAVE** to exit.",
      "Outstanding performance! When I first taught this game to a human soldier back in 3042, it took three sessions before they understood the mirrors. You caught on fast. Click **LEAVE** to exit.",
      "The simulation ends, but the war goes on. Remember what you learned here. The **Lazer** is everything. Click **LEAVE** to continue.",
    ];
    return {
      title: "SIMULATION COMPLETE",
      instruction: pick(msgs, seed),
      highlightButton: 'leave-game',
      overlayPosition: 'bottom'
    };
  }

  // ─── TOSS PHASE ───────────────────────────────────────────────────────────────
  if (phase === 'toss') {
    const msgs = [
      "Greetings, human recruit! We call this game La-Sir-She-Dan, but I know you call it **Lazer Showdown**. Let's play a casual simulation. First, both sides must **TOSS** to decide who picks their role. Click **ROLL TOSS**!",
      "Welcome to the simulation! Before we begin, tradition demands a **TOSS**. Whoever wins the roll gets first pick of roles — **Attacker** or **Defender**. Click **ROLL TOSS** to begin!",
      "Ah, a new recruit! I have trained many soldiers on planet Ser. The first step is always the **TOSS**. Roll the dice and we'll see if fortune smiles on you today! Click **ROLL TOSS**.",
      "In La-Sir-She-Dan, nothing is decided by rank alone. Everything starts with a **TOSS**. Show me what the dice think of you, recruit. Click **ROLL TOSS**!",
      "Before the first shot is fired, the dice must speak. This is the law of La-Sir-She-Dan. Click **ROLL TOSS** to see who earns first choice of role!",
    ];
    return {
      title: "INITIALIZING TOSS",
      instruction: pick(msgs, seed),
      highlightButton: 'roll-toss',
      overlayPosition: 'bottom'
    };
  }

  // ─── ROLE SELECTION ───────────────────────────────────────────────────────────
  if (phase === 'role-selection') {
    const msgs = [
      "You won the toss! Now choose — **ATTACKER** or **DEFENDER**? The Attacker controls the **Lazer** and hunts point pieces. The Defender hides and protects their pieces for three rounds. The AI Bot takes the opposite role.",
      "Fortune favors you today, recruit! The toss is yours. Pick your role wisely — the **ATTACKER** fires the Lazer, the **DEFENDER** protects their pieces. Choose!",
      "The dice are in your favor! Choose your role — as **ATTACKER** you hunt, as **DEFENDER** you hide. Both are equally noble in La-Sir-She-Dan. What will it be?",
      "You won the toss! In my experience, new recruits prefer to try **ATTACKING** first — there is nothing quite like the satisfaction of a well-aimed beam. But **DEFENDING** has its own art. Your call!",
      "Excellent roll! You have first pick. **ATTACKER** controls the **Lazer** and scores by hitting pieces. **DEFENDER** earns points for each piece that survives 3 full rounds. Choose your destiny!",
    ];
    return {
      title: "ROLE SELECTION",
      instruction: pick(msgs, seed),
      highlightButton: null,
      overlayPosition: 'bottom'
    };
  }

  // ─── SETUP: DEFENDER ──────────────────────────────────────────────────────────
  if (phase === 'setup-defender') {
    if (isPlayerDefender) {
      const msgs = [
        "Hide your **20**, **30**, and **50 point pieces** anywhere on your half of the board! Don't forget your two **mirrors**! I've highlighted some suggested locations — but the enemy doesn't know that. Feel free to go rogue. Click **CONFIRM POINT PLACEMENTS** when ready.",
        "Now the real game of deception begins! Place your **point pieces** and **mirrors** strategically. Put your most valuable piece — the **50** — somewhere the Attacker won't expect. I've highlighted some good spots. Click **CONFIRM** when done!",
        "A good Defender thinks like an Attacker. Where would YOU aim the Lazer? Place your **50**, **30**, and **20 point pieces** away from the obvious angles. Use your **mirrors** to create false paths! Click **CONFIRM POINT PLACEMENTS**.",
        "Scatter your **point pieces** across your half — don't cluster them! A single well-aimed beam can't hit everything at once. Place your two **mirrors** to deflect stray shots. Click **CONFIRM POINT PLACEMENTS** when satisfied.",
        "This is the art of concealment, recruit. Hide your **50-point piece** deepest — it scores the most if it survives. Use your **mirrors** to redirect beams away from your valuables. Highlighted squares are my suggestions. Click **CONFIRM** when ready!",
      ];
      return {
        title: "DEFENSIVE SETUP",
        instruction: pick(msgs, seed),
        highlightButton: 'confirm-setup',
        highlights: [
          { r: 8, c: 2 },
          { r: 7, c: 6 },
          { r: 9, c: 8 },
          { r: 6, c: 4 },
          { r: 8, c: 7 },
        ],
        overlayPosition: 'top'
      };
    } else {
      const msgs = [
        "The AI Bot is currently hiding its **point pieces** and **mirrors**, just like we used to do in the trenches on planet Ser. Wait for it to finish its defensive setup.",
        "The Bot is placing its **pieces** now. Study the board carefully — you may notice patterns in where it likes to hide. Wait for it to confirm.",
        "Patience, recruit. The enemy is setting their defenses. Use this time to plan your opening attack. Which corner gives you the best **Lazer** angle?",
        "The AI Bot is arranging its **point pieces** and **mirrors**. It won't take long. Consider your first move while you wait.",
        "The enemy hides in silence. They always do. Wait for the Bot to finish placing, then the hunt begins.",
      ];
      return {
        title: "WAITING FOR DEFENDER",
        instruction: pick(msgs, seed),
        overlayPosition: 'top'
      };
    }
  }

  // ─── SETUP: ATTACKER ──────────────────────────────────────────────────────────
  if (phase === 'setup-attacker') {
    if (isPlayerAttacker) {
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

        // Score each corner: 3 = direct hit on 50, 2 = mirror hit on 50, 1 = hits another piece, 0 = no hit
        // For ties, prefer shorter path length (fewer moves needed to aim)
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
            if (hits50 && bounces === 0) score = 3; // direct hit on 50
            else if (hits50 && bounces > 0) score = 2; // mirror hit on 50
            else score = 1; // hits some other piece

            if (score > bestScore || (score === bestScore && pathLen < bestPathLen)) {
              bestScore = score;
              bestPathLen = pathLen;
              bestCorner = corner;
            }
          }
        }

        // Fallback to physical distance if no beam hits anything
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

      const msgs = [
        "Time to strike! Place your **Lazer** on one of your corner squares. I've highlighted the corner with the best tactical angle against the enemy's **50-point piece**. Click the **LAZER** to rotate its direction, then click **CONFIRM**.",
        "Your **Lazer** can only start from the corners of your side. I've highlighted the optimal corner — the one that gives you the clearest shot at the **50-point piece**. Rotate it to aim, then **CONFIRM**!",
        "Pick your corner wisely, Attacker. The highlighted square gives you the strongest opening position against their most valuable piece. Click the **LAZER** tile and rotate to aim. Then click **CONFIRM**.",
        "Positioning is everything in La-Sir-She-Dan. I've found the corner that threatens the enemy's **50-point piece** the most. Place your **Lazer** there, rotate it into position, then **CONFIRM** your setup.",
        "Place your **Lazer** on a corner square — only corners are valid starting positions. The highlighted one has the best firing angle I could calculate. Rotate it using clicks, then **CONFIRM**!",
      ];
      return {
        title: "ATTACKER SETUP",
        instruction: pick(msgs, seed),
        highlightButton: 'confirm-setup',
        highlight: closestCorner,
        overlayPosition: 'top'
      };
    } else {
      const msgs = [
        "The AI Bot is positioning its **LAZER**. Prepare your evasive maneuvers! Think about which of your pieces might be in danger.",
        "The enemy is choosing their firing position. Stay calm — once the **LAZER** is placed, you'll see where it's aiming. React accordingly.",
        "The Bot is finding its optimal corner. Use this moment to mentally rehearse your defensive moves. Which piece is most exposed?",
        "The enemy Attacker is setting up. Watch where the **LAZER** lands — that tells you everything about their opening strategy.",
        "The AI is calculating its attack vector. On planet Ser, this would be accompanied by a war drum. Here, there is only silence before the beam.",
      ];
      return {
        title: "WAITING FOR ATTACKER",
        instruction: pick(msgs, seed),
        overlayPosition: 'top'
      };
    }
  }

  // ─── PLAYING PHASE ────────────────────────────────────────────────────────────
  if (phase === 'playing') {
    if (gameState.customData && gameState.customData.lazerHitMessage) {
      return {
        title: "LAZER STRIKE RESULT",
        instruction: gameState.customData.lazerHitMessage,
        overlayPosition: 'bottom'
      };
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
      const lockMsgs = [
        "I've got a **lock** on a point piece! **Fire** when ready!",
        "Target acquired! The **Lazer** has a clear line of sight. **Fire** before they move!",
        "Direct targeting solution achieved! **Fire the Lazer** now — don't give them time to dodge!",
        "The beam path is clear! I see a **point piece** in the crosshairs. Pull the trigger!",
        "LOCK! A piece is in range! Spend **1 AP** to **fire** and score some points!",
      ];
      const idleMsgs = [
        "Roll the dice to gain **Action Points (AP)**. You can spend **AP** to move your **Lazer**, rotate it, or fire a beam!",
        "Move your **Lazer** into position! It costs **1 AP** to move, **1 AP** to rotate, and **1 AP** to fire. Plan carefully!",
        "Hunting for a clear shot? Inch the **Lazer** closer and rotate to find the perfect angle. Use your **AP** wisely!",
        "Think ahead! Sometimes it's worth spending all your **AP** moving into position so you can fire next round with a perfect shot.",
        "The **mirrors** on the board can deflect your beam — but they can also deflect the enemy's! Use them to bounce shots around corners.",
        "If you can't get a direct shot this round, try repositioning to threaten the **50-point piece** from a different angle.",
        "Each **AP** spent gets you closer to a kill. Roll the dice, plan your moves, and don't waste a single point!",
        `Round **${round}** of 3. You have time. Line it up perfectly — a well-placed shot is worth more than a rushed one.`,
      ];
      return {
        title: `ROUND ${round} — YOUR TURN TO ATTACK`,
        instruction: hasLock ? pick(lockMsgs, seed) : pick(idleMsgs, seed),
        overlayPosition: 'top'
      };
    }

    // ── ATTACKER'S TURN, PLAYER IS DEFENDER ──
    if (turnPlayer === 'attacker' && !isPlayerAttacker) {
      const lockMsgs = [
        "**WARNING!** The enemy **Lazer** has a lock on one of your pieces! They are about to fire — brace for impact!",
        "**ALERT!** I'm reading a firing solution on one of your pieces! Get it out of that line NOW if you have **AP**!",
        "The enemy beam is aimed directly at your piece! This is bad, recruit. Very bad. Hope they miss!",
        "**INCOMING!** The **Lazer** is locked on. If you have **AP** remaining, move that piece immediately!",
        "**DANGER!** A piece is in the enemy's crosshairs. Evasive maneuvers — if you still have **AP** left!",
      ];
      const watchMsgs = [
        "The enemy **Lazer** is moving. Watch carefully — every position it reaches tells you something about their plan.",
        "The Bot is making its moves. Stay calm. Observe where the **Lazer** ends up and plan your next defense accordingly.",
        "Enemy turn in progress. Study how the **Lazer** moves — it will help you predict their strategy in future rounds.",
        "The AI is calculating. On planet Ser, we called this the 'long shadow' — the moment before the beam fires.",
        "Watch the **Lazer** carefully. Sometimes the enemy repositions without firing — saving up for a better shot next round.",
        "The enemy is spending their **AP**. Count the moves — that tells you how many **AP** they rolled and how many are left.",
        "Patience. The enemy moves slowly and methodically. Use this time to identify which of your pieces is most at risk.",
      ];
      return {
        title: `ROUND ${round} — EVASIVE MANEUVERS!`,
        instruction: hasLock ? pick(lockMsgs, seed) : pick(watchMsgs, seed),
        overlayPosition: 'top'
      };
    }

    // ── DEFENDER'S TURN, PLAYER IS DEFENDER ──
    if (turnPlayer === 'defender' && isPlayerDefender) {
      const lockMsgs = [
        "**Warning!** You have a piece directly in the **Lazer's crosshairs**! Move it this turn or risk losing it!",
        "**EVASIVE ACTION!** The enemy beam is locked onto one of your pieces. Use your **AP** to relocate it immediately!",
        "I'm reading a threat! The **Lazer** is perfectly aligned with one of your pieces. Move it, or accept the loss!",
        "**URGENT!** Get that piece out of the firing line! Spend your **AP** to move it somewhere safer NOW!",
        "Threat detected! Your piece is in immediate danger. Reposition it behind a **mirror** if you can — that will deflect the beam!",
      ];
      const safeMsgs = [
        "Roll the dice for **AP**! Move your **point pieces** and **mirrors** to keep the enemy **Lazer** confused. Each piece that survives a round earns you points!",
        "Stay out of their line of sight! Shuffle your pieces to unpredictable positions. The enemy will have to reposition to find a shot.",
        "Evasive maneuvers! Use your **AP** to scramble your pieces before the enemy fires. A moving target is always harder to hit.",
        "A good Defender never leaves their pieces in the same spot two rounds in a row. Keep moving — predictability is death!",
        "Your **mirrors** aren't just decorative — reposition them to create false beam paths. A well-placed mirror can save a **50-point piece**!",
        "Think defensively: which piece is most exposed right now? Move it first. Then reposition your **mirrors** to cover the others.",
        "You earn points simply by surviving! Every round where a piece lives, you score. Don't take unnecessary risks — just stay alive!",
        `Round **${round}** — keep your formation tight. The enemy is looking for a clean shot. Deny them that satisfaction!`,
        "Don't forget you can rotate your **mirrors** too! A mirror facing the right direction can deflect an incoming beam away from your valuable pieces.",
      ];
      return {
        title: `ROUND ${round} — DEFEND YOURSELF`,
        instruction: hasLock ? pick(lockMsgs, seed) : pick(safeMsgs, seed),
        overlayPosition: 'bottom'
      };
    }

    // ── DEFENDER'S TURN, PLAYER IS ATTACKER ──
    if (turnPlayer === 'defender' && !isPlayerDefender) {
      const enemyMsgs = [
        "The enemy is scrambling their defenses. Anticipate their move — they will try to hide from your **Lazer**.",
        "The Defender is repositioning. Watch carefully — wherever they move their pieces tells you where NOT to aim next turn.",
        "The Bot is rearranging its **point pieces**. Study the new layout and plan your next firing solution.",
        "The enemy is scrambling. This is the dance of La-Sir-She-Dan — the Attacker hunts, the Defender evades. Let the hunt continue.",
        "Defender's turn. They may reposition their **mirrors** to deflect your beam. Be ready to readjust your angle next turn.",
        "The Bot is using its **AP** defensively. Notice how it moves — does it prioritize the **50-point piece** or the mirrors?",
        "The enemy is trying to break your lock. After their turn, check if your current **Lazer** angle still has a clear shot.",
        "Patience, Attacker. The prey is moving. When it's your turn, recalculate and strike decisively.",
      ];
      return {
        title: `ROUND ${round} — ENEMY'S TURN`,
        instruction: pick(enemyMsgs, seed),
        overlayPosition: 'bottom'
      };
    }
  }

  // ─── CHALLENGE DECLARATION ────────────────────────────────────────────────────
  if (phase === 'challenge-declaration') {
    if (isPlayerAttacker) {
      const msgs = [
        "Outstanding! You destroyed every last piece! As the **Attacker**, you may now call a **50-point Challenge**. Declare it and win the **Challenge Toss** to claim one final shot at the highest value piece!",
        "Annihilation! The board is clear. This is the moment you've trained for — call the **Challenge** and earn the right to fire one last devastating shot at a reconstructed **50-point piece**!",
        "Flawless destruction! Every piece is gone. Now declare the **Challenge** — one final toss, one final shot. The **50 points** are within reach!",
        "The Defender's pieces are dust! Declare the **Challenge** to reconstruct their most valuable piece and fire one decisive beam at it. Don't hesitate!",
        "Total annihilation achieved! In La-Sir-She-Dan, the victorious Attacker earns the right to one final **Challenge**. Claim it! Declare the **50-point Challenge** now!",
      ];
      return {
        title: "ANNIHILATION — CHALLENGE PHASE",
        instruction: pick(msgs, seed),
        overlayPosition: 'bottom'
      };
    } else {
      const msgs = [
        "All your pieces are gone! The enemy **Attacker** is deciding whether to call a **Challenge**. If they do, you'll face a **Challenge Toss** — win it and your **50-point piece** is spared!",
        "The board is empty. Brace yourself — the enemy may declare a **Challenge** for one final shot. If you win the toss, you survive. Stay focused!",
        "Your defenses have fallen. The Attacker now holds the advantage. They may call a **Challenge** — if so, everything comes down to the **toss**. Prepare yourself!",
        "An honorable defense, but the pieces are gone. Now it falls to luck — if the enemy declares a **Challenge**, you must win the toss to keep your **50 points**.",
        "The last piece has fallen. In La-Sir-She-Dan, this is called the 'empty board moment.' The enemy will likely declare a **Challenge**. Win the toss, and you save your honor!",
      ];
      return {
        title: "ANNIHILATION — DEFEND YOUR HONOR",
        instruction: pick(msgs, seed),
        overlayPosition: 'bottom'
      };
    }
  }

  // ─── CHALLENGE TOSS ───────────────────────────────────────────────────────────
  if (phase === 'challenge-toss') {
    if (isPlayerAttacker) {
      const msgs = [
        "Both sides must roll! Roll **high** to win the toss and earn the right to place your **Lazer** one final time. The fate of the simulation rests on this roll. Click **ROLL TOSS**!",
        "The **Challenge Toss** determines who controls the final shot. Roll higher than the Defender and you get to reposition your **Lazer** for one last decisive strike. Click **ROLL TOSS**!",
        "This is it — the final dice roll. Roll a high number to secure the **Challenge**. The Defender is hoping you fail. Don't! Click **ROLL TOSS**!",
        "One roll. One chance. Win this toss and the **50-point piece** is yours for the taking. The dice have always favored the bold. Click **ROLL TOSS**!",
        "The ancient law of La-Sir-She-Dan demands a **toss** before the final shot. Roll high, recruit. Fortune favors the attacker today! Click **ROLL TOSS**!",
      ];
      return {
        title: "CHALLENGE TOSS — ROLL FOR GLORY",
        instruction: pick(msgs, seed),
        highlightButton: 'roll-toss',
        overlayPosition: 'bottom'
      };
    } else {
      const msgs = [
        "Roll **high** to win the toss! Beat the enemy's roll and your **50-point piece** is protected — their Challenge fails and you keep the points. Click **ROLL TOSS**!",
        "Everything depends on this roll. If you roll higher than the enemy, the **Challenge is denied** and your **50-point piece** survives unscathed. Click **ROLL TOSS**!",
        "The enemy declared the **Challenge**. Now you fight back with the dice. Roll higher than them and deny their final shot. You've got this! Click **ROLL TOSS**!",
        "Defend with the dice! Win this **Challenge Toss** and the Attacker loses points instead of you gaining them. Roll high! Click **ROLL TOSS**!",
        "In La-Sir-She-Dan, the Defender always gets a fighting chance. This is yours. Roll higher and deny the enemy their glory! Click **ROLL TOSS**!",
      ];
      return {
        title: "CHALLENGE TOSS — HOLD THE LINE",
        instruction: pick(msgs, seed),
        highlightButton: 'roll-toss',
        overlayPosition: 'bottom'
      };
    }
  }

  // ─── CHALLENGE TOSS RESULT ────────────────────────────────────────────────────
  if (phase === 'challenge-toss-result') {
    const msgs = [
      "The results are in! Watch the dice...",
      "The dice have spoken. Resolving the toss now...",
      "Calculating the outcome of the **Challenge Toss**...",
      "The rolls are compared. Destiny is decided...",
      "The moment of truth. Who wins the **Challenge Toss**?",
    ];
    return {
      title: "CHALLENGE TOSS — RESOLVING...",
      instruction: pick(msgs, seed),
      overlayPosition: 'bottom'
    };
  }

  // ─── CHALLENGE SETUP ──────────────────────────────────────────────────────────
  if (phase === 'challenge-setup') {
    if (isPlayerAttacker) {
      const msgs = [
        "You won the Challenge Toss! The Defender must place their piece back on the board. Move your **Lazer** into the best position for one final **decisive shot**. Make it count!",
        "Victory in the toss! Now position your **Lazer** for the killing blow. The Defender has to place their **piece** back — find the angle that hits it before they can hide it!",
        "The Challenge Toss is yours! This is the final moment of the simulation. Reposition your **Lazer**, aim true, and fire the shot that ends it all!",
        "Excellent! You've earned one final shot. Move your **Lazer** to the optimal corner, rotate to aim at the Defender's reconstructed piece, and **fire**. No second chances!",
        "The final shot is yours to take! Reposition your **Lazer**, recalculate the angles — including mirror bounces — and deliver the killing blow. The simulation ends here!",
      ];
      return {
        title: "FINAL STRIKE — POSITION YOUR LAZER",
        instruction: pick(msgs, seed),
        overlayPosition: 'top'
      };
    } else {
      const msgs = [
        "The enemy won the Challenge Toss. Place your piece back on the board — try to hide it behind a **mirror** if possible. The enemy **Lazer** will be repositioned for one final shot!",
        "The Challenge Toss is lost, but the fight isn't over! Place your piece in the hardest possible spot to hit. Use your **mirrors** to create deflection angles. Make them work for it!",
        "You must place the challenged piece back on the board. Choose a spot that forces the enemy to bounce the beam at least once. A corner behind a **mirror** could save you!",
        "Even in defeat, there is strategy! Place your piece where the enemy least expects it — deep in a corner, or behind an angled **mirror**. Every obstacle helps!",
        "The enemy has one shot. Give them the hardest possible target! Place your piece behind cover and **mirrors** — if they miss, you survive and score those precious points!",
      ];
      return {
        title: "CHALLENGE SETUP — HIDE CAREFULLY",
        instruction: pick(msgs, seed),
        overlayPosition: 'top'
      };
    }
  }

  // ─── FALLBACK ─────────────────────────────────────────────────────────────────
  const fallbackMsgs = [
    "Stay sharp, human! Maintain situational awareness.",
    "La-Sir-She-Dan rewards patience and precision. Observe before you act.",
    "Every move matters in La-Sir-She-Dan. Think before you spend your **AP**.",
    "The simulated battlefield awaits your command, recruit.",
    "In the words of the Treaty of 3042 — 'Let skill, not chance, decide the victor.'",
  ];
  return {
    title: "COMBAT SIMULATION",
    instruction: pick(fallbackMsgs, seed),
    overlayPosition: 'bottom'
  };
};
