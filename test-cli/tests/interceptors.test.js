import { TestSuite, MockServer, assert, assertEqual } from '../testUtils.js';
import { createLuminara } from '../../dist/index.mjs';
import { runTestSuiteIfDirect } from '../runTestSuite.js';

const suite = new TestSuite('Modern Interceptors');
const mockServer = new MockServer(4228);
const BASE_URL = `http://localhost:${mockServer.port}`;

// =============================================================================
// onRequest Interceptor Tests (L→R execution order)
// =============================================================================

suite.test('onRequest interceptor modifies request', async () => {
	const client = createLuminara({ baseURL: BASE_URL });
	
	client.use({
		onRequest(context) {
			context.req.headers = {
				...context.req.headers,
				'X-Test-Header': 'interceptor-added'
			};
		}
	});

	const response = await client.getJson('/echo-headers');
	
	assert(response.data.headers['x-test-header'] === 'interceptor-added', 'Header should be added by interceptor');
});

suite.test('onRequest interceptors execute in Left→Right order', async () => {
	const client = createLuminara({ baseURL: BASE_URL });
	const executionOrder = [];
	
	// First interceptor (should execute first)
	client.use({
		name: 'first',
		onRequest(context) {
			executionOrder.push('first');
			context.req.headers = {
				...context.req.headers,
				'X-Order': 'first'
			};
		}
	});
	
	// Second interceptor (should execute second and override)
	client.use({
		name: 'second', 
		onRequest(context) {
			executionOrder.push('second');
			context.req.headers = {
				...context.req.headers,
				'X-Order': 'second'
			};
		}
	});
	
	// Third interceptor (should execute last and have final say)
	client.use({
		name: 'third',
		onRequest(context) {
			executionOrder.push('third');
			context.req.headers = {
				...context.req.headers,
				'X-Order': 'third',
				'X-Chain': `${context.req.headers['X-Order'] || 'none'} -> third`
			};
		}
	});

	const response = await client.getJson('/echo-headers');
	
	// Verify execution order
	assertEqual(executionOrder, ['first', 'second', 'third'], 'onRequest should execute in L→R order');
	
	// Verify final state (last interceptor wins)
	assert(response.data.headers['x-order'] === 'third', 'Last interceptor should have final say');
	assert(response.data.headers['x-chain'] === 'second -> third', 'Chain should show progression');
});

suite.test('onRequest interceptor receives complete context', async () => {
	const client = createLuminara({ baseURL: BASE_URL });
	let capturedContext = null;
	
	client.use({
		onRequest(context) {
			capturedContext = { ...context };

			// Verify context structure
			assert(context.req !== undefined, 'Context should have req object');
			assert(context.meta !== undefined, 'Context should have meta object');
			assert(context.meta.requestId !== undefined, 'Context should have requestId');
			assert(context.controller !== undefined, 'Context should have AbortController');
			assert(context.attempt === 1, 'Initial attempt should be 1');
		}
	});

	await client.getJson('/json');
	
	assert(capturedContext !== null, 'Context should be captured');
	assert(capturedContext.req.method === 'GET', 'Request method should be preserved');
});

// =============================================================================
// onResponse Interceptor Tests (R→L execution order)
// =============================================================================

suite.test('onResponse interceptor modifies response', async () => {
	const client = createLuminara({ baseURL: BASE_URL });
	
	client.use({
		onResponse(context) {
			context.res.data.modified = true;
			context.res.data.timestamp = '2024-01-01';
		}
	});

	const response = await client.getJson('/json');
	
	assert(response.data.message === 'Success', 'Original data should be preserved');
	assert(response.data.modified === true, 'Data should be modified by interceptor');
	assert(response.data.timestamp === '2024-01-01', 'Timestamp should be added by interceptor');
});

suite.test('onResponse interceptors execute in Right→Left order', async () => {
	const client = createLuminara({ baseURL: BASE_URL });
	const executionOrder = [];
	
	// First interceptor registered (should execute LAST)
	client.use({
		name: 'first',
		onResponse(context) {
			executionOrder.push('first');
			context.res.data.order = `${context.res.data.order || ''} first`.trim();
		}
	});
	
	// Second interceptor registered (should execute SECOND)
	client.use({
		name: 'second',
		onResponse(context) {
			executionOrder.push('second');
			context.res.data.order = `${context.res.data.order || ''} second`.trim();
		}
	});
	
	// Third interceptor registered (should execute FIRST)
	client.use({
		name: 'third',
		onResponse(context) {
			executionOrder.push('third');
			context.res.data.order = `${context.res.data.order || ''} third`.trim();
		}
	});

	const response = await client.getJson('/json');
	
	// Verify execution order (reverse of registration)
	assertEqual(executionOrder, ['third', 'second', 'first'], 'onResponse should execute in R→L order');
	
	// Verify data accumulation (shows execution sequence)
	assert(response.data.order === 'third second first', 'Data should show R→L execution sequence');
});

suite.test('onResponse interceptor receives complete context with response', async () => {
	const client = createLuminara({ baseURL: BASE_URL });
	let capturedContext = null;
	
	client.use({
		onResponse(context) {
			capturedContext = { ...context };

			// Verify context structure
			assert(context.req !== undefined, 'Context should have req object');
			assert(context.res !== undefined, 'Context should have res object');
			assert(context.meta !== undefined, 'Context should have meta object');
			assert(context.controller !== undefined, 'Context should have AbortController');
			assert(context.res.status !== undefined, 'Response should have status');
			assert(context.res.data !== undefined, 'Response should have data');
		}
	});

	await client.getJson('/json');
	
	assert(capturedContext !== null, 'Context should be captured');
	assert(capturedContext.res.status === 200, 'Response status should be available');
});

// =============================================================================
// onResponseError Interceptor Tests
// =============================================================================

suite.test('onResponseError interceptor handles HTTP errors', async () => {
	const client = createLuminara({ 
		baseURL: BASE_URL,
		ignoreResponseError: false // Ensure errors are thrown
	});
	
	let errorHandled = false;
	let capturedError = null;
	
	client.use({
		onResponseError(context) {
			errorHandled = true;
			capturedError = context.error;
			
			// Verify error context structure
			assert(context.error !== undefined, 'Context should have error object');
			assert(context.req !== undefined, 'Context should have req object');
			assert(context.meta !== undefined, 'Context should have meta object');
			
			// Transform error or add additional data
			context.error.handledByInterceptor = true;
		}
	});

	try {
		await client.getJson('/error/500');
		assert(false, 'Should throw error for 500 status');
	} catch (error) {
		assert(errorHandled, 'Error should be handled by interceptor');
		assert(capturedError !== null, 'Error should be captured');
		assert(error.handledByInterceptor === true, 'Error should be modified by interceptor');
		assert(error.status === 500, 'Error should preserve status');
	}
});

suite.test('onResponseError interceptors execute in R→L order', async () => {
	const client = createLuminara({ 
		baseURL: BASE_URL,
		ignoreResponseError: false
	});
	
	const executionOrder = [];
	
	// First interceptor registered (should execute LAST)
	client.use({
		name: 'first',
		onResponseError(context) {
			executionOrder.push('first');
			context.error.handlerChain = `${context.error.handlerChain || ''} first`.trim();
		}
	});
	
	// Second interceptor registered (should execute SECOND)
	client.use({
		name: 'second',
		onResponseError(context) {
			executionOrder.push('second');
			context.error.handlerChain = `${context.error.handlerChain || ''} second`.trim();
		}
	});
	
	// Third interceptor registered (should execute FIRST)
	client.use({
		name: 'third',
		onResponseError(context) {
			executionOrder.push('third');
			context.error.handlerChain = `${context.error.handlerChain || ''} third`.trim();
		}
	});

	try {
		await client.getJson('/error/400');
		assert(false, 'Should throw error');
	} catch (error) {

		// Verify execution order (reverse of registration)
		assertEqual(executionOrder, ['third', 'second', 'first'], 'onResponseError should execute in R→L order');
		
		// Verify error chain accumulation
		assert(error.handlerChain === 'third second first', 'Error should show R→L execution sequence');
	}
});

// =============================================================================
// Mixed Interceptor Tests (Complex Scenarios)
// =============================================================================

suite.test('Complete interceptor pipeline: onRequest → driver → onResponse', async () => {
	const client = createLuminara({ baseURL: BASE_URL });
	const pipeline = [];
	
	client.use({
		name: 'interceptor1',
		onRequest(context) {
			pipeline.push('req1');
			context.req.headers = {
				...context.req.headers,
				'X-Request-1': 'true'
			};
		},
		onResponse(context) {
			pipeline.push('res1');
			context.res.data.response1 = 'processed';
		}
	});
	
	client.use({
		name: 'interceptor2',
		onRequest(context) {
			pipeline.push('req2');
			context.req.headers = {
				...context.req.headers,
				'X-Request-2': 'true'
			};
		},
		onResponse(context) {
			pipeline.push('res2');
			context.res.data.response2 = 'processed';
		}
	});

	const response = await client.getJson('/echo-headers');
	
	// Verify pipeline execution order: req1 → req2 → driver → res2 → res1
	assertEqual(pipeline, ['req1', 'req2', 'res2', 'res1'], 'Pipeline should execute in correct order');
	
	// Verify request modifications
	assert(response.data.headers['x-request-1'] === 'true', 'First request interceptor should execute');
	assert(response.data.headers['x-request-2'] === 'true', 'Second request interceptor should execute');
});

suite.test('Interceptors with retry attempts', async () => {
	const client = createLuminara({ 
		baseURL: BASE_URL,
		retry: 2,
		ignoreResponseError: false
	});
	
	const requestAttempts = [];
	const responseAttempts = [];
	const errorAttempts = [];
	
	client.use({
		onRequest(context) {
			requestAttempts.push(context.attempt);
		},
		onResponse(context) {
			responseAttempts.push(context.attempt);
		},
		onResponseError(context) {
			errorAttempts.push(context.attempt);
		}
	});

	try {

		// This should fail on attempts 1 and 2, succeed on attempt 3
		await client.getJson('/error-then-success/2');
	} catch (error) {

		// Might fail if all retries are exhausted
	}
	
	// Verify interceptors are called for each attempt
	assert(requestAttempts.length >= 2, 'onRequest should be called for each retry attempt');
	assert(requestAttempts[0] === 1, 'First attempt should be 1');
	assert(requestAttempts[1] === 2, 'Second attempt should be 2');
});

suite.test('Interceptor context modifications persist through pipeline', async () => {
	const client = createLuminara({ baseURL: BASE_URL });
	
	client.use({
		name: 'auth',
		onRequest(context) {

			// Add auth token
			context.req.headers = {
				...context.req.headers,
				'Authorization': 'Bearer interceptor-token'
			};

			// Add custom metadata
			context.meta.authAdded = true;
		},
		onResponse(context) {

			// Verify metadata persisted
			assert(context.meta.authAdded === true, 'Metadata should persist to response');
			context.res.data.authVerified = context.meta.authAdded;
		}
	});
	
	client.use({
		name: 'logger',
		onRequest(context) {

			// Verify auth was added by previous interceptor
			assert(context.req.headers.Authorization === 'Bearer interceptor-token', 'Auth should be added by previous interceptor');
			context.meta.loggedRequest = true;
		},
		onResponse(context) {

			// Verify all metadata is available
			assert(context.meta.authAdded === true, 'Auth metadata should be available');
			assert(context.meta.loggedRequest === true, 'Logger metadata should be available');
			context.res.data.logged = true;
		}
	});

	const response = await client.getJson('/echo-headers');
	
	// Verify request modifications made it through
	assert(response.data.headers.authorization === 'Bearer interceptor-token', 'Auth header should be present');
	
	// Verify response modifications
	assert(response.data.authVerified === true, 'Auth verification should be added');
	assert(response.data.logged === true, 'Logging flag should be added');
});

// =============================================================================
// Error Recovery and Transformation Tests
// =============================================================================

suite.test('onResponseError can transform errors', async () => {
	const client = createLuminara({ 
		baseURL: BASE_URL,
		ignoreResponseError: false
	});
	
	client.use({
		onResponseError(context) {

			// Transform 404 errors into user-friendly messages
			if (context.error.status === 404) {
				context.error.message = 'Resource not found - please check the URL';
				context.error.userFriendly = true;
			}
		}
	});

	try {
		await client.getJson('/error/404');
		assert(false, 'Should throw error');
	} catch (error) {
		assert(error.message === 'Resource not found - please check the URL', 'Error message should be transformed');
		assert(error.userFriendly === true, 'Error should be marked as user-friendly');
		assert(error.status === 404, 'Original status should be preserved');
	}
});

export { suite, mockServer };

// Auto-run if this file is executed directly
await runTestSuiteIfDirect(import.meta.url, 'Modern Interceptors', suite, mockServer);
