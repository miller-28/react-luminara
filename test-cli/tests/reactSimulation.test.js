import { createLuminara } from '../../src/index.js';
import { TestSuite, MockServer, assert, assertEqual, assertRange, Timer } from '../testUtils.js';
import { runTestSuiteIfDirect } from '../runTestSuite.js';

const suite = new TestSuite('React Application Simulation');
const mockServer = new MockServer(4232);
const BASE_URL = `http://localhost:${mockServer.port}`;

// Simulate React component patterns and usage scenarios
suite.test('Component initialization with useEffect pattern', async () => {

	// Simulate a React component that initializes an API client
	const componentSimulation = {
		api: null,
		data: null,
		loading: false,
		error: null,
		
		// Simulate useEffect initialization
		async useEffectInit() {
			this.api = createLuminara({
				baseURL: BASE_URL,
				timeout: 5000,
				retry: 3,
				retryDelay: 1000,
				headers: {
					'X-App-Name': 'React-Test-App',
					'X-Component': 'UserProfile'
				}
			});
			
			// Add logging plugin like a real React app might
			this.api.use({
				onRequest: (context) => {

					// Debug logging suppressed during testing
					return context.req;
				},
				onResponseError: (context) => {
					console.error(`[API Error] ${context.req.method} ${context.req.url}:`, context.error.message);
					throw context.error;
				}
			});
			
			await this.fetchInitialData();
		},
		
		async fetchInitialData() {
			this.loading = true;
			this.error = null;
			
			try {
				const response = await this.api.getJson('/json');
				this.data = response.data;
				this.loading = false;
			} catch (error) {
				this.error = error;
				this.loading = false;
				throw error;
			}
		}
	};
	
	await componentSimulation.useEffectInit();
	
	assert(componentSimulation.api !== null, 'Component should initialize API client');
	assert(componentSimulation.data !== null, 'Component should fetch initial data');
	assert(componentSimulation.loading === false, 'Loading should be complete');
	assert(componentSimulation.error === null, 'Should have no errors');
	assert(componentSimulation.data.message === 'Success', 'Should get correct data');
});

suite.test('Form submission with validation pattern', async () => {

	// Simulate a React form component
	const formComponent = {
		api: createLuminara({
			baseURL: BASE_URL,
			timeout: 10000,
			headers: { 'Content-Type': 'application/json' }
		}),
		
		formData: {
			name: '',
			email: '',
			message: ''
		},
		
		errors: {},
		submitting: false,
		
		validate() {
			this.errors = {};
			
			if (!this.formData.name.trim()) {
				this.errors.name = 'Name is required';
			}
			
			if (!this.formData.email.includes('@')) {
				this.errors.email = 'Valid email is required';
			}
			
			if (this.formData.message.length < 10) {
				this.errors.message = 'Message must be at least 10 characters';
			}
			
			return Object.keys(this.errors).length === 0;
		},
		
		async handleSubmit() {
			if (!this.validate()) {
				throw new Error('Form validation failed');
			}
			
			this.submitting = true;
			
			try {
				const response = await this.api.postJson('/json', this.formData);
				this.submitting = false;

				return response;
			} catch (error) {
				this.submitting = false;
				throw error;
			}
		}
	};
	
	// Test with valid data
	formComponent.formData = {
		name: 'John Doe',
		email: 'john@example.com',
		message: 'This is a test message with sufficient length'
	};
	
	const response = await formComponent.handleSubmit();
	
	assert(response.status === 200, 'Form submission should succeed');
	assert(formComponent.submitting === false, 'Submitting state should be reset');
	assert(Object.keys(formComponent.errors).length === 0, 'Should have no validation errors');
});

suite.test('Data fetching with loading states', async () => {

	// Simulate a React component with data fetching states
	const dataComponent = {
		api: createLuminara({
			baseURL: BASE_URL,
			retry: 2,
			retryDelay: 500
		}),
		
		state: {
			loading: false,
			data: null,
			error: null
		},
		
		async fetchData(endpoint, options = {}) {
			this.state.loading = true;
			this.state.error = null;
			
			const startTime = Date.now();
			
			try {
				const response = await this.api.getJson(endpoint, options);
				this.state.data = response.data;
				this.state.loading = false;
				
				return {
					success: true,
					data: response.data,
					duration: Date.now() - startTime
				};
			} catch (error) {
				this.state.error = error;
				this.state.loading = false;
				
				return {
					success: false,
					error: error,
					duration: Date.now() - startTime
				};
			}
		},
		
		async refreshData() {
			return await this.fetchData('/json', { 
				headers: { 'Cache-Control': 'no-cache' }
			});
		}
	};
	
	// Test successful data fetching
	const result = await dataComponent.fetchData('/json');
	
	assert(result.success === true, 'Data fetching should succeed');
	assert(dataComponent.state.loading === false, 'Loading should be false after completion');
	assert(dataComponent.state.data !== null, 'Should have data');
	assert(dataComponent.state.error === null, 'Should have no error');
	assert(result.duration > 0, 'Should measure request duration');
});

suite.test('Authentication flow simulation', async () => {

	// Simulate authentication workflow in React app
	const authService = {
		token: null,
		user: null,
		
		api: createLuminara({
			baseURL: BASE_URL
		}),
		
		async login(credentials) {
			const response = await this.api.postJson('/json', {
				action: 'login',
				...credentials
			});
			
			// Simulate receiving auth token
			this.token = 'mock-jwt-token-' + Date.now();
			this.user = { id: 1, name: credentials.username };
			
			// Update API client with auth header
			this.api = createLuminara({
				baseURL: BASE_URL,
				headers: {
					'Authorization': `Bearer ${this.token}`
				}
			});
			
			return response;
		},
		
		async fetchUserProfile() {
			if (!this.token) {
				throw new Error('Not authenticated');
			}
			
			const response = await this.api.getJson('/json');

			return {
				...response.data,
				userId: this.user.id,
				userName: this.user.name
			};
		},
		
		logout() {
			this.token = null;
			this.user = null;
			
			// Reset API client
			this.api = createLuminara({
				baseURL: BASE_URL
			});
		}
	};
	
	// Test authentication flow
	await authService.login({ username: 'testuser', password: 'password123' });
	
	assert(authService.token !== null, 'Should have auth token after login');
	assert(authService.user !== null, 'Should have user data after login');
	
	const profile = await authService.fetchUserProfile();
	assert(profile.userId === 1, 'Should fetch user profile with auth');
	assert(profile.userName === 'testuser', 'Should include user name');
	
	authService.logout();
	assert(authService.token === null, 'Token should be cleared on logout');
	assert(authService.user === null, 'User should be cleared on logout');
});

suite.test('Error boundary simulation with retry', async () => {

	// Simulate React error boundary behavior
	const errorBoundarySimulation = {
		hasError: false,
		error: null,
		retryCount: 0,
		maxRetries: 3,
		
		api: createLuminara({
			baseURL: BASE_URL,
			retry: 0 // Handle retries manually in component
		}),
		
		async tryFetch(endpoint) {
			this.hasError = false;
			this.error = null;
			
			try {
				const response = await this.api.getJson(endpoint);

				// Don't reset retryCount here - let the calling code manage it
				return response;
			} catch (error) {
				this.hasError = true;
				this.error = error;
				throw error;
			}
		},
		
		async handleRetry(endpoint) {
			if (this.retryCount >= this.maxRetries) {
				throw new Error('Max retries exceeded');
			}
			
			this.retryCount++;
			
			// Wait before retry (exponential backoff)
			const delay = Math.pow(2, this.retryCount - 1) * 1000;
			await new Promise(resolve => setTimeout(resolve, delay));
			
			return await this.tryFetch(endpoint);
		}
	};
	
	// Test error handling with successful retry
	try {
		await errorBoundarySimulation.tryFetch('/json?status=500');
		assert(false, 'Should fail on first attempt');
	} catch (error) {
		assert(errorBoundarySimulation.hasError === true, 'Should register error');
		assert(errorBoundarySimulation.retryCount === 0, 'Retry count should start at 0');
	}
	
	// Simulate user clicking retry (should succeed on mock server)
	const retryResponse = await errorBoundarySimulation.handleRetry('/json');
	
	assert(retryResponse.status === 200, 'Retry should succeed');
	assert(errorBoundarySimulation.hasError === false, 'Error should be cleared on success');
	assert(errorBoundarySimulation.retryCount === 1, 'Should track retry attempts');
});

suite.test('Pagination component simulation', async () => {

	// Simulate pagination in a React component
	const paginationComponent = {
		api: createLuminara({
			baseURL: BASE_URL
		}),
		
		currentPage: 1,
		pageSize: 10,
		totalItems: 0,
		items: [],
		loading: false,
		
		async fetchPage(page = 1) {
			this.loading = true;
			this.currentPage = page;
			
			try {
				const response = await this.api.getJson('/json', {
					query: {
						page: page,
						size: this.pageSize,
						_simulate: 'pagination'
					}
				});
				
				// Simulate pagination response structure
				this.items = response.data ? [response.data] : [];
				this.totalItems = 100; // Mock total
				this.loading = false;
				
				return {
					items: this.items,
					page: this.currentPage,
					totalPages: Math.ceil(this.totalItems / this.pageSize)
				};
			} catch (error) {
				this.loading = false;
				throw error;
			}
		},
		
		async nextPage() {
			const totalPages = Math.ceil(this.totalItems / this.pageSize);
			if (this.currentPage < totalPages) {
				return await this.fetchPage(this.currentPage + 1);
			}

			return null;
		},
		
		async previousPage() {
			if (this.currentPage > 1) {
				return await this.fetchPage(this.currentPage - 1);
			}

			return null;
		}
	};
	
	// Test pagination flow
	const firstPage = await paginationComponent.fetchPage(1);
	assert(firstPage.page === 1, 'Should fetch first page');
	assert(firstPage.totalPages === 10, 'Should calculate total pages');
	assert(paginationComponent.loading === false, 'Loading should be complete');
	
	const secondPage = await paginationComponent.nextPage();
	assert(secondPage.page === 2, 'Should advance to second page');
	assert(paginationComponent.currentPage === 2, 'Should update current page');
	
	const backToFirst = await paginationComponent.previousPage();
	assert(backToFirst.page === 1, 'Should go back to first page');
});

suite.test('Real-time data updates simulation', async () => {

	// Simulate polling for real-time updates
	const realTimeComponent = {
		api: createLuminara({
			baseURL: BASE_URL,
			timeout: 2000
		}),
		
		polling: false,
		pollInterval: 1000,
		pollTimer: null,
		data: null,
		lastUpdate: null,
		
		async startPolling() {
			this.polling = true;
			await this.poll(); // Initial fetch
			
			this.pollTimer = setInterval(async () => {
				if (this.polling) {
					await this.poll();
				}
			}, this.pollInterval);
		},
		
		async poll() {
			try {
				const response = await this.api.getJson('/json', {
					query: { timestamp: Date.now() }
				});
				
				this.data = response.data;
				this.lastUpdate = new Date();
				
				return response;
			} catch (error) {
				console.error('Polling error:', error.message);

				// Continue polling despite errors
			}
		},
		
		stopPolling() {
			this.polling = false;
			if (this.pollTimer) {
				clearInterval(this.pollTimer);
				this.pollTimer = null;
			}
		}
	};
	
	// Test polling functionality
	await realTimeComponent.startPolling();
	
	assert(realTimeComponent.polling === true, 'Polling should be active');
	assert(realTimeComponent.data !== null, 'Should have initial data');
	assert(realTimeComponent.lastUpdate !== null, 'Should have update timestamp');
	
	// Wait for at least one poll cycle
	await new Promise(resolve => setTimeout(resolve, 1200));
	
	realTimeComponent.stopPolling();
	
	assert(realTimeComponent.polling === false, 'Polling should be stopped');
	assert(realTimeComponent.pollTimer === null, 'Timer should be cleared');
});

suite.test('Bulk operations simulation', async () => {

	// Simulate bulk data operations like batch uploads
	const bulkComponent = {
		api: createLuminara({
			baseURL: BASE_URL,
			timeout: 30000 // Longer timeout for bulk operations
		}),
		
		async processBatch(items, batchSize = 5) {
			const results = [];
			const errors = [];
			
			// Process items in batches
			for (let i = 0; i < items.length; i += batchSize) {
				const batch = items.slice(i, i + batchSize);
				const batchPromises = batch.map(async (item, index) => {
					try {
						const response = await this.api.postJson('/json', {
							item: item,
							batchIndex: Math.floor(i / batchSize),
							itemIndex: index
						});

						return { success: true, item, response: response.data };
					} catch (error) {
						return { success: false, item, error: error.message };
					}
				});
				
				const batchResults = await Promise.all(batchPromises);
				
				batchResults.forEach(result => {
					if (result.success) {
						results.push(result);
					} else {
						errors.push(result);
					}
				});
				
				// Small delay between batches to avoid overwhelming server
				if (i + batchSize < items.length) {
					await new Promise(resolve => setTimeout(resolve, 100));
				}
			}
			
			return { results, errors, total: items.length };
		}
	};
	
	// Test bulk processing
	const testItems = [
		{ id: 1, name: 'Item 1' },
		{ id: 2, name: 'Item 2' },
		{ id: 3, name: 'Item 3' },
		{ id: 4, name: 'Item 4' },
		{ id: 5, name: 'Item 5' },
		{ id: 6, name: 'Item 6' }
	];
	
	const result = await bulkComponent.processBatch(testItems, 3);
	
	assert(result.total === 6, 'Should process all items');
	assert(result.results.length === 6, 'All items should succeed with mock server');
	assert(result.errors.length === 0, 'Should have no errors with mock server');
	
	// Verify batch structure
	result.results.forEach((item, index) => {
		assert(item.success === true, `Item ${index} should be successful`);
		assert(item.item.id === index + 1, `Item ${index} should have correct ID`);
	});
});

// Run tests if this file is executed directly
await runTestSuiteIfDirect(import.meta.url, 'React Application Simulation', suite, mockServer);

export { suite, mockServer };
