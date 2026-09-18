# 部署指南

## 方式一：Render（推荐，免费）

前置：代码已推送到 GitHub（见下方"推送代码"）。

1. 打开 https://dashboard.render.com/ 并登录你的账号（1906873198@qq.com）
2. 点击 **New + → Blueprint**（蓝本）
3. 选择仓库 `cadviewer`，Render 会自动读取 `render.yaml`
4. 确认服务信息（plan 选 Free）→ **Apply**
5. 等待构建（首次约 5-10 分钟），构建完成后访问
   `https://cadviewer.onrender.com` 即可在手机打开

> 免费实例无访问时休眠，首次打开需等约 30-60 秒唤醒。

## 方式二：本机局域网使用（无需部署）

```powershell
cd D:\NVH\cadviewer\backend
.venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

- 电脑防火墙放行 8000 端口
- 手机连同一 Wi-Fi，浏览器打开 `http://<电脑IP>:8000`
- 查看电脑 IP：`ipconfig` 中的 IPv4 地址

## 方式三：任意云主机（Docker）

```bash
docker build -f backend/Dockerfile -t cadviewer .
docker run -d -p 8000:8000 --name cadviewer cadviewer
```

## 推送代码到 GitHub（首次）

```powershell
cd D:\NVH\cadviewer
git init
git add .
git commit -m "feat: 掌上工程查看器 MVP（GLB/VTU/MAT 查看）"
git branch -M main
git remote add origin https://github.com/Freshion7/cadviewer.git
git push -u origin main
```

> 提示：GitHub 已不支持密码推送，请先在 GitHub 设置中创建
> **Personal Access Token（勾选 repo 权限）**，推送时以 Token 作为密码。
> 凭据请妥善保管，不要提交到仓库。

## 原生 CAD 文件转换（CATIA / SolidWorks）

在装有正版软件的 Windows 电脑上：

```powershell
pip install pywin32
python tools\native_cad_to_step.py D:\你的模型文件夹 D:\step_out
```

把生成的 STEP 上传到查看器即可手机查看。
