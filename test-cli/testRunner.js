#!/usr/bin/env node

import { Timer } from './testUtils.js';

// Import all test suites
import { suite as basicSuite, mockServer as basicServer } from './tests/basic.test.js';
import { suite as backoffSuite, mockServer as backoffServer } from './tests/backoff.test.js';
import { suite as debouncerSuite, mockServer as debouncerServer } from './tests/debouncer.test.js';
import { suite as interceptorsSuite, mockServer as interceptorsServer } from './tests/interceptors.test.js';
import { suite as retrySuite, mockServer as retryServer } from './tests/retry.test.js';
import { suite as timeoutSuite, mockServer as timeoutServer } from './tests/timeout.test.js';
import { suite as driversSuite, mockServer as driversServer } from './tests/drivers.test.js';
import { suite as reactSuite, mockServer as reactServer } from './tests/reactSimulation.test.js';
import { suite as responseTypesSuite, mockServer as responseTypesServer } from './tests/responseTypes.test.js';
import { suite as errorsSuite, mockServer as errorsServer } from './tests/errors.test.js';
import { suite as parseResponseSuite, mockServer as parseResponseServer } from './tests/parseResponse.test.js';
import { suite as statsSuite, mockServer as statsServer } from './tests/stats.test.js';
import { suite as rateLimitSuite, mockServer as rateLimitServer } from './tests/rateLimit.test.js';
import { suite as edgeCasesSuite, mockServer as edgeCasesServer } from './tests/edgeCases.test.js';
import { suite as deduplicatorSuite, mockServer as deduplicatorServer } from './tests/deduplicator.test.js';
import { suite as hedgingSuite, mockServer as hedgingServer } from './tests/hedging.test.js';
import { suite as pluginSuite, mockServer as pluginsServer  } from './tests/plugins.test.js';

// Test suite registry
const TEST_SUITES = [
	{ name: 'Basic HTTP Operations', suite: basicSuite, server: basicServer },
	{ name: 'Backoff Strategies', suite: backoffSuite, server: backoffServer },
	{ name: 'Debouncer Feature', suite: debouncerSuite, server: debouncerServer },
	{ name: 'Interceptors', suite: interceptorsSuite, server: interceptorsServer },
	{ name: 'Retry', suite: retrySuite, server: retryServer },
	{ name: 'Rate Limiting', suite: rateLimitSuite, server: rateLimitServer },
	{ name: 'Timeout Handling', suite: timeoutSuite, server: timeoutServer },
	{ name: 'Custom Drivers', suite: driversSuite, server: driversServer },
	{ name: 'React Application Simulation', suite: reactSuite, server: reactServer },
	{ name: 'Error Handling', suite: errorsSuite, server: errorsServer },
	{ name: 'Response Types', suite: responseTypesSuite, server: responseTypesServer },
	{ name: 'parseResponse Option', suite: parseResponseSuite, server: parseResponseServer },
	{ name: 'Stats', suite: statsSuite, server: statsServer },
	{ name: 'Edge Cases', suite: edgeCasesSuite, server: edgeCasesServer },
	{ name: 'Request Deduplicator', suite: deduplicatorSuite, server: deduplicatorServer },
	{ name: 'Request Hedging', suite: hedgingSuite, server: hedgingServer },
	{ name: 'Plugins', suite: pluginSuite, server: pluginsServer }
];

// Standalone tests (no mock server needed)
const STANDALONE_TESTS = [
];

// Colors for output
const colors = {
	reset: '\x1b[0m',
	bright: '\x1b[1m',
	red: '\x1b[31m',
	green: '\x1b[32m',
	yellow: '\x1b[33m',
	blue: '\x1b[34m',
	magenta: '\x1b[35m',
	cyan: '\x1b[36m'
};

function colorize(text, color) {
	return `${colors[color]}${text}${colors.reset}`;
}

function printHeader(text) {
	const line = '='.repeat(60);
	console.log(colorize(line, 'cyan'));
	console.log(colorize(`  ${text}`, 'bright'));
	console.log(colorize(line, 'cyan'));
}

function printSeparator() {
	console.log(colorize('-'.repeat(60), 'blue'));
}

async function runAllTests() {
	const overallTimer = new Timer();
	overallTimer.mark();
	
	printHeader('LUMINARA COMPREHENSIVE TEST SUITE');
	console.log(colorize('Testing Luminara package as used in React applications\n', 'yellow'));
	
	const overallResults = {
		totalSuites: TEST_SUITES.length,
		passedSuites: 0,
		failedSuites: 0,
		totalTests: 0,
		passedTests: 0,
		failedTests: 0,
		suiteResults: []
	};
	
	// Start all mock servers
	console.log(colorize('🚀 Starting mock servers...', 'blue'));
	const serverPromises = TEST_SUITES.map(async ({ server }) => {
		await server.start();

		// Set baseUrl after server starts
		server.baseUrl = `http://localhost:${server.port}`;

		return server;
	});
	await Promise.all(serverPromises);
	console.log(colorize('✅ All mock servers started\n', 'green'));
	
	try {

		// Run each test suite
		for (const { name, suite, server } of TEST_SUITES) {
			printSeparator();
			console.log(colorize(`\n📋 Running: ${name}`, 'magenta'));
			console.log(colorize(`   Server: http://localhost:${server.port}`, 'blue'));
			
			const suiteTimer = new Timer();
			suiteTimer.mark();
			
			try {
				const results = await suite.run();
				suiteTimer.mark();
				
				const duration = suiteTimer.getDuration();
				const status = results.failed === 0 ? 'PASSED' : 'FAILED';
				const statusColor = results.failed === 0 ? 'green' : 'red';
				
				console.log(colorize(`   ✓ ${results.passed} passed, ✗ ${results.failed} failed`, 
					results.failed === 0 ? 'green' : 'yellow'));
				console.log(colorize(`   Duration: ${duration}ms`, 'blue'));
				console.log(colorize(`   Status: ${status}`, statusColor));
				
				// Update overall results
				overallResults.totalTests += results.total;
				overallResults.passedTests += results.passed;
				overallResults.failedTests += results.failed;
				
				if (results.failed === 0) {
					overallResults.passedSuites++;
				} else {
					overallResults.failedSuites++;
				}
				
				overallResults.suiteResults.push({
					name,
					...results,
					duration,
					status
				});
			} catch (error) {
				suiteTimer.mark();
				console.log(colorize(`   ❌ Suite failed to run: ${error.message}`, 'red'));
				overallResults.failedSuites++;
				overallResults.suiteResults.push({
					name,
					passed: 0,
					failed: 1,
					total: 1,
					duration: suiteTimer.getDuration(),
					status: 'ERROR',
					error: error.message
				});
			}
		}
	} finally {

		// Stop all mock servers
		console.log(colorize('\n🛑 Stopping mock servers...', 'blue'));
		const stopPromises = TEST_SUITES.map(({ server }) => server.stop());
		await Promise.all(stopPromises);
		console.log(colorize('✅ All mock servers stopped', 'green'));
	}
	
	overallTimer.mark();
	const totalDuration = overallTimer.getDuration();
	
	// Print final results
	printSeparator();
	printHeader('TEST RESULTS SUMMARY');
	
	console.log(colorize('\n📊 Overall Statistics:', 'bright'));
	console.log(`   Total Suites: ${overallResults.totalSuites}`);
	console.log(colorize(`   Passed Suites: ${overallResults.passedSuites}`, 'green'));
	console.log(colorize(`   Failed Suites: ${overallResults.failedSuites}`, 
		overallResults.failedSuites > 0 ? 'red' : 'green'));
	console.log(`   Total Tests: ${overallResults.totalTests}`);
	console.log(colorize(`   Passed Tests: ${overallResults.passedTests}`, 'green'));
	console.log(colorize(`   Failed Tests: ${overallResults.failedTests}`, 
		overallResults.failedTests > 0 ? 'red' : 'green'));
	console.log(colorize(`   Total Duration: ${totalDuration}ms`, 'blue'));
	
	// Success rate
	const suiteSuccessRate = ((overallResults.passedSuites / overallResults.totalSuites) * 100).toFixed(1);
	const testSuccessRate = ((overallResults.passedTests / overallResults.totalTests) * 100).toFixed(1);
	
	console.log(colorize('\n📈 Success Rates:', 'bright'));
	console.log(colorize(`   Suite Success Rate: ${suiteSuccessRate}%`, 
		suiteSuccessRate === '100.0' ? 'green' : 'yellow'));
	console.log(colorize(`   Test Success Rate: ${testSuccessRate}%`, 
		testSuccessRate === '100.0' ? 'green' : 'yellow'));
	
	// Detailed suite results
	console.log(colorize('\n📋 Suite Details:', 'bright'));
	overallResults.suiteResults.forEach((result, index) => {
		const statusIcon = result.status === 'PASSED' ? '✅' : 
		                  result.status === 'FAILED' ? '❌' : '⚠️';
		const statusColor = result.status === 'PASSED' ? 'green' : 'red';
		
		console.log(`   ${index + 1}. ${statusIcon} ${result.name}`);
		console.log(colorize(`      Status: ${result.status}`, statusColor));
		console.log(`      Tests: ${result.passed}/${result.total} passed`);
		console.log(`      Duration: ${result.duration}ms`);
		
		if (result.error) {
			console.log(colorize(`      Error: ${result.error}`, 'red'));
		}
	});
	
	// Final status
	const overallSuccess = overallResults.failedSuites === 0 && overallResults.failedTests === 0;
	const finalStatus = overallSuccess ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED';
	const finalColor = overallSuccess ? 'green' : 'red';
	
	printSeparator();
	console.log(colorize(`🎯 ${finalStatus}`, finalColor));
	
	if (overallSuccess) {
		console.log(colorize('🎉 Luminara is working perfectly in React applications!', 'green'));
	} else {
		console.log(colorize('⚠️  Some issues detected. Please review failed tests.', 'yellow'));
	}
	
	printSeparator();
	
	// Exit with appropriate code
	process.exit(overallSuccess ? 0 : 1);
}

// Handle command line arguments
const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
	console.log(colorize('Luminara Test Runner', 'bright'));
	console.log('\nUsage: node testRunner.js [options]');
	console.log('\nOptions:');
	console.log('  --help, -h     Show this help message');
	console.log('  --version, -v  Show version information');
	console.log('\nThis runner executes all Luminara test suites and provides');
	console.log('comprehensive validation of the package as used in React applications.');
	process.exit(0);
}

if (args.includes('--version') || args.includes('-v')) {
	console.log('Luminara Test Runner v1.0.0');
	console.log('Testing Luminara package functionality');
	process.exit(0);
}

// Run all tests
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] === __filename) {
	await runAllTests();
}