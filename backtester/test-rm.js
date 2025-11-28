/**
 * Test RM API connection
 */

const RMClient = require('./src/rm-client');

async function main() {
  console.log('Testing RM API connection...\n');

  const rm = new RMClient();

  // Test parameters (ETH ~$2500)
  const testParams = {
    currentPrice: 2500,
    delta: 0.002,           // 0.2% volatility
    ltma: 2495,             // slightly below current price
    steps: 10,              // 10 minutes horizon
    range: 0.005,           // 0.5% range
  };

  console.log('Request params:', testParams);
  console.log('\nCalling RM API...\n');

  try {
    const result = await rm.fetchProbability(testParams);

    console.log('Response:');
    console.log('  probability:', result.probability);
    console.log('  lowerBound:', result.lowerBound);
    console.log('  upperBound:', result.upperBound);
    console.log('  expectedPrice:', result.expectedPrice);

    if (result.error) {
      console.log('  error:', result.error);
    }

    console.log('\nStats:', rm.getStats());

    // Test with different probability scenarios
    console.log('\n--- Testing different scenarios ---\n');

    // High volatility (should lower probability)
    const highVolParams = { ...testParams, delta: 0.01 };
    const highVolResult = await rm.fetchProbability(highVolParams);
    console.log('High volatility (delta=1%):', highVolResult.probability?.toFixed(4) || 'error');

    // Low volatility (should increase probability)
    const lowVolParams = { ...testParams, delta: 0.0005 };
    const lowVolResult = await rm.fetchProbability(lowVolParams);
    console.log('Low volatility (delta=0.05%):', lowVolResult.probability?.toFixed(4) || 'error');

    // Wider range (should increase probability)
    const wideRangeParams = { ...testParams, range: 0.01 };
    const wideRangeResult = await rm.fetchProbability(wideRangeParams);
    console.log('Wide range (1%):', wideRangeResult.probability?.toFixed(4) || 'error');

    // Narrow range (should decrease probability)
    const narrowRangeParams = { ...testParams, range: 0.002 };
    const narrowRangeResult = await rm.fetchProbability(narrowRangeParams);
    console.log('Narrow range (0.2%):', narrowRangeResult.probability?.toFixed(4) || 'error');

    console.log('\nFinal stats:', rm.getStats());

  } catch (error) {
    console.error('Error:', error);
  }
}

main();
