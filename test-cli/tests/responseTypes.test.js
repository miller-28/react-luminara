import { createLuminara } from '../../src/index.js';
import { TestSuite, MockServer, assert, assertEqual } from '../testUtils.js';
import { runTestSuiteIfDirect } from '../runTestSuite.js';

const suite = new TestSuite('Response Types');
const mockServer = new MockServer(4233);

// Test responseType: 'text'
suite.test('responseType: text should return string', async () => {
	const luminara = createLuminara();
	const baseURL = `http://localhost:${mockServer.port}`;
	
	// Create a mock response that would normally be parsed as JSON
	const response = await luminara.get(`${baseURL}/json`, {
		responseType: 'text'
	});
	
	assert(typeof response.data === 'string', 'Response data should be a string when responseType is text');
	assert(response.data.includes('"message"'), 'Text response should contain JSON string');
});

// Test responseType: 'json'
suite.test('responseType: json should parse JSON', async () => {
	const luminara = createLuminara();
	const baseURL = `http://localhost:${mockServer.port}`;
	
	const response = await luminara.get(`${baseURL}/json`, {
		responseType: 'json'
	});
	
	assert(typeof response.data === 'object', 'Response data should be an object when responseType is json');
	assert(response.data.message === 'Success', 'JSON should be properly parsed');
});

// Test responseType: 'blob'
suite.test('responseType: blob should return Blob', async () => {

	// Skip in Node.js environment (no Blob support)
	if (typeof Blob === 'undefined') {
		return; // Test passes by skipping
	}
	
	const luminara = createLuminara();
	const baseURL = `http://localhost:${mockServer.port}`;
	
	const response = await luminara.get(`${baseURL}/json`, {
		responseType: 'blob'
	});
	
	assert(response.data instanceof Blob, 'Response data should be a Blob when responseType is blob');
});

// Test responseType: 'stream'
suite.test('responseType: stream should return ReadableStream', async () => {

	// Skip in Node.js environment (limited ReadableStream support)
	if (typeof ReadableStream === 'undefined') {
		return; // Test passes by skipping
	}
	
	const luminara = createLuminara();
	const baseURL = `http://localhost:${mockServer.port}`;
	
	const response = await luminara.get(`${baseURL}/json`, {
		responseType: 'stream'
	});
	
	assert(response.data instanceof ReadableStream, 'Response data should be a ReadableStream when responseType is stream');
});

// Test responseType: 'arrayBuffer'
suite.test('responseType: arrayBuffer should return ArrayBuffer', async () => {
	const luminara = createLuminara();
	const baseURL = `http://localhost:${mockServer.port}`;
	
	const response = await luminara.get(`${baseURL}/json`, {
		responseType: 'arrayBuffer'
	});
	
	assert(response.data instanceof ArrayBuffer, 'Response data should be an ArrayBuffer when responseType is arrayBuffer');
	assert(response.data.byteLength > 0, 'ArrayBuffer should have content');
});

// Test responseType: 'auto' (default behavior)
suite.test('responseType: auto should auto-detect JSON', async () => {
	const luminara = createLuminara();
	const baseURL = `http://localhost:${mockServer.port}`;
	
	const response = await luminara.get(`${baseURL}/json`, {
		responseType: 'auto'
	});
	
	assert(typeof response.data === 'object', 'Auto-detection should parse JSON as object');
	assert(response.data.message === 'Success', 'Auto-detected JSON should be properly parsed');
});

// Test default behavior (no responseType specified)
suite.test('no responseType should default to auto-detection', async () => {
	const luminara = createLuminara();
	const baseURL = `http://localhost:${mockServer.port}`;
	
	const response = await luminara.get(`${baseURL}/json`);
	
	assert(typeof response.data === 'object', 'Default behavior should parse JSON as object');
	assert(response.data.message === 'Success', 'Default behavior should properly parse JSON');
});

// Run tests if this file is executed directly
await runTestSuiteIfDirect(import.meta.url, 'Response Types', suite, mockServer);

export { suite, mockServer };
