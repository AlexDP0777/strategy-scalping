/**
 * Data Loader
 *
 * Загружает секундные и минутные свечи из файлов
 */

const fs = require('fs');
const path = require('path');

class DataLoader {
  constructor(basePath) {
    this.basePath = basePath;
    this.candles1s = [];
    this.candles1m = [];
  }

  /**
   * Загрузить данные за период
   * @param {string} fromDate - YYYY-MM-DD
   * @param {string} toDate - YYYY-MM-DD
   */
  async load(fromDate, toDate) {
    console.log(`Loading data from ${fromDate} to ${toDate}...`);

    const dates = this.generateDateRange(fromDate, toDate);

    // Загружаем 1s свечи
    console.log('Loading 1s candles...');
    this.candles1s = await this.loadCandles(dates, '');

    // Загружаем 1m свечи
    console.log('Loading 1m candles...');
    this.candles1m = await this.loadCandles(dates, '1m');

    console.log(`Loaded: ${this.candles1s.length.toLocaleString()} 1s candles, ${this.candles1m.length.toLocaleString()} 1m candles`);

    return {
      candles1s: this.candles1s,
      candles1m: this.candles1m,
    };
  }

  /**
   * Загрузить свечи из папки
   */
  async loadCandles(dates, subfolder) {
    const allCandles = [];
    let loaded = 0;
    let missing = 0;

    for (const dateStr of dates) {
      const filePath = subfolder
        ? path.join(this.basePath, subfolder, `${dateStr}.json`)
        : path.join(this.basePath, `${dateStr}.json`);

      if (fs.existsSync(filePath)) {
        try {
          const content = fs.readFileSync(filePath, 'utf8');
          const candles = JSON.parse(content);
          allCandles.push(...candles);
          loaded++;
        } catch (err) {
          console.error(`Error loading ${filePath}: ${err.message}`);
        }
      } else {
        missing++;
      }
    }

    if (missing > 0) {
      console.log(`  Warning: ${missing} days missing`);
    }

    // Фильтруем записи с null timestamp и сортируем
    const validCandles = allCandles.filter(c => c.timestamp !== null);
    validCandles.sort((a, b) => a.timestamp - b.timestamp);

    return validCandles;
  }

  /**
   * Генерация диапазона дат
   */
  generateDateRange(fromDate, toDate) {
    const dates = [];
    const current = new Date(fromDate);
    const end = new Date(toDate);

    while (current <= end) {
      dates.push(current.toISOString().split('T')[0]);
      current.setDate(current.getDate() + 1);
    }

    return dates;
  }

  /**
   * Получить 1s свечи в диапазоне timestamp
   */
  getCandles1sInRange(startTs, endTs) {
    return this.candles1s.filter(c => c.timestamp >= startTs && c.timestamp <= endTs);
  }

  /**
   * Получить 1m свечи в диапазоне timestamp
   */
  getCandles1mInRange(startTs, endTs) {
    return this.candles1m.filter(c => c.timestamp >= startTs && c.timestamp <= endTs);
  }

  /**
   * Получить цену на момент времени (ближайшая 1s свеча)
   */
  getPriceAt(timestamp) {
    // Бинарный поиск для эффективности
    let left = 0;
    let right = this.candles1s.length - 1;

    while (left < right) {
      const mid = Math.floor((left + right) / 2);
      if (this.candles1s[mid].timestamp < timestamp) {
        left = mid + 1;
      } else {
        right = mid;
      }
    }

    // Возвращаем close ближайшей свечи
    if (left > 0 && Math.abs(this.candles1s[left - 1].timestamp - timestamp) <
        Math.abs(this.candles1s[left].timestamp - timestamp)) {
      return this.candles1s[left - 1].close;
    }

    return this.candles1s[left]?.close || null;
  }

  /**
   * Получить min/max цену в диапазоне (для проверки SL/TP)
   */
  getPriceExtremes(startTs, endTs) {
    const candles = this.getCandles1sInRange(startTs, endTs);

    if (candles.length === 0) {
      return { min: null, max: null };
    }

    let min = Infinity;
    let max = -Infinity;

    for (const candle of candles) {
      if (candle.low < min) min = candle.low;
      if (candle.high > max) max = candle.high;
    }

    return { min, max };
  }

  /**
   * Найти момент когда цена достигла уровня
   * @returns timestamp когда достигнут уровень или null
   */
  findPriceHit(startTs, endTs, level, direction) {
    const candles = this.getCandles1sInRange(startTs, endTs);

    for (const candle of candles) {
      if (direction === 'above' && candle.high >= level) {
        return { timestamp: candle.timestamp, price: level };
      }
      if (direction === 'below' && candle.low <= level) {
        return { timestamp: candle.timestamp, price: level };
      }
    }

    return null;
  }

  /**
   * Бинарный поиск индекса первой свечи >= timestamp
   */
  findCandleIndex1m(timestamp) {
    let left = 0;
    let right = this.candles1m.length;

    while (left < right) {
      const mid = Math.floor((left + right) / 2);
      if (this.candles1m[mid].timestamp < timestamp) {
        left = mid + 1;
      } else {
        right = mid;
      }
    }

    return left;
  }

  /**
   * Вычислить delta и LTMA из минутных свечей
   * (как в risk-module.service.ts)
   * Оптимизировано с бинарным поиском
   */
  computeMetrics(timestamp, steps, deltaMultiplier, ltmaMultiplier) {
    const X = steps * ltmaMultiplier;
    const deltaWindow = steps * deltaMultiplier;

    // Бинарный поиск вместо filter
    const idx = this.findCandleIndex1m(timestamp);

    if (idx < X) {
      return null; // Недостаточно данных
    }

    // Берём последние X свечей до timestamp
    const startIdx = idx - X;
    let sum = 0;
    const prices = [];

    for (let i = startIdx; i < idx; i++) {
      const price = (this.candles1m[i].high + this.candles1m[i].low) / 2;
      prices.push(price);
      sum += price;
    }

    // LTMA
    const ltma = sum / X;

    // Delta (волатильность) - последние deltaWindow+1 цен
    const deltaStart = Math.max(0, prices.length - deltaWindow - 1);
    const priceSlice = prices.slice(deltaStart);
    let deltaSum = 0;
    let deltaCount = 0;

    for (let i = 0; i < priceSlice.length - 1; i++) {
      const d = Math.abs((priceSlice[i + 1] - priceSlice[i]) / priceSlice[i]);
      deltaSum += d;
      deltaCount++;
    }

    const delta = deltaCount > 0 ? deltaSum / deltaCount : 0;

    return { delta, ltma };
  }
}

module.exports = DataLoader;
