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

// ============ 节流与重试相关配置 ============

// 两次请求之间的最小/最大等待时间（毫秒），实际值在区间内随机取，
// 避免固定间隔过于规律，被服务端识别为脚本化的固定节奏请求。
const MIN_INTERVAL_MS = 12000; // 12 秒
const MAX_INTERVAL_MS = 20000; // 20 秒

// 触发限流（45012 请求速度过快）后的重试配置
const MAX_RETRIES = 3;              // 单个 URL 最多重试次数
const RETRY_MIN_WAIT_MS = 30000;    // 重试前最小等待时间（30 秒）
const RETRY_MAX_WAIT_MS = 60000;    // 重试前最大等待时间（60 秒）

/**
 * 简单的 sleep 工具函数
 * @param {number} ms 等待的毫秒数
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 生成一个 [min, max] 区间内的随机等待时间（毫秒）
 * @param {number} min 最小毫秒数
 * @param {number} max 最大毫秒数
 */
function randomInterval(min, max) {
  return min + Math.random() * (max - min);
}

/**
 * 判断页面 HTML 内容是否命中了 FOFA 的限流提示。
 * FOFA 在请求过快时会返回一个提示页面，其中包含错误码 45012
 * 以及"请求速度过快"字样，而不是正常的查询结果页面。
 * @param {string} html 页面 HTML 内容
 */
function isRateLimited(html) {
  return html.includes('45012') || html.includes('请求速度过快');
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
 * 对单个 URL 执行抓取，内置限流（45012）自动重试逻辑。
 *
 * 工作方式：
 * 1. 正常跳转并获取页面 HTML；
 * 2. 检查 HTML 中是否包含限流提示（45012 / 请求速度过快）；
 *    - 如果命中限流，说明这次请求被服务端拒绝而不是真正拿到了结果，
 *      此时不能把这个提示页面当成"抓取成功"写入文件，
 *      而是等待一段较长时间（30~60 秒随机）后重试；
 *    - 如果多次重试仍然限流，则抛出异常，交给上层写入错误信息；
 * 3. 一旦拿到正常内容（不含限流提示），立即返回。
 *
 * @param {import('puppeteer').Page} page Puppeteer 页面对象
 * @param {string} url 要抓取的 FOFA 查询地址
 * @param {string} name 用于日志标识的名称（如 'iptv'）
 * @returns {Promise<string>} 页面 HTML 内容
 */
async function fetchWithRetry(page, url, name) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    // 跳转到 FOFA 查询结果页面，等待页面加载完成
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

    // 等待页面主要内容加载（可视为简单加载确认）
    await page.waitForSelector('body');

    // 获取整个页面 HTML 内容
    const html = await page.content();

    if (isRateLimited(html)) {
      const waitMs = randomInterval(RETRY_MIN_WAIT_MS, RETRY_MAX_WAIT_MS);
      console.warn(
        `⚠️ [${name}] 第 ${attempt}/${MAX_RETRIES} 次请求触发限流（45012），` +
        `等待 ${Math.round(waitMs / 1000)} 秒后重试...`
      );

      if (attempt === MAX_RETRIES) {
        // 已达最大重试次数，仍然限流，放弃并交给上层处理
        throw new Error('多次重试后仍触发限流（45012 请求速度过快）');
      }

      await sleep(waitMs);
      continue; // 进入下一次重试
    }

    // 未命中限流提示，视为正常内容，直接返回
    return html;
  }
}

/**
 * 主函数，执行抓取流程
 *
 * 相比上一版的改动说明：
 * 1. 固定的 5 秒间隔改为 12~20 秒随机间隔，降低请求节奏的规律性，
 *    避免被 FOFA 判定为脚本化的高频请求（对应本次遇到的 45012 限流）；
 * 2. 新增 fetchWithRetry：即使某次请求命中限流提示页面，也不会把这个
 *    提示页面当成正常结果写入文件，而是等待更长时间后自动重试，
 *    多次重试仍失败才会真正报错；
 * 3. 保留上一版已经修复的问题：每次抓取完立刻 page.close()，
 *    避免同一账号 Cookie 同时被多个标签页占用而触发"并发数限制"。
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

      // 带限流自动重试的抓取
      const html = await fetchWithRetry(page, url, name);

      // 写入本地文件（iptv.txt、iptvdl.txt 等）
      const filePath = path.join(__dirname, `${name}.txt`);
      fs.writeFileSync(filePath, html);
      console.log(`✅ 抓取完成：${filePath}`);
    } catch (err) {
      // 如果抓取失败（包括多次重试后仍限流的情况），
      // 写入错误信息到对应的输出文件，避免 GitHub Actions 整体失败
      const filePath = path.join(__dirname, `${name}.txt`);
      const errorMsg = `❌ 抓取失败：${err.message || err.toString()}`;
      fs.writeFileSync(filePath, errorMsg);
      console.error(`❌ 抓取失败（${name}）：`, err);
      console.log(`⚠️ 写入错误信息到：${filePath}`);
    } finally {
      // 无论成功还是失败，都要关闭当前标签页，
      // 确保不会有上一次查询的页面残留在浏览器中占用 FOFA 的并发会话名额。
      await page.close();

      // 关闭后等待一段随机时间再进入下一次循环：
      // 一方面给 FOFA 服务端释放会话状态留出缓冲期（避免并发判定），
      // 另一方面降低请求节奏的规律性（避免限流判定）。
      const waitMs = randomInterval(MIN_INTERVAL_MS, MAX_INTERVAL_MS);
      console.log(`⏳ 等待 ${Math.round(waitMs / 1000)} 秒后处理下一个 URL...`);
      await sleep(waitMs);
    }
  }

  // 所有任务完成后关闭浏览器
  await browser.close();
}

// 启动执行，并捕获未处理的异常
start().catch(console.error);
