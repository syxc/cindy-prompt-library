// Run with: node .smoke.mjs (requires ego-browser).
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { once } from 'node:events';

const files = new Map(Object.entries({
  '/': ['main-view.html', 'text/html'],
  '/main-view.js': ['main-view.js', 'text/javascript'],
  '/main-view.css': ['main-view.css', 'text/css'],
}));
let data = '{}';
const server = createServer(async (req, res) => {
  if (req.url === '/kv') {
    if (req.method === 'GET') {
      res.setHeader('Content-Type', 'application/json');
      return res.end(data);
    }
    if (req.method === 'PUT') {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = Buffer.concat(chunks);
      if (body.length > 65536) return res.writeHead(413).end();
      data = body.toString();
      return res.writeHead(204).end();
    }
  }
  const file = files.get(req.url);
  if (!file) return res.writeHead(404).end();
  const [name, type] = file;
  res.setHeader('Content-Type', type + '; charset=utf-8');
  res.setHeader('Content-Security-Policy', "default-src 'self'");
  res.setHeader('Permissions-Policy', 'clipboard-read=(), clipboard-write=()');
  res.end(await readFile(new URL(name, import.meta.url)));
});
server.listen(0, '127.0.0.1');
await once(server, 'listening');

async function browser(script) {
  const child = spawn('ego-browser', ['nodejs', '-e', script], { stdio: ['ignore', 'pipe', 'inherit'] });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk; process.stdout.write(chunk); });
  const [code] = await once(child, 'close');
  return { code, output };
}

try {
  const { code, output } = await browser(`
    const assert = (await import('node:assert/strict')).default;
    const task = await taskSpace('提示词插件测试');
    console.log('SPACE=' + task.spaceId);
    const page = task.page('p1');
    const click = (css) => page.click('loc=css:' + css);
    const fill = (css, value) => page.fill('loc=css:' + css, value);
    await page.goto('http://127.0.0.1:${server.address().port}/');
    await page.waitForFunction(() => !document.querySelector('#add').disabled);
    console.log(await page.snapshot());
    await click('#add');
    await fill('#title', '写摘要');
    const body = '  第一行\\n第二行 <b>按纯文本显示</b>  ';
    await fill('#body', body);
    await click('#editor button[type=submit]');
    await page.waitForFunction(() => document.querySelector('#list h2')?.textContent === '写摘要');
    assert.equal(await page.evaluate(() => document.querySelector('.preview').textContent), body);
    assert.equal(await page.evaluate(() => !!document.querySelector('.preview b')), false);
    // Capture the selection without writing to the owner's system clipboard.
    await page.evaluate(() => document.addEventListener('copy', (event) => {
      event.preventDefault();
      const el = document.activeElement;
      window.copiedTestText = el.value?.slice(el.selectionStart, el.selectionEnd);
    }, { once: true }));
    await click('.copy');
    assert.equal(await page.evaluate(() => window.copiedTestText), body);
    await click('.edit');
    await fill('#title', '摘要新版');
    await fill('#body', '词'.repeat(23000));
    await click('#editor button[type=submit]');
    await page.waitForFunction(() => document.querySelector('#editor .error').textContent.includes('已满'));
    assert.equal(await page.evaluate(() => document.querySelector('#body').value.length), 23000);
    await fill('#body', '保留改动\\n第二行');
    await click('#editor button[type=submit]');
    await page.waitForFunction(() => document.querySelector('#list h2')?.textContent === '摘要新版');
    await page.reload();
    await page.waitForFunction(() => document.querySelector('#list h2')?.textContent === '摘要新版');
    await page.cdp('Emulation.setDeviceMetricsOverride', { width: 320, height: 640, deviceScaleFactor: 1, mobile: false });
    for (const value of ['light', 'dark']) {
      await page.cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value }] });
      const state = await page.evaluate(() => ({
        width: document.documentElement.scrollWidth,
        bg: getComputedStyle(document.querySelector('li')).backgroundColor,
      }));
      assert.ok(state.width <= 320);
      assert.equal(state.bg, value === 'dark' ? 'rgb(36, 37, 40)' : 'rgb(255, 255, 255)');
    }
    await click('.delete');
    await click('#remove .cancel');
    assert.equal(await page.evaluate(() => document.querySelector('#list').children.length), 1);
    await click('.delete');
    await click('#remove button[type=submit]');
    await page.waitForFunction(() => !document.querySelector('#empty').hidden);
    await page.reload();
    await page.waitForFunction(() => !document.querySelector('#empty').hidden);
    console.log('PASS: add, copy selection, edit, storage limit, reload, cancel, delete, light/dark at 320 px');
    console.log(await page.snapshot());
  `);
  const id = output.match(/^SPACE=(\d+)$/m)?.[1];
  if (id && code === 0) await browser(`const task = await taskSpace(${id}); await task.finish({ keep: [] });`);
  process.exitCode = code ?? 1;
} finally {
  server.close();
}
