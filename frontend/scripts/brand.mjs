// Renders the PNG brand assets from the SVG sources with Playwright's Chromium. Run: node scripts/brand.mjs
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
const dir = new URL('../public/brand/', import.meta.url);
const read = name => readFileSync(new URL(name, dir), 'utf8');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
async function png(svg, size, file, extra = '') {
  const page = await browser.newPage({ viewport: { width: size[0], height: size[1] } });
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${size[0]}px;height:${size[1]}px}${extra}</style>${svg}`);
  writeFileSync(new URL(file, dir), await page.screenshot({ omitBackground: true }));
  await page.close();
}
await png(read('app-icon.svg'), [192, 192], 'icon-192.png');
await png(read('app-icon.svg'), [512, 512], 'icon-512.png');
await png(read('app-icon-maskable.svg'), [512, 512], 'icon-maskable-512.png');
await png(read('app-icon.svg'), [180, 180], 'apple-touch-icon.png');
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(`<style>body{margin:0;width:1200px;height:630px;background:#f5f2eb;display:grid;place-items:center;font-family:'Noto Sans',system-ui,sans-serif}.b{width:760px}.t{margin-top:28px;font-size:34px;color:#5a5247;text-align:center}</style><div><div class="b">${read('logo.svg')}</div><div class="t">Report, verify and respond to forest fires.</div></div>`);
writeFileSync(new URL('og-image.png', dir), await page.screenshot());
await browser.close();
console.log('brand assets written');
