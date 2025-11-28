/**
 * Объяснение логики бэктестера на одном цикле
 */

const DataLoader = require('./src/data-loader');
const config = require('./src/config');

async function main() {
  console.log('=== Пошаговое объяснение логики бэктестера ===\n');

  // 1. Загружаем данные
  console.log('1. ЗАГРУЗКА ДАННЫХ');
  console.log('-------------------');
  const dataLoader = new DataLoader(config.dataPath);
  await dataLoader.load('2025-05-01', '2025-05-01');  // Только 1 день

  console.log(`\n   1s свечей: ${dataLoader.candles1s.length}`);
  console.log(`   1m свечей: ${dataLoader.candles1m.length}`);

  // Покажем первые 3 свечи
  console.log('\n   Пример 1s свечей:');
  dataLoader.candles1s.slice(0, 3).forEach((c, i) => {
    console.log(`   [${i}] ${new Date(c.timestamp).toISOString()} close=${c.close}`);
  });

  // 2. Параметры стратегии
  console.log('\n\n2. ПАРАМЕТРЫ СТРАТЕГИИ');
  console.log('----------------------');
  const params = {
    range: 0.005,        // 0.5% - ширина диапазона
    cycleTime: 10,       // 10 минут - длина цикла
    entryLong: 0.3,      // Вход в лонг когда position <= 0.3
    entryShort: 0.7,     // Вход в шорт когда position >= 0.7
    minProbability: 0.6, // Минимальная вероятность от RM
    lockBeforeEnd: 60,   // Не входить последнюю минуту цикла
  };
  console.log('   ', params);

  // 3. Симуляция одного цикла
  console.log('\n\n3. СИМУЛЯЦИЯ ОДНОГО ЦИКЛА');
  console.log('--------------------------');

  // Пропускаем первые 200 минут (нужны для расчёта LTMA)
  const skipMs = 200 * 60 * 1000;
  const cycleStart = dataLoader.candles1m[0].timestamp + skipMs;
  const cycleEnd = cycleStart + params.cycleTime * 60 * 1000;
  const lockTime = cycleEnd - params.lockBeforeEnd * 1000;

  console.log(`\n   Начало цикла: ${new Date(cycleStart).toISOString()}`);
  console.log(`   Конец цикла:  ${new Date(cycleEnd).toISOString()}`);
  console.log(`   Lock time:    ${new Date(lockTime).toISOString()}`);

  // Цена на старте цикла - фиксируем границы
  const cycleStartPrice = dataLoader.getPriceAt(cycleStart);
  const lowerBound = cycleStartPrice * (1 - params.range);
  const upperBound = cycleStartPrice * (1 + params.range);
  const rangeWidth = upperBound - lowerBound;

  console.log(`\n   Цена на старте цикла: $${cycleStartPrice.toFixed(2)}`);
  console.log(`   Нижняя граница (SL long):  $${lowerBound.toFixed(2)} (-${(params.range * 100).toFixed(1)}%)`);
  console.log(`   Верхняя граница (SL short): $${upperBound.toFixed(2)} (+${(params.range * 100).toFixed(1)}%)`);

  // 4. Проверяем каждую минуту внутри цикла
  console.log('\n\n4. ПРОВЕРКА ТОЧЕК ВХОДА (каждую минуту)');
  console.log('----------------------------------------');

  const stepMs = 60 * 1000;
  let tradeFound = false;

  for (let t = cycleStart; t < lockTime; t += stepMs) {
    const price = dataLoader.getPriceAt(t);
    if (!price) continue;

    // Position = где цена относительно диапазона (0 = нижняя граница, 1 = верхняя)
    const position = (price - lowerBound) / rangeWidth;

    const time = new Date(t).toISOString().substr(11, 8);
    const signal = position <= params.entryLong ? 'LONG!' :
                   position >= params.entryShort ? 'SHORT!' : '-';

    console.log(`   ${time} | price=$${price.toFixed(2)} | position=${(position * 100).toFixed(1)}% | ${signal}`);

    if (signal !== '-' && !tradeFound) {
      console.log('\n   >>> СИГНАЛ НА ВХОД! <<<');
      console.log(`   Тип: ${position <= params.entryLong ? 'LONG' : 'SHORT'}`);
      console.log(`   Цена входа: $${price.toFixed(2)}`);
      console.log(`   Position: ${(position * 100).toFixed(1)}% (порог: ${position <= params.entryLong ? '<=30%' : '>=70%'})`);

      if (position <= params.entryLong) {
        console.log(`   Stop Loss: $${lowerBound.toFixed(2)} (нижняя граница)`);
        console.log(`   Take Profit: $${(price + (upperBound - price) / 2).toFixed(2)} (середина до верха)`);
      } else {
        console.log(`   Stop Loss: $${upperBound.toFixed(2)} (верхняя граница)`);
        console.log(`   Take Profit: $${(price - (price - lowerBound) / 2).toFixed(2)} (середина до низа)`);
      }

      tradeFound = true;
      break;
    }
  }

  if (!tradeFound) {
    console.log('\n   В этом цикле сигналов не было (цена осталась в середине диапазона)');
  }

  // 5. Объяснение закрытия
  console.log('\n\n5. ЛОГИКА ЗАКРЫТИЯ ПОЗИЦИИ');
  console.log('---------------------------');
  console.log('   Позиция закрывается по первому из событий:');
  console.log('   - SL: цена достигла Stop Loss');
  console.log('   - TP: цена достигла Take Profit');
  console.log('   - Timeout: конец цикла (cycleEnd)');

  console.log('\n   Для проверки используются 1-секундные свечи:');
  console.log('   - Проходим по каждой секунде от входа до конца цикла');
  console.log('   - Проверяем high/low свечи против SL/TP уровней');
}

main().catch(console.error);
