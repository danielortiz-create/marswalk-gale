// base './' para que el sitio funcione en cualquier subcarpeta (GitHub Pages, etc.)
import { tarsProxy } from './server/tars-proxy.js';

export default { base: './', build: { chunkSizeWarningLimit: 1500 }, plugins: [tarsProxy()] };
