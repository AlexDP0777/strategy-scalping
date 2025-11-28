/**
 * Risk Module API Client
 *
 * Интеграция с RM V2 для получения probability
 */

const https = require('https');
const http = require('http');

const RM_URL = 'https://rm-stage.leechprotocol.com/calculate-probability-v2';
const MAX_RETRIES = 3;
const TIMEOUT_MS = 5000;

class RMClient {
  constructor(config = {}) {
    this.url = config.url || RM_URL;
    this.maxRetries = config.maxRetries || MAX_RETRIES;
    this.timeout = config.timeout || TIMEOUT_MS;
    this.requestCount = 0;
    this.errorCount = 0;
    this.cache = new Map(); // Simple cache for repeated requests
  }

  /**
   * Fetch probability from RM API
   */
  async fetchProbability(params) {
    const { currentPrice, delta, ltma, steps, range, lower, upper } = params;

    // Cache key based on params (rounded for cache hits)
    const cacheKey = `${currentPrice.toFixed(2)}_${delta.toFixed(6)}_${ltma.toFixed(2)}_${steps}_${range}`;

    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const payload = {
      steps: steps,
      range: range,
      current_price: currentPrice,
      lower: lower || currentPrice * (1 - range),
      upper: upper || currentPrice * (1 + range),
      delta: delta,
      ltma: ltma,
    };

    for (let retry = 0; retry <= this.maxRetries; retry++) {
      try {
        this.requestCount++;
        const result = await this._makeRequest(payload);

        const probability = result.probability_within_range || 0;

        // Cache the result
        this.cache.set(cacheKey, {
          probability,
          lowerBound: result.lower_bound,
          upperBound: result.upper_bound,
          expectedPrice: result.expected_price,
        });

        return this.cache.get(cacheKey);
      } catch (error) {
        this.errorCount++;
        if (retry === this.maxRetries) {
          console.error(`[RM] Failed after ${this.maxRetries} retries:`, error.message);
          return { probability: 0, error: error.message };
        }
        // Exponential backoff
        await this._sleep(500 * (retry + 1));
      }
    }
  }

  /**
   * Batch fetch probabilities (sequential with rate limiting)
   */
  async fetchProbabilitiesBatch(paramsList, progressCallback = null) {
    const results = [];
    const total = paramsList.length;

    for (let i = 0; i < total; i++) {
      const result = await this.fetchProbability(paramsList[i]);
      results.push(result);

      if (progressCallback && (i + 1) % 100 === 0) {
        progressCallback(i + 1, total);
      }

      // Rate limiting: small delay between requests
      if (i < total - 1) {
        await this._sleep(50);
      }
    }

    return results;
  }

  /**
   * Make HTTP request
   */
  _makeRequest(payload) {
    return new Promise((resolve, reject) => {
      const url = new URL(this.url);
      const isHttps = url.protocol === 'https:';
      const lib = isHttps ? https : http;

      const data = JSON.stringify(payload);

      const options = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
        },
        timeout: this.timeout,
      };

      const req = lib.request(options, (res) => {
        let body = '';

        res.on('data', (chunk) => {
          body += chunk;
        });

        res.on('end', () => {
          try {
            const result = JSON.parse(body);
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(result);
            } else {
              reject(new Error(`HTTP ${res.statusCode}: ${body}`));
            }
          } catch (e) {
            reject(new Error(`Invalid JSON response: ${body}`));
          }
        });
      });

      req.on('error', (e) => {
        reject(e);
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      req.write(data);
      req.end();
    });
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getStats() {
    return {
      requests: this.requestCount,
      errors: this.errorCount,
      cacheSize: this.cache.size,
      hitRate: this.cache.size > 0
        ? ((this.requestCount - this.cache.size) / this.requestCount * 100).toFixed(1) + '%'
        : '0%',
    };
  }

  clearCache() {
    this.cache.clear();
  }
}

module.exports = RMClient;
