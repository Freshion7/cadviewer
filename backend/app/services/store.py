"""内存任务存储 + 单工作线程转换队列（MVP 单实例够用）。"""
import json
import os
import queue
import shutil
import threading
import time
import uuid

from app import config


class TaskStore:
    def __init__(self):
        self._lock = threading.Lock()
        self._tasks = {}       # file_id -> task dict
        self._queue = queue.Queue()
        self._worker = threading.Thread(target=self._run, daemon=True)
        self._worker.start()

    # ---------- 对外接口 ----------
    def create(self, filename: str, size: int) -> dict:
        file_id = uuid.uuid4().hex[:12]
        safe = os.path.basename(filename)
        ext = os.path.splitext(safe)[1].lower()
        task_dir = config.DATA_DIR / file_id
        task_dir.mkdir(parents=True, exist_ok=True)

        task = {
            "id": file_id,
            "filename": safe,
            "size": size,
            "kind": config.EXT_TO_KIND.get(ext, "unknown"),
            "status": "pending",           # pending/converting/done/error
            "message": "排队中",
            "created_at": time.strftime("%Y-%m-%d %H:%M:%S"),
            "products": [],
            "meta": None,
            "dir": str(task_dir),
        }
        with self._lock:
            self._tasks[file_id] = task
        return task

    def enqueue(self, file_id: str):
        """文件已落盘后调用，任务进入转换队列。"""
        self._queue.put(file_id)

    def list(self) -> list:
        with self._lock:
            tasks = [self._public(t) for t in self._tasks.values()]
        return sorted(tasks, key=lambda t: t["created_at"], reverse=True)

    def get(self, file_id: str) -> dict | None:
        with self._lock:
            task = self._tasks.get(file_id)
            return self._public(task) if task else None

    def product_path(self, file_id: str, kind: str) -> str | None:
        task = self.get(file_id)
        if not task:
            return None
        for p in task["products"]:
            if p["kind"] == kind:
                return p["path"]
        return None

    # ---------- 内部 ----------
    def _public(self, task: dict) -> dict:
        t = dict(task)
        t.pop("dir", None)
        return t

    def _run(self):
        while True:
            file_id = self._queue.get()
            task = self._tasks.get(file_id)
            if not task:
                continue
            try:
                task["status"] = "converting"
                task["message"] = "正在转换…"

                src = os.path.join(task["dir"], "source" + os.path.splitext(task["filename"])[1])
                result = None
                from app.converters import dispatch
                result = dispatch(src)

                products = []
                # 结果键 -> 对外 kind 名
                KIND_MAP = {
                    "model_glb": "model", "result_vtu": "vtu", "result_vtp": "vtp",
                    "data_json": "data", "chart_png": "chart", "meta_json": "meta",
                    "result.vtu": "vtu", "result.vtp": "vtp",
                }
                for key, val in result["products"].items():
                    if isinstance(val, str) and os.path.exists(val):
                        products.append({
                            "kind": KIND_MAP.get(key, key),
                            "path": val,
                            "filename": os.path.basename(val),
                        })
                meta = {k: v for k, v in result["products"].items() if not isinstance(v, str)}

                task["products"] = products
                task["meta"] = meta
                task["status"] = "done"
                task["message"] = "转换完成，可查看"
            except Exception as e:
                task["status"] = "error"
                task["message"] = str(e)[:600]
            finally:
                # 清理原始上传文件（保留产物）
                src = os.path.join(task["dir"], "source" + os.path.splitext(task["filename"])[1])
                if os.path.exists(src):
                    try:
                        os.unlink(src)
                    except Exception:
                        pass


store = TaskStore()
