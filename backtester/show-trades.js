const fs = require('fs');
const DataLoader = require('./src/data-loader');
const Simulator = require('./src/simulator');
const baseConfig = require('./src/config');

const simConfig = JSON.parse(fs.readFileSync('./simulation.config.json', 'utf8'));

async function main() {
  console.log('Загрузка данных...\n');
  const dataLoader = new DataLoader(baseConfig.dataPath);
  await dataLoader.load(simConfig.fromDate, simConfig.toDate);

  const simulator = new Simulator(dataLoader, {
    positionSize: simConfig.positionSize,
    fees: baseConfig.fees,
    tpStrategy: simConfig.tpStrategy,
    tpPercent: simConfig.tpPercent,
    deltaMultiplier: baseConfig.deltaMultiplier,
    ltmaMultiplier: baseConfig.ltmaMultiplier,
    riskModuleSteps: 10,
  });

  const result = await simulator.run({
    range: simConfig.range,
    cycleTime: simConfig.cycleTime,
    entryLong: simConfig.entryLong,
    entryShort: simConfig.entryShort,
    minProbability: simConfig.minProbability,
    lockBeforeEnd: simConfig.lockBeforeEnd,
    closeStrategy: simConfig.closeStrategy,
    rmData: { probability: 0.96 }
  }, false, false);

  // Найти сделку по TP и по SL
  const tpTrade = result.trades.find(t => t.closeReason === 'tp');
  const slTrade = result.trades.find(t => t.closeReason === 'sl');

  console.log('═══════════════════════════════════════════════════════════');
  console.log('  СДЕЛКА В ПЛЮС (закрылась по Take Profit)');
  console.log('═══════════════════════════════════════════════════════════');
  if (tpTrade) {
    const t = tpTrade;
    console.log('');
    console.log('  Тип:        ' + t.type.toUpperCase());
    console.log('  Дата:       ' + new Date(t.entryTimestamp).toISOString().split('T')[0]);
    console.log('');
    console.log('  ┌─ ЦИКЛ ─────────────────────────────────────────────');
    console.log('  │ Старт цикла:  ' + new Date(t.cycleStart).toISOString().substr(11, 8));
    console.log('  │ Границы:      $' + t.lowerBound.toFixed(2) + ' - $' + t.upperBound.toFixed(2));
    console.log('  │ Ширина:       ' + ((t.upperBound - t.lowerBound) / t.lowerBound * 100).toFixed(2) + '%');
    console.log('  └─────────────────────────────────────────────────────');
    console.log('');
    console.log('  ┌─ ВХОД ──────────────────────────────────────────────');
    console.log('  │ Время:        ' + new Date(t.entryTimestamp).toISOString().substr(11, 8));
    console.log('  │ Цена:         $' + t.entryPrice.toFixed(2));
    console.log('  │ Position:     ' + (t.position * 100).toFixed(1) + '% ' + (t.type === 'long' ? '(≤33% → LONG)' : '(≥67% → SHORT)'));
    console.log('  │ Stop Loss:    $' + t.stopLoss.toFixed(2));
    console.log('  │ Take Profit:  $' + t.takeProfit.toFixed(2) + ' (+0.35%)');
    console.log('  └─────────────────────────────────────────────────────');
    console.log('');
    console.log('  ┌─ ВЫХОД ─────────────────────────────────────────────');
    console.log('  │ Время:        ' + new Date(t.closeTimestamp).toISOString().substr(11, 8));
    console.log('  │ Цена:         $' + t.closePrice.toFixed(2));
    console.log('  │ Причина:      ' + t.closeReason.toUpperCase() + ' ✓ (цена достигла TP)');
    console.log('  └─────────────────────────────────────────────────────');
    console.log('');
    console.log('  ┌─ РЕЗУЛЬТАТ ────────────────────────────────────────');
    console.log('  │ Движение:     ' + (t.type === 'long' ? '+' : '-') + ((Math.abs(t.closePrice - t.entryPrice) / t.entryPrice) * 100).toFixed(3) + '%');
    console.log('  │ Gross PnL:    $' + t.grossPnL.toFixed(2));
    console.log('  │ Комиссия:     $' + t.fees.toFixed(2));
    console.log('  │ Net PnL:      $' + t.netPnL.toFixed(2) + ' ✓');
    console.log('  └─────────────────────────────────────────────────────');
  }

  console.log('');
  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  СДЕЛКА В МИНУС (закрылась по Stop Loss)');
  console.log('═══════════════════════════════════════════════════════════');
  if (slTrade) {
    const t = slTrade;
    console.log('');
    console.log('  Тип:        ' + t.type.toUpperCase());
    console.log('  Дата:       ' + new Date(t.entryTimestamp).toISOString().split('T')[0]);
    console.log('');
    console.log('  ┌─ ЦИКЛ ─────────────────────────────────────────────');
    console.log('  │ Старт цикла:  ' + new Date(t.cycleStart).toISOString().substr(11, 8));
    console.log('  │ Границы:      $' + t.lowerBound.toFixed(2) + ' - $' + t.upperBound.toFixed(2));
    console.log('  │ Ширина:       ' + ((t.upperBound - t.lowerBound) / t.lowerBound * 100).toFixed(2) + '%');
    console.log('  └─────────────────────────────────────────────────────');
    console.log('');
    console.log('  ┌─ ВХОД ──────────────────────────────────────────────');
    console.log('  │ Время:        ' + new Date(t.entryTimestamp).toISOString().substr(11, 8));
    console.log('  │ Цена:         $' + t.entryPrice.toFixed(2));
    console.log('  │ Position:     ' + (t.position * 100).toFixed(1) + '% ' + (t.type === 'long' ? '(≤33% → LONG)' : '(≥67% → SHORT)'));
    console.log('  │ Stop Loss:    $' + t.stopLoss.toFixed(2) + ' (граница диапазона)');
    console.log('  │ Take Profit:  $' + t.takeProfit.toFixed(2));
    console.log('  └─────────────────────────────────────────────────────');
    console.log('');
    console.log('  ┌─ ВЫХОД ─────────────────────────────────────────────');
    console.log('  │ Время:        ' + new Date(t.closeTimestamp).toISOString().substr(11, 8));
    console.log('  │ Цена:         $' + t.closePrice.toFixed(2));
    console.log('  │ Причина:      ' + t.closeReason.toUpperCase() + ' ✗ (цена пробила границу)');
    console.log('  └─────────────────────────────────────────────────────');
    console.log('');
    console.log('  ┌─ РЕЗУЛЬТАТ ────────────────────────────────────────');
    console.log('  │ Движение:     ' + (t.type === 'long' ? '-' : '+') + ((Math.abs(t.closePrice - t.entryPrice) / t.entryPrice) * 100).toFixed(3) + '%');
    console.log('  │ Gross PnL:    $' + t.grossPnL.toFixed(2));
    console.log('  │ Комиссия:     $' + t.fees.toFixed(2));
    console.log('  │ Net PnL:      $' + t.netPnL.toFixed(2) + ' ✗');
    console.log('  └─────────────────────────────────────────────────────');
  }
  console.log('');
}

main().catch(console.error);
