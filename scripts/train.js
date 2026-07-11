import * as tf from '@tensorflow/tfjs';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
import { fileURLToPath } from 'url';

// Emulate minimal browser environment for React imports to not crash
global.window = {};

import { BLOCK_TYPES } from '../src/core/Ruleset.js';
import { getBoardState } from '../src/core/BotStrategies.js';
import { boardToTensorArray, getPossibleActions, applyLightweightAction } from '../src/core/NeuralBot.js';
import { getInitialState, applySandboxAction } from '../src/core/GameState.js';
import { getBotSetupAction, getBotPlayAction } from '../src/core/BotEngine.js';
import { getChallengeRecommendation } from '../src/core/BotStrategies.js';

const GAMES_TO_PLAY = 1000;
const MAX_TURNS = 200;

// Load all custom boards for diverse training
const boardsDir = path.resolve('./src/boards');
const customBoards = [null]; // null is the default board
if (fs.existsSync(boardsDir)) {
  const files = fs.readdirSync(boardsDir);
  for (const file of files) {
    if (file.endsWith('.json')) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(boardsDir, file), 'utf8'));
        customBoards.push(data);
      } catch(e) {}
    }
  }
}

// Custom Node IO Handler since pure tfjs doesn't support file:// in Node
class NodeFileSystem {
  constructor(savePath) {
    this.savePath = savePath;
  }
  async save(modelArtifacts) {
    const weightsData = Buffer.from(modelArtifacts.weightData);
    const weightsFileName = 'weights.bin';
    fs.writeFileSync(path.join(this.savePath, weightsFileName), weightsData);
    modelArtifacts.weightData = null;
    modelArtifacts.weightSpecs.forEach(s => s.paths = [weightsFileName]);
    fs.writeFileSync(path.join(this.savePath, 'model.json'), JSON.stringify(modelArtifacts));
    return { modelArtifactsInfo: { dateSaved: new Date(), modelTopologyType: 'JSON' } };
  }
  async load() {
    const modelJSON = JSON.parse(fs.readFileSync(path.join(this.savePath, 'model.json')));
    const weightsFileName = modelJSON.weightSpecs[0].paths[0];
    const weightData = fs.readFileSync(path.join(this.savePath, weightsFileName));
    return {
      modelTopology: modelJSON.modelTopology,
      weightSpecs: modelJSON.weightSpecs,
      weightData: new Uint8Array(weightData).buffer
    };
  }
}

async function simulateGame() {
  const randomBoard = customBoards[Math.floor(Math.random() * customBoards.length)];
  let state = getInitialState(randomBoard);
  const gameData = []; // Store state + actor for end-of-game labeling
  
  // Mixed Difficulties
  const diffs = ['hard', 'medium', 'easy'];
  const botRed = diffs[Math.floor(Math.random() * diffs.length)];
  const botBlue = diffs[Math.floor(Math.random() * diffs.length)];

  // Helper to roll dice
  const rollDie = () => Math.floor(Math.random() * 6) + 1;

  let turns = 0;
  while (!state.winner && turns < MAX_TURNS) {
    turns++;
    
    // Auto-resolve non-action phases
    if (state.phase === 'toss') {
      state = applySandboxAction(state.board, { type: 'toss-roll', value: rollDie() }, 'red', state);
      state = applySandboxAction(state.board, { type: 'toss-roll', value: rollDie() }, 'blue', state);
      if (state.phase === 'toss') continue; // Tie
    }
    
    if (state.phase === 'toss-result') {
      state = applySandboxAction(state.board, { type: 'toss-resolve' }, 'SYSTEM', state);
      continue;
    }
    
    if (state.phase === 'role-selection') {
      state = applySandboxAction(state.board, { type: 'toss-select-role', role: 'attacker' }, state.tossWinner.toLowerCase(), state);
      continue;
    }
    
    if (state.phase === 'challenge-toss') {
      state = applySandboxAction(state.board, { type: 'challenge-start-roll' }, 'red', state);
      state = applySandboxAction(state.board, { type: 'challenge-start-roll' }, 'blue', state);
      state = applySandboxAction(state.board, { type: 'challenge-roll', value: rollDie() }, 'red', state);
      state = applySandboxAction(state.board, { type: 'challenge-roll', value: rollDie() }, 'blue', state);
      continue;
    }

    if (state.phase === 'challenge-toss-result') {
      state = applySandboxAction(state.board, { type: 'challenge-toss-resolve' }, 'system', state);
      continue;
    }

    const activeRole = state.phase === 'setup-defender' || state.phase === 'challenge-setup' ? 'defender' :
                       state.phase === 'setup-attacker' ? 'attacker' : state.turnPlayer;
    const activeColor = state.roleRed === activeRole ? 'red' : 'blue';
    const activeBot = activeColor === 'red' ? botRed : botBlue;

    if (state.phase === 'setup-defender' || state.phase === 'challenge-setup' || state.phase === 'setup-attacker') {
      let action = getBotSetupAction(state.board, state.phase, activeColor, activeBot, state.challengedPiece);
      
      // Randomize Setup for better weight distribution (50% chance)
      if (action && Math.random() < 0.5) {
         if (state.phase === 'setup-attacker') {
           const corners = [{r:0,c:0}, {r:0,c:7}, {r:7,c:0}, {r:7,c:7}];
           const rots = [0, 90, 180, 270];
           const corner = corners[Math.floor(Math.random() * 4)];
           action.r = corner.r; action.c = corner.c; action.rotation = rots[Math.floor(Math.random() * 4)];
         } else {
           const validCells = [];
           for (let r=0; r<8; r++) {
             for (let c=0; c<8; c++) {
               if (!state.board[r][c] && !((r===0&&c===0)||(r===0&&c===7)||(r===7&&c===0)||(r===7&&c===7)||(r>=3&&r<=4&&c>=3&&c<=4))) {
                 validCells.push({r, c});
               }
             }
           }
           if (validCells.length > 0) {
             const cell = validCells[Math.floor(Math.random() * validCells.length)];
             action.r = cell.r; action.c = cell.c;
           }
         }
      }

      if (action) state = applySandboxAction(state.board, action, activeColor.toLowerCase(), state);
      else {
        // Fallback or end setup
        state = applySandboxAction(state.board, { type: 'confirm-setup' }, activeColor.toLowerCase(), state);
      }
      continue;
    }

    if (state.phase === 'playing') {
      if (!state.hasRolledDice) {
        state = applySandboxAction(state.board, { type: 'end-roll', values: [rollDie(), rollDie()] }, activeColor.toLowerCase(), state);
        continue;
      }
      
      let action = await getBotPlayAction(state.board, activeRole, state.actionPoints, activeBot, state, activeColor);
      
      // Epsilon-Greedy: 15% chance to take a completely random valid move to explore state space
      if (Math.random() < 0.15) {
        const possibleActions = getPossibleActions(state.board, activeRole);
        if (possibleActions.length > 0) {
          action = possibleActions[Math.floor(Math.random() * possibleActions.length)];
        }
      }
      
      if (action) {
        // Collect State before action
        const tensorArray = boardToTensorArray(state.board, state);
        
        // Evaluate mathematical score for blending
        const { evaluateBoardAttacker } = await import('../src/core/BotStrategies.js');
        const mathScore = evaluateBoardAttacker(state.board, 1.0);
        
        gameData.push({ tensorArray, mathScore, actorRole: activeRole, roleRed: state.roleRed });
        
        state = applySandboxAction(state.board, action, activeColor.toLowerCase(), state);
      } else {
        state = applySandboxAction(state.board, { type: 'end-turn' }, activeColor.toLowerCase(), state);
      }
      continue;
    }

    if (state.phase === 'challenge-declaration') {
      // Use the advanced math heuristic to decide whether to challenge during self-play
      const attackerScore = state.roleRed === 'attacker' ? state.scores.red : state.scores.blue;
      const defenderScore = state.roleRed === 'attacker' ? state.scores.blue : state.scores.red;
      const rec = getChallengeRecommendation(state.capturedPieces, state.round, state.actionPoints, attackerScore, defenderScore, state.set);
      
      if (rec.recommend) {
        state = applySandboxAction(state.board, { type: 'declare-challenge', declare: true, pieceType: rec.suggestedPiece }, activeColor.toLowerCase(), state);
      } else {
        state = applySandboxAction(state.board, { type: 'declare-challenge', declare: false }, activeColor.toLowerCase(), state);
      }
      continue;
    }

    // Safety breaker
    if (turns > MAX_TURNS - 5) break;
  }
  
  // End of match. Compute final points.
  // The goal of Attacker is to maximize (attackerScore - defenderScore).
  // The goal of Defender is to minimize it.
  const finalAttackerScore = state.roleRed === 'attacker' ? (state.scores?.red || 0) : (state.scores?.blue || 0);
  const finalDefenderScore = state.roleRed === 'attacker' ? (state.scores?.blue || 0) : (state.scores?.red || 0);
  
  // If game ended prematurely, guess the score
  const scoreDelta = finalAttackerScore - finalDefenderScore;
  
  const inputs = [];
  const labels = [];

  for (const step of gameData) {
    inputs.push(step.tensorArray);
    
    // Label blending: 50% Mathematics, 50% End-of-Game outcome
    // (scoreDelta ranges from roughly -100 to +100).
    const blendedScore = (step.mathScore * 0.5) + (scoreDelta * 0.5);
    labels.push([blendedScore]);
  }
  
  return { inputs, labels };
}

async function generateBatch(games) {
  const allInputs = [];
  const allLabels = [];
  for (let i = 0; i < games; i++) {
    const { inputs, labels } = await simulateGame();
    allInputs.push(...inputs);
    allLabels.push(...labels);
  }
  return { inputs: allInputs, labels: allLabels };
}

if (!isMainThread) {
  generateBatch(workerData.gamesToPlay).then(data => {
    parentPort.postMessage(data);
  });
} else {

async function trainModel() {
  const numCores = os.cpus().length;
  console.log(`\n🚀 Multithreading FULL GAME RL Simulation across ${numCores} CPU Cores...`);
  
  const gamesPerCore = Math.ceil(GAMES_TO_PLAY / numCores);
  const workers = [];
  
  let totalInputs = [];
  let totalLabels = [];
  
  const __filename = fileURLToPath(import.meta.url);

  for (let i = 0; i < numCores; i++) {
    workers.push(new Promise((resolve, reject) => {
      const worker = new Worker(__filename, {
        execArgv: ['--import', 'tsx'],
        workerData: { gamesToPlay: gamesPerCore }
      });
      worker.on('message', (data) => {
        totalInputs.push(...data.inputs);
        totalLabels.push(...data.labels);
      });
      worker.on('error', reject);
      worker.on('exit', (code) => {
        if (code !== 0) reject(new Error(`Worker stopped with exit code ${code}`));
        else resolve();
      });
    }));
  }

  process.stdout.write('Simulating Games (This may take several minutes)...');
  const progressInterval = setInterval(() => { process.stdout.write('█'); }, 3000);

  await Promise.all(workers);
  clearInterval(progressInterval);
  
  console.log(`\n✅ Generated ${totalInputs.length} reinforcement learning states!`);
  
  const savePath = path.resolve('./public/models/ai-bot');
  const modelPath = path.join(savePath, 'model.json');
  
  let model;

  if (fs.existsSync(modelPath)) {
    console.log(`\n🔄 Loading existing model from ${savePath}...`);
    try {
      model = await tf.loadLayersModel(new NodeFileSystem(savePath));
      model.compile({
        optimizer: tf.train.adam(0.001),
        loss: 'meanSquaredError'
      });
      console.log(`✅ Model loaded successfully. Resuming training...`);
    } catch (e) {
      console.error(`❌ Failed to load existing model. Creating a fresh one. Error: ${e.message}`);
      model = null;
    }
  }

  if (!model) {
    console.log(`\n✨ Creating a fresh 78-feature Neural Network...`);
    model = tf.sequential();
    model.add(tf.layers.dense({ inputShape: [78], units: 128, activation: 'relu' }));
    model.add(tf.layers.dense({ units: 64, activation: 'relu' }));
    model.add(tf.layers.dense({ units: 32, activation: 'relu' }));
    model.add(tf.layers.dense({ units: 1 }));

    model.compile({
      optimizer: tf.train.adam(0.001),
      loss: 'meanSquaredError'
    });
  }

  const xs = tf.tensor2d(totalInputs, [totalInputs.length, 78]);
  const ys = tf.tensor2d(totalLabels, [totalLabels.length, 1]);

  console.log(`\n🧠 Training Neural Network...`);
  
  await model.fit(xs, ys, {
    epochs: 20,
    batchSize: 128,
    shuffle: true,
    callbacks: {
      onEpochEnd: (epoch, logs) => {
        const bar = '█'.repeat(Math.ceil((epoch + 1) / 20 * 30)).padEnd(30, '░');
        console.log(`Epoch ${epoch + 1}/20 |${bar}| Loss: ${logs.loss.toFixed(2)}`);
      }
    }
  });


  if (!fs.existsSync(savePath)) fs.mkdirSync(savePath, { recursive: true });
  
  await model.save(new NodeFileSystem(savePath));
  console.log(`\n✅ Training Complete! Neural Network saved to ${savePath}`);
}

trainModel();
}
