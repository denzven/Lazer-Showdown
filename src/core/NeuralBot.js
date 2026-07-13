import * as tf from '@tensorflow/tfjs';
import { BLOCK_TYPES, validateMovement, traceLaserBeam } from './Ruleset.js';
import { getBoardState, classifyPlay, formatActionText, calculateMobility, calculateCenterControl, calculateMirrorUtilization } from './BotStrategies.js';

// Helper to convert board state and game context into a flat 79-element numeric tensor array
export function boardToTensorArray(board, gameState = null, activeRole = null) {
  const arr = new Array(79).fill(0);
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
  arr[78] = activeRole === 'attacker' ? 1 : (activeRole === 'defender' ? -1 : 0); // Inject whose turn it is
  
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

export async function generateNeuralThreatMapAsync(board, gameState) {
  const model = await loadNeuralModel();
  const map = Array(8).fill(null).map(() => Array(8).fill(null).map(() => ({ total: 0, sources: {} })));
  
  if (!model) return map;
  
  const baseTensor = boardToTensorArray(board, gameState);
  const tensors = [];
  const coords = [];
  
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const occludedBoard = board.map(row => [...row]);
      if (occludedBoard[r][c]) {
        occludedBoard[r][c] = null;
      } else {
        occludedBoard[r][c] = { type: BLOCK_TYPES.BLOCK_20 };
      }
      tensors.push(boardToTensorArray(occludedBoard, gameState));
      coords.push({r, c});
    }
  }
  
  const inputTensor = tf.tensor2d(tensors, [64, 79]);
  const predictions = model.predict(inputTensor);
  const scores = await predictions.data();
  
  inputTensor.dispose();
  predictions.dispose();

  const baseScoreTensor = tf.tensor2d([baseTensor], [1, 79]);
  const basePred = model.predict(baseScoreTensor);
  const baseScores = await basePred.data();
  const baseScore = baseScores[0];
  
  baseScoreTensor.dispose();
  basePred.dispose();
  
  let maxDiff = 0.0001;
  const diffs = [];
  
  for (let i = 0; i < 64; i++) {
    const diff = Math.abs(scores[i] - baseScore);
    diffs.push(diff);
    if (diff > maxDiff) maxDiff = diff;
  }
  
  for (let i = 0; i < 64; i++) {
    const {r, c} = coords[i];
    const normalizedHeat = diffs[i] / maxDiff;
    map[r][c].total = normalizedHeat;
    map[r][c].sources = { 'AI': normalizedHeat };
  }
  
  return map;
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

    const roll = actionPoints || 0; // Use current available movement points or dice roll
    
    // Check if we should use epsilon from train.js (passed through gameState)
    const epsilon = gameState?.epsilon || 0.0;
    
    const validActionsMask = ExpectedDQN.generateValidMask(board, role);
    
    // We can simulate an ExpectedDQN class method getAction
    let bestActionIndex = -1;
    
    if (Math.random() < epsilon) {
        const validIndices = validActionsMask
            .map((val, idx) => val ? idx : -1)
            .filter(idx => idx !== -1);
        if (validIndices.length > 0) {
            bestActionIndex = validIndices[Math.floor(Math.random() * validIndices.length)];
        }
    } else {
        const stateArray = ExpectedDQN.encodeState(board, roll, role);
        const stateTensor = tf.tensor4d(stateArray, [1, 8, 8, 4]);
        
        // Predict the 67 Q-values
        const qValues = model.predict(stateTensor).dataSync();
        stateTensor.dispose();
        
        let maxQ = -Infinity;
        for (let i = 0; i < 67; i++) {
            if (!validActionsMask[i]) continue;
            // Epsilon greedy logic: if Defender, do we pick the min Q-value?
            // The DQN was trained using reward += 1 for defender survival, and reward -= 0.05 for attacker.
            // Wait, the target targets reward + gamma * expectedFutureReward. 
            // Since it's self-play, BOTH bots want to maximize THEIR own Q-value if we trained a single value?
            // Actually, the DQN targets `targets[i] = reward + ...` where `reward` is computed based on `role`.
            // So BOTH the attacker and defender want to maximize the Q-value output! The network predicts the expected reward for the CURRENT acting role.
            // Therefore, we just take the max Q for both roles!
            
            if (qValues[i] > maxQ) {
                maxQ = qValues[i];
                bestActionIndex = i;
            }
        }
    }

    if (bestActionIndex !== -1) {
        return ExpectedDQN.actionIndexToObj(bestActionIndex, board, role);
    }
    return actions[0];
  },

  evaluateBoardAsync: async (board, role, gameState) => {
    // This evaluates a state. In ExpectedDQN, we don't evaluate states, we evaluate actions.
    // We will just evaluate a pass/noop action by passing 0 actionPoints.
    const model = await loadNeuralModel();
    if (!model) return 0;
    
    const tensorArray = ExpectedDQN.encodeState(board, gameState?.actionPoints || 0, role);
    const tensor = tf.tensor4d(tensorArray, [1, 8, 8, 4]);
    const pred = model.predict(tensor);
    const scoreArray = await pred.data();
    tensor.dispose();
    pred.dispose();
    
    // Just return the max valid Q value for this state
    const validMask = ExpectedDQN.generateValidMask(board, role);
    let maxQ = -Infinity;
    for (let i = 0; i < 67; i++) {
        if (validMask[i] && scoreArray[i] > maxQ) {
            maxQ = scoreArray[i];
        }
    }
    return maxQ === -Infinity ? 0 : maxQ;
  },

  getRankedPlaysAsync: async (board, role, actionPoints, gameState) => {
    const model = await loadNeuralModel();
    const actions = getPossibleActions(board, role);
    if (actions.length === 0) return [];

    if (!model) {
      return []; // fallback handled upstream if necessary
    }

    const stateArray = ExpectedDQN.encodeState(board, actionPoints || 0, role);
    const stateTensor = tf.tensor4d(stateArray, [1, 8, 8, 4]);
    const qValues = model.predict(stateTensor).dataSync();
    stateTensor.dispose();

    const validActionsMask = ExpectedDQN.generateValidMask(board, role);
    const evaluatedStates = [];

    for (let i = 0; i < 67; i++) {
        if (!validActionsMask[i]) continue;
        const act = ExpectedDQN.actionIndexToObj(i, board, role);
        if (act) {
            evaluatedStates.push({
                sequence: [act],
                score: qValues[i],
                name: classifyPlay([act], 'neural')
            });
        }
    }

    evaluatedStates.sort((a, b) => b.score - a.score);

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
      // p.score is raw Q-value. We can map it heuristically to a "win probability"
      // Assuming Q values generally fall between -1 and 5.
      winProbability: Math.min(100, Math.max(0, Math.round((p.score + 1) * 20)))
    }));
  }
};

const DICE_PROBS = {
    2: 1/36, 3: 2/36, 4: 3/36, 5: 4/36, 6: 5/36, 7: 6/36,
    8: 5/36, 9: 4/36, 10: 3/36, 11: 2/36, 12: 1/36
};

export class ExpectedDQN {
    constructor(actionSize = 67, learningRate = 0.001) {
        this.actionSize = actionSize;
        this.gamma = 0.95;
        this.model = this.buildModel();
        this.targetModel = this.buildModel();
        this.updateTargetModel();
        this.optimizer = tf.train.adam(learningRate);
        
        this.replayBuffer = [];
        this.maxBufferSize = 10000;
        this.batchSize = 64;
    }

    buildModel() {
        const model = tf.sequential();
        
        // Input: [8, 8, 4] -> Channel 3 is now the Dice Roll scalar smeared across the grid
        model.add(tf.layers.conv2d({
            inputShape: [8, 8, 4],
            filters: 32,
            kernelSize: 3,
            activation: 'relu',
            padding: 'same'
        }));
        
        model.add(tf.layers.conv2d({
            filters: 64,
            kernelSize: 3,
            activation: 'relu',
            padding: 'same'
        }));
        
        model.add(tf.layers.flatten());
        
        model.add(tf.layers.dense({
            units: 128,
            activation: 'relu'
        }));
        
        model.add(tf.layers.dense({
            units: this.actionSize,
            activation: 'linear' 
        }));
        
        return model;
    }

    updateTargetModel() {
        tf.tidy(() => {
            this.targetModel.setWeights(this.model.getWeights());
        });
    }

    static encodeState(board, currentRoll, role) {
        const tensorArray = new Float32Array(8 * 8 * 4);
        const normalizedRoll = currentRoll / 12.0;

        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const i = (r * 8 + c) * 4;
                const cell = board[r][c];
                
                // Set the baseline defaults
                tensorArray[i] = 0;     // Mirrors
                tensorArray[i+1] = 0;   // Attacker
                tensorArray[i+2] = 0;   // Defenders
                tensorArray[i+3] = normalizedRoll; // Context (Smeared Dice Roll)
                
                if (cell) {
                    if (cell.type === 'mirror') {
                        tensorArray[i] = cell.orientation === '/' ? 1 : -1;
                    } else if (cell.type === BLOCK_TYPES.BLOCK_LAZER) {
                        tensorArray[i+1] = 1;
                    } else if ([BLOCK_TYPES.BLOCK_20, BLOCK_TYPES.BLOCK_30, BLOCK_TYPES.BLOCK_50].includes(cell.type)) {
                        tensorArray[i+2] = 1;
                    }
                }
            }
        }
        return tensorArray;
    }

    static generateValidMask(boardState, role) {
        const mask = new Array(67).fill(false);
        const actions = getPossibleActions(boardState, role);
        for (const act of actions) {
            if (act.type === 'move') {
                mask[act.toR * 8 + act.toC] = true;
            } else if (act.type === 'rotate') {
                if (act.dir === 'cw') mask[64] = true;
                if (act.dir === 'ccw') mask[65] = true;
            } else if (act.type === 'laser-press') {
                mask[66] = true;
            }
        }
        return mask;
    }

    static actionIndexToObj(index, boardState, role) {
        const { lazerPos, pointPieces } = getBoardState(boardState);
        // Find moving piece
        const pieces = role === 'attacker' ? (lazerPos ? [lazerPos] : []) : pointPieces;
        
        if (index >= 0 && index <= 63) {
            const toR = Math.floor(index / 8);
            const toC = index % 8;
            for (const p of pieces) {
                 if (validateMovement(boardState, p.r, p.c, toR, toC, role).valid) {
                     return { type: 'move', fromR: p.r, fromC: p.c, toR, toC };
                 }
            }
            return null; // Should be masked out anyway
        } else if (index === 64) {
            return { type: 'rotate', dir: 'cw', r: lazerPos?.r, c: lazerPos?.c };
        } else if (index === 65) {
            return { type: 'rotate', dir: 'ccw', r: lazerPos?.r, c: lazerPos?.c };
        } else if (index === 66) {
            return { type: 'laser-press' };
        }
        return null;
    }

    static objToActionIndex(act) {
        if (!act) return -1;
        if (act.type === 'move') return act.toR * 8 + act.toC;
        if (act.type === 'rotate' && act.dir === 'cw') return 64;
        if (act.type === 'rotate' && act.dir === 'ccw') return 65;
        if (act.type === 'laser-press') return 66;
        return -1;
    }

    getAction(stateArray, validActionsMask, epsilon = 0.1) {
        return tf.tidy(() => {
            if (Math.random() < epsilon) {
                const validIndices = validActionsMask
                    .map((val, idx) => val ? idx : -1)
                    .filter(idx => idx !== -1);
                if (validIndices.length === 0) return -1;
                return validIndices[Math.floor(Math.random() * validIndices.length)];
            }

            const stateTensor = tf.tensor4d(stateArray, [1, 8, 8, 4]);
            const qValues = this.model.predict(stateTensor).dataSync();
            
            let maxQ = -Infinity;
            let bestAction = -1;
            for (let i = 0; i < this.actionSize; i++) {
                if (!validActionsMask[i]) continue;
                if (qValues[i] > maxQ) {
                    maxQ = qValues[i];
                    bestAction = i;
                }
            }
            return bestAction !== -1 ? bestAction : validActionsMask.findIndex(m => m);
        });
    }

    remember(stateArray, action, reward, nextStateArray, done, nextBoardState, role) {
        this.replayBuffer.push({ stateArray, action, reward, nextStateArray, done, nextBoardState, role });
        if (this.replayBuffer.length > this.maxBufferSize) {
            this.replayBuffer.shift();
        }
    }

    async trainStep() {
        if (this.replayBuffer.length < this.batchSize) return;

        const batch = [];
        for (let i = 0; i < this.batchSize; i++) {
            const idx = Math.floor(Math.random() * this.replayBuffer.length);
            batch.push(this.replayBuffer[idx]);
        }

        const targets = new Float32Array(this.batchSize);

        const simulatedStateArrays = [];
        const simulatedMasks = [];

        for (let i = 0; i < this.batchSize; i++) {
            const { nextStateArray, done, nextBoardState, role } = batch[i];
            
            if (done) {
                for (let roll = 2; roll <= 12; roll++) {
                    simulatedStateArrays.push(new Float32Array(8 * 8 * 4));
                    simulatedMasks.push(new Array(this.actionSize).fill(false));
                }
            } else {
                for (let roll = 2; roll <= 12; roll++) {
                    const stateWithRoll = new Float32Array(nextStateArray);
                    const normalizedRoll = roll / 12.0;
                    for (let j = 3; j < stateWithRoll.length; j += 4) {
                        stateWithRoll[j] = normalizedRoll;
                    }
                    simulatedStateArrays.push(stateWithRoll); 
                    simulatedMasks.push(ExpectedDQN.generateValidMask(nextBoardState, role));
                }
            }
        }

        const totalSimulations = this.batchSize * 11;
        
        await tf.tidy(() => {
            console.log("Building batched state tensor...");
            const batchedStateTensor = tf.tensor4d(
                simulatedStateArrays.flatMap(arr => Array.from(arr)), 
                [totalSimulations, 8, 8, 4]
            );
            
            console.log("Predicting target Q values...");
            const futureQValuesBatch = this.targetModel.predict(batchedStateTensor, { batchSize: totalSimulations }).dataSync();
            console.log("Predicted target Q values.");

            for (let i = 0; i < this.batchSize; i++) {
                const { reward, done } = batch[i];
                
                if (done) {
                    targets[i] = reward;
                    continue;
                }

                let expectedFutureReward = 0;
                for (let r = 0; r < 11; r++) {
                    const simIndex = i * 11 + r;
                    const roll = r + 2;
                    const prob = DICE_PROBS[roll];
                    const mask = simulatedMasks[simIndex];
                    
                    let maxQ = -Infinity;
                    for (let a = 0; a < this.actionSize; a++) {
                        if (mask[a]) {
                            const qValue = futureQValuesBatch[simIndex * this.actionSize + a];
                            if (qValue > maxQ) maxQ = qValue;
                        }
                    }
                    
                    if (maxQ === -Infinity) maxQ = 0; 
                    expectedFutureReward += prob * maxQ;
                }
                
                targets[i] = reward + this.gamma * expectedFutureReward;
            }
        });

        await tf.tidy(() => {
            console.log("Building current state tensor...");
            const currentStateTensor = tf.tensor4d(
                batch.flatMap(exp => Array.from(exp.stateArray)), 
                [this.batchSize, 8, 8, 4]
            );
            
            console.log("Bypassing tf.gatherND...");
            // Bypass tf.gatherND backprop bug by constructing the full [batchSize, actionSize] target tensor
            const currentQValuesData = this.model.predict(currentStateTensor, { batchSize: this.batchSize }).arraySync();
            for (let i = 0; i < this.batchSize; i++) {
                currentQValuesData[i][batch[i].action] = targets[i];
            }
            const fullTargetTensor = tf.tensor2d(currentQValuesData, [this.batchSize, this.actionSize]);
            
            console.log("Starting optimization...");
            this.optimizer.minimize(() => {
                const currentQValues = this.model.predict(currentStateTensor, { batchSize: this.batchSize });
                return tf.losses.meanSquaredError(fullTargetTensor, currentQValues);
            });
            console.log("Optimization complete.");
        });
    }
}
