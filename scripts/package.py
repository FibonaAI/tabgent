"""Build a source-only macOS distribution. Never includes local profiles or credentials."""

from pathlib import Path
import zipfile

root = Path(__file__).resolve().parents[1]
output = root / "dist/Browser-Agent-Connector-macOS.zip"
output.parent.mkdir(exist_ok=True)
files = [
    root / name
    for name in (
        "README.md",
        "LICENSE",
        "THIRD_PARTY_NOTICES.md",
        "Install.command",
        "CONTRIBUTING.md",
        "SECURITY.md",
        "package.json",
        "package-lock.json",
        "requirements-dev.txt",
        ".editorconfig",
        ".gitattributes",
        ".gitignore",
        ".prettierrc.json",
        ".prettierignore",
    )
]
for directory in ("extension", "docs", "scripts", ".github"):
    files += [
        p
        for p in (root / directory).rglob("*")
        if p.is_file() and "__pycache__" not in p.parts and p.suffix != ".pyc"
    ]
with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as archive:
    for file in sorted(files):
        archive.write(
            file, "Browser-Agent-Connector/" + file.relative_to(root).as_posix()
        )
print(output)
