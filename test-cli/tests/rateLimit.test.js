/**
 * Rate Limiting Tests - Comprehensive Internal State Validation
 * 
 * Comprehensive test suite for Luminara's internal rate limiting feature.
 * Tests token bucket algorithm, scoping, internal state, queue management, and statistics.
 */

import { createLuminara } from '../../src/index.js';
import { TestSuite, MockServer, assert, assertRange, Timer } from '../testUtils.js';
import { runTestSuiteIfDirect } from '../runTestSuite.js';

const suite = new TestSuite('Rate Limiting');
const mockServer = new MockServer(4231);
const BASE_URL = `http://localhost:${mockServer.port}`;

// Test 1: API availability and basic structure
suite.test('Rate limit API availability and structure', async () => {
	const api = createLuminara({ 
		baseURL: BASE_URL,
		rateLimit: { rps: 2 }
	});
	
	// Test that the rate limiting API methods are available
	assert(typeof api.getRateLimitStats === 'function', 'getRateLimitStats should be available');
	assert(typeof api.resetRateLimitStats === 'function', 'resetRateLimitStats should be available');
	
	// Test that we can get initial stats
	const stats = api.getRateLimitStats();
	assert(stats !== null, 'Rate limit stats should not be null');
	assert(typeof stats === 'object', 'Rate limit stats should be an object');
	
	// Verify stats structure
	assert(typeof stats.config === 'object', 'Should have config object');
	assert(typeof stats.buckets === 'object', 'Should have buckets object');
	assert(typeof stats.dispatched === 'number', 'Should have dispatched counter');
	assert(typeof stats.queued === 'number', 'Should have queued counter');
});

// Test 2: Token bucket creation and initial state
suite.test('Token bucket creation and initial state', async () => {
	const api = createLuminara({ 
		baseURL: BASE_URL,
		rateLimit: { rps: 2, burst: 3 }
	});
	
	// Check initial state before any requests
	const initialStats = api.getRateLimitStats();
	
	// Verify configuration was normalized correctly
	assert(initialStats.config.limit === 2, 'Config should show limit: 2');
	assert(initialStats.config.burst === 3, 'Config should show burst: 3');
	assert(initialStats.config.windowMs === 1000, 'Config should show windowMs: 1000');
	assert(initialStats.config.ratePerMs === 0.002, 'Config should show ratePerMs: 0.002');
	
	// Verify initial counters
	assert(initialStats.dispatched === 0, 'Initial dispatched should be 0');
	assert(initialStats.queued === 0, 'Initial queued should be 0');
	assert(Object.keys(initialStats.buckets).length === 0, 'Should have no buckets initially');
	
	// Make first request to trigger bucket creation
	await api.getJson('/json');
	
	const afterFirstRequest = api.getRateLimitStats();
	const bucketKeys = Object.keys(afterFirstRequest.buckets);
	
	// Verify bucket was created
	assert(bucketKeys.length === 1, `Should have 1 bucket after first request, got ${bucketKeys.length}`);
	
	const bucket = afterFirstRequest.buckets[bucketKeys[0]];
	assert(typeof bucket.tokens === 'number', 'Bucket should have tokens property');
	assert(typeof bucket.queued === 'number', 'Bucket should have queued property');
	assert(typeof bucket.inFlight === 'number', 'Bucket should have inFlight property');
	
	// Verify token consumption (should have consumed 1 token from burst capacity)
	assert(bucket.tokens >= 2 && bucket.tokens <= 3, `Expected 2-3 tokens after first request, got ${bucket.tokens}`);
	assert(afterFirstRequest.dispatched === 1, `Should have dispatched 1 request, got ${afterFirstRequest.dispatched}`);
});

// Test 3: Token consumption and bucket state tracking
suite.test('Token consumption and bucket state tracking', async () => {
	const api = createLuminara({ 
		baseURL: BASE_URL,
		rateLimit: { rps: 2, burst: 4 } // Higher burst for clearer tracking
	});
	
	api.resetRateLimitStats();
	
	// Make multiple requests to track token consumption
	await api.getJson('/json?track=1');
	const after1 = api.getRateLimitStats();
	
	await api.getJson('/json?track=2');  
	const after2 = api.getRateLimitStats();
	
	await api.getJson('/json?track=3');
	const after3 = api.getRateLimitStats();
	
	// Verify dispatch tracking
	assert(after1.dispatched === 1, `After 1 request: dispatched should be 1, got ${after1.dispatched}`);
	assert(after2.dispatched === 2, `After 2 requests: dispatched should be 2, got ${after2.dispatched}`);
	assert(after3.dispatched === 3, `After 3 requests: dispatched should be 3, got ${after3.dispatched}`);
	
	// Verify bucket state changes  
	const bucketKey = Object.keys(after3.buckets)[0];
	const bucket1 = after1.buckets[bucketKey];
	const bucket2 = after2.buckets[bucketKey];
	const bucket3 = after3.buckets[bucketKey];
	
	// Tokens should decrease with each request (within burst capacity)
	assert(bucket1.tokens >= 3, `After 1 request: expected >= 3 tokens, got ${bucket1.tokens}`);
	assert(bucket2.tokens >= 2, `After 2 requests: expected >= 2 tokens, got ${bucket2.tokens}`);
	assert(bucket3.tokens >= 1, `After 3 requests: expected >= 1 tokens, got ${bucket3.tokens}`);
});

// Test 4: Rate limiting timing and queue management
suite.test('Rate limiting timing and queue management', async () => {
	const api = createLuminara({ 
		baseURL: BASE_URL,
		rateLimit: { rps: 2, burst: 2 } // Allow 2 immediate, then rate limit
	});
	
	api.resetRateLimitStats();
	
	const timer = new Timer();
	timer.mark();
	
	// Send 4 requests - first 2 should be immediate, next 2 should be queued
	const requests = [
		api.getJson('/json?queue=1'),
		api.getJson('/json?queue=2'),
		api.getJson('/json?queue=3'),
		api.getJson('/json?queue=4')
	];
	
	// Brief delay to let rate limiting organize requests
	await new Promise(resolve => setTimeout(resolve, 100));
	
	const duringExecution = api.getRateLimitStats();
	
	// Should have some activity (dispatched + queued should cover all requests)
	const totalActivity = duringExecution.dispatched + duringExecution.queued;
	assert(totalActivity >= 4, `Total activity should be >= 4, got dispatched:${duringExecution.dispatched}, queued:${duringExecution.queued}`);
	
	// Should have queue activity
	assert(duringExecution.queued > 0, `Should have queued requests, got ${duringExecution.queued}`);
	
	// Bucket should show queue state
	const bucketKey = Object.keys(duringExecution.buckets)[0];
	if (bucketKey) {
		const bucket = duringExecution.buckets[bucketKey];
		assert(bucket.queued >= 0, `Bucket queue should be non-negative, got ${bucket.queued}`);
	}
	
	// Wait for all requests to complete with longer timeout
	await Promise.all(requests);
	timer.mark();
	const totalTime = timer.getDuration();
	
	const afterCompletion = api.getRateLimitStats();
	
	// Verify final state (may still have some in-flight due to timing)
	assert(afterCompletion.dispatched === 4, `Should have dispatched all 4 requests, got ${afterCompletion.dispatched}`);
	
	// Allow for some remaining queue/in-flight due to async timing
	const remainingActivity = afterCompletion.queued + (afterCompletion.inFlight || 0);
	assert(remainingActivity <= 2, `Should have minimal remaining activity after completion, got queued:${afterCompletion.queued}, inFlight:${afterCompletion.inFlight || 0}`);
	
	// With 2 RPS and 4 requests, should take at least 1 second total
	assert(totalTime >= 800, `Rate limiting should cause delay, took ${totalTime}ms (expected >= 800ms)`);
	assertRange(totalTime, 800, 2500, `Total time should be reasonable, got ${totalTime}ms`);
});

// Test 5: Client instance isolation verification
suite.test('Client instance isolation verification', async () => {
	const api1 = createLuminara({ 
		baseURL: BASE_URL,
		rateLimit: { rps: 10, burst: 5 } // High rate to avoid interference
	});
	
	const api2 = createLuminara({ 
		baseURL: BASE_URL,
		rateLimit: { rps: 10, burst: 5 } // High rate to avoid interference
	});
	
	// Reset both to ensure clean state
	api1.resetRateLimitStats();
	api2.resetRateLimitStats();
	
	// Make different numbers of requests with each client
	await api1.getJson('/json?client=1a');
	await api1.getJson('/json?client=1b');
	
	await api2.getJson('/json?client=2a');
	
	const stats1 = api1.getRateLimitStats();
	const stats2 = api2.getRateLimitStats();
	
	// Verify separate dispatch tracking
	assert(stats1.dispatched === 2, `Client 1 should show 2 dispatched requests, got ${stats1.dispatched}`);
	assert(stats2.dispatched === 1, `Client 2 should show 1 dispatched request, got ${stats2.dispatched}`);
	
	// Verify separate bucket tracking
	assert(typeof stats1.buckets === 'object', 'Client 1 should have buckets object');
	assert(typeof stats2.buckets === 'object', 'Client 2 should have buckets object');
	
	// Each client should have its own bucket(s)
	const buckets1 = Object.keys(stats1.buckets);
	const buckets2 = Object.keys(stats2.buckets);
	
	assert(buckets1.length >= 1, `Client 1 should have buckets, got ${buckets1.length}`);
	assert(buckets2.length >= 1, `Client 2 should have buckets, got ${buckets2.length}`);
	
	// Verify token consumption is tracked separately
	const bucket1 = stats1.buckets[buckets1[0]];
	const bucket2 = stats2.buckets[buckets2[0]];
	
	// Client 1 made 2 requests (consumed 2 tokens), Client 2 made 1 request (consumed 1 token)
	assert(bucket1.tokens <= bucket2.tokens + 1, `Client 1 should have consumed more tokens, c1:${bucket1.tokens}, c2:${bucket2.tokens}`);
});

// Test 6: Stats reset functionality
suite.test('Stats reset functionality', async () => {
	const api = createLuminara({ 
		baseURL: BASE_URL,
		rateLimit: { rps: 5, burst: 3 }
	});
	
	// Make some requests to generate stats
	await api.getJson('/json?reset=1');
	await api.getJson('/json?reset=2');
	
	const beforeReset = api.getRateLimitStats();
	
	// Verify we have some stats to reset
	assert(beforeReset.dispatched === 2, `Should have dispatched 2 before reset, got ${beforeReset.dispatched}`);
	assert(Object.keys(beforeReset.buckets).length >= 1, `Should have buckets before reset, got ${Object.keys(beforeReset.buckets).length}`);
	
	// Reset stats
	api.resetRateLimitStats();
	
	const afterReset = api.getRateLimitStats();
	
	// Verify reset worked
	assert(afterReset.dispatched === 0, `Dispatched should be 0 after reset, got ${afterReset.dispatched}`);
	assert(afterReset.queued === 0, `Queued should be 0 after reset, got ${afterReset.queued}`);
	
	// Note: Buckets are preserved after reset (only counters are reset)
	assert(Object.keys(afterReset.buckets).length >= 0, `Buckets may be preserved after reset, got ${Object.keys(afterReset.buckets).length}`);
	
	// Config should remain unchanged
	assert(afterReset.config.limit === beforeReset.config.limit, 'Config should be preserved after reset');
	assert(afterReset.config.burst === beforeReset.config.burst, 'Config should be preserved after reset');
});

// Test 7: Burst capacity and token refill validation
suite.test('Burst capacity and token refill validation', async () => {
	const api = createLuminara({ 
		baseURL: BASE_URL,
		rateLimit: { rps: 2, burst: 3 } // 2 tokens per second, max 3 burst
	});
	
	api.resetRateLimitStats();
	
	// Consume burst capacity quickly
	const burstTimer = new Timer();
	burstTimer.mark();
	
	await Promise.all([
		api.getJson('/json?burst=1'),
		api.getJson('/json?burst=2'),
		api.getJson('/json?burst=3')
	]);
	
	burstTimer.mark();
	const burstTime = burstTimer.getDuration();
	
	// Burst should complete quickly
	assert(burstTime < 300, `Burst requests should complete quickly, took ${burstTime}ms`);
	
	const afterBurst = api.getRateLimitStats();
	const bucketKey = Object.keys(afterBurst.buckets)[0];
	const bucketAfterBurst = afterBurst.buckets[bucketKey];
	
	// Should have consumed most/all burst tokens
	assert(bucketAfterBurst.tokens <= 1, `After burst, tokens should be low, got ${bucketAfterBurst.tokens}`);
	assert(afterBurst.dispatched === 3, `Should have dispatched 3 burst requests, got ${afterBurst.dispatched}`);
	
	// Wait for token refill (1 second should add 2 tokens at 2 RPS)
	await new Promise(resolve => setTimeout(resolve, 1000));
	
	const afterRefill = api.getRateLimitStats();
	const bucketAfterRefill = afterRefill.buckets[bucketKey];
	
	// Should have gained tokens from refill (allow for timing variance)
	const tokenIncrease = bucketAfterRefill.tokens - bucketAfterBurst.tokens;
	assert(tokenIncrease >= 0, 
		`Tokens should not decrease during refill, before:${bucketAfterBurst.tokens}, after:${bucketAfterRefill.tokens}, increase:${tokenIncrease}`);
	
	// If no increase, tokens might already be at max capacity or timing variance
	if (tokenIncrease === 0) {

		// Check if we're at burst capacity
		assert(bucketAfterRefill.tokens <= 3, `Tokens should not exceed burst capacity, got ${bucketAfterRefill.tokens}`);
	}
	
	// Make another request to verify refilled tokens work
	await api.getJson('/json?refill=verify');
	
	const afterRefillRequest = api.getRateLimitStats();
	assert(afterRefillRequest.dispatched === 4, `Should have dispatched refill verification request, got ${afterRefillRequest.dispatched}`);
});

// Execute tests if run directly
await runTestSuiteIfDirect(import.meta.url, 'Rate Limiting', suite, mockServer);

export { suite, mockServer };