/**
 * Debug test for simulator
 */

const path = require('path');
const DataLoader = require('./src/data-loader');
const Simulator = require('./src/simulator');
const config = require('./src/config');

async function main() {
  console.log('Loading data...');
  const dataLoader = new DataLoader(config.dataPath);
  await dataLoader.load('2025-05-01', '2025-05-15');

  console.log('\nTesting simulator with debug=true...\n');

  const simulator = new Simulator(dataLoader, {
    positionSize: config.positionSize,
    fees: config.fees,
    tpStrategy: config.tpStrategy,
    deltaMultiplier: config.deltaMultiplier,
    ltmaMultiplier: config.ltmaMultiplier,
    riskModuleSteps: 10,
  });

  const params = {
    range: 0.005,
    cycleTime: 10,
    entryLong: 0.3,
    entryShort: 0.7,
    minProbability: 0.75,
    lockBeforeEnd: 60,
    closeStrategy: 'cycle_timeout',
  };

  console.log('Params:', params);

  const result = await simulator.run(params, true);  // debug = true

  console.log('\nResult:');
  console.log('Trades:', result.trades.length);
  console.log('Stats:', result.stats);
}

main().catch(console.error);
