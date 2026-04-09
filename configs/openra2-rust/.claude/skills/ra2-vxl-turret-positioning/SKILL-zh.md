---
name: ra2-vxl-turret-positioning
description: VXL 砲塔定位 — LocalToWorld 軸交換、body-relative 錨點、scale 校準
---

# VXL 砲塔建築定位

## 問題

將預光柵化的 VXL 砲塔精靈（如 caoutp 天線）放置在建築 SHP body 上，需要將 OpenRA 的 body-local 砲塔偏移轉換為 Bevy 螢幕座標。多層座標轉換交互作用，錯誤會疊加。

## OpenRA 砲塔偏移管線

完整 C# 呼叫鏈 (Turreted.cs -> BodyOrientation.cs -> WorldRenderer.cs):

```
1. 原始偏移:     Turreted.Offset = (forward, right, up) body-local 座標
2. 旋轉:         offset.Rotate(bodyOrientation) — 標準 2D facing 旋轉
3. LocalToWorld:  (rotated.Y, -rotated.X, rotated.Z) — 等距地圖軸交換
4. 世界偏移:      加到建築 CenterPosition
5. 螢幕投影:      等距菱形投影
```

### 第 1 步: 原始偏移

從 actor 定義解析 `Turreted.Offset`，值為 body-local WDist 單位 `(forward, right, up)`。

### 第 2 步: Facing 旋轉

```rust
let angle = facing as f32 * TAU / 1024.0;
let rot_x = offset_x * cos(angle) - offset_y * sin(angle);
let rot_y = offset_x * sin(angle) + offset_y * cos(angle);
```

### 第 3 步: LocalToWorld 軸交換 (關鍵)

```rust
let world_dx = rot_y;      // body-local Y -> world X
let world_dy = -rot_x;     // body-local -X -> world Y
```

遺漏此步驟會導致多格建築產生約 75px 的 X 偏移。

### 第 4 步: 菱形投影

```rust
let off_px_x = (world_dx - world_dy) * 30.0 / 1024.0;
let off_screen_y = (world_dx + world_dy) * 15.0 / 1024.0;
let off_px_y = -off_screen_y + offset_z * 30.0 / 1024.0;
```

### 第 5 步: 套用到錨點

```rust
turret_x = anchor_x + off_px_x - sprite_origin_offset_x + calibration_x;
turret_y = anchor_y + off_px_y + sprite_origin_offset_y + calibration_y;
```

## 砲塔實體架構

VXL 砲塔是**獨立實體**（非 body 的子實體）。

### 為什麼不用子實體

- 父級 SpriteOffset 污染子級 Transform
- 等距 footprint 中心 (fp_dx) 隨 MPos stagger 變化，導致不同位置偏差不一致

### 錨點

使用 `sx + fp_dx`（建築邏輯中心），**不包含** SHP sprite_offset。
sprite_offset 只用於 body SHP 畫布，不是砲塔錨點。

## 踩過的坑

| 問題 | 誤差 | 原因 |
|------|------|------|
| 缺少 LocalToWorld 軸交換 | ~75px | body-local != world-space |
| anchor 包含 sprite_offset | ~60px | SHP 畫布偏移不該影響砲塔 |
| WPos CenterOffset 代替 fp_dx | 不一致 | MPos stagger 使偏移因位置而異 |
| VXL scale 未校準 | 2x 太大 | 需要 7/12 縮放因子 |
| 原地替換 Image | 無視覺更新 | 尺寸變更需要新 handle |

## 教訓

**永遠先讀完 OpenRA C# 完整呼叫鏈再寫 Rust。**不要猜座標系統慣例。
