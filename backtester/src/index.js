/**
 * Strategy Backtester
 *
 * Перебирает комбинации параметров и находит оптимальные настройки
 *
 * Usage:
 *   node src/index.js                    # Полный перебор
 *   node src/index.js --quick            # Быстрый тест (меньше комбинаций)
 *   node src/index.js --from 2025-05-01 --to 2025-06-01  # Конкретный период
 */

const path = require('path');
const DataLoader = require('./data-loader');
const Simulator = require('./simulator');
const Reporter = require('./reporter');
const config = require('./config');

// Парсинг аргументов
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    fromDate: '2025-05-01',
    toDate: '2025-11-25',
    quick: false,
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--from' && args[i + 1]) {
      options.fromDate = args[++i];
    } else if (args[i] === '--to' && args[i + 1]) {
      options.toDate = args[++i];
    } else if (args[i] === '--quick') {
      options.quick = true;
    }
  }

  return options;
}

// Генерация всех комбинаций параметров
function generateCombinations(quick = false) {
  const combinations = [];

  // В quick режиме используем меньше вариантов
  const ranges = quick ? [0.005, 0.007] : config.ranges;
  const cycleTimes = quick ? [10, 15] : config.cycleTimes;
  const entryLongs = quick ? [0.30] : config.entryLongs;
  const entryShorts = quick ? [0.70] : config.entryShorts;
  const minProbabilities = quick ? [0.75, 0.85] : config.minProbabilities;
  const lockBeforeEnds = quick ? [60] : config.lockBeforeEnds;
  const closeStrategies = quick ? ['cycle_timeout'] : config.closeStrategies;

  for (const range of ranges) {
    for (const cycleTime of cycleTimes) {
      for (const entryLong of entryLongs) {
        for (const entryShort of entryShorts) {
          for (const minProbability of minProbabilities) {
            for (const lockBeforeEnd of lockBeforeEnds) {
              for (const closeStrategy of closeStrategies) {
                combinations.push({
                  range,
                  cycleTime,
                  entryLong,
                  entryShort,
                  minProbability,
                  lockBeforeEnd,
                  closeStrategy,
                });
              }
            }
          }
        }
      }
    }
  }

  return combinations;
}

// Форматирование времени
function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

// Main
async function main() {
  const options = parseArgs();

  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║          STRATEGY BACKTESTER v1.0                          ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`Period: ${options.fromDate} to ${options.toDate}`);
  console.log(`Mode: ${options.quick ? 'QUICK (limited combinations)' : 'FULL'}`);
  console.log('');

  // 1. Загрузка данных
  console.log('Step 1: Loading data...');
  const dataPath = path.resolve(__dirname, config.dataPath);
  const dataLoader = new DataLoader(dataPath);
  await dataLoader.load(options.fromDate, options.toDate);
  console.log('');

  // 2. Генерация комбинаций
  console.log('Step 2: Generating parameter combinations...');
  const combinations = generateCombinations(options.quick);
  console.log(`Total combinations to test: ${combinations.length}`);
  console.log('');

  // 3. Симуляция
  console.log('Step 3: Running simulations...');
  const startTime = Date.now();
  const results = [];

  const simulator = new Simulator(dataLoader, {
    positionSize: config.positionSize,
    fees: config.fees,
    tpStrategy: config.tpStrategy,
    tpPercent: config.tpPercent,
    tpRiskReward: config.tpRiskReward,
    deltaMultiplier: config.deltaMultiplier,
    ltmaMultiplier: config.ltmaMultiplier,
    riskModuleSteps: 10,
  });

  for (let i = 0; i < combinations.length; i++) {
    const params = combinations[i];

    // Progress
    if ((i + 1) % 10 === 0 || i === combinations.length - 1) {
      const progress = ((i + 1) / combinations.length * 100).toFixed(1);
      const elapsed = Date.now() - startTime;
      const eta = elapsed / (i + 1) * (combinations.length - i - 1);
      process.stdout.write(`\rProgress: ${i + 1}/${combinations.length} (${progress}%) | ETA: ${formatDuration(eta)}    `);
    }

    try {
      const result = simulator.run(params);
      results.push({
        params,
        trades: result.trades,
        stats: result.stats,
      });
    } catch (err) {
      console.error(`\nError with params: ${JSON.stringify(params)}: ${err.message}`);
    }
  }

  const totalTime = Date.now() - startTime;
  console.log(`\n\nSimulations completed in ${formatDuration(totalTime)}`);
  console.log('');

  // 4. Отчёты
  console.log('Step 4: Generating reports...');
  const reporter = new Reporter(path.resolve(__dirname, '../results'));

  reporter.printConsole(results, 20);
  reporter.saveJSON(results);
  reporter.saveExcel(results);
  reporter.saveBestTrades(results, 3);

  console.log('\n✅ Backtesting complete!');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
