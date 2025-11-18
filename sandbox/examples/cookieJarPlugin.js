import { createLuminara } from '../../dist/index.mjs';

export const cookieJarPlugin = {
	title: '🍪 Cookie Jar Plugin',
	docUrl: 'https://github.com/miller-28/luminara/blob/master/docs/plugins/cookie-jar.md',
	examples: [
		{
			id: 'cookie-jar-server-side-only',
			title: 'Server-Side Only Plugin',
			code: `import { createLuminara } from 'luminara';
import { cookieJarPlugin } from 'luminara-cookie-jar';

// ⚠️ SERVER-SIDE ONLY (Node.js, SSR, CLI tools)
// Browsers have built-in cookie management
// This plugin is for environments WITHOUT automatic cookies

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
			run: async (updateOutput) => {
				updateOutput('⚠️  SERVER-SIDE ONLY PLUGIN\n\n');
				updateOutput('This plugin is designed for server-side environments:\n');
				updateOutput('  • Node.js applications\n');
				updateOutput('  • Server-Side Rendering (SSR)\n');
				updateOutput('  • CLI tools and scripts\n');
				updateOutput('  • Backend services\n\n');
				updateOutput('🌐 Browsers have BUILT-IN cookie management!\n\n');
				updateOutput('Browsers automatically:\n');
				updateOutput('  ✅ Store cookies from Set-Cookie headers\n');
				updateOutput('  ✅ Send cookies with matching requests\n');
				updateOutput('  ✅ Handle cookie expiration and security\n\n');
				updateOutput('💡 You do NOT need this plugin in browser environments.\n\n');
				updateOutput('📦 npm: luminara-cookie-jar\n');
				return '📖 See documentation for server-side usage examples';
			}
		}
	]
};
