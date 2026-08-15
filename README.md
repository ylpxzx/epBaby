# EP Baby

基于 Electron、Vue 3、Pinia、Vite 和 TypeScript 的桌面像素宠物应用。

## 技术架构

- Electron 主进程负责透明置顶窗口、系统托盘、本地文件与窗口移动。
- Preload 通过 `contextBridge` 暴露受限且有类型的 IPC API。
- 宠物窗、控制台和像素编辑器是三个独立的 Vue 3 应用。
- 每个窗口拥有独立的 Vue 应用与 Pinia 实例，界面状态由 Composition API 驱动。
- Canvas 绘制、编辑历史和项目序列化保持为框架无关的 TypeScript 模块。
- 宠物项目继续使用原有 JSON 格式，迁移不会使已有项目数据失效。

## 当前能力

- 透明、置顶并可跨任务栏活动的桌面宠物窗口
- 多个宠物项目及逐帧动作
- 自动行为切换、桌面水平移动、点击反应和拖拽
- 控制台内切换宠物、动作、速度与显示尺寸
- 系统托盘、召回宠物、暂停和退出
- 像素宠物编辑器：动作、帧、图层、调色板和洋葱皮
- 画笔、橡皮、区域填充、吸色、撤销与恢复
- 导出包含 `manifest.json` 和透明 PNG 帧的宠物包

## 互动玩法

- 单击、双击、三连击宠物会触发不同动作。
- 长按宠物 650ms、滚轮向上/向下、拖动后释放会触发对应动作。
- 在控制台或编辑器中 8 秒内输入 20 个可打印字符会触发表演类动作；程序只计数，不记录按键内容。
- `Ctrl+Alt+1`、`Ctrl+Alt+2`、`Ctrl+Alt+3`：触发当前宠物的第 2/3/4 个动作。
- `Ctrl+Alt+R`：召回宠物；`Ctrl+Alt+P`：暂停或继续活动。

互动动作优先根据动作 ID 和名称中的中英文关键词匹配；未匹配时会回退到宠物已有的非移动动作。

## 开发

要求 Node.js 22 或更高版本。

```bat
cd /d D:\code\project\epBaby
npm install
npm run dev
```

生产构建并启动：

```bat
npm run start
```

仅验证类型和生产构建：

```bat
npm run typecheck
npm run build
```

## Renderer 入口

```text
src/renderer/pet-app.ts            桌面宠物 Vue 应用
src/renderer/control-app.ts        控制台 Vue 应用
src/renderer/editor/editor-app.ts  像素编辑器 Vue 应用
src/renderer/pet/PetApp.vue        宠物窗口组件
src/renderer/control/ControlApp.vue 控制台组件
src/renderer/editor/EditorApp.vue  编辑器组件
```

模板、列表、表单和事件均由 Vue 管理。Canvas 像素绘制、命中检测、编辑历史和项目序列化仍保持为框架无关算法，供 Vue 组件通过模板引用和生命周期调用。

## 素材工具

重新裁切精灵图：

```bat
npm run sprites:slice
```

重新生成默认宠物：

```bat
npm run pet:generate-default
```
