const path = require('path');

module.exports = {
  // Permite sobrescrever via ENV PUPPETEER_CACHE_DIR (Render)
  cacheDirectory: process.env.PUPPETEER_CACHE_DIR
    || path.join(process.cwd(), '.cache', 'puppeteer'),
};
