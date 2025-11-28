/**
 * Прогон матрицы параметров по кэшированным RM данным
 *
 * Использует предвычисленный кэш RM, чтобы быстро прогнать
 * сотни комбинаций параметров без API-вызовов.
 *
 * Использование:
 *   node run-matrix.js                    # default range 0.5%
 *   node run-matrix.js 0.007              # specific range
 */

const fs = require('fs');
const path = require('path');
const DataLoader = require('./src/data-loader');
const baseConfig = require('./src/config');

const simConfig = JSON.parse(fs.readFileSync('./simulation.config.json', 'utf8'));
const matrixConfig = JSON.parse(fs.readFileSync('./matrix.config.json', 'utf8'));

// ================ НАСТРОЙКИ ================
const LEVERAGE = simConfig.leverage || 3;  // Плечо (по умолчанию 3x)
// ============================================

// Матрица читается из matrix.config.json
const MATRIX = {
  entryPairs: matrixConfig.entryPairs,           // [[0.2, 0.8], [0.15, 0.85], ...]
  minProbability: matrixConfig.minProbability,
  lockBeforeEnd: matrixConfig.lockBeforeEnd,
  tpPercent: matrixConfig.tpPercent,
};

// =====================================================

/**
 * Симуляция с использованием кэша RM
 */
function runSimulation(dataLoader, rmCache, params) {
  const {
    entryLong,
    entryShort,
    minProbability,
    lockBeforeEnd,
    tpPercent,
  } = params;

  const cycleMs = simConfig.cycleTime * 60 * 1000;
  const lockMs = lockBeforeEnd * 1000;
  const stepMs = 60 * 1000;

  const trades = [];
  let cyclesStarted = 0;
  let rmRejected = 0;

  // Индекс для быстрого поиска по timestamp
  const rmIndex = new Map();
  for (const entry of rmCache.data) {
    rmIndex.set(entry.timestamp, entry);
  }

  const startTime = rmCache.data[0]?.timestamp;
  const endTime = rmCache.data[rmCache.data.length - 1]?.timestamp;

  let currentTime = startTime;

  while (currentTime < endTime) {
    const rmEntry = rmIndex.get(currentTime);
    if (!rmEntry) {
      currentTime += stepMs;
      continue;
    }

    // Проверяем probability
    if (rmEntry.probability < minProbability) {
      rmRejected++;
      currentTime += stepMs;
      continue;
    }

    // === НАЧИНАЕМ ЦИКЛ ===
    cyclesStarted++;

    const cycleStart = currentTime;
    const cycleEnd = currentTime + cycleMs;
    const lockTime = cycleEnd - lockMs;
    const fixedLower = rmEntry.lower;
    const fixedUpper = rmEntry.upper;
    const rangeWidth = fixedUpper - fixedLower;

    // Мониторим позицию внутри цикла
    let tradeOpened = false;

    for (let t = cycleStart; t < lockTime && t < endTime; t += stepMs) {
      if (tradeOpened) break;

      const currentPrice = dataLoader.getPriceAt(t);
      if (!currentPrice) continue;

      // Position относительно фиксированных границ
      const position = (currentPrice - fixedLower) / rangeWidth;

      // Цена вышла за границы?
      if (currentPrice < fixedLower || currentPrice > fixedUpper) {
        break;
      }

      // Сигналы на вход
      const isLongEntry = position <= entryLong;
      const isShortEntry = position >= entryShort;

      if (!isLongEntry && !isShortEntry) continue;

      // === ОТКРЫВАЕМ ПОЗИЦИЮ ===
      let trade = null;

      if (isLongEntry) {
        const tp = currentPrice * (1 + tpPercent / 100);
        trade = {
          type: 'long',
          entryTimestamp: t,
          entryPrice: currentPrice,
          stopLoss: fixedLower,
          takeProfit: tp,
          cycleEnd,
          lowerBound: fixedLower,
          upperBound: fixedUpper,
        };
      } else if (isShortEntry) {
        const tp = currentPrice * (1 - tpPercent / 100);
        trade = {
          type: 'short',
          entryTimestamp: t,
          entryPrice: currentPrice,
          stopLoss: fixedUpper,
          takeProfit: tp,
          cycleEnd,
          lowerBound: fixedLower,
          upperBound: fixedUpper,
        };
      }

      if (trade) {
        // Определяем как закроется
        const closeResult = checkClose(trade, dataLoader);
        trade.closeTimestamp = closeResult.closeTimestamp;
        trade.closePrice = closeResult.closePrice;
        trade.closeReason = closeResult.closeReason;

        // PnL
        calculatePnL(trade);

        trades.push(trade);
        tradeOpened = true;
      }
    }

    // Переходим к концу цикла
    currentTime = cycleEnd;
  }

  return {
    params,
    cyclesStarted,
    rmRejected,
    stats: calculateStats(trades),
  };
}

// Глобальный индекс свечей для быстрого поиска
let candleIndex = null;  // Map: timestamp -> index в массиве candles1s

/**
 * Построить индекс свечей (вызывать один раз после загрузки данных)
 */
function buildCandleIndex(candles1s) {
  candleIndex = new Map();
  for (let i = 0; i < candles1s.length; i++) {
    candleIndex.set(candles1s[i].timestamp, i);
  }
  console.log(`Индекс свечей построен: ${candleIndex.size} записей`);
}

/**
 * Проверка закрытия позиции (использует high/low свечей)
 * ОПТИМИЗИРОВАНО: использует индекс для O(1) поиска начала
 */
function checkClose(trade, dataLoader) {
  const { type, entryTimestamp, stopLoss, takeProfit, cycleEnd } = trade;
  const candles1s = dataLoader.candles1s;

  // Находим стартовый индекс через индекс (O(1)) или бинарный поиск
  let startIdx = candleIndex.get(entryTimestamp);
  if (startIdx === undefined) {
    // Если точного timestamp нет, ищем ближайший бинарным поиском
    startIdx = binarySearchCandle(candles1s, entryTimestamp);
  }

  // Итерируем от startIdx до конца цикла
  for (let i = startIdx; i < candles1s.length; i++) {
    const candle = candles1s[i];

    if (candle.timestamp <= entryTimestamp) continue;
    if (candle.timestamp > cycleEnd) break;  // Вышли за пределы цикла

    if (type === 'long') {
      if (candle.low <= stopLoss) {
        return { closeTimestamp: candle.timestamp, closePrice: stopLoss, closeReason: 'sl' };
      }
      if (candle.high >= takeProfit) {
        return { closeTimestamp: candle.timestamp, closePrice: takeProfit, closeReason: 'tp' };
      }
    } else {
      if (candle.high >= stopLoss) {
        return { closeTimestamp: candle.timestamp, closePrice: stopLoss, closeReason: 'sl' };
      }
      if (candle.low <= takeProfit) {
        return { closeTimestamp: candle.timestamp, closePrice: takeProfit, closeReason: 'tp' };
      }
    }
  }

  // Timeout
  const closePrice = dataLoader.getPriceAt(cycleEnd) || trade.entryPrice;
  return { closeTimestamp: cycleEnd, closePrice, closeReason: 'timeout' };
}

/**
 * Бинарный поиск индекса первой свечи >= timestamp
 */
function binarySearchCandle(candles, timestamp) {
  let left = 0;
  let right = candles.length;
  while (left < right) {
    const mid = Math.floor((left + right) / 2);
    if (candles[mid].timestamp < timestamp) {
      left = mid + 1;
    } else {
      right = mid;
    }
  }
  return left;
}

/**
 * Расчёт slippage в зависимости от объёма позиции
 * До $10K: 0.01%, до $50K: 0.02%, до $100K: 0.03%
 */
function getSlippage(positionValueUSD) {
  if (positionValueUSD <= 10000) return 0.0001;   // 0.01%
  if (positionValueUSD <= 50000) return 0.0002;   // 0.02%
  if (positionValueUSD <= 100000) return 0.0003;  // 0.03%
  return 0.0005;  // 0.05% для >$100K
}

/**
 * Расчёт PnL с учётом плеча и slippage
 *
 * Плечо: маржа * leverage = размер позиции
 * Пример: 0.5 ETH маржа * 3x плечо = 1.5 ETH позиция
 */
function calculatePnL(trade) {
  const margin = simConfig.positionSize || 0.5;  // Маржа (залог)
  const positionSize = margin * LEVERAGE;        // Размер позиции с плечом
  const fees = baseConfig.fees;

  // Объём позиции в USD
  const positionValueUSD = trade.entryPrice * positionSize;
  const slippage = getSlippage(positionValueUSD);

  // Применяем slippage только к SL (маркет-ордер в неблагоприятную сторону)
  let actualClosePrice = trade.closePrice;
  if (trade.closeReason === 'sl') {
    if (trade.type === 'long') {
      // LONG SL: цена падает, исполнение ещё ниже
      actualClosePrice = trade.closePrice * (1 - slippage);
    } else {
      // SHORT SL: цена растёт, исполнение ещё выше
      actualClosePrice = trade.closePrice * (1 + slippage);
    }
    trade.slippage = slippage;
    trade.actualClosePrice = actualClosePrice;
  }

  let grossPnL;
  if (trade.type === 'long') {
    grossPnL = (actualClosePrice - trade.entryPrice) * positionSize;
  } else {
    grossPnL = (trade.entryPrice - actualClosePrice) * positionSize;
  }

  const entryFee = trade.entryPrice * positionSize * fees.taker;
  const exitFee = actualClosePrice * positionSize * fees.taker;
  const totalFees = entryFee + exitFee;

  trade.grossPnL = grossPnL;
  trade.fees = totalFees;
  trade.netPnL = grossPnL - totalFees;
}

/**
 * Статистика
 */
function calculateStats(trades) {
  if (trades.length === 0) {
    return {
      totalTrades: 0,
      wins: 0,
      losses: 0,
      winRate: 0,
      totalPnL: 0,
      totalFees: 0,
      byReason: {},
    };
  }

  const wins = trades.filter(t => t.netPnL > 0).length;
  const losses = trades.filter(t => t.netPnL <= 0).length;
  const totalPnL = trades.reduce((sum, t) => sum + t.netPnL, 0);
  const totalFees = trades.reduce((sum, t) => sum + t.fees, 0);

  const byReason = {};
  for (const trade of trades) {
    const reason = trade.closeReason;
    if (!byReason[reason]) {
      byReason[reason] = { count: 0, pnl: 0 };
    }
    byReason[reason].count++;
    byReason[reason].pnl += trade.netPnL;
  }

  return {
    totalTrades: trades.length,
    wins,
    losses,
    winRate: parseFloat((wins / trades.length * 100).toFixed(2)),
    totalPnL: parseFloat(totalPnL.toFixed(2)),
    totalFees: parseFloat(totalFees.toFixed(2)),
    byReason,
  };
}

/**
 * Генерация всех комбинаций
 * Использует entryPairs из конфига (конкретные пары, не все комбинации)
 */
function generateCombinations() {
  const combinations = [];

  for (const [entryLong, entryShort] of MATRIX.entryPairs) {
    for (const minProbability of MATRIX.minProbability) {
      for (const lockBeforeEnd of MATRIX.lockBeforeEnd) {
        for (const tpPercent of MATRIX.tpPercent) {
          combinations.push({
            entryLong,
            entryShort,
            minProbability,
            lockBeforeEnd,
            tpPercent,
          });
        }
      }
    }
  }

  return combinations;
}

async function main() {
  const range = process.argv[2] ? parseFloat(process.argv[2]) : simConfig.range;
  const rangeStr = (range * 100).toFixed(1).replace('.', '_');

  console.log('=== ПРОГОН МАТРИЦЫ ПАРАМЕТРОВ ===\n');
  console.log(`Range: ${(range * 100).toFixed(2)}%`);
  console.log(`Период: ${simConfig.fromDate} → ${simConfig.toDate}`);
  console.log(`Маржа: ${simConfig.positionSize} ETH × ${LEVERAGE}x = ${(simConfig.positionSize * LEVERAGE).toFixed(2)} ETH позиция`);
  console.log('');
  console.log('ТЕСТИРУЕМЫЕ КОМБИНАЦИИ:');
  console.log(`  Entry pairs:     ${MATRIX.entryPairs.map(p => p[0] + '/' + p[1]).join(', ')}`);
  console.log(`  MinProbability:  ${MATRIX.minProbability.map(p => (p*100) + '%').join(', ')}`);
  console.log(`  LockBeforeEnd:   ${MATRIX.lockBeforeEnd.map(l => l + 's').join(', ')}`);
  console.log(`  TpPercent:       ${MATRIX.tpPercent.map(t => t + '%').join(', ')}`);
  console.log('');

  // Поиск кэша
  const cachePattern = `rm-cache/cache_${rangeStr}pct_${simConfig.fromDate}_${simConfig.toDate}.json`;

  if (!fs.existsSync(cachePattern)) {
    console.log(`Кэш не найден: ${cachePattern}`);
    console.log(`\nСначала создай кэш командой:`);
    console.log(`  node cache-rm-data.js ${range}`);
    process.exit(1);
  }

  console.log(`Кэш: ${cachePattern}`);

  // Загрузка кэша
  const rmCache = JSON.parse(fs.readFileSync(cachePattern, 'utf8'));
  console.log(`RM записей: ${rmCache.data.length.toLocaleString()}`);

  // Загрузка данных (для проверки цен)
  console.log('\nЗагрузка свечей...');
  const dataLoader = new DataLoader(baseConfig.dataPath);
  await dataLoader.load(simConfig.fromDate, simConfig.toDate);
  console.log(`1s свечей: ${dataLoader.candles1s.length.toLocaleString()}`);

  // Построить индекс для быстрого поиска свечей
  buildCandleIndex(dataLoader.candles1s);

  // Генерация комбинаций
  const combinations = generateCombinations();
  console.log(`\nКомбинаций: ${combinations.length}`);
  console.log('');

  // Прогон
  const results = [];
  const startMs = Date.now();

  for (let i = 0; i < combinations.length; i++) {
    const params = combinations[i];
    const result = runSimulation(dataLoader, rmCache, params);
    results.push(result);

    if ((i + 1) % 50 === 0) {
      const pct = ((i + 1) / combinations.length * 100).toFixed(1);
      const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);
      process.stdout.write(`\rПрогресс: ${i + 1}/${combinations.length} (${pct}%) | ${elapsed}s`);
    }
  }

  const totalTime = ((Date.now() - startMs) / 1000).toFixed(1);
  console.log(`\n\nГотово за ${totalTime}s`);

  // Сортировка по PnL
  results.sort((a, b) => b.stats.totalPnL - a.stats.totalPnL);

  // Топ-20 лучших
  console.log('\n' + '═'.repeat(120));
  console.log('ТОП-20 ЛУЧШИХ КОНФИГУРАЦИЙ');
  console.log('═'.repeat(120));
  console.log('');

  // Расчёт ROI: PnL / маржа * 100%
  const margin = simConfig.positionSize;  // Маржа в ETH
  const marginUSD = margin * 2400;  // примерно $1200

  const header = 'Entry L/S'.padEnd(12) + 'MinProb'.padStart(8) + 'Lock'.padStart(6) +
                 'TP%'.padStart(6) + 'Сделок'.padStart(8) +
                 'WinRate'.padStart(9) + 'PnL'.padStart(10) + 'ROI%'.padStart(8) +
                 'SL'.padStart(4) + 'TP'.padStart(4) + 'TO'.padStart(4);
  console.log(header);
  console.log('─'.repeat(90));

  for (let i = 0; i < Math.min(20, results.length); i++) {
    const r = results[i];
    const p = r.params;
    const s = r.stats;

    const sl = s.byReason?.sl?.count || 0;
    const tp = s.byReason?.tp?.count || 0;
    const to = s.byReason?.timeout?.count || 0;
    const roi = (s.totalPnL / marginUSD * 100).toFixed(2);

    const line = `${p.entryLong}/${p.entryShort}`.padEnd(12) +
                 `${(p.minProbability * 100).toFixed(0)}%`.padStart(8) +
                 `${p.lockBeforeEnd}`.padStart(6) +
                 `${p.tpPercent}`.padStart(6) +
                 `${s.totalTrades}`.padStart(8) +
                 `${s.winRate}%`.padStart(9) +
                 `$${s.totalPnL}`.padStart(10) +
                 `${roi}%`.padStart(8) +
                 `${sl}`.padStart(4) +
                 `${tp}`.padStart(4) +
                 `${to}`.padStart(4);
    console.log(line);
  }

  // Топ-10 худших
  console.log('\n' + '═'.repeat(90));
  console.log('ТОП-10 ХУДШИХ КОНФИГУРАЦИЙ');
  console.log('═'.repeat(90));
  console.log('');
  console.log(header);
  console.log('─'.repeat(90));

  for (let i = results.length - 1; i >= Math.max(0, results.length - 10); i--) {
    const r = results[i];
    const p = r.params;
    const s = r.stats;

    const sl = s.byReason?.sl?.count || 0;
    const tp = s.byReason?.tp?.count || 0;
    const to = s.byReason?.timeout?.count || 0;
    const roi = (s.totalPnL / marginUSD * 100).toFixed(2);

    const line = `${p.entryLong}/${p.entryShort}`.padEnd(12) +
                 `${(p.minProbability * 100).toFixed(0)}%`.padStart(8) +
                 `${p.lockBeforeEnd}`.padStart(6) +
                 `${p.tpPercent}`.padStart(6) +
                 `${s.totalTrades}`.padStart(8) +
                 `${s.winRate}%`.padStart(9) +
                 `$${s.totalPnL}`.padStart(10) +
                 `${roi}%`.padStart(8) +
                 `${sl}`.padStart(4) +
                 `${tp}`.padStart(4) +
                 `${to}`.padStart(4);
    console.log(line);
  }

  // Статистика по параметрам
  console.log('\n' + '═'.repeat(80));
  console.log('АНАЛИЗ ВЛИЯНИЯ ПАРАМЕТРОВ');
  console.log('═'.repeat(80));

  // Анализ по entry pairs
  console.log('\nentryPairs:');
  for (const [entryLong, entryShort] of MATRIX.entryPairs) {
    const matching = results.filter(r => r.params.entryLong === entryLong && r.params.entryShort === entryShort);
    if (matching.length === 0) continue;

    const avgPnL = matching.reduce((s, r) => s + r.stats.totalPnL, 0) / matching.length;
    const avgWinRate = matching.reduce((s, r) => s + r.stats.winRate, 0) / matching.length;
    const bar = avgPnL > 0 ? '+'.repeat(Math.min(20, Math.round(avgPnL / 10))) :
                            '-'.repeat(Math.min(20, Math.round(-avgPnL / 10)));

    console.log(`  ${entryLong}/${entryShort}  avg PnL: $${avgPnL.toFixed(2).padStart(8)} | WR: ${avgWinRate.toFixed(1)}% | ${bar}`);
  }

  // Анализ по остальным параметрам
  const simpleParams = ['minProbability', 'lockBeforeEnd', 'tpPercent'];
  for (const paramName of simpleParams) {
    console.log(`\n${paramName}:`);
    const values = MATRIX[paramName];
    for (const val of values) {
      const matching = results.filter(r => r.params[paramName] === val);
      if (matching.length === 0) continue;

      const avgPnL = matching.reduce((s, r) => s + r.stats.totalPnL, 0) / matching.length;
      const avgWinRate = matching.reduce((s, r) => s + r.stats.winRate, 0) / matching.length;
      const bar = avgPnL > 0 ? '+'.repeat(Math.min(20, Math.round(avgPnL / 10))) :
                              '-'.repeat(Math.min(20, Math.round(-avgPnL / 10)));

      console.log(`  ${String(val).padEnd(6)} avg PnL: $${avgPnL.toFixed(2).padStart(8)} | WR: ${avgWinRate.toFixed(1)}% | ${bar}`);
    }
  }

  // Сохранение результатов
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substr(0, 19);
  const filename = `results/matrix_${rangeStr}pct_${timestamp}.json`;

  if (!fs.existsSync('results')) {
    fs.mkdirSync('results');
  }

  fs.writeFileSync(filename, JSON.stringify({
    timestamp: new Date().toISOString(),
    range,
    period: { from: simConfig.fromDate, to: simConfig.toDate },
    matrix: MATRIX,
    totalCombinations: combinations.length,
    executionTime: totalTime,
    results: results.slice(0, 100), // Топ-100 для файла
  }, null, 2));

  console.log(`\n\nРезультаты сохранены: ${filename}`);
  console.log(`(полный топ-100 конфигураций)`);
  console.log('');
}

main().catch(console.error);
