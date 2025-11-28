/**
 * Backtester Configuration
 *
 * Параметры для перебора комбинаций
 */

module.exports = {
  // Путь к данным (абсолютный для надёжности)
  dataPath: 'C:/Users/Alex/Documents/GitHub/binance-probability-analyzer/data/raw/ETHUSDT',

  // Комиссии Binance Futures (с BNB дисконтом)
  fees: {
    maker: 0.00018,  // 0.018%
    taker: 0.00045,  // 0.045%
  },

  // Размер позиции
  positionSize: 0.5,  // ETH
  leverage: 3,

  // ===== ДИАПАЗОНЫ ПАРАМЕТРОВ ДЛЯ ПЕРЕБОРА =====

  // Range (ширина диапазона РМ)
  ranges: [0.003, 0.005, 0.007, 0.010],  // 0.3% - 1.0%

  // Время цикла в минутах
  cycleTimes: [5, 10, 15, 20, 30],

  // Порог входа в LONG (position <= entryLong)
  entryLongs: [0.25, 0.30, 0.33],

  // Порог входа в SHORT (position >= entryShort)
  entryShorts: [0.67, 0.70, 0.75],

  // Минимальная вероятность для входа
  minProbabilities: [0.70, 0.75, 0.80, 0.85, 0.90],

  // Блокировка входа за N секунд до конца цикла
  lockBeforeEnds: [30, 60, 90, 120],

  // Стратегии закрытия
  closeStrategies: ['cycle_timeout', 'no_sl', 'no_cycle'],

  // ===== ПАРАМЕТРЫ ДЛЯ РАСЧЁТА DELTA/LTMA =====

  // Множители для окон (как в боте)
  deltaMultiplier: 2,
  ltmaMultiplier: 15,

  // ===== ПАРАМЕТРЫ TP =====

  // Стратегия TP
  tpStrategy: 'fixed_percent',  // 'midpoint', 'fixed_percent', 'fixed_rr'
  tpPercent: 0.35,              // для fixed_percent (0.35%)
  tpRiskReward: 2,              // для fixed_rr
};
