/**
 * Тест скорости RM API
 */
const https = require('https');

const RM_URL = 'https://rm-stage.leechprotocol.com/calculate-probability-v2';

function makeRequest(payload) {
  return new Promise((resolve, reject) => {
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
      timeout: 10000,
    };

    const start = Date.now();
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        const duration = Date.now() - start;
        try {
          const result = JSON.parse(body);
          resolve({ success: true, duration, probability: result.probability_within_range });
        } catch (e) {
          resolve({ success: false, duration, error: 'parse error' });
        }
      });
    });

    req.on('error', (e) => resolve({ success: false, duration: Date.now() - start, error: e.message }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ success: false, duration: Date.now() - start, error: 'timeout' });
    });

    req.write(data);
    req.end();
  });
}

async function testSpeed() {
  console.log('=== ТЕСТ СКОРОСТИ RM API ===\n');

  // Тестовый payload
  const payload = {
    steps: 10,
    range: 0.007,
    current_price: 2400,
    lower: 2400 * 0.993,
    upper: 2400 * 1.007,
    delta: 0.0001,
    ltma: 2400,
  };

  // Тест 1: Последовательные запросы
  console.log('1. Последовательные запросы (10 штук)...');
  let start = Date.now();
  for (let i = 0; i < 10; i++) {
    await makeRequest({ ...payload, current_price: 2400 + i });
  }
  let duration = Date.now() - start;
  console.log(`   Время: ${duration}ms, скорость: ${(10000 / duration).toFixed(1)} req/sec\n`);

  // Тест 2: Параллельные запросы (50)
  console.log('2. Параллельные запросы (50 штук)...');
  start = Date.now();
  const promises50 = [];
  for (let i = 0; i < 50; i++) {
    promises50.push(makeRequest({ ...payload, current_price: 2400 + i }));
  }
  const results50 = await Promise.all(promises50);
  duration = Date.now() - start;
  const success50 = results50.filter(r => r.success).length;
  console.log(`   Время: ${duration}ms, успешных: ${success50}/50, скорость: ${(50000 / duration).toFixed(1)} req/sec\n`);

  // Тест 3: Параллельные запросы (100)
  console.log('3. Параллельные запросы (100 штук)...');
  start = Date.now();
  const promises100 = [];
  for (let i = 0; i < 100; i++) {
    promises100.push(makeRequest({ ...payload, current_price: 2400 + i }));
  }
  const results100 = await Promise.all(promises100);
  duration = Date.now() - start;
  const success100 = results100.filter(r => r.success).length;
  console.log(`   Время: ${duration}ms, успешных: ${success100}/100, скорость: ${(100000 / duration).toFixed(1)} req/sec\n`);

  // Тест 4: Параллельные запросы (200)
  console.log('4. Параллельные запросы (200 штук)...');
  start = Date.now();
  const promises200 = [];
  for (let i = 0; i < 200; i++) {
    promises200.push(makeRequest({ ...payload, current_price: 2400 + i }));
  }
  const results200 = await Promise.all(promises200);
  duration = Date.now() - start;
  const success200 = results200.filter(r => r.success).length;
  const avgDuration = results200.reduce((sum, r) => sum + r.duration, 0) / results200.length;
  console.log(`   Время: ${duration}ms, успешных: ${success200}/200, скорость: ${(200000 / duration).toFixed(1)} req/sec`);
  console.log(`   Среднее время ответа: ${avgDuration.toFixed(0)}ms\n`);

  // Итог
  console.log('=== ИТОГ ===');
  console.log(`При ${(200000 / duration).toFixed(0)} req/sec кэш на 10,000 минут займёт: ${(10000 / (200000 / duration)).toFixed(1)} секунд`);
}

testSpeed().catch(console.error);
