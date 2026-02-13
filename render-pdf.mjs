import puppeteer from 'puppeteer';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox']
});

const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080 });

const htmlPath = path.join(__dirname, 'pitch-deck.html');
await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle0', timeout: 60000 });

// Wait for fonts
await page.evaluate(() => document.fonts.ready);
await new Promise(r => setTimeout(r, 2000));

const outputPath = path.join(__dirname, 'Percolator-Pitch-Deck.pdf');
await page.pdf({
  path: outputPath,
  width: '1920px',
  height: '1080px',
  printBackground: true,
  preferCSSPageSize: false,
  margin: { top: 0, right: 0, bottom: 0, left: 0 }
});

console.log(`PDF saved to: ${outputPath}`);
await browser.close();
