/**
 * Запуск симуляции
 *
 * Параметры читаются из simulation.config.json
 * Редактируй конфиг, не этот файл!
 */

const fs = require('fs');
const path = require('path');
const DataLoader = require('./src/data-loader');
const Simulator = require('./src/simulator');
const baseConfig = require('./src/config');

// Читаем конфиг симуляции
const configPath = path.join(__dirname, 'simulation.config.json');
const simConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));

async function main() {
  console.log('=== СИМУЛЯЦИЯ СТРАТЕГИИ ===\n');

  // Параметры из конфига
  const params = {
    range: simConfig.range,
    cycleTime: simConfig.cycleTime,
    entryLong: simConfig.entryLong,
    entryShort: simConfig.entryShort,
    minProbability: simConfig.minProbability,
    lockBeforeEnd: simConfig.lockBeforeEnd,
    closeStrategy: simConfig.closeStrategy,
  };

  // Если не используем реальный RM - добавляем заглушку
  if (!simConfig.useRealRM) {
    params.rmData = { probability: simConfig.rmStubProbability };
  }

  console.log('Конфиг:', configPath);
  console.log('');
  console.log('Параметры стратегии:');
  console.log(`  range:           ${(simConfig.range * 100).toFixed(2)}%`);
  console.log(`  cycleTime:       ${simConfig.cycleTime} мин`);
  console.log(`  entryLong:       ${simConfig.entryLong}`);
  console.log(`  entryShort:      ${simConfig.entryShort}`);
  console.log(`  minProbability:  ${(simConfig.minProbability * 100).toFixed(0)}%`);
  console.log(`  lockBeforeEnd:   ${simConfig.lockBeforeEnd} сек`);
  console.log(`  closeStrategy:   ${simConfig.closeStrategy}`);
  console.log(`  TP:              ${simConfig.tpStrategy} (${simConfig.tpPercent}%)`);
  console.log('');
  console.log(`Период: ${simConfig.fromDate} → ${simConfig.toDate}`);
  console.log(`RM: ${simConfig.useRealRM ? 'РЕАЛЬНЫЙ API' : `заглушка (${simConfig.rmStubProbability})`}`);
  console.log('');

  // Загрузка данных
  console.log('1. Загрузка данных...');
  const dataLoader = new DataLoader(baseConfig.dataPath);
  await dataLoader.load(simConfig.fromDate, simConfig.toDate);
  console.log(`   1s свечей: ${dataLoader.candles1s.length.toLocaleString()}`);
  console.log(`   1m свечей: ${dataLoader.candles1m.length.toLocaleString()}\n`);

  // Создание симулятора
  const simulator = new Simulator(dataLoader, {
    positionSize: simConfig.positionSize || baseConfig.positionSize,
    fees: baseConfig.fees,
    tpStrategy: simConfig.tpStrategy,
    tpPercent: simConfig.tpPercent,
    tpRiskReward: simConfig.tpRiskReward,
    deltaMultiplier: baseConfig.deltaMultiplier,
    ltmaMultiplier: baseConfig.ltmaMultiplier,
    riskModuleSteps: 10,
  });

  // Инициализация RM клиента если нужен реальный API
  if (simConfig.useRealRM) {
    simulator.initRMClient({
      url: 'https://rm-stage.leechprotocol.com/calculate-probability-v2',
      maxRetries: 2,
      timeout: 5000,
    });
  }

  // Запуск
  console.log('2. Запуск симуляции...\n');

  const startTime = Date.now();
  const result = await simulator.run(params, simConfig.debug, simConfig.useRealRM);
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);

  // Результаты
  console.log(`\n\n${'='.repeat(50)}`);
  console.log(`РЕЗУЛЬТАТЫ (${duration}s)`);
  console.log('='.repeat(50));

  console.log('\nСтатистика RM:');
  console.log(`  Проверок RM:     ${result.stats.debugStats.rmChecks}`);
  console.log(`  Циклов начато:   ${result.stats.debugStats.cyclesStarted}`);
  console.log(`  RM отклонил:     ${result.stats.debugStats.rmRejected}`);

  console.log('\nСделки:');
  console.log(`  Всего:           ${result.stats.totalTrades}`);
  console.log(`  Побед:           ${result.stats.wins}`);
  console.log(`  Поражений:       ${result.stats.losses}`);
  console.log(`  Win Rate:        ${result.stats.winRate}%`);

  console.log('\nPnL:');
  console.log(`  Общий PnL:       $${result.stats.totalPnL}`);
  console.log(`  Комиссии:        $${result.stats.totalFees}`);
  console.log(`  Средний PnL:     $${result.stats.avgPnL}`);
  console.log(`  Макс выигрыш:    $${result.stats.maxWin}`);
  console.log(`  Макс убыток:     $${result.stats.maxLoss}`);

  if (Object.keys(result.stats.byReason).length > 0) {
    console.log('\nПо причинам закрытия:');
    for (const [reason, data] of Object.entries(result.stats.byReason)) {
      console.log(`  ${reason.padEnd(10)} ${data.count} сделок, PnL: $${data.pnl.toFixed(2)}`);
    }
  }

  // Примеры сделок
  if (result.trades.length > 0 && simConfig.debug) {
    console.log('\n\n=== ПРИМЕРЫ СДЕЛОК ===');
    const samples = result.trades.slice(0, 5);
    for (let i = 0; i < samples.length; i++) {
      const t = samples[i];
      console.log(`\n[${i + 1}] ${t.type.toUpperCase()}`);
      console.log(`    Вход:     $${t.entryPrice.toFixed(2)} @ ${new Date(t.entryTimestamp).toISOString().substr(11, 8)}`);
      console.log(`    Выход:    $${t.closePrice.toFixed(2)} @ ${new Date(t.closeTimestamp).toISOString().substr(11, 8)} (${t.closeReason})`);
      console.log(`    Position: ${(t.position * 100).toFixed(1)}%`);
      console.log(`    SL: $${t.stopLoss.toFixed(2)}, TP: $${t.takeProfit.toFixed(2)}`);
      console.log(`    PnL:      $${t.netPnL.toFixed(2)}`);
    }
  }

  console.log('\n');
}

main().catch(console.error);
