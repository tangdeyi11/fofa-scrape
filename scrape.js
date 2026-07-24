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

// 每次抓取之间的等待时间（毫秒）。
// 目的：FOFA 服务端对同一账号 Cookie 的"并发会话数"有限制（通常只允许 1 个）。
// 即使 page.close() 关闭了浏览器标签页，服务端释放该会话状态可能存在短暂延迟，
// 紧接着立刻发起下一次请求仍有概率被判定为"并发"。加一个间隔可以规避这个窗口期。
const REQUEST_INTERVAL_MS = 5000;

/**
 * 简单的 sleep 工具函数
 * @param {number} ms 等待的毫秒数
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

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
 *
 * 关键改动说明（解决"触发并发数限制"问题）：
 * 原代码中 for...of 循环虽然是 await 串行执行，不会真正同时发起两个请求，
 * 但每次循环都用 browser.newPage() 新开一个标签页，且从未关闭上一个。
 * 于是第一个 URL 抓取完成后，那个标签页仍然留在浏览器里、仍加载着 FOFA 结果页
 * （页面里的 JS、可能的心跳/统计请求等仍在后台运行，仍占用着同一份 Cookie 会话）。
 * 紧接着第二次循环又用同一份 Cookie 开了第二个标签页发起查询。
 * 从 FOFA 服务端看，同一账号此时有两个"活跃"的查询页面同时挂着，
 * 就会被判定为触发并发数限制（多数 FOFA 账号等级只允许 1 个并发会话）。
 *
 * 修复方式：
 * 1. 每次用完当前 page 立刻 close()，保证任意时刻只有一个 page 持有该 Cookie 会话；
 * 2. 用 finally 保证无论成功还是抛异常都会关闭 page，不会遗漏；
 * 3. 关闭后再等待一小段时间，给 FOFA 服务端释放会话状态留出缓冲期，
 *    避免关闭 tab 后立刻发起下一次请求仍撞上并发窗口期。
 */
async function start() {
  // 加载 Cookie
  const cookies = loadCookies();

  // 启动 Puppeteer 浏览器（无头模式，带 sandbox 参数用于 GitHub Actions 环境）
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  // 遍历所有配置的 FOFA 查询地址（这里依然是串行执行，一次只处理一个 url）
  for (const { name, url } of urls) {
    // 为当前这次查询单独开一个标签页
    const page = await browser.newPage();
    try {
      // 设置浏览器用户代理，模拟真实浏览器请求
      await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
      );

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
    } finally {
      // 关键修复点 1：无论成功还是失败，都要关闭当前标签页，
      // 确保不会有上一次查询的页面残留在浏览器中占用 FOFA 的并发会话名额。
      await page.close();

      // 关键修复点 2：关闭后等待一段时间再进入下一次循环，
      // 给 FOFA 服务端释放会话状态留出缓冲时间，降低仍被判定为并发的概率。
      await sleep(REQUEST_INTERVAL_MS);
    }
  }

  // 所有任务完成后关闭浏览器
  await browser.close();
}

// 启动执行，并捕获未处理的异常
start().catch(console.error);
