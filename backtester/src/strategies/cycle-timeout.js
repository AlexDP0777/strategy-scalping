/**
 * Strategy: Cycle Timeout
 *
 * Закрытие позиции:
 * - По Stop Loss
 * - По Take Profit
 * - По таймауту цикла (принудительно)
 *
 * Это базовая стратегия как в текущем боте
 */

module.exports = {
  name: 'cycle_timeout',
  description: 'SL / TP / Cycle Timeout',

  /**
   * Определить как закроется позиция
   * @param {Object} position - открытая позиция
   * @param {Object} dataLoader - загрузчик данных
   * @returns {Object} { closeTimestamp, closePrice, closeReason }
   */
  checkClose(position, dataLoader) {
    const { entryTimestamp, entryPrice, type, stopLoss, takeProfit, cycleEnd } = position;

    // Ищем SL и TP в диапазоне от входа до конца цикла
    let slHit = null;
    let tpHit = null;

    if (type === 'long') {
      // LONG: SL ниже, TP выше
      slHit = dataLoader.findPriceHit(entryTimestamp, cycleEnd, stopLoss, 'below');
      tpHit = dataLoader.findPriceHit(entryTimestamp, cycleEnd, takeProfit, 'above');
    } else {
      // SHORT: SL выше, TP ниже
      slHit = dataLoader.findPriceHit(entryTimestamp, cycleEnd, stopLoss, 'above');
      tpHit = dataLoader.findPriceHit(entryTimestamp, cycleEnd, takeProfit, 'below');
    }

    // Определяем что произошло раньше
    let closeTimestamp = cycleEnd;
    let closePrice = dataLoader.getPriceAt(cycleEnd);
    let closeReason = 'timeout';

    if (slHit && tpHit) {
      // Оба сработали - берём более ранний
      if (slHit.timestamp <= tpHit.timestamp) {
        closeTimestamp = slHit.timestamp;
        closePrice = stopLoss;
        closeReason = 'sl';
      } else {
        closeTimestamp = tpHit.timestamp;
        closePrice = takeProfit;
        closeReason = 'tp';
      }
    } else if (slHit) {
      closeTimestamp = slHit.timestamp;
      closePrice = stopLoss;
      closeReason = 'sl';
    } else if (tpHit) {
      closeTimestamp = tpHit.timestamp;
      closePrice = takeProfit;
      closeReason = 'tp';
    }

    return {
      closeTimestamp,
      closePrice,
      closeReason,
    };
  },
};
