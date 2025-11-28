/**
 * Предвычисление RM данных для заданного range
 *
 * Кэширует probability для каждой минуты периода.
 * Потом можно прогнать любые комбинации entry/lock/minProb без API-вызовов.
 *
 * Использование:
 *   node cache-rm-data.js              # использует range из конфига
 *   node cache-rm-data.js 0.007        # указать range явно
 *
 * ОПТИМИЗИРОВАНО: параллельные запросы (300 req/sec вместо 8 req/sec)
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const DataLoader = require('./src/data-loader');
const baseConfig = require('./src/config');

const simConfig = JSON.parse(fs.readFileSync('./simulation.config.json', 'utf8'));

const RM_URL = 'https://rm-stage.leechprotocol.com/calculate-probability-v2';
const BATCH_SIZE = 100;  // Запросов в одном батче
const TIMEOUT_MS = 15000;

/**
 * Один запрос к RM API
 */
function makeRequest(payload) {
  return new Promise((resolve) => {
    const data = JSON.stringify(payload);
    const url = new URL(RM_URL);

    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
      timeout: TIMEOUT_MS,
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(body);
          resolve({ success: true, probability: result.probability_within_range || 0 });
        } catch (e) {
          resolve({ success: false, probability: 0, error: 'parse error' });
        }
      });
    });

    req.on('error', (e) => resolve({ success: false, probability: 0, error: e.message }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ success: false, probability: 0, error: 'timeout' });
    });

    req.write(data);
    req.end();
  });
}

/**
 * Параллельный запрос батча
 */
async function fetchBatch(items, range, riskModuleSteps) {
  const promises = items.map(item => {
    const payload = {
      steps: riskModuleSteps,
      range: range,
      current_price: item.price,
      lower: item.lower,
      upper: item.upper,
      delta: item.delta,
      ltma: item.ltma,
    };
    return makeRequest(payload);
  });

  const results = await Promise.all(promises);

  return items.map((item, i) => ({
    timestamp: item.timestamp,
    price: item.price,
    probability: results[i].probability,
    delta: item.delta,
    ltma: item.ltma,
    lower: item.lower,
    upper: item.upper,
    error: results[i].error || null,
  }));
}

async function cacheRMData(range) {
  console.log('=== КЭШИРОВАНИЕ RM ДАННЫХ (ПАРАЛЛЕЛЬНО) ===\n');
  console.log(`Range: ${(range * 100).toFixed(2)}%`);
  console.log(`Период: ${simConfig.fromDate} → ${simConfig.toDate}`);
  console.log(`Батч: ${BATCH_SIZE} параллельных запросов`);
  console.log('');

  // Загрузка данных
  console.log('1. Загрузка данных...');
  const dataLoader = new DataLoader(baseConfig.dataPath);
  await dataLoader.load(simConfig.fromDate, simConfig.toDate);
  console.log(`   1m свечей: ${dataLoader.candles1m.length.toLocaleString()}\n`);

  const stepMs = 60 * 1000;
  const skipMinutes = 200;
  const riskModuleSteps = 10;

  const startTime = dataLoader.candles1m[0]?.timestamp;
  const endTime = dataLoader.candles1m[dataLoader.candles1m.length - 1]?.timestamp;

  // Подготовка всех запросов
  console.log('2. Подготовка запросов...');
  const allItems = [];
  let currentTime = startTime + skipMinutes * 60 * 1000;

  while (currentTime < endTime) {
    const price = dataLoader.getPriceAt(currentTime);
    if (price) {
      const metrics = dataLoader.computeMetrics(
        currentTime,
        riskModuleSteps,
        baseConfig.deltaMultiplier,
        baseConfig.ltmaMultiplier
      );

      if (metrics) {
        allItems.push({
          timestamp: currentTime,
          price,
          delta: metrics.delta,
          ltma: metrics.ltma,
          lower: price * (1 - range),
          upper: price * (1 + range),
        });
      }
    }
    currentTime += stepMs;
  }

  console.log(`   Запросов к RM: ${allItems.length.toLocaleString()}\n`);

  // Выполнение батчами
  console.log('3. Запросы к RM API (параллельно)...\n');

  const cache = {
    range,
    steps: riskModuleSteps,
    period: { from: simConfig.fromDate, to: simConfig.toDate },
    createdAt: new Date().toISOString(),
    data: [],
  };

  const startMs = Date.now();
  let processed = 0;
  let errors = 0;

  for (let i = 0; i < allItems.length; i += BATCH_SIZE) {
    const batch = allItems.slice(i, i + BATCH_SIZE);
    const results = await fetchBatch(batch, range, riskModuleSteps);

    for (const r of results) {
      cache.data.push(r);
      if (r.error) errors++;
    }

    processed += batch.length;

    // Прогресс
    const pct = (processed / allItems.length * 100).toFixed(1);
    const elapsed = ((Date.now() - startMs) / 1000).toFixed(0);
    const rate = (processed / elapsed).toFixed(1);
    const eta = ((allItems.length - processed) / (processed / elapsed)).toFixed(0);
    process.stdout.write(`\r   ${processed}/${allItems.length} (${pct}%) | ${rate} req/sec | ETA: ${eta}s | Ошибок: ${errors}`);
  }

  const totalTime = ((Date.now() - startMs) / 1000).toFixed(1);
  console.log(`\n\n   Готово за ${totalTime}s (${(allItems.length / totalTime).toFixed(0)} req/sec)\n`);

  // Статистика
  console.log('4. Статистика:');
  console.log(`   Записей в кэше: ${cache.data.length}`);
  console.log(`   Ошибок: ${errors}`);
  console.log('');

  // Сохранение
  const rangeStr = (range * 100).toFixed(1).replace('.', '_');
  const filename = `rm-cache/cache_${rangeStr}pct_${simConfig.fromDate}_${simConfig.toDate}.json`;

  if (!fs.existsSync('rm-cache')) {
    fs.mkdirSync('rm-cache');
  }

  fs.writeFileSync(filename, JSON.stringify(cache, null, 2));
  console.log(`Кэш сохранён: ${filename}`);
  console.log(`Размер: ${(fs.statSync(filename).size / 1024).toFixed(1)} KB`);

  // Статистика по probability
  const probs = cache.data.map(d => d.probability).filter(p => p > 0);
  if (probs.length > 0) {
    const avg = probs.reduce((a, b) => a + b, 0) / probs.length;
    const min = Math.min(...probs);
    const max = Math.max(...probs);

    console.log('\nРаспределение probability:');
    console.log(`   Min: ${(min * 100).toFixed(2)}%`);
    console.log(`   Avg: ${(avg * 100).toFixed(2)}%`);
    console.log(`   Max: ${(max * 100).toFixed(2)}%`);

    // Гистограмма
    const buckets = [0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 0.98, 1.0];
    console.log('\n   Распределение:');
    for (let i = 0; i < buckets.length; i++) {
      const lo = i === 0 ? 0 : buckets[i - 1];
      const hi = buckets[i];
      const count = probs.filter(p => p > lo && p <= hi).length;
      const pct = (count / probs.length * 100).toFixed(1);
      const bar = '█'.repeat(Math.round(count / probs.length * 40));
      console.log(`   ${(lo * 100).toFixed(0).padStart(3)}%-${(hi * 100).toFixed(0).padStart(3)}%: ${count.toString().padStart(5)} (${pct.padStart(5)}%) ${bar}`);
    }
  }

  console.log('\n');
}

// Запуск
const range = process.argv[2] ? parseFloat(process.argv[2]) : simConfig.range;
cacheRMData(range).catch(console.error);
