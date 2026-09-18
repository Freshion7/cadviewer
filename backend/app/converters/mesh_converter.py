"""三维网格类文件（STL/OBJ/PLY/GLTF/GLB 等）转 GLB。"""
import os
import numpy as np
import trimesh

from app.config import GLB_MAX_FACES


def convert(src: str, out_dir: str) -> dict:
    """读取网格文件并导出轻量化 GLB。

    返回: {model_glb, triangles, vertices, simplified}
    """
    scene = trimesh.load(src, force="scene")
    # 展平为单网格（保留全部几何，必要时减面）
    if isinstance(scene, trimesh.Scene):
        geom = scene.to_geometry()
        mesh = geom[0] if isinstance(geom, list) else geom
    else:
        mesh = scene
    mesh.merge_vertices()  # trimesh 5.x：原地合并，返回 None

    simplified = False
    if len(mesh.faces) > GLB_MAX_FACES:
        target = int(GLB_MAX_FACES * 0.8)
        try:
            mesh = mesh.simplify_quadric_decimation(target)
            simplified = True
        except Exception:
            pass  # 减面失败则保留原始网格

    glb_path = os.path.join(out_dir, "model.glb")
    mesh.export(glb_path)
    return {
        "model_glb": glb_path,
        "triangles": int(len(mesh.faces)),
        "vertices": int(len(mesh.vertices)),
        "simplified": simplified,
        "units": "保持原始单位（CAD 通常为 mm）",
    }
