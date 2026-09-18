"""在装有正版 CATIA / SolidWorks 的 Windows 电脑上，把原生 CAD 文件批量转成 STEP。

用法（在 CAD 机器上）：
    python native_cad_to_step.py <文件或文件夹> [输出目录]

转换后的 STEP 文件可上传到掌上工程查看器，手机端即可查看。
依赖：pip install pywin32
注意：需要本机已安装并启动过 CATIA / SolidWorks（用于 COM 自动化）。
"""
import os
import sys
import glob


def convert_with_catia(src: str, out_dir: str):
    import pythoncom
    import win32com.client
    pythoncom.CoInitialize()
    app = win32com.client.Dispatch("CATIA.Application")
    doc = app.Documents.Open(src)
    base = os.path.splitext(os.path.basename(src))[0]
    out = os.path.join(out_dir, base + ".step")
    doc.ExportData(out, "STEP")
    doc.Close(False)
    return out


def convert_with_solidworks(src: str, out_dir: str):
    import pythoncom
    import win32com.client
    pythoncom.CoInitialize()
    ext = os.path.splitext(src)[1].lower()
    app = win32com.client.Dispatch("SldWorks.Application")
    app.Visible = False
    doc_type = 1 if ext == ".sldprt" else 2  # swDocPART / swDocASSEMBLY
    doc = app.OpenDoc6(src, doc_type, 1, "", 0, 0)
    if doc is None:
        raise RuntimeError(f"打开失败：{src}")
    base = os.path.splitext(os.path.basename(src))[0]
    out = os.path.join(out_dir, base + ".step")
    errs = win32com.client.VARIANT(3, 0)
    warns = win32com.client.VARIANT(3, 0)
    doc.SaveAs3(out, 0, 2, errs, warns)  # 2 = STEP
    app.CloseDoc(doc.GetTitle())
    return out


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    target = sys.argv[1]
    out_dir = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(target), "step_out")
    os.makedirs(out_dir, exist_ok=True)

    files = []
    if os.path.isfile(target):
        files = [target]
    elif os.path.isdir(target):
        for pat in ("*.CATPart", "*.CATProduct", "*.CATShape", "*.sldprt", "*.sldasm"):
            files += glob.glob(os.path.join(target, "**", pat), recursive=True)

    if not files:
        print("未找到 CATIA/SolidWorks 文件。")
        sys.exit(1)

    for f in files:
        ext = os.path.splitext(f)[1].lower()
        try:
            if ext.startswith(".cat"):
                out = convert_with_catia(f, out_dir)
            else:
                out = convert_with_solidworks(f, out_dir)
            print(f"[OK] {os.path.basename(f)} -> {out}")
        except Exception as e:
            print(f"[FAIL] {os.path.basename(f)}: {e}")


if __name__ == "__main__":
    main()
