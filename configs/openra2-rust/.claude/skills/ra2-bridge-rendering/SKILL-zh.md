---
name: ra2-bridge-rendering-zh
description: RA2 橋梁渲染 — footprint 交錯、terrain z-level、.tem 即 ShpTS、full canvas 拼接
---

# RA2 橋梁渲染

## 問題 1：奇偶交錯偏移

橋段渲染時出現奇偶格交替錯位 — 鋸齒狀圖案。

### 根因

橋 actor (`lobrdg_b`) 的 `Building.Dimensions = "1, 3"`（1x3 格）。footprint centering 計算 1x3 區域的中心，會平移 sprite。在等距座標中，中心偏移取決於 MPos 奇偶性（奇數行 vs 偶數行），導致相鄰橋段交替偏移。

### 關鍵洞察

橋段是逐格 sprite — 每段是獨立的 actor 放在單一 CPos。不同於普通建築（一張 sprite 覆蓋整個多格 footprint），橋的 sprite 不應該做 footprint centering。

### 修復

對橋 actor 跳過 footprint offset：
```rust
if actor_def.has_trait("Building") && !is_bridge {
    // footprint centering ...
}
```

### 辨識方法

任何具有 Building trait 且逐格放置（同類型多個 actor 在相鄰格子）的 actor 都應跳過 footprint centering。橋的類型名稱：包含 `brdg` 或以 `bridge` 開頭。

## 問題 2：橋 Sprite 擋住地形

橋 actor sprite 在 actor z-level (200+) 會用透明像素擋住底下的地形 tile。

### 修復

橋 actor 使用 `terrain_z(depth, height) + 0.5` 取代 `actor_z(depth)`。放在略高於地形基底的位置，允許與水面 tile 正確合成。

## 問題 3：橋段之間的縫隙

裁剪後的橋 sprite (117x70，原始 canvas 180x120) 因為不再重疊而出現縫隙。

### 修復

橋 `.tem` 檔案使用完整 canvas 渲染 (180x120)。`pipeline_load_shp_sprite` 函數檢查 `filename.ends_with(".tem")` 來決定。完整 canvas 的 frame_dx/frame_dy = 0。

## 技術細節：.tem 檔案是 ShpTS 格式

橋的 `.tem` 檔案（例如 `lobrdg01.tem`）開頭 bytes 是 `[00, 00, ...]`，通過 ShpTS 的 zero-check。它們是真正的 ShpTS 格式：
- Canvas：180x120（3x4 等距 tile）
- 6 frames：frame 0 = 空、frame 1 = 橋板像素、frames 2-5 = 空
- Sequence 使用 `start=1`

TmpTS 解析會失敗 — header 數值作為 TmpTS 尺寸是不合理的。

## 橋的 Sequence 結構

```
lobrdg_b 的 sequence（每個引用不同的 .tem 檔案）：
  idle   -> lobrdg01.tem（完好）
  idle2  -> lobrdg02.tem（變體）
  idle3  -> lobrdg03.tem（變體）
  idle4  -> lobrdg04.tem（變體）
  adead  -> lobrdg05.tem（A 側損毀）
  bdead  -> lobrdg06.tem（B 側損毀）
  abdead -> lobrdg07.tem（完全損毀）
```

這些不是 overlay — 不要同時渲染 idle2/3/4 和 idle。

## 橋 Actor 屬性

- `Building.Dimensions`："1, 3"
- `Building.Footprint`："_ _ _"
- `RenderSprites.Palette`："terrain"（使用 isotem.pal，不是 unittem.pal）
- `WithBridgeSpriteBody`：管理損壞狀態轉換
- `GroundLevelBridge`：低橋專用 trait
