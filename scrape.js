const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// 读取 EditThisCookie 导出的原始 Cookie 文件并转换格式
async function loadCookies(filePath) {
  const cookies = JSON.parse(fs.readFileSync(filePath, 'utf8'));

  return cookies.map(cookie => ({
    name: cookie.name,
    value: cookie.value,
    domain: cookie.domain,
    path: cookie.path || '/',
    httpOnly: cookie.httpOnly,
    secure: cookie.secure || false,
    sameSite: cookie.sameSite || 'unspecified',
  }));
}

// 启动 Puppeteer，自动化执行任务
async function fetchDataFromUrl(page, url) {
  console.log(`正在访问: ${url.name}`);

  try {
    await page.goto(url.url, { waitUntil: 'domcontentloaded' });

    // 获取完整 HTML 内容
    const html = await page.content();

    // 保存为 txt 文件，路径为仓库根目录
    const filePath = path.join(process.cwd(), `${url.name}.txt`);  // 使用 process.cwd() 获取仓库根目录
    fs.writeFileSync(filePath, html);

    console.log(`✅ 抓取完成：${filePath}`);
  } catch (err) {
    console.error(`❌ 抓取失败（${url.name}）：`, err);
  }
}

// 启动浏览器并处理多个 URL
async function run() {
  const browser = await puppeteer.launch({
    headless: false, // 可以设置为 false 来查看浏览器操作
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();

  // 设置模拟的 User-Agent 和其他 HTTP 请求头
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36');
  await page.setExtraHTTPHeaders({
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'Accept-Language': 'zh-CN,zh;q=0.9',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Site': 'same-origin',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-User': '?1',
    'Sec-Fetch-Dest': 'document',
    'Referer': 'https://fofa.info/', // 模拟来源页面，通常需要设置为目标站点
    'Accept-Encoding': 'gzip, deflate, br, zstd'
  });

  // 读取并转换 Cookie
  const cookies = await loadCookies('fofa_cookies.json'); // 假设 Cookie 文件名为 fofa_cookies.json

  // 导入 Cookie 到 Puppeteer
  await page.setCookie(...cookies);

  // 设置请求拦截器（可选，模拟请求等）
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    if (request.resourceType() === 'document') {
      request.continue();
    } else {
      request.continue();
    }
  });

  // 定义你要抓取的 URL 列表
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

  // 使用 Promise.all() 并行抓取两个 URL 数据
  await Promise.all(urls.map(url => fetchDataFromUrl(page, url)));

  // 结束时关闭浏览器
  await browser.close();
}

// 执行脚本
run().catch(console.error);
