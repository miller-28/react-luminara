import { LuminaraClient } from './core/luminara.js';
import { NativeFetchDriver } from './drivers/native/index.js';

// Simple factory that creates a default client (uses NativeFetchDriver)
export function createLuminara(config = {}) {
	const driver = NativeFetchDriver(config);
	const plugins = config.plugins || [];
	
	return new LuminaraClient(driver, plugins, config);  // Pass config to client too
}

// Re-export client, driver, and utilities for users that need custom setups
export { LuminaraClient } from './core/luminara.js';
export { NativeFetchDriver } from './drivers/native/index.js';
export { backoffStrategies, createBackoffHandler } from './drivers/native/features/retry/backoff.js';
export { 
	defaultRetryPolicy, 
	createRetryPolicy, 
	parseRetryAfter, 
	isIdempotentMethod,
	IDEMPOTENT_METHODS,
	DEFAULT_RETRY_STATUS_CODES
} from './drivers/native/features/retry/retryPolicy.js';

// Export stats system components
export { StatsHub } from './core/stats/StatsHub.js';
export { METRIC_TYPES, GROUP_BY_DIMENSIONS, TIME_WINDOWS } from './core/stats/query/schemas.js';

// Export hedging utilities
export { isHedgingError, hasHedgingMetadata } from './drivers/native/features/hedging/index.js';

// Export orchestration components (for benchmarking and advanced usage)
export { PluginPipeline } from './core/orchestration/PluginPipeline.js';
export { RetryOrchestrator } from './core/orchestration/RetryOrchestrator.js';
export { ContextBuilder } from './core/orchestration/ContextBuilder.js';
export { SignalManager } from './core/orchestration/SignalManager.js';

// Export config manager (for benchmarking and advanced usage)
export { ConfigManager } from './core/config/ConfigManager.js';
