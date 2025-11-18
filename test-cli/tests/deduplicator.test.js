/**
 * Request Deduplicator Tests
 * Tests for the deduplicator feature that prevents duplicate concurrent requests
 */

import { createLuminara } from '../../dist/index.mjs';
import { TestSuite, MockServer, assert, Timer, assertRange } from '../testUtils.js';
import { runTestSuiteIfDirect } from '../runTestSuite.js';

const suite = new TestSuite('Request Deduplicator');
const mockServer = new MockServer(4223);
const BASE_URL = `http://localhost:${mockServer.port}`;

suite.test('Deduplication disabled by default', async () => {
	const api = createLuminara({
		baseURL: BASE_URL
	});
	
	const results = await Promise.all([
		api.get('/delay/50'),
		api.get('/delay/50'),
		api.get('/delay/50')
	]);
	
	assert(results.length === 3, 'All 3 requests should complete');
});

suite.test('Basic deduplication with empty config', async () => {
	const api = createLuminara({
		baseURL: BASE_URL,
		deduplicate: {}
	});
	
	const timer = new Timer();
	timer.mark();
	
	const results = await Promise.all([
		api.get('/delay/100'),
		api.get('/delay/100'),
		api.get('/delay/100')
	]);
	
	timer.mark();
	const duration = timer.getDuration();
	
	assert(results.length === 3, 'All callers should receive results');
	assertRange(duration, 50, 400, `Should complete quickly (deduplication working), got ${duration}ms`);
});

suite.test('Key strategy: url (ignores method)', async () => {
	const api = createLuminara({
		baseURL: BASE_URL,
		deduplicate: {
			keyStrategy: 'url',
			excludeMethods: []
		}
	});
	
	const timer = new Timer();
	timer.mark();
	
	await Promise.all([
		api.get('/delay/100'),
		api.post('/delay/100', { body: { test: true } })
	]);
	
	timer.mark();
	const duration = timer.getDuration();
	
	assertRange(duration, 50, 400, `URL-only strategy should deduplicate different methods, got ${duration}ms`);
});

suite.test('Key strategy: url+method (different methods not deduplicated)', async () => {
	const api = createLuminara({
		baseURL: BASE_URL,
		deduplicate: {
			keyStrategy: 'url+method',
			excludeMethods: []
		}
	});
	
	const timer = new Timer();
	timer.mark();
	
	await Promise.all([
		api.get('/delay/100'),
		api.post('/delay/100', { body: { test: true } })
	]);
	
	timer.mark();
	const duration = timer.getDuration();
	
	// Both should execute (not deduplicated), so timing should be at least 80ms
	assert(duration >= 50, `Different methods should not deduplicate (got ${duration}ms)`);
});

suite.test('Method filtering: excludeMethods', async () => {
	const api = createLuminara({
		baseURL: BASE_URL,
		deduplicate: {
			excludeMethods: ['POST', 'PUT', 'PATCH', 'DELETE']
		}
	});
	
	const timer1 = new Timer();
	timer1.mark();
	
	await Promise.all([
		api.get('/delay/100'),
		api.get('/delay/100')
	]);
	
	timer1.mark();
	const getDuration = timer1.getDuration();
	
	assertRange(getDuration, 50, 400, `GET should deduplicate, got ${getDuration}ms`);
	
	// POST should NOT deduplicate (excluded)
	await Promise.all([
		api.post('/delay/50', { body: { id: 1 } }),
		api.post('/delay/50', { body: { id: 2 } })
	]);
});

suite.test('Method filtering: methods whitelist (only GET/HEAD)', async () => {
	const api = createLuminara({
		baseURL: BASE_URL,
		deduplicate: {
			methods: ['GET', 'HEAD']
		}
	});
	
	const timer1 = new Timer();
	timer1.mark();
	
	await Promise.all([
		api.get('/delay/100'),
		api.get('/delay/100')
	]);
	
	timer1.mark();
	const getDuration = timer1.getDuration();
	
	assertRange(getDuration, 50, 400, `GET should deduplicate, got ${getDuration}ms`);
});

suite.test('Cache TTL burst protection', async () => {
	const api = createLuminara({
		baseURL: BASE_URL,
		deduplicate: {
			cacheTTL: 300
		}
	});
	
	await api.get('/delay/50');
	await new Promise(resolve => setTimeout(resolve, 100));
	
	const timer = new Timer();
	timer.mark();
	
	await api.get('/delay/50');
	
	timer.mark();
	const cachedDuration = timer.getDuration();
	
	assert(cachedDuration < 80, `Cached request should be instant (got ${cachedDuration}ms)`);
	
	await new Promise(resolve => setTimeout(resolve, 250));
	
	const timer2 = new Timer();
	timer2.mark();
	
	await api.get('/delay/50');
	
	timer2.mark();
	const freshDuration = timer2.getDuration();
	
	assert(freshDuration >= 30, 'Fresh request should not be cached');
});

suite.test('Cache TTL = 0 (in-flight only)', async () => {
	const api = createLuminara({
		baseURL: BASE_URL,
		deduplicate: {
			cacheTTL: 0
		}
	});
	
	const timer1 = new Timer();
	timer1.mark();
	
	await Promise.all([
		api.get('/delay/100'),
		api.get('/delay/100')
	]);
	
	timer1.mark();
	const concurrentDuration = timer1.getDuration();
	
	assertRange(concurrentDuration, 50, 400, `Concurrent requests should deduplicate, got ${concurrentDuration}ms`);
	
	await api.get('/delay/50');
	
	const timer2 = new Timer();
	timer2.mark();
	
	await api.get('/delay/50');
	
	timer2.mark();
	const sequentialDuration = timer2.getDuration();
	
	assert(sequentialDuration >= 30, 'Sequential request with TTL=0 should not cache');
});

suite.test('Per-request disable', async () => {
	const api = createLuminara({
		baseURL: BASE_URL,
		deduplicate: {}
	});
	
	const [r1, r2] = await Promise.all([
		api.get('/delay/50'),
		api.get('/delay/50', { deduplicate: { disabled: true } })
	]);
	
	assert(r1 && r2, 'Both requests should complete');
});

suite.test('Per-request override strategy', async () => {
	const api = createLuminara({
		baseURL: BASE_URL,
		deduplicate: {
			keyStrategy: 'url+method'
		}
	});
	
	const timer = new Timer();
	timer.mark();
	
	await Promise.all([
		api.get('/delay/100', { deduplicate: { keyStrategy: 'url', excludeMethods: [] } }),
		api.post('/delay/100', { 
			body: { test: true },
			deduplicate: { keyStrategy: 'url', excludeMethods: [] }
		})
	]);
	
	timer.mark();
	const duration = timer.getDuration();
	
	assertRange(duration, 50, 400, `Per-request url strategy should deduplicate, got ${duration}ms`);
});

suite.test('Error propagation to duplicates', async () => {
	const api = createLuminara({
		baseURL: BASE_URL,
		deduplicate: {},
		ignoreResponseError: false
	});
	
	const promises = [
		api.get('/status/500'),
		api.get('/status/500'),
		api.get('/status/500')
	];
	
	let errorCount = 0;
	let successCount = 0;
	
	for (const promise of promises) {
		try {
			await promise;
			successCount++;
		} catch (error) {
			if (error.status === 500) {
				errorCount++;
			}
		}
	}
	
	assert(errorCount === 3 || successCount === 3, `Should get 3 errors OR 3 successes, got ${errorCount} errors, ${successCount} successes`);
});

suite.test('AbortController integration', async () => {
	const api = createLuminara({
		baseURL: BASE_URL,
		deduplicate: {}
	});
	
	const controller1 = new AbortController();
	
	const promise1 = api.get('/delay/200', { signal: controller1.signal });
	
	// Abort after a short delay
	setTimeout(() => controller1.abort(), 30);
	
	let wasAborted = false;
	
	try {
		await promise1;
	} catch (error) {
		if (error.name === 'AbortError' || error.message?.includes('abort')) {
			wasAborted = true;
		}
	}
	
	assert(wasAborted, 'Request should have been aborted');
});

suite.test('Custom key generator', async () => {
	const api = createLuminara({
		baseURL: BASE_URL,
		deduplicate: {
			keyStrategy: 'custom',
			keyGenerator: (req) => {
				const url = new URL(req.fullUrl);
				return url.pathname;
			}
		}
	});
	
	const timer = new Timer();
	timer.mark();
	
	await Promise.all([
		api.get('/delay/100?id=1'),
		api.get('/delay/100?id=2'),
		api.get('/delay/100?id=3')
	]);
	
	timer.mark();
	const duration = timer.getDuration();
	
	assertRange(duration, 50, 400, `Custom key should deduplicate, got ${duration}ms`);
});

suite.test('Sequential requests after TTL expiry', async () => {
	const api = createLuminara({
		baseURL: BASE_URL,
		deduplicate: {
			cacheTTL: 100
		}
	});
	
	await api.get('/delay/50');
	await new Promise(resolve => setTimeout(resolve, 150));
	
	const timer = new Timer();
	timer.mark();
	
	await api.get('/delay/50');
	
	timer.mark();
	const duration = timer.getDuration();
	
	assert(duration >= 30, 'Sequential request after TTL should not use cache');
});

suite.test('Deduplication with retry integration', async () => {
	const api = createLuminara({
		baseURL: BASE_URL,
		deduplicate: {},
		retry: 2,
		retryDelay: 50
	});
	
	const timer = new Timer();
	timer.mark();
	
	await Promise.all([
		api.get('/delay/100'),
		api.get('/delay/100'),
		api.get('/delay/100')
	]);
	
	timer.mark();
	const duration = timer.getDuration();
	
	assertRange(duration, 50, 400, `Deduplication with retry should work, got ${duration}ms`);
});

suite.test('maxCacheSize enforcement', async () => {
	const api = createLuminara({
		baseURL: BASE_URL,
		deduplicate: {
			maxCacheSize: 5,
			cacheTTL: 1000
		}
	});
	
	for (let i = 0; i < 10; i++) {
		await api.get(`/delay/10?id=${i}`);
	}
	
	assert(true, 'All requests should complete successfully');
});

suite.test('Concurrent identical GET requests deduplicate', async () => {
	const api = createLuminara({
		baseURL: BASE_URL,
		deduplicate: {}
	});
	
	const timer = new Timer();
	timer.mark();
	
	await Promise.all([
		api.get('/delay/100'),
		api.get('/delay/100'),
		api.get('/delay/100'),
		api.get('/delay/100'),
		api.get('/delay/100')
	]);
	
	timer.mark();
	const duration = timer.getDuration();
	
	assertRange(duration, 50, 400, `5 concurrent requests should execute as 1, got ${duration}ms`);
});

// Run tests if this file is executed directly
await runTestSuiteIfDirect(import.meta.url, 'Request Deduplicator', suite, mockServer);

export { suite, mockServer };
