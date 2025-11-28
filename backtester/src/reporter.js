/**
 * Reporter
 *
 * Генерация отчётов в разных форматах
 */

const fs = require('fs');
const path = require('path');

class Reporter {
  constructor(resultsDir) {
    this.resultsDir = resultsDir;
    if (!fs.existsSync(resultsDir)) {
      fs.mkdirSync(resultsDir, { recursive: true });
    }
  }

  /**
   * Вывод в консоль (таблица топ результатов)
   */
  printConsole(results, topN = 20) {
    console.log('\n' + '='.repeat(100));
    console.log('BACKTESTER RESULTS');
    console.log('='.repeat(100));

    // Фильтруем результаты без stats
    const validResults = results.filter(r => r.stats && r.stats.totalPnL !== undefined);

    if (validResults.length === 0) {
      console.log('\nNo valid results to display.');
      return;
    }

    // Сортируем по PnL
    const sorted = [...validResults].sort((a, b) => parseFloat(b.stats.totalPnL) - parseFloat(a.stats.totalPnL));
    const top = sorted.slice(0, topN);

    console.log(`\nTOP ${topN} CONFIGURATIONS BY PnL:\n`);

    // Header
    console.log(
      'Rank'.padEnd(6) +
      'PnL'.padEnd(12) +
      'Trades'.padEnd(8) +
      'WinRate'.padEnd(10) +
      'Range'.padEnd(8) +
      'Cycle'.padEnd(8) +
      'EntryL'.padEnd(8) +
      'EntryS'.padEnd(8) +
      'MinProb'.padEnd(10) +
      'Lock'.padEnd(8) +
      'Strategy'.padEnd(15)
    );
    console.log('-'.repeat(100));

    top.forEach((r, i) => {
      console.log(
        `#${i + 1}`.padEnd(6) +
        `$${r.stats.totalPnL}`.padEnd(12) +
        `${r.stats.totalTrades}`.padEnd(8) +
        `${r.stats.winRate}%`.padEnd(10) +
        `${(r.params.range * 100).toFixed(1)}%`.padEnd(8) +
        `${r.params.cycleTime}m`.padEnd(8) +
        `${r.params.entryLong}`.padEnd(8) +
        `${r.params.entryShort}`.padEnd(8) +
        `${r.params.minProbability}`.padEnd(10) +
        `${r.params.lockBeforeEnd}s`.padEnd(8) +
        `${r.params.closeStrategy}`.padEnd(15)
      );
    });

    // Worst
    console.log('\n' + '-'.repeat(100));
    console.log('WORST 5 CONFIGURATIONS:\n');
    const worst = sorted.slice(-5).reverse();
    worst.forEach((r, i) => {
      console.log(
        `#${sorted.length - 4 + i}`.padEnd(6) +
        `$${r.stats.totalPnL}`.padEnd(12) +
        `${r.stats.totalTrades}`.padEnd(8) +
        `${r.stats.winRate}%`.padEnd(10) +
        `${(r.params.range * 100).toFixed(1)}%`.padEnd(8) +
        `${r.params.cycleTime}m`.padEnd(8) +
        `${r.params.closeStrategy}`.padEnd(15)
      );
    });

    // Summary
    console.log('\n' + '='.repeat(100));
    console.log('SUMMARY:');
    console.log(`Total configurations tested: ${results.length}`);
    console.log(`Valid results: ${validResults.length}`);
    console.log(`Profitable configs: ${validResults.filter(r => parseFloat(r.stats.totalPnL) > 0).length}`);
    console.log(`Best PnL: $${sorted[0]?.stats.totalPnL || 0}`);
    console.log(`Worst PnL: $${sorted[sorted.length - 1]?.stats.totalPnL || 0}`);
    console.log('='.repeat(100));
  }

  /**
   * Сохранение в JSON
   */
  saveJSON(results, filename = null) {
    const name = filename || `backtest_${new Date().toISOString().split('T')[0]}.json`;
    const filepath = path.join(this.resultsDir, name);

    const data = {
      generatedAt: new Date().toISOString(),
      totalConfigurations: results.length,
      results: results.map(r => ({
        params: r.params,
        stats: r.stats,
        // Не сохраняем все сделки - слишком много данных
        tradesCount: r.trades.length,
      })),
    };

    fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
    console.log(`\nJSON saved to: ${filepath}`);
    return filepath;
  }

  /**
   * Сохранение в Excel (CSV)
   */
  saveExcel(results, filename = null) {
    const validResults = results.filter(r => r.stats && r.stats.totalPnL !== undefined);

    if (validResults.length === 0) {
      console.log('No valid results to save to Excel');
      return null;
    }

    const name = filename || `backtest_${new Date().toISOString().split('T')[0]}.csv`;
    const filepath = path.join(this.resultsDir, name);

    // Header
    const headers = [
      'Rank',
      'TotalPnL',
      'TotalTrades',
      'Wins',
      'Losses',
      'WinRate',
      'TotalFees',
      'AvgPnL',
      'MaxWin',
      'MaxLoss',
      'Range',
      'CycleTime',
      'EntryLong',
      'EntryShort',
      'MinProbability',
      'LockBeforeEnd',
      'CloseStrategy',
      'TP_count',
      'SL_count',
      'Timeout_count',
    ];

    // Sort by PnL
    const sorted = [...validResults].sort((a, b) => parseFloat(b.stats.totalPnL) - parseFloat(a.stats.totalPnL));

    // Rows
    const rows = sorted.map((r, i) => [
      i + 1,
      r.stats.totalPnL,
      r.stats.totalTrades,
      r.stats.wins,
      r.stats.losses,
      r.stats.winRate,
      r.stats.totalFees,
      r.stats.avgPnL,
      r.stats.maxWin,
      r.stats.maxLoss,
      r.params.range,
      r.params.cycleTime,
      r.params.entryLong,
      r.params.entryShort,
      r.params.minProbability,
      r.params.lockBeforeEnd,
      r.params.closeStrategy,
      r.stats.byReason?.tp?.count || 0,
      r.stats.byReason?.sl?.count || 0,
      r.stats.byReason?.timeout?.count || 0,
    ]);

    // Build CSV
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');

    fs.writeFileSync(filepath, csv);
    console.log(`CSV saved to: ${filepath}`);
    return filepath;
  }

  /**
   * Сохранение детальных сделок лучшей конфигурации
   */
  saveBestTrades(results, topN = 1) {
    const validResults = results.filter(r => r.stats && r.stats.totalPnL !== undefined && r.trades.length > 0);

    if (validResults.length === 0) {
      console.log('No trades to save');
      return;
    }

    const sorted = [...validResults].sort((a, b) => parseFloat(b.stats.totalPnL) - parseFloat(a.stats.totalPnL));

    for (let i = 0; i < Math.min(topN, sorted.length); i++) {
      const r = sorted[i];
      const filename = `best_${i + 1}_trades.json`;
      const filepath = path.join(this.resultsDir, filename);

      const data = {
        rank: i + 1,
        params: r.params,
        stats: r.stats,
        trades: r.trades.map(t => ({
          type: t.type,
          entryTime: new Date(t.entryTimestamp).toISOString(),
          entryPrice: t.entryPrice,
          closeTime: new Date(t.closeTimestamp).toISOString(),
          closePrice: t.closePrice,
          closeReason: t.closeReason,
          netPnL: t.netPnL?.toFixed(2),
          fees: t.fees?.toFixed(4),
          duration: Math.round((t.closeTimestamp - t.entryTimestamp) / 1000) + 's',
        })),
      };

      fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
      console.log(`Best #${i + 1} trades saved to: ${filepath}`);
    }
  }
}

module.exports = Reporter;
