"""ANSYS 结果文件（.rst/.rth/.cdb 等）转 VTK 网格 + 结果元信息。

使用 ansys-mapdl-reader（基于 pyvista），把有限元网格与结果场写入 .vtu，
供前端 VTK.js 渲染云图。
"""
import json
import os
import numpy as np


def _safe_numeric(value, default=-1):
    try:
        v = int(value)
        return v if v > 0 else default
    except Exception:
        return default


def convert(src: str, out_dir: str) -> dict:
    from ansys.mapdl import reader as ansys_reader

    result = ansys_reader.read_binary(src)
    grid = result.mesh.grid  # pyvista.UnstructuredGrid

    meta = {
        "n_results": _safe_numeric(result.n_results),
        "nodes": int(grid.n_points),
        "elements": int(grid.n_cells),
        "dimension": getattr(result, "mesh_dim", None) or "3D",
        "result_titles": [],
        "fields": [],
    }

    # 尽量提取第一个结果步的场量（位移/应力/应变等），失败则仅保留几何
    try:
        n_steps = max(1, _safe_numeric(result.n_results))
        for i in range(min(n_steps, 1)):  # MVP：只取第 1 步，避免超大内存
            try:
                info = result.result_info(i)
                title = getattr(info, "title", f"Result {i}")
                if title:
                    meta["result_titles"].append(str(title))
            except Exception:
                pass
            try:
                sol = result.nodal_solution(i)
                if isinstance(sol, dict):
                    for key, arr in sol.items():
                        if isinstance(arr, np.ndarray) and arr.size == grid.n_points:
                            grid.point_data[key] = arr
                            meta["fields"].append(key)
            except Exception:
                pass
    except Exception:
        pass

    vtu_path = os.path.join(out_dir, "result.vtu")
    grid.save(vtu_path)

    with open(os.path.join(out_dir, "meta.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)

    return {
        "result_vtu": vtu_path,
        "meta_json": os.path.join(out_dir, "meta.json"),
        **meta,
    }
