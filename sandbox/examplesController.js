// Examples Controller - Handles example execution logic
import { basicUsage } from './examples/basicUsage.js';
import { baseUrlAndQuery } from './examples/baseUrlAndQuery.js';
import { timeout } from './examples/timeout.js';
import { retry } from './examples/retry.js';
import { backoffStrategies } from './examples/backoffStrategies.js';
import { requestHedging } from './examples/requestHedging.js';
import { debouncer } from './examples/debouncer.js';
import { interceptors } from './examples/interceptors.js';
import { customDriver } from './examples/customDriver.js';
import { responseTypes } from './examples/responseTypes.js';
import { errorHandling } from './examples/errorHandling.js';
import { verboseLogging } from './examples/verboseLogging.js';
import { stats } from './examples/stats.js';
import { rateLimiting } from './examples/rateLimiting.js';
import { deduplicator } from './examples/deduplicator.js';
import { cookieJarPlugin } from './examples/cookieJarPlugin.js';

// Aggregate all examples
export const examples = {
	basicUsage,
	baseUrlAndQuery,
	timeout,
	retry,
	backoffStrategies,
	requestHedging,
	debouncer,
	interceptors,
	responseTypes,
	errorHandling,
	customDriver,
	verboseLogging,
	stats,
	rateLimiting,
	deduplicator,
	cookieJarPlugin
};

// Examples Controller Class
export class ExamplesController {
	
	constructor() {
		this.abortControllers = new Map();
		this.verboseMode = false;
	}

	setVerboseMode(isVerbose) {
		this.verboseMode = isVerbose;
	}

	async runExample(exampleId, updateOutput, onStatusChange) {
		const example = this.findExample(exampleId);
		if (!example) {
			return;
		}

		// Create AbortController for this example
		const abortController = new AbortController();
		this.abortControllers.set(exampleId, abortController);

		// Notify UI of status change
		if (onStatusChange) {
			onStatusChange('running');
		}

		try {
			const result = await example.run(updateOutput, abortController.signal, { verbose: this.verboseMode });
			
			// Check if it was aborted
			if (abortController.signal.aborted) {
				if (onStatusChange) {
					onStatusChange('stopped');
				}

				return { status: 'stopped', message: `${example.title} was stopped by user.` };
			} else {
				if (onStatusChange) {
					onStatusChange('success');
				}

				return { status: 'success', message: result };
			}
		} catch (error) {
			if (error.name === 'AbortError' || abortController.signal.aborted) {
				if (onStatusChange) {
					onStatusChange('stopped');
				}

				return { status: 'stopped', message: `${example.title} was stopped by user.` };
			} else {
				if (onStatusChange) {
					onStatusChange('error');
				}

				return { status: 'error', message: error.message, stack: error.stack };
			}
		} finally {
			this.abortControllers.delete(exampleId);
		}
	}

	stopExample(exampleId) {
		const abortController = this.abortControllers.get(exampleId);
		if (abortController) {
			abortController.abort();
		}
	}

	async runFeature(featureKey, runExampleCallback) {
		const feature = examples[featureKey];
		if (!feature) {
			return;
		}

		const promises = feature.examples.map(example => runExampleCallback(example.id));
		await Promise.all(promises);
	}

	async runAll(runExampleCallback) {
		const allExamples = [];
		for (const feature of Object.values(examples)) {
			for (const example of feature.examples) {
				allExamples.push(runExampleCallback(example.id));
			}
		}
		await Promise.all(allExamples);
	}

	stopAll() {
		for (const [exampleId, abortController] of this.abortControllers) {
			abortController.abort();
		}
		this.abortControllers.clear();
	}

	findExample(exampleId) {
		for (const feature of Object.values(examples)) {
			const example = feature.examples.find(e => e.id === exampleId);
			if (example) {
				return example;
			}
		}

		return null;
	}

}


