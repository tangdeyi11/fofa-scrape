const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// FOFA 查询地址数组
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

// 读取 EditThisCookie 导出的 cookies.json 文件并转换为 Puppeteer 格式
function loadCookies(filePath) {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const originalCookies = JSON.parse(raw);
  return originalCookies.map(cookie => {
    const newCookie = {
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain,
      path: cookie.path,
      httpOnly: cookie.httpOnly,
      secure: cookie.secure,
    };
    if (!cookie.session && cookie.expirationDate) {
      newCookie.expires = Math.floor(cookie.expirationDate);
    }
    return newCookie;
  });
}

async function start() {
  const cookiesPath = path.join(__dirname, 'cookies.json');
  if (!fs.existsSync(cookiesPath)) {
    console.error('❌ 未找到 cookies.json 文件，请将通过 EditThisCookie 导出的 Cookie 文件命名为 cookies.json 放到脚本目录。');
    process.exit(1);
  }

  const cookies = loadCookies(cookiesPath);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  for (const { name, url } of urls) {
    const page = await browser.newPage();

    try {
      // 设置用户代理模拟真实浏览器访问
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36');

      // 设置 Cookie
      await page.setCookie(...cookies);

      // 访问 FOFA 页面
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

      // 等待页面加载完成
      await page.waitForSelector('body');

      // 获取完整页面 HTML
      const html = await page.content();

      // 写入文件
      const filePath = path.join(__dirname, `${name}.txt`);
      fs.writeFileSync(filePath, html);
      console.log(`✅ 抓取完成：${filePath}`);
    } catch (err) {
      // 抓取失败也生成文件，避免 GitHub Actions 出错
      const filePath = path.join(__dirname, `${name}.txt`);
      const errorMsg = `❌ 抓取失败：${err.message || err.toString()}`;
      fs.writeFileSync(filePath, errorMsg);
      console.error(`❌ 抓取失败（${name}）：`, err);
      console.log(`⚠️ 写入错误信息到：${filePath}`);
    }
  }

  await browser.close();
}

start().catch(console.error);
