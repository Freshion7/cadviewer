"""转换器分发：按扩展名选择处理模块。"""
import os
from app import config

from app.converters import (
    mesh_converter,
    step_converter,
    ansys_converter,
    matlab_converter,
    native_converter,
)


def dispatch(file_path: str) -> dict:
    """根据扩展名执行转换，返回 {kind, products, meta}。失败抛 RuntimeError。"""
    ext = os.path.splitext(file_path)[1].lower()
    kind = config.EXT_TO_KIND.get(ext)

    if kind is None:
        raise RuntimeError(f"暂不支持 {ext or '无扩展名'} 文件。支持类型："
                           + "、".join(sorted(set(config.EXT_TO_KIND))))

    out_dir = os.path.join(os.path.dirname(file_path), "out")
    os.makedirs(out_dir, exist_ok=True)

    if kind == "mesh":
        result = mesh_converter.convert(file_path, out_dir)
    elif kind == "step":
        result = step_converter.convert(file_path, out_dir)
    elif kind == "ansys":
        result = ansys_converter.convert(file_path, out_dir)
    elif kind in ("vtu", "vtp"):
        # 直接透传
        target = f"result.{kind}"
        os.makedirs(out_dir, exist_ok=True)
        out_path = os.path.join(out_dir, target)
        with open(file_path, "rb") as fin, open(out_path, "wb") as fout:
            fout.write(fin.read())
        result = {target: out_path}
    elif kind == "matlab":
        result = matlab_converter.convert(file_path, out_dir)
    elif kind == "native":
        result = native_converter.convert(file_path, out_dir)
    elif kind == "unsupported":
        raise RuntimeError(
            "MATLAB .fig 图窗为二进制私有格式，MVP 暂不支持直接解析。\n"
            "处理方式：在 MATLAB 中执行 saveas(gcf,'xxx.png') 导出图片，"
            "或把工作区数据用 save('xxx.mat') 保存后上传 .mat 查看。"
        )
    else:
        raise RuntimeError(f"未知转换器：{kind}")

    return {"kind": kind, "products": result}
