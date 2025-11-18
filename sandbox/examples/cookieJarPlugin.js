import { createLuminara } from '../../dist/index.mjs';

export const cookieJarPlugin = {
	title: '🍪 Cookie Jar Plugin',
	docUrl: 'https://github.com/miller-28/luminara/blob/master/docs/plugins/cookie-jar.md',
	examples: [
		{
			id: 'cookie-jar-basic',
			title: 'Basic Cookie Management',
			code: `import { createLuminara } from 'luminara';
import { cookieJarPlugin } from 'luminara-cookie-jar';

const client = createLuminara({
  baseURL: 'https://api.example.com',
  plugins: [cookieJarPlugin()]
});

// Login request sets cookies automatically
await client.post('/login', { 
  username: 'user', 
  password: 'pass' 
});

// Subsequent requests include cookies automatically
const profile = await client.getJson('/profile');
console.log('Profile:', profile.data);`,
			run: async (updateOutput, signal, options = {}) => {
				try {
					// Try to import the plugin from CDN
					const { cookieJarPlugin: plugin } = await import('https://cdn.skypack.dev/luminara-cookie-jar');
					
					const client = createLuminara({
						baseURL: 'https://httpbingo.org',
						plugins: [plugin()],
						verbose: options.verbose || false
					});

					updateOutput('🔐 Simulating login with cookie...\n');
					
					// Simulate login by manually setting a cookie
					await client.jar.setCookie(
						'session=demo_session_12345; Path=/; HttpOnly',
						'https://httpbingo.org'
					);

					updateOutput('✅ Cookie set: session=demo_session_12345\n\n');

					// Make request - cookie will be sent automatically
					updateOutput('📤 Making authenticated request...\n');
					const response = await client.getJson('/headers', { signal });

					const cookieHeader = response.data.headers?.Cookie || 'No cookies sent';
					
					return `✅ Cookie automatically sent!\n\nCookie Header: ${cookieHeader}\n\n🍪 Cookies in jar: ${(await client.jar.getCookies('https://httpbingo.org')).length}`;
				} catch (err) {
					if (err.code === 'ERR_MODULE_NOT_FOUND') {
						return '⚠️  luminara-cookie-jar plugin not installed\n\nTo try this example:\nnpm install luminara-cookie-jar\n\nLearn more: https://www.npmjs.com/package/luminara-cookie-jar';
					}
					throw err;
				}
			}
		},
		{
			id: 'cookie-jar-manual',
			title: 'Manual Cookie Operations',
			code: `import { createLuminara } from 'luminara';
import { cookieJarPlugin } from 'luminara-cookie-jar';

const client = createLuminara({
  baseURL: 'https://api.example.com',
  plugins: [cookieJarPlugin()]
});

// Set cookies manually
await client.jar.setCookie(
  'session=abc123; Path=/; HttpOnly',
  'https://api.example.com'
);

// Get all cookies
const cookies = await client.jar.getCookies('https://api.example.com');
console.log('Cookies:', cookies);

// Get cookie string for request
const cookieString = await client.jar.getCookieString('https://api.example.com');
console.log('Cookie header:', cookieString);

// Remove all cookies
await client.jar.removeAllCookies();`,
			run: async (updateOutput, signal, options = {}) => {
				try {
					const { cookieJarPlugin: plugin } = await import('https://cdn.skypack.dev/luminara-cookie-jar');
					
					const client = createLuminara({
						baseURL: 'https://httpbingo.org',
						plugins: [plugin()],
						verbose: options.verbose || false
					});

					const url = 'https://httpbingo.org';
					
					// Set multiple cookies
					updateOutput('📝 Setting cookies manually...\n');
					await client.jar.setCookie('session=abc123; Path=/; HttpOnly', url);
					await client.jar.setCookie('user_id=12345; Path=/; Max-Age=3600', url);
					await client.jar.setCookie('theme=dark; Path=/', url);

					updateOutput('✅ Set 3 cookies\n\n');

					// Get all cookies
					const allCookies = await client.jar.getCookies(url);
					updateOutput(`🍪 Total cookies: ${allCookies.length}\n`);
					allCookies.forEach(cookie => {
						updateOutput(`   - ${cookie.key}=${cookie.value}\n`);
					});

					// Get cookie string
					const cookieString = await client.jar.getCookieString(url);
					updateOutput(`\n📋 Cookie header: ${cookieString}\n\n`);

					// Remove all cookies
					await client.jar.removeAllCookies();
					const remaining = await client.jar.getCookies(url);
					
					return `🗑️  Removed all cookies\n✅ Remaining: ${remaining.length}`;
				} catch (err) {
					if (err.code === 'ERR_MODULE_NOT_FOUND') {
						return '⚠️  luminara-cookie-jar plugin not installed\n\nTo try this example:\nnpm install luminara-cookie-jar\n\nLearn more: https://www.npmjs.com/package/luminara-cookie-jar';
					}
					throw err;
				}
			}
		},
		{
			id: 'cookie-jar-shared',
			title: 'Shared Cookie Jar',
			code: `import { createLuminara } from 'luminara';
import { cookieJarPlugin } from 'luminara-cookie-jar';
import { CookieJar } from 'tough-cookie';

// Create shared jar
const sharedJar = new CookieJar();

// Two clients sharing the same jar
const client1 = createLuminara({
  baseURL: 'https://api.example.com',
  plugins: [cookieJarPlugin({ jar: sharedJar })]
});

const client2 = createLuminara({
  baseURL: 'https://api.example.com',
  plugins: [cookieJarPlugin({ jar: sharedJar })]
});

// Client1 logs in
await client1.post('/login', credentials);

// Client2 automatically has the session!
const profile = await client2.getJson('/profile');
console.log('Shared session works!');`,
			run: async (updateOutput, signal, options = {}) => {
				try {
					const cookieJarModule = await import('https://cdn.skypack.dev/luminara-cookie-jar');
					const { cookieJarPlugin: plugin } = cookieJarModule;
					const { CookieJar } = await import('https://cdn.skypack.dev/tough-cookie');
					
					// Create shared jar
					const sharedJar = new CookieJar();
					
					const client1 = createLuminara({
						baseURL: 'https://httpbingo.org',
						plugins: [plugin({ jar: sharedJar })],
						verbose: options.verbose || false
					});

					const client2 = createLuminara({
						baseURL: 'https://httpbingo.org',
						plugins: [plugin({ jar: sharedJar })],
						verbose: options.verbose || false
					});

					// Client1 sets cookie
					updateOutput('🔵 Client 1: Setting authentication cookie...\n');
					await client1.jar.setCookie(
						'auth_token=shared_token_789; Path=/; HttpOnly',
						'https://httpbingo.org'
					);

					const client1Cookies = await client1.jar.getCookies('https://httpbingo.org');
					updateOutput(`✅ Client 1 cookies: ${client1Cookies.length}\n\n`);

					// Client2 automatically has the same cookie
					updateOutput('🟢 Client 2: Checking shared cookies...\n');
					const client2Cookies = await client2.jar.getCookies('https://httpbingo.org');
					updateOutput(`✅ Client 2 cookies: ${client2Cookies.length}\n\n`);

					// Verify they're the same jar
					const sameJar = client1.jar === client2.jar;
					
					return `🔗 Shared jar: ${sameJar ? 'YES' : 'NO'}\n\n🍪 Both clients share the same cookies!\n   Client 1: ${client1Cookies.map(c => c.key).join(', ')}\n   Client 2: ${client2Cookies.map(c => c.key).join(', ')}`;
				} catch (err) {
					if (err.code === 'ERR_MODULE_NOT_FOUND') {
						return '⚠️  luminara-cookie-jar plugin not installed\n\nTo try this example:\nnpm install luminara-cookie-jar\n\nLearn more: https://www.npmjs.com/package/luminara-cookie-jar';
					}
					throw err;
				}
			}
		},
		{
			id: 'cookie-jar-ssr',
			title: 'SSR / Server-Side Usage',
			code: `import { createLuminara } from 'luminara';
import { cookieJarPlugin } from 'luminara-cookie-jar';

// Perfect for Node.js, SSR, CLI tools
// Cookies are NOT automatically managed in server environments
// This plugin handles Cookie / Set-Cookie headers automatically

async function handleRequest(req, res) {
  // Create per-request client
  const client = createLuminara({
    baseURL: 'https://api.backend.com',
    plugins: [cookieJarPlugin()]
  });

  // API sets session cookie
  await client.post('/auth/login', credentials);

  // Subsequent API calls include session cookie
  const userData = await client.getJson('/user/profile');
  
  res.json(userData);
}`,
			run: async (updateOutput, signal, options = {}) => {
				try {
					const { cookieJarPlugin: plugin } = await import('https://cdn.skypack.dev/luminara-cookie-jar');
					
					updateOutput('🖥️  Simulating Server-Side Request\n\n');
					
					// Simulate per-request client (like in SSR)
					const client = createLuminara({
						baseURL: 'https://httpbingo.org',
						plugins: [plugin()],
						verbose: options.verbose || false
					});

					updateOutput('1️⃣ Creating per-request client with cookie jar\n');
					updateOutput('2️⃣ Simulating backend authentication...\n\n');

					// Simulate server setting cookies
					const authResponse = await client.get('/cookies/set?session=ssr_demo_session', { signal });
					updateOutput(`✅ Backend set cookies (status: ${authResponse.status})\n\n`);

					// Check cookies in jar
					const cookies = await client.jar.getCookies('https://httpbingo.org');
					updateOutput(`3️⃣ Cookies stored in jar: ${cookies.length}\n`);
					cookies.forEach(cookie => {
						updateOutput(`   🍪 ${cookie.key}=${cookie.value}\n`);
					});

					updateOutput('\n4️⃣ Making follow-up request...\n');
					const followUpResponse = await client.getJson('/headers', { signal });
					
					const cookieHeader = followUpResponse.data.headers?.Cookie || 'none';
					
					return `✅ Cookies automatically sent!\n\n📤 Cookie header: ${cookieHeader}\n\n💡 Perfect for SSR where cookies aren't automatic!`;
				} catch (err) {
					if (err.code === 'ERR_MODULE_NOT_FOUND') {
						return '⚠️  luminara-cookie-jar plugin not installed\n\nTo try this example:\nnpm install luminara-cookie-jar\n\nLearn more: https://www.npmjs.com/package/luminara-cookie-jar';
					}
					throw err;
				}
			}
		}
	]
};
