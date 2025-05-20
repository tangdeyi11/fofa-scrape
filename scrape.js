// 引入 puppeteer 模块，用于无头浏览器抓取网页
const puppeteer = require('puppeteer');
// 引入文件系统模块，用于将网页内容写入文件
const fs = require('fs');

(async () => {
  // 启动无头浏览器
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage(); // 打开新页面

  // 定义要抓取的目标：名称 + URL
  const targets = [
    {
      name: 'iptv',
      url: 'https://fofa.info/result?qbase64=InVkcHh5IiAmJiBjaXR5PSJCZWlqaW5nIiAmJiBwcm90b2NvbD0iaHR0cCI%3D'
    },
    {
      name: 'iptvdl',
      url: 'https://fofa.info/result?qbase64=InVkcHh5IiAmJiBjaXR5PSJkYWxpYW4iICYmIHByb3RvY29sPSJodHRwIg%3D%3D'
    }
  ];

  // 依次访问每个 URL 并保存 HTML 内容
  for (const target of targets) {
    await page.goto(target.url, { waitUntil: 'networkidle2' }); // 等待页面加载完成
    const html = await page.content(); // 获取 HTML 内容
    fs.writeFileSync(`${target.name}.html`, html); // 写入本地文件
    console.log(`Saved ${target.name}.html`);
  }

  // 关闭浏览器
  await browser.close();
})();
