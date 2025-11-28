/**
 * Тест логики симулятора
 *
 * Проверяем что:
 * 1. RM вызывается для определения начала цикла
 * 2. Если RM < порога → цикл не начинается
 * 3. Если RM >= порога → цикл начинается, границы фиксируются
 * 4. Внутри цикла мониторится position
 */

const DataLoader = require('./src/data-loader');
const Simulator = require('./src/simulator');
const config = require('./src/config');

async function main() {
  console.log('=== ТЕСТ ЛОГИКИ СИМУЛЯТОРА ===\n');

  // Загружаем данные за 1 день
  console.log('1. Загрузка данных...');
  const dataLoader = new DataLoader(config.dataPath);
  await dataLoader.load('2025-05-01', '2025-05-01');
  console.log(`   1m свечей: ${dataLoader.candles1m.length}\n`);

  // Создаём симулятор
  const simulator = new Simulator(dataLoader, {
    positionSize: config.positionSize,
    fees: config.fees,
    tpStrategy: config.tpStrategy,
    deltaMultiplier: config.deltaMultiplier,
    ltmaMultiplier: config.ltmaMultiplier,
    riskModuleSteps: 10,
  });

  // Параметры теста
  const params = {
    range: 0.005,           // 0.5%
    cycleTime: 10,          // 10 минут
    entryLong: 0.3,
    entryShort: 0.7,
    minProbability: 0.75,   // 75% порог
    lockBeforeEnd: 60,
    closeStrategy: 'cycle_timeout',
  };

  console.log('2. Параметры:', params);

  // ========== ТЕСТ 1: БЕЗ RM (заглушка probability=0.85) ==========
  console.log('\n\n=== ТЕСТ 1: Заглушка probability=0.85 (выше порога 0.75) ===');
  console.log('Ожидание: Все циклы должны начинаться\n');

  const result1 = await simulator.run({
    ...params,
    rmData: { probability: 0.85 }
  }, true, false);

  console.log('\nРезультат:');
  console.log(`  Циклов начато: ${result1.stats.debugStats.cyclesStarted}`);
  console.log(`  RM rejected: ${result1.stats.debugStats.rmRejected}`);
  console.log(`  Сделок: ${result1.stats.totalTrades}`);

  // ========== ТЕСТ 2: ЗАГЛУШКА НИЖЕ ПОРОГА ==========
  console.log('\n\n=== ТЕСТ 2: Заглушка probability=0.50 (ниже порога 0.75) ===');
  console.log('Ожидание: Ни один цикл не должен начаться\n');

  const result2 = await simulator.run({
    ...params,
    rmData: { probability: 0.50 }
  }, true, false);

  console.log('\nРезультат:');
  console.log(`  Циклов начато: ${result2.stats.debugStats.cyclesStarted}`);
  console.log(`  RM rejected: ${result2.stats.debugStats.rmRejected}`);
  console.log(`  Сделок: ${result2.stats.totalTrades}`);

  // ========== ПРОВЕРКА ==========
  console.log('\n\n=== ПРОВЕРКА ЛОГИКИ ===');

  const test1Pass = result1.stats.debugStats.cyclesStarted > 0 && result1.stats.debugStats.rmRejected === 0;
  const test2Pass = result2.stats.debugStats.cyclesStarted === 0 && result2.stats.debugStats.rmRejected > 0;

  console.log(`Тест 1 (probability=0.85 > 0.75): ${test1Pass ? '✓ PASSED' : '✗ FAILED'}`);
  console.log(`Тест 2 (probability=0.50 < 0.75): ${test2Pass ? '✓ PASSED' : '✗ FAILED'}`);

  if (test1Pass && test2Pass) {
    console.log('\n✓ Логика работает правильно!');
    console.log('  - RM определяет начало цикла');
    console.log('  - Если probability < minProbability → цикл не начинается');
  } else {
    console.log('\n✗ Есть проблемы с логикой!');
  }
}

main().catch(console.error);
