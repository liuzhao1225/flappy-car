# Roadster 像素素材

## 最终素材

- `roadster.pixels.json`：52 × 20 逐格像素源，5 种不透明平色及透明色。每个字符对应一个像素。
- `roadster.png`：由像素源直接编码得到的 RGBA PNG。游戏按原生尺寸绘制。
- `../scripts/build-pixel-sprite.cjs`：只使用 Node 内置模块编码 PNG，不进行缩放、裁切或插值。
- 车底喷气由 `../game.js` 的 `drawExhaust` 在游戏像素网格绘制，每次有效点击持续 18 帧（60 Hz 下为 0.3 秒），包含脉冲气柱、白色核心和消散粒子。
- 车头朝右。后喷口位于后轮后方，前喷口位于前轮后方；两者分别占第 3–4、37–38 列，第 14–15 行（从 0 计数）。轮胎最低为第 16 行，喷口底端高 1 格，气柱从第 16 行衔接。
- 车身采用白色大块面、黑色窗带、银色圆盘轮毂和红色尾灯。门缝与窗柱使用单像素银灰折线，保留结构，不增加渐变和零碎高光。

重建命令：`node scripts/build-pixel-sprite.cjs roadster`。

## 参考

主参考是用户提供的白色 Roadster 悬浮侧视照片：低矮黑色玻璃车顶、平直白色车身、银色圆盘轮毂和前后向下的白蓝色气柱。游戏车头朝右。

辅助参考为用户提供的 Tesla 官方图片：

- [车尾主视觉](https://digitalassets.tesla.com/tesla-contents/image/upload/f_auto,q_auto/Roadster-01-Hero-Desktop.jpg)
- [Hidden Aero 外观](https://digitalassets.tesla.com/tesla-contents/image/upload/f_auto,q_auto/Roadster-03-Carousel-Slide-1-Desktop.jpg)
- [Ano White 白色车身](https://digitalassets.tesla.com/tesla-contents/image/upload/f_auto,q_auto/Roadster-03-Carousel-Slide-2-Desktop.jpg)
- [Gold Glazed 金色玻璃](https://digitalassets.tesla.com/tesla-contents/image/upload/f_auto,q_auto/Roadster-03-Carousel-Slide-3-Desktop.jpg)
- [Supersonic 座舱](https://digitalassets.tesla.com/tesla-contents/image/upload/f_auto,q_auto/Roadster-03-Carousel-Slide-4-Desktop.jpg)
- [Out of This World 整车](https://digitalassets.tesla.com/tesla-contents/image/upload/f_auto,q_auto/Roadster-04-World-Desktop.jpg)
- [Beyond Physics 下压力示意](https://digitalassets.tesla.com/tesla-contents/image/upload/f_auto,q_auto/Roadster-05-Graph-Desktop.jpg)
- [Defying Gravity 空中姿态](https://digitalassets.tesla.com/tesla-contents/image/upload/f_auto,q_auto/Roadster-06-Gravity-Desktop.jpg)

## 制作记录

使用内置 imagegen，将用户的悬浮照片和上述 8 张官方照片作为参考生成全尺寸平视侧面图。官方图片合为两张四图参考板，以满足单次至多 5 个参考输入的工具限制。

- [平视侧面参考](references/roadster-side-level.png)
- [完整生成提示词](references/roadster-side-level-prompt.txt)
- [官方参考板 1](references/roadster-official-board-1.png)、[官方参考板 2](references/roadster-official-board-2.png)

全尺寸图缩小后仅用于比较轮廓、轮距和门缝位置。最终在原生网格中重新安排轮廓与色块，经过多轮对比删去连续灰阶、收短喷口并补回门缝。游戏只读取逐格像素源直接编码的 PNG。放大预览使用最近邻，只用于检查像素。

最终重绘要求：依据用户悬浮侧视照片，在 52 × 20 网格重新安排白色车身、黑色车窗、圆盘轮毂、红色尾灯及车底喷口；车头朝右；保持每格单色和透明背景。
