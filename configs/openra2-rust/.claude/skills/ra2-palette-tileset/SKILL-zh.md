---
name: ra2-palette-tileset-zh
description: RA2 調色盤選擇、玩家顏色重映射、tileset 檔名解析
---

# RA2 調色盤選擇、玩家顏色重映射與 Tileset 解析

## 調色盤選擇

RA2 使用多個調色盤。用錯調色盤會產生明顯的顏色錯誤。

### 可用調色盤

- `isotem.pal` — 地形 tile、橋梁
- `unittem.pal` — actor、建築、單位、建築疊層（預設）

### 解析規則

檢查 actor 定義的 `RenderSprites.Palette` 屬性：
- `"terrain"` -> 使用 `isotem.pal`
- `"player"` 或未設定 -> 使用 `unittem.pal`（加上玩家顏色重映射）

```rust
let render_palette = actor_def
    .trait_property("RenderSprites", "Palette")
    .unwrap_or("player");
```

### 特殊情況

- 橋梁 actor：`Palette: terrain`
- 建築 bib 地基圖層：使用 unit 調色盤（不是 terrain）。索引 40-54 在 unittem.pal 是灰色，在 isotem.pal 是橘黃色。用錯會導致灰色混凝土地基變成橘色。
- 建築 overlay 圖層（idle-*、flag）：使用與主建築本體相同的調色盤（unit 調色盤 + 玩家重映射）

## 玩家顏色重映射

RA2 調色盤索引 16-31 是可重映射的玩家顏色。這些索引存放「隊伍顏色」像素。未重映射時顯示基本調色盤顏色（unittem.pal 中為紅色）。

### 重映射機制

基於 HSV 色彩空間的顏色替換：
- 保留基本調色盤項目的原始亮度（V）
- 用玩家顏色替換色相（H）和飽和度（S）
- 結果：保留明暗細節的玩家著色像素

```rust
// palette.rs
pub const RA2_REMAP_INDICES: &[usize] = &[16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31];

let remapped = unit_pal.with_player_remap(player_color_rgb, RA2_REMAP_INDICES);
```

### 玩家顏色對應

| 擁有者 | 顏色 | RGB |
|--------|------|-----|
| Neutral | 灰色 | (110, 110, 110) |
| Multi0 | 藍色 | (0, 100, 200) |
| Multi1 | 紅色 | (200, 50, 50) |
| Multi2 | 綠色 | (50, 200, 50) |
| Multi3-7 | 黃/橘/紫/青/粉 | 各異 |

### 精靈快取

不同擁有者需要獨立的精靈貼圖，因為重映射改變了像素顏色。快取鍵必須包含擁有者：

```rust
// 快取鍵："filename:u:OwnerName"（unit 調色盤）
// 快取鍵："filename:t"（terrain 調色盤，無重映射）
let sprite_key = format!("{}:u:{}", filename, actor_ref.owner);
```

### 調色盤索引範圍（unittem.pal）

| 範圍 | 用途 | 備註 |
|------|------|------|
| 0 | 透明 | 固定 0x00000000 |
| 1-15 | 系統顏色 | 藍、黃、黑等 |
| 16-31 | 玩家重映射 | 依擁有者重映射 |
| 32-54 | 灰階梯度 | 用於混凝土、金屬、陰影 |
| 55+ | 共用顏色 | 類地形、植被等 |

### 陷阱：isotem.pal vs unittem.pal 索引差異

相同的調色盤索引在兩個調色盤中映射到不同顏色。會造成明顯 bug 的關鍵差異：

| 索引範圍 | unittem.pal | isotem.pal |
|----------|-------------|------------|
| 16-31 | 紅色梯度（玩家重映射） | 粉/紫色調 |
| 40-54 | 灰色梯度（混凝土） | 橘/棕/金色調 |

這就是建築地基（使用索引 40-54）必須用 unittem.pal 的原因：terrain 調色盤會把灰色混凝土變成橘色。

### VXL 渲染管線

VXL 模型也使用 unittem.pal，同樣需要玩家顏色重映射。有兩條程式路徑：

1. **初始生成光柵化** — spawn 時直接呼叫 `rasterize_multi()` / `rasterize()`。必須傳入擁有者重映射的調色盤，不能用基本 `unit_pal`。

2. **執行時期重新光柵化** — `rasterize_dirty_voxels()` 系統在砲塔旋轉、動畫播放時觸發。透過 `VoxelRenderData.palette_for_owner(vr.owner)` 查找正確的調色盤。

兩條路徑必須使用相同的擁有者調色盤。未重映射時，VXL 索引 16-31 會顯示為鮮紅色條紋（unittem.pal 的基本紅色），而非擁有者的顏色。

```rust
// VoxelRendered 儲存 owner 供調色盤查找
pub struct VoxelRendered {
    // ... 模型參考、面向、縮放、錨點 ...
    pub owner: String,  // 例如 "Neutral", "Multi0"
}

// VoxelRenderData 持有每個擁有者的調色盤
pub struct VoxelRenderData {
    pub palette: Palette,                          // 基本（備用）
    pub owner_palettes: HashMap<String, Palette>,  // 依擁有者重映射
}
```

## TilesetFilenames 解析

RA2 sequence 使用 `TilesetFilenames` 根據不同 tileset 解析不同的 sprite 檔案。

### 映射範例

| Tileset | 樹木前綴 | 橋梁前綴 | 建築前綴 |
|---------|---------|---------|---------|
| TEMPERATE | ct*.shp | lobrdg*.tem | ct*.shp |
| SNOW | ca*.shp | lobrdg*.sno | ca*.shp |
| URBAN | 類似 | lobrdg*.urb | 類似 |

### 解析優先順序

1. `TilesetFilenames` — 依 tileset 覆寫（最高優先）
2. `Filename` — sequence 定義中的明確檔名
3. 預設 — `{actor_type}.shp`

```rust
fn resolve_sprite_filename(seq, tileset, actor_type) -> String {
    if let Some(tsf) = &seq.tileset_filenames {
        for (ts_name, ts_file) in tsf {
            if ts_name.to_uppercase() == tileset.to_uppercase() {
                return ts_file.clone();
            }
        }
    }
    seq.filename.clone().unwrap_or_else(|| format!("{}.shp", actor_type))
}
```

### 陷阱

解析出的副檔名不代表檔案格式。橋梁 `.tem` 檔案實際上是 ShpTS 格式，不是 TmpTS。一律先嘗試 ShpTS 解析，失敗再退回 TmpTS。
