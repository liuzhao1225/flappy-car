# 单枚 Doge 金币样稿

用户参考：原版金色小鸟奖牌，以及朝右的 Doge 头像。用户要求先画一枚，不含 D / Ð 字母。

- 最终样稿：`../dogecoin-gold-draft.png`，44×44。
- 可编辑像素源：`../dogecoin-gold-draft.pixels.json`，每字符对应一个像素。
- 放大预览：`../../test-results/dogecoin-gold-draft-preview.png`，8 倍最近邻，仅用于观察。
- 校验：1936 格与 PNG 一一对应，6 种不透明平色，透明度只有 0 和 255。

制作采用内置 imagegen 生成单枚金币造型参考（`dogecoin-gold-design.png`）。在 44×44 网格形成限色描绘草稿，保留原奖牌的原生币边，随后逐格重画大小眼、眼内反光和短嘴，并清除中间色杂点。最终 PNG 由像素表格直接编码。

此文件保留制作时的单枚朝右样稿。游戏已使用其原生网格的朝左版本，并扩展为四种金属配色；实际图集为 `../dogecoin-medals.png`。

生成提示词见 `dogecoin-gold-design-prompt.txt`。

## 最新选择与方向

用户选定完整生成参考图的效果，要求左右翻转。内置 imagegen 编辑结果保存为 `dogecoin-gold-design-left.png`，Doge 朝左；编辑提示词见 `dogecoin-gold-flip-prompt.txt`。游戏内图集已替换为朝左的浮雕 Doge 原生像素稿，10 / 20 / 30 / 40 分依次对应铜 / 银 / 金 / 铂金。原始单枚样稿保留供追溯。
