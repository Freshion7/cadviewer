"""MATLAB .mat 数据文件解析：数值数组摘要 + 图表预览(PNG/JSON)。

支持 v5 格式（scipy.io.loadmat）与 v7.3/HDF5（h5py）两种存储类型。
"""
import json
import os
import numpy as np

MAX_POINTS_LINE = 10000     # 1D 数组超过该点数只抽样
MAX_PIXELS_HEATMAP = 512 * 512


def _chart_1d(name: str, arr: np.ndarray, out_dir: str):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    x = np.arange(arr.size)
    y = arr
    if arr.size > MAX_POINTS_LINE:
        idx = np.linspace(0, arr.size - 1, MAX_POINTS_LINE).astype(int)
        x, y = x[idx], y[idx]

    plt.figure(figsize=(7, 3.6), dpi=110)
    plt.plot(x, y, lw=1.2)
    plt.title(name[:60])
    plt.xlabel("index")
    plt.grid(alpha=0.3)
    png = os.path.join(out_dir, "chart.png")
    plt.savefig(png, bbox_inches="tight")
    plt.close()
    return png


def _chart_2d(name: str, arr: np.ndarray, out_dir: str):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    plt.figure(figsize=(5.2, 4.2), dpi=110)
    plt.imshow(arr, aspect="auto", cmap="viridis")
    plt.colorbar(shrink=0.8)
    plt.title(name[:60])
    png = os.path.join(out_dir, "chart.png")
    plt.savefig(png, bbox_inches="tight")
    plt.close()
    return png


def _array_summary(name: str, arr: np.ndarray) -> dict:
    flat = np.asarray(arr).ravel()
    finite = flat[np.isfinite(flat)] if np.issubdtype(arr.dtype, np.number) else flat
    summary = {
        "name": str(name),
        "shape": list(arr.shape),
        "dtype": str(arr.dtype),
        "size": int(arr.size),
    }
    if np.issubdtype(arr.dtype, np.number) and finite.size:
        summary.update({
            "min": float(finite.min()) if finite.size else None,
            "max": float(finite.max()) if finite.size else None,
            "mean": float(finite.mean()) if finite.size else None,
        })
    return summary


def _variation_score(arr: np.ndarray) -> float:
    """振荡丰富度：差分符号变化次数（斜坡/单调曲线=0，振荡曲线=高）。"""
    try:
        flat = np.asarray(arr, dtype=np.float64).ravel()
        if flat.size < 4:
            return 0.0
        d = np.diff(flat)
        rng = float(np.ptp(flat))
        if not np.isfinite(rng) or rng <= 1e-12:
            return 0.0
        # 忽略微小噪声，只统计显著转向
        threshold = 0.02 * rng
        sign = np.sign(d)
        sign[np.abs(d) < threshold] = 0.0
        nonzero = sign[sign != 0]
        if nonzero.size < 2:
            return 0.0
        return float(np.sum(nonzero[:-1] != nonzero[1:]))
    except Exception:
        return 0.0


def convert(src: str, out_dir: str) -> dict:
    arrays = {}   # name -> ndarray
    load_error = None

    # 优先 v5
    try:
        import scipy.io
        raw = scipy.io.loadmat(src)
        arrays = {k: v for k, v in raw.items()
                  if not k.startswith("__") and isinstance(v, np.ndarray)}
    except NotImplementedError:
        # v7.3 HDF5
        try:
            import h5py
            with h5py.File(src, "r") as f:
                for k, v in f.items():
                    try:
                        arr = np.asarray(v[()])
                        if arr.dtype.kind in "fiubc":
                            arrays[k] = arr
                    except Exception:
                        continue
        except Exception as e:
            load_error = str(e)
    except Exception as e:
        load_error = str(e)

    if load_error:
        raise RuntimeError(f"无法解析 .mat 文件：{load_error}。"
                           f"请确认是数值型 .mat（v5/v7.3），脚本生成的复杂对象暂不支持。")

    if not arrays:
        raise RuntimeError("文件中没有找到数值数组。仅支持数值数据的查看。")

    summaries = []
    chart_png = None
    line_candidates = []   # (score, name, arr)
    heat_candidates = []   # (score, name, arr)
    for name, raw_arr in arrays.items():
        arr = raw_arr
        # scipy 把 1D 存成 [1,N]，规整为 1D 便于绘图
        if arr.ndim == 2 and 1 in arr.shape and arr.size > 1:
            arr = arr.reshape(-1)
        if arr.ndim == 1 and arr.size >= 2 and np.issubdtype(arr.dtype, np.number):
            line_candidates.append((_variation_score(arr), name, arr))
        elif arr.ndim == 2 and arr.size >= 4 and arr.size <= MAX_PIXELS_HEATMAP \
                and np.issubdtype(arr.dtype, np.number):
            heat_candidates.append((_variation_score(arr), name, arr))
        summaries.append(_array_summary(name, raw_arr))

    # 优先选波动最丰富的曲线，其次热图
    if line_candidates:
        line_candidates.sort(key=lambda x: x[0], reverse=True)
        chart_png = _chart_1d(line_candidates[0][1], line_candidates[0][2], out_dir)
    elif heat_candidates:
        heat_candidates.sort(key=lambda x: x[0], reverse=True)
        chart_png = _chart_2d(heat_candidates[0][1], heat_candidates[0][2], out_dir)

    with open(os.path.join(out_dir, "data.json"), "w", encoding="utf-8") as f:
        json.dump({"arrays": summaries}, f, ensure_ascii=False, indent=2)

    return {
        "data_json": os.path.join(out_dir, "data.json"),
        "chart_png": chart_png,
        "array_count": len(summaries),
    }
