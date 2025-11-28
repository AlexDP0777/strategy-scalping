/**
 * Strategy: No Stop Loss
 *
 * Закрытие позиции:
 * - По Take Profit
 * - По таймауту цикла (принудительно)
 *
 * Stop Loss игнорируется
 */

module.exports = {
  name: 'no_sl',
  description: 'TP / Cycle Timeout (no SL)',

  checkClose(position, dataLoader) {
    const { entryTimestamp, type, takeProfit, cycleEnd } = position;

    let tpHit = null;

    if (type === 'long') {
      tpHit = dataLoader.findPriceHit(entryTimestamp, cycleEnd, takeProfit, 'above');
    } else {
      tpHit = dataLoader.findPriceHit(entryTimestamp, cycleEnd, takeProfit, 'below');
    }

    if (tpHit) {
      return {
        closeTimestamp: tpHit.timestamp,
        closePrice: takeProfit,
        closeReason: 'tp',
      };
    }

    return {
      closeTimestamp: cycleEnd,
      closePrice: dataLoader.getPriceAt(cycleEnd),
      closeReason: 'timeout',
    };
  },
};
