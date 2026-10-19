# Dogecoin 奖牌

使用用户选定并要求朝左的浮雕 Doge 造型：[选定参考图](references/dogecoin-gold-design-left.png)。将已有的 44×44 原生网格稿逐行左右翻转，保留尖耳、大小眼及眼内反光、鼻子、嘴角和颈部轮廓；整枚币分别使用铜、银、金、铂金配色。按用户要求不绘制 D / Ð 字母，使用不透明平色与透明背景，不插值缩小大图。

- `dogecoin-medals.pixels.json`：四帧横排像素源，每格对应一个 PNG 像素。
- `dogecoin-medals.png`：176×44 图集，每帧 44×44，每枚币使用 6 种不透明平色，已替换游戏实际加载的文件。
- 帧顺序：铂金（40 分）、金（30 分）、银（20 分）、铜（10 分）。低于 10 分无奖牌，沿用原有门槛。
- 游戏结算页与最高分页面共用 `drawScorePanel`，在原奖牌位置按 44×44 原生尺寸绘制，保留闪光动画。
- 重建：`node scripts/build-pixel-sprite.cjs dogecoin-medals`。

四帧使用同一浮雕柴犬形状，硬币外圈和币面一起随金属颜色变化。原始 Flappy Bird 图集保持原样，游戏使用独立的 Dogecoin 素材。

验证页面 `test-results/doge-medals-in-game.html` 为四种分数构造独立测试场景，通过实际 `game.js` 绘制结算面板，不修改用户最高分存档。尺寸、透明度和像素值校验记录在 `test-results/doge-medals-validation.json`。
