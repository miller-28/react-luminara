import { ExamplesController, examples } from './examplesController.js';

// Code Modal Manager - Handles modal display and interactions
class CodeModal {
	
	constructor() {
		this.modal = document.getElementById('code-modal');
		this.modalTitle = document.getElementById('modal-title');
		this.modalCode = document.getElementById('modal-code');
		this.closeBtn = document.getElementById('modal-close');
		this.copyBtn = document.getElementById('modal-copy');
		
		this.init();
	}

	init() {

		// Close modal on close button click
		this.closeBtn.onclick = () => this.close();
		
		// Close modal on backdrop click
		this.modal.onclick = (e) => {
			if (e.target === this.modal) {
				this.close();
			}
		};
		
		// Close modal on Escape key
		document.addEventListener('keydown', (e) => {
			if (e.key === 'Escape' && this.modal.classList.contains('show')) {
				this.close();
			}
		});
		
		// Copy code on copy button click
		this.copyBtn.onclick = () => this.copyCode();
	}

	open(title, code) {
		this.modalTitle.textContent = title;
		this.modalCode.textContent = code;
		this.modal.classList.add('show');
		document.body.style.overflow = 'hidden'; // Prevent background scroll
	}

	close() {
		this.modal.classList.remove('show');
		document.body.style.overflow = ''; // Restore scroll
	}

	async copyCode() {
		const code = this.modalCode.textContent;
		try {
			await navigator.clipboard.writeText(code);

			// Visual feedback
			const originalText = this.copyBtn.textContent;
			this.copyBtn.textContent = '✅ Copied!';
			this.copyBtn.style.background = '#48bb78';
			setTimeout(() => {
				this.copyBtn.textContent = originalText;
				this.copyBtn.style.background = '';
			}, 2000);
		} catch (err) {
			console.error('Failed to copy code:', err);
			alert('Failed to copy code to clipboard');
		}
	}

}

// UI Management - Only handles DOM manipulation and rendering
class SandboxUI {

	constructor() {
		this.container = document.getElementById('examples-container');
		this.runAllBtn = document.getElementById('run-all');
		this.clearAllBtn = document.getElementById('clear-all');
		this.verboseToggle = document.getElementById('verbose-toggle');
		this.outputElements = new Map();
		this.runButtonElements = new Map();
		this.stopButtonElements = new Map();
		
		this.examplesController = new ExamplesController();
		this.codeModal = new CodeModal();

		this.init();
	}

	init() {
		this.renderExamples();
		this.attachEventListeners();
		this.loadVerboseState();
		this.setupFeatureLinks(); // Add feature link handlers after examples are rendered
		this.setupStickyNav(); // Setup sticky navigation
	}

	// Load verbose state from localStorage
	loadVerboseState() {
		try {
			const savedVerbose = localStorage.getItem('luminara-sandbox-verbose');
			if (savedVerbose !== null) {
				const isVerbose = savedVerbose === 'true';
				this.verboseToggle.checked = isVerbose;
				this.handleVerboseToggle(isVerbose);
			}
		} catch (error) {
			console.warn('Failed to load verbose state from localStorage:', error);
		}
	}

	// Save verbose state to localStorage
	saveVerboseState(isVerbose) {
		try {
			localStorage.setItem('luminara-sandbox-verbose', isVerbose.toString());
		} catch (error) {
			console.warn('Failed to save verbose state to localStorage:', error);
		}
	}

	setupFeatureLinks() {
		const featureLinks = document.querySelectorAll('.feature-link');
		
		featureLinks.forEach(link => {
			link.addEventListener('click', (e) => {
				e.preventDefault();
				
				const targetId = link.getAttribute('href').substring(1); // Remove '#'
				const targetElement = document.getElementById(`example-${targetId}`);
				
				if (targetElement) {
					// Calculate offset for smooth scroll (account for header/padding)
					const offset = 100; // Adjust this value as needed
					const elementPosition = targetElement.getBoundingClientRect().top;
					const offsetPosition = elementPosition + window.pageYOffset - offset;
					
					window.scrollTo({
						top: offsetPosition,
						behavior: 'smooth'
					});
					
					// Add a highlight effect
					targetElement.style.transition = 'all 0.3s ease';
					targetElement.style.transform = 'scale(1.02)';
					targetElement.style.boxShadow = '0 8px 30px rgba(102, 126, 234, 0.4)';
					
					setTimeout(() => {
						targetElement.style.transform = '';
						targetElement.style.boxShadow = '';
					}, 600);
				} else {
					console.warn(`Target element not found: example-${targetId}`);
				}
			});
		});
	}

	setupStickyNav() {
		const stickyNav = document.getElementById('sticky-nav');
		const dropdown = document.getElementById('sticky-nav-dropdown');
		const featuresSection = document.querySelector('.features-list');
		
		// Populate dropdown with all examples
		for (const [featureKey, feature] of Object.entries(examples)) {
			const optgroup = document.createElement('optgroup');
			optgroup.label = feature.title;
			
			for (const example of feature.examples) {
				const option = document.createElement('option');
				option.value = example.id;
				option.textContent = example.title;
				optgroup.appendChild(option);
			}
			
			dropdown.appendChild(optgroup);
		}
		
		// Handle dropdown selection
		dropdown.addEventListener('change', (e) => {
			const exampleId = e.target.value;
			if (exampleId) {
				const targetElement = document.getElementById(`example-${exampleId}`);
				if (targetElement) {
					const offset = 120; // Account for sticky nav height
					const elementPosition = targetElement.getBoundingClientRect().top;
					const offsetPosition = elementPosition + window.pageYOffset - offset;
					
					window.scrollTo({
						top: offsetPosition,
						behavior: 'smooth'
					});
					
					// Add highlight effect
					targetElement.style.transition = 'all 0.3s ease';
					targetElement.style.transform = 'scale(1.02)';
					targetElement.style.boxShadow = '0 8px 30px rgba(102, 126, 234, 0.4)';
					
					setTimeout(() => {
						targetElement.style.transform = '';
						targetElement.style.boxShadow = '';
					}, 600);
				}
				
				// Reset dropdown
				dropdown.value = '';
			}
		});
		
		// Show/hide sticky nav based on scroll position
		const toggleStickyNav = () => {
			if (featuresSection) {
				const featuresBottom = featuresSection.getBoundingClientRect().bottom;
				if (featuresBottom < 0) {
					stickyNav.classList.add('visible');
				} else {
					stickyNav.classList.remove('visible');
				}
			}
		};
		
		window.addEventListener('scroll', toggleStickyNav);
		toggleStickyNav(); // Check initial position

		// Track when user views the features list
		const featuresList = document.querySelector('.features-list');
		if (featuresList && typeof IntersectionObserver !== 'undefined') {
			let hasTrackedFeaturesView = false;
			const featuresObserver = new IntersectionObserver((entries) => {
				entries.forEach(entry => {
					if (entry.isIntersecting && !hasTrackedFeaturesView && typeof gtag === 'function') {
						gtag('event', 'view_item', {
							content_type: 'section',
							item_id: 'features_list'
						});
						hasTrackedFeaturesView = true;
						featuresObserver.disconnect();
					}
				});
			}, { threshold: 0.3 });
			featuresObserver.observe(featuresList);
		}
	}

	renderExamples() {
		for (const [featureKey, feature] of Object.entries(examples)) {
			const section = this.createFeatureSection(featureKey, feature);
			this.container.appendChild(section);
		}
	}

	createFeatureSection(featureKey, feature) {
		const section = document.createElement('div');
		section.className = 'feature-section';
		section.id = `feature-${featureKey}`;

		const header = document.createElement('div');
		header.className = 'feature-header';

		const title = document.createElement('div');
		title.className = 'feature-title';
		title.textContent = feature.title;

		// Button container for header buttons
		const headerButtonContainer = document.createElement('div');
		headerButtonContainer.style.display = 'flex';
		headerButtonContainer.style.gap = '0.75rem';
		headerButtonContainer.style.alignItems = 'center';
		headerButtonContainer.style.flexWrap = 'wrap';

		// Map feature keys to documentation filenames
		const featureDocMap = {
			'basicUsage': 'basic-usage',
			'baseUrlAndQuery': 'base-url-query',
			'timeout': 'timeout',
			'retry': 'retry',
			'backoffStrategies': 'backoff-strategies',
			'requestHedging': 'request-hedging',
			'debouncer': 'debouncing',
			'deduplicator': 'deduplication',
			'interceptors': 'interceptors',
			'responseTypes': 'response-types',
			'errorHandling': 'error-handling',
			'customDriver': 'custom-drivers',
			'verboseLogging': 'verbose-logging',
			'stats': 'stats',
			'rateLimiting': 'rate-limiting'
		};
		
		const docFilename = featureDocMap[featureKey] || featureKey;

		// Full Documentation button
		const docsBtn = document.createElement('button');
		docsBtn.className = 'btn btn-docs';
		docsBtn.innerHTML = '📖 Full Documentation';
		docsBtn.title = 'View full documentation on GitHub';
		docsBtn.onclick = () => {
			// Track Documentation button click
			if (typeof gtag === 'function') {
				gtag('event', 'button_click', {
					button_type: 'feature_documentation',
					button_id: featureKey,
					feature_title: feature.title
				});
			}
			const docUrl = `https://github.com/miller-28/luminara/tree/master/docs/features/${docFilename}.md`;
			window.open(docUrl, '_blank', 'noopener,noreferrer');
		};
		headerButtonContainer.appendChild(docsBtn);

		const runFeatureBtn = document.createElement('button');
		runFeatureBtn.className = 'btn btn-small';
		runFeatureBtn.textContent = `▶ Run All ${feature.examples.length}`;
		runFeatureBtn.onclick = () => {
			// Track feature group run button click
			if (typeof gtag === 'function') {
				gtag('event', 'button_click', {
					button_type: 'feature_group_run',
					button_id: featureKey,
					feature_title: feature.title
				});
			}
			this.handleRunFeature(featureKey);
		};
		headerButtonContainer.appendChild(runFeatureBtn);

		header.appendChild(title);
		header.appendChild(headerButtonContainer);

		const grid = document.createElement('div');
		grid.className = 'examples-grid';

		for (const example of feature.examples) {
			const card = this.createExampleCard(example, featureKey);
			grid.appendChild(card);
		}

		section.appendChild(header);
		section.appendChild(grid);

		return section;
	}

	createExampleCard(example, featureKey) {
		const card = document.createElement('div');
		card.className = 'example-card';
		card.id = `example-${example.id}`;

		const cardHeader = document.createElement('div');
		cardHeader.className = 'example-header';

		const titleDiv = document.createElement('div');
		titleDiv.className = 'example-title';
		titleDiv.textContent = example.title;

		const buttonContainer = document.createElement('div');
		buttonContainer.style.display = 'flex';
		buttonContainer.style.gap = '6px';
		buttonContainer.style.flexWrap = 'wrap';

		const runBtn = document.createElement('button');
		runBtn.className = 'btn btn-small';
		runBtn.textContent = '▶ Run';
		runBtn.onclick = () => this.handleRunTest(example.id);
		this.runButtonElements.set(example.id, runBtn);

		const stopBtn = document.createElement('button');
		stopBtn.className = 'btn btn-small btn-stop';
		stopBtn.textContent = '⏹ Stop';
		stopBtn.style.display = 'none';
		stopBtn.onclick = () => {
			// Track Stop button click
			if (typeof gtag === 'function') {
				gtag('event', 'button_click', {
					button_type: 'example_stop',
					button_id: example.id,
					example_title: example.title
				});
			}
			this.handleStopTest(example.id);
		};
		this.stopButtonElements.set(example.id, stopBtn);

		buttonContainer.appendChild(runBtn);
		buttonContainer.appendChild(stopBtn);

		// Code button (if example has code)
		if (example.code) {
			const codeBtn = document.createElement('button');
			codeBtn.className = 'example-code-btn';
			codeBtn.innerHTML = '📄 Code';
			codeBtn.onclick = () => {
				// Track Code button click
				if (typeof gtag === 'function') {
					gtag('event', 'button_click', {
						button_type: 'example_code',
						button_id: example.id,
						example_title: example.title
					});
				}
				this.handleShowCode(example.title, example.code);
			};
			buttonContainer.appendChild(codeBtn);
		}

		cardHeader.appendChild(titleDiv);
		cardHeader.appendChild(buttonContainer);

		const output = document.createElement('pre');
		output.className = 'example-output';
		output.textContent = 'Click ▶ Run to run this example';
		this.outputElements.set(example.id, output);

		card.appendChild(cardHeader);
		card.appendChild(output);

		return card;
	}

	attachEventListeners() {
		this.runAllBtn.onclick = () => this.handleRunAll();
		this.clearAllBtn.onclick = () => this.handleClearAll();
		this.verboseToggle.addEventListener('change', (e) => this.handleVerboseToggle(e.target.checked));
	}

	// UI Handlers - delegate logic to examples controller
	handleShowCode(title, code) {
		this.codeModal.open(title, code);
	}

	async handleRunTest(testId) {
		const example = this.examplesController.findExample(testId);
		if (!example) {
			return;
		}

		const output = this.outputElements.get(testId);
		const runButton = this.runButtonElements.get(testId);
		const stopButton = this.stopButtonElements.get(testId);

		// Update output callback for live updates
		const updateOutput = (content) => {
			output.textContent = content;
		};

		// Status change callback for UI updates
		const onStatusChange = (status) => {
			switch (status) {
				case 'running':
					runButton.disabled = true;
					runButton.style.display = 'none';
					stopButton.style.display = 'inline-block';
					output.className = 'example-output running';
					output.textContent = `▶ Running ${example.title}...\nPlease wait...`;
					break;
				case 'success':
					output.className = 'example-output success';
					break;
				case 'error':
					output.className = 'example-output error';
					break;
				case 'stopped':
					output.className = 'example-output';
					break;
			}
		};

		// Track example run in Google Analytics
		if (typeof gtag === 'function') {
			gtag('event', 'button_click', {
				button_type: 'example_run',
				button_id: example.id,
				example_title: example.title
			});
		}

		// Run example
		const result = await this.examplesController.runExample(testId, updateOutput, onStatusChange);

		// Update UI based on result
		switch (result.status) {
			case 'success':
				output.textContent = `✅ Success\n\n${result.message}`;
				break;
			case 'error':
				output.textContent = `❌ Error\n\n${result.message}\n\nStack:\n${result.stack}`;
				break;
			case 'stopped':
				output.textContent = `⏹ Stopped\n\n${result.message}`;
				break;
		}

		// Reset buttons
		runButton.disabled = false;
		runButton.style.display = 'inline-block';
		stopButton.style.display = 'none';
	}

	handleStopTest(testId) {
		this.examplesController.stopExample(testId);
	}

	async handleRunFeature(featureKey) {
		await this.examplesController.runFeature(featureKey, (exampleId) => this.handleRunTest(exampleId));
	}

	async handleRunAll() {
		// Track Run All button click
		if (typeof gtag === 'function') {
			gtag('event', 'button_click', {
				button_type: 'global_control',
				button_id: 'run_all_examples'
			});
		}
		await this.examplesController.runAll((exampleId) => this.handleRunTest(exampleId));
	}

	handleClearAll() {
		// Track Clear All button click
		if (typeof gtag === 'function') {
			gtag('event', 'button_click', {
				button_type: 'global_control',
				button_id: 'clear_all'
			});
		}

		// Stop all running examples
		this.examplesController.stopAll();

		// Clear all outputs
		for (const [testId, output] of this.outputElements) {
			output.className = 'example-output';
			output.textContent = 'Click ▶ Run to run this example';
			
			// Reset buttons
			const runButton = this.runButtonElements.get(testId);
			const stopButton = this.stopButtonElements.get(testId);
			if (runButton) {
				runButton.disabled = false;
				runButton.style.display = 'inline-block';
			}
			if (stopButton) {
				stopButton.style.display = 'none';
			}
		}
	}

	handleVerboseToggle(isVerbose) {
		// Track Verbose toggle
		if (typeof gtag === 'function') {
			gtag('event', 'button_click', {
				button_type: 'global_control',
				button_id: 'verbose_toggle',
				button_state: isVerbose ? 'enabled' : 'disabled'
			});
		}

		// Save to localStorage
		this.saveVerboseState(isVerbose);

		// Update examples controller with verbose state
		this.examplesController.setVerboseMode(isVerbose);
		
		// Update UI to show verbose state
		const toggleLabel = document.querySelector('.toggle-label');
		if (isVerbose) {
			toggleLabel.textContent = '🔍 Verbose Logging (Active)';
			console.info('🔍 [Sandbox] Verbose logging enabled - check console for detailed logs');
		} else {
			toggleLabel.textContent = '🔍 Verbose Logging';
			console.info('🔍 [Sandbox] Verbose logging disabled');
		}
	}

}

// Scroll to Top Button Manager
class ScrollToTop {
	
	constructor() {
		this.button = document.getElementById('scroll-to-top');
		this.init();
	}

	init() {
		// Check initial scroll position
		this.updateVisibility();
		
		// Show/hide button based on scroll position
		window.addEventListener('scroll', () => {
			this.updateVisibility();
		});
		
		// Scroll to top on button click
		this.button.addEventListener('click', () => {
			window.scrollTo({
				top: 0,
				behavior: 'smooth'
			});
		});
	}

	updateVisibility() {
		if (window.scrollY > 300) {
			this.button.classList.add('visible');
		} else {
			this.button.classList.remove('visible');
		}
	}

}

// Footer Scroll Tracker
class FooterScrollTracker {
	constructor() {
		this.init();
	}

	init() {
		const footer = document.querySelector('.footer');
		if (footer && typeof IntersectionObserver !== 'undefined') {
			let hasTrackedFooter = false;
			const footerObserver = new IntersectionObserver((entries) => {
				entries.forEach(entry => {
					if (entry.isIntersecting && !hasTrackedFooter && typeof gtag === 'function') {
						gtag('event', 'view_item', {
							content_type: 'section',
							item_id: 'footer'
						});
						hasTrackedFooter = true;
						footerObserver.disconnect();
					}
				});
			}, { threshold: 0.5 });
			footerObserver.observe(footer);
		}
	}
}

// Scroll to Bottom Button Manager
class ScrollToBottom {
	
	constructor() {
		this.button = document.getElementById('scroll-to-bottom');
		this.init();
	}

	init() {
		// Check initial scroll position
		this.updateVisibility();
		
		// Show/hide button based on scroll position
		window.addEventListener('scroll', () => {
			this.updateVisibility();
		});
		
		// Scroll to bottom on button click
		this.button.addEventListener('click', () => {
			window.scrollTo({
				top: document.documentElement.scrollHeight,
				behavior: 'smooth'
			});
		});
	}

	updateVisibility() {
		if (window.scrollY < 100) {
			this.button.classList.add('visible');
		} else {
			this.button.classList.remove('visible');
		}
	}

}

// Initialize sandbox UI when DOM is ready
new SandboxUI();

// Initialize scroll to top button
new ScrollToTop();

// Initialize scroll to bottom button
new ScrollToBottom();

// Initialize footer scroll tracker
new FooterScrollTracker();
