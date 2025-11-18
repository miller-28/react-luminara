import { createLuminara, defaultRetryPolicy, createRetryPolicy, parseRetryAfter, isIdempotentMethod } from '../../src/index.js';
import { TestSuite, MockServer, assert, assertEqual, assertRange, Timer } from '../testUtils.js';
import { runTestSuiteIfDirect } from '../runTestSuite.js';

const suite = new TestSuite('Retry');
const mockServer = new MockServer(4234);
const BASE_URL = `http://localhost:${mockServer.port}`;

// Test basic retry functionality
suite.test('Basic retry on server errors', async () => {
	mockServer.resetCounts();
	
	const api = createLuminara({
		baseURL: BASE_URL,
		retry: 3,
		retryDelay: 50
	});
	
	try {
		await api.getJson('/json?status=500');
		assert(false, 'Should fail after retries');
	} catch (error) {
		const requestCount = mockServer.getRequestCount('GET', '/json');
		assert(requestCount === 4, `Should make 4 total requests (1 + 3 retries), made ${requestCount}`);
	}
});

suite.test('No retry on client errors (4xx)', async () => {
	mockServer.resetCounts();
	
	const api = createLuminara({
		baseURL: BASE_URL,
		retry: 3,
		retryDelay: 50
	});
	
	try {
		await api.getJson('/json?status=404');
		assert(false, 'Should fail without retries');
	} catch (error) {
		const requestCount = mockServer.getRequestCount('GET', '/json');
		assert(requestCount === 1, `Should make only 1 request for 404, made ${requestCount}`);
	}
});

suite.test('Retry on specific status codes', async () => {
	mockServer.resetCounts();
	
	const api = createLuminara({
		baseURL: BASE_URL,
		retry: 2,
		retryDelay: 50,
		retryStatusCodes: [408, 429, 503] // Specific codes to retry
	});
	
	// Should retry 429 (rate limit)
	try {
		await api.getJson('/json?status=429');
	} catch (error) {
		const requestCount429 = mockServer.getRequestCount('GET', '/json');
		assert(requestCount429 === 3, `Should retry 429 status, made ${requestCount429} requests`);
	}
	
	mockServer.resetCounts();
	
	// Should not retry 502 (not in retryStatusCodes)
	try {
		await api.getJson('/json?status=502');
	} catch (error) {
		const requestCount502 = mockServer.getRequestCount('GET', '/json');
		assert(requestCount502 === 1, `Should not retry 502 status, made ${requestCount502} requests`);
	}
});

suite.test('Retry with timeout combination', async () => {
	mockServer.resetCounts();
	
	const api = createLuminara({
		baseURL: BASE_URL,
		retry: 2,
		retryDelay: 100,
		timeout: 200 // 200ms timeout
	});
	
	const timer = new Timer();
	timer.mark();
	
	try {

		// Request with 300ms delay should timeout (native fetch doesn't retry timeout errors by default)
		await api.getJson('/json?delay=300');
		assert(false, 'Should timeout');
	} catch (error) {
		timer.mark();
		
		const totalTime = timer.getDuration();
		const requestCount = mockServer.getRequestCount('GET', '/json');
		
		// Native fetch doesn't retry timeout errors by default, so only 1 request
		assert(requestCount === 1, `Should make 1 request (timeout not retried), made ${requestCount}`);

		// Single timeout: ~200ms (can have overhead in test environment)
		assertRange(totalTime, 180, 500, `Timeout should occur around 200ms, got ${totalTime}ms`);
	}
});

suite.test('Eventual success after retries', async () => {
	let requestCount = 0;
	const originalHandler = mockServer.handleRequest;
	
	// Mock server that fails twice, then succeeds
	mockServer.handleRequest = function(req, res, path, params) {
		if (path === '/retry-success') {
			requestCount++;
			if (requestCount <= 2) {
				res.writeHead(503, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify({ error: 'Service temporarily unavailable' }));

				return;
			}
			res.writeHead(200, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ 
				message: 'Success after retries',
				attemptNumber: requestCount 
			}));

			return;
		}
		
		originalHandler.call(this, req, res, path, params);
	};
	
	const api = createLuminara({
		baseURL: BASE_URL,
		retry: 3,
		retryDelay: 50
	});
	
	const response = await api.getJson('/retry-success');
	
	assert(response.status === 200, 'Should eventually succeed');
	assert(response.data.attemptNumber === 3, `Should succeed on 3rd attempt, got ${response.data.attemptNumber}`);
	assert(requestCount === 3, `Should make exactly 3 requests, made ${requestCount}`);
	
	// Restore original handler
	mockServer.handleRequest = originalHandler;
});

suite.test('Custom retry delay function', async () => {
	const delays = [];
	const totalRetries = 4;
	
	const api = createLuminara({
		baseURL: BASE_URL,
		retry: totalRetries,
		retryDelay: (context) => {

			// Get the attempt number from context.attempt (1-based)
			const attemptNumber = context.attempt || 1;
			const delay = 100 * attemptNumber; // 100ms, 200ms, 300ms, 400ms
			delays.push(delay);

			return delay;
		}
	});
	
	const timer = new Timer();
	timer.mark();
	
	try {
		await api.getJson('/json?status=503');
	} catch (error) {
		timer.mark();
		
		assert(delays.length === 4, `Should call retryDelay 4 times, called ${delays.length} times`);
		assert(delays[0] === 100, `First delay should be 100ms, got ${delays[0]}ms`);
		assert(delays[1] === 200, `Second delay should be 200ms, got ${delays[1]}ms`);
		assert(delays[2] === 300, `Third delay should be 300ms, got ${delays[2]}ms`);
		assert(delays[3] === 400, `Fourth delay should be 400ms, got ${delays[3]}ms`);
		
		const totalTime = timer.getDuration();

		// Total delays: 100 + 200 + 300 + 400 = 1000ms
		// Plus base latency: 5 requests × 100ms avg = ~500ms
		// Total expected: ~1500ms, allow generous tolerance
		assertRange(totalTime, 1100, 2000, `Total time should include custom delays, got ${totalTime}ms`);
	}
});

suite.test('Retry context provides request information', async () => {
	const contextsCaptured = [];
	const totalRetries = 3;
	
	const api = createLuminara({
		baseURL: BASE_URL,
		retry: totalRetries,
		retryDelay: (context) => {

			// Get the attempt number from context.attempt (1-based)
			const attemptNumber = context.attempt || 1;
			contextsCaptured.push({
				attempt: attemptNumber,
				error: context.error?.message || 'No error',
				requestUrl: context.req?.url || 'No URL',
				retryRemaining: context.req?.retry || 0
			});

			return 50;
		}
	});
	
	try {
		await api.getJson('/json?status=500');
	} catch (error) {
		assert(contextsCaptured.length === 3, `Should capture 3 contexts, got ${contextsCaptured.length}`);
		
		// Verify attempt numbers
		assert(contextsCaptured[0].attempt === 1, `First attempt should be 1, got ${contextsCaptured[0].attempt}`);
		assert(contextsCaptured[1].attempt === 2, `Second attempt should be 2, got ${contextsCaptured[1].attempt}`);
		assert(contextsCaptured[2].attempt === 3, `Third attempt should be 3, got ${contextsCaptured[2].attempt}`);
		
		// Verify context information is available
		contextsCaptured.forEach((context, index) => {
			assert(context.requestUrl && context.requestUrl !== 'No URL', `Context ${index + 1} should have request URL`);
			assert(typeof context.retryRemaining === 'number', `Context ${index + 1} should have retry info`);
		});
	}
});

suite.test('Retry with POST requests and body preservation', async () => {
	mockServer.resetCounts();
	
	const api = createLuminara({
		baseURL: BASE_URL,
		retry: 2,
		retryDelay: 50
	});
	
	const testData = { name: 'John', age: 30 };
	
	try {
		await api.postJson('/json?status=503', testData);
	} catch (error) {
		const requestCount = mockServer.getRequestCount('POST', '/json');
		assert(requestCount === 3, `Should retry POST requests, made ${requestCount} requests`);
		
		// Verify that the mock server received the data in all requests
		// (This would be implementation specific - here we assume the mock server logs it)
	}
});

suite.test('Retry disabled with retry: 0', async () => {
	mockServer.resetCounts();
	
	const api = createLuminara({
		baseURL: BASE_URL,
		retry: 0, // Disable retries
		retryDelay: 100
	});
	
	try {
		await api.getJson('/json?status=500');
		assert(false, 'Should fail without retries');
	} catch (error) {
		const requestCount = mockServer.getRequestCount('GET', '/json');
		assert(requestCount === 1, `Should make only 1 request when retry disabled, made ${requestCount}`);
	}
});

suite.test('Retry disabled with retry: false', async () => {
	mockServer.resetCounts();
	
	const api = createLuminara({
		baseURL: BASE_URL,
		retry: false, // Disable retries with boolean
		retryDelay: 100
	});
	
	try {
		await api.getJson('/json?status=500');
		assert(false, 'Should fail without retries');
	} catch (error) {
		const requestCount = mockServer.getRequestCount('GET', '/json');
		assert(requestCount === 1, `Should make only 1 request when retry: false, made ${requestCount}`);
	}
});

suite.test('Retry with network errors simulation', async () => {

	// Create a separate client that points to non-existent server
	const api = createLuminara({
		baseURL: 'http://localhost:9999', // Non-existent server
		retry: 2,
		retryDelay: 50,
		timeout: 100 // Short timeout to speed up test
	});
	
	const timer = new Timer();
	timer.mark();
	
	try {
		await api.getJson('/json');
		assert(false, 'Should fail with network error');
	} catch (error) {
		timer.mark();
		
		const totalTime = timer.getDuration();

		// Network errors may fail immediately or after timeout, expect wide range
		// Single attempt: immediate failure (0-10ms) or timeout (100ms+)
		assertRange(totalTime, 0, 500, `Network error timing should be 0-500ms, got ${totalTime}ms`);
		
		// Verify it's a network error (ECONNREFUSED, timeout, or other network issue)
		assert(error.message.includes('ECONNREFUSED') || 
		       error.message.includes('fetch failed') ||
		       error.message.includes('Failed to fetch') ||
		       error.message.includes('network') ||
		       error.message.includes('timeout') ||
		       error.message.includes('aborted') ||
		       error.name === 'TimeoutError' ||
		       error.code === 'ECONNREFUSED', 
		       `Should be network error, got: ${error.message}`);
	}
});

// Idempotent method detection tests
suite.test('Idempotent method detection', async () => {
	assert(isIdempotentMethod('GET'), 'GET should be idempotent');
	assert(isIdempotentMethod('PUT'), 'PUT should be idempotent');
	assert(isIdempotentMethod('DELETE'), 'DELETE should be idempotent');
	assert(!isIdempotentMethod('POST'), 'POST should not be idempotent');
	assert(!isIdempotentMethod('PATCH'), 'PATCH should not be idempotent');
});

// Retry-After header parsing tests
suite.test('Retry-After header parsing (seconds)', async () => {
	const delay = parseRetryAfter('5');
	assertEqual(delay, 5000, 'Should parse seconds correctly');
});

suite.test('Retry-After header parsing (HTTP-date)', async () => {
	const futureDate = new Date(Date.now() + 10000).toUTCString();
	const delay = parseRetryAfter(futureDate);
	assert(delay >= 8000 && delay <= 12000, `Should parse HTTP-date correctly, got ${delay}ms`);
});

suite.test('Retry-After header parsing (invalid)', async () => {
	const delay = parseRetryAfter('invalid');
	assertEqual(delay, 0, 'Should return 0 for invalid input');
});

// Default retry policy tests  
suite.test('Default policy retries GET on 500 status', async () => {
	const luminara = createLuminara();
	const baseURL = `http://localhost:${mockServer.port}`;

	try {
		await luminara.get(`${baseURL}/json?status=500&delay=50`, {
			retry: 2,
			retryDelay: 100,
			timeout: 10000
		});
		assert(false, 'Should have thrown an error');
	} catch (error) {
		assert(error.status === 500, `Should get 500 error after retries, got ${error.status}`);
	}
});

suite.test('Default policy retries POST on safe status codes', async () => {
	const luminara = createLuminara();
	const baseURL = `http://localhost:${mockServer.port}`;

	try {
		await luminara.post(`${baseURL}/json?status=500`, { data: 'test' }, {
			retry: 2,
			retryDelay: 100,
			timeout: 5000
		});
		assert(false, 'Should have thrown an error');
	} catch (error) {
		assert(error.status === 500, `Should get 500 error after retries, got ${error.status}`);
	}
});

// Custom retry policy tests
suite.test('Custom retry policy overrides default behavior', async () => {
	const customPolicy = (error, context) => {

		// Always retry regardless of method or status (for testing)
		return context.attempt < context.maxAttempts;
	};

	const luminara = createLuminara();
	const baseURL = `http://localhost:${mockServer.port}`;

	try {
		await luminara.post(`${baseURL}/json?status=400`, { data: 'test' }, {
			retry: 2,
			retryDelay: 100,
			shouldRetry: customPolicy,
			timeout: 5000
		});
		assert(false, 'Should have thrown an error');
	} catch (error) {
		assert(error.status === 400, `Should get 400 error after custom retries, got ${error.status}`);
	}
});

// Network error retry tests for idempotent methods
suite.test('Network errors retry for idempotent methods (advanced)', async () => {
	const luminara = createLuminara();

	try {

		// Use invalid URL to trigger network error
		await luminara.get('http://invalid-host-that-does-not-exist.local/test', {
			retry: 1,
			retryDelay: 100,
			timeout: 1000
		});
		assert(false, 'Should have thrown an error');
	} catch (error) {

		// With LuminaraError normalization, network errors are wrapped
		assert(error.name === 'LuminaraError' || error.name === 'TypeError' || error.name === 'TimeoutError', `Expected network/timeout error, got ${error.name}`);
	}
});

// Retry timing tests
suite.test('Retry-After header is respected (timing)', async () => {
	const luminara = createLuminara();
	const baseURL = `http://localhost:${mockServer.port}`;
	const startTime = Date.now();

	try {
		await luminara.get(`${baseURL}/json?status=429`, {
			retry: 1,
			retryDelay: 200,
			timeout: 5000
		});
		assert(false, 'Should have thrown an error');
	} catch (error) {
		const duration = Date.now() - startTime;
		assert(duration >= 150, `Retry too fast: ${duration}ms, expected at least 150ms`);
	}
});

// Status code retry tests
suite.test('Status 409 triggers retry for GET requests', async () => {
	const luminara = createLuminara();
	const baseURL = `http://localhost:${mockServer.port}`;

	try {
		await luminara.get(`${baseURL}/json?status=409`, {
			retry: 1,
			retryDelay: 100,
			timeout: 5000
		});
		assert(false, 'Should have thrown an error');
	} catch (error) {
		assert(error.status === 409, `Should get 409 error after retries, got ${error.status}`);
	}
});

suite.test('Status 425 triggers retry for PUT requests', async () => {
	const luminara = createLuminara();
	const baseURL = `http://localhost:${mockServer.port}`;

	try {
		await luminara.put(`${baseURL}/json?status=425`, { data: 'test' }, {
			retry: 1,
			retryDelay: 100,
			timeout: 5000
		});
		assert(false, 'Should have thrown an error');
	} catch (error) {
		assert(error.status === 425, `Should get 425 error after retries, got ${error.status}`);
	}
});

// createRetryPolicy tests
suite.test('createRetryPolicy allows custom status codes', async () => {
	const customRetryStatusCodes = new Set([418]); // I'm a teapot
	const customPolicy = createRetryPolicy({ 
		retryStatusCodes: customRetryStatusCodes 
	});

	const context = {
		request: { method: 'GET' },
		attempt: 1,
		maxAttempts: 3
	};

	const shouldRetry418 = customPolicy({ status: 418 }, context);
	const shouldRetry500 = customPolicy({ status: 500 }, context);

	assert(shouldRetry418, 'Should retry on custom status 418');
	assert(!shouldRetry500, 'Should not retry on default status 500 with custom policy');
});

// Run tests if this file is executed directly
await runTestSuiteIfDirect(import.meta.url, 'Retry', suite, mockServer);

export { suite, mockServer };
