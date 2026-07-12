import './silence.js';
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

// Fix for Windows DLOPEN error: Inject TensorFlow DLL paths into the system PATH
const nodeCpuPath = path.resolve(process.cwd(), 'node_modules', '@tensorflow', 'tfjs-node', 'deps', 'lib');
const nodeGpuPath = path.resolve(process.cwd(), 'node_modules', '@tensorflow', 'tfjs-node-gpu', 'deps', 'lib');
const cuda11Path = 'C:\\Program Files\\NVIDIA GPU Computing Toolkit\\CUDA\\v11.2\\bin';
process.env.PATH = `${cuda11Path};${nodeGpuPath};${nodeCpuPath};${process.env.PATH || ''}`;

let tf;
process.env.TF_CPP_MIN_LOG_LEVEL = '3'; // Silence TensorFlow C++ warnings
try {
  tf = await import('@tensorflow/tfjs-node-gpu');
  if (isMainThread) console.log('✅ Loaded C++ GPU Backend (@tensorflow/tfjs-node-gpu) successfully!\n');
} catch (e) {
  tf = await import('@tensorflow/tfjs');
  if (isMainThread) console.log('⚠️ Using fallback JS Backend (@tensorflow/tfjs)');
}
let GAMES_TO_PLAY = 500;
let ITERATIONS = 1;
const MAX_TURNS = 200;
const MAX_REPLAY_SIZE = 50000;

for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i].startsWith('--iterations=')) {
    ITERATIONS = parseInt(process.argv[i].split('=')[1]);
  } else if (process.argv[i].startsWith('--games=')) {
    GAMES_TO_PLAY = parseInt(process.argv[i].split('=')[1]);
  }
}

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
      
      if (action) {
        // Collect State before action
        const tensorArray = boardToTensorArray(state.board, state);
        
        // Evaluate mathematical score for blending based on the actual bot personality
        const { evaluateBoardAttacker, evaluateBoardDefender } = await import('../src/core/BotStrategies.js');
        const cautiousness = activeBot === 'easy' ? 0.5 : activeBot === 'hard' ? 1.5 : 1.0;
        
        let mathScore = 0;
        if (activeRole === 'attacker') {
           mathScore = evaluateBoardAttacker(state.board, cautiousness);
        } else {
           mathScore = -evaluateBoardDefender(state.board, cautiousness);
        }
        
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
  
  const winner = state.winner === 'tie' ? 'tie' : (state.roleRed === state.winner ? 'red' : 'blue');
  const attackerWon = winner !== 'tie' && ((winner === 'red' && state.roleRed === 'attacker') || (winner === 'blue' && state.roleRed !== 'attacker'));
  const defenderWon = winner !== 'tie' && !attackerWon;

  return { inputs, labels, scoreDelta, attackerWon, defenderWon, turns };
}

async function generateBatch(games) {
  const allInputs = [];
  const allLabels = [];
  for (let i = 0; i < games; i++) {
    const { inputs, labels, scoreDelta, attackerWon, defenderWon, turns } = await simulateGame();
    allInputs.push(...inputs);
    allLabels.push(...labels);
    parentPort.postMessage({ type: 'progress', data: { scoreDelta, attackerWon, defenderWon, turns } });
  }
  parentPort.postMessage({ type: 'result', data: { inputs: allInputs, labels: allLabels } });
}

if (!isMainThread) {
  generateBatch(workerData.gamesToPlay);
} else {

async function trainModel() {
  const numCores = os.cpus().length;
  console.log(`\n🚀 Started Continuous RL Training: ${ITERATIONS} iterations, ${GAMES_TO_PLAY} games per iteration on ${numCores} CPU Cores.`);
  
  const savePath = path.resolve('./public/models/ai-bot');
  const modelPath = path.join(savePath, 'model.json');
  const bufferPath = path.join(savePath, 'replay_buffer.json');
  
  if (!fs.existsSync(savePath)) fs.mkdirSync(savePath, { recursive: true });

  let globalInputs = [];
  let globalLabels = [];

  // Load existing replay buffer if it exists
  if (fs.existsSync(bufferPath)) {
    console.log(`\n🔄 Loading Experience Replay Buffer from disk...`);
    try {
      const bufferData = JSON.parse(fs.readFileSync(bufferPath, 'utf8'));
      globalInputs = bufferData.inputs || [];
      globalLabels = bufferData.labels || [];
      console.log(`✅ Loaded ${globalInputs.length} past states.`);
    } catch(e) {
      console.error(`❌ Failed to load replay buffer. Starting fresh. Error: ${e.message}`);
    }
  }

  let model;
  if (fs.existsSync(modelPath)) {
    console.log(`\n🔄 Loading existing neural network model...`);
    try {
      model = await tf.loadLayersModel(new NodeFileSystem(savePath));
      model.compile({ optimizer: tf.train.adam(0.001), loss: 'meanSquaredError' });
      console.log(`✅ Model loaded successfully.`);
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
    model.compile({ optimizer: tf.train.adam(0.001), loss: 'meanSquaredError' });
  }

  for (let iter = 1; iter <= ITERATIONS; iter++) {
    console.log(`\n======================================================`);
    console.log(`🔥 ITERATION ${iter}/${ITERATIONS}`);
    console.log(`======================================================`);
    
    const gamesPerCore = Math.ceil(GAMES_TO_PLAY / numCores);
    const workers = [];
    
    let newInputs = [];
    let newLabels = [];
    
    const __filename = fileURLToPath(import.meta.url);

    let gamesCompleted = 0;
    let totalAttackerWins = 0;
    let totalDefenderWins = 0;
    let totalScoreDelta = 0;
    let totalTurns = 0;

    for (let i = 0; i < numCores; i++) {
      workers.push(new Promise((resolve, reject) => {
        const worker = new Worker(__filename, {
          execArgv: ['--import', 'tsx'],
          workerData: { gamesToPlay: gamesPerCore },
          env: { ...process.env, TF_CPP_MIN_LOG_LEVEL: '3' }
        });
        worker.on('message', (msg) => {
          if (msg.type === 'progress') {
            gamesCompleted++;
            if (msg.data.attackerWon) totalAttackerWins++;
            if (msg.data.defenderWon) totalDefenderWins++;
            totalScoreDelta += msg.data.scoreDelta;
            totalTurns += msg.data.turns;
            
            const winRate = ((totalAttackerWins / gamesCompleted) * 100).toFixed(1);
            const avgDelta = (totalScoreDelta / gamesCompleted).toFixed(1);
            const avgTurns = (totalTurns / gamesCompleted).toFixed(1);
            
            process.stdout.write(`\r🎮 Simulating: [${gamesCompleted}/${GAMES_TO_PLAY}] | Attacker Win: ${winRate}% | Avg Score Diff: ${avgDelta} | Avg Turns: ${avgTurns}    `);
          } else if (msg.type === 'result') {
            newInputs.push(...msg.data.inputs);
            newLabels.push(...msg.data.labels);
            resolve();
          }
        });
        worker.on('error', reject);
        worker.on('exit', (code) => {
          if (code !== 0) reject(new Error(`Worker stopped with exit code ${code}`));
        });
      }));
    }

    await Promise.all(workers);
    
    console.log(`\n✅ Generated ${newInputs.length} new reinforcement learning states.`);
    
    // Append to global buffer and truncate if necessary (FIFO)
    globalInputs.push(...newInputs);
    globalLabels.push(...newLabels);
    
    if (globalInputs.length > MAX_REPLAY_SIZE) {
      console.log(`⚠️ Replay buffer exceeded max size (${MAX_REPLAY_SIZE}). Discarding oldest states.`);
      const excess = globalInputs.length - MAX_REPLAY_SIZE;
      globalInputs.splice(0, excess);
      globalLabels.splice(0, excess);
    }
    
    console.log(`💾 Saving Replay Buffer to disk...`);
    fs.writeFileSync(bufferPath, JSON.stringify({ inputs: globalInputs, labels: globalLabels }));

    console.log(`🧠 Training Neural Network on ${globalInputs.length} total states...`);
    const xs = tf.tensor2d(globalInputs, [globalInputs.length, 78]);
    const ys = tf.tensor2d(globalLabels, [globalLabels.length, 1]);

    const history = await model.fit(xs, ys, {
      epochs: 20,
      batchSize: 128,
      shuffle: true,
      callbacks: {
        onEpochEnd: (epoch, logs) => {
          const bar = '█'.repeat(Math.ceil((epoch + 1) / 20 * 30)).padEnd(30, '░');
          console.log(`Epoch ${epoch + 1}/20 |${bar}| Loss: ${logs.loss.toFixed(4)}`);
        }
      }
    });

    const finalLoss = history.history.loss[history.history.loss.length - 1];
    const marginOfError = Math.sqrt(finalLoss).toFixed(0);
    console.log(`\n🎯 Iteration ${iter} Final Margin of Error: ±${marginOfError} points`);

    const metricsPath = path.join(savePath, 'metrics_history.json');
    let metricsHistory = [];
    if (fs.existsSync(metricsPath)) {
      try {
        metricsHistory = JSON.parse(fs.readFileSync(metricsPath, 'utf8'));
      } catch (e) {}
    }
    metricsHistory.push({
      iteration: iter,
      timestamp: new Date().toISOString(),
      loss: finalLoss,
      marginOfError: parseInt(marginOfError),
      statesTrainedOn: globalInputs.length
    });
    fs.writeFileSync(metricsPath, JSON.stringify(metricsHistory, null, 2));

    xs.dispose();
    ys.dispose();

    await model.save(new NodeFileSystem(savePath));
    console.log(`✅ Model saved to ${savePath}`);
  }
  
  console.log(`\n🎉 Continuous Training Complete!`);
}

trainModel();
}
