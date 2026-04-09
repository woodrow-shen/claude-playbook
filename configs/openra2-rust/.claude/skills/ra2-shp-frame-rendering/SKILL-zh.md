---
name: ra2-shp-frame-rendering-zh
description: SHP 裁剪 frame 渲染 — Bevy 透明像素阻擋問題、FrameOffset 持久化
---

# SHP 裁剪 Frame 渲染

## 問題 1：透明像素阻擋後方物件

Bevy 2D 中，透明 sprite 像素仍會寫入深度緩衝區，阻擋較低 z 值的物件。一個 290x192 的 SHP canvas 只有 81x101 實際像素，卻會擋住大面積的地形。

### 修復

裁剪 SHP frame 到實際像素範圍。儲存從 canvas 中心到 frame 中心的偏移量 `frame_dx`、`frame_dy`：

```
frame_center_x = frame.x + actual_width / 2
frame_center_y = frame.y + actual_height / 2
frame_dx = frame_center_x - canvas_width / 2
frame_dy = frame_center_y - canvas_height / 2
```

### 例外：橋梁 .tem 檔案

橋梁 `.tem` 檔案（ShpTS 格式但副檔名是 .tem）必須使用完整 canvas (180x120) 渲染。相鄰橋段需要重疊的 canvas 才能無縫銜接。橋梁 sprite 放在 terrain z-level，透明阻擋可以接受。

## 問題 2：FrameOffset 每幀被覆寫

`sync_actor_positions` 每幀執行並覆寫 `Transform.translation`。如果 `frame_dx`/`frame_dy` 只在 spawn 時套用到初始 Transform，下一幀就會被覆寫，導致 overlay 錯位。

### 修復

將 frame offset 存為持久的 `FrameOffset` component：

```rust
#[derive(Component, Debug, Default)]
pub struct FrameOffset { pub x: f32, pub y: f32 }
```

`sync_actor_positions` 每幀讀取並套用，與 `SpriteOffset`、`FootprintOffset`、`TerrainHeightOffset` 一同計算。確保裁剪 sprite 的定位在每幀更新後仍然正確。
