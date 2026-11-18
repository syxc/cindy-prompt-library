# 提示词

一个 Cindy 插件。新增、编辑、删除提示词，一键复制正文。数据只保存在本机，不联网。

## 安装

1. 使用 Cindy 0.1.140 或更新版本。在 Cindy 中对本仓库目录调用 `ghost_forge_pack`，生成 `.cindy` 文件。
2. 在 Cindy 的插件页导入文件，再从左侧导航打开「提示词」。

## 开发

界面使用原生 HTML、CSS 和 JavaScript，无需构建。提示词通过 Cindy 的 `/kv` 保存，整个库上限为 64 KiB。

浏览器冒烟测试：`node .smoke.mjs`（需要 Node.js 和 `ego-browser`）。

[原始提示词](PROMPT.md)
