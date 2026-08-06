# EP Baby

Electron + TypeScript 桌面像素宠物原型。

## 当前能力

- 透明、置顶、跳过任务栏的桌面宠物窗口
- 五只宠物及各自五组逐帧动作
- 自动行为切换和桌面水平移动
- 点击触发反应、拖拽移动、透明区域鼠标穿透
- 控制台内切换宠物、动作、速度与显示尺寸
- 系统托盘、召回宠物、暂停和退出
- 本地保存当前宠物、设置和窗口位置
- 独立像素宠物编辑器窗口，可从控制台的“设计宠物”进入
- 动作、逐帧动画、拼豆图层、调色板和洋葱皮编辑
- 画笔、橡皮、区域填充、吸色、差异撤销与恢复
- 编辑项目保存到 Electron `userData/editor-projects`
- 导出带 `manifest.json` 和逐帧透明 PNG 的宠物包
- `contextIsolation`、沙箱和受限 Preload IPC

## 像素宠物编辑器

编辑器默认创建 32×32 像素项目。动作包含独立的帧列表，每一帧包含多个拼豆图层，并可设置自己的持续时间。双击图层名称可以切换锁定状态。

保存项目后，可以通过顶部的本地项目列表重新载入。选择“导出宠物包”后会生成：

```text
宠物名称/
├─ manifest.json
└─ actions/
   └─ <action-id>/
      ├─ frame-001.png
      └─ frame-002.png
```

## 在 CMD 中运行

```bat
cd /d D:\code\project\epBaby
npm run start
```

开发模式：

```bat
cd /d D:\code\project\epBaby
npm run dev
```

如果删除过 `node_modules`，先运行：

```bat
npm install
```

启动命令会先检查 Electron 可执行文件；缺失时会通过国内镜像自动下载。也可以手动修复：

```bat
npm run electron:install
```

无需删除整个 `node_modules`。`npm run start` 会检查 Electron、执行类型检查和生产构建，再启动应用；`npm run dev` 会检查 Electron，然后启动 Vite 开发服务器和 Electron。关闭控制台窗口不会退出应用，需要从系统托盘菜单退出。

## 重新裁切精灵图

整图素材会被裁成透明背景的独立 PNG 帧，并保存到 `baby/frames/<图集名称>/action-XX/frame-XX.png`：

```bat
npm run sprites:slice
```

该命令保留原始整图，不会覆盖 `baby/generated-*` 中的素材。
"# epBaby" 
