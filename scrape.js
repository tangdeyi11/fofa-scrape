const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const COOKIE_FILE = path.join(__dirname, 'cookies.json');

const urls = [
  {
    name: 'iptv',
    url: 'https://fofa.info/result?qbase64=InVkcHh5IiAmJiBjaXR5PSJCZWlqaW5nIiAmJiBwcm90b2NvbD0iaHR0cCI%3D',
  },
  {
    name: 'iptvdl',
    url: 'https://fofa.info/result?qbase64=InVkcHh5IiAmJiBjaXR5PSJkYWxpYW4iICYmIHByb3RvY29sPSJodHRwIg%3D%3D',
  },
];

async function loadCookies() {
  const raw = fs.readFileSync(COOKIE_FILE, 'utf-8');
  const json = JSON.parse(raw);
  return json.map(cookie => ({
    name: cookie.name,
    value: cookie.value,
    domain: cookie.domain.replace(/^\./, ''), // 去掉开头的点
    path: cookie.path || '/',
    httpOnly: cookie.httpOnly || false,
    secure: cookie.secure || false,
  }));
}

async function start() {
  const cookies = await loadCookies();

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  for (const { name, url } of urls) {
    const page = await browser.newPage();

    try {
      // 设置 User-Agent 模拟真实用户
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36');

      // 设置 Cookie
      await page.setCookie(...cookies);

      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForSelector('body');

      const html = await page.content();
      const filePath = path.join(__dirname, `${name}.txt`);
      fs.writeFileSync(filePath, html);

      console.log(`✅ 抓取完成：${filePath}`);
    } catch (err) {
      // 抓取失败也生成文件，记录错误原因
      const filePath = path.join(__dirname, `${name}.txt`);
      const errorMsg = `❌ 抓取失败：${err.message || err.toString()}`;
      fs.writeFileSync(filePath, errorMsg);
      console.error(`❌ 抓取失败（${name}）：`, err);
    }
  }

  await browser.close();
}

start().catch(console.error);
