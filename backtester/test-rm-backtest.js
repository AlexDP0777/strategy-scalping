/**
 * Test backtest with real RM API
 *
 * Запускает бэктест на коротком периоде с реальными запросами к RM API
 */

const path = require('path');
const DataLoader = require('./src/data-loader');
const Simulator = require('./src/simulator');
const config = require('./src/config');

async function main() {
  console.log('=== Backtest with Real RM API ===\n');

  // Загружаем данные за короткий период для теста
  console.log('Loading data for short period...');
  const dataLoader = new DataLoader(config.dataPath);
  await dataLoader.load('2025-05-01', '2025-05-03');  // Только 3 дня

  console.log(`\n1s candles: ${dataLoader.candles1s.length.toLocaleString()}`);
  console.log(`1m candles: ${dataLoader.candles1m.length.toLocaleString()}`);

  // Создаём симулятор с RM клиентом
  const simulator = new Simulator(dataLoader, {
    positionSize: config.positionSize,
    fees: config.fees,
    tpStrategy: config.tpStrategy,
    deltaMultiplier: config.deltaMultiplier,
    ltmaMultiplier: config.ltmaMultiplier,
    riskModuleSteps: 10,
  });

  // Инициализируем RM клиент
  simulator.initRMClient({
    url: 'https://rm-stage.leechprotocol.com/calculate-probability-v2',
    maxRetries: 2,
    timeout: 5000,
  });

  const params = {
    range: 0.005,           // 0.5%
    cycleTime: 10,          // 10 минут
    entryLong: 0.3,         // Вход в лонг при position <= 0.3
    entryShort: 0.7,        // Вход в шорт при position >= 0.7
    minProbability: 0.6,    // Минимальная вероятность 60%
    lockBeforeEnd: 60,      // Не входить последнюю минуту
    closeStrategy: 'cycle_timeout',
  };

  console.log('\nParams:', params);
  console.log('\nRunning backtest with REAL RM API...\n');

  const startTime = Date.now();
  const result = await simulator.run(params, true, true);  // debug=true, useRealRM=true
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log(`\n=== Results (${duration}s) ===`);
  console.log('Trades:', result.trades.length);
  console.log('\nStats:', result.stats);

  // Показываем несколько примеров сделок
  if (result.trades.length > 0) {
    console.log('\n=== Sample Trades ===');
    result.trades.slice(0, 5).forEach((trade, i) => {
      console.log(`\nTrade ${i + 1}:`);
      console.log(`  Type: ${trade.type}`);
      console.log(`  Entry: ${trade.entryPrice.toFixed(2)} @ ${new Date(trade.entryTimestamp).toISOString()}`);
      console.log(`  Close: ${trade.closePrice.toFixed(2)} @ ${new Date(trade.closeTimestamp).toISOString()}`);
      console.log(`  Reason: ${trade.closeReason}`);
      console.log(`  Position: ${(trade.position * 100).toFixed(1)}%`);
      console.log(`  Probability: ${(trade.probability * 100).toFixed(1)}%`);
      console.log(`  PnL: $${trade.netPnL.toFixed(2)}`);
    });
  }

  // Сравнение: запустим тот же тест без RM (с заглушкой probability=0.85)
  console.log('\n\n=== Comparison: Without RM (stub probability=0.85) ===\n');

  const startTime2 = Date.now();
  const result2 = await simulator.run(params, false, false);  // useRealRM=false
  const duration2 = ((Date.now() - startTime2) / 1000).toFixed(1);

  console.log(`\nResults (${duration2}s):`);
  console.log('Trades:', result2.trades.length);
  console.log('Stats:', result2.stats);
}

main().catch(console.error);
