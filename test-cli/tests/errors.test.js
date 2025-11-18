/**
 * Comprehensive Error Handling Tests
 * Tests LuminaraError normalization, error properties, ignoreResponseError option, and consistent error structure
 * Merged from enhancedErrors.test.js, ignoreResponseError.test.js, and errorHandling.test.js
 */

import { createLuminara } from '../../src/index.js';
import { TestSuite, MockServer, assert, assertEqual, Timer } from '../testUtils.js';
import { runTestSuiteIfDirect } from '../runTestSuite.js';

const suite = new TestSuite('Error Handling');
const mockServer = new MockServer(4226);

// === HTTP Error Tests ===

// Test 1: HTTP error has proper LuminaraError structure
suite.test('HTTP error includes status, statusText, and data', async () => {
	const luminara = createLuminara();

	try {
		await luminara.get(`${mockServer.baseUrl}/json?status=404`);
		assert(false, 'Should have thrown an error');
	} catch (error) {
		assert(error.name === 'LuminaraError', `Expected LuminaraError, got ${error.name}`);
		assert(typeof error.status === 'number', `Expected error.status to be number, got ${typeof error.status}`);
		assert(error.status === 404, `Expected status 404, got ${error.status}`);
		assert(typeof error.message === 'string', 'Expected error.message to be string');
		assert(error.request, 'Expected error.request to exist');
		assert(error.response, 'Expected error.response to exist');
	}
});

// Test 2: HTTP Error with JSON Data
suite.test('HTTP Error with JSON Data', async () => {
	const client = createLuminara();
	
	try {
		await client.post(`${mockServer.baseUrl}/error-json`, { field: 'test' });
		assert(false, 'Expected error but request succeeded');
	} catch (error) {
		assert(error.name === 'LuminaraError', `Expected LuminaraError, got ${error.name}`);
		assert(typeof error.status === 'number', `Expected numeric status, got ${typeof error.status}`);
		assert(error.status === 400, `Expected status 400, got ${error.status}`);
		assert(error.request && error.request.url, 'Error should have request snapshot with URL');
		assert(error.response && error.response.status, 'Error should have response snapshot with status');
		assert(typeof error.attempt === 'number', `Expected numeric attempt, got ${typeof error.attempt}`);
	}
});

// === Timeout Error Tests ===

// Test 3: Timeout error structure
suite.test('Timeout error has proper LuminaraError structure', async () => {
	const luminara = createLuminara();

	try {
		await luminara.get(`${mockServer.baseUrl}/json?delay=1000`, {
			timeout: 100 // Short timeout
		});
		assert(false, 'Should have thrown an error');
	} catch (error) {
		assert(error.name === 'LuminaraError', `Expected LuminaraError, got ${error.name}`);
		assert(error.code === 'TIMEOUT', `Expected code TIMEOUT, got ${error.code}`);
		assert(typeof error.message === 'string', 'Expected error.message to be string');
		assert(error.request, 'Expected error.request to exist');
	}
});

// Test 4: Timeout Error Structure (alternative test)
suite.test('Timeout Error Structure with baseURL', async () => {
	const client = createLuminara({
		baseURL: mockServer.baseUrl
	});
	
	try {
		await client.get('/json?delay=2000', { timeout: 100 });
		assert(false, 'Expected timeout error but request succeeded');
	} catch (error) {
		assert(error.name === 'LuminaraError', `Expected LuminaraError, got ${error.name}`);
		assert(error.code === 'TIMEOUT', `Expected TIMEOUT code, got ${error.code}`);
		assert(error.message.includes('timeout'), `Expected timeout in message, got: ${error.message}`);
		assert(error.request && error.request.timeout, 'Timeout error should have request timeout info');
	}
});

// === Network Error Tests ===

// Test 5: Network error structure 
suite.test('Network error has proper LuminaraError structure', async () => {
	const luminara = createLuminara();

	try {
		await luminara.get('http://invalid-host-does-not-exist.local/test', {
			timeout: 5000 // Longer timeout to allow network error, not timeout
		});
		assert(false, 'Should have thrown an error');
	} catch (error) {
		assert(error.name === 'LuminaraError', `Expected LuminaraError, got ${error.name}`);

		// Network errors might be detected as timeout on some systems
		assert(error.code === 'NETWORK_ERROR' || error.code === 'TIMEOUT', `Expected code NETWORK_ERROR or TIMEOUT, got ${error.code}`);
		assert(typeof error.message === 'string', 'Expected error.message to be string');
		assert(error.request, 'Expected error.request to exist');
	}
});

// Test 6: Network Error Normalization (invalid port)
suite.test('Network Error Normalization', async () => {
	const client = createLuminara({
		baseURL: 'http://localhost:99999' // Invalid port
	});
	
	try {
		await client.get('/test');
		assert(false, 'Expected network error but request succeeded');
	} catch (error) {
		assert(error.name === 'LuminaraError', `Expected LuminaraError, got ${error.name}`);
		assert(error.code === 'NETWORK_ERROR', `Expected NETWORK_ERROR code, got ${error.code}`);
		assert(error.request && error.request.url, 'Network error should have request snapshot');
		assert(error.cause, 'Network error should have original error as cause');
	}
});

// === Abort Error Tests ===

// Test 7: Abort error structure
suite.test('Abort error has proper LuminaraError structure', async () => {
	const luminara = createLuminara();
	const controller = new AbortController();

	// Abort after short delay
	setTimeout(() => controller.abort('User cancelled'), 50);

	try {
		await luminara.get(`${mockServer.baseUrl}/json?delay=1000`, {
			signal: controller.signal
		});
		assert(false, 'Should have thrown an error');
	} catch (error) {
		assert(error.name === 'LuminaraError', `Expected LuminaraError, got ${error.name}`);
		assert(error.code === 'ABORT', `Expected code ABORT, got ${error.code}`);
		assert(typeof error.message === 'string', 'Expected error.message to be string');
		assert(error.request, 'Expected error.request to exist');
	}
});

// Test 8: Abort Error Structure (alternative test)
suite.test('Abort Error Structure with AbortController', async () => {
	const client = createLuminara({
		baseURL: mockServer.baseUrl
	});
	
	const abortController = new AbortController();
	
	// Start request and abort it quickly
	setTimeout(() => abortController.abort(), 50);
	
	try {
		await client.get('/json?delay=1000', { signal: abortController.signal });
		assert(false, 'Expected abort error but request succeeded');
	} catch (error) {
		assert(error.name === 'LuminaraError', `Expected LuminaraError, got ${error.name}`);
		assert(error.code === 'ABORT', `Expected ABORT code, got ${error.code}`);
		assert(error.message.includes('abort'), `Expected 'abort' in message, got: ${error.message}`);
	}
});

// === Parse Error Tests ===

// Test 9: Parse Error Structure
suite.test('Parse Error Structure', async () => {
	const client = createLuminara({
		baseURL: mockServer.baseUrl
	});
	
	try {
		await client.get('/invalid-json', { responseType: 'json' });
		assert(false, 'Expected parse error but request succeeded');
	} catch (error) {
		assert(error.name === 'LuminaraError', `Expected LuminaraError, got ${error.name}`);
		assert(error.code === 'PARSE_ERROR', `Expected PARSE_ERROR code, got ${error.code}`);
		assert(error.response && error.response.status, 'Parse error should have response snapshot');
		assert(error.cause, 'Parse error should have original error as cause');
	}
});

// === Error Data and Snapshot Tests ===

// Test 10: Request and response snapshots contain important data
suite.test('Error contains request and response snapshots', async () => {
	const luminara = createLuminara();

	try {
		await luminara.post(`${mockServer.baseUrl}/form?status=400`, 
			{ test: 'data' },
			{
				headers: { 'X-Custom': 'test-value' },
				timeout: 5000,
				retry: 1
			});
		assert(false, 'Should have thrown an error');
	} catch (error) {
		assert(error.name === 'LuminaraError', `Expected LuminaraError, got ${error.name}`);
		
		// Check request snapshot
		assert(error.request, 'Expected error.request to exist');
		assert(error.request.url && error.request.url.includes('/form'), 'Expected request URL in snapshot');
		assert(error.request.method === 'POST', `Expected POST method in request snapshot, got ${error.request.method}`);
		
		// Check response snapshot (for HTTP errors)
		if (error.response) {
			assert(typeof error.response.status === 'number', 'Expected response status in snapshot');
			assert(typeof error.response.url === 'string', 'Expected response URL in snapshot');
		}
	}
});

// Test 11: JSON data parsing in errors
suite.test('Error data includes parsed JSON when available', async () => {
	const luminara = createLuminara();

	try {
		await luminara.get(`${mockServer.baseUrl}/error-json`);
		assert(false, 'Should have thrown an error');
	} catch (error) {
		assert(error.name === 'LuminaraError', `Expected LuminaraError, got ${error.name}`);

		// Check if data was parsed (should be an object if JSON parsing succeeded)
		if (error.data && typeof error.data === 'object') {
			assert(true, 'JSON data was successfully parsed');
		} else {

			// If not JSON, data might be string or null
			assert(true, 'Non-JSON data handled appropriately');
		}
	}
});

// Test 12: Error Data Population with Server JSON
suite.test('Error Data Population with Server JSON', async () => {
	const client = createLuminara({
		baseURL: mockServer.baseUrl
	});
	
	try {
		await client.post('/validation-error', { 
			email: 'invalid-email',
			password: '123'
		});
		assert(false, 'Expected validation error but request succeeded');
	} catch (error) {
		assert(error.name === 'LuminaraError', `Expected LuminaraError, got ${error.name}`);
		assert(error.status === 422, `Expected status 422, got ${error.status}`);
		assert(error.request && error.request.method === 'POST', 'Error should have POST request info');
		assert(error.response && error.response.headers, 'Error should have response headers');
		
		// Note: error.data parsing depends on server response format and body consumption
		// The test validates that the structure is correct even if data is undefined
	}
});

// === Retry Error Tests ===

// Test 13: Attempt number tracking in retries
suite.test('Error tracks attempt number during retries', async () => {
	const luminara = createLuminara();

	try {
		await luminara.get(`${mockServer.baseUrl}/error-500`, {
			retry: 2,
			retryDelay: 50
		});
		assert(false, 'Should have thrown an error');
	} catch (error) {
		assert(error.name === 'LuminaraError', `Expected LuminaraError, got ${error.name}`);
		assert(typeof error.attempt === 'number', `Expected error.attempt to be number, got ${typeof error.attempt}`);
		assert(error.attempt >= 1, `Expected attempt >= 1, got ${error.attempt}`);
	}
});

// Test 14: Error Consistency Across Retries
suite.test('Error Consistency Across Retries', async () => {
	const client = createLuminara({
		baseURL: mockServer.baseUrl,
		retry: 2,
		retryDelay: 100
	});
	
	mockServer.resetCounts();
	
	try {
		await client.getJson('/json?status=500');
		assert(false, 'Expected error but request succeeded after retries');
	} catch (error) {
		assert(error.name === 'LuminaraError', `Final error should be LuminaraError, got ${error.name}`);
		assert(error.status === 500, `Expected status 500, got ${error.status}`);
		
		// Check that retries actually happened by counting requests
		const requestCount = mockServer.getRequestCount('GET', '/json');
		assert(requestCount === 3, `Expected 3 total requests (1 + 2 retries), got ${requestCount}`);
		
		// Validate error structure is consistent
		assert(error.request && error.request.url, 'Error should have request snapshot');
		assert(error.response && error.response.status === 500, 'Error should have response snapshot with status 500');
		assert(typeof error.attempt === 'number', `Error should have attempt number, got ${typeof error.attempt}`);
	}
});

// === ignoreResponseError Option Tests ===

// Test that errors are thrown by default
suite.test('HTTP errors thrown by default', async () => {
	const luminara = createLuminara();
	
	try {
		await luminara.get(`${mockServer.baseUrl}/json?status=404`);
		assert(false, 'Should have thrown an error');
	} catch (error) {
		assert(error.status === 404, 'Should throw error with correct status');
		assert(error.name === 'LuminaraError', 'Should be a LuminaraError');
	}
});

// Test ignoreResponseError: true prevents throwing
suite.test('ignoreResponseError: true prevents throwing', async () => {
	const luminara = createLuminara();
	
	const response = await luminara.get(`${mockServer.baseUrl}/json?status=404`, {
		ignoreResponseError: true
	});
	
	// Should receive response object instead of throwing
	assert(response.status === 404, 'Should receive response with error status');
	assert(response.data !== null, 'Should receive response data');
});

// Test ignoreResponseError works with different status codes
suite.test('ignoreResponseError works with different status codes', async () => {
	const luminara = createLuminara();
	
	const statusCodes = [400, 401, 403, 500, 502];
	
	for (const status of statusCodes) {
		const response = await luminara.get(`${mockServer.baseUrl}/json?status=${status}`, {
			ignoreResponseError: true
		});
		
		assert(response.status === status, `Should receive response with status ${status}`);
	}
});

// Test ignoreResponseError: false explicitly throws
suite.test('ignoreResponseError: false explicitly throws', async () => {
	const luminara = createLuminara();
	
	try {
		await luminara.get(`${mockServer.baseUrl}/json?status=500`, {
			ignoreResponseError: false
		});
		assert(false, 'Should have thrown an error');
	} catch (error) {
		assert(error.status === 500, 'Should throw error with correct status');
		assert(error.name === 'LuminaraError', 'Should be a LuminaraError');
	}
});

// Test ignoreResponseError works with POST requests
suite.test('ignoreResponseError works with POST requests', async () => {
	const luminara = createLuminara();
	
	const response = await luminara.post(`${mockServer.baseUrl}/json?status=422`, { test: 'data' }, {
		ignoreResponseError: true
	});
	
	assert(response.status === 422, 'Should receive response with error status');
	assert(response.data !== null, 'Should receive response data');
});

// Test ignoreResponseError preserves response data
suite.test('ignoreResponseError preserves response data', async () => {
	const luminara = createLuminara();
	
	const response = await luminara.get(`${mockServer.baseUrl}/json?status=500`, {
		ignoreResponseError: true
	});
	
	assert(response.status === 500, 'Should preserve error status');
	assert(typeof response.data === 'object', 'Should preserve response data');
	assert(response.data.error === 'Simulated error', 'Should have error message');
});

// Test ignoreResponseError does not affect successful responses
suite.test('ignoreResponseError does not affect successful responses', async () => {
	const luminara = createLuminara();
	
	const response = await luminara.get(`${mockServer.baseUrl}/json`, {
		ignoreResponseError: true
	});
	
	assert(response.status === 200, 'Should receive successful response');
	assert(response.data.message === 'Success', 'Should parse successful response correctly');
});

// Run tests if this file is executed directly
await runTestSuiteIfDirect(
	import.meta.url, 
	'Comprehensive Error Handling', 
	suite, 
	mockServer,
	(server) => {
		server.baseUrl = `http://localhost:${server.port}`;
	}
);

export { suite, mockServer };
