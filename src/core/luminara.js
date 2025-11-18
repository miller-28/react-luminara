import { NativeFetchDriver } from '../drivers/native/index.js';
import { verboseLog } from './verbose/verboseLogger.js';
import { StatsHub } from './stats/StatsHub.js';
import { StatsEventEmitter } from './stats/StatsEventEmitter.js';
import { StatsUtils } from './stats/StatsUtils.js';
import { ConfigManager } from './config/ConfigManager.js';
import { PluginPipeline } from './orchestration/PluginPipeline.js';
import { RetryOrchestrator } from './orchestration/RetryOrchestrator.js';
import { ContextBuilder } from './orchestration/ContextBuilder.js';
import { SignalManager } from './orchestration/SignalManager.js';
import { HttpVerbs } from './api/HttpVerbs.js';
import { TypedRequests } from './api/TypedRequests.js';

export class LuminaraClient {

	constructor(driver = NativeFetchDriver(), plugins = [], config = {}) {
		this.driver = driver;
		
		// Initialize stats system
		this.statsInstance = new StatsHub();
		if (config.verbose) {
			this.statsInstance.setVerbose(true);
		}
		
		// Initialize orchestration components
		this.configManager = new ConfigManager(config);
		this.statsEmitter = new StatsEventEmitter(this.configManager.get(), this.statsInstance);
		this.pluginPipeline = new PluginPipeline(plugins);
		this.retryOrchestrator = new RetryOrchestrator(driver, this.statsEmitter);
		
		// Initialize API helpers
		this.httpVerbs = new HttpVerbs(this);
		this.typedRequests = new TypedRequests(this);
		
		// Allow plugins to attach to client instance (e.g., client.jar)
		for (const plugin of plugins) {
			if (typeof plugin.onAttach === 'function') {
				plugin.onAttach(this);
			}
		}
		
		// Log client configuration
		this.configManager.logConfiguration(driver, plugins.length);
	}	/**
	 * Get the stats interface
	 */

	stats() {
		return this.statsInstance;
	}

	/**
	 * Enable stats collection
	 */
	enableStats() {
		this.statsEmitter.enable();

		return this;
	}

	/**
	 * Disable stats collection
	 */
	disableStats() {
		this.statsEmitter.disable();

		return this;
	}

	/**
	 * Check if stats are currently enabled
	 */
	isStatsEnabled() {
		return this.statsEmitter.isEnabled();
	}

	use(plugin) {
		this.pluginPipeline.add(plugin);
		
		// Allow plugin to attach to client instance (e.g., client.cookie)
		if (typeof plugin.onAttach === 'function') {
			plugin.onAttach(this);
		}
		
		// Log plugin registration if verbose is enabled globally
		const config = this.configManager.get();
		if (config.verbose) {
			verboseLog(config, 'PLUGIN', `Registered plugin: ${plugin.name || 'anonymous'}`, {
				pluginName: plugin.name || 'anonymous',
				totalPlugins: this.pluginPipeline.getAll().length,
				hasOnRequest: !!plugin.onRequest,
				hasOnResponse: !!plugin.onResponse,
				hasOnResponseError: !!plugin.onResponseError,
				hasOnAttach: !!plugin.onAttach
			});
		}
		
		return this;
	}

	async request(req) {

		// Merge global config with per-request options
		const mergedReq = this.configManager.merge(req);

		// Apply rate limiting if configured
		await this.configManager.applyRateLimit(mergedReq);

		return this.#actualRequest(mergedReq);
	}

	async #actualRequest(req) {

		// Initialize benchmark timings if enabled
		const timings = req.__benchmark ? {} : null;
		if (timings) {
			timings.start = performance.now();
		}

		// Merge global config with per-request options (per-request takes priority)
		if (timings) {
			timings.configMergeStart = performance.now();
		}
		const mergedReq = this.configManager.merge(req);
		if (timings) {
			timings.configMerge = performance.now() - timings.configMergeStart;
		}
		
		// Log driver selection if verbose is enabled
		if (mergedReq.verbose) {
			verboseLog(mergedReq, 'REQUEST', `Using ${this.driver.constructor.name || 'unknown'} driver`, {
				driver: this.driver.constructor.name || 'unknown',
				hasCustomDriver: this.driver.constructor.name !== 'NativeFetchDriver',
				driverFeatures: this.#getDriverFeatures()
			});
		}
		
		// Build request context
		if (timings) {
			timings.contextBuildStart = performance.now();
		}
		const context = ContextBuilder.build(mergedReq, this.driver);
		if (timings) {
			timings.contextBuild = performance.now() - timings.contextBuildStart;
		}
		
		// Emit stats event for request start
		if (timings) {
			timings.statsEmitStart = performance.now();
		}
		this.statsEmitter.emit('request:start', {
			id: context.meta.requestId,
			time: context.meta.requestStartTime,
			domain: StatsUtils.extractDomain(mergedReq.url),
			method: mergedReq.method || 'GET',
			endpoint: StatsUtils.normalizeEndpoint(mergedReq.method || 'GET', mergedReq.url),
			tags: mergedReq.tags || []
		});
		if (timings) {
			timings.statsEmit = performance.now() - timings.statsEmitStart;
		}

		// Merge user's AbortController signal if provided
		if (timings) {
			timings.signalMergeStart = performance.now();
		}
		SignalManager.mergeUserSignal(context, mergedReq.signal, this.statsEmitter);
		if (timings) {
			timings.signalMerge = performance.now() - timings.signalMergeStart;
		}
		
		// Set the internal signal on the request
		context.req.signal = context.controller.signal;

		// Pass timings to context for deeper instrumentation
		if (timings) {
			context.__timings = timings;
		}

		// Execute with retry orchestration
		if (timings) {
			timings.orchestrationStart = performance.now();
		}
		const result = await this.retryOrchestrator.execute(context, this.pluginPipeline);
		if (timings) {
			timings.orchestration = performance.now() - timings.orchestrationStart;
			timings.total = performance.now() - timings.start;
			// Attach timings to result
			result.__timings = timings;
		}
		
		return result;
	}

	#getDriverFeatures() {
		const features = [];
		if (this.driver.calculateRetryDelay) {
			features.push('retry-calculation');
		}
		if (this.driver.request) {
			features.push('request');
		}
		if (this.driver.constructor.name === 'NativeFetchDriver') {
			features.push('native-fetch');
		}

		return features;
	}

	// -------- Core verbs (delegate to HttpVerbs) --------
	get(url, options = {}) {
		return this.httpVerbs.get(url, options);
	}
	
	post(url, body, options = {}) {
		return this.httpVerbs.post(url, body, options);
	}
	
	put(url, body, options = {}) {
		return this.httpVerbs.put(url, body, options);
	}
	
	patch(url, body, options = {}) {
		return this.httpVerbs.patch(url, body, options);
	}
	
	del(url, options = {}) {
		return this.httpVerbs.del(url, options);
	}
	
	head(url, options = {}) {
		return this.httpVerbs.head(url, options);
	}
	
	options(url, options = {}) {
		return this.httpVerbs.options(url, options);
	}

	// -------- Typed GET helpers (delegate to TypedRequests) --------
	getText(url, options = {}) {
		return this.typedRequests.getText(url, options);
	}

	getJson(url, options = {}) {
		return this.typedRequests.getJson(url, options);
	}

	getXml(url, options = {}) {
		return this.typedRequests.getXml(url, options);
	}

	getHtml(url, options = {}) {
		return this.typedRequests.getHtml(url, options);
	}

	getBlob(url, options = {}) {
		return this.typedRequests.getBlob(url, options);
	}

	getArrayBuffer(url, options = {}) {
		return this.typedRequests.getArrayBuffer(url, options);
	}

	getNDJSON(url, options = {}) {
		return this.typedRequests.getNDJSON(url, options);
	}

	// -------- Typed POST/PUT/PATCH helpers (delegate to TypedRequests) --------
	postJson(url, data, options = {}) {
		return this.typedRequests.postJson(url, data, options);
	}

	putJson(url, data, options = {}) {
		return this.typedRequests.putJson(url, data, options);
	}

	patchJson(url, data, options = {}) {
		return this.typedRequests.patchJson(url, data, options);
	}

	postText(url, text, options = {}) {
		return this.typedRequests.postText(url, text, options);
	}

	postForm(url, data, options = {}) {
		return this.typedRequests.postForm(url, data, options);
	}

	postMultipart(url, formData, options = {}) {
		return this.typedRequests.postMultipart(url, formData, options);
	}

	postSoap(url, xmlString, options = {}) {
		return this.typedRequests.postSoap(url, xmlString, options);
	}

	// -------- Configuration management (delegate to ConfigManager) --------
	
	/**
	 * Update client configuration at runtime
	 * @param {Object} newConfig - New configuration to merge
	 */
	updateConfig(newConfig) {
		this.configManager.update(newConfig);
	}

	/**
	 * Get rate limiting statistics (if enabled)
	 * @returns {Object|null} Rate limiting statistics or null if disabled
	 */
	getRateLimitStats() {
		return this.configManager.getRateLimitStats();
	}

	/**
	 * Reset rate limiting statistics (if enabled)
	 */
	resetRateLimitStats() {
		this.configManager.resetRateLimitStats();
	}

}