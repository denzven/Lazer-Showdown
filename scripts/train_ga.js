import fs from 'fs';
import path from 'path';

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
      let action = getBotSetupAction(state.board, state.phase, activeColor, isGaTurn ? 'hard' : oppType, state.challengedPiece);
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
        // Force an early break so we don't hang in a 1000 loop of death doing nothing
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
  const gaScore = state.scores?.[gaColor] || 0;
  return { gaWon, gaScore, turns };
}

// Generate random DNA based on defaults
function createRandomDNA() {
  const dna = { ...DEFAULT_WEIGHTS };
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

// Run the Tournament
async function runGA() {
  const testMode = process.argv.includes('--test');
  const maxGens = testMode ? 2 : GENERATIONS;
  const popSize = testMode ? 10 : POPULATION_SIZE;

  console.log(`🚀 Starting GA Training - ${maxGens} Generations, ${popSize} Bots`);
  let population = Array(popSize).fill(0).map(() => createRandomDNA());

  const activeBoards = testMode ? [null] : customBoards;
  const activeOpps = testMode ? ['easy'] : BASELINE_OPPONENTS;

  for (let gen = 1; gen <= maxGens; gen++) {
    console.log(`\n[Generation ${gen}] Simulating ${popSize * activeBoards.length * activeOpps.length} games...`);
    const startTime = Date.now();
    const scores = [];

    process.stdout.write(`Evaluating Population: [`);
    for (let i = 0; i < popSize; i++) {
      const dna = population[i];
      let totalWins = 0;
      let totalPoints = 0;
      let totalTurns = 0;
      let winBreakdown = { easy: 0, medium: 0, hard: 0 };

      for (const boardData of activeBoards) {
        for (const opp of activeOpps) {
          const result = simulateGaGame(boardData, opp, dna);
          if (result.gaWon) {
            totalWins++;
            winBreakdown[opp]++;
          }
          totalPoints += result.gaScore;
          totalTurns += result.turns;
        }
      }

      // Fitness formula: (Total Wins * 1000) + (Total Points Scored) - (Average Turns to Win * 10)
      const avgTurns = totalTurns / (activeBoards.length * activeOpps.length);
      const fitness = (totalWins * 1000) + totalPoints - (avgTurns * 10);
      scores.push({ dna, fitness, wins: totalWins, winBreakdown, avgTurns });
      
      // Progress indicator (dot per 2 individuals)
      if (i % Math.max(1, Math.floor(popSize / 50)) === 0) {
        process.stdout.write(`.`);
      }
    }
    process.stdout.write(`] Done!\n`);

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
      // Export final weights
      const exportPath = path.resolve('./src/core/ga_weights.json');
      fs.writeFileSync(exportPath, JSON.stringify(bestBot.dna, null, 2));
      console.log(`\n✅ Final Optimal Weights Exported to ${exportPath}`);
    }
  }
}

runGA().catch(console.error);
