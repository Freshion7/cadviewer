"""STEP/IGS/BREP 等 B-Rep 几何转 GLB。

gmsh 只能在主线程初始化，因此在子进程中执行转换（见 step_worker.py）。
"""
import json
import os
import subprocess
import sys

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def convert(src: str, out_dir: str, mesh_size: float = 0.0) -> dict:
    """转换 B-Rep 文件为 GLB。mesh_size<=0 时使用 gmsh 默认尺寸。"""
    cmd = [
        sys.executable, "-m", "app.converters.step_worker",
        os.path.abspath(src), os.path.abspath(out_dir),
        str(mesh_size),
    ]
    proc = subprocess.run(
        cmd, cwd=BACKEND_DIR, capture_output=True, text=True,
        timeout=1800, encoding="utf-8", errors="replace",
    )
    if proc.returncode != 0:
        detail = (proc.stderr or proc.stdout or "").strip()
        raise RuntimeError(f"STEP 转换失败：{detail[-400:]}")

    result_path = os.path.join(out_dir, "_result.json")
    if not os.path.exists(result_path):
        raise RuntimeError("STEP 转换失败：未生成产物")
    with open(result_path, "r", encoding="utf-8") as f:
        return json.load(f)
