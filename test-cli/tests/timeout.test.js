import { createLuminara } from '../../src/index.js';
import { TestSuite, MockServer, assert, assertRange, Timer } from '../testUtils.js';
import { runTestSuiteIfDirect } from '../runTestSuite.js';

const suite = new TestSuite('Timeout Handling');
const mockServer = new MockServer(4236);
const BASE_URL = `http://localhost:${mockServer.port}`;

// Test basic timeout functionality
suite.test('Request times out after specified duration', async () => {
	const api = createLuminara({
		baseURL: BASE_URL,
		timeout: 200 // 200ms timeout
	});
	
	const timer = new Timer();
	timer.mark();
	
	try {

		// Request 500ms delay, should timeout at 200ms
		await api.getJson('/json?delay=500');
		assert(false, 'Request should have timed out');
	} catch (error) {
		timer.mark();
		
		const duration = timer.getDuration();
		assertRange(duration, 180, 250, `Timeout should occur around 200ms, took ${duration}ms`);
		
		// Verify it's a timeout error
		assert(error.name === 'TimeoutError' || 
		       error.message.includes('timeout') ||
		       error.message.includes('aborted'), 
		       `Should be timeout error, got: ${error.message}`);
	}
});

suite.test('Request completes within timeout', async () => {
	const api = createLuminara({
		baseURL: BASE_URL,
		timeout: 300 // 300ms timeout
	});
	
	const timer = new Timer();
	timer.mark();
	
	// Request 100ms delay, should complete successfully
	const response = await api.getJson('/json?delay=100');
	
	timer.mark();
	
	const duration = timer.getDuration();
	assert(response.status === 200, 'Request should succeed');
	// Request delay: 100ms + base latency: 50-150ms = 150-250ms total
	assertRange(duration, 100, 350, `Request should complete in ~150-250ms, took ${duration}ms`);
});

suite.test('Different timeouts for different requests', async () => {
	const api = createLuminara({
		baseURL: BASE_URL

		// No default timeout
	});
	
	// Short timeout request
	const timer1 = new Timer();
	timer1.mark();
	
	try {
		await api.getJson('/json?delay=300', { timeout: 150 });
		assert(false, 'Short timeout request should fail');
	} catch (error) {
		timer1.mark();
		const duration1 = timer1.getDuration();
		assertRange(duration1, 130, 200, `Short timeout should be ~150ms, got ${duration1}ms`);
	}
	
	// Long timeout request
	const timer2 = new Timer();
	timer2.mark();
	
	const response = await api.getJson('/json?delay=200', { timeout: 400 });
	
	timer2.mark();
	
	const duration2 = timer2.getDuration();
	assert(response.status === 200, 'Long timeout request should succeed');
	// Request delay: 200ms + base latency: 50-150ms = 250-350ms total
	assertRange(duration2, 200, 400, `Long timeout request should complete in ~250-350ms, got ${duration2}ms`);
});

suite.test('Timeout with retry combination', async () => {
	const api = createLuminara({
		baseURL: BASE_URL,
		timeout: 150,
		retry: 2,
		retryDelay: 50
	});
	
	const timer = new Timer();
	timer.mark();
	
	try {

		// Native fetch doesn't retry timeout errors by default, so this will just timeout once
		await api.getJson('/json?delay=300');
		assert(false, 'Request should timeout');
	} catch (error) {
		timer.mark();
		
		const totalDuration = timer.getDuration();

		// Single timeout attempt: ~150ms + overhead (can be significant in test environment)
		assertRange(totalDuration, 120, 300, `Timeout should occur around 150ms, got ${totalDuration}ms`);
		
		// Verify it's a timeout error
		assert(error.name === 'TimeoutError' || 
		       error.message.includes('timeout') ||
		       error.message.includes('aborted'), 
		       `Should be timeout error, got: ${error.message}`);
	}
});

suite.test('Timeout overrides per-request', async () => {
	const api = createLuminara({
		baseURL: BASE_URL,
		timeout: 100 // Default 100ms timeout
	});
	
	// Override with longer timeout
	const timer = new Timer();
	timer.mark();
	
	const response = await api.getJson('/json?delay=150', { 
		timeout: 400 // Override to 400ms to account for base latency
	});
	
	timer.mark();
	
	const duration = timer.getDuration();
	assert(response.status === 200, 'Request with overridden timeout should succeed');
	// Request delay: 150ms + base latency: 50-150ms = 200-300ms total
	assertRange(duration, 150, 350, `Request should complete in ~200-300ms, got ${duration}ms`);
});

suite.test('Zero timeout disables timeout', async () => {
	const api = createLuminara({
		baseURL: BASE_URL,
		timeout: 0 // Disable timeout
	});
	
	const timer = new Timer();
	timer.mark();
	
	// Long delay should still complete
	const response = await api.getJson('/json?delay=400');
	
	timer.mark();
	
	const duration = timer.getDuration();
	assert(response.status === 200, 'Request should succeed with timeout disabled');
	// Request delay: 400ms + base latency: 50-150ms = 450-550ms total
	assertRange(duration, 400, 600, `Request should complete in ~450-550ms, got ${duration}ms`);
});

suite.test('Timeout error provides meaningful message', async () => {
	const api = createLuminara({
		baseURL: BASE_URL,
		timeout: 100
	});
	
	try {
		await api.getJson('/json?delay=300');
		assert(false, 'Should timeout');
	} catch (error) {

		// Check for meaningful timeout error message
		const message = error.message.toLowerCase();
		assert(message.includes('timeout') || 
		       message.includes('aborted') ||
		       message.includes('time') ||
		       error.name === 'TimeoutError',
		       `Timeout error should have meaningful message, got: ${error.message}`);
	}
});

suite.test('Timeout with POST request', async () => {
	const api = createLuminara({
		baseURL: BASE_URL,
		timeout: 150
	});
	
	const testData = { name: 'John', data: 'test payload' };
	
	const timer = new Timer();
	timer.mark();
	
	try {
		await api.postJson('/json?delay=300', testData);
		assert(false, 'POST request should timeout');
	} catch (error) {
		timer.mark();
		
		const duration = timer.getDuration();
		assertRange(duration, 130, 200, `POST timeout should be ~150ms, got ${duration}ms`);
	}
});

suite.test('Timeout with large response simulation', async () => {

	// Configure mock server to simulate slow response with large data
	const api = createLuminara({
		baseURL: BASE_URL,
		timeout: 200
	});
	
	const timer = new Timer();
	timer.mark();
	
	try {

		// Simulate large response that times out during transfer
		await api.getJson('/json?delay=300&size=large');
		assert(false, 'Large response should timeout');
	} catch (error) {
		timer.mark();
		
		const duration = timer.getDuration();
		assertRange(duration, 180, 250, `Large response timeout should be ~200ms, got ${duration}ms`);
	}
});

suite.test('Concurrent requests with different timeouts', async () => {
	const api = createLuminara({
		baseURL: BASE_URL
	});
	
	const startTime = Date.now();
	
	// Start three concurrent requests with different timeouts
	const promises = [
		api.getJson('/json?delay=100', { timeout: 300 }).catch(e => ({ error: e, type: 'fast' })),
		api.getJson('/json?delay=300', { timeout: 150 }).catch(e => ({ error: e, type: 'timeout' })),
		api.getJson('/json?delay=200', { timeout: 400 }).catch(e => ({ error: e, type: 'medium' }))
	];
	
	const results = await Promise.all(promises);
	const endTime = Date.now();
	const totalTime = endTime - startTime;
	
	// Should complete when the longest successful request finishes (~200ms)
	// Fast request: 100ms delay + base latency: 50-150ms = 150-250ms
	// Medium request: 200ms delay + base latency: 50-150ms = 250-350ms  
	// Timeout request: fails at 150ms
	// Total should be around 250-350ms (medium request completion time)
	assertRange(totalTime, 220, 400, `Concurrent requests should complete in ~250-350ms, took ${totalTime}ms`);
	
	// First request should succeed
	assert(!results[0].error, 'Fast request should succeed');
	assert(results[0].status === 200, 'Fast request should return 200');
	
	// Second request should timeout
	assert(results[1].error, 'Timeout request should fail');
	assert(results[1].type === 'timeout', 'Should be the timeout request');
	
	// Third request should succeed
	assert(!results[2].error, 'Medium request should succeed');
	assert(results[2].status === 200, 'Medium request should return 200');
});

suite.test('Timeout inheritance in method wrappers', async () => {
	const api = createLuminara({
		baseURL: BASE_URL,
		timeout: 120
	});
	
	// Test that different HTTP methods inherit timeout
	const methods = [
		() => api.getText('/text?delay=200'),
		() => api.getJson('/json?delay=200'),
		() => api.postJson('/json?delay=200', {}),
		() => api.putJson('/json?delay=200', {}),
		() => api.patchJson('/json?delay=200', {}),
		() => api.del('/json?delay=200')  // Use del method instead of non-existent deleteJson
	];
	
	let timeoutCount = 0;
	
	for (const method of methods) {
		const timer = new Timer();
		timer.mark();
		
		try {
			await method();
			assert(false, 'Method should timeout');
		} catch (error) {
			timer.mark();
			timeoutCount++;
			
			const duration = timer.getDuration();
			assertRange(duration, 100, 160, `Method should timeout at ~120ms, got ${duration}ms`);
		}
	}
	
	assert(timeoutCount === 6, `All 6 methods should timeout, ${timeoutCount} timed out`);
});

// Run tests if this file is executed directly
await runTestSuiteIfDirect(import.meta.url, 'Timeout Handling', suite, mockServer);

export { suite, mockServer };
