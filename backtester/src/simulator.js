/**
 * Simulator
 *
 * Основная логика симуляции торговли
 *
 * ПРАВИЛЬНАЯ ЛОГИКА:
 * 1. Каждую минуту: считаем delta, LTMA, границы → спрашиваем RM
 * 2. Если probability >= порога → НАЧИНАЕМ ЦИКЛ (фиксируем границы)
 * 3. Внутри цикла мониторим position, входим при достижении границы
 * 4. Если probability < порога → цикл НЕ начинается, ждём 1 минуту
 *
 * TODO [АДАПТИВНАЯ ВЕРСИЯ]:
 * - Внутри цикла НЕ мониторим RM (границы уже зафиксированы)
 * - Но можно добавить режим где RM пересчитывается внутри цикла
 *   и если probability падает ниже порога - прерываем цикл досрочно
 * - Это может помочь избежать убыточных сделок когда волатильность растёт
 */

const cycleTimeoutStrategy = require('./strategies/cycle-timeout');
const noSlStrategy = require('./strategies/no-sl');
const noCycleStrategy = require('./strategies/no-cycle');
const RMClient = require('./rm-client');

const STRATEGIES = {
  cycle_timeout: cycleTimeoutStrategy,
  no_sl: noSlStrategy,
  no_cycle: noCycleStrategy,
};

class Simulator {
  constructor(dataLoader, config) {
    this.dataLoader = dataLoader;
    this.config = config;
    this.rmClient = null;
  }

  /**
   * Инициализация RM клиента
   */
  initRMClient(options = {}) {
    this.rmClient = new RMClient(options);
    return this;
  }

  /**
   * Запуск симуляции с конкретными параметрами
   *
   * ЛОГИКА:
   * 1. Каждую минуту вычисляем метрики и спрашиваем RM
   * 2. Если RM >= minProbability → начинаем цикл
   * 3. Внутри цикла мониторим position
   * 4. Если position у границы → открываем позицию
   * 5. После цикла → снова спрашиваем RM
   */
  async run(params, debug = false, useRealRM = false) {
    const {
      range,
      cycleTime,
      entryLong,
      entryShort,
      minProbability,
      lockBeforeEnd,
      closeStrategy,
      rmData = null,  // Заглушка для тестов без API
    } = params;

    if (debug) {
      console.log(`\n[DEBUG] Running with params:`, params);
    }

    const strategy = STRATEGIES[closeStrategy];
    if (!strategy) {
      throw new Error(`Unknown strategy: ${closeStrategy}`);
    }

    const trades = [];
    const cycleMs = cycleTime * 60 * 1000;
    const lockMs = lockBeforeEnd * 1000;
    const stepMs = 60 * 1000; // 1 минута

    // Время данных
    const startTime = this.dataLoader.candles1m[0]?.timestamp;
    const endTime = this.dataLoader.candles1m[this.dataLoader.candles1m.length - 1]?.timestamp;

    if (!startTime || !endTime) {
      if (debug) console.log('[DEBUG] No startTime or endTime, returning early');
      return { trades: [], stats: null };
    }

    if (debug) {
      console.log(`[DEBUG] Data range: ${new Date(startTime).toISOString()} to ${new Date(endTime).toISOString()}`);
    }

    // Пропускаем первые N минут для расчёта LTMA
    const skipMinutes = 200;
    let currentTime = startTime + skipMinutes * 60 * 1000;

    if (debug) {
      console.log(`[DEBUG] Skip ${skipMinutes} minutes for LTMA warmup`);
      console.log(`[DEBUG] Starting at: ${new Date(currentTime).toISOString()}`);
    }

    // Счётчики для отладки
    let debugStats = {
      rmChecks: 0,
      rmPassed: 0,
      rmRejected: 0,
      cyclesStarted: 0,
      positionChecks: 0,
      longSignals: 0,
      shortSignals: 0,
      tradesOpened: 0,
    };

    // ========== ГЛАВНЫЙ ЦИКЛ ==========
    while (currentTime < endTime) {
      // 1. Получаем текущую цену
      const price = this.dataLoader.getPriceAt(currentTime);
      if (!price) {
        currentTime += stepMs;
        continue;
      }

      // 2. Вычисляем метрики для RM
      const metrics = this.dataLoader.computeMetrics(
        currentTime,
        this.config.riskModuleSteps || 10,
        this.config.deltaMultiplier,
        this.config.ltmaMultiplier
      );

      if (!metrics) {
        currentTime += stepMs;
        continue;
      }

      // 3. Вычисляем границы от ТЕКУЩЕЙ цены
      const lowerBound = price * (1 - range);
      const upperBound = price * (1 + range);

      // 4. Спрашиваем RM: какова вероятность?
      debugStats.rmChecks++;
      let probability = 0.85; // default stub

      if (this.rmClient && useRealRM) {
        const rmResult = await this.rmClient.fetchProbability({
          currentPrice: price,
          delta: metrics.delta,
          ltma: metrics.ltma,
          steps: this.config.riskModuleSteps || 10,
          range: range,
          lower: lowerBound,
          upper: upperBound,
        });
        probability = rmResult.probability || 0;
      } else if (rmData?.probability !== undefined) {
        probability = rmData.probability;
      }

      // 5. Проверяем: достаточно ли вероятность для начала цикла?
      if (probability < minProbability) {
        debugStats.rmRejected++;
        // Цикл НЕ начинается, ждём 1 минуту и пробуем снова
        currentTime += stepMs;
        continue;
      }

      // ========== НАЧИНАЕМ ЦИКЛ ==========
      debugStats.rmPassed++;
      debugStats.cyclesStarted++;

      // Границы ФИКСИРУЮТСЯ на момент начала цикла!
      const cycleStart = currentTime;
      const cycleEnd = currentTime + cycleMs;
      const lockTime = cycleEnd - lockMs;
      const fixedLower = lowerBound;
      const fixedUpper = upperBound;
      const rangeWidth = fixedUpper - fixedLower;

      if (debug && debugStats.cyclesStarted <= 3) {
        console.log(`\n[CYCLE ${debugStats.cyclesStarted}] Started at ${new Date(cycleStart).toISOString()}`);
        console.log(`  Price: $${price.toFixed(2)}, Probability: ${(probability * 100).toFixed(1)}%`);
        console.log(`  Bounds: $${fixedLower.toFixed(2)} - $${fixedUpper.toFixed(2)}`);
        console.log(`  Cycle end: ${new Date(cycleEnd).toISOString()}`);
      }

      // 6. Мониторим position внутри цикла
      let tradeOpened = false;

      for (let t = cycleStart; t < lockTime && t < endTime; t += stepMs) {
        if (tradeOpened) break;

        const currentPrice = this.dataLoader.getPriceAt(t);
        if (!currentPrice) continue;

        // Position относительно ФИКСИРОВАННЫХ границ
        const position = (currentPrice - fixedLower) / rangeWidth;
        debugStats.positionChecks++;

        // Проверяем: цена вышла за границы?
        if (currentPrice < fixedLower || currentPrice > fixedUpper) {
          // Цена вышла за пределы - прерываем цикл
          if (debug && debugStats.cyclesStarted <= 3) {
            console.log(`  [!] Price $${currentPrice.toFixed(2)} out of bounds, cycle broken`);
          }
          break;
        }

        // Проверяем сигналы на вход
        const isLongEntry = position <= entryLong;
        const isShortEntry = position >= entryShort;

        if (isLongEntry) debugStats.longSignals++;
        if (isShortEntry) debugStats.shortSignals++;

        if (!isLongEntry && !isShortEntry) continue;

        // ========== ОТКРЫВАЕМ ПОЗИЦИЮ ==========
        let trade = null;

        if (isLongEntry) {
          trade = {
            type: 'long',
            entryTimestamp: t,
            entryPrice: currentPrice,
            stopLoss: fixedLower,
            takeProfit: this.calculateTP('long', currentPrice, fixedLower, fixedUpper),
            cycleStart,
            cycleEnd,
            lowerBound: fixedLower,
            upperBound: fixedUpper,
            position,
            probability,
          };
        } else if (isShortEntry) {
          trade = {
            type: 'short',
            entryTimestamp: t,
            entryPrice: currentPrice,
            stopLoss: fixedUpper,
            takeProfit: this.calculateTP('short', currentPrice, fixedLower, fixedUpper),
            cycleStart,
            cycleEnd,
            lowerBound: fixedLower,
            upperBound: fixedUpper,
            position,
            probability,
          };
        }

        if (trade) {
          // Определяем как закроется позиция
          const closeResult = strategy.checkClose(trade, this.dataLoader);

          trade.closeTimestamp = closeResult.closeTimestamp;
          trade.closePrice = closeResult.closePrice;
          trade.closeReason = closeResult.closeReason;

          // Расчёт PnL
          trade.pnl = this.calculatePnL(trade);

          trades.push(trade);
          tradeOpened = true;
          debugStats.tradesOpened++;

          if (debug && debugStats.tradesOpened <= 3) {
            console.log(`  [TRADE] ${trade.type.toUpperCase()} @ $${currentPrice.toFixed(2)}`);
            console.log(`    Position: ${(position * 100).toFixed(1)}%`);
            console.log(`    Close: ${trade.closeReason} @ $${trade.closePrice.toFixed(2)}`);
            console.log(`    PnL: $${trade.netPnL.toFixed(2)}`);
          }
        }
      }

      // 7. Переходим к концу цикла
      currentTime = cycleEnd;
    }

    // ========== ВЫВОД СТАТИСТИКИ ==========
    if (debug) {
      console.log(`\n[DEBUG] === STATISTICS ===`);
      console.log(`  RM checks: ${debugStats.rmChecks}`);
      console.log(`  RM passed (cycles started): ${debugStats.rmPassed}`);
      console.log(`  RM rejected: ${debugStats.rmRejected}`);
      console.log(`  Position checks: ${debugStats.positionChecks}`);
      console.log(`  Long signals: ${debugStats.longSignals}`);
      console.log(`  Short signals: ${debugStats.shortSignals}`);
      console.log(`  Trades opened: ${debugStats.tradesOpened}`);

      if (this.rmClient && useRealRM) {
        console.log(`  RM API Stats:`, this.rmClient.getStats());
      }
    }

    // Вычисляем статистику
    const stats = this.calculateStats(trades);
    stats.debugStats = debugStats;

    return { trades, stats };
  }

  /**
   * Расчёт Take Profit
   */
  calculateTP(type, price, lowerBound, upperBound) {
    const strategy = this.config.tpStrategy || 'midpoint';

    if (strategy === 'midpoint') {
      if (type === 'long') {
        return price + (upperBound - price) / 2;
      } else {
        return price - (price - lowerBound) / 2;
      }
    }

    if (strategy === 'fixed_percent') {
      const percent = this.config.tpPercent || 0.5;
      if (type === 'long') {
        return price * (1 + percent / 100);
      } else {
        return price * (1 - percent / 100);
      }
    }

    if (strategy === 'fixed_rr') {
      const rr = this.config.tpRiskReward || 2;
      if (type === 'long') {
        const risk = price - lowerBound;
        return price + risk * rr;
      } else {
        const risk = upperBound - price;
        return price - risk * rr;
      }
    }

    // Default: midpoint
    return type === 'long'
      ? price + (upperBound - price) / 2
      : price - (price - lowerBound) / 2;
  }

  /**
   * Расчёт PnL с комиссиями
   */
  calculatePnL(trade) {
    const { type, entryPrice, closePrice } = trade;
    const positionSize = this.config.positionSize;
    const fees = this.config.fees;

    // Gross PnL
    let grossPnL;
    if (type === 'long') {
      grossPnL = (closePrice - entryPrice) * positionSize;
    } else {
      grossPnL = (entryPrice - closePrice) * positionSize;
    }

    // Комиссии (taker на вход и выход)
    const entryFee = entryPrice * positionSize * fees.taker;
    const exitFee = closePrice * positionSize * fees.taker;
    const totalFees = entryFee + exitFee;

    // Net PnL
    const netPnL = grossPnL - totalFees;

    trade.grossPnL = grossPnL;
    trade.fees = totalFees;
    trade.netPnL = netPnL;

    return netPnL;
  }

  /**
   * Расчёт статистики по сделкам
   */
  calculateStats(trades) {
    if (trades.length === 0) {
      return {
        totalTrades: 0,
        wins: 0,
        losses: 0,
        winRate: 0,
        totalPnL: 0,
        totalFees: 0,
        avgPnL: 0,
        maxWin: 0,
        maxLoss: 0,
        byReason: {},
      };
    }

    const wins = trades.filter(t => t.netPnL > 0).length;
    const losses = trades.filter(t => t.netPnL <= 0).length;
    const totalPnL = trades.reduce((sum, t) => sum + t.netPnL, 0);
    const totalFees = trades.reduce((sum, t) => sum + t.fees, 0);

    const pnls = trades.map(t => t.netPnL);
    const maxWin = Math.max(...pnls);
    const maxLoss = Math.min(...pnls);

    // Статистика по причинам закрытия
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
      winRate: (wins / trades.length * 100).toFixed(2),
      totalPnL: totalPnL.toFixed(2),
      totalFees: totalFees.toFixed(2),
      avgPnL: (totalPnL / trades.length).toFixed(2),
      maxWin: maxWin.toFixed(2),
      maxLoss: maxLoss.toFixed(2),
      byReason,
    };
  }
}

module.exports = Simulator;
