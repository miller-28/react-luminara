// Browser benchmark runner - class only, no imports
class BrowserBenchmarkRunner {
	constructor() {
		this.suites = new Map();
		this.results = [];
		this.charts = {};
		
		// Verify dependencies are loaded
		if (!window.Bench) {
			console.error('Tinybench not loaded!');
			this.showError('Tinybench library not loaded. Check console for errors.');
			return;
		}
		
		if (!window.createLuminara) {
			console.error('Luminara not loaded!');
			this.showError('Luminara not loaded. Make sure to run "npm run build" first.');
			return;
		}
		
		this.setupEventListeners();
	}

	showError(message) {
		const statusEl = document.getElementById('status');
		statusEl.textContent = `❌ ${message}`;
		statusEl.className = 'status error';
		statusEl.classList.remove('hidden');
	}

	setupEventListeners() {
		document.getElementById('runAllBtn').addEventListener('click', () => this.runBenchmarks());
		document.getElementById('clearBtn').addEventListener('click', () => {
			// Track clear button click
			if (typeof gtag === 'function') {
				gtag('event', 'button_click', {
					button_type: 'benchmark_action',
					button_id: 'clear_results'
				});
			}
			this.clearResults();
		});
		document.getElementById('categorySelect').addEventListener('change', (e) => {
			// Track category selection
			if (typeof gtag === 'function') {
				gtag('event', 'button_click', {
					button_type: 'benchmark_category',
					button_id: e.target.value
				});
			}
			if (e.target.value !== 'all') {
				this.runCategory(e.target.value);
			}
		});
	}

	registerSuite(name, benchmarks) {
		this.suites.set(name, benchmarks);
	}

	async runBenchmarks() {
		const category = document.getElementById('categorySelect').value;
		const runBtn = document.getElementById('runAllBtn');
		const statusEl = document.getElementById('status');

		// Track benchmark run
		if (typeof gtag === 'function') {
			gtag('event', 'button_click', {
				button_type: 'benchmark_run',
				button_id: category
			});
		}

		runBtn.disabled = true;
		runBtn.textContent = '⏳ Running benchmarks...';
		
		this.showStatus('Running benchmarks...', 'running');
		this.results = [];

		try {
			const suitesToRun = category === 'all' 
				? Array.from(this.suites.entries())
				: [[category, this.suites.get(category)]];

			for (const [suiteName, benchmarks] of suitesToRun) {
				if (!benchmarks || !Array.isArray(benchmarks)) {
					console.warn(`Skipping ${suiteName}: benchmarks not found or invalid`);
					continue;
				}

				if (benchmarks.length === 0) {
					console.warn(`Skipping ${suiteName}: no benchmarks defined`);
					continue;
				}

				this.showStatus(`Running ${suiteName} benchmarks...`, 'running');
				
				const bench = new window.Bench({
					time: 1000,
					iterations: 10,
					warmupTime: 100,
					warmupIterations: 5
				});

				for (const benchmark of benchmarks) {
					if (!benchmark || !benchmark.fn) {
						console.warn('Skipping benchmark: invalid structure', benchmark);
						continue;
					}
					bench.add(benchmark.name, benchmark.fn);
				}

				await bench.run();

				bench.tasks.forEach(task => {
					if (!task.result) {
						console.warn(`Task ${task.name} has no result`);
						return;
					}
					
					this.results.push({
						category: suiteName,
						name: task.name,
						mean: task.result.mean || 0,
						hz: task.result.hz || 0,
						p99: task.result.p99 || 0,
						samples: task.result.samples ? task.result.samples.length : 0
					});
				});
			}

			this.showStatus(`✅ Completed ${this.results.length} benchmarks`, 'success');
			this.renderResults();
			this.renderCharts();

		} catch (error) {
			this.showStatus(`❌ Error: ${error.message}`, 'error');
			console.error('Benchmark error:', error);
		} finally {
			runBtn.disabled = false;
			runBtn.textContent = '▶️ Run All Benchmarks';
		}
	}

	async runCategory(category) {
		document.getElementById('categorySelect').value = category;
		await this.runBenchmarks();
	}

	showStatus(message, type) {
		const statusEl = document.getElementById('status');
		statusEl.textContent = message;
		statusEl.className = `status ${type}`;
		statusEl.classList.remove('hidden');
	}

	clearResults() {
		this.results = [];
		document.getElementById('resultsTable').innerHTML = '';
		document.getElementById('resultsTable').classList.add('hidden');
		document.getElementById('summary').classList.add('hidden');
		document.getElementById('charts').classList.add('hidden');
		document.getElementById('status').classList.add('hidden');
		
		// Destroy existing charts
		Object.values(this.charts).forEach(chart => chart?.destroy());
		this.charts = {};
	}

	renderResults() {
		const tableContainer = document.getElementById('resultsTable');
		const summaryContainer = document.getElementById('summary');
		
		if (this.results.length === 0) {
			return;
		}

		// Show summary
		summaryContainer.innerHTML = `
			<div class="summary-item">
				<span class="summary-label">Total Benchmarks</span>
				<span class="summary-value">${this.results.length}</span>
			</div>
			<div class="summary-item">
				<span class="summary-label">Fastest</span>
				<span class="summary-value">${this.formatTime(Math.min(...this.results.map(r => r.mean)))}</span>
			</div>
			<div class="summary-item">
				<span class="summary-label">Slowest</span>
				<span class="summary-value">${this.formatTime(Math.max(...this.results.map(r => r.mean)))}</span>
			</div>
		`;
		summaryContainer.classList.remove('hidden');

		// Render table
		const html = `
			<table>
				<thead>
					<tr>
						<th>Benchmark</th>
						<th>Category</th>
						<th>Mean</th>
						<th>P99</th>
						<th>Ops/sec</th>
						<th>Samples</th>
					</tr>
				</thead>
				<tbody>
					${this.results.map(result => `
						<tr>
							<td class="benchmark-name">${result.name}</td>
							<td><span style="color: var(--text-secondary); font-size: 0.9rem;">${result.category}</span></td>
							<td class="metric-value">${this.formatTime(result.mean)}</td>
							<td class="metric-value">${this.formatTime(result.p99)}</td>
							<td class="metric-highlight">${this.formatOps(result.hz)}</td>
							<td class="metric-value">${result.samples}</td>
						</tr>
					`).join('')}
				</tbody>
			</table>
		`;

		tableContainer.innerHTML = html;
		tableContainer.classList.remove('hidden');
	}

	renderCharts() {
		const chartsContainer = document.getElementById('charts');
		chartsContainer.classList.remove('hidden');

		// Destroy existing charts
		Object.values(this.charts).forEach(chart => chart?.destroy());

		// Sort results by ops/sec for better visualization
		const sortedResults = [...this.results].sort((a, b) => b.hz - a.hz).slice(0, 15);

		// Ops/sec chart
		const opsCtx = document.getElementById('opsChart').getContext('2d');
		this.charts.ops = new Chart(opsCtx, {
			type: 'bar',
			data: {
				labels: sortedResults.map(r => r.name.substring(0, 40) + (r.name.length > 40 ? '...' : '')),
				datasets: [{
					label: 'Operations per Second',
					data: sortedResults.map(r => r.hz),
					backgroundColor: 'rgba(99, 102, 241, 0.6)',
					borderColor: 'rgba(99, 102, 241, 1)',
					borderWidth: 1
				}]
			},
			options: {
				indexAxis: 'y',
				responsive: true,
				maintainAspectRatio: false,
				plugins: {
					legend: { display: false }
				},
				scales: {
					x: {
						grid: { color: 'rgba(255, 255, 255, 0.1)' },
						ticks: { color: '#a1a1aa' }
					},
					y: {
						grid: { display: false },
						ticks: { color: '#a1a1aa' }
					}
				}
			}
		});

		// Mean time chart
		const meanCtx = document.getElementById('meanChart').getContext('2d');
		this.charts.mean = new Chart(meanCtx, {
			type: 'bar',
			data: {
				labels: sortedResults.map(r => r.name.substring(0, 40) + (r.name.length > 40 ? '...' : '')),
				datasets: [{
					label: 'Mean Execution Time (ms)',
					data: sortedResults.map(r => r.mean),
					backgroundColor: 'rgba(139, 92, 246, 0.6)',
					borderColor: 'rgba(139, 92, 246, 1)',
					borderWidth: 1
				}]
			},
			options: {
				indexAxis: 'y',
				responsive: true,
				maintainAspectRatio: false,
				plugins: {
					legend: { display: false }
				},
				scales: {
					x: {
						grid: { color: 'rgba(255, 255, 255, 0.1)' },
						ticks: { color: '#a1a1aa' }
					},
					y: {
						grid: { display: false },
						ticks: { color: '#a1a1aa' }
					}
				}
			}
		});
	}

	formatTime(ms) {
		if (ms < 0.001) {
			return `${(ms * 1000000).toFixed(2)} ns`;
		}
		if (ms < 1) {
			return `${(ms * 1000).toFixed(2)} μs`;
		}
		if (ms < 1000) {
			return `${ms.toFixed(2)} ms`;
		}
		return `${(ms / 1000).toFixed(2)} s`;
	}

	formatOps(ops) {
		if (ops >= 1000000) {
			return `${(ops / 1000000).toFixed(2)}M ops/s`;
		}
		if (ops >= 1000) {
			return `${(ops / 1000).toFixed(2)}K ops/s`;
		}
		return `${ops.toFixed(0)} ops/s`;
	}
}

// Export the class as default
export default BrowserBenchmarkRunner;
