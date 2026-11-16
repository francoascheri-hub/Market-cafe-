"""Recompress the three cafe photos and add a smaller src for the menu strip."""
from pathlib import Path
from PIL import Image

root = Path("public/photos")


def save(im: Image.Image, path: Path, quality: int = 68) -> None:
    tmp = path.with_suffix(".tmp.webp")
    im.save(tmp, "WEBP", quality=quality, method=6)
    if path.exists() and tmp.stat().st_size >= path.stat().st_size:
        tmp.unlink()
        return
    tmp.replace(path)


def fit(im: Image.Image, width: int) -> Image.Image:
    w, h = im.size
    if w <= width:
        return im
    nh = round(h * width / w)
    return im.resize((width, nh), Image.Resampling.LANCZOS)


# 1. Tamp photo: menu strip, currently a single 1200px file.
tamp = Image.open(root / "photo-m187311853-1200.webp").convert("RGB")
for width in (480, 800, 1200):
    out = fit(tamp, width)
    name = "photo-m187311853-1200.webp" if width == 1200 else f"photo-m187311853-{width}.webp"
    save(out, root / name)

# 2. Espresso hero and 3. steamed milk: recompress every existing variant in place.
for name in [
    "photo-m61713028.webp",
    "photo-m61713028-500.webp",
    "photo-m61713028-960.webp",
    "photo-m61713028-1280.webp",
    "photo-m61713028-780x975.webp",
    "photo-m201752739.webp",
    "photo-m201752739-500.webp",
    "photo-m201752739-960.webp",
]:
    path = root / name
    before = path.stat().st_size
    im = Image.open(path).convert("RGB")
    save(im, path)
    after = path.stat().st_size
    print(f"{name}: {im.size} {before} -> {after}")

for path in sorted(root.glob("photo-m187311853*.webp")):
    im = Image.open(path)
    print(f"{path.name}: {im.size} {path.stat().st_size}")
