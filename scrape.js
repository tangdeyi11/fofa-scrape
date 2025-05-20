const fs = require('fs');
const puppeteer = require('puppeteer');

const urls = [
  {
    name: 'iptv',
    url: 'https://fofa.info/result?qbase64=InVkcHh5IiAmJiBjaXR5PSJCZWlqaW5nIiAmJiBwcm90b2NvbD0iaHR0cCI%3D'
  },
  {
    name: 'iptvdl',
    url: 'https://fofa.info/result?qbase64=InVkcHh5IiAmJiBjaXR5PSJkYWxpYW4iICYmIHByb3RvY29sPSJodHRwIg%3D%3D'
  }
];

async function scrape() {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();

  for (const { name, url } of urls) {
    await page.goto(url, { waitUntil: 'networkidle2' });

    // 获取页面的 HTML 内容
    const content = await page.content();

    // 保存到 .txt 文件
    const fileName = `${name}.txt`;  // 修改为 txt 文件
    fs.writeFileSync(fileName, content);  // 保存到当前工作目录
    console.log(`抓取内容已保存到 ${fileName}`);
  }

  await browser.close();
}

scrape();
