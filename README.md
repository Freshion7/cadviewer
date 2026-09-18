# 掌上工程查看器（CadViewer）

手机端快捷查看 **CATIA / SolidWorks / ANSYS / MATLAB** 工程文件的轻量 Web 应用。
**只读查看，不做编辑。**

## 核心思路

手机不直接解析私有二进制格式，而是：

1. 上传工程文件到后端转换服务
2. 服务端转换为轻量中间格式（GLB / VTU / PNG / JSON）
3. 手机 Web 端（PWA，可添加到主屏）加载轻量格式查看

```
┌────────────┐  上传原文件   ┌──────────────┐   转换   ┌──────────┐
│ 手机浏览器  │ ───────────► │  后端转换服务  │ ──────► │ 轻量产物  │
│ (PWA)      │ ◄─────────── │  FastAPI      │ ◄────── │ GLB/VTU  │
└────────────┘  拉取产物渲染  └──────────────┘         └──────────┘
```

## 支持的文件类型

| 文件 | 转换方式 | 查看效果 |
|---|---|---|
| STEP / IGS / BREP | gmsh(OpenCASCADE) 网格化 → GLB | 三维旋转/缩放/线框 |
| STL / OBJ / PLY / GLTF / GLB | 直接转 GLB | 三维旋转/缩放/线框 |
| ANSYS .rst/.rth/.cdb | ansys-mapdl-reader → VTK(.vtu) | 结果云图 + 场量切换 |
| VTK .vtu/.vtp | 直接透传 | 结果云图 + 场量切换 |
| MATLAB .mat (v5/v7.3) | scipy/h5py 解析 | 曲线/热图预览 + 数据摘要 |
| CATIA .CATPart/.CATProduct | 需先转 STEP（见 tools/） | 三维查看 |
| SolidWorks .sldprt/.sldasm | 需先转 STEP（见 tools/） | 三维查看 |
| MATLAB .fig | 暂不支持，建议导出图片 | - |

## 技术栈

- 后端：FastAPI + gmsh + trimesh + ansys-mapdl-reader + scipy + matplotlib
- 前端：Vite + React + TypeScript + three.js + vtk.js
- 部署：Docker（Render / 任意云主机 / 本机）

## 快速开始（本地）

```powershell
# 1. 后端
cd backend
.venv\Scripts\python.exe -m pip install -r requirements.txt
.venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000

# 2. 前端（开发模式，自动代理 /api 到 8000）
cd frontend
npm install
npm run dev        # http://localhost:5173

# 3. 手机访问：同一局域网下打开 http://<电脑IP>:8000
#    （前端构建后由后端直接托管）
```

## 手机使用

- 浏览器打开部署地址 → 点"+"上传文件 → 等待转换完成 → 点"查看"
- 可将页面"添加到主屏幕"获得接近 App 的体验
- 原生 CATIA / SolidWorks 文件：先在装有对应软件的电脑上运行
  `tools/native_cad_to_step.py` 转成 STEP 再上传

## API 一览

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | /api/files | 上传文件（multipart） |
| GET | /api/files | 文件列表（含状态） |
| GET | /api/files/{id} | 文件详情 |
| GET | /api/files/{id}/download?kind=model/vtu/data/chart/meta | 下载产物 |
| GET | /api/health | 健康检查 |

## 目录结构

```
cadviewer/
├── backend/           FastAPI 转换服务
│   ├── app/converters/  各格式转换器
│   ├── app/services/    任务队列与存储
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/          React 查看器（three.js / vtk.js）
├── tools/             原生CAD转STEP脚本（在CAD机器上运行）
├── samples/           样例文件生成脚本
├── docs/              架构与部署文档
└── render.yaml        Render 蓝本
```

## 已知限制（MVP）

- 超大装配体（>100万面）转换慢、手机端卡顿，需进一步做 LOD/分块
- 后端在无正版 CAD 软件的服务器上不能直接打开 CATIA/SolidWorks 原文件
- ANSYS 结果仅提取第 1 个结果步的场量（避免内存爆炸）
- .fig 图窗暂不支持
