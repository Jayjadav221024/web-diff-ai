const { join } = require('path');

/**
 * @type {import("puppeteer").Configuration}
 */
module.exports = {
  // Store Chrome inside the local project folder so Render finds it automatically
  cacheDirectory: join(__dirname, '.cache', 'puppeteer'),
};
