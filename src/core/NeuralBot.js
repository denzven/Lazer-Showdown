import * as tf from '@tensorflow/tfjs';
import { BLOCK_TYPES, validateMovement, traceLaserBeam } from './Ruleset.js';
import { getBoardState, classifyPlay, formatActionText, calculateMobility, calculateCenterControl, calculateMirrorUtilization } from './BotStrategies.js';

// Helper to convert board state and game context into a flat 78-element numeric tensor array
export function boardToTensorArray(board, gameState = null) {
  const arr = new Array(78).fill(0);
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const idx = r * 8 + c;
      const cell = board[r][c];
      if (!cell) {
        arr[idx] = 0;
      } else if (cell.type === BLOCK_TYPES.BLOCK_LAZER) {
        if (cell.rotation === 0) arr[idx] = 1;
        else if (cell.rotation === 90) arr[idx] = 2;
        else if (cell.rotation === 180) arr[idx] = 3;
        else if (cell.rotation === 270) arr[idx] = 4;
        else arr[idx] = 1;
      } else if (cell.type === BLOCK_TYPES.BLOCK_20) {
        arr[idx] = 5;
      } else if (cell.type === BLOCK_TYPES.BLOCK_30) {
        arr[idx] = 6;
      } else if (cell.type === BLOCK_TYPES.BLOCK_50) {
        arr[idx] = 7;
      } else if (cell.type === 'mirror') {
        arr[idx] = cell.orientation === '/' ? 8 : 9;
      }
    }
  }

  if (gameState) {
    const isRedAttacker = gameState.roleRed === 'attacker';
    arr[64] = isRedAttacker ? (gameState.scores?.red || 0) : (gameState.scores?.blue || 0); // Attacker Score
    arr[65] = isRedAttacker ? (gameState.scores?.blue || 0) : (gameState.scores?.red || 0); // Defender Score
    arr[66] = 3 - (gameState.round || 1); // Rounds Remaining
    arr[67] = gameState.actionPoints || 0; // AP
    arr[68] = gameState.set || 1; // Set Num
    arr[69] = gameState.capturedPieces?.includes(BLOCK_TYPES.BLOCK_50) ? 1 : 0;
    arr[70] = gameState.capturedPieces?.includes(BLOCK_TYPES.BLOCK_30) ? 1 : 0;
    arr[71] = gameState.capturedPieces?.includes(BLOCK_TYPES.BLOCK_20) ? 1 : 0;
  }
  
  // Inject Advanced Metrics
  arr[72] = calculateMobility(board, 'attacker');
  arr[73] = calculateMobility(board, 'defender');
  arr[74] = calculateCenterControl(board);
  arr[75] = calculateMirrorUtilization(board, 'attacker');
  arr[76] = calculateMirrorUtilization(board, 'defender');
  arr[77] = gameState?.actionPoints || 0; // Or whatever represents total AP context
  
  return arr;
}

// Applies a lightweight action to a board copy to evaluate future states
export function applyLightweightAction(board, action) {
  const newBoard = board.map(row => [...row]);
  if (action.type === 'move') {
    newBoard[action.toR][action.toC] = newBoard[action.fromR][action.fromC];
    newBoard[action.fromR][action.fromC] = null;
  } else if (action.type === 'rotate') {
    const { r, c, dir } = action;
    const block = newBoard[r][c];
    if (block) {
      let rot = block.rotation || 0;
      if (dir === 'cw') rot = (rot + 90) % 360;
      if (dir === 'ccw') rot = (rot - 90 + 360) % 360;
      newBoard[r][c] = { ...block, rotation: rot };
    }
  }
  return newBoard;
}

export function getPossibleActions(board, role) {
  const actions = [];
  const { emptyCells, lazerPos, lazerDir, pointPieces } = getBoardState(board);

  if (role === 'attacker' && lazerPos) {
    const trace = traceLaserBeam(board, lazerPos, lazerDir);
    if (trace.hitPiece && [BLOCK_TYPES.BLOCK_20, BLOCK_TYPES.BLOCK_30, BLOCK_TYPES.BLOCK_50].includes(trace.hitPiece.cell.type)) {
      actions.push({ type: 'laser-press' });
    }
    actions.push({ type: 'rotate', dir: 'cw', r: lazerPos.r, c: lazerPos.c });
    actions.push({ type: 'rotate', dir: 'ccw', r: lazerPos.r, c: lazerPos.c });
    for (const cell of emptyCells) {
      if (validateMovement(board, lazerPos.r, lazerPos.c, cell.r, cell.c, 'attacker').valid) {
        actions.push({ type: 'move', fromR: lazerPos.r, fromC: lazerPos.c, toR: cell.r, toC: cell.c });
      }
    }
  } else if (role === 'defender') {
    for (const p of pointPieces) {
      for (const cell of emptyCells) {
        if (validateMovement(board, p.r, p.c, cell.r, cell.c, 'defender').valid) {
          actions.push({ type: 'move', fromR: p.r, fromC: p.c, toR: cell.r, toC: cell.c });
        }
      }
    }
  }
  return actions;
}

// Cache the model so we don't load it every turn
let cachedModel = null;
let modelLoading = false;
let modelPromise = null;

export async function loadNeuralModel() {
  if (cachedModel) return cachedModel;
  if (modelLoading) return modelPromise;

  modelLoading = true;
  modelPromise = (async () => {
    try {
      const model = await tf.loadLayersModel('/models/ai-bot/model.json');
      console.log('Neural Network model loaded successfully!');
      cachedModel = model;
      return model;
    } catch (e) {
      console.error('Failed to load neural model. Run train.bat first.', e);
      return null;
    } finally {
      modelLoading = false;
    }
  })();
  return modelPromise;
}

// Neural Network Strategy Module
export const NeuralStrategy = {
  getSetupAction: (board, phase, playerColor, challengedPiece) => {
    return null; // The frontend will handle fallback to EasyStrategy
  },

  getPlayActionAsync: async (board, role, actionPoints, gameState, botPlayer) => {
    const model = await loadNeuralModel();
    const actions = getPossibleActions(board, role);
    if (actions.length === 0) return null;

    if (!model) {
      console.warn("Neural Model not found. Falling back to random move.");
      return actions[Math.floor(Math.random() * actions.length)];
    }

    let bestAction = null;
    let bestScore = role === 'attacker' ? -Infinity : Infinity;
    
    // Dynamically calculate max safe depth to prevent browser memory crashes (cap at ~20k states)
    let depth = 1;
    if (actions.length > 0) {
      if (actions.length ** 2 <= 20000 && actionPoints >= 2) depth = 2;
      if (actions.length ** 3 <= 20000 && actionPoints >= 3) depth = 3;
    }

    const statesToEvaluate = []; // store { action1, board }

    function generateStates(currentBoard, currentDepth, firstAction) {
      if (currentDepth === 0) {
        statesToEvaluate.push({ action1: firstAction, board: currentBoard });
        return;
      }
      
      const possibleActions = getPossibleActions(currentBoard, role);
      if (possibleActions.length === 0) {
        statesToEvaluate.push({ action1: firstAction, board: currentBoard });
        return;
      }

      for (const act of possibleActions) {
        let nextBoard = act.type === 'laser-press' ? currentBoard : applyLightweightAction(currentBoard, act);
        // If we fired the laser, consider it the end of the action chain for evaluation
        if (act.type === 'laser-press') {
          statesToEvaluate.push({ action1: firstAction || act, board: nextBoard });
        } else {
          generateStates(nextBoard, currentDepth - 1, firstAction || act);
        }
      }
    }

    generateStates(board, depth, null);

    // Convert all possible future states into a batch tensor
    const tensors = statesToEvaluate.map(s => boardToTensorArray(s.board, gameState));

    // Run inference in a single batch for speed
    const inputTensor = tf.tensor2d(tensors, [tensors.length, 78]);
    const predictions = model.predict(inputTensor);
    const scores = await predictions.data();

    // Find the best move
    for (let i = 0; i < statesToEvaluate.length; i++) {
      let score = scores[i];
      // Add a tiny bit of random noise to prevent infinite loops if scores are identical
      score += (Math.random() * 0.0001);

      if (role === 'attacker') {
        if (score > bestScore) {
          bestScore = score;
          bestAction = statesToEvaluate[i].action1;
        }
      } else {
        // Defender wants to MINIMIZE the attacker's predicted score
        if (score < bestScore) {
          bestScore = score;
          bestAction = statesToEvaluate[i].action1;
        }
      }
    }

    // Cleanup TF memory
    inputTensor.dispose();
    predictions.dispose();

    return bestAction || actions[0];
  },

  evaluateBoardAsync: async (board, role, gameState) => {
    const model = await loadNeuralModel();
    if (!model) return 0;
    
    const tensor = tf.tensor2d([boardToTensorArray(board, gameState)], [1, 78]);
    const pred = model.predict(tensor);
    const scoreArray = await pred.data();
    tensor.dispose();
    pred.dispose();
    
    // The model always predicts the ATTACKER's advantage (high = good for attacker).
    // If we want a universal evaluation where high = good for the current role:
    if (role === 'defender') {
       return -scoreArray[0]; // Invert score for defender's perspective
    }
    return scoreArray[0];
  },

  getRankedPlaysAsync: async (board, role, actionPoints, gameState) => {
    const model = await loadNeuralModel();
    const actions = getPossibleActions(board, role);
    if (actions.length === 0) return [];

    if (!model) {
      return []; // fallback handled upstream if necessary
    }

    // Limit depth to 2 to prevent browser freezing with massive batch predictions
    const depth = Math.min(actionPoints || 2, 2); 
    const statesToEvaluate = []; // { sequence, board }

    function generateStates(currentBoard, currentDepth, currentSequence) {
      if (currentDepth === 0) {
        statesToEvaluate.push({ sequence: currentSequence, board: currentBoard });
        return;
      }
      
      const possibleActions = getPossibleActions(currentBoard, role);
      if (possibleActions.length === 0) {
        statesToEvaluate.push({ sequence: currentSequence, board: currentBoard });
        return;
      }

      for (const act of possibleActions) {
        let nextBoard = act.type === 'laser-press' ? currentBoard : applyLightweightAction(currentBoard, act);
        const nextSeq = [...currentSequence, act];
        
        if (act.type === 'laser-press') {
          statesToEvaluate.push({ sequence: nextSeq, board: nextBoard });
        } else {
          generateStates(nextBoard, currentDepth - 1, nextSeq);
        }
      }
    }

    generateStates(board, depth, []);

    // If there are too many states, truncate to save memory (keep first 20k)
    const maxStates = 20000;
    const evaluatedStates = statesToEvaluate.slice(0, maxStates);

    const tensors = evaluatedStates.map(s => boardToTensorArray(s.board, gameState));
    const inputTensor = tf.tensor2d(tensors, [tensors.length, 78]);
    const predictions = model.predict(inputTensor);
    const scores = await predictions.data();

    // Attach scores and classify
    for (let i = 0; i < evaluatedStates.length; i++) {
      let rawScore = scores[i];
      // Model returns score from Attacker perspective
      evaluatedStates[i].score = role === 'attacker' ? rawScore : -rawScore;
      evaluatedStates[i].name = classifyPlay(evaluatedStates[i].sequence, 'neural');
    }

    inputTensor.dispose();
    predictions.dispose();

    evaluatedStates.sort((a, b) => b.score - a.score);

    // Return formatted unique top 3 plays
    const uniquePlays = [];
    const seenNames = new Set();
    for (const p of evaluatedStates) {
      const sig = p.sequence.map(formatActionText).join('->');
      if (!seenNames.has(sig)) {
        seenNames.add(sig);
        uniquePlays.push(p);
        if (uniquePlays.length >= 3) break;
      }
    }

    return uniquePlays.map(p => ({
      name: p.name,
      sequence: p.sequence,
      formattedSteps: p.sequence.map(formatActionText),
      // Scale up score visually for UI consistency if needed
      score: Math.round(p.score * 1000) 
    }));
  }
};
