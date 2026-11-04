# 捏捏它 / Yellow Plush Playground

一个只有拖拽交互的黄色软胶角色网页。按住角色的脸或身体拖动，局部弹性网格会跟着牵拉；松开后回弹。拖动时表情从微笑变为吃痛。页面没有麦克风、上传、设置、账号、追踪或服务端请求。

## 本地运行

安装 Node.js 后，在项目根目录执行：

```bash
npm run dev
```

打开终端打印的本地地址。也可以将 `dist/` 目录交给任意静态文件服务器托管。

## 项目结构

- `dist/index.html`：单页结构。
- `dist/style.css`：布局与视觉样式。
- `dist/app.js`：独立编写的弹簧网格、WebGL 渲染、拖拽与回弹；没有第三方运行依赖。
- `dist/assets/smile.png`、`dist/assets/ouch.png`：原项目中的黄色角色透明 PNG。

形变在浏览器本地完成，不上传指针数据或图片。浏览器不能使用 WebGL 时仍可看静态头像，但无法拖拽形变。

## 素材与许可

角色素材由 LibTV 根据项目作者提供的黄色角色参考生成。本站借鉴了 [rameerez.com](https://rameerez.com/) 的可捏角色概念，弹性网格代码独立实现；仓库不包含该站的图片与代码。本仓库源码及随附的生成素材按 [MIT License](LICENSE) 开源。
