/**
 * Сравнение разных конфигураций
 * Результаты сохраняются в results/
 */

const fs = require('fs');
const path = require('path');
const DataLoader = require('./src/data-loader');
const Simulator = require('./src/simulator');
const baseConfig = require('./src/config');

// Базовые параметры (из simulation.config.json)
const simConfig = JSON.parse(fs.readFileSync('./simulation.config.json', 'utf8'));

// Конфигурации для сравнения
const CONFIGS = [
  {
    name: 'baseline',
    description: 'Базовая (0.5%, entry 0.33/0.67, prob 95%)',
    params: {
      range: 0.005,
      cycleTime: 10,
      entryLong: 0.33,
      entryShort: 0.67,
      minProbability: 0.95,
      lockBeforeEnd: 180,
    }
  },
  {
    name: 'wide_entry',
    description: 'Широкий вход (entry 0.25/0.75)',
    params: {
      range: 0.005,
      cycleTime: 10,
      entryLong: 0.25,
      entryShort: 0.75,
      minProbability: 0.95,
      lockBeforeEnd: 180,
    }
  },
  {
    name: 'narrow_entry',
    description: 'Узкий вход (entry 0.40/0.60)',
    params: {
      range: 0.005,
      cycleTime: 10,
      entryLong: 0.40,
      entryShort: 0.60,
      minProbability: 0.95,
      lockBeforeEnd: 180,
    }
  },
  {
    name: 'high_prob',
    description: 'Высокий порог (prob 98%)',
    params: {
      range: 0.005,
      cycleTime: 10,
      entryLong: 0.33,
      entryShort: 0.67,
      minProbability: 0.98,
      lockBeforeEnd: 180,
    }
  },
  {
    name: 'wider_range',
    description: 'Широкий диапазон (0.7%)',
    params: {
      range: 0.007,
      cycleTime: 10,
      entryLong: 0.33,
      entryShort: 0.67,
      minProbability: 0.95,
      lockBeforeEnd: 180,
    }
  },
];

async function runConfig(dataLoader, config, useRealRM) {
  const simulator = new Simulator(dataLoader, {
    positionSize: simConfig.positionSize || baseConfig.positionSize,
    fees: baseConfig.fees,
    tpStrategy: simConfig.tpStrategy,
    tpPercent: simConfig.tpPercent,
    deltaMultiplier: baseConfig.deltaMultiplier,
    ltmaMultiplier: baseConfig.ltmaMultiplier,
    riskModuleSteps: 10,
  });

  if (useRealRM) {
    simulator.initRMClient({
      url: 'https://rm-stage.leechprotocol.com/calculate-probability-v2',
      maxRetries: 2,
      timeout: 5000,
    });
  }

  const params = {
    ...config.params,
    closeStrategy: simConfig.closeStrategy,
  };

  if (!useRealRM) {
    params.rmData = { probability: 0.96 };
  }

  const start = Date.now();
  const result = await simulator.run(params, false, useRealRM);
  const duration = ((Date.now() - start) / 1000).toFixed(1);

  return {
    name: config.name,
    description: config.description,
    params: config.params,
    duration,
    stats: result.stats,
  };
}

async function main() {
  const useRealRM = simConfig.useRealRM;

  console.log('=== СРАВНЕНИЕ КОНФИГУРАЦИЙ ===\n');
  console.log(`Период: ${simConfig.fromDate} → ${simConfig.toDate}`);
  console.log(`RM: ${useRealRM ? 'РЕАЛЬНЫЙ API' : 'ЗАГЛУШКА'}`);
  console.log(`TP: ${simConfig.tpStrategy} (${simConfig.tpPercent}%)`);
  console.log('');

  // Загрузка данных
  console.log('Загрузка данных...');
  const dataLoader = new DataLoader(baseConfig.dataPath);
  await dataLoader.load(simConfig.fromDate, simConfig.toDate);
  console.log(`1s: ${dataLoader.candles1s.length.toLocaleString()}, 1m: ${dataLoader.candles1m.length.toLocaleString()}\n`);

  const results = [];

  for (let i = 0; i < CONFIGS.length; i++) {
    const config = CONFIGS[i];
    process.stdout.write(`[${i + 1}/${CONFIGS.length}] ${config.name}... `);

    const result = await runConfig(dataLoader, config, useRealRM);
    results.push(result);

    console.log(`✓ (${result.duration}s) ${result.stats.totalTrades} сделок, PnL: $${result.stats.totalPnL}`);
  }

  // Сохранение результатов
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substr(0, 19);
  const filename = `results/comparison_${timestamp}.json`;
  fs.writeFileSync(filename, JSON.stringify({
    timestamp: new Date().toISOString(),
    period: { from: simConfig.fromDate, to: simConfig.toDate },
    useRealRM,
    tpStrategy: simConfig.tpStrategy,
    tpPercent: simConfig.tpPercent,
    results,
  }, null, 2));
  console.log(`\nРезультаты сохранены: ${filename}`);

  // Таблица сравнения
  console.log('\n\n' + '═'.repeat(100));
  console.log('СРАВНЕНИЕ РЕЗУЛЬТАТОВ');
  console.log('═'.repeat(100));
  console.log('');
  console.log('Конфиг'.padEnd(20) + 'Циклов'.padStart(8) + 'RM откл'.padStart(8) + 'Сделок'.padStart(8) +
              'WinRate'.padStart(10) + 'PnL'.padStart(12) + 'Комиссии'.padStart(12) + 'SL'.padStart(6) + 'TP'.padStart(6) + 'TO'.padStart(6));
  console.log('─'.repeat(100));

  for (const r of results) {
    const sl = r.stats.byReason?.sl?.count || 0;
    const tp = r.stats.byReason?.tp?.count || 0;
    const to = r.stats.byReason?.timeout?.count || 0;

    console.log(
      r.name.padEnd(20) +
      r.stats.debugStats.cyclesStarted.toString().padStart(8) +
      r.stats.debugStats.rmRejected.toString().padStart(8) +
      r.stats.totalTrades.toString().padStart(8) +
      (r.stats.winRate + '%').padStart(10) +
      ('$' + r.stats.totalPnL).padStart(12) +
      ('$' + r.stats.totalFees).padStart(12) +
      sl.toString().padStart(6) +
      tp.toString().padStart(6) +
      to.toString().padStart(6)
    );
  }

  console.log('─'.repeat(100));
  console.log('');
  console.log('SL = Stop Loss, TP = Take Profit, TO = Timeout');
  console.log('');

  // Лучший результат
  const best = results.reduce((a, b) => parseFloat(a.stats.totalPnL) > parseFloat(b.stats.totalPnL) ? a : b);
  console.log(`Лучший по PnL: ${best.name} (${best.description}) → $${best.stats.totalPnL}`);
}

main().catch(console.error);
