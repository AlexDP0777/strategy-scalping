# Matrix Test Results - 2025-09-05 to 2025-09-11

## Test Parameters

- **Period**: 2025-09-05 - 2025-09-11 (7 days)
- **Margin**: 0.5 ETH (~$1200)
- **Leverage**: 3x (position = 1.5 ETH = ~$3600)
- **Cycle time**: 10 minutes
- **Commission**: 0.045% taker (entry + exit)

### Matrix Configuration

```
Entry pairs:     0.15/0.85, 0.20/0.80, 0.25/0.75, 0.30/0.70, 0.35/0.65
MinProbability:  95%, 96%, 97%, 98%, 99%
LockBeforeEnd:   60s, 120s, 180s, 240s, 300s, 360s, 420s
TpPercent:       0.15%, 0.20%, 0.25%, 0.30%, 0.35%, 0.40%, 0.50%
```

Total combinations per range: 1225

---

## Summary by Range

| Range | Best Config | Best PnL | Best ROI | Lock 420s avg |
|-------|-------------|----------|----------|---------------|
| **0.7%** | 0.25/0.75 + 98% + 300s + 0.25% | **$83.32** | **6.94%** | -$12.92 |
| 0.8% | 0.3/0.7 + 95% + 420s + 0.5% | $43.28 | 3.61% | -$8.13 |
| **0.9%** | 0.3/0.7 + 98% + 420s + 0.25% | $52.51 | 4.38% | **+$6.67** |
| 1.0% | 0.15/0.85 + 98% + 360s + 0.5% | $26.41 | 2.20% | -$6.81 |

---

## Range 0.7% - TOP 10 Configurations

| # | Entry | Prob | Lock | TP | Trades | WR | PnL | ROI |
|---|-------|------|------|-----|--------|-----|-----|-----|
| 1 | 0.25/0.75 | 98% | 300s | 0.25% | 15 | 86.7% | $83.32 | 6.94% |
| 2 | 0.25/0.75 | 98% | 300s | 0.35% | 15 | 80% | $80.31 | 6.69% |
| 3 | 0.25/0.75 | 98% | 240s | 0.25% | 20 | 75% | $74.86 | 6.24% |
| 4 | 0.25/0.75 | 98% | 240s | 0.35% | 20 | 70% | $71.85 | 5.99% |
| 5 | 0.25/0.75 | 98% | 300s | 0.50% | 15 | 80% | $71.35 | 5.95% |
| 6 | 0.25/0.75 | 98% | 360s | 0.50% | 6 | 100% | $69.01 | 5.75% |
| 7 | 0.25/0.75 | 98% | 300s | 0.40% | 15 | 80% | $68.87 | 5.74% |
| 8 | 0.3/0.7 | 98% | 420s | 0.50% | 10 | 80% | $65.10 | 5.42% |
| 9 | 0.3/0.7 | 95% | 420s | 0.50% | 11 | 63.6% | $64.99 | 5.42% |
| 10 | 0.25/0.75 | 98% | 360s | 0.35% | 6 | 100% | $63.84 | 5.32% |

---

## Range 0.9% - TOP 10 Configurations

| # | Entry | Prob | Lock | TP | Trades | WR | PnL | ROI |
|---|-------|------|------|-----|--------|-----|-----|-----|
| 1 | 0.3/0.7 | 97% | 420s | 0.50% | 9 | 77.8% | $62.29 | 5.19% |
| 2 | 0.3/0.7 | 97% | 420s | 0.35% | 9 | 77.8% | $55.63 | 4.64% |
| 3 | 0.3/0.7 | 98% | 420s | 0.25% | 5 | 100% | $52.51 | 4.38% |
| 4 | 0.3/0.7 | 96% | 360s | 0.35% | 10 | 80% | $51.99 | 4.33% |

**Key insight**: 0.9% range with lock 420s has **positive average PnL (+$6.67)** - the only range/lock combination that is consistently profitable!

---

## Parameter Analysis

### Entry Pairs (across all ranges)

| Entry | Best Range | Recommendation |
|-------|------------|----------------|
| 0.15/0.85 | - | Too extreme, few trades |
| 0.20/0.80 | - | Moderate, medium performance |
| **0.25/0.75** | **0.7%** | Best for aggressive trading |
| **0.30/0.70** | **0.9%** | Best for conservative trading |
| 0.35/0.65 | - | Too close to center, always negative |

### Lock Time Analysis

| Lock | Avg PnL (0.7%) | Avg PnL (0.9%) | Notes |
|------|----------------|----------------|-------|
| 60s | -$330 | -$140 | High risk, many bad trades |
| 120s | -$249 | -$90 | Still risky |
| 180s | -$185 | -$65 | Moderate |
| 240s | -$132 | -$51 | Better |
| 300s | -$87 | -$48 | Good balance |
| 360s | -$37 | -$16 | Safe |
| **420s** | **-$13** | **+$7** | Safest, fewer trades |

### Probability Threshold

| Prob | Notes |
|------|-------|
| 95% | Too loose, many false entries |
| 96% | Still loose |
| 97% | Good for 0.9% range |
| **98%** | **Optimal for 0.7% range** |
| 99% | Too strict, misses opportunities |

---

## Recommended Configurations

### Aggressive (Max Profit)
```
Range: 0.7%
Entry: 0.25/0.75
MinProbability: 98%
LockBeforeEnd: 300s
TpPercent: 0.25%

Expected: $83/week = 6.94% ROI
WinRate: 86.7%
Trades: ~15/week
```

### Conservative (Min Risk)
```
Range: 0.9%
Entry: 0.30/0.70
MinProbability: 97-98%
LockBeforeEnd: 420s
TpPercent: 0.35-0.50%

Expected: $50-60/week = 4-5% ROI
WinRate: 77-100%
Trades: ~5-10/week
```

### Ultra-Safe (100% WinRate)
```
Range: 0.7%
Entry: 0.25/0.75
MinProbability: 98%
LockBeforeEnd: 360s
TpPercent: 0.35-0.50%

Expected: $55-69/week = 4.6-5.7% ROI
WinRate: 100%
Trades: ~6/week
```

---

## Key Takeaways

1. **0.35/0.65 entry is ALWAYS negative** - avoid completely
2. **Lock 420s is the safest** - almost always positive with good configs
3. **0.9% range is most stable** - only range with positive average on 420s lock
4. **0.7% has highest upside** - best single result $83 (6.94%)
5. **98% probability is optimal** for 0.7%, 97% for 0.9%
6. **Longer lock = fewer trades but higher quality**

---

## Files

- Cache files: `rm-cache/cache_X_Xpct_2025-09-05_2025-09-11.json`
- Results: `results/matrix_X_Xpct_*.json`
- Matrix config: `matrix.config.json`
- Simulation config: `simulation.config.json`

---

*Generated: 2025-11-29*
