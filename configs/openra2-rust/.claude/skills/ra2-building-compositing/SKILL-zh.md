---
name: ra2-building-compositing-zh
description: RA2 建築需要多層 SHP sprite 合成 — idle 本體、overlay、bib 地基、flag 旗幟
---

# RA2 建築多層合成

## 問題

建築渲染時出現透明/缺失區域，只看到一層 SHP。

## 根因

RA2 建築由多層 SHP sprite 合成，不是單一 sprite。
每棟建築同時渲染多個 sequence：

- `idle` (WithSpriteBody) — 主體 SHP
- `idle-*` overlay (WithIdleOverlay) — 塔、幫浦、吊車等
- `bib` (WithBuildingBib) — 地基水泥地
- `flag` — 陣營旗幟

建築 SHP 中的透明區域是刻意設計的 — 其他圖層會填補。

## 修復方式

對每棟建築，遍歷所有符合 `bib`、`idle-*`（排除 shadow/damaged）、`flag` 的 sequence。每個 overlay 產生獨立的 Bevy entity，放在相同位置，使用各自的 SHP + frame offset。

各層 Z 排序：
- bib：`actor_z - 0.5`（在建築本體下方）
- overlay：`actor_z + 0.01`（在建築本體上方）

## Overlay 過濾規則

只有 `idle-*`（有連字號）是需要同時渲染的視覺 overlay。
`idle2`、`idle3`、`idle4`（沒有連字號）是損壞狀態或動畫變體 — 不要同時渲染。

範例：牛有 `idle1`、`idle2`（咀嚼動畫）。橋有 `idle2`、`idle3`、`idle4`（損壞變體）。都不應該合成。

## VXL 例外

部分建築（例如 caoutp）的主體是 VXL 3D 模型。SHP 圖層只是裝飾。VXL 部分（例如 `outp.vxl`）需要軟體光柵化才能產生 2D sprite — 尚未整合。
