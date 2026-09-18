"""生成端到端验证用的样例文件（STEP / STL / MAT / VTU）。

用法：backend\.venv\Scripts\python.exe samples\make_samples.py
"""
import os
import sys

OUT = os.path.dirname(os.path.abspath(__file__))
os.makedirs(OUT, exist_ok=True)


def make_step_and_stl():
    import gmsh
    gmsh.initialize()
    gmsh.option.setNumber("General.Verbosity", 2)
    # 一个带孔的机械零件示意：底板 + 圆柱
    gmsh.model.occ.addBox(0, 0, 0, 0.12, 0.06, 0.008)
    gmsh.model.occ.addCylinder(0.03, 0.03, 0, 0, 0, 0.008, 0.02)
    gmsh.model.occ.synchronize()
    gmsh.write(os.path.join(OUT, "sample_part.step"))
    gmsh.model.mesh.generate(2)
    gmsh.write(os.path.join(OUT, "sample_part.stl"))
    gmsh.finalize()
    print("[OK] sample_part.step / sample_part.stl")


def make_mat():
    import numpy as np
    import scipy.io
    t = np.linspace(0, 2, 400)
    # 模拟 NVH 加速度响应（带两个共振峰）
    accel = (np.sin(2 * np.pi * 5 * t) * 0.6 +
             np.sin(2 * np.pi * 42 * t) * np.exp(-((t - 0.9) ** 2) / 0.02) * 2.0)
    freq = np.linspace(20, 200, 256)
    frf = 1.0 / (1 - (freq / 68) ** 2 + 0.02j * freq / 68)
    frf_db = 20 * np.log10(np.abs(frf) + 1e-12)
    rng = np.random.default_rng(7)
    matrix = rng.normal(size=(48, 64))
    scipy.io.savemat(os.path.join(OUT, "nvh_data.mat"), {
        "time": t, "accel_response": accel,
        "freq": freq, "frf_db": frf_db,
        "mode_shape": matrix,
    })
    print("[OK] nvh_data.mat")


def make_vtu():
    import pyvista as pv
    mesh = pv.Sphere(radius=0.05, theta_resolution=36, phi_resolution=18)
    pts = mesh.points
    mesh.point_data["displacement_mm"] = pts[:, 2] * 0.05
    mesh.point_data["stress_mpa"] = (pts[:, 0] ** 2 + pts[:, 1] ** 2) * 120
    ugrid = mesh.triangulate().cast_to_unstructured_grid()
    ugrid.save(os.path.join(OUT, "sample_result.vtu"))
    print("[OK] sample_result.vtu")


if __name__ == "__main__":
    make_step_and_stl()
    make_mat()
    make_vtu()
    print("样例文件已生成到", OUT)
