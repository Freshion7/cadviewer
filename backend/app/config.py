"""全局配置：存储路径、支持的文件类型与大小限制。"""
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent          # backend/
DATA_DIR = BASE_DIR / "data"                              # 上传文件与转换产物存放
DATA_DIR.mkdir(parents=True, exist_ok=True)

MAX_UPLOAD_MB = 1024
MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024

# 文件类型 -> 转换器标识
EXT_TO_KIND = {
    # 三维几何：直接可用 trimesh 读取
    ".stl": "mesh", ".obj": "mesh", ".ply": "mesh", ".off": "mesh",
    ".gltf": "mesh", ".glb": "mesh", ".3mf": "mesh",
    # 三维几何：需要 OpenCASCADE（gmsh 内置）离散化
    ".step": "step", ".stp": "step", ".igs": "step", ".iges": "step", ".brep": "step",
    # ANSYS 结果文件
    ".rst": "ansys", ".rth": "ansys", ".rmg": "ansys", ".rfl": "ansys", ".cdb": "ansys",
    # 可视化网格（直接透传）
    ".vtu": "vtu", ".vtp": "vtp",
    # MATLAB 数据/图形
    ".mat": "matlab",
    # 原生 CAD（需要装有对应软件的机器做预转换，见 tools/native_cad_to_step.py）
    ".catpart": "native", ".catproduct": "native", ".catshape": "native",
    ".sldprt": "native", ".sldasm": "native",
    # MATLAB 图窗（MVP 暂不支持，给出指引）
    ".fig": "unsupported",
}

# 每种转换器的产物清单（相对文件目录）
PRODUCTS = {
    "mesh": [("model.glb", "三维模型(GLB)")],
    "step": [("model.glb", "三维模型(GLB)")],
    "ansys": [("result.vtu", "结果云图(VTU)"), ("meta.json", "结果信息")],
    "vtu": [("result.vtu", "结果云图(VTU)")],
    "vtp": [("result.vtp", "结果云图(VTP)")],
    "matlab": [("data.json", "数据摘要"), ("chart.png", "图表预览")],
    "native": [],
    "unsupported": [],
}

GLB_MAX_FACES = 800_000   # 超过该面数自动减面
