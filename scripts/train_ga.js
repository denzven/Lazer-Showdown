import fs from 'fs';
import path from 'path';
import { Worker, isMainThread, parentPort } from 'worker_threads';
import os from 'os';

// Emulate minimal browser environment for React imports to not crash
global.window = {};

import { getInitialState, applySandboxAction } from '../src/core/GameState.js';
import { getBotSetupAction } from '../src/core/BotEngine.js';
import { 
  BUILTIN_STRATEGIES, 
  DEFAULT_WEIGHTS, 
  findBestActionSequenceExpectiminimax,
  getChallengeRecommendation 
} from '../src/core/BotStrategies.js';

import { EasyStrategy } from '../src/bots/01_EasyStrategy.js';
import { MediumStrategy } from '../src/bots/02_MediumStrategy.js';
import { HardStrategy } from '../src/bots/03_HardStrategy.js';
import { GAStrategy } from '../src/bots/04_GAStrategy.js';

// Inject into BUILTIN_STRATEGIES for Node.js environment since Vite's import.meta.glob is unsupported
BUILTIN_STRATEGIES['easy'] = EasyStrategy;
BUILTIN_STRATEGIES['medium'] = MediumStrategy;
BUILTIN_STRATEGIES['hard'] = HardStrategy;
BUILTIN_STRATEGIES['ga'] = GAStrategy;

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
const ELITE_PERCENT = 0.05; // 5% elitism
const MUTATION_RATE = 0.5;
const MUTATION_STRENGTH = 0.2; // Max +/- 20% mutation

const BASELINE_OPPONENTS = ['easy', 'medium', 'hard', 'default'];

// Helper to roll dice
const rollDie = () => Math.floor(Math.random() * 6) + 1;

// GA Bot strategy wrapper
function getGaPlayAction(board, role, actionPoints, cautiousness, weights) {
  // Use Expectiminimax for the GA bot
  const { action: bestAction } = findBestActionSequenceExpectiminimax(board, role, actionPoints, cautiousness, weights, 1);
  return bestAction;
}

function getOpponentPlayAction(board, role, actionPoints, botPlayer, state) {
  if (botPlayer === 'easy') return BUILTIN_STRATEGIES['easy'].getPlayAction(board, role, actionPoints, state, botPlayer);
  if (botPlayer === 'medium') return BUILTIN_STRATEGIES['medium'].getPlayAction(board, role, actionPoints, state, botPlayer);
  if (botPlayer === 'hard') return BUILTIN_STRATEGIES['hard'].getPlayAction(board, role, actionPoints, state, botPlayer);
  if (botPlayer === 'default') {
    const { action: bestAction } = findBestActionSequenceExpectiminimax(board, role, actionPoints, 1.0, DEFAULT_WEIGHTS.average_tied, 1); // using a default gear for baseline
    return bestAction;
  }
  return null;
}

// Plays a headless game between GA bot and a baseline opponent
function simulateGaGame(boardData, oppType, gaWeights, taskId = null) {
  let state = getInitialState(boardData);
  const gaColor = Math.random() > 0.5 ? 'red' : 'blue';
  const oppColor = gaColor === 'red' ? 'blue' : 'red';
  
  let turns = 0;
  let totalDiceRolls = 0;
  let numDiceRolls = 0;
  
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
        const r1 = rollDie();
        const r2 = rollDie();
        if (isGaTurn) {
           totalDiceRolls += (r1 + r2);
           numDiceRolls++;
        }
        state = applySandboxAction(state.board, { type: 'end-roll', values: [r1, r2] }, activeColor.toLowerCase(), state);
        continue;
      }
      
      let action = null;
      // Get Action only if they have AP
      if (state.actionPoints > 0) {
        if (isGaTurn) {
           // Gear Shifting Logic
           const currentLuckAvg = numDiceRolls > 0 ? (totalDiceRolls / numDiceRolls) : 7.0;
           let luckTier = 'average';
           if (currentLuckAvg < 6.0) luckTier = 'unlucky';
           else if (currentLuckAvg > 8.0) luckTier = 'lucky';
           
           const gaScore = state.scores?.[gaColor] || 0;
           const oppScore = state.scores?.[oppColor] || 0;
           let scoreTier = 'tied';
           if (gaScore > oppScore) scoreTier = 'winning';
           else if (gaScore < oppScore) scoreTier = 'losing';
           
           const gearName = `${luckTier}_${scoreTier}`;
           const gearWeights = gaWeights[gearName] || Object.values(gaWeights)[0]; // Fallback just in case
           action = getGaPlayAction(state.board, activeRole, state.actionPoints, 1.0, gearWeights);
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
  
  const gaRole = state.roleRed === 'attacker' ? (gaColor === 'red' ? 'attacker' : 'defender') : (gaColor === 'red' ? 'defender' : 'attacker');

  return { taskId, gaWon, opponentWon, isDraw, gaScore, turns, totalDiceRolls, numDiceRolls, gaRole };
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

function normalizeWeights(dna) {
  const normalized = {};
  for (const gear of Object.keys(dna)) {
    let sum = 0;
    for (const key of Object.keys(dna[gear])) {
      sum += Math.abs(dna[gear][key]);
    }
    const scale = sum === 0 ? 1 : (100000 / sum);
    normalized[gear] = {};
    for (const key of Object.keys(dna[gear])) {
      normalized[gear][key] = dna[gear][key] * scale;
    }
  }
  return normalized;
}

// Generate random DNA based on defaults
function createRandomDNA(baseWeights = DEFAULT_WEIGHTS) {
  const dna = {};
  for (const gear of Object.keys(baseWeights)) {
    dna[gear] = {};
    for (const key of Object.keys(baseWeights[gear])) {
      // Randomize initial weight between 0.5x and 1.5x
      dna[gear][key] = baseWeights[gear][key] * (0.5 + Math.random());
    }
  }
  return normalizeWeights(dna);
}

// Breed two parents
function crossoverAndMutate(parentA, parentB) {
  const child = {};
  for (const gear of Object.keys(DEFAULT_WEIGHTS)) {
    child[gear] = {};
    for (const key of Object.keys(DEFAULT_WEIGHTS[gear])) {
      // 50/50 from A or B
      child[gear][key] = Math.random() > 0.5 ? parentA[gear][key] : parentB[gear][key];
      
      // Mutation
      if (Math.random() < MUTATION_RATE) {
        const shift = 1 + (Math.random() * 2 - 1) * MUTATION_STRENGTH; // +/- 20%
        child[gear][key] = child[gear][key] * shift;
      }
    }
  }
  return normalizeWeights(child);
}

function tournamentSelection(populationScores, k = 3) {
  let best = null;
  for(let i = 0; i < k; i++) {
     const candidate = populationScores[Math.floor(Math.random() * populationScores.length)];
     if (!best || candidate.fitness > best.fitness) {
         best = candidate;
     }
  }
  return best.dna;
}

// Parallel Task Runner using Worker Threads
function runTasksInParallel(tasks, numWorkers, onResult) {
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
      if (onResult) onResult(result);

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
  const fresh = process.argv.includes('--fresh');
  const useSeed = !fresh;
  const maxGens = testMode ? 2 : GENERATIONS;
  const popSize = testMode ? 10 : POPULATION_SIZE;

  // Handle threads count configuration
  const threadArgIndex = process.argv.indexOf('--threads');
  let numWorkers = os.cpus().length || 4;
  if (threadArgIndex !== -1 && threadArgIndex + 1 < process.argv.length) {
    const parsedThreads = parseInt(process.argv[threadArgIndex + 1]);
    if (!isNaN(parsedThreads)) numWorkers = parsedThreads;
  }

  let globalBestFitness = -Infinity;
  let globalBestWinRate = -1;
  let startGen = 1;
  let baseWeights = DEFAULT_WEIGHTS;

  const gaDir = path.resolve('./src/core/ga');
  if (!fs.existsSync(gaDir)) fs.mkdirSync(gaDir, { recursive: true });
  const statePath = path.join(gaDir, 'ga_training_state.json');
  const popPath = path.join(gaDir, 'ga_population.json');
  const bestPath = path.join(gaDir, 'ga_best_weights.json');
  const historyPath = path.join(gaDir, 'ga_history.csv');
  const partialPath = path.join(gaDir, 'ga_partial_results.jsonl');

  let population = [];

  if (useSeed && fs.existsSync(popPath) && fs.existsSync(statePath)) {
      try {
          population = JSON.parse(fs.readFileSync(popPath, 'utf8'));
          
          // Handle population size changes (e.g., resuming a --test run in production mode)
          if (population.length < popSize) {
              console.log(`⚠️  Loaded population size (${population.length}) is smaller than requested (${popSize}). Padding with new random bots.`);
              while (population.length < popSize) {
                  population.push(createRandomDNA(baseWeights));
              }
          } else if (population.length > popSize) {
              console.log(`⚠️  Loaded population size (${population.length}) is larger than requested (${popSize}). Truncating.`);
              population = population.slice(0, popSize);
          }
          
          const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
          startGen = state.currentGeneration + 1;
          globalBestFitness = state.globalBestFitness || -Infinity;
          globalBestWinRate = state.globalBestWinRate || -1;
          console.log(`🌱 Resuming training from generation ${startGen} with saved population.`);
      } catch (e) {
          console.log(`\n⚠️ Failed to load checkpoints, starting fresh.`);
      }
  } else if (useSeed && fs.existsSync(bestPath)) {
      try {
         baseWeights = JSON.parse(fs.readFileSync(bestPath, 'utf8'));
         console.log(`🌱 Seeding initial population with weights from ${bestPath}`);
      } catch (e) {
         console.log(`\n⚠️ Failed to load ${bestPath}, using DEFAULT_WEIGHTS.`);
      }
  }

  if (population.length === 0) {
      console.log(`✨ Starting fresh with new population.`);
      population = Array(popSize).fill(0).map(() => createRandomDNA(baseWeights));
      if (!fs.existsSync(historyPath)) {
         fs.writeFileSync(historyPath, "Generation,AvgFitness,BestFitness,WinRateVsDefault,AvgDiceRollSum\n");
      }
  }

  console.log(`🚀 Starting GA Training - ${maxGens} Generations, ${popSize} Bots`);
  console.log(`💻 Utilizing ${numWorkers} parallel CPU worker threads...`);

  const activeBoards = testMode ? [null] : customBoards;
  const activeOpps = testMode ? ['easy', 'default'] : BASELINE_OPPONENTS;

  for (let gen = startGen; gen <= maxGens; gen++) {
    console.log(`\n[Generation ${gen}] Simulating ${popSize * activeBoards.length * activeOpps.length} games...`);
    const startTime = Date.now();
    
    // Prepare independent simulation tasks
    const allTasks = [];
    for (let i = 0; i < popSize; i++) {
      const dna = population[i];
      for (let b = 0; b < activeBoards.length; b++) {
        const boardData = activeBoards[b];
        for (const opp of activeOpps) {
          const taskId = `${i}_${b}_${opp}`;
          allTasks.push({ taskId, dna, boardData, oppType: opp, index: i });
        }
      }
    }

    const completedTasksMap = new Map();
    if (fs.existsSync(partialPath)) {
      try {
        const lines = fs.readFileSync(partialPath, 'utf8').split('\n').filter(Boolean);
        for (const line of lines) {
          const data = JSON.parse(line);
          if (data.generation === gen) {
            completedTasksMap.set(data.result.taskId, data.result);
          }
        }
      } catch(e) {}
    }
    
    const tasksToRun = [];
    const results = [];
    for (const task of allTasks) {
       if (completedTasksMap.has(task.taskId)) {
           results.push(completedTasksMap.get(task.taskId));
       } else {
           tasksToRun.push(task);
       }
    }

    if (completedTasksMap.size > 0) {
       console.log(`  ♻️  Resuming from checkpoint. Skipping ${completedTasksMap.size} completed games.`);
    }

    process.stdout.write(`Evaluating Population: [`);
    
    const onResult = (result) => {
       try {
         fs.appendFileSync(partialPath, JSON.stringify({ generation: gen, result }) + '\n');
       } catch (e) {}
    };

    const newResults = await runTasksInParallel(tasksToRun, numWorkers, onResult);
    results.push(...newResults);
    process.stdout.write(`] Done!\n`);

    // Aggregate bot stats
    const botStats = Array(popSize).fill(0).map((_, i) => ({
      dna: population[i],
      totalWins: 0,
      totalPoints: 0,
      totalTurns: 0,
      winBreakdown: { easy: 0, medium: 0, hard: 0, default: 0 },
      games: []
    }));

    for (const res of results) {
      const stat = botStats[res.index];
      if (res.gaWon) {
        stat.totalWins++;
        if (stat.winBreakdown[res.opp] !== undefined) stat.winBreakdown[res.opp]++;
      }
      stat.totalPoints += res.gaScore;
      stat.totalTurns += res.turns;
      stat.games.push(res);
    }

    const scores = botStats.map(stat => {
      let fitness = 0;
      let totalAvgDice = 0;
      let totalDiceRollsSum = 0;
      let numGamesWithDice = 0;
      
      for (const game of stat.games) {
         let gameFitness = 0;
         if (game.gaWon) {
            gameFitness += 1000;
         } else if (game.isDraw) {
            gameFitness += 300;
         }
         gameFitness += game.gaScore;
         
         const turnPenalty = game.gaRole === 'attacker' ? 10 : 2;
         gameFitness -= (game.turns * turnPenalty);
         
         if (game.numDiceRolls > 0) {
             const avgRoll = game.totalDiceRolls / game.numDiceRolls;
             totalDiceRollsSum += avgRoll;
             numGamesWithDice++;
             // Expected sum of 2d6 is 7.0
             // Unlucky (low rolls) wins should get a huge bonus multiplier
             if (game.gaWon) {
                 const luckMultiplier = 7.0 / avgRoll;
                 gameFitness *= luckMultiplier;
             }
         }
         fitness += gameFitness;
      }
      
      const avgTurns = stat.totalTurns / stat.games.length;
      const avgDiceRollSum = numGamesWithDice > 0 ? (totalDiceRollsSum / numGamesWithDice) : 7.0;

      return {
        dna: stat.dna,
        fitness,
        wins: stat.totalWins,
        winBreakdown: stat.winBreakdown,
        avgTurns,
        avgDiceRollSum
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
    console.log(`      - vs Easy:    ${bestBot.winBreakdown.easy}/${activeBoards.length}`);
    console.log(`      - vs Medium:  ${bestBot.winBreakdown.medium}/${activeBoards.length}`);
    console.log(`      - vs Hard:    ${bestBot.winBreakdown.hard}/${activeBoards.length}`);
    console.log(`      - vs Default: ${bestBot.winBreakdown.default}/${activeBoards.length}`);
    console.log(`  ⚡  Avg Turns: ${bestBot.avgTurns.toFixed(1)}`);
    
    // Format DNA differences dynamically
    const sampleGear = 'average_tied';
    const bestDnaKeys = ['attWinBonus', 'attCenterControlBonus', 'defThreatPenaltyMultiplier', 'defSurvivalMultiplier'];
    const snapshotStr = bestDnaKeys.map(k => `${k}: ${bestBot.dna[sampleGear][k].toFixed(2)}`).join(', ');
    console.log(`  🧬  Top DNA Sample (${sampleGear}): { ${snapshotStr} ... }`);
    console.log(`  🎲  Avg Dice Roll Sum: ${bestBot.avgDiceRollSum.toFixed(2)}\n`);

    // Run validation test against default Expectiminimax
    const numTestGames = 10;
    process.stdout.write(`  ⚔️  Testing Checkpoint vs Default Expectiminimax (${numTestGames} games)... `);
    const testResult = testAgainstDefault(bestBot.dna, numTestGames);
    const winRate = (testResult.gaWins / numTestGames) * 100;
    console.log(`Done!`);
    console.log(`     GA Bot Wins: \x1b[32m${testResult.gaWins}\x1b[0m | Default Bot Wins: \x1b[31m${testResult.defaultWins}\x1b[0m | Draws: ${testResult.draws}`);
    console.log(`     Win Rate: \x1b[33m${winRate.toFixed(1)}%\x1b[0m`);
    
    if (testResult.gaWins > testResult.defaultWins) {
      console.log(`     🏆 Status: GA Bot is OUTPERFORMING default Expectiminimax!\n`);
    } else if (testResult.gaWins < testResult.defaultWins) {
      console.log(`     ⚠️ Status: GA Bot is underperforming compared to default Expectiminimax.\n`);
    } else {
      console.log(`     🤝 Status: GA Bot is evenly matched with default Expectiminimax.\n`);
    }

    // CSV logging
    try {
        fs.appendFileSync(historyPath, `${gen},${Math.round(avgPopFitness)},${Math.round(bestBot.fitness)},${winRate.toFixed(1)},${bestBot.avgDiceRollSum.toFixed(2)}\n`);
    } catch(e) {}

    // Save continuous learning state
    fs.writeFileSync(popPath, JSON.stringify(population, null, 2));
    fs.writeFileSync(statePath, JSON.stringify({
        currentGeneration: gen,
        globalBestFitness: Math.max(globalBestFitness, bestBot.fitness),
        globalBestWinRate: Math.max(globalBestWinRate, winRate)
    }, null, 2));
    console.log(`  💾  Checkpoints saved to ga_population.json & ga_training_state.json`);
    
    // Clear partial results since the generation is fully complete
    if (fs.existsSync(partialPath)) {
        fs.unlinkSync(partialPath);
    }

    // Update best weights if validation is better
    if (winRate > globalBestWinRate || (winRate === globalBestWinRate && bestBot.fitness > globalBestFitness)) {
        globalBestWinRate = winRate;
        globalBestFitness = bestBot.fitness;
        fs.writeFileSync(bestPath, JSON.stringify(bestBot.dna, null, 2));
        console.log(`  🌟  NEW ALL-TIME BEST! Weights saved to ${bestPath}`);
    }

    if (gen < maxGens) {
      const elitesCount = Math.max(1, Math.floor(popSize * ELITE_PERCENT));
      const elites = scores.slice(0, elitesCount).map(s => s.dna);
      
      const newPopulation = [...elites]; // Keep elites
      
      // Breed the rest
      while (newPopulation.length < popSize) {
        const parentA = tournamentSelection(scores, 3);
        const parentB = tournamentSelection(scores, 3);
        newPopulation.push(crossoverAndMutate(parentA, parentB));
      }
      
      population = newPopulation;
    } else {
      console.log(`\n✅ GA Training Complete!`);
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
      const { taskId, boardData, oppType, dna } = task;
      const result = simulateGaGame(boardData, oppType, dna, taskId);
      parentPort.postMessage(result);
    } catch (err) {
      console.error("\n❌ Worker Exception:", err.message, err.stack);
      process.exit(1);
    }
  });
}
