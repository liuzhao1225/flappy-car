# Flappy Roadster

本地纯前端版本：HTML、CSS、原生 JavaScript、Canvas，零运行依赖，所有图片和音效均在本地。

在线访问：[flappy-car.xiaoke.ai](https://flappy-car.xiaoke.ai/) · [GitHub Pages](https://liuzhao1225.github.io/flappy-car/)

## 运行

使用 Node.js 22.13 或更新版本。执行 `npm ci --registry=https://registry.npmmirror.com`，再执行 `npx wrangler d1 migrations apply flappy-car --local` 初始化本地数据库。分别运行 `npm run dev:api`（8787 端口）和 `npm start`（5173 端口），访问 http://127.0.0.1:5173。开发环境仅连接本地数据库。

点击开始按钮进入准备页，再点击画面、触摸或按空格 / ↑ 喷气上升。P / Esc 暂停和继续，M 切换音效。最高分保存在当前浏览器的 localStorage 中。切换标签页或离开窗口会自动暂停。

## 还原范围

- 288 × 512 经典竖屏画布，等比缩放，保留背景、地面、数字与原始音效。
- 按用户提供的悬浮照片与平视侧面参考，在 52 × 20 原生像素网格以 5 种平色绘制白色 Roadster、黑色玻璃、圆盘轮毂、门缝与车底喷口；喷口底端高于轮胎下沿 1 格。
- 每次有效点击触发 18 帧白蓝色向下喷气，气柱收短后消散；碰撞或重新开局时停止显示。
- 点击起跳时车身平滑回正到水平，上升时保持水平；下降时逐渐低头。
- 上下障碍使用 52 × 320 原生像素星舰助推器素材：银色箭体、结构环和黑色喷口簇，喷口朝向通道；障碍宽度、通道间距和矩形碰撞区域沿用原版参数。
- 车辆碰撞轮廓从原生图片的非透明像素生成，随车身旋转，覆盖车头、车尾和轮胎；透明留白和喷气不参与碰撞。触地和顶部起跳限制也按实际车身判断。
- 固定 60 Hz 物理更新、碰撞闪白、下坠、结算动画、最高分和 10 / 20 / 30 / 40 分奖牌。
- 奖牌使用选定的朝左浮雕 Doge，44×44 原生像素，整枚硬币的铜、银、金、铂金配色分别对应 10 / 20 / 30 / 40 分，币面不含 D / Ð 字母。
- 主菜单的成绩按钮打开总榜 / 好友榜，结算后可保存成绩分享图。
- 物理参考原版反混淆项目 reFlappy 的 original 分支，保留 float32 速度、整数位置、起跳及旋转规则；参数与轨迹见 [PHYSICS.md](PHYSICS.md)。未运行原版 APK 做逐帧视频校验。

## 发布

推送到 `main` 后，GitHub Actions 运行测试、构建 `dist/` 并发布到 GitHub Pages。`npm run build` 只复制游戏运行所需文件及来源许可，参考图、像素源、开发脚本和测试截图不进入站点。`version.json` 记录发布提交及文件 SHA-256，供线上版本校验。

GitHub Pages 绑定 `flappy-car.xiaoke.ai`，Cloudflare DNS 的同名 CNAME 指向 `liuzhao1225.github.io`。GitHub Pages 默认地址会跳转到自定义域名。

身份与成绩服务位于 `flappy-car-api.xiaoke.ai`，使用 Cloudflare Worker `flappy-car-api` 和独立 D1 数据库 `flappy-car`。`npm run deploy:api` 先应用迁移，再发布 Worker。涉及 API 的修改需先完成此发布，再推送前端；GitHub Actions 仅发布静态站点。

## 车手、好友与分享

- 首次开始游戏或打开车手页面创建固定的 8 位车手 ID，昵称可修改。身份保存在本机浏览器；“换设备 / 恢复车手”提供私密恢复码，可在其他设备恢复同一身份。恢复码拥有账号操作权限，不进入分享链接、二维码或公开接口，服务端只保存其摘要。
- 输入车手 ID 或打开对方的成绩分享页发送好友申请；接收方接受后，双方可在好友榜中比较最高分。支持撤回、忽略和移除好友。
- 每局使用服务端发放的随机种子。结算提交帧数和点击记录，服务端使用相同引擎及原生车辆轮廓复算分数后保存。重复上传同一局不会重复入榜，上传失败会显示原因并保留待上传记录，车手页可重试。
- 总榜和好友榜按各人的最高分排序，同分并列，显示前 100 名。原有本机最高分保留，在线榜单从带完整飞行记录的新版开始统计。
- `share.html?r=<成绩ID>` 展示独立成绩页，包含本次分数、昵称 / ID、最高分、当前总榜排名及 Doge 奖牌。保存图片导出 1080×1440 PNG，二维码编码该次成绩的链接，手机也可长按预览图保存。
- 复算验证游戏规则和分数一致性；它不判断玩家是否使用自动化操作。

## 检查

`npm test` 验证原版轨迹、起跳、碰撞、计分、暂停、死亡流程、操作复算，以及身份、好友权限、排名、同分和公开成绩接口。

车身逐格像素源为 `assets/roadster.pixels.json`，执行 `node scripts/build-pixel-sprite.cjs roadster` 直接编码为 `assets/roadster.png`。每个字符对应一个图片像素，绘制尺寸为 52 × 20。参考图与制作说明见 [ROADSTER-SOURCE.md](assets/ROADSTER-SOURCE.md)。

障碍逐格像素源为 `assets/starship-booster.pixels.json`，执行 `node scripts/build-pixel-sprite.cjs starship-booster` 生成 PNG。参考图与制作说明见 [STARSHIP-SOURCE.md](assets/STARSHIP-SOURCE.md)。

奖牌逐格像素源为 `assets/dogecoin-medals.pixels.json`，执行 `node scripts/build-pixel-sprite.cjs dogecoin-medals` 生成 PNG。制作说明见 [DOGECOIN-SOURCE.md](assets/DOGECOIN-SOURCE.md)。

## 来源

- [FlappyRecreator/FlappyB64bitAndroid](https://github.com/FlappyRecreator/FlappyB64bitAndroid)：原版精灵图集及坐标，保留其 [来源许可](assets/SOURCE-LICENSE.md)。本项目为本地个人学习复刻。
- [THEN00P/reFlappy](https://github.com/THEN00P/reFlappy)：原版反混淆物理与场景规则依据，具体版本和文件链接见 [PHYSICS.md](PHYSICS.md)。
- [nebez/floppybird](https://github.com/nebez/floppybird)：原始音效。保留 WAV 源文件，网页使用压缩 MP3 和 Web Audio 播放，见 [来源许可](assets/audio/SOURCE-LICENSE)。
- Flappy Bird 的原始游戏、美术和音效归 Dong Nguyen / .GEARS 所有。这里新写的网页逻辑与原作者无关联。
- QR Code Generator 1.4.4，Kazuhiko Arase，MIT 许可（保留在 `vendor/qrcode.js` 文件头）。二维码直接打开游戏首页，复制的成绩链接仍可查看成绩并添加好友。
- 中英文字体来自 [Fusion Pixel](https://github.com/TakWolf/fusion-pixel-font)，按原生 12px 整数倍绘制。按 SIL OFL 要求，分片后的派生字体重命名为 Flappy Pixel；保留 `assets/fonts/FUSION-OFL.txt`。首屏只加载约 10 KB 的界面字符，昵称所需汉字按需加载。分享图片等待对应字形加载后绘制。

字体分片可通过 `.venv/bin/pip install --index-url https://mirrors.aliyun.com/pypi/simple/ -r scripts/requirements-fonts.txt` 和 `.venv/bin/python scripts/build-fonts.py` 重建。音效可运行 `node scripts/build-audio.mjs` 重建，需要 FFmpeg。

手机页面按视口高度排版，好友和排行榜翻页展示。分享图保存后原位显示，支持长按保存。开始画面仅等待图像，首次点击开始时并行加载音效和比赛数据；弹层打开时停止后台游戏绘制，高刷新率屏幕的绘制频率跟随 60 Hz 物理步长。

`assets/atlas.js` 由 `assets/atlas.txt` 的 1024 × 1024 纹理坐标转换得到，避免直接打开本地文件时需要 fetch。
