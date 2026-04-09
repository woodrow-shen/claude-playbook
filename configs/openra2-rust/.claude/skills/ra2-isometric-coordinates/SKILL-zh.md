---
name: ra2-isometric-coordinates-zh
description: RA2 等距座標系陷阱 — world_to_screen vs cell_to_screen、WPos 半格偏移
---

# RA2 等距座標系統

## 座標類型

- **CPos** — 格子位置（等距網格）。用於遊戲邏輯。
- **MPos** — 地圖位置（矩形儲存索引）。用於 tile 陣列。
- **WPos** — 世界位置（整數，每格 1448 單位）。用於亞格精度。

關鍵常數：`TILE_SCALE = 1448`，半格 = 724。

## 問題：15px Y 軸偏移

`world_to_screen(WPos::from_cpos(c))` 比 `cell_to_screen(c)` 多出 15px Y 偏移。

### 根因

`WPos::from_cpos` 加了 724（半格）來將位置居中在格子內：
```
WPos.x = 724 + cpos.x * 1448
WPos.y = 724 + cpos.y * 1448
```

除回來：`cx = WPos.x / 1448 = cpos.x + 0.5`。這額外的 0.5 讓螢幕位置偏移 15px。

### 修復

除以 TILE_SCALE 後，cx 和 cy 都減去 0.5：
```rust
let cx = pos.x as f32 / TILE_SCALE as f32 - 0.5;
let cy = pos.y as f32 / TILE_SCALE as f32 - 0.5;
```

## 規則：不要混用座標函數

所有 actor 每幀都經過 `sync_actor_positions`，使用 `world_to_screen`。如果 spawn 用 `cell_to_screen` 但 sync 用 `world_to_screen`，actor 會在第二幀跳位。

修復 -0.5 後兩個函數結果相同。但規則不變：對同一 entity 始終使用同一條座標路徑。

## 等距投影公式

```
screen_x = (cx - cy) * (TILE_W / 2)    // TILE_W = 60
screen_y = (cx + cy) * (TILE_H / 2)    // TILE_H = 30
```

Bevy Y 軸向上：取反 screen_y。地形高度：Y 加上 `height * 15.0`。

## MPos 奇偶性

MPos 轉換：`v = cpos.x + cpos.y`，`u = (v - (v&1))/2 - cpos.y`。

`v&1` 項代表奇偶行的映射不同。這個奇偶性會影響多格建築的 footprint 中心計算 — 中心偏移取決於參考格是在 MPos 的奇數行還是偶數行。
