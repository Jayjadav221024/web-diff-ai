#!/opt/render/project/src/.render/bin/bash
# exit on error
set -o errexit

echo "=== Installing Server dependencies ==="
cd server
npm install

echo "=== Installing Chrome Browser for Puppeteer ==="
npx puppeteer browsers install chrome
echo "=== Chrome browser installation complete ==="
