// Lets CLI scripts import app modules that are guarded with `import "server-only"`.
// Next.js enforces that guard at bundle time; outside Next it only needs to be inert.
const path = require.resolve("server-only");
require.cache[path] = { id: path, filename: path, loaded: true, exports: {} };
