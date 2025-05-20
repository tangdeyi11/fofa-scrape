const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// 定义要抓取的 URL 列表
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
  // 启动 Puppeteer 浏览器实例，禁用沙盒机制
  const browser = await puppeteer.launch({
    headless: true, // 启动无头浏览器
    args: ['--no-sandbox', '--disable-setuid-sandbox'], // 禁用沙盒
  });

  // 遍历 URL 列表，分别抓取不同的页面内容
  for (const { name, url } of urls) {
    const page = await browser.newPage();
    
    try {
      // 访问指定的 Fofa URL
      await page.goto(url);
      
      // 等待页面加载完成
      await page.waitForSelector('body');  // 等待页面的 <body> 元素加载
      
      // 获取页面的 HTML 内容
      const html = await page.content();
      
      // 将抓取到的 HTML 内容保存到文件
      const filePath = path.join(__dirname, `${name}.txt`);  // 动态命名文件，并确保文件路径正确
      fs.writeFileSync(filePath, html);  // 保存 HTML 内容为指定的文件名

      console.log(`抓取完成，${filePath} 文件已保存！`);
      
    } catch (error) {
      console.error(`${name} 抓取失败:`, error);
    }
  }

  // 关闭浏览器实例
  await browser.close();
}

// 执行抓取操作
start().catch(console.error);
