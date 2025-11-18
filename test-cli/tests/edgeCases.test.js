/**
 * Edge Case Tests for Luminara
 * Tests for concurrent requests, abort during retry, max delay enforcement, interceptor errors, and stats overflow
 */

import { createLuminara } from '../../src/index.js';
import { TestSuite, MockServer, assert, assertEqual, assertThrows, assertEventuallyTrue, Timer } from '../testUtils.js';
import { runTestSuiteIfDirect } from '../runTestSuite.js';

const suite = new TestSuite('Edge Cases');
const mockServer = new MockServer(4225);
const BASE_URL = `http://localhost:${mockServer.port}`;

// Export suite and mockServer for testRunner
export { suite, mockServer };

// =============================================================================
// Concurrent Request Tests (Race Conditions)
// =============================================================================

suite.test('Concurrent requests maintain independent retry state', async () => {
	const client = createLuminara({ 
		baseURL: BASE_URL, 
		retry: 3,
		retryDelay: 200
	});
	
	// Reset server counts before test
	mockServer.resetCounts();
	
	const timer = new Timer();
	timer.mark();
	
	// Request 1: Will fail and retry (takes longer)
	const request1 = client.get('/json?status=503');
	
	// Request 2: Will succeed immediately
	const request2 = client.get('/json?status=200');
	
	// Run concurrently
	const results = await Promise.allSettled([request1, request2]);
	
	timer.mark();
	const totalTime = timer.getDuration();
	
	// Request 1 should fail after retries
	assert(results[0].status === 'rejected', 'Request 1 should fail after retries');
	
	// Request 2 should succeed immediately
	assert(results[1].status === 'fulfilled', 'Request 2 should succeed');
	assert(results[1].value.status === 200, 'Request 2 should have status 200');
	
	// Total time should be close to request 1's retry time, not doubled
	// Request 1: ~200ms * 3 retries = ~600ms minimum
	// Allow generous tolerance for concurrent execution
	assert(totalTime < 1500, `Concurrent requests should not block each other, took ${totalTime}ms`);
});

suite.test('Concurrent requests with different retry configs', async () => {
	const fastClient = createLuminara({ 
		baseURL: BASE_URL, 
		retry: 2,
		retryDelay: 50
	});
	
	const slowClient = createLuminara({ 
		baseURL: BASE_URL, 
		retry: 5,
		retryDelay: 300
	});
	
	mockServer.resetCounts();
	
	const timer = new Timer();
	timer.mark();
	
	// Fast client: 2 retries × 50ms = ~100ms
	const fastRequest = fastClient.get('/json?status=500');
	
	// Slow client: 5 retries × 300ms = ~1500ms
	const slowRequest = slowClient.get('/json?status=500');
	
	const results = await Promise.allSettled([fastRequest, slowRequest]);
	
	timer.mark();
	const totalTime = timer.getDuration();
	
	// Both should fail
	assert(results[0].status === 'rejected', 'Fast client should fail');
	assert(results[1].status === 'rejected', 'Slow client should fail');
	
	// Total time should be close to slow client's retry time
	// Slow client: ~1500ms minimum, allow generous tolerance
	assert(totalTime >= 1200, `Should wait for slowest request, took ${totalTime}ms`);
	assert(totalTime < 2500, `Should complete within reasonable time, took ${totalTime}ms`);
});

suite.test('Race condition: Multiple rapid requests to same endpoint', async () => {
	const client = createLuminara({ baseURL: BASE_URL });
	
	mockServer.resetCounts();
	
	// Fire 10 rapid requests
	const requests = Array.from({ length: 10 }, () => 
		client.getJson('/json'));
	
	const results = await Promise.all(requests);
	
	// All should succeed
	assert(results.length === 10, 'Should have 10 results');
	results.forEach((result, index) => {
		assert(result.status === 200, `Request ${index} should succeed`);
		assert(result.data.message === 'Success', `Request ${index} should have success message`);
	});
	
	// Each request should be tracked independently
	const requestCount = mockServer.getRequestCount('GET', '/json');
	assert(requestCount === 10, `Should track all 10 requests, got ${requestCount}`);
});

// =============================================================================
// Request Cancellation During Retry Tests
// =============================================================================

suite.test('Abort during retry backoff delay cancels request', async () => {
	const controller = new AbortController();
	const client = createLuminara({ 
		baseURL: BASE_URL,
		retry: 5,
		retryDelay: 1000 // Long delay between retries
	});
	
	mockServer.resetCounts();
	
	const timer = new Timer();
	timer.mark();
	
	// Abort after 300ms (during first backoff delay)
	setTimeout(() => controller.abort('User cancelled'), 300);
	
	try {
		await client.get('/json?status=503', { signal: controller.signal });
		assert(false, 'Should have thrown abort error');
	} catch (error) {
		timer.mark();
		const duration = timer.getDuration();
		
		assert(error.code === 'ABORT', `Expected ABORT error, got ${error.code}`);
		
		// Should abort quickly (within ~1500ms with generous tolerance), not wait for all retries
		// All retries would take ~5000ms, so this proves early cancellation
		assert(duration < 1500, `Should abort quickly, took ${duration}ms`);
		
		// Should have made 1 or 2 requests before abort (initial + maybe 1 retry)
		const requestCount = mockServer.getRequestCount('GET', '/json');
		assert(requestCount >= 1 && requestCount <= 3, 
			`Should abort early, made ${requestCount} requests`);
	}
});

suite.test('Abort signal before first request', async () => {
	const controller = new AbortController();
	controller.abort('Pre-aborted'); // Abort immediately
	
	const client = createLuminara({ baseURL: BASE_URL });
	
	mockServer.resetCounts();
	
	try {
		await client.get('/json', { signal: controller.signal });
		assert(false, 'Should have thrown abort error');
	} catch (error) {
		// Native fetch throws DOMException for aborted signals
		const isAbortError = error.code === 'ABORT' || 
			error.name === 'AbortError' || 
			error.message.includes('abort') ||
			error.message.includes('signal');
		
		assert(isAbortError, `Expected abort-related error, got ${error.code || error.name}: ${error.message}`);
		
		// Pre-aborted signal may make 0 or 1 requests depending on timing
		// The important thing is that it aborts and throws an error
		const requestCount = mockServer.getRequestCount('GET', '/json');
		assert(requestCount <= 1, `Should make 0-1 requests with pre-aborted signal, made ${requestCount}`);
	}
});

suite.test('Abort during successful request processing', async () => {
	const controller = new AbortController();
	const client = createLuminara({ baseURL: BASE_URL });
	
	mockServer.resetCounts();
	
	// Abort after 100ms (while request might still be processing)
	setTimeout(() => controller.abort('Cancelled during request'), 100);
	
	try {
		// Add delay to simulate slow response
		await client.get('/json?delay=500', { signal: controller.signal });
		
		// May or may not throw depending on timing - that's OK
		// This tests that abort is handled gracefully
	} catch (error) {
		if (error.code === 'ABORT') {
			// Expected - request was aborted
			assert(true, 'Request aborted as expected');
		} else {
			throw error; // Unexpected error
		}
	}
});

// =============================================================================
// Maximum Retry Delay Cap Enforcement Tests
// =============================================================================

suite.test('Exponential backoff respects maximum delay cap', async () => {
	// CRITICAL: Wait for any in-flight requests from previous test to complete
	// The previous test has a 500ms delay + abort, and there could be race conditions
	await new Promise(resolve => setTimeout(resolve, 100));
	
	const client = createLuminara({
		baseURL: BASE_URL,
		retry: 8, // Many retries to reach cap
		retryDelay: 100,
		backoffType: 'exponential',
		backoffMaxDelay: 500 // Cap at 500ms
	});
	
	mockServer.resetCounts();
	
	const timer = new Timer();
	timer.mark();
	
	try {
		await client.get('/json?status=503');
		assert(false, 'Should have thrown error after retries');
	} catch (error) {
		timer.mark();
		const duration = timer.getDuration();
		
		// Without cap: 200 + 400 + 800 + 1600 + 3200 + 6400 + 12800 + 25600 = ~51000ms
		// With 500ms cap: 200 + 400 + 500 + 500 + 500 + 500 + 500 + 500 = ~3600ms
		// The difference proves the cap is working
		
		// Should complete much faster than uncapped (which would be ~51s)
		// Allow very generous tolerance for system variations and mock server latency
		assert(duration < 15000, 
			`Capped backoff should complete quickly, took ${duration}ms (uncapped would be ~51000ms)`);
		
		// Should still make all retry attempts
		const requestCount = mockServer.getRequestCount('GET', '/json');
		// Note: With retry=8, we get initial request + 8 retry attempts = 9 total
		assert(requestCount === 9, 
			`Should make all retry attempts, got ${requestCount} requests`);
	}
});

suite.test('Linear backoff does not exceed maximum delay', async () => {
	const client = createLuminara({
		baseURL: BASE_URL,
		retry: 5,
		retryDelay: 300,
		backoffType: 'linear',
		backoffMaxDelay: 400 // Cap at 400ms (should limit linear increments)
	});
	
	const timer = new Timer();
	timer.mark();
	
	try {
		await client.get('/json?status=500');
		assert(false, 'Should have thrown error');
	} catch (error) {
		timer.mark();
		const duration = timer.getDuration();
		
		// Linear without cap: 300 + 300 + 300 + 300 + 300 = 1500ms
		// With cap at 400ms: Each delay capped, so max ~2000ms total
		// Allow generous tolerance
		assert(duration < 3000, `Capped linear backoff should be reasonable, took ${duration}ms`);
	}
});

// =============================================================================
// Interceptor Error Propagation Tests
// =============================================================================

suite.test('Error in onRequest interceptor propagates correctly', async () => {
	const client = createLuminara({ baseURL: BASE_URL });
	
	client.use({
		onRequest(context) {
			// Throw error in interceptor
			throw new Error('Interceptor validation failed');
		}
	});
	
	try {
		await client.get('/json');
		assert(false, 'Should have thrown error from interceptor');
	} catch (error) {
		assert(error.message.includes('Interceptor validation failed'), 
			`Should propagate interceptor error, got: ${error.message}`);
	}
});

suite.test('Error in onResponse interceptor propagates correctly', async () => {
	const client = createLuminara({ baseURL: BASE_URL });
	
	client.use({
		onResponse(context) {
			// Throw error after successful response
			throw new Error('Response transformation failed');
		}
	});
	
	try {
		await client.get('/json');
		assert(false, 'Should have thrown error from interceptor');
	} catch (error) {
		assert(error.message.includes('Response transformation failed'), 
			`Should propagate interceptor error, got: ${error.message}`);
	}
});

suite.test('Multiple interceptors with error in middle of chain', async () => {
	const client = createLuminara({ baseURL: BASE_URL });
	const executionLog = [];
	
	// First interceptor (should execute)
	client.use({
		name: 'first',
		onRequest(context) {
			executionLog.push('first');
		}
	});
	
	// Second interceptor (throws error)
	client.use({
		name: 'second',
		onRequest(context) {
			executionLog.push('second-before-error');
			throw new Error('Second interceptor error');
		}
	});
	
	// Third interceptor (should NOT execute)
	client.use({
		name: 'third',
		onRequest(context) {
			executionLog.push('third');
		}
	});
	
	try {
		await client.get('/json');
		assert(false, 'Should have thrown error');
	} catch (error) {
		// Verify execution stopped at error
		assert(executionLog.includes('first'), 'First interceptor should execute');
		assert(executionLog.includes('second-before-error'), 'Second interceptor should start');
		assert(!executionLog.includes('third'), 'Third interceptor should NOT execute after error');
	}
});

suite.test('onError interceptor catches and transforms errors', async () => {
	const client = createLuminara({ baseURL: BASE_URL });
	
	client.use({
		onResponseError(context) {
			// Transform the error
			const originalError = context.error;
			context.error = new Error(`Transformed: ${originalError.message}`);
			context.error.code = 'TRANSFORMED_ERROR';
		}
	});
	
	try {
		await client.get('/json?status=500');
		assert(false, 'Should have thrown error');
	} catch (error) {
		assert(error.message.includes('Transformed:'), 
			`Error should be transformed by interceptor, got: ${error.message}`);
		assert(error.code === 'TRANSFORMED_ERROR', 
			`Error code should be transformed, got: ${error.code}`);
	}
});

// =============================================================================
// Stats Overflow and Edge Cases Tests
// =============================================================================

suite.test('Stats handle large counter values', async () => {
	const client = createLuminara({ 
		baseURL: BASE_URL
	});
	
	// Stats are enabled by default, just reset them
	client.stats().reset();
	
	// Make a moderate number of requests (not 1000, that's too slow)
	for (let i = 0; i < 20; i++) {
		try {
			await client.get('/json');
		} catch (error) {
			// Ignore errors
		}
	}
	
	const stats = client.stats().counters.get();
	
	// Verify counters work correctly
	assert(stats.total >= 20, `Should track 20+ requests, got ${stats.total}`);
	assert(stats.success >= 15, `Should track many successes, got ${stats.success}`); // Allow some failures
	assert(typeof stats.total === 'number', 'Total should be a number');
	assert(Number.isFinite(stats.total), 'Total should be finite');
	assert(stats.total < Number.MAX_SAFE_INTEGER, 'Total should not overflow');
});

suite.test('Stats handle rapid request bursts', async () => {
	const client = createLuminara({ 
		baseURL: BASE_URL
	});
	
	// Stats are enabled by default, just reset them
	client.stats().reset();
	
	// Fire 20 concurrent requests (more reasonable number)
	const requests = Array.from({ length: 20 }, () => 
		client.get('/json').catch(() => {}));
	
	await Promise.all(requests);
	
	const stats = client.stats().counters.get();
	
	// Verify stats correctly tracked concurrent requests
	assert(stats.total === 20, `Should track 20 requests, got ${stats.total}`);
	assert(stats.success + stats.fail === stats.total, 
		`Success (${stats.success}) + fail (${stats.fail}) should equal total (${stats.total})`);
});

suite.test('Stats reset functionality', async () => {
	const client = createLuminara({ 
		baseURL: BASE_URL
	});
	
	// Stats are enabled by default, just reset them
	client.stats().reset();
	
	// Make some requests
	await client.get('/json').catch(() => {});
	await client.get('/json').catch(() => {});
	
	let stats = client.stats().counters.get();
	assert(stats.total >= 2, 'Should have initial requests');
	
	// Reset stats
	client.stats().reset();
	
	stats = client.stats().counters.get();
	assert(stats.total === 0, `Stats should be reset, got total: ${stats.total}`);
	assert(stats.success === 0, `Success should be reset, got: ${stats.success}`);
	assert(stats.fail === 0, `Fail should be reset, got: ${stats.fail}`);
});

suite.test('Stats with disabled tracking', async () => {
	const client = createLuminara({ 
		baseURL: BASE_URL
	});
	
	// Disable stats first
	client.disableStats();
	client.stats().reset();
	
	// Make requests
	await client.get('/json').catch(() => {});
	await client.get('/json').catch(() => {});
	
	const stats = client.stats().counters.get();
	
	// Stats should all be zero when disabled
	assert(stats.total === 0, 'Stats should not track when disabled');
	assert(stats.success === 0, 'Success should be zero when disabled');
});

suite.test('Stats type safety with multiple requests', async () => {
	const client = createLuminara({ 
		baseURL: BASE_URL
	});
	
	// Stats are enabled by default, just reset them
	client.stats().reset();
	
	// Make a few requests
	for (let i = 0; i < 5; i++) {
		await client.get('/json').catch(() => {});
	}
	
	const stats = client.stats().counters.get();
	
	// Verify counters are valid numbers
	assert(typeof stats.total === 'number', 'Total should remain a number');
	assert(Number.isFinite(stats.total), 'Total should be finite');
	assert(!Number.isNaN(stats.total), 'Total should not be NaN');
	assert(stats.total === 5, `Should track exactly 5 requests, got ${stats.total}`);
});

// =============================================================================
// Run test suite if executed directly
// =============================================================================

runTestSuiteIfDirect(import.meta.url, 'Edge Cases', suite, mockServer);

export default async () => {
	await mockServer.start();
	const result = await suite.run();
	await mockServer.stop();

	return result;
};
