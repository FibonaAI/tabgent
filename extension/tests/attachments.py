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

# Local text PDF: no account access or model calls.
pdf = (Path(__file__).parent / "fixtures/text.pdf").read_bytes()
encoded = base64.b64encode(pdf).decode()
result = attachments.read_pdf(encoded)
assert result["pages"] == 1 and result["page"] == 1
assert "Read directly from PDF." in result["text"]
assert attachments.read_pdf(encoded, offset=5)["text"] == result["text"][5:]
try:
    attachments.read_pdf(encoded, page=2)
    raise AssertionError("Nonexistent page accepted")
except Exception as error:
    assert not isinstance(error, AssertionError)
print("PASS native PDF bytes, page text/count, offsets, and out-of-range page")

import host

session = host.Session.__new__(host.Session)
messages = []
session.emit = messages.append
session.request({"id": 42, "method": "bridge/pdf/read", "params": {"data": encoded}})
assert messages[0]["id"] == 42
assert messages[0]["result"]["text"] == result["text"]
print("PASS PDF bridge request is handled locally instead of forwarded to Codex")
