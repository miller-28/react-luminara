import { createLuminara } from '../../src/index.js';
import { TestSuite, MockServer, assert, assertEqual } from '../testUtils.js';
import { runTestSuiteIfDirect } from '../runTestSuite.js';

const suite = new TestSuite('parseResponse Option');
const mockServer = new MockServer(4229);

// Test custom JSON parsing with prefix removal
suite.test('parseResponse can remove JSON prefix', async () => {
	const luminara = createLuminara();
	const baseURL = `http://localhost:${mockServer.port}`;
	
	const response = await luminara.get(`${baseURL}/prefix-json`, {
		parseResponse: (text) => {

			// Remove ")]}'," prefix (JSONP protection) and parse JSON
			const jsonText = text.replace(/^\)\]\}',/, '');

			return JSON.parse(jsonText);
		}
	});
	
	assert(typeof response.data === 'object', 'parseResponse should return parsed object');
	assert(response.data.message === 'Hello from API', 'parseResponse should correctly parse prefixed JSON');
});

// Test custom XML parsing
suite.test('parseResponse can parse custom formats', async () => {
	const luminara = createLuminara();
	const baseURL = `http://localhost:${mockServer.port}`;
	
	const xmlParser = (text) => {

		// Simple XML to object parser for demonstration
		if (text.includes('<')) {
			return { 
				format: 'xml', 
				content: text.substring(0, 100) + '...',
				length: text.length 
			};
		}

		// Fallback to JSON if not XML
		return JSON.parse(text);
	};

	const response = await luminara.get(`${baseURL}/xml`, {
		parseResponse: xmlParser
	});
	
	assert(response.data.format === 'xml', 'parseResponse should identify XML format');
	assert(response.data.length > 0, 'parseResponse should include content length');
});

// Test parseResponse error handling
suite.test('parseResponse errors are properly enhanced', async () => {
	const luminara = createLuminara();
	const baseURL = `http://localhost:${mockServer.port}`;
	
	const faultyParser = (text) => {
		throw new Error('Custom parser error');
	};

	try {
		await luminara.get(`${baseURL}/json`, {
			parseResponse: faultyParser
		});
		assert(false, 'Should have thrown an error');
	} catch (error) {
		assert(error.message.includes('Custom parser error'), 'Should preserve custom parser error message');
		assert(error.name === 'LuminaraError', 'Should be enhanced with LuminaraError');
	}
});

// Test parseResponse receives response object
suite.test('parseResponse receives response object', async () => {
	const luminara = createLuminara();
	const baseURL = `http://localhost:${mockServer.port}`;
	
	let receivedText = null;
	
	const inspectingParser = (text) => {
		receivedText = text;
		assert(typeof text === 'string', 'parseResponse should receive text string');
		assert(text.length > 0, 'parseResponse should receive non-empty text');

		return JSON.parse(text);
	};

	await luminara.get(`${baseURL}/json`, {
		parseResponse: inspectingParser
	});
	
	assert(receivedText !== null, 'parseResponse should have been called');
	assert(typeof receivedText === 'string', 'parseResponse should receive text data');
});

// Test parseResponse takes precedence over responseType
suite.test('parseResponse takes precedence over responseType', async () => {
	const luminara = createLuminara();
	const baseURL = `http://localhost:${mockServer.port}`;
	
	const customParser = (text) => {
		return { customParsed: true, originalData: text };
	};

	const response = await luminara.get(`${baseURL}/json`, {
		responseType: 'text', // This should be ignored
		parseResponse: customParser
	});
	
	assert(response.data.customParsed === true, 'parseResponse should take precedence');
	assert(typeof response.data.originalData === 'string', 'parseResponse should receive text data');
});

// Run tests if this file is executed directly
await runTestSuiteIfDirect(import.meta.url, 'parseResponse Option', suite, mockServer);

export { suite, mockServer };
