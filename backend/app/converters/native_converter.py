"""原生 CAD 文件（CATIA/SolidWorks）处理。

MVP 说明：
- CATIA(.CATPart/.CATProduct) 与 SolidWorks(.sldprt/.sldasm) 是私有二进制格式，
  开源解析器无法稳定读取，移动端/服务端不直接解析。
- 转换路径：在装有正版 CAD 软件的 Windows 机器上运行
  tools/native_cad_to_step.py，把原生文件转成 STEP，再上传本服务即可查看。
- 若本服务恰好运行在装有 CAD 的 Windows 机器上，会尝试 COM 自动转换。
"""
import os


def _try_com_convert(src: str, out_dir: str) -> str | None:
    """尝试用本机安装的 CATIA/SolidWorks（COM 自动化）转 STEP。返回 step 路径或 None。"""
    ext = os.path.splitext(src)[1].lower()
    try:
        import pythoncom
        import win32com.client
        pythoncom.CoInitialize()
        step_path = os.path.join(out_dir, "model.step")

        if ext in (".catpart", ".catproduct", ".catshape"):
            app = win32com.client.Dispatch("CATIA.Application")
            doc = app.Documents.Open(src)
            # CATIA 导出 STEP
            doc.ExportData(step_path, "STEP")
            doc.Close(False)
        elif ext in (".sldprt", ".sldasm"):
            app = win32com.client.Dispatch("SldWorks.Application")
            app.Visible = False
            doc = app.OpenDoc6(src, 1 if ext == ".sldprt" else 2,
                               1, "", 0, 0)
            if doc is None:
                return None
            errs = win32com.client.VARIANT(3, 0)
            warns = win32com.client.VARIANT(3, 0)
            doc.SaveAs3(step_path, 0, 2, errs, warns)  # 2 = STEP
            app.CloseDoc(doc.GetTitle())
        else:
            return None

        if os.path.exists(step_path):
            return step_path
    except Exception:
        return None
    return None


def convert(src: str, out_dir: str) -> dict:
    ext = os.path.splitext(src)[1].lower()
    step_path = _try_com_convert(src, out_dir)

    if step_path:
        from app.converters import step_converter
        return step_converter.convert(step_path, out_dir)

    friendly = {".catpart": "CATIA 零件", ".catproduct": "CATIA 装配体",
                ".catshape": "CATIA Shape", ".sldprt": "SolidWorks 零件",
                ".sldasm": "SolidWorks 装配体"}.get(ext, ext)
    raise RuntimeError(
        f"{friendly} 是私有格式，无法在服务器直接解析。\n"
        f"处理方式：在装有正版 {friendly.split()[0]} 的电脑上运行项目内 "
        f"tools/native_cad_to_step.py 将其转为 STEP 文件，再上传 STEP 即可手机查看。"
    )
