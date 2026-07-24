// 引入所需模块
const puppeteer = require('puppeteer');  // 控制无头浏览器进行网页抓取
const fs = require('fs');                // 文件系统，用于读写文件
const path = require('path');            // 路径工具，确保跨平台路径拼接

// FOFA 查询地址配置（用于抓取不同的页面）
const urls = [
  {
    name: 'iptv',
    url: 'https://fofa.info/result?qbase64=c2VydmVyPSJ1ZHB4eSIgJiYgY2l0eT0iQmVpamluZyIgJiYgKGFzbj0iNDgwOCIgfHwgYXNuPSI0ODM3Iik=',
  },
  {
    name: 'iptvdl',
    url: 'https://fofa.info/result?qbase64=c2VydmVyPSJ1ZHB4eSIgJiYgY2l0eT0iRGFsaWFuIiAmJiBwcm90b2NvbCE9Imh0dHAi',
  },
];

/**
 * 加载 Cookie 函数（兼容 GitHub Secrets 和本地 cookies.json）
 * 返回 puppeteer 接受的 Cookie 格式数组
 */
function loadCookies() {
  let raw;

  // 优先从 GitHub Secrets 环境变量中读取（MY_COOKIES）
  if (process.env.MY_COOKIES) {
    console.log('✅ 从环境变量 MY_COOKIES 加载 Cookie');
    raw = process.env.MY_COOKIES;
  } else {
    // 如果未设置环境变量，则尝试读取本地 cookies.json（用于本地调试）
    const filePath = path.join(__dirname, 'cookies.json');
    if (!fs.existsSync(filePath)) {
      console.error('❌ 未找到 cookies.json 文件，且未设置 MY_COOKIES 环境变量。');
      process.exit(1);
    }
    console.log('📁 从本地文件 cookies.json 加载 Cookie');
    raw = fs.readFileSync(filePath, 'utf-8');
  }

  // 解析原始 Cookie JSON，转换为 Puppeteer 格式
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

    // 如果有过期时间且不是 session cookie，添加 expires 字段
    if (!cookie.session && cookie.expirationDate) {
      newCookie.expires = Math.floor(cookie.expirationDate);
    }

    return newCookie;
  });
}

/**
 * 主函数，执行抓取流程
 */
async function start() {
  // 加载 Cookie
  const cookies = loadCookies();

  // 启动 Puppeteer 浏览器（无头模式，带 sandbox 参数用于 GitHub Actions 环境）
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  // 遍历所有配置的 FOFA 查询地址
  for (const { name, url } of urls) {
    const page = await browser.newPage();

    try {
      // 设置浏览器用户代理，模拟真实浏览器请求
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36');

      // 设置 Cookie（登录态）
      await page.setCookie(...cookies);

      // 跳转到 FOFA 查询结果页面，等待页面加载完成
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

      // 等待页面主要内容加载（可视为简单加载确认）
      await page.waitForSelector('body');

      // 获取整个页面 HTML 内容
      const html = await page.content();

      // 写入本地文件（iptv.txt、iptvdl.txt 等）
      const filePath = path.join(__dirname, `${name}.txt`);
      fs.writeFileSync(filePath, html);
      console.log(`✅ 抓取完成：${filePath}`);
    } catch (err) {
      // 如果抓取失败，写入错误信息到对应的输出文件，避免 GitHub Actions 整体失败
      const filePath = path.join(__dirname, `${name}.txt`);
      const errorMsg = `❌ 抓取失败：${err.message || err.toString()}`;
      fs.writeFileSync(filePath, errorMsg);
      console.error(`❌ 抓取失败（${name}）：`, err);
      console.log(`⚠️ 写入错误信息到：${filePath}`);
    }
  }

  // 所有任务完成后关闭浏览器
  await browser.close();
}

// 启动执行，并捕获未处理的异常
start().catch(console.error);
