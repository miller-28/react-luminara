# Cookie Jar Plugin

**Package**: [`luminara-cookie-jar`](https://www.npmjs.com/package/luminara-cookie-jar)

Automatic `Cookie` / `Set-Cookie` header management for server-side environments using [tough-cookie](https://github.com/salesforce/tough-cookie).

Perfect for Node.js, SSR applications, CLI tools, and test harnesses where cookies aren't automatically managed by the browser.

## 📦 Installation

```bash
npm install luminara-cookie-jar
```

## 🚀 Quick Example

```javascript
import { createLuminara } from 'luminara';
import { cookieJarPlugin } from 'luminara-cookie-jar';

const client = createLuminara({
  baseURL: 'https://api.example.com',
  plugins: [cookieJarPlugin()]
});

// Login request sets cookies automatically
await client.post('/login', { username: 'user', password: 'pass' });

// Subsequent requests include cookies automatically
await client.get('/profile');  // Cookies sent automatically!
```

## 🔗 Resources

- 📖 **Full Documentation**: [luminara-cookie-jar README](https://github.com/miller-28/luminara-cookie-jar#readme)
- 📦 **npm Package**: [luminara-cookie-jar](https://www.npmjs.com/package/luminara-cookie-jar)
- 🏠 **Back to Plugins**: [Plugin System Overview](./README.md)
