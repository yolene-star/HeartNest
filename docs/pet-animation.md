# 逐帧桌宠动画

当前版本为五位伙伴接入独立的透明逐帧精灵图：沐沐、团团、绵绵、绒绒和豆豆。

- 第 1 行：待机呼吸与眨眼
- 第 2 行：倾听前倾
- 第 3 行：思考摸脸
- 第 4 行：安慰抱枕
- 第 5 行：鼓励跳跃与挥手
- 第 6 行：休息睡眠

前端通过 React 定时切换独立 PNG 帧，Agent 状态映射到对应动画。绵绵是替换朵朵后的兔子伙伴，拥有与其他伙伴相同的六种状态和独立动作帧。

## 资源

- `frontend/public/pets/<pet>/`：每位伙伴的 48 个状态帧
- `frontend/src/ProductApp.jsx`：`PetAvatar` 与 `PetDock` 状态映射
- `scripts/build_companion_frames.py`：从动作参考图生成统一尺寸帧
- `scripts/check_companion_frames.py`：检查新增帧的可见性、中心和底线

## 设计约束

- 宠物动画不覆盖主要输入区域。
- 减少动态效果：CSS 装饰动画支持减少动态效果，PNG 帧切换尚待支持。
- 桌宠状态来自用户输入、Agent 处理状态和行动反馈，不直接把模型判断当成诊断。

### 2026-10-30 切帧修复

浏览器中整张精灵图的 CSS 背景定位仍可能露出相邻帧，因此桌宠现在使用 48 个独立帧文件，由 React 定时切换 `<img>`。每个视口只显示一张 192×171 的完整帧。

### 输入后消失：根因及回归

旧提取脚本在行内坐标中重复加上图集行偏移，导致除待机外 40 帧透明。`scripts/extract_pet_frames.py` 使用裁剪后的行内坐标，按可见轮廓水平居中、底线对齐。`scripts/check_pet_frames.py` 检查全部 48 帧的尺寸、可见像素、中心和底线，能捕获本次透明图片错误。

本地图片检查（需要 Pillow，可安装到项目 `.deps`）：

```powershell
$env:PYTHONPATH='.deps'
python scripts/check_pet_frames.py
```

每次修改后，在 Docker 中构建并运行，再执行真实浏览器回归（需要本机 Edge）：

```powershell
docker compose build frontend
docker compose up -d --no-deps frontend
cd frontend
npm ci
node tests/pet-regression.mjs
```

浏览器测试覆盖首次选择、待机、输入、清空、保存中的思考、保存后的鼓励、再次输入、页面切换和移动端输入。逐一解码线上 48 帧检查透明度；测试新增的日记在结束时删除。截图与结果保存在 `docs/pet-regression/`。保存请求由测试暂时挂起以稳定检查思考状态，然后放行到真实后端。
