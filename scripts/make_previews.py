"""Regenerate docs/preview*.png from the real compiled browser engine.

Serves web/ over HTTP, drives Chromium with Playwright, and captures the same
three states the README advertises: a mid-run desktop board, the start screen
menu, and a phone layout with touch controls.

Install requirements: python3 -m pip install -r tests/requirements.txt
Install browser:      python3 -m playwright install chromium
Run:                  python3 scripts/make_previews.py
"""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import os
from pathlib import Path
import shutil
import threading

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"

# A safe prefix of the winning route: every step stays on the winning path, so
# the board shows a real mid-run state without risking a spike or a wall.
MID_RUN_ROUTE = ["d", "d", "s", "s", "d", "a", "s", "s", "s", "s", "a", "a"]


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


def serve():
    server = ThreadingHTTPServer(
        ("127.0.0.1", 0), partial(QuietHandler, directory=str(ROOT / "web"))
    )
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server, "http://127.0.0.1:" + str(server.server_port)


def ready(page):
    page.wait_for_function("document.body.dataset.engine === 'ready'")


def start(page):
    page.get_by_role("button", name="Enter the cavern").click()
    page.get_by_role("button", name="Enter the cavern").wait_for(state="hidden")


def walk(page, commands):
    for command in commands:
        page.keyboard.press(command)
        page.wait_for_timeout(120)


def capture(browser, url, name, viewport, *, menu=False, route=()):
    context = browser.new_context(viewport=viewport)
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(url)
    ready(page)
    if menu:
        # The start overlay is already up; let the opening render settle.
        page.wait_for_timeout(400)
    else:
        start(page)
        walk(page, route)
        # Give the movement tween and the light plume a moment to catch up.
        page.wait_for_timeout(400)
    out = DOCS / name
    page.screenshot(path=str(out), full_page=True)
    context.close()
    if errors:
        raise SystemExit(f"{name}: page errors: {errors}")
    return out


def main():
    server, url = serve()
    playwright = sync_playwright().start()
    executable = os.environ.get("CHROMIUM_PATH") or shutil.which("chromium")
    browser = playwright.chromium.launch(
        **({"executable_path": executable} if executable else {})
    )
    try:
        shots = [
            ("preview.png", {"width": 1440, "height": 1000}, False, MID_RUN_ROUTE),
            ("preview-menu.png", {"width": 1440, "height": 1000}, True, ()),
            ("preview-mobile.png", {"width": 390, "height": 844}, False, MID_RUN_ROUTE),
        ]
        for name, viewport, menu, route in shots:
            out = capture(browser, url, name, viewport, menu=menu, route=route)
            print(f"wrote {out.relative_to(ROOT)}")
    finally:
        browser.close()
        playwright.stop()
        server.shutdown()
        server.server_close()


if __name__ == "__main__":
    main()
