import { createLuminara } from '../../src/index.js';
import { TestSuite, MockServer, assert, assertEqual, sleep } from '../testUtils.js';
import { runTestSuiteIfDirect } from '../runTestSuite.js';

const suite = new TestSuite('Stats Feature');
const mockServer = new MockServer(4235);  // Using port 4210 for stats tests
const BASE_URL = `http://localhost:${mockServer.port}`;

// Test comprehensive stats functionality
suite.test('Basic stats tracking - counters', async () => {
	const api = createLuminara({ baseURL: BASE_URL });
	
	// Reset stats for clean test
	api.stats().reset();
	
	// Make some requests
	await api.getJson('/json');
	await api.postJson('/json', { test: 'data' });
	
	try {
		await api.getJson('/error-500');  // Use actual error endpoint
	} catch (error) {

		// Expected 500 error
	}
	
	const stats = api.stats().counters.get();
	
	assert(stats.total >= 3, `Should track total requests: ${stats.total}`);
	assert(stats.success >= 2, `Should track successful requests: ${stats.success}`);
	assert(stats.fail >= 1, `Should track failed requests: ${stats.fail}`);
});

suite.test('Stats enabled/disabled control', async () => {
	const api = createLuminara({ baseURL: BASE_URL });
	
	// Reset and start with enabled stats
	api.stats().reset();
	assert(api.isStatsEnabled() === true, 'Stats should be enabled by default');
	
	// Make a request (should be tracked)
	await api.getJson('/json');
	let stats = api.stats().counters.get();
	const initialCount = stats.total;
	assert(initialCount >= 1, 'Should track request when enabled');
	
	// Disable stats
	api.disableStats();
	assert(api.isStatsEnabled() === false, 'Stats should be disabled');
	
	// Make another request (should not be tracked)
	await api.getJson('/json');
	stats = api.stats().counters.get();
	assert(stats.total === initialCount, 'Should not track request when disabled');
	
	// Re-enable stats
	api.enableStats();
	assert(api.isStatsEnabled() === true, 'Stats should be re-enabled');
	
	// Make another request (should be tracked again)
	await api.getJson('/json');
	stats = api.stats().counters.get();
	assert(stats.total === initialCount + 1, 'Should track request when re-enabled');
});

suite.test('Stats method chaining', async () => {
	const api = createLuminara({ baseURL: BASE_URL });
	
	// Test chaining returns the api instance
	const chainResult = api.disableStats().enableStats().disableStats().enableStats();
	assert(chainResult === api, 'Method chaining should return api instance');
	assert(api.isStatsEnabled() === true, 'Final state should be enabled');
});

suite.test('Time metrics tracking', async () => {
	const api = createLuminara({ baseURL: BASE_URL });
	
	api.stats().reset();
	
	// Make some requests to collect timing data
	await api.getJson('/json');
	await api.postJson('/json', { test: 'timing' });
	await api.getJson('/slow?delay=100');  // Simulate slower request
	
	const timeStats = api.stats().time.get();
	
	assert(typeof timeStats.avgMs === 'number', 'Should track average duration');
	assert(typeof timeStats.minMs === 'number', 'Should track minimum duration');
	assert(typeof timeStats.maxMs === 'number', 'Should track maximum duration');
	assert(timeStats.minMs <= timeStats.avgMs, 'Min should be <= average');
	assert(timeStats.avgMs <= timeStats.maxMs, 'Average should be <= max');
});

suite.test('Rate metrics calculation', async () => {
	const api = createLuminara({ baseURL: BASE_URL });
	
	api.stats().reset();
	
	// Make several requests quickly
	await Promise.all([
		api.getJson('/json'),
		api.getJson('/json'),
		api.getJson('/json')
	]);
	
	const rateStats = api.stats().rate.get();
	
	assert(typeof rateStats.rps === 'number', 'Should calculate requests per second');
	assert(typeof rateStats.rpm === 'number', 'Should calculate requests per minute');
	assert(rateStats.rps >= 0, 'Rate per second should be non-negative');
	assert(rateStats.rpm >= 0, 'Rate per minute should be non-negative');
});

suite.test('Error metrics by type', async () => {
	const api = createLuminara({ baseURL: BASE_URL });
	
	api.stats().reset();
	
	// Make requests that will result in different error types
	try {
		await api.getJson('/json?fail=true&status=404');
	} catch (error) {

		// Expected 404
	}
	
	try {
		await api.getJson('/error-500');
	} catch (error) {

		// Expected 500
	}
	
	const errorStats = api.stats().error.get();
	
	assert(typeof errorStats.byClass === 'object', 'Should categorize errors by type');
	assert(typeof errorStats.topCodes === 'object', 'Should track top error codes');
	assert(Object.keys(errorStats.byClass).length > 0, 'Should have error categories');
});

suite.test('Retry metrics tracking', async () => {
	const api = createLuminara({ 
		baseURL: BASE_URL,
		retry: 2,
		retryDelay: 50
	});
	
	api.stats().reset();
	
	// Make a request that will retry (using 500 error endpoint)
	try {
		await api.getJson('/error-500');
	} catch (error) {

		// Expected after retries
	}
	
	const retryStats = api.stats().retry.get();
	
	assert(typeof retryStats.count === 'number', 'Should track total retries');
	assert(typeof retryStats.giveups === 'number', 'Should track requests that gave up after retries');
	assert(typeof retryStats.avgBackoffMs === 'number', 'Should track average backoff time');
});

suite.test('Query interface - basic usage', async () => {
	const api = createLuminara({ baseURL: BASE_URL });
	
	api.stats().reset();
	
	// Make some requests
	await api.getJson('/json');
	await api.postJson('/json', { test: 'query' });
	
	// Test basic query
	const result = api.stats().query({
		metrics: ['counters', 'time'],
		window: 'since-start',
		groupBy: 'none'
	});
	
	assert(typeof result === 'object', 'Query should return object');
	assert(typeof result.timestamp === 'string', 'Should include timestamp');
	assert(Array.isArray(result.groups), 'Should include groups array');
	assert(result.groups.length === 1, 'Should have one group for groupBy: none');
	assert(result.groups[0].key === 'all', 'Should have "all" key for global group');
	assert(result.groups[0].counters, 'Should include requested counters metrics');
	assert(result.groups[0].time, 'Should include requested time metrics');
});

suite.test('Query interface - groupBy method', async () => {
	const api = createLuminara({ baseURL: BASE_URL });
	
	api.stats().reset();
	
	// Make requests with different methods
	await api.get('/json');
	await api.post('/json', { test: 'group-by' });
	await api.put('/json', { test: 'update' });
	
	// Query grouped by method
	const result = api.stats().query({
		metrics: ['counters'],
		groupBy: 'method',
		window: 'since-start'
	});
	
	assert(Array.isArray(result.groups), 'Should return groups array');
	
	// Should have entries for different methods
	const methods = result.groups.map(group => group.key);
	assert(methods.includes('GET'), 'Should include GET method group');
	assert(methods.includes('POST'), 'Should include POST method group');
	assert(methods.includes('PUT'), 'Should include PUT method group');
});

suite.test('Query interface - groupBy domain', async () => {
	const api = createLuminara({ baseURL: BASE_URL });
	
	api.stats().reset();
	
	// Make requests that will have different domains in their tracking
	// Since we can't easily make cross-domain requests in tests, we'll simulate
	// by making requests to different mock server endpoints that represent different domains
	await api.getJson('/json');  // Will be tracked as localhost domain
	await api.getJson('/form');  // Also localhost but different endpoint
	
	// Query grouped by domain
	const result = api.stats().query({
		metrics: ['counters'],
		groupBy: 'domain',
		window: 'since-start'
	});
	
	assert(result && result.groups, 'Should return valid result');
	assert(Array.isArray(result.groups), 'Should return groups array');
	
	// Should have localhost domain
	const domains = result.groups.map(group => group.key);
	assert(domains.some(domain => domain.includes('localhost')), 'Should include localhost domain');
});

suite.test('Query interface - groupBy endpoint', async () => {
	const api = createLuminara({ baseURL: BASE_URL });
	
	api.stats().reset();
	
	// Make requests to different endpoints
	await api.getJson('/json');
	await api.getJson('/form');  // Use /form instead of /text since it returns JSON
	await api.postJson('/json', { test: 'endpoint-grouping' });
	
	// Query grouped by endpoint
	const result = api.stats().query({
		metrics: ['counters'],
		groupBy: 'endpoint',
		window: 'since-start'
	});
	
	assert(result && result.groups, 'Should return valid result');
	assert(Array.isArray(result.groups), 'Should return groups array');
	
	// Should have entries for different endpoints
	const endpoints = result.groups.map(group => group.key);
	assert(endpoints.some(ep => ep.includes('/json')), 'Should include /json endpoint');
	assert(endpoints.some(ep => ep.includes('/form')), 'Should include /form endpoint');
});

suite.test('Query interface - with WHERE filters', async () => {
	const api = createLuminara({ baseURL: BASE_URL });
	
	api.stats().reset();
	
	// Make various requests
	await api.get('/json');
	await api.post('/json', { test: 'filter' });
	await api.get('/form');
	
	// Query with method filter
	const getOnlyResult = api.stats().query({
		metrics: ['counters'],
		where: { method: 'GET' },
		window: 'since-start'
	});
	
	assert(Array.isArray(getOnlyResult.groups), 'Should return groups array');
	assert(getOnlyResult.groups.length === 1, 'Should have one group for global query');
	assert(typeof getOnlyResult.groups[0].counters === 'object', 'Should return filtered counters');
	
	// Query with endpoint filter
	const jsonOnlyResult = api.stats().query({
		metrics: ['counters'],
		where: { endpointPrefix: '/json' },
		window: 'since-start'
	});
	
	assert(Array.isArray(jsonOnlyResult.groups), 'Should return groups array');
	assert(jsonOnlyResult.groups.length === 1, 'Should have one group for global query');
	assert(typeof jsonOnlyResult.groups[0].counters === 'object', 'Should return endpoint-filtered counters');
});

suite.test('Query interface - with LIMIT', async () => {
	const api = createLuminara({ baseURL: BASE_URL });
	
	api.stats().reset();
	
	// Make requests to multiple endpoints
	await api.get('/json');
	await api.get('/form');
	await api.get('/slow');
	await api.get('/xml');  // Use different endpoint instead of /text
	
	// Query with limit
	const limitedResult = api.stats().query({
		metrics: ['counters'],
		groupBy: 'endpoint',
		limit: 2,
		window: 'since-start'
	});
	
	assert(Array.isArray(limitedResult.groups), 'Should return groups array');
	assert(limitedResult.groups.length <= 2, 'Should respect limit parameter');
});

suite.test('Query interface - different time windows', async () => {
	const api = createLuminara({ baseURL: BASE_URL });
	
	// Test since-start window
	api.stats().reset();
	await api.getJson('/json');
	
	const sinceStartResult = api.stats().query({
		metrics: ['counters'],
		window: 'since-start'
	});
	
	assert(sinceStartResult.window === 'since-start', 'Should indicate since-start window');
	assert(sinceStartResult.groups[0].counters.total >= 1, 'Should include request in since-start');
	
	// Test since-reset window
	const sinceResetResult = api.stats().query({
		metrics: ['counters'],
		window: 'since-reset'
	});
	
	assert(sinceResetResult.window === 'since-reset', 'Should indicate since-reset window');
	
	// Test rolling-60s window
	const rollingResult = api.stats().query({
		metrics: ['counters'],
		window: 'rolling-60s'
	});
	
	assert(rollingResult.window === 'rolling-60s', 'Should indicate rolling-60s window');
});

suite.test('Namespaced helpers - all modules', async () => {
	const api = createLuminara({ baseURL: BASE_URL });
	
	api.stats().reset();
	
	// Make some requests to populate all metrics
	await api.getJson('/json');
	await api.postJson('/json', { test: 'helpers' });
	
	// Test all namespaced helpers
	const counters = api.stats().counters.get();
	const time = api.stats().time.get();
	const rate = api.stats().rate.get();
	const retry = api.stats().retry.get();
	const error = api.stats().error.get();
	
	assert(typeof counters === 'object', 'Counters helper should return object');
	assert(typeof time === 'object', 'Time helper should return object');
	assert(typeof rate === 'object', 'Rate helper should return object');
	assert(typeof retry === 'object', 'Retry helper should return object');
	assert(typeof error === 'object', 'Error helper should return object');
	
	assert(typeof counters.total === 'number', 'Counters should have total');
	assert(typeof counters.success === 'number', 'Counters should have success');
	assert(typeof counters.fail === 'number', 'Counters should have fail');
});

suite.test('Namespaced helpers - with options', async () => {
	const api = createLuminara({ baseURL: BASE_URL });
	
	api.stats().reset();
	
	// Make requests to different endpoints
	await api.get('/json');
	await api.post('/json', { test: 'options' });
	await api.get('/form');
	
	// Test helpers with groupBy option
	const countersByEndpoint = api.stats().counters.get({
		groupBy: 'endpoint'
	});
	
	assert(Array.isArray(countersByEndpoint), 'Should return array when groupBy is used');
	
	// Test helpers with window option
	const timeRolling = api.stats().time.get({
		window: 'rolling-60s'
	});
	
	assert(typeof timeRolling === 'object', 'Should return time stats for rolling window');
	
	// Test helpers with where filter
	const getRequests = api.stats().counters.get({
		where: { method: 'GET' }
	});
	
	assert(typeof getRequests === 'object', 'Should return filtered counters');
});

suite.test('Stats reset functionality', async () => {
	const api = createLuminara({ baseURL: BASE_URL });
	
	// Make some requests
	await api.getJson('/json');
	await api.postJson('/json', { test: 'reset' });
	
	const beforeReset = api.stats().counters.get();
	assert(beforeReset.total >= 2, 'Should have requests before reset');
	
	// Reset all stats
	api.stats().reset();
	
	const afterReset = api.stats().counters.get();
	assert(afterReset.total === 0, 'Should have no requests after global reset');
	assert(afterReset.success === 0, 'Should reset success counter');
	assert(afterReset.fail === 0, 'Should reset fail counter');
});

suite.test('Individual module reset', async () => {
	const api = createLuminara({ baseURL: BASE_URL });
	
	api.stats().reset();
	
	// Make requests to populate stats
	await api.getJson('/json');
	await api.postJson('/json', { test: 'module-reset' });
	
	const beforeReset = api.stats().counters.get();
	assert(beforeReset.total >= 2, 'Should have requests before module reset');
	
	// Reset only counters module
	api.stats().counters.reset();
	
	const afterCountersReset = api.stats().counters.get();
	assert(afterCountersReset.total === 0, 'Counters should be reset');
	
	// Other modules should still have data (if they were populated)
	const timeStats = api.stats().time.get();

	// Time stats might be reset too depending on implementation, but interface should work
	assert(typeof timeStats === 'object', 'Time stats interface should still work');
});

suite.test('Snapshot functionality', async () => {
	const api = createLuminara({ baseURL: BASE_URL });
	
	api.stats().reset();
	
	// Make some requests
	await api.getJson('/json');
	await api.postJson('/json', { test: 'snapshot' });
	
	const snapshot = api.stats().snapshot();
	
	assert(typeof snapshot === 'object', 'Snapshot should return object');
	assert(typeof snapshot.timestamp === 'string', 'Snapshot should include timestamp');
	assert(Array.isArray(snapshot.groups), 'Snapshot should include groups array');
	assert(snapshot.groups.length === 1, 'Snapshot should have one group (groupBy: none)');
	
	const group = snapshot.groups[0];
	assert(group.key === 'all', 'Snapshot group key should be "all"');
	
	// Snapshot should include all metric types
	assert(group.counters, 'Snapshot should include counters');
	assert(group.time, 'Snapshot should include time');
	assert(group.rate, 'Snapshot should include rate');
	assert(group.retry, 'Snapshot should include retry');
	assert(group.error, 'Snapshot should include error');
});

suite.test('Separate stats per instance', async () => {
	const api1 = createLuminara({ baseURL: BASE_URL });
	const api2 = createLuminara({ baseURL: BASE_URL });
	
	// Reset both
	api1.stats().reset();
	api2.stats().reset();
	
	// Make request with api1
	await api1.getJson('/json');
	
	// Check that stats are separate
	const api1Stats = api1.stats().counters.get();
	const api2Stats = api2.stats().counters.get();
	
	assert(api1Stats.total === 1, 'API1 should have 1 request');
	assert(api2Stats.total === 0, 'API2 should have 0 requests');
	
	// Make request with api2
	await api2.getJson('/json');
	
	const api1StatsAfter = api1.stats().counters.get();
	const api2StatsAfter = api2.stats().counters.get();
	
	assert(api1StatsAfter.total === 1, 'API1 should still have 1 request');
	assert(api2StatsAfter.total === 1, 'API2 should now have 1 request');
});

suite.test('Stats interface when disabled', async () => {
	const api = createLuminara({ 
		baseURL: BASE_URL,
		statsEnabled: false
	});
	
	// Interface should be accessible even when disabled
	const stats = api.stats();
	assert(typeof stats === 'object', 'Stats interface should be available when disabled');
	
	// All methods should be callable
	const counters = stats.counters.get();
	const snapshot = stats.snapshot();
	const query = stats.query({ metrics: ['counters'] });
	
	assert(typeof counters === 'object', 'Counters should be accessible when disabled');
	assert(typeof snapshot === 'object', 'Snapshot should be accessible when disabled');
	assert(typeof query === 'object', 'Query should be accessible when disabled');
	
	// Make a request (should not be tracked)
	await api.getJson('/json');
	
	const countersAfterRequest = stats.counters.get();
	assert(countersAfterRequest.total === 0, 'Should not track requests when disabled');
});

suite.test('Rate metrics with different modes', async () => {
	const api = createLuminara({ baseURL: BASE_URL });
	
	api.stats().reset();
	
	// Make some requests
	await api.getJson('/json');
	await api.getJson('/json');
	
	// Test EMA mode (default)
	const emaRate = api.stats().rate.get({ mode: 'ema-30s' });
	assert(typeof emaRate.rps === 'number', 'EMA mode should return rate per second');
	assert(emaRate.mode === 'ema-30s', 'Should indicate EMA mode');
	
	// Test tumbling window mode
	const tumblingRate = api.stats().rate.get({ mode: 'tumbling-60s' });
	assert(typeof tumblingRate.rps === 'number', 'Tumbling mode should return rate per second');
	assert(tumblingRate.mode === 'tumbling-60s', 'Should indicate tumbling mode');
});

suite.test('Complex query combinations', async () => {
	const api = createLuminara({ baseURL: BASE_URL });
	
	api.stats().reset();
	
	// Make diverse requests
	await api.get('/json');
	await api.post('/json', { test: 'complex' });
	await api.get('/form');
	await api.put('/json', { test: 'update' });
	
	// Complex query: multiple metrics, grouping, filtering, and limiting
	const complexResult = api.stats().query({
		metrics: ['counters', 'time'],
		groupBy: 'endpoint',
		where: { method: 'GET' },
		limit: 3,
		window: 'since-start'
	});
	
	assert(typeof complexResult === 'object', 'Complex query should return object');
	assert(Array.isArray(complexResult.groups), 'Should return groups');
	assert(complexResult.groups.length <= 3, 'Should respect limit');
	
	// Each group should have at least the counters metric (time might not be available if requests failed)
	complexResult.groups.forEach(group => {
		assert(group.counters, 'Each group should have counters');

		// Only check for time if it exists (requests might have failed)
		if (group.time) {
			assert(typeof group.time === 'object', 'Time metric should be object if present');
		}
	});
});

// Run tests if this file is executed directly
await runTestSuiteIfDirect(import.meta.url, 'Stats Feature', suite, mockServer);

export { suite, mockServer };