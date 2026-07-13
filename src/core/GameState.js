import { 
  BOARD_SIZE, 
  evaluateBoardState, 
  validatePlacement, 
  validateMovement,
  getInitialBoard,
  BLOCK_TYPES,
  traceLaserBeam
} from './Ruleset.js';

function checkPlayActionValidity(phase, hasRolledDice, actionPoints, roleRed, player, turnPlayer) {
  if (phase !== 'playing') {
    return 'Actions are disabled outside the playing phase.';
  }
  if (!hasRolledDice) {
    return 'You must roll the dice before performing actions.';
  }
  if (actionPoints <= 0) {
    return 'No Action Points remaining.';
  }

  const activeRole = roleRed === 'attacker' ? (player === 'red' ? 'attacker' : 'defender') : (player === 'red' ? 'defender' : 'attacker');
  if (activeRole !== turnPlayer) {
    return `It is not your turn! Current turn: ${turnPlayer.toUpperCase()}`;
  }
  return null;
}

function endSetState(board, currentSet, scores, roleRed, dice, context) {
  if (currentSet === 1) {
    const nextRoleRed = roleRed === 'attacker' ? 'defender' : 'attacker';
    const nextRoleBlue = nextRoleRed === 'attacker' ? 'defender' : 'attacker';
    const nextBoard = board.map(row => row.map(cell => (cell && cell.type === 'mirror') ? { ...cell } : null));

    const attPlayer = nextRoleRed === 'attacker' ? 'RED' : 'BLUE';
    const defPlayer = nextRoleRed === 'defender' ? 'RED' : 'BLUE';

    return {
      board: nextBoard,
      phase: 'setup-defender',
      set: 2,
      round: 1,
      roleRed: nextRoleRed,
      roleBlue: nextRoleBlue,
      turnPlayer: 'defender',
      actionPoints: 0,
      hasRolledDice: false,
      scores,
      capturedPieces: [],
      challengeActive: false,
      challengedPiece: null,
      tossRolls: { red: null, blue: null },
      tossWinner: null,
      challengeTossRolls: { red: null, blue: null },
      turnStats: { lazerMove: 0, lazerRotate: 0, lazerFire: 0, pieceMove: 0, pieceMoveBreakdown: { 'block-20': 0, 'block-30': 0, 'block-50': 0 }, wastedAP: 0 },
      logs: ['Set 1 complete. Swapping roles for Set 2!', `New Attacker: ${attPlayer}, Defender: ${defPlayer}. Defender placing point pieces.`],
      customBoardData: context?.customBoardData || null
    };
  } else {
    const redScore = scores.red;
    const blueScore = scores.blue;
    const winner = redScore > blueScore ? 'red' : blueScore > redScore ? 'blue' : 'draw';
    const winLog = winner === 'draw' ? "Game Over! It's a DRAW!" : `Game Over! WINNER: ${winner.toUpperCase()} (${scores[winner]} pts vs ${scores[winner === 'red' ? 'blue' : 'red']} pts)!`;
    return {
      board,
      phase: 'game-over',
      set: 2,
      round: 3,
      roleRed,
      roleBlue: roleRed === 'attacker' ? 'defender' : 'attacker',
      scores,
      winner,
      logs: [winLog],
      turnPlayer: 'defender',
      actionPoints: 0,
      hasRolledDice: false,
      capturedPieces: [],
      challengeActive: false,
      challengedPiece: null,
      tossRolls: { red: null, blue: null },
      tossWinner: null,
      challengeTossRolls: { red: null, blue: null },
      turnStats: { lazerMove: 0, lazerRotate: 0, lazerFire: 0, pieceMove: 0, pieceMoveBreakdown: { 'block-20': 0, 'block-30': 0, 'block-50': 0 }, wastedAP: 0 },
      customBoardData: context?.customBoardData || null
    };
  }
}

export function applySandboxAction(board, action, player, context = {}) {
  const { type } = action;
  let nextBoard = JSON.parse(JSON.stringify(board));

  const phase = context.phase || 'toss';
  const roleRed = context.roleRed || null;
  const roleBlue = context.roleBlue || null;
  const set = context.set || 1;
  const round = context.round || 1;
  const turnPlayer = context.turnPlayer || 'defender';
  const actionPoints = context.actionPoints || 0;
  const hasRolledDice = context.hasRolledDice || false;
  const scores = context.scores ? { ...context.scores } : { red: 0, blue: 0 };
  const capturedPieces = context.capturedPieces ? [...context.capturedPieces] : [];
  const challengeActive = context.challengeActive || false;
  const challengedPiece = context.challengedPiece || null;
  
  let nextPhase = phase;
  let nextRoleRed = roleRed;
  let nextRoleBlue = roleBlue;
  let nextSet = set;
  let nextRound = round;
  let nextTurnPlayer = turnPlayer;
  let nextActionPoints = actionPoints;
  let nextHasRolledDice = hasRolledDice;
  let lazerHitMessage = null;
  let nextScores = scores;
  let nextCapturedPieces = capturedPieces;
  let nextChallengeActive = challengeActive;
  let nextChallengedPiece = challengedPiece;
  let nextTossRolls = context.tossRolls ? { ...context.tossRolls } : { red: null, blue: null };
  let nextTossWinner = context.tossWinner || null;
  let nextWinner = context.winner || null;
  let nextChallengeTossRolls = context.challengeTossRolls ? { ...context.challengeTossRolls } : { red: null, blue: null };
  let nextDice = context.dice ? { ...context.dice } : { values: [1, 1], isRolling: false, lastRoller: null };
  let nextTurnStats = context.turnStats ? JSON.parse(JSON.stringify(context.turnStats)) : { lazerMove: 0, lazerRotate: 0, lazerFire: 0, pieceMove: 0, pieceMoveBreakdown: { 'block-20': 0, 'block-30': 0, 'block-50': 0 }, wastedAP: 0 };
  let nextCustomBoardData = context.customBoardData || null;

  const attackerPlayer = roleRed === 'attacker' ? 'red' : 'blue';
  const defenderPlayer = roleRed === 'defender' ? 'red' : 'blue';
  const actor = player ? player.toUpperCase() : 'SYSTEM';

  let logsList = [];

  if (type === 'toss-start-roll') {
    if (actor === 'RED') nextTossRolls.red = 'rolling';
    else if (actor === 'BLUE') nextTossRolls.blue = 'rolling';
  }

  if (type === 'toss-roll') {
    const val = action.value;
    if (actor === 'RED') {
      nextTossRolls.red = val;
      logsList.push(`RED rolled a ${val} for the toss.`);
    } else if (actor === 'BLUE') {
      nextTossRolls.blue = val;
      logsList.push(`BLUE rolled a ${val} for the toss.`);
    }

    if (typeof nextTossRolls.red === 'number' && typeof nextTossRolls.blue === 'number') {
      nextPhase = 'toss-result';
    }
  }

  if (type === 'toss-resolve') {
    if (nextTossRolls.red === nextTossRolls.blue) {
      nextTossRolls = { red: null, blue: null };
      nextPhase = 'toss';
      logsList.push('Toss roll was a tie! Both players must roll again.');
    } else {
      nextTossWinner = nextTossRolls.red > nextTossRolls.blue ? 'red' : 'blue';
      nextPhase = 'role-selection';
      logsList.push(`Toss won by ${nextTossWinner.toUpperCase()} (Red: ${nextTossRolls.red}, Blue: ${nextTossRolls.blue}). Choose Role!`);
    }
  }

  else if (type === 'toss-select-role') {
    const selected = action.role;
    if (nextTossWinner === 'red') {
      nextRoleRed = selected;
      nextRoleBlue = selected === 'attacker' ? 'defender' : 'attacker';
    } else {
      nextRoleBlue = selected;
      nextRoleRed = selected === 'attacker' ? 'defender' : 'attacker';
    }
    nextPhase = 'setup-defender';
    const attPlayer = nextRoleRed === 'attacker' ? 'RED' : 'BLUE';
    const defPlayer = nextRoleRed === 'defender' ? 'RED' : 'BLUE';
    logsList.push(`Roles selected. Attacker: ${attPlayer}, Defender: ${defPlayer}. Defender placing 3 point pieces.`);
  }

  else if (type === 'place') {
    const { pieceType, r, c } = action;
    const validation = validatePlacement(nextBoard, r, c, pieceType);
    if (!validation.valid) return { board, error: validation.error };

    if (phase === 'setup-defender' || phase === 'challenge-setup') {
      if (player !== defenderPlayer) {
        return { board, error: 'Only the DEFENDER can place point pieces.' };
      }

      if (phase === 'setup-defender') {
        let isDuplicate = false;
        for (let row = 0; row < BOARD_SIZE; row++) {
          for (let col = 0; col < BOARD_SIZE; col++) {
            if (nextBoard[row][col] && nextBoard[row][col].type === pieceType) {
              isDuplicate = true;
              break;
            }
          }
          if (isDuplicate) break;
        }
        if (isDuplicate) {
          return { board, error: `You can only place one ${pieceType.split('-')[1]} point piece.` };
        }
      }
      nextBoard[r][c] = {
        type: pieceType,
        rotation: 0,
        player: defenderPlayer
      };

      let placedCount = 0;
      for (let row = 0; row < BOARD_SIZE; row++) {
        for (let col = 0; col < BOARD_SIZE; col++) {
          const cell = nextBoard[row][col];
          if (cell && [BLOCK_TYPES.BLOCK_20, BLOCK_TYPES.BLOCK_30, BLOCK_TYPES.BLOCK_50].includes(cell.type)) {
            placedCount++;
          }
        }
      }

      const requiredCount = phase === 'challenge-setup' ? 1 : 3;
      if (placedCount === requiredCount) {
        logsList.push(`Defender placed ${pieceType.split('-')[1]} point piece. (${placedCount}/${requiredCount} placed). Confirm setup when ready.`);
      } else {
        logsList.push(`Defender placed ${pieceType.split('-')[1]} point piece. (${placedCount}/${requiredCount} placed)`);
      }
    } 
    
    else if (phase === 'setup-attacker') {
      if (player !== attackerPlayer) {
        return { board, error: 'Only the ATTACKER can place the LAZER piece.' };
      }

      // Clear any existing LAZER piece so it can be replaced
      for (let row = 0; row < BOARD_SIZE; row++) {
        for (let col = 0; col < BOARD_SIZE; col++) {
          if (nextBoard[row][col] && nextBoard[row][col].type === BLOCK_TYPES.BLOCK_LAZER) {
            nextBoard[row][col] = null;
          }
        }
      }

      nextBoard[r][c] = {
        type: BLOCK_TYPES.BLOCK_LAZER,
        rotation: action.rotation || 0,
        player: attackerPlayer
      };

      logsList.push('Attacker placed Lazer piece. Rotate it or confirm setup.');
    }
  }

  else if (type === 'start-roll') {
    nextDice.isRolling = true;
    nextDice.lastRoller = player;
    logsList.push(`${player.toUpperCase()} is rolling the dice...`);
  }

  else if (type === 'end-roll') {
    nextDice.isRolling = false;
    nextDice.values = action.values || [1, 1];
    nextDice.lastRoller = player;

    nextActionPoints = nextDice.values[0] + nextDice.values[1];
    nextHasRolledDice = true;
    
    // Reset turn stats for the new turn
    nextTurnStats = { lazerMove: 0, lazerRotate: 0, lazerFire: 0, pieceMove: 0, pieceMoveBreakdown: { 'block-20': 0, 'block-30': 0, 'block-50': 0 }, wastedAP: 0 };
    
    logsList.push(`${player.toUpperCase()} rolled: ${nextDice.values[0]} & ${nextDice.values[1]} (Action Points: ${nextActionPoints}).`);
  }

  else if (type === 'move') {
    const checkErr = checkPlayActionValidity(phase, hasRolledDice, actionPoints, roleRed, player, turnPlayer);
    if (checkErr) return { board, error: checkErr };

    const { fromR, fromC, toR, toC } = action;
    const validation = validateMovement(nextBoard, fromR, fromC, toR, toC, turnPlayer);
    if (!validation.valid) return { board, error: validation.error };

    const piece = nextBoard[fromR][fromC];
    nextBoard[fromR][fromC] = null;
    nextBoard[toR][toC] = piece;

    nextActionPoints -= 1;
    if (piece.type === BLOCK_TYPES.BLOCK_LAZER) {
      nextTurnStats.lazerMove += 1;
    } else {
      nextTurnStats.pieceMove += 1;
      if (nextTurnStats.pieceMoveBreakdown[piece.type] !== undefined) {
        nextTurnStats.pieceMoveBreakdown[piece.type] += 1;
      }
    }
  } 
  
  else if (type === 'rotate') {
    if (phase !== 'setup-attacker') {
      const checkErr = checkPlayActionValidity(phase, hasRolledDice, actionPoints, roleRed, player, turnPlayer);
      if (checkErr) return { board, error: checkErr };
    } else {
      if (player !== attackerPlayer) return { board, error: 'Only the ATTACKER can rotate during setup.' };
    }

    let lazerPos = null;
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        const cell = nextBoard[r][c];
        if (cell && cell.type === BLOCK_TYPES.BLOCK_LAZER) {
          lazerPos = { r, c };
          break;
        }
      }
    }

    if (!lazerPos) return { board, error: 'LAZER piece not found.' };
    const block = nextBoard[lazerPos.r][lazerPos.c];

    const dir = action.dir || 'cw';
    let newRot = block.rotation || 0;
    if (dir === 'cw') {
      newRot = (newRot + 90) % 360;
    } else {
      newRot = (newRot - 90 + 360) % 360;
    }

    nextBoard[lazerPos.r][lazerPos.c] = {
      ...block,
      rotation: newRot
    };

    if (phase !== 'setup-attacker') {
      nextActionPoints -= 1;
      nextTurnStats.lazerRotate += 1;
    } else {
      logsList.push('Attacker rotated the LAZER piece.');
    }
  } 
  
  else if (type === 'remove') {
    const { r, c } = action;
    if (phase === 'setup-defender' || phase === 'challenge-setup') {
      if (player !== defenderPlayer) return { board, error: 'Only the DEFENDER can remove pieces.' };
      const cell = nextBoard[r][c];
      if (cell && [BLOCK_TYPES.BLOCK_20, BLOCK_TYPES.BLOCK_30, BLOCK_TYPES.BLOCK_50].includes(cell.type)) {
        nextBoard[r][c] = null;
        logsList.push(`Defender picked up ${cell.type.split('-')[1]} point piece.`);
      }
    } else if (phase === 'setup-attacker') {
      if (player !== attackerPlayer) return { board, error: 'Only the ATTACKER can remove pieces.' };
      const cell = nextBoard[r][c];
      if (cell && cell.type === BLOCK_TYPES.BLOCK_LAZER) {
        nextBoard[r][c] = null;
        logsList.push('Attacker picked up LAZER piece.');
      }
    }
  }

  else if (type === 'confirm-setup') {
    if (phase === 'setup-defender' || phase === 'challenge-setup') {
      if (player !== defenderPlayer) return { board, error: 'Only the DEFENDER can confirm setup.' };
      
      let placedCount = 0;
      for (let row = 0; row < BOARD_SIZE; row++) {
        for (let col = 0; col < BOARD_SIZE; col++) {
          const cell = nextBoard[row][col];
          if (cell && [BLOCK_TYPES.BLOCK_20, BLOCK_TYPES.BLOCK_30, BLOCK_TYPES.BLOCK_50].includes(cell.type)) {
            placedCount++;
          }
        }
      }
      
      const requiredCount = phase === 'challenge-setup' ? 1 : 3;
      if (placedCount !== requiredCount) return { board, error: `Must place all ${requiredCount} pieces before confirming.` };

      if (phase === 'challenge-setup') {
        nextPhase = 'playing';
        logsList.push('Defender confirmed challenge setup. Set continues from next roll!');
      } else {
        nextPhase = 'setup-attacker';
        logsList.push('Defender setup confirmed! Attacker placing LAZER piece on a corner square.');
      }
    }
    else if (phase === 'setup-attacker') {
      if (player !== attackerPlayer) return { board, error: 'Only the ATTACKER can confirm setup.' };
      
      let hasLazer = false;
      for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
          if (nextBoard[r][c] && nextBoard[r][c].type === BLOCK_TYPES.BLOCK_LAZER) {
            hasLazer = true; break;
          }
        }
      }
      if (!hasLazer) return { board, error: 'Place LAZER piece before confirming.' };

      nextPhase = 'playing';
      nextRound = 1;
      nextTurnPlayer = 'defender';
      nextHasRolledDice = false;
      nextActionPoints = 0;
      logsList.push(`Attacker setup complete! Set ${set} Round 1 starts. Defender rolls first.`);
    }
  }
  
  else if (type === 'laser-press') {
    const checkErr = checkPlayActionValidity(phase, hasRolledDice, actionPoints, roleRed, player, turnPlayer);
    if (checkErr) return { board, error: checkErr };

    let lazerPos = null;
    let lazerDir = 0;
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        const cell = nextBoard[r][c];
        if (cell && cell.type === BLOCK_TYPES.BLOCK_LAZER) {
          lazerPos = { r, c };
          lazerDir = cell.rotation || 0;
          break;
        }
      }
    }

    if (!lazerPos) return { board, error: 'LAZER piece not found.' };

    const trace = traceLaserBeam(nextBoard, lazerPos, lazerDir);
    const hit = trace.hitPiece;

    if (hit && [BLOCK_TYPES.BLOCK_20, BLOCK_TYPES.BLOCK_30, BLOCK_TYPES.BLOCK_50].includes(hit.cell.type)) {
      const capturedType = hit.cell.type;
      nextBoard[hit.r][hit.c] = null;
      nextCapturedPieces.push(capturedType);

      let pts = 0;
      if (capturedType === BLOCK_TYPES.BLOCK_20) pts = 20;
      else if (capturedType === BLOCK_TYPES.BLOCK_30) pts = 30;
      else if (capturedType === BLOCK_TYPES.BLOCK_50) pts = 50;

      nextScores[attackerPlayer] += pts;
      logsList.push(`Laser captured ${capturedType.split('-')[1]} point piece at (${hit.r}, ${hit.c})! (+${pts} pts)`);
      
      const bounceCount = trace.path.filter(p => p.type === 'mirror-bounce').length;
      const points = capturedType.split('-')[1];
      
      if (points === '50') {
        if (bounceCount > 0) {
          lazerHitMessage = `Incredible calculation! You bounced the beam off ${bounceCount} mirror(s) to vaporize their highest value **50-point piece**! The Treaty of 3042 would be proud.`;
        } else {
          lazerHitMessage = `Direct hit on their Commander! The **50-point piece** has been neutralized. A devastating tactical strike!`;
        }
      } else if (points === '30') {
        if (bounceCount > 0) {
          lazerHitMessage = `Geometry wins! The beam ricocheted off ${bounceCount} mirror(s) and destroyed the **30-point piece**!`;
        } else {
          lazerHitMessage = `A solid strike! The **30-point piece** was destroyed in a flash of light.`;
        }
      } else if (points === '20') {
        if (bounceCount > 0) {
          lazerHitMessage = `A tricky shot, bouncing off ${bounceCount} mirror(s) just to snipe the **20-point piece**! Excellent work.`;
        } else {
          lazerHitMessage = `You caught the **20-point piece**! A clean and simple execution.`;
        }
      } else {
        if (bounceCount > 0) {
          lazerHitMessage = `Brilliant shot! You bounced the beam off ${bounceCount} mirror(s) to hit the **${points}-point piece**!`;
        } else {
          lazerHitMessage = `Direct hit on the **${points}-point piece**! A straightforward and brutal tactical strike.`;
        }
      }
    } else {
      logsList.push('Laser fired but missed.');
      lazerHitMessage = `Missed! The beam dissipated into the void of space. Recalculate your trajectory!`;
    }

    nextActionPoints -= 1;
    nextTurnStats.lazerFire += 1;

    let pointPiecesRemaining = 0;
    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        const cell = nextBoard[row][col];
        if (cell && [BLOCK_TYPES.BLOCK_20, BLOCK_TYPES.BLOCK_30, BLOCK_TYPES.BLOCK_50].includes(cell.type)) {
          pointPiecesRemaining++;
        }
      }
    }

    if (pointPiecesRemaining === 0) {
      nextPhase = 'challenge-declaration';
      nextActionPoints = 0;
      nextHasRolledDice = false;
      logsList.push('All point pieces on the board captured! Attacker can declare a CHALLENGE.');
    }
  }

  else if (type === 'end-turn') {
    if (nextActionPoints > 0) {
      nextTurnStats.wastedAP = nextActionPoints;
    }
    nextActionPoints = 0;
    nextHasRolledDice = false;

    if (turnPlayer === 'defender') {
      nextTurnPlayer = 'attacker';
      logsList.push("Defender ended turn. Attacker's turn to roll.");
    } else {
      if (round < 3) {
        nextRound = round + 1;
        nextTurnPlayer = 'defender';
        logsList.push(`Round completed. Starting Round ${nextRound}. Defender's turn to roll.`);
      } else {
        const setOutcome = endSetState(nextBoard, set, nextScores, roleRed, nextDice, context);
        nextBoard = setOutcome.board;
        nextPhase = setOutcome.phase;
        nextSet = setOutcome.set;
        nextRound = setOutcome.round;
        nextRoleRed = setOutcome.roleRed;
        nextRoleBlue = setOutcome.roleBlue;
        nextTurnPlayer = setOutcome.turnPlayer;
        nextActionPoints = setOutcome.actionPoints;
        nextHasRolledDice = setOutcome.hasRolledDice;
        nextScores = setOutcome.scores;
        nextCapturedPieces = setOutcome.capturedPieces;
        nextChallengeActive = setOutcome.challengeActive;
        nextChallengedPiece = setOutcome.challengedPiece;
        nextTossRolls = setOutcome.tossRolls;
        nextTossWinner = setOutcome.tossWinner;
        nextChallengeTossRolls = setOutcome.challengeTossRolls;
        logsList.push(...setOutcome.logs);
      }
    }
  }

  else if (type === 'declare-challenge') {
    const declare = action.declare;
    if (!declare) {
      logsList.push('Attacker declined challenge. Ending set.');
      const setOutcome = endSetState(nextBoard, set, nextScores, roleRed, nextDice, context);
      nextBoard = setOutcome.board;
      nextPhase = setOutcome.phase;
      nextSet = setOutcome.set;
      nextRound = setOutcome.round;
      nextRoleRed = setOutcome.roleRed;
      nextRoleBlue = setOutcome.roleBlue;
      nextTurnPlayer = setOutcome.turnPlayer;
      nextActionPoints = setOutcome.actionPoints;
      nextHasRolledDice = setOutcome.hasRolledDice;
      nextScores = setOutcome.scores;
      nextCapturedPieces = setOutcome.capturedPieces;
      nextChallengeActive = setOutcome.challengeActive;
      nextChallengedPiece = setOutcome.challengedPiece;
      nextTossRolls = setOutcome.tossRolls;
      nextTossWinner = setOutcome.tossWinner;
      nextChallengeTossRolls = setOutcome.challengeTossRolls;
      nextTurnStats = setOutcome.turnStats;
      logsList.push(...setOutcome.logs);
    } else {
      nextChallengeActive = true;
      nextChallengedPiece = action.pieceType;
      nextPhase = 'challenge-toss';
      nextChallengeTossRolls = { red: null, blue: null };
      logsList.push(`Attacker declared a challenge on ${nextChallengedPiece.split('-')[1]} block. Roll for Challenge Toss!`);
    }
  }

  else if (type === 'challenge-start-roll') {
    if (actor === 'RED') nextChallengeTossRolls.red = 'rolling';
    else if (actor === 'BLUE') nextChallengeTossRolls.blue = 'rolling';
  }

  else if (type === 'challenge-roll') {
    const val = action.value;
    if (actor === 'RED') {
      nextChallengeTossRolls.red = val;
      logsList.push(`RED rolled a ${val} for the challenge toss.`);
    } else if (actor === 'BLUE') {
      nextChallengeTossRolls.blue = val;
      logsList.push(`BLUE rolled a ${val} for the challenge toss.`);
    }

    if (typeof nextChallengeTossRolls.red === 'number' && typeof nextChallengeTossRolls.blue === 'number') {
      nextPhase = 'challenge-toss-result';
    }
  }

  else if (type === 'challenge-toss-resolve') {
    if (nextChallengeTossRolls.red === nextChallengeTossRolls.blue) {
      nextChallengeTossRolls = { red: null, blue: null };
      nextPhase = 'challenge-toss';
      logsList.push('Challenge roll was a tie! Both players must roll again.');
    } else {
      const attRoll = attackerPlayer === 'red' ? nextChallengeTossRolls.red : nextChallengeTossRolls.blue;
      const defRoll = defenderPlayer === 'red' ? nextChallengeTossRolls.red : nextChallengeTossRolls.blue;

      if (attRoll > defRoll) {
        nextPhase = 'challenge-setup';
        for (let r = 0; r < BOARD_SIZE; r++) {
          for (let c = 0; c < BOARD_SIZE; c++) {
            const cell = nextBoard[r][c];
            if (cell && [BLOCK_TYPES.BLOCK_20, BLOCK_TYPES.BLOCK_30, BLOCK_TYPES.BLOCK_50].includes(cell.type)) {
              nextBoard[r][c] = null;
            }
          }
        }
        logsList.push(`Attacker won challenge toss (${attRoll} vs ${defRoll})! Defender must place point pieces.`);
      } else {
        let pts = 0;
        if (challengedPiece === BLOCK_TYPES.BLOCK_20) pts = 20;
        else if (challengedPiece === BLOCK_TYPES.BLOCK_30) pts = 30;
        else if (challengedPiece === BLOCK_TYPES.BLOCK_50) pts = 50;

        nextScores[attackerPlayer] -= pts;
        logsList.push(`Attacker lost challenge toss (${attRoll} vs ${defRoll})! Deducted ${pts} pts.`);

        // Loop back to challenge declaration
        nextPhase = 'challenge-declaration';
        nextChallengeTossRolls = { red: null, blue: null };
        nextChallengedPiece = null;
        logsList.push('Attacker can declare another challenge or decline to end the set.');
      }
    }
  }

  else if (type === 'clear') {
    const boardDataToUse = action.customBoardData !== undefined ? action.customBoardData : context.customBoardData;
    return getInitialState(boardDataToUse);
  }

  else if (type === 'tutorial-victory') {
    nextPhase = 'game-over';
    nextWinner = 'red';
    logsList.push('Simulation complete! You successfully captured a point piece.');
  }

  const sideEffects = evaluateBoardState(nextBoard, action, actor, context);

  return {
    board: nextBoard,
    phase: nextPhase,
    set: nextSet,
    round: nextRound,
    roleRed: nextRoleRed,
    roleBlue: nextRoleBlue,
    turnPlayer: nextTurnPlayer,
    actionPoints: nextActionPoints,
    hasRolledDice: nextHasRolledDice,
    scores: nextScores,
    winner: nextWinner,
    capturedPieces: nextCapturedPieces,
    challengeActive: nextChallengeActive,
    challengedPiece: nextChallengedPiece,
    tossRolls: nextTossRolls,
    tossWinner: nextTossWinner,
    challengeTossRolls: nextChallengeTossRolls,
    dice: nextDice,
    turnStats: nextTurnStats,
    customData: {
      ...sideEffects.customData,
      lazerHitMessage: lazerHitMessage || (sideEffects.customData ? sideEffects.customData.lazerHitMessage : null)
    },
    customBoardData: nextCustomBoardData,
    logs: logsList,
    error: null
  };
}

export function getInitialState(customBoardData = null, mode = null) {
  const emptyBoard = getInitialBoard(customBoardData);
  const initialSideEffects = evaluateBoardState(emptyBoard, null, 'system');



  return {
    board: emptyBoard,
    phase: 'toss',
    set: 1,
    round: 1,
    roleRed: null,
    roleBlue: null,
    tossRolls: { red: null, blue: null },
    tossWinner: null,
    tossDecisionPending: false,
    turnPlayer: 'defender',
    actionPoints: 0,
    hasRolledDice: false,
    dice: {
      values: [1, 1],
      isRolling: false,
      lastRoller: null
    },
    scores: { red: 0, blue: 0 },
    winner: null,
    logs: ['Game initialized. Roll for Toss!'],
    customData: initialSideEffects.customData,
    error: null,
    capturedPieces: [],
    challengeActive: false,
    challengedPiece: null,
    challengeTossRolls: { red: null, blue: null },
    turnStats: { lazerMove: 0, lazerRotate: 0, lazerFire: 0, pieceMove: 0, pieceMoveBreakdown: { 'block-20': 0, 'block-30': 0, 'block-50': 0 }, wastedAP: 0 },
    customBoardData: customBoardData
  };
}
