const { join } = require('path');

/**
 * @type {import("puppeteer").Configuration}
 */
module.exports = {
  // Store Chrome inside the server/.cache folder so both build and run locate it
  cacheDirectory: join(__dirname, 'server', '.cache', 'puppeteer'),
};
