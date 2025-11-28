/**
 * Strategy: No Cycle Timeout
 *
 * Закрытие позиции:
 * - По Stop Loss
 * - По Take Profit
 *
 * Цикл игнорируется - позиция держится пока не сработает SL или TP
 * (с максимальным лимитом 24 часа для безопасности)
 */

const MAX_HOLD_MS = 24 * 60 * 60 * 1000; // 24 часа максимум

module.exports = {
  name: 'no_cycle',
  description: 'SL / TP only (no cycle timeout)',

  checkClose(position, dataLoader) {
    const { entryTimestamp, type, stopLoss, takeProfit } = position;

    // Максимальное время удержания
    const maxEnd = entryTimestamp + MAX_HOLD_MS;

    let slHit = null;
    let tpHit = null;

    if (type === 'long') {
      slHit = dataLoader.findPriceHit(entryTimestamp, maxEnd, stopLoss, 'below');
      tpHit = dataLoader.findPriceHit(entryTimestamp, maxEnd, takeProfit, 'above');
    } else {
      slHit = dataLoader.findPriceHit(entryTimestamp, maxEnd, stopLoss, 'above');
      tpHit = dataLoader.findPriceHit(entryTimestamp, maxEnd, takeProfit, 'below');
    }

    // Определяем что произошло раньше
    if (slHit && tpHit) {
      if (slHit.timestamp <= tpHit.timestamp) {
        return {
          closeTimestamp: slHit.timestamp,
          closePrice: stopLoss,
          closeReason: 'sl',
        };
      } else {
        return {
          closeTimestamp: tpHit.timestamp,
          closePrice: takeProfit,
          closeReason: 'tp',
        };
      }
    } else if (slHit) {
      return {
        closeTimestamp: slHit.timestamp,
        closePrice: stopLoss,
        closeReason: 'sl',
      };
    } else if (tpHit) {
      return {
        closeTimestamp: tpHit.timestamp,
        closePrice: takeProfit,
        closeReason: 'tp',
      };
    }

    // Ни SL ни TP не сработали за 24 часа - закрываем принудительно
    return {
      closeTimestamp: maxEnd,
      closePrice: dataLoader.getPriceAt(maxEnd),
      closeReason: 'max_hold',
    };
  },
};
