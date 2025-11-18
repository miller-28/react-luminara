import { createLuminara } from '../../src/index.js';
import { TestSuite, MockServer, assert, assertEqual } from '../testUtils.js';
import { runTestSuiteIfDirect } from '../runTestSuite.js';

const suite = new TestSuite('Plugin Integration - Cookie Jar');
const mockServer = new MockServer(4230);
const BASE_URL = `http://localhost:${mockServer.port}`;

suite.test('Should work without cookie-jar plugin installed', async () => {
	const api = createLuminara({ baseURL: BASE_URL });
	
	const response = await api.getJson('/json');
	
	assert(response.status === 200, 'Should return 200 status');
	assert(response.data.message === 'Success', 'Should work without plugin');
	assert(!api.jar, 'Should not have jar property without plugin');
});

suite.test('Should handle plugin installation gracefully', async () => {
	const api = createLuminara({ baseURL: BASE_URL });
	
	// Simulate plugin usage pattern
	let cookieJarPlugin;
	try {
		const module = await import('luminara-cookie-jar');
		cookieJarPlugin = module.cookieJarPlugin;
	} catch (err) {
		// Plugin not installed - this is expected in CI/test environments
		assert(err.code === 'ERR_MODULE_NOT_FOUND', 'Should gracefully handle missing plugin');
		return; // Skip rest of test if plugin not available
	}
	
	// If plugin is available, test integration
	const apiWithPlugin = createLuminara({
		baseURL: BASE_URL,
		plugins: [cookieJarPlugin()]
	});
	
	const response = await apiWithPlugin.getJson('/json');
	assert(response.status === 200, 'Should work with plugin installed');
	assert(apiWithPlugin.jar, 'Should have jar property when plugin installed');
});

suite.test('Should support plugin via use() method', async () => {
	let cookieJarPlugin;
	try {
		const module = await import('luminara-cookie-jar');
		cookieJarPlugin = module.cookieJarPlugin;
	} catch (err) {
		assert(err.code === 'ERR_MODULE_NOT_FOUND', 'Should gracefully handle missing plugin');
		return;
	}
	
	const api = createLuminara({ baseURL: BASE_URL });
	api.use(cookieJarPlugin());
	
	assert(api.jar, 'Should have jar property after use()');
	
	const response = await api.getJson('/json');
	assert(response.status === 200, 'Should work after plugin registration');
});

suite.test('Should work with multiple plugins', async () => {
	const customPlugin = {
		name: 'custom-test-plugin',
		onRequest(context) {
			context.req.headers = context.req.headers || {};
			context.req.headers['X-Custom-Header'] = 'test-value';
		}
	};
	
	let cookieJarPlugin;
	try {
		const module = await import('luminara-cookie-jar');
		cookieJarPlugin = module.cookieJarPlugin;
		
		const api = createLuminara({
			baseURL: BASE_URL,
			plugins: [customPlugin, cookieJarPlugin()]
		});
		
		const response = await api.getJson('/echo-headers');
		assert(response.status === 200, 'Should work with multiple plugins');
		assert(api.jar, 'Should have jar from cookie-jar plugin');
	} catch (err) {
		if (err.code === 'ERR_MODULE_NOT_FOUND') {
			// Test without cookie-jar plugin
			const api = createLuminara({
				baseURL: BASE_URL,
				plugins: [customPlugin]
			});
			
			const response = await api.getJson('/echo-headers');
			assert(response.status === 200, 'Should work with single plugin');
		} else {
			throw err;
		}
	}
});

suite.test('Should maintain plugin compatibility with retry logic', async () => {
	let cookieJarPlugin;
	try {
		const module = await import('luminara-cookie-jar');
		cookieJarPlugin = module.cookieJarPlugin;
	} catch (err) {
		assert(err.code === 'ERR_MODULE_NOT_FOUND', 'Should gracefully handle missing plugin');
		return;
	}
	
	const api = createLuminara({
		baseURL: BASE_URL,
		retry: 2,
		plugins: [cookieJarPlugin()]
	});
	
	// First request should fail, retry should succeed
	let attemptCount = 0;
	try {
		await api.getJson('/json?fail=true&status=500');
	} catch (err) {
		attemptCount = err.context?.attempt || 0;
	}
	
	// Plugin should work across retry attempts
	assert(api.jar, 'Plugin should remain attached during retries');
});

suite.test('Should work with plugin in SSR-like environment', async () => {
	let cookieJarPlugin;
	try {
		const module = await import('luminara-cookie-jar');
		cookieJarPlugin = module.cookieJarPlugin;
	} catch (err) {
		assert(err.code === 'ERR_MODULE_NOT_FOUND', 'Should gracefully handle missing plugin');
		return;
	}
	
	// Simulate multiple client instances (like SSR per-request clients)
	const client1 = createLuminara({
		baseURL: BASE_URL,
		plugins: [cookieJarPlugin()]
	});
	
	const client2 = createLuminara({
		baseURL: BASE_URL,
		plugins: [cookieJarPlugin()]
	});
	
	// Each client should have independent jar
	assert(client1.jar !== client2.jar, 'Each client should have separate jar instance');
	
	const response1 = await client1.getJson('/json');
	const response2 = await client2.getJson('/json');
	
	assert(response1.status === 200, 'Client 1 should work');
	assert(response2.status === 200, 'Client 2 should work');
});

suite.test('Should integrate with stats system', async () => {
	let cookieJarPlugin;
	try {
		const module = await import('luminara-cookie-jar');
		cookieJarPlugin = module.cookieJarPlugin;
	} catch (err) {
		assert(err.code === 'ERR_MODULE_NOT_FOUND', 'Should gracefully handle missing plugin');
		return;
	}
	
	const api = createLuminara({
		baseURL: BASE_URL,
		plugins: [cookieJarPlugin()]
	});
	
	// Reset stats for clean test
	api.stats().reset();
	
	await api.getJson('/json');
	
	const stats = api.stats().counters.get();
	
	assert(stats.total >= 1, 'Stats should track requests with plugin');
	assert(api.jar, 'Plugin should be active');
});

// Enable direct execution of this test file
await runTestSuiteIfDirect(import.meta.url, 'Plugin Integration - Cookie Jar', suite, mockServer);

// Export for test runner
export { suite, mockServer };
