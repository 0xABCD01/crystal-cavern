"""Bundle project source for the game's download button, without local artifacts."""
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

root = Path(__file__).resolve().parents[1]
output = root / "web" / "crystal-cavern-source.zip"
folders = ("include", "src", "tests", "scripts", "web", "docs", ".github")
files = [root / name for name in ("README.md", "Makefile", "PROMPT.md", "LICENSE", ".gitignore", ".gitattributes")]
for folder in folders:
    files.extend(path for path in (root / folder).rglob("*") if path.is_file())
with ZipFile(output, "w", compression=ZIP_DEFLATED) as archive:
    for path in sorted(files):
        if path == output or "__pycache__" in path.parts or not path.exists():
            continue
        archive.write(path, Path("crystal-cavern") / path.relative_to(root))
print("Created web/crystal-cavern-source.zip")
