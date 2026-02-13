const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  
  await page.setViewport({ width: 1280, height: 720 });
  
  const htmlPath = path.resolve(__dirname, 'pitch-deck.html');
  await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle0', timeout: 30000 });
  
  await page.pdf({
    path: path.resolve(__dirname, 'Percolator-Pitch-Deck.pdf'),
    width: '1280px',
    height: '720px',
    printBackground: true,
    preferCSSPageSize: false,
    margin: { top: 0, right: 0, bottom: 0, left: 0 }
  });
  
  console.log('PDF generated successfully!');
  await browser.close();
})();
