const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// ✏️ 请将这里替换为你自己的 fofa_token（从浏览器中登录 FOFA 后复制）
const FOFA_TOKEN = 'eyJhbGciOiJIUzUxMiIsImtpZCI6Ik5XWTVZakF4TVRkalltSTJNRFZsWXpRM05EWXdaakF3TURVMlkyWTNZemd3TUdRd1pUTmpZUT09IiwidHlwIjoiSldUIn0.eyJpZCI6Mjg2MjU2LCJtaWQiOjEwMDE2MjI2MiwidXNlcm5hbWUiOiJEZWFu77yI6Y-e54eD77yJIiwicGFyZW50X2lkIjowLCJleHAiOjE3NDgyNDczODV9.iXllGEIf5373VsNpyAqCncW6pgZGX9rtQF4iRfyT7NE7uSi80Xqy3c7gc_1PfzoR8jmkzUhhwgZKfaop4l7WuQ';

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

async function start() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  for (const { name, url } of urls) {
    const page = await browser.newPage();

    try {
      // ✅ 设置 FOFA 登录 Cookie
      await page.setCookie({
        name: 'fofa_token',
        value: FOFA_TOKEN,
        domain: 'fofa.info',
        path: '/',
        httpOnly: false,
        secure: true,
      });

      // 访问 FOFA 页面
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

      // 等待 body 元素确保加载完成
      await page.waitForSelector('body');

      // 获取完整 HTML 内容
      const html = await page.content();

      // 保存为 txt 文件
      const filePath = path.join(__dirname, `${name}.txt`);
      fs.writeFileSync(filePath, html);

      console.log(`✅ 抓取完成：${filePath}`);
    } catch (err) {
      console.error(`❌ 抓取失败（${name}）：`, err);
    }
  }

  await browser.close();
}

start().catch(console.error);
