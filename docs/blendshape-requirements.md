# VRMアバター用BlendShape制作依頼書

## 📊 現在取得できている顔特徴量データ

### **基本的な寸法データ**
- `eyeWidth`: 目の横幅
- `eyeHeight`: 目の縦幅
- `eyeAspectRatio`: 目の縦横比
- `noseWidth`: 鼻の横幅
- `noseHeight`: 鼻の縦幅
- `mouthWidth`: 口の横幅
- `mouthHeight`: 口の縦幅
- `faceAspectRatio`: 顔の縦横比
- `interocularDistance`: 両目の間隔

### **新しく追加された形状・角度データ**
- `eyeSlantAngle`: 目の傾斜角度（つり目・たれ目を判定）
- `browHeight`: 眉の高さ（目からの距離）
- `browAngle`: 眉の角度（上がり眉・下がり眉を判定）
- `lipThickness`: 唇の厚み（上唇と下唇の平均厚み）
- `jawSharpness`: 顎の尖り具合（0-1の値、高いほどシャープ）
- `noseProjection`: 鼻の3D突出度（鼻筋の高さ・立体感）
- `cheekFullness`: 頬のふくらみ（肉付きの良さ）

## 🎭 制作が必要なBlendShape一覧

| 優先度 | BlendShape名 | 制御する特徴 | 対応する検出データ | 効果説明 |
|--------|--------------|-------------|-------------------|----------|
| **高** | `eyeSlantUp` | つり目 | `eyeSlantAngle > 2°` | 目尻を上げる |
| **高** | `eyeSlantDown` | たれ目 | `eyeSlantAngle < -2°` | 目尻を下げる |
| **高** | `browUp` | 上がり眉 | `browAngle`が水平に近い | 眉尻を上げる |
| **高** | `browDown` | 下がり眉 | `browAngle`が-180°に近い | 眉尻を下げる（困り眉） |
| **高** | `jawSharp` | シャープな顎 | `jawSharpness > 0.7` | 顎先を尖らせる |
| **高** | `jawRound` | 丸い顎 | `jawSharpness < 0.3` | 顎を丸くする |
| **中** | `lipThick` | 厚い唇 | `lipThickness > 0.015` | 唇を厚くする |
| **中** | `lipThin` | 薄い唇 | `lipThickness < 0.008` | 唇を薄くする |
| **中** | `browHigh` | 高い眉 | `browHeight > 基準値` | 眉を上に移動 |
| **中** | `browLow` | 低い眉 | `browHeight < 基準値` | 眉を下に移動 |
| **中** | `noseHigh` | 高い鼻筋 | `noseProjection > 基準値` | 鼻を高く・立体的にする |
| **中** | `noseLow` | 低い鼻筋 | `noseProjection < 基準値` | 鼻を低く・平坦にする |
| **中** | `cheekPuff` | ふっくら頬 | `cheekFullness > 基準値` | 頬を膨らませる |
| **低** | `cheekHollow` | こけた頬 | `cheekFullness < 基準値` | 頬をへこませる |

## 🔧 既存BlendShapeの活用

現在のVRMファイルに以下があれば活用可能：
- `eyeWide` / `eyeNarrow` (目の大きさ)
- `noseWide` / `noseNarrow` (鼻の大きさ)
- `mouthWide` / `mouthNarrow` (口の大きさ)
- `faceWide` / `faceNarrow` (顔の幅)

## 📋 技術仕様

### **ファイル形式**
- VRM 1.0形式
- 既存のVRMファイル: `/public/vrm-models/f_0_20.vrm`

### **BlendShape制御仕様**
- **値の範囲**: 0.0 - 1.0
- **適用方法**: プログラムから`expression.weight = 値`で制御
- **組み合わせ**: 複数のBlendShapeを同時適用可能

### **命名規則**
- 動詞形式を推奨（例: `eyeSlantUp`, `browDown`）
- キャメルケースを使用
- 分かりやすい英語名

## 📈 実際のデータ例

### **サンプル写真での検出結果**
```
eyeWidth: 0.0771
eyeHeight: 0.0185
eyeAspectRatio: 0.2394
eyeSlantAngle: -0.38°          ← たれ目傾向
browHeight: 0.0561
browAngle: -178.22°            ← 強い下がり眉
noseWidth: 0.0977
noseHeight: 0.0778
mouthWidth: 0.1668
mouthHeight: 0.0004
lipThickness: 0.0093           ← 薄い唇
faceAspectRatio: 0.8107
jawSharpness: 0.252            ← 丸い顎
interocularDistance: 0.1079
```

### **この場合の予想BlendShape適用**
```
eyeSlantDown: 4%     (わずかなたれ目)
browDown: 50%        (強い下がり眉・困り眉)
jawRound: 30%        (丸い顎)
lipThin: 25%         (薄い唇)
noseWide: 100%       (鼻が大きい)
mouthWide: 100%      (口が大きい)
faceWide: 45%        (顔が幅広)
```

## 🚀 実装後の効果

### **現状の問題**
- 基本的な寸法（幅・高さ）のみで個性が不足
- つり目・たれ目の区別ができない
- 眉の形状が反映されない
- 顎の輪郭の個性が表現できない
- 唇の厚みの違いが再現されない

### **実装後の改善**
- **「寸法」に加えて「形状」と「角度」を再現**
- **つり目・たれ目の区別が可能**
- **上がり眉・下がり眉の表現が可能**
- **シャープな顎・丸い顎の区別が可能**
- **唇の厚み・薄みの表現が可能**

### **再現精度の向上**
- 現在: 「なんとなく似ている」レベル
- 実装後: 「かなり本人に近い」レベル

## 💡 制作のポイント

### **重要な注意事項**
1. **眉の角度**: -180°が水平、-150°が上がり眉、-210°が下がり眉
2. **目の傾斜**: 正の値でつり目、負の値でたれ目
3. **顎の尖り具合**: 0に近いほど丸い、1に近いほどシャープ
4. **唇の厚み**: 0.008未満で薄い、0.015超過で厚い

### **優先順位**
1. **高優先度**: 目の傾斜、眉の角度、顎の形状（顔の印象を大きく左右）
2. **中優先度**: 唇の厚み、眉の高さ（細かい個性の表現）

### **テスト方法**
新しいBlendShapeを追加したVRMファイルをシステムに適用後、写真解析を実行すると自動的に新しいBlendShapeが適用されます。

---

**この依頼書に基づいてBlendShapeを制作することで、MediaPipeで検出した顔特徴量を最大限活用し、高精度な顔の再現が可能になります。**