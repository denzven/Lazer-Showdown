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
import { ExpectedDQN, getPossibleActions, applyLightweightAction } from '../src/core/NeuralBot.js';
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

async function simulateGame(epsilon = 0.1) {
  const randomBoard = customBoards[Math.floor(Math.random() * customBoards.length)];
  let state = getInitialState(randomBoard);
  state.epsilon = epsilon; // Pass epsilon to the neural strategy via state
  const gameData = []; // Store state + actor for end-of-game labeling
  
  // Mixed Difficulties (Self-play with Neural network)
  const diffs = ['neural', 'neural', 'hard', 'medium'];
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
        const actionIndex = ExpectedDQN.objToActionIndex(action);
        const roll = state.actionPoints || 0;
        const stateArray = ExpectedDQN.encodeState(state.board, roll, activeRole);
        
        const prevDefenders = state.board.flat().filter(c => c && ['defender_20', 'defender_30', 'defender_50'].includes(c.type)).length;
        const prevRound = state.round || 1;
        
        state = applySandboxAction(state.board, action, activeColor.toLowerCase(), state);

        let stepReward = 0;
        const currentDefenders = state.board.flat().filter(c => c && ['defender_20', 'defender_30', 'defender_50'].includes(c.type)).length;
        
        if (activeRole === 'attacker') {
            stepReward -= 0.05;
            if (currentDefenders < prevDefenders) {
                stepReward += 1.0 * (prevDefenders - currentDefenders);
            }
        } else {
            if (state.round > prevRound) {
                stepReward += 1.0;
            }
        }

        const nextStateArray = ExpectedDQN.encodeState(state.board, state.actionPoints || 0, activeRole);
        
        gameData.push({
            stateArray,
            roll,
            action: actionIndex,
            reward: stepReward,
            nextStateArray,
            nextBoardState: JSON.parse(JSON.stringify(state.board)),
            role: activeRole,
            done: false
        });
        
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
  
  // End of match. Compute final points and terminal bonuses.
  const finalAttackerScore = state.roleRed === 'attacker' ? (state.scores?.red || 0) : (state.scores?.blue || 0);
  const finalDefenderScore = state.roleRed === 'attacker' ? (state.scores?.blue || 0) : (state.scores?.red || 0);
  const scoreDelta = finalAttackerScore - finalDefenderScore;
  
  const finalDefenders = state.board.flat().filter(c => c && ['defender_20', 'defender_30', 'defender_50'].includes(c.type)).length;
  
  if (gameData.length > 0) {
      for (let i = gameData.length - 1; i >= 0; i--) {
          if (gameData[i].role === 'attacker') {
              if (finalDefenders === 0 && state.round <= 3) gameData[i].reward += 5.0;
              break;
          }
      }
      for (let i = gameData.length - 1; i >= 0; i--) {
          if (gameData[i].role === 'defender') {
              if (finalDefenders > 0 && state.round >= 3) gameData[i].reward += 5.0;
              break;
          }
      }
  }

  for (let step of gameData) {
      if (state.winner) step.done = true;
  }
  
  const winner = state.winner === 'tie' ? 'tie' : (state.roleRed === state.winner ? 'red' : 'blue');
  const attackerWon = winner !== 'tie' && ((winner === 'red' && state.roleRed === 'attacker') || (winner === 'blue' && state.roleRed !== 'attacker'));
  const defenderWon = winner !== 'tie' && !attackerWon;

  return { experiences: gameData, scoreDelta, attackerWon, defenderWon, turns };
}

async function generateBatch(games, epsilon) {
  const attackerExperiences = [];
  const defenderExperiences = [];
  
  for (let i = 0; i < games; i++) {
    const { experiences, scoreDelta, attackerWon, defenderWon, turns } = await simulateGame(epsilon);
    for (const exp of experiences) {
       if (exp.role === 'attacker') attackerExperiences.push(exp);
       else if (exp.role === 'defender') defenderExperiences.push(exp);
    }
    parentPort.postMessage({ type: 'progress', data: { scoreDelta, attackerWon, defenderWon, turns } });
  }
  parentPort.postMessage({ type: 'result', data: { attackerExperiences, defenderExperiences } });
}

if (!isMainThread) {
  generateBatch(workerData.gamesToPlay, workerData.epsilon);
} else {

async function trainModel() {
  const numCores = os.cpus().length;
  console.log(`\n🚀 Started Continuous RL Training: ${ITERATIONS} iterations, ${GAMES_TO_PLAY} games per iteration on ${numCores} CPU Cores.`);
  
  let totalGamesSimulated = 0;
  const EPSILON_START = 1.0;
  const EPSILON_END = 0.05;
  const EPSILON_DECAY_GAMES = 5000;
  
  const LR_START = 0.001;
  const LR_END = 0.0001;
  const LR_DECAY_GAMES = 10000;
  
  let lastCheckpointGames = 0;
  
  const savePath = path.resolve('./public/models/ai-bot');
  const attackerModelPath = path.join(savePath, 'attacker_model.json');
  const defenderModelPath = path.join(savePath, 'defender_model.json');
  const attackerBufferPath = path.join(savePath, 'attacker_replay_buffer.json');
  const defenderBufferPath = path.join(savePath, 'defender_replay_buffer.json');
  
  if (!fs.existsSync(savePath)) fs.mkdirSync(savePath, { recursive: true });

  let attackerDqn = new ExpectedDQN();
  let defenderDqn = new ExpectedDQN();

  const loadBuffer = (dqn, bPath, name) => {
    if (fs.existsSync(bPath)) {
      console.log(`\n🔄 Loading ${name} Experience Replay Buffer from disk...`);
      try {
        const bufferData = JSON.parse(fs.readFileSync(bPath, 'utf8'));
        const rawExperiences = bufferData.experiences || [];
        dqn.replayBuffer = rawExperiences.map(exp => {
            if (exp.stateArray && !Array.isArray(exp.stateArray) && !(exp.stateArray instanceof Float32Array)) {
                exp.stateArray = new Float32Array(Object.values(exp.stateArray));
            }
            if (exp.nextStateArray && !Array.isArray(exp.nextStateArray) && !(exp.nextStateArray instanceof Float32Array)) {
                exp.nextStateArray = new Float32Array(Object.values(exp.nextStateArray));
            }
            return exp;
        });
        console.log(`✅ Loaded ${dqn.replayBuffer.length} past states for ${name}.`);
      } catch(e) {
        console.error(`❌ Failed to load ${name} replay buffer. Starting fresh. Error: ${e.message}`);
      }
    }
  };

  loadBuffer(attackerDqn, attackerBufferPath, 'Attacker');
  loadBuffer(defenderDqn, defenderBufferPath, 'Defender');

  const loadModel = async (dqn, mPath, name, fsPathPrefix) => {
    if (fs.existsSync(mPath)) {
      console.log(`\n🔄 Loading existing ${name} expected DQN neural network model...`);
      try {
        // We must override the paths to point to specific files
        class RoleFileSystem extends NodeFileSystem {
            async save(modelArtifacts) {
                const weightsData = Buffer.from(modelArtifacts.weightData);
                const weightsFileName = `${name.toLowerCase()}_weights.bin`;
                fs.writeFileSync(path.join(this.savePath, weightsFileName), weightsData);
                modelArtifacts.weightData = null;
                modelArtifacts.weightSpecs.forEach(s => s.paths = [weightsFileName]);
                fs.writeFileSync(path.join(this.savePath, `${name.toLowerCase()}_model.json`), JSON.stringify(modelArtifacts));
                return { modelArtifactsInfo: { dateSaved: new Date(), modelTopologyType: 'JSON' } };
            }
            async load() {
                const modelJSON = JSON.parse(fs.readFileSync(path.join(this.savePath, `${name.toLowerCase()}_model.json`)));
                const weightsFileName = modelJSON.weightSpecs[0].paths[0];
                const weightData = fs.readFileSync(path.join(this.savePath, weightsFileName));
                return {
                  modelTopology: modelJSON.modelTopology,
                  weightSpecs: modelJSON.weightSpecs,
                  weightData: new Uint8Array(weightData).buffer
                };
            }
        }
        dqn.model = await tf.loadLayersModel(new RoleFileSystem(savePath));
        dqn.model.compile({ optimizer: dqn.optimizer, loss: 'meanSquaredError' });
        dqn.updateTargetModel();
        console.log(`✅ ${name} Model loaded successfully.`);
      } catch (e) {
        console.error(`❌ Failed to load existing ${name} model. Creating a fresh one. Error: ${e.message}`);
      }
    } else {
      console.log(`\n✨ Compiled fresh ${name} Expected DQN Neural Network...`);
      dqn.model.compile({ optimizer: dqn.optimizer, loss: 'meanSquaredError' });
      dqn.targetModel.compile({ optimizer: dqn.optimizer, loss: 'meanSquaredError' });
    }
  };

  // Setup specific filesystems
  class AttackerFS extends NodeFileSystem {
      async save(modelArtifacts) {
          const weightsData = Buffer.from(modelArtifacts.weightData);
          const weightsFileName = `attacker_weights.bin`;
          fs.writeFileSync(path.join(this.savePath, weightsFileName), weightsData);
          modelArtifacts.weightData = null;
          modelArtifacts.weightSpecs.forEach(s => s.paths = [weightsFileName]);
          fs.writeFileSync(path.join(this.savePath, `attacker_model.json`), JSON.stringify(modelArtifacts));
          return { modelArtifactsInfo: { dateSaved: new Date(), modelTopologyType: 'JSON' } };
      }
      async load() {
          const modelJSON = JSON.parse(fs.readFileSync(path.join(this.savePath, `attacker_model.json`)));
          const weightsFileName = modelJSON.weightSpecs[0].paths[0];
          const weightData = fs.readFileSync(path.join(this.savePath, weightsFileName));
          return { modelTopology: modelJSON.modelTopology, weightSpecs: modelJSON.weightSpecs, weightData: new Uint8Array(weightData).buffer };
      }
  }

  class DefenderFS extends NodeFileSystem {
      async save(modelArtifacts) {
          const weightsData = Buffer.from(modelArtifacts.weightData);
          const weightsFileName = `defender_weights.bin`;
          fs.writeFileSync(path.join(this.savePath, weightsFileName), weightsData);
          modelArtifacts.weightData = null;
          modelArtifacts.weightSpecs.forEach(s => s.paths = [weightsFileName]);
          fs.writeFileSync(path.join(this.savePath, `defender_model.json`), JSON.stringify(modelArtifacts));
          return { modelArtifactsInfo: { dateSaved: new Date(), modelTopologyType: 'JSON' } };
      }
      async load() {
          const modelJSON = JSON.parse(fs.readFileSync(path.join(this.savePath, `defender_model.json`)));
          const weightsFileName = modelJSON.weightSpecs[0].paths[0];
          const weightData = fs.readFileSync(path.join(this.savePath, weightsFileName));
          return { modelTopology: modelJSON.modelTopology, weightSpecs: modelJSON.weightSpecs, weightData: new Uint8Array(weightData).buffer };
      }
  }

  await loadModel(attackerDqn, attackerModelPath, 'Attacker', 'attacker');
  await loadModel(defenderDqn, defenderModelPath, 'Defender', 'defender');

  for (let iter = 1; iter <= ITERATIONS; iter++) {
    const currentEpsilon = Math.max(EPSILON_END, EPSILON_START - (totalGamesSimulated / EPSILON_DECAY_GAMES) * (EPSILON_START - EPSILON_END));
    const currentLR = Math.max(LR_END, LR_START - (totalGamesSimulated / LR_DECAY_GAMES) * (LR_START - LR_END));
    
    // Update optimizer learning rate
    attackerDqn.optimizer.learningRate = currentLR;
    defenderDqn.optimizer.learningRate = currentLR;

    console.log(`\n======================================================`);
    console.log(`🔥 ITERATION ${iter}/${ITERATIONS} | Epsilon: ${currentEpsilon.toFixed(3)} | LR: ${currentLR.toFixed(5)} | Total Games: ${totalGamesSimulated}`);
    console.log(`======================================================`);
    
    const gamesPerCore = Math.ceil(GAMES_TO_PLAY / numCores);
    const workers = [];
    
    let newAttackerExperiences = [];
    let newDefenderExperiences = [];
    
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
          workerData: { gamesToPlay: gamesPerCore, epsilon: currentEpsilon },
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
            newAttackerExperiences.push(...msg.data.attackerExperiences);
            newDefenderExperiences.push(...msg.data.defenderExperiences);
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
    totalGamesSimulated += GAMES_TO_PLAY;
    
    console.log(`\n✅ Generated ${newAttackerExperiences.length} new attacker and ${newDefenderExperiences.length} new defender states.`);
    
    for (const exp of newAttackerExperiences) {
       if (exp.action !== -1) attackerDqn.remember(exp.stateArray, exp.action, exp.reward, exp.nextStateArray, exp.done, exp.nextBoardState, exp.role);
    }
    for (const exp of newDefenderExperiences) {
       if (exp.action !== -1) defenderDqn.remember(exp.stateArray, exp.action, exp.reward, exp.nextStateArray, exp.done, exp.nextBoardState, exp.role);
    }
    
    console.log(`💾 Saving Replay Buffers to disk...`);
    const saveBuffer = (dqn, bPath) => {
        const serializedBuffer = dqn.replayBuffer.map(exp => ({
            ...exp,
            stateArray: Array.from(exp.stateArray),
            nextStateArray: Array.from(exp.nextStateArray)
        }));
        fs.writeFileSync(bPath, JSON.stringify({ experiences: serializedBuffer }));
    };
    saveBuffer(attackerDqn, attackerBufferPath);
    saveBuffer(defenderDqn, defenderBufferPath);

    console.log(`🧠 Training Attacker DQN on ${attackerDqn.replayBuffer.length} total states...`);
    const attSteps = Math.min(Math.floor(attackerDqn.replayBuffer.length / attackerDqn.batchSize), 100);
    const progressBarWidth = 30;
    
    for(let t = 0; t < attSteps; t++) {
        await attackerDqn.trainStep();
        if (t % Math.max(1, Math.floor(attSteps / 10)) === 0 || t === attSteps - 1) {
             const progress = (t + 1) / attSteps;
             const bar = '█'.repeat(Math.ceil(progress * progressBarWidth)).padEnd(progressBarWidth, '░');
             process.stdout.write(`\rAttacker Mini-Batches: [${t + 1}/${attSteps}] |${bar}|`);
        }
    }
    console.log("");
    
    console.log(`🧠 Training Defender DQN on ${defenderDqn.replayBuffer.length} total states...`);
    const defSteps = Math.min(Math.floor(defenderDqn.replayBuffer.length / defenderDqn.batchSize), 100);
    for(let t = 0; t < defSteps; t++) {
        await defenderDqn.trainStep();
        if (t % Math.max(1, Math.floor(defSteps / 10)) === 0 || t === defSteps - 1) {
             const progress = (t + 1) / defSteps;
             const bar = '█'.repeat(Math.ceil(progress * progressBarWidth)).padEnd(progressBarWidth, '░');
             process.stdout.write(`\rDefender Mini-Batches: [${t + 1}/${defSteps}] |${bar}|`);
        }
    }
    console.log("");
    
    attackerDqn.updateTargetModel();
    defenderDqn.updateTargetModel();

    // Checkpointing every 500 games
    if (totalGamesSimulated - lastCheckpointGames >= 500) {
        console.log(`\n💾 Reached 500+ games since last checkpoint. Saving model weights to ${savePath}...`);
        await attackerDqn.model.save(new AttackerFS(savePath));
        await defenderDqn.model.save(new DefenderFS(savePath));
        lastCheckpointGames = totalGamesSimulated;
    }
  }
  
  // Final save at the end of all iterations
  await attackerDqn.model.save(new AttackerFS(savePath));
  await defenderDqn.model.save(new DefenderFS(savePath));
  console.log(`\n✅ Final Models saved to ${savePath}`);
  
  console.log(`\n🎉 Continuous Training Complete!`);
}

trainModel();
}
