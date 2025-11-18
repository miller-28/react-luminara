# Luminara Plugins

Luminara's plugin system allows you to extend the HTTP client with additional functionality through a simple, hooks-based API.

## 🛠️ Creating Custom Plugins

Luminara uses an enhanced interceptor system with three lifecycle hooks:

```javascript
const myPlugin = {
  name: 'my-plugin',
  
  // Called when plugin is registered
  onAttach(client) {
    // Attach custom properties or methods to client
    client.myCustomMethod = () => console.log('Hello!');
  },
  
  // Called before each request (with retry context)
  onRequest(context) {
    // context = { req, res, error, attempt, maxRetries, statsHub, client, ... }
    // Modify context.req directly
    context.req.headers = context.req.headers || {};
    context.req.headers['X-Custom'] = 'value';
  },
  
  // Called after successful response
  onResponse(context) {
    // Transform response
    context.res.data.transformed = true;
  },
  
  // Called on response error (can trigger retry)
  onResponseError(context) {
    // Handle errors
    if (shouldRetry) throw context.error; // Triggers retry
  }
};

const client = createLuminara({
  plugins: [myPlugin]
});
```

### Plugin Execution Order

- **`onRequest`**: Left-to-right (L→R) through plugin array
- **`onResponse`**: Right-to-left (R→L) for unwinding
- **`onResponseError`**: Right-to-left (R→L) for error handling

### Best Practices

1. **Use descriptive plugin names** for debugging
2. **Keep plugins focused** on a single responsibility
3. **Handle errors gracefully** - plugins shouldn't crash requests
4. **Document your plugin** with examples and API reference
5. **Test retry compatibility** - ensure plugins work across retry attempts
6. **Use TypeScript** for better developer experience (optional)

---

## 📦 Publishing Plugins

To publish your Luminara plugin to npm:

1. **Package naming**: Use `luminara-[feature-name]` convention
2. **Peer dependencies**: Add `luminara` as a peer dependency
3. **Documentation**: Include comprehensive README with examples
4. **Testing**: Write tests for plugin functionality
5. **TypeScript**: Include type definitions if applicable

Example `package.json`:
```json
{
  "name": "luminara-my-plugin",
  "version": "1.0.0",
  "peerDependencies": {
    "luminara": ">=1.0.0"
  }
}
```

---

## 🤝 Contributing Plugins

Have you created a useful Luminara plugin? We'd love to feature it here!

Open a pull request to add your plugin to this documentation, or reach out via:
- **GitHub**: [luminara repository](https://github.com/miller-28/luminara)
- **Author**: [Jonathan Miller](https://www.linkedin.com/in/miller28/)

---

## 📚 Additional Resources

- [Interceptors Documentation](../features/interceptors.md)
- [Plugin System Architecture](../uml/04-plugin-system.puml)
- [Luminara Main Documentation](../../README.md)
