import base64
from pathlib import Path
import sys
import tempfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "native"))
import attachments

with tempfile.TemporaryDirectory() as d:
    root = Path(d)
    saved = attachments.save(
        root, "quote.txt", base64.b64encode("\u4e2d\u6587 hello".encode()).decode()
    )
    assert attachments.read(root, saved)["text"] == "\u4e2d\u6587 hello"
    assert attachments.read(root, {**saved, "offset": 3})["text"] == "hello"
    for p in ["/etc/hosts", str(root / "missing")]:
        try:
            attachments.read(root, {"path": p})
            raise AssertionError("Escaped upload directory")
        except ValueError:
            pass
    try:
        attachments.save(root, "bad", "not base64")
        raise AssertionError("Invalid upload accepted")
    except ValueError:
        pass
    png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aEn8AAAAASUVORK5CYII="
    saved = attachments.save(root, "image.png", png)
    assert attachments.preview(root, saved)["url"] == "data:image/png;base64," + png
print("PASS attachment text/offset, image preview, path isolation, invalid upload")
