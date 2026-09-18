"""掌上工程文件查看器 - 后端服务（FastAPI）。

功能：上传 CATIA/SolidWorks(经STEP)/ANSYS/MATLAB 等工程文件，
服务端转换为 GLB / VTU / 图表等轻量格式，供移动端 Web 查看。
"""
import os
import shutil
from pathlib import Path

from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from app import config
from app.services.store import store

app = FastAPI(title="掌上工程文件查看器", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health():
    return {"status": "ok", "service": "cadviewer-backend"}


@app.post("/api/files")
async def upload_file(file: UploadFile = File(...)):
    filename = file.filename or "unnamed"
    if file.size and file.size > config.MAX_UPLOAD_BYTES:
        raise HTTPException(413, f"文件超过 {config.MAX_UPLOAD_MB}MB 限制")

    task = store.create(filename, file.size or 0)
    ext = os.path.splitext(filename)[1]
    dest = os.path.join(task["dir"], "source" + ext)

    with open(dest, "wb") as f:
        # 分块写入，避免大文件占内存
        while True:
            chunk = await file.read(1024 * 1024)
            if not chunk:
                break
            f.write(chunk)

    # 文件已落盘，任务入队转换
    store.enqueue(task["id"])
    return task


@app.get("/api/files")
def list_files():
    return {"files": store.list()}


@app.get("/api/files/{file_id}")
def get_file(file_id: str):
    task = store.get(file_id)
    if not task:
        raise HTTPException(404, "文件不存在")
    return task


@app.get("/api/files/{file_id}/download")
def download(file_id: str, kind: str):
    """kind: model(glb) / vtu / vtp / data(json) / chart(png) / meta(json) / result(vtu)"""
    task = store.get(file_id)
    if not task:
        raise HTTPException(404, "文件不存在")
    if task["status"] != "done":
        raise HTTPException(409, f"文件尚未就绪：{task['message']}")

    path = None
    for p in task["products"]:
        if p["kind"] == kind:
            path = p["path"]
            break
    if path is None or not os.path.exists(path):
        raise HTTPException(404, "产物不存在")

    media = {
        "glb": "model/gltf-binary",
        "vtu": "application/octet-stream",
        "vtp": "application/octet-stream",
        "png": "image/png",
        "json": "application/json",
    }.get(os.path.splitext(path)[1].lstrip("."), "application/octet-stream")
    return FileResponse(path, media_type=media, filename=os.path.basename(path))


# ---------- 前端静态资源（构建产物存在时挂载） ----------
FRONTEND_DIST = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"
if FRONTEND_DIST.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIST), html=True), name="frontend")
