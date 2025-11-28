/**
 * Детальный анализ лучшей конфигурации
 */
const fs = require('fs');
const DataLoader = require('./src/data-loader');
const baseConfig = require('./src/config');

const simConfig = JSON.parse(fs.readFileSync('./simulation.config.json', 'utf8'));

// Лучшая конфигурация из матрицы 0.7%
const BEST_CONFIG = {
  range: 0.007,
  cycleTime: 10,
  entryLong: 0.25,
  entryShort: 0.75,
  minProbability: 0.90,
  lockBeforeEnd: 180,
  tpPercent: 0.35,
};

async function main() {
  console.log('======================================================================');
  console.log('  ДЕТАЛЬНЫЙ АНАЛИЗ ЛУЧШЕЙ КОНФИГУРАЦИИ');
  console.log('======================================================================\n');

  console.log('ПАРАМЕТРЫ:');
  console.log('  Range:           ' + (BEST_CONFIG.range * 100).toFixed(1) + '%');
  console.log('  Entry Long:      <= ' + (BEST_CONFIG.entryLong * 100) + '% (вход в LONG когда цена в нижних ' + (BEST_CONFIG.entryLong * 100) + '% диапазона)');
  console.log('  Entry Short:     >= ' + (BEST_CONFIG.entryShort * 100) + '% (вход в SHORT когда цена в верхних ' + ((1-BEST_CONFIG.entryShort) * 100) + '% диапазона)');
  console.log('  Min Probability: ' + (BEST_CONFIG.minProbability * 100) + '%');
  console.log('  Lock Before End: ' + BEST_CONFIG.lockBeforeEnd + 's');
  console.log('  TP Percent:      ' + BEST_CONFIG.tpPercent + '%');
  console.log('  Position Size:   ' + simConfig.positionSize + ' ETH');
  console.log('  Комиссия:        ' + (baseConfig.fees.taker * 100).toFixed(3) + '% taker (вход + выход)');
  console.log('');

  // Загрузка кэша RM
  const cacheFile = 'rm-cache/cache_0_7pct_2025-09-05_2025-09-11.json';
  const cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
  console.log('Загружен кэш: ' + cache.data.length + ' записей\n');

  // Загрузка свечей
  const dataLoader = new DataLoader(baseConfig.dataPath);
  await dataLoader.load(simConfig.fromDate, simConfig.toDate);
  console.log('Загружено 1s свечей: ' + dataLoader.candles1s.length.toLocaleString() + '\n');

  // Построение индекса кэша по timestamp
  const rmIndex = new Map();
  for (const record of cache.data) {
    rmIndex.set(record.timestamp, record);
  }

  // Симуляция
  const trades = [];
  const cycleMs = BEST_CONFIG.cycleTime * 60 * 1000;
  const lockMs = BEST_CONFIG.lockBeforeEnd * 1000;
  const stepMs = 60 * 1000;

  const startTime = dataLoader.candles1m[0]?.timestamp;
  const endTime = dataLoader.candles1m[dataLoader.candles1m.length - 1]?.timestamp;

  let currentTime = startTime + 200 * 60 * 1000; // skip LTMA warmup
  let cyclesStarted = 0;
  let rmRejected = 0;

  while (currentTime < endTime) {
    const rmRecord = rmIndex.get(currentTime);
    if (!rmRecord) {
      currentTime += stepMs;
      continue;
    }

    // Проверка RM порога
    if (rmRecord.probability < BEST_CONFIG.minProbability) {
      rmRejected++;
      currentTime += stepMs;
      continue;
    }

    // Начинаем цикл
    cyclesStarted++;
    const cycleStart = currentTime;
    const cycleEnd = currentTime + cycleMs;
    const lockTime = cycleEnd - lockMs;

    const fixedLower = rmRecord.lower;
    const fixedUpper = rmRecord.upper;
    const rangeWidth = fixedUpper - fixedLower;

    // Ищем вход внутри цикла
    let tradeOpened = false;

    for (let t = cycleStart; t < lockTime && t < endTime; t += stepMs) {
      if (tradeOpened) break;

      const price = dataLoader.getPriceAt(t);
      if (!price) continue;

      if (price < fixedLower || price > fixedUpper) break; // выход за границы

      const position = (price - fixedLower) / rangeWidth;

      const isLongEntry = position <= BEST_CONFIG.entryLong;
      const isShortEntry = position >= BEST_CONFIG.entryShort;

      if (!isLongEntry && !isShortEntry) continue;

      // Создаём сделку
      const type = isLongEntry ? 'long' : 'short';
      const entryPrice = price;
      const stopLoss = type === 'long' ? fixedLower : fixedUpper;
      const takeProfit = type === 'long'
        ? entryPrice * (1 + BEST_CONFIG.tpPercent / 100)
        : entryPrice * (1 - BEST_CONFIG.tpPercent / 100);

      // Ищем закрытие
      let closePrice = null;
      let closeTimestamp = null;
      let closeReason = null;

      // Проверяем 1s свечи от входа до конца цикла
      for (const candle of dataLoader.candles1s) {
        if (candle.timestamp <= t) continue;
        if (candle.timestamp > cycleEnd) break;

        // Проверка SL
        if (type === 'long' && candle.low <= stopLoss) {
          closePrice = stopLoss;
          closeTimestamp = candle.timestamp;
          closeReason = 'sl';
          break;
        }
        if (type === 'short' && candle.high >= stopLoss) {
          closePrice = stopLoss;
          closeTimestamp = candle.timestamp;
          closeReason = 'sl';
          break;
        }

        // Проверка TP
        if (type === 'long' && candle.high >= takeProfit) {
          closePrice = takeProfit;
          closeTimestamp = candle.timestamp;
          closeReason = 'tp';
          break;
        }
        if (type === 'short' && candle.low <= takeProfit) {
          closePrice = takeProfit;
          closeTimestamp = candle.timestamp;
          closeReason = 'tp';
          break;
        }
      }

      // Если не закрылось по SL/TP - timeout
      if (!closePrice) {
        closePrice = dataLoader.getPriceAt(cycleEnd) || entryPrice;
        closeTimestamp = cycleEnd;
        closeReason = 'timeout';
      }

      // Расчёт PnL
      const positionSize = simConfig.positionSize;
      let grossPnL = type === 'long'
        ? (closePrice - entryPrice) * positionSize
        : (entryPrice - closePrice) * positionSize;

      const entryFee = entryPrice * positionSize * baseConfig.fees.taker;
      const exitFee = closePrice * positionSize * baseConfig.fees.taker;
      const totalFees = entryFee + exitFee;
      const netPnL = grossPnL - totalFees;

      trades.push({
        cycleStart,
        type,
        entryTimestamp: t,
        entryPrice,
        stopLoss,
        takeProfit,
        closeTimestamp,
        closePrice,
        closeReason,
        position,
        probability: rmRecord.probability,
        grossPnL,
        fees: totalFees,
        netPnL,
      });

      tradeOpened = true;
    }

    currentTime = cycleEnd;
  }

  // Вывод ВСЕХ сделок
  console.log('===============================================================================');
  console.log('ВСЕ СДЕЛКИ (детально)');
  console.log('===============================================================================\n');

  for (let i = 0; i < trades.length; i++) {
    const t = trades[i];
    const entryDate = new Date(t.entryTimestamp).toISOString();
    const closeDate = new Date(t.closeTimestamp).toISOString();
    const duration = Math.round((t.closeTimestamp - t.entryTimestamp) / 1000);
    const priceMove = ((t.closePrice - t.entryPrice) / t.entryPrice * 100).toFixed(3);

    console.log('Сделка #' + (i + 1));
    console.log('  Тип:           ' + t.type.toUpperCase());
    console.log('  Вход:          ' + entryDate.substr(0,19) + ' @ $' + t.entryPrice.toFixed(2));
    console.log('  Position:      ' + (t.position * 100).toFixed(1) + '% (' + (t.type === 'long' ? '<=25% -> LONG' : '>=75% -> SHORT') + ')');
    console.log('  RM Prob:       ' + (t.probability * 100).toFixed(1) + '%');
    console.log('  SL:            $' + t.stopLoss.toFixed(2));
    console.log('  TP:            $' + t.takeProfit.toFixed(2) + ' (+' + BEST_CONFIG.tpPercent + '%)');
    console.log('  Выход:         ' + closeDate.substr(0,19) + ' @ $' + t.closePrice.toFixed(2));
    console.log('  Причина:       ' + t.closeReason.toUpperCase() + ' (через ' + duration + 's)');
    console.log('  Движение цены: ' + priceMove + '%');
    console.log('  Gross PnL:     $' + t.grossPnL.toFixed(4));
    console.log('  Комиссии:      $' + t.fees.toFixed(4) + ' (entry: $' + (t.entryPrice * simConfig.positionSize * baseConfig.fees.taker).toFixed(4) + ' + exit: $' + (t.closePrice * simConfig.positionSize * baseConfig.fees.taker).toFixed(4) + ')');
    console.log('  Net PnL:       $' + t.netPnL.toFixed(4) + ' ' + (t.netPnL >= 0 ? 'V' : 'X'));
    console.log('');
  }

  // Итоговая статистика
  console.log('===============================================================================');
  console.log('ИТОГОВАЯ СТАТИСТИКА');
  console.log('===============================================================================\n');

  const wins = trades.filter(t => t.netPnL > 0).length;
  const losses = trades.filter(t => t.netPnL <= 0).length;
  const totalPnL = trades.reduce((sum, t) => sum + t.netPnL, 0);
  const totalFees = trades.reduce((sum, t) => sum + t.fees, 0);
  const totalGross = trades.reduce((sum, t) => sum + t.grossPnL, 0);

  const byReason = { sl: [], tp: [], timeout: [] };
  for (const t of trades) {
    byReason[t.closeReason].push(t.netPnL);
  }

  console.log('  Циклов начато:     ' + cyclesStarted);
  console.log('  RM отклонено:      ' + rmRejected);
  console.log('  Сделок открыто:    ' + trades.length);
  console.log('');
  console.log('  Wins:              ' + wins);
  console.log('  Losses:            ' + losses);
  console.log('  Win Rate:          ' + (wins / trades.length * 100).toFixed(2) + '%');
  console.log('');
  console.log('  По SL:             ' + byReason.sl.length + ' сделок, PnL: $' + byReason.sl.reduce((a,b) => a+b, 0).toFixed(2));
  console.log('  По TP:             ' + byReason.tp.length + ' сделок, PnL: $' + byReason.tp.reduce((a,b) => a+b, 0).toFixed(2));
  console.log('  По Timeout:        ' + byReason.timeout.length + ' сделок, PnL: $' + byReason.timeout.reduce((a,b) => a+b, 0).toFixed(2));
  console.log('');
  console.log('  Gross PnL:         $' + totalGross.toFixed(2));
  console.log('  Total Fees:        $' + totalFees.toFixed(2));
  console.log('  ===========================');
  console.log('  NET PnL:           $' + totalPnL.toFixed(2) + ' ' + (totalPnL >= 0 ? 'PROFIT' : 'LOSS'));
}

main().catch(console.error);
