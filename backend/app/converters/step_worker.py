"""gmsh 转换子进程入口（gmsh 只能在主线程运行，故单独成进程）。

用法：python -m app.converters.step_worker <src> <out_dir> [mesh_size]
"""
import json
import os
import sys

from app.config import GLB_MAX_FACES


def run(src: str, out_dir: str, mesh_size: float = 0.0):
    import gmsh
    tmp_stl = None
    initialized = False
    try:
        gmsh.initialize()
        initialized = True
        gmsh.option.setNumber("General.Terminal", 0)
        gmsh.option.setNumber("General.Verbosity", 2)
        gmsh.open(src)
        try:
            gmsh.model.occ.synchronize()
        except Exception:
            pass
        if mesh_size and mesh_size > 0:
            gmsh.option.setNumber("Mesh.MeshSizeMax", mesh_size)
        gmsh.model.mesh.generate(2)

        import tempfile
        with tempfile.NamedTemporaryFile(suffix=".stl", delete=False) as f:
            tmp_stl = f.name
        gmsh.write(tmp_stl)
    finally:
        if initialized:
            try:
                gmsh.finalize()
            except Exception:
                pass

    if tmp_stl is None or not os.path.exists(tmp_stl) or os.path.getsize(tmp_stl) == 0:
        if tmp_stl and os.path.exists(tmp_stl):
            os.unlink(tmp_stl)
        raise RuntimeError("gmsh 未能生成网格（可能是空模型或文件损坏）")

    import trimesh
    mesh = trimesh.load(tmp_stl, force="mesh")
    if mesh is None:
        if os.path.exists(tmp_stl):
            os.unlink(tmp_stl)
        raise RuntimeError("网格解析失败")

    mesh.merge_vertices()  # trimesh 5.x：原地合并，返回 None

    simplified = False
    if len(mesh.faces) > GLB_MAX_FACES:
        try:
            mesh = mesh.simplify_quadric_decimation(int(GLB_MAX_FACES * 0.8))
            simplified = True
        except Exception:
            pass

    glb_path = os.path.join(out_dir, "model.glb")
    mesh.export(glb_path)
    if tmp_stl and os.path.exists(tmp_stl):
        os.unlink(tmp_stl)

    result = {
        "model_glb": glb_path,
        "triangles": int(len(mesh.faces)),
        "vertices": int(len(mesh.vertices)),
        "simplified": simplified,
        "units": "保持原始单位（CAD 通常为 mm）",
    }
    with open(os.path.join(out_dir, "_result.json"), "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False)


if __name__ == "__main__":
    src, out_dir = sys.argv[1], sys.argv[2]
    mesh_size = float(sys.argv[3]) if len(sys.argv) > 3 and sys.argv[3] else 0.0
    run(src, out_dir, mesh_size)
