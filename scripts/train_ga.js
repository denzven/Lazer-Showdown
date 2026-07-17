import fs from 'fs';
import path from 'path';
import { Worker, isMainThread, parentPort } from 'worker_threads';
import os from 'os';

// Emulate minimal browser environment for React imports to not crash
global.window = {};

import { getInitialState, applySandboxAction } from '../src/core/GameState.js';
import { getBotSetupAction } from '../src/core/BotEngine.js';
import { 
  EasyStrategy, 
  MediumStrategy, 
  HardStrategy, 
  DEFAULT_WEIGHTS, 
  findBestActionSequenceExpectiminimax,
  getChallengeRecommendation 
} from '../src/core/BotStrategies.js';

// Load boards
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

// Genetic Algorithm Constants
const POPULATION_SIZE = 100;
const GENERATIONS = 50;
const MAX_TURNS = 3000; // Realistic cap for event loops
const ELITE_PERCENT = 0.5;
const MUTATION_RATE = 0.5;
const MUTATION_STRENGTH = 0.2; // Max +/- 20% mutation

const BASELINE_OPPONENTS = ['easy', 'medium', 'hard'];

// Helper to roll dice
const rollDie = () => Math.floor(Math.random() * 6) + 1;

// GA Bot strategy wrapper
function getGaPlayAction(board, role, actionPoints, cautiousness, weights) {
  // Use Expectiminimax for the GA bot
  const { bestAction } = findBestActionSequenceExpectiminimax(board, role, actionPoints, cautiousness, weights, 1);
  return bestAction;
}

function getOpponentPlayAction(board, role, actionPoints, botPlayer, state) {
  if (botPlayer === 'easy') return EasyStrategy.getPlayAction(board, role, actionPoints, state, botPlayer);
  if (botPlayer === 'medium') return MediumStrategy.getPlayAction(board, role, actionPoints, state, botPlayer);
  if (botPlayer === 'hard') return HardStrategy.getPlayAction(board, role, actionPoints, state, botPlayer);
  if (botPlayer === 'default') {
    const { bestAction } = findBestActionSequenceExpectiminimax(board, role, actionPoints, 1.0, DEFAULT_WEIGHTS, 1);
    return bestAction;
  }
  return null;
}

// Plays a headless game between GA bot and a baseline opponent
function simulateGaGame(boardData, oppType, gaWeights) {
  let state = getInitialState(boardData);
  const gaColor = Math.random() > 0.5 ? 'red' : 'blue';
  const oppColor = gaColor === 'red' ? 'blue' : 'red';
  
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
    const isGaTurn = (activeColor === gaColor);

    if (state.phase === 'setup-defender' || state.phase === 'challenge-setup' || state.phase === 'setup-attacker') {
      // Use standard Hard setup logic for GA bot to save time
      let action = getBotSetupAction(state.board, state.phase, activeColor, isGaTurn ? 'hard' : (oppType === 'default' ? 'hard' : oppType), state.challengedPiece);
      if (action) state = applySandboxAction(state.board, action, activeColor.toLowerCase(), state);
      else state = applySandboxAction(state.board, { type: 'confirm-setup' }, activeColor.toLowerCase(), state);
      if (state.error) {
        console.error(`Setup Error for ${activeColor}:`, state.error, 'Action:', action);
        break;
      }
      continue;
    }

    if (state.phase === 'playing') {
      if (!state.hasRolledDice) {
        state = applySandboxAction(state.board, { type: 'end-roll', values: [rollDie(), rollDie()] }, activeColor.toLowerCase(), state);
        continue;
      }
      
      let action = null;
      // Get Action only if they have AP
      if (state.actionPoints > 0) {
        if (isGaTurn) {
           action = getGaPlayAction(state.board, activeRole, state.actionPoints, 1.0, gaWeights); // using cautiousness 1.0
        } else {
           action = getOpponentPlayAction(state.board, activeRole, state.actionPoints, oppType, state);
        }
      }
      
      if (action) {
        state = applySandboxAction(state.board, action, activeColor.toLowerCase(), state);
      } else {
        state = applySandboxAction(state.board, { type: 'end-turn' }, activeColor.toLowerCase(), state);
      }
      if (state.error) {
        console.error(`Simulation Error for ${activeColor}:`, state.error, 'Action:', action);
        break;
      }
      continue;
    }

    if (state.phase === 'challenge-declaration') {
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
  }

  if (!state.winner && turns >= MAX_TURNS) {
    // Game hit the turn cap, force a decision based on current scores
    const redScore = state.scores?.red || 0;
    const blueScore = state.scores?.blue || 0;
    if (redScore > blueScore) state.winner = 'red';
    else if (blueScore > redScore) state.winner = 'blue';
    else state.winner = 'draw';
  }

  const gaWon = state.winner === gaColor;
  const opponentWon = state.winner === oppColor;
  const isDraw = state.winner === 'draw' || (!gaWon && !opponentWon);
  const gaScore = state.scores?.[gaColor] || 0;
  return { gaWon, opponentWon, isDraw, gaScore, turns };
}

// Run a validation test between the trained best weights and default weights
function testAgainstDefault(bestDna, numGames = 10) {
  let gaWins = 0;
  let defaultWins = 0;
  let draws = 0;
  const boards = customBoards.length > 0 ? customBoards : [null];
  
  for (let i = 0; i < numGames; i++) {
    const boardData = boards[i % boards.length];
    const res = simulateGaGame(boardData, 'default', bestDna);
    if (res.gaWon) {
      gaWins++;
    } else if (res.opponentWon) {
      defaultWins++;
    } else {
      draws++;
    }
  }
  return { gaWins, defaultWins, draws };
}

// Generate random DNA based on defaults
function createRandomDNA(baseWeights = DEFAULT_WEIGHTS) {
  const dna = { ...baseWeights };
  for (const key of Object.keys(dna)) {
    // Randomize initial weight between 0.5x and 1.5x
    dna[key] = dna[key] * (0.5 + Math.random());
  }
  return dna;
}

// Breed two parents
function crossoverAndMutate(parentA, parentB) {
  const child = {};
  for (const key of Object.keys(DEFAULT_WEIGHTS)) {
    // 50/50 from A or B
    child[key] = Math.random() > 0.5 ? parentA[key] : parentB[key];
    
    // Mutation
    if (Math.random() < MUTATION_RATE) {
      const shift = 1 + (Math.random() * 2 - 1) * MUTATION_STRENGTH; // +/- 20%
      child[key] = child[key] * shift;
    }
  }
  return child;
}

// Parallel Task Runner using Worker Threads
function runTasksInParallel(tasks, numWorkers) {
  const fileUrl = new URL(import.meta.url);
  const activeWorkerTasks = new Map();
  let taskIndex = 0;
  let completedCount = 0;
  const results = [];
  const workers = [];

  return new Promise((resolve, reject) => {
    let resolved = false;

    const handleWorkerDone = (worker, result) => {
      completedCount++;
      // Print dot progress indicators representing evaluation progress
      if (completedCount % Math.max(1, Math.floor(tasks.length / 50)) === 0) {
        process.stdout.write(`.`);
      }
      results.push(result);

      if (taskIndex < tasks.length) {
        const nextTask = tasks[taskIndex++];
        activeWorkerTasks.set(worker, nextTask);
        worker.postMessage(nextTask);
      } else {
        if (completedCount === tasks.length) {
          resolved = true;
          for (const w of workers) {
            w.terminate();
          }
          resolve(results);
        }
      }
    };

    for (let w = 0; w < numWorkers; w++) {
      const worker = new Worker(fileUrl);
      workers.push(worker);

      worker.on('message', (msg) => {
        const task = activeWorkerTasks.get(worker);
        handleWorkerDone(worker, { ...msg, index: task.index, opp: task.oppType });
      });
      worker.on('error', (err) => {
        if (!resolved) {
          console.error("\n❌ Worker Error:", err);
          reject(err);
        }
      });
      worker.on('exit', (code) => {
        if (code !== 0 && !resolved) {
          reject(new Error(`Worker stopped with exit code ${code}`));
        }
      });

      if (taskIndex < tasks.length) {
        const task = tasks[taskIndex++];
        activeWorkerTasks.set(worker, task);
        worker.postMessage(task);
      }
    }

    if (tasks.length === 0) resolve([]);
  });
}

// Run the Tournament
async function runGA() {
  const testMode = process.argv.includes('--test');
  const useSeed = process.argv.includes('--seed');
  const maxGens = testMode ? 2 : GENERATIONS;
  const popSize = testMode ? 10 : POPULATION_SIZE;

  // Handle threads count configuration
  const threadArgIndex = process.argv.indexOf('--threads');
  let numWorkers = os.cpus().length || 4;
  if (threadArgIndex !== -1 && threadArgIndex + 1 < process.argv.length) {
    const parsedThreads = parseInt(process.argv[threadArgIndex + 1]);
    if (!isNaN(parsedThreads)) numWorkers = parsedThreads;
  }

  let baseWeights = DEFAULT_WEIGHTS;
  if (useSeed) {
    const weightsPath = path.resolve('./src/core/ga_weights.json');
    if (fs.existsSync(weightsPath)) {
      try {
        baseWeights = JSON.parse(fs.readFileSync(weightsPath, 'utf8'));
        console.log(`🌱 Seeding initial population with current weights from ${weightsPath}`);
      } catch (e) {
        console.log(`\n⚠️ Failed to load ${weightsPath}, using DEFAULT_WEIGHTS.`);
      }
    } else {
      console.log(`\n⚠️ ga_weights.json not found, using DEFAULT_WEIGHTS.`);
    }
  }

  console.log(`🚀 Starting GA Training - ${maxGens} Generations, ${popSize} Bots`);
  console.log(`💻 Utilizing ${numWorkers} parallel CPU worker threads...`);

  let population = Array(popSize).fill(0).map(() => createRandomDNA(baseWeights));

  const activeBoards = testMode ? [null] : customBoards;
  const activeOpps = testMode ? ['easy'] : BASELINE_OPPONENTS;

  for (let gen = 1; gen <= maxGens; gen++) {
    console.log(`\n[Generation ${gen}] Simulating ${popSize * activeBoards.length * activeOpps.length} games...`);
    const startTime = Date.now();
    
    // Prepare independent simulation tasks
    const tasks = [];
    for (let i = 0; i < popSize; i++) {
      const dna = population[i];
      for (const boardData of activeBoards) {
        for (const opp of activeOpps) {
          tasks.push({ dna, boardData, oppType: opp, index: i });
        }
      }
    }

    process.stdout.write(`Evaluating Population: [`);
    const results = await runTasksInParallel(tasks, numWorkers);
    process.stdout.write(`] Done!\n`);

    // Aggregate bot stats
    const botStats = Array(popSize).fill(0).map((_, i) => ({
      dna: population[i],
      totalWins: 0,
      totalPoints: 0,
      totalTurns: 0,
      winBreakdown: { easy: 0, medium: 0, hard: 0 }
    }));

    for (const res of results) {
      const stat = botStats[res.index];
      if (res.gaWon) {
        stat.totalWins++;
        stat.winBreakdown[res.opp]++;
      }
      stat.totalPoints += res.gaScore;
      stat.totalTurns += res.turns;
    }

    const scores = botStats.map(stat => {
      const avgTurns = stat.totalTurns / (activeBoards.length * activeOpps.length);
      const fitness = (stat.totalWins * 1000) + stat.totalPoints - (avgTurns * 10);
      return {
        dna: stat.dna,
        fitness,
        wins: stat.totalWins,
        winBreakdown: stat.winBreakdown,
        avgTurns
      };
    });

    // Sort by fitness descending
    scores.sort((a, b) => b.fitness - a.fitness);
    
    const bestBot = scores[0];
    const totalGames = activeBoards.length * activeOpps.length;
    const avgPopFitness = scores.reduce((sum, s) => sum + s.fitness, 0) / popSize;
    
    console.log(`\n\x1b[36m--- Generation ${gen} Results ---\x1b[0m`);
    console.log(`  ⏱️  Time taken: ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
    console.log(`  📊  Population Average Fitness: ${Math.round(avgPopFitness)}`);
    console.log(`  🏆  Best Individual Fitness: \x1b[32m${Math.round(bestBot.fitness)}\x1b[0m`);
    console.log(`  ⚔️  Best Bot Overall Win Rate: \x1b[33m${((bestBot.wins / totalGames) * 100).toFixed(1)}%\x1b[0m`);
    console.log(`      - vs Easy:   ${bestBot.winBreakdown.easy}/${activeBoards.length}`);
    console.log(`      - vs Medium: ${bestBot.winBreakdown.medium}/${activeBoards.length}`);
    console.log(`      - vs Hard:   ${bestBot.winBreakdown.hard}/${activeBoards.length}`);
    console.log(`  ⚡  Avg Turns: ${bestBot.avgTurns.toFixed(1)}`);
    
    // Format DNA differences dynamically
    const bestDnaKeys = ['attWinBonus', 'attCenterControlBonus', 'defThreatPenaltyMultiplier', 'defSurvivalMultiplier', 'attMobilityBonus'];
    const snapshotStr = bestDnaKeys.map(k => `${k}: ${bestBot.dna[k].toFixed(2)}`).join(', ');
    console.log(`  🧬  Top DNA Sample: { ${snapshotStr} ... }\n`);

    // Save checkpoint of the best bot from this generation
    const exportPath = path.resolve('./src/core/ga_weights.json');
    try {
      fs.writeFileSync(exportPath, JSON.stringify(bestBot.dna, null, 2));
      console.log(`  💾  Checkpoint weights saved to ${exportPath}`);
    } catch (e) {
      console.error(`  ⚠️  Failed to save checkpoint:`, e.message);
    }

    // Run validation test against default Expectiminimax
    const numTestGames = 10;
    process.stdout.write(`  ⚔️  Testing Checkpoint vs Default Expectiminimax (${numTestGames} games)... `);
    const testResult = testAgainstDefault(bestBot.dna, numTestGames);
    const winRate = ((testResult.gaWins / numTestGames) * 100).toFixed(1);
    console.log(`Done!`);
    console.log(`     GA Bot Wins: \x1b[32m${testResult.gaWins}\x1b[0m | Default Bot Wins: \x1b[31m${testResult.defaultWins}\x1b[0m | Draws: ${testResult.draws}`);
    console.log(`     Win Rate: \x1b[33m${winRate}%\x1b[0m`);
    if (testResult.gaWins > testResult.defaultWins) {
      console.log(`     🏆 Status: GA Bot is OUTPERFORMING default Expectiminimax!\n`);
    } else if (testResult.gaWins < testResult.defaultWins) {
      console.log(`     ⚠️ Status: GA Bot is underperforming compared to default Expectiminimax.\n`);
    } else {
      console.log(`     🤝 Status: GA Bot is evenly matched with default Expectiminimax.\n`);
    }

    if (gen < maxGens) {
      const elitesCount = Math.max(1, Math.floor(popSize * ELITE_PERCENT));
      const elites = scores.slice(0, elitesCount).map(s => s.dna);
      
      const newPopulation = [...elites]; // Keep elites
      
      // Breed the rest
      while (newPopulation.length < popSize) {
        const parentA = elites[Math.floor(Math.random() * elites.length)];
        const parentB = elites[Math.floor(Math.random() * elites.length)];
        newPopulation.push(crossoverAndMutate(parentA, parentB));
      }
      
      population = newPopulation;
    } else {
      console.log(`\n✅ GA Training Complete! Final optimal weights saved to ${exportPath}`);
    }
  }
}

// Master execution block
if (isMainThread) {
  runGA().catch(console.error);
} else {
  // Worker process message handler
  parentPort.on('message', (task) => {
    try {
      const { boardData, oppType, dna } = task;
      const result = simulateGaGame(boardData, oppType, dna);
      parentPort.postMessage(result);
    } catch (err) {
      console.error("\n❌ Worker Exception:", err.message, err.stack);
      process.exit(1);
    }
  });
}
