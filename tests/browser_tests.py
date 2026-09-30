"""End-to-end tests against the real compiled C++ engine and browser controls.

Install requirements: python3 -m pip install -r tests/requirements.txt
Install browser:      python3 -m playwright install chromium
Run:                  make test-web
"""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import os
from pathlib import Path
import shutil
import threading
import unittest

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
WINNING_ROUTE = "ddssdassssaaddwwddddddwwwwssddddww"


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


class BrowserTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(
            ("127.0.0.1", 0), partial(QuietHandler, directory=str(ROOT / "web"))
        )
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.url = "http://127.0.0.1:" + str(cls.server.server_port)
        cls.playwright = sync_playwright().start()
        executable = os.environ.get("CHROMIUM_PATH") or shutil.which("chromium")
        cls.browser = cls.playwright.chromium.launch(
            **({"executable_path": executable} if executable else {})
        )

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.playwright.stop()
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()

    def setUp(self):
        self.context = self.browser.new_context(viewport={"width": 1440, "height": 1000})
        self.page = self.context.new_page()
        self.errors = []
        self.page.on("pageerror", lambda error: self.errors.append(str(error)))
        self.page.goto(self.url)
        expect(self.page.locator("body")).to_have_attribute("data-engine", "ready")

    def tearDown(self):
        self.context.close()
        self.assertEqual(self.errors, [])

    def start(self):
        self.page.get_by_role("button", name="Enter the cavern").click()
        expect(self.page.locator("#game-overlay")).to_be_hidden()

    def walk(self, commands):
        # A held key paces on a 140 ms gate; exercise real keyboard events.
        for command in commands:
            self.page.keyboard.press(command)
            self.page.wait_for_timeout(120)

    def test_keyboard_collision_and_modal_pause(self):
        self.start()
        self.walk(["ArrowUp", "x"])
        expect(self.page.locator("#torch-count")).to_have_text("50 moves")
        self.walk(["ArrowRight"])
        expect(self.page.locator("#torch-count")).to_have_text("49 moves")
        self.page.keyboard.press("Escape")
        expect(self.page.locator("#pause-dialog")).to_be_visible()
        self.walk("d")
        expect(self.page.locator("#torch-count")).to_have_text("49 moves")
        self.page.get_by_role("button", name="Keep exploring", exact=True).click()
        self.walk("d")
        expect(self.page.locator("#torch-count")).to_have_text("48 moves")
        self.page.keyboard.press("h")
        expect(self.page.locator("#help-dialog")).to_be_visible()
        self.walk("s")
        expect(self.page.locator("#torch-count")).to_have_text("48 moves")
        self.page.keyboard.press("Escape")
        expect(self.page.locator("#help-dialog")).to_be_hidden()

    def test_victory_persistence_and_replay(self):
        self.start()
        self.walk(WINNING_ROUTE)
        expect(self.page.locator("#overlay-title")).to_have_text("Back to the light.")
        expect(self.page.locator("#result-stats")).to_contain_text("220")
        expect(self.page.locator("#best-score")).to_have_text("220")
        expect(self.page.locator("#crystal-count")).to_have_text("5")
        self.walk("s")
        expect(self.page.locator("#torch-count")).to_have_text("16 moves")
        self.page.get_by_role("button", name="Explore again").click()
        expect(self.page.locator("#run-number")).to_have_text("02")
        expect(self.page.locator("#crystal-count")).to_have_text("0")
        expect(self.page.locator("#health-count")).to_have_text("5")
        expect(self.page.locator("#torch-count")).to_have_text("50 moves")
        self.page.reload()
        expect(self.page.locator("#best-score")).to_have_text("220")

    def test_last_turn_victory(self):
        self.start()
        self.walk("da" * 8 + WINNING_ROUTE)
        expect(self.page.locator("#overlay-title")).to_have_text("Back to the light.")
        expect(self.page.locator("#torch-count")).to_have_text("0 moves")
        expect(self.page.locator("#result-stats")).to_contain_text("60")

    def test_both_loss_conditions(self):
        self.start()
        self.walk("ssssdddadad")
        expect(self.page.locator("#overlay-title")).to_have_text("A step too far.")
        expect(self.page.locator("#health-count")).to_have_text("0")
        self.page.get_by_role("button", name="Explore again").click()
        self.walk("da" * 25)
        expect(self.page.locator("#overlay-title")).to_have_text("One last flicker.")
        expect(self.page.locator("#torch-count")).to_have_text("0 moves")
        self.walk("d")
        expect(self.page.locator("#torch-count")).to_have_text("0 moves")

    def test_restart_confirmation_and_sound(self):
        self.start()
        self.walk("ddssd")
        self.page.keyboard.press("r")
        expect(self.page.locator("#restart-dialog")).to_be_visible()
        self.page.get_by_role("button", name="Keep exploring", exact=True).click()
        expect(self.page.locator("#crystal-count")).to_have_text("1")
        self.page.get_by_role("button", name="Restart", exact=True).click()
        self.page.get_by_role("button", name="Start a new run").click()
        expect(self.page.locator("#crystal-count")).to_have_text("0")
        expect(self.page.locator("#torch-count")).to_have_text("50 moves")
        self.page.get_by_role("button", name="Enable sound").click()
        expect(self.page.locator("#sound-button")).to_have_attribute("aria-pressed", "true")
        self.walk("d")
        self.page.reload()
        expect(self.page.locator("#sound-button")).to_have_attribute("aria-pressed", "true")

    def test_mobile_controls_and_responsive_layout(self):
        self.page.set_viewport_size({"width": 390, "height": 844})
        self.start()
        expect(self.page.locator(".mobile-hud")).to_be_visible()
        self.page.get_by_role("button", name="Move right", exact=True).click()
        expect(self.page.locator("#mobile-torch")).to_have_text("49 moves")
        self.assertFalse(self.page.evaluate("document.documentElement.scrollWidth > innerWidth"))
        self.page.wait_for_timeout(130)
        self.page.get_by_role("button", name="Move right", exact=True).focus()
        self.page.keyboard.press("Enter")
        expect(self.page.locator("#mobile-torch")).to_have_text("48 moves")
        for width in (320, 768, 1024, 1440):
            self.page.set_viewport_size({"width": width, "height": 900})
            self.assertFalse(self.page.evaluate("document.documentElement.scrollWidth > innerWidth"), str(width))

    def test_mobile_dpad_bump_feedback(self):
        self.page.set_viewport_size({"width": 390, "height": 844})
        self.start()
        # The start tile is walled to the north and west, so those taps are
        # collisions. The button lights up while the finger is down, the nudge
        # arms in the blocked direction, and the torch never moves.
        up = self.page.get_by_role("button", name="Move up", exact=True)
        up.dispatch_event("pointerdown", {"pointerId": 7, "pointerType": "touch"})
        self.assertTrue(up.evaluate("el => el.classList.contains('pressed')"))
        expect(self.page.locator("#mobile-torch")).to_have_text("50 moves")
        up.dispatch_event("pointerup", {"pointerId": 7, "pointerType": "touch"})
        self.assertFalse(up.evaluate("el => el.classList.contains('pressed')"))
        self.page.wait_for_timeout(80)
        self.assertGreater(self.page.evaluate("__cavernRenderer.bumpAt"), 0)
        self.assertEqual(self.page.evaluate("__cavernRenderer.bumpY"), -1)
        expect(self.page.locator("#mobile-torch")).to_have_text("50 moves")
        self.page.get_by_role("button", name="Move left", exact=True).click()
        self.page.wait_for_timeout(80)
        self.assertEqual(self.page.evaluate("__cavernRenderer.bumpX"), -1)
        expect(self.page.locator("#mobile-torch")).to_have_text("50 moves")
        # A blocked tap must not swallow the next one: the following step lands.
        self.page.get_by_role("button", name="Move right", exact=True).click()
        expect(self.page.locator("#mobile-torch")).to_have_text("49 moves")
        expect(self.page.locator("#mobile-crystals")).to_have_text("0 / 5")
        self.assertEqual(self.errors, [])

    def test_mobile_dpad_health_loss_route(self):
        self.page.set_viewport_size({"width": 390, "height": 844})
        self.start()
        names = {
            "w": "Move up",
            "a": "Move left",
            "s": "Move down",
            "d": "Move right",
        }
        # The spike route that ends a run on hearts rather than torchlight,
        # driven entirely from the touch pad.
        for command in "ssssdddadad":
            self.page.get_by_role("button", name=names[command], exact=True).click()
        expect(self.page.locator("#overlay-title")).to_have_text("A step too far.")
        expect(self.page.locator("#mobile-health")).to_have_text("0 / 5")
        expect(self.page.locator("#mobile-torch")).to_have_text("39 moves")
        expect(self.page.locator("#result-stats")).to_contain_text("crystals")
        self.assertEqual(self.errors, [])

    def test_reduced_motion_and_storage_unavailable(self):
        self.page.emulate_media(reduced_motion="reduce")
        self.page.add_init_script("Object.defineProperty(window, 'localStorage', {get(){throw new Error('unavailable')}})")
        self.page.reload()
        expect(self.page.locator("body")).to_have_attribute("data-engine", "ready")
        self.start()
        self.walk(WINNING_ROUTE)
        expect(self.page.locator("#overlay-title")).to_have_text("Back to the light.")

    def test_download_and_engine_loading_error(self):
        with self.page.expect_download() as download_info:
            self.page.get_by_role("link", name="Download source").click()
        self.assertEqual(download_info.value.suggested_filename, "crystal-cavern-source.zip")
        self.assertIsNone(download_info.value.failure())
        self.page.route("**/engine.wasm", lambda route: route.abort())
        self.page.reload()
        expect(self.page.locator("body")).to_have_attribute("data-engine", "error")
        expect(self.page.get_by_role("button", name="Reload the game")).to_be_enabled()
        self.page.unroute("**/engine.wasm")
        self.page.get_by_role("button", name="Reload the game").click()
        expect(self.page.locator("body")).to_have_attribute("data-engine", "ready")

    # Pixel hashes read back the canvas backing store, so they work at any
    # device pixel ratio and catch sub-pixel regressions a position read misses.
    CANVAS_HASH = """
    () => {
      const canvas = document.getElementById('cavern');
      const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      let h = 2166136261;
      for (let i = 0; i < data.length; i++) { h ^= data[i]; h = Math.imul(h, 16777619); }
      return (h >>> 0).toString(16);
    }
    """

    def test_wall_bump_feedback(self):
        self.start()
        # Walls border the start on the north and west, so both blocked presses
        # must arm the nudge in the right direction. The feedback pipeline is
        # checked here; the painted board itself keeps animating dust and
        # flicker in normal motion, so pixel-level checks live in the
        # reduced-motion test where the canvas is deterministic.
        self.page.keyboard.press("w")
        self.page.wait_for_timeout(60)
        self.assertGreater(self.page.evaluate("__cavernRenderer.bumpAt"), 0)
        self.assertEqual(self.page.evaluate("__cavernRenderer.bumpY"), -1)
        expect(self.page.locator("#torch-count")).to_have_text("50 moves")
        self.walk(["w", "w"])
        expect(self.page.locator("#torch-count")).to_have_text("50 moves")
        self.page.keyboard.press("a")
        self.page.wait_for_timeout(60)
        self.assertEqual(self.page.evaluate("__cavernRenderer.bumpX"), -1)
        expect(self.page.locator("#torch-count")).to_have_text("50 moves")
        self.assertEqual(self.errors, [])

    def test_dialog_open_animation(self):
        self.start()
        # The open animation lasts 190 ms, which is easy to miss between two
        # driver round-trips. Pausing it keeps every animation observable
        # without changing which animations the stylesheet declares.
        self.page.add_style_tag(
            content="dialog[open], dialog[open]::backdrop"
            " { animation-play-state: paused !important; }"
        )
        self.page.keyboard.press("Escape")
        expect(self.page.locator("#pause-dialog")).to_be_visible()
        names = self.page.evaluate(
            "() => document.getAnimations().map(a => a.animationName)"
        )
        self.assertIn("dialog-in", names)
        self.assertIn("backdrop-in", names)
        self.page.keyboard.press("Escape")
        expect(self.page.locator("#pause-dialog")).to_be_hidden()
        self.assertEqual(self.errors, [])

    def test_reduced_motion_freezes_the_board(self):
        self.page.emulate_media(reduced_motion="reduce")
        self.page.reload()
        expect(self.page.locator("body")).to_have_attribute("data-engine", "ready")
        self.start()
        self.assertTrue(self.page.evaluate("__cavernRenderer.reducedMotion"))
        # Movement keeps working; only the animation is gone. This route stays
        # on the winning path, then backtracks north.
        self.walk(["d", "d", "s", "w"])
        expect(self.page.locator("#torch-count")).to_have_text("46 moves")
        self.page.wait_for_timeout(150)
        settled = self.page.evaluate(self.CANVAS_HASH)
        # Many animation frames later, a fully static board must be untouched.
        self.page.wait_for_timeout(400)
        self.assertEqual(self.page.evaluate(self.CANVAS_HASH), settled)
        # A blocked press repaints once, settles within its 180 ms window, and
        # still costs nothing.
        self.page.keyboard.press("w")
        expect(self.page.locator("#torch-count")).to_have_text("46 moves")
        self.page.wait_for_timeout(300)
        self.assertEqual(self.page.evaluate(self.CANVAS_HASH), settled)

    def test_terrain_blits_one_to_one_with_the_canvas(self):
        self.page.emulate_media(reduced_motion="reduce")
        self.page.reload()
        expect(self.page.locator("body")).to_have_attribute("data-engine", "ready")
        self.start()
        self.page.wait_for_timeout(200)
        # The terrain backbuffer is authored in device pixels, so it must reach
        # the canvas unscaled: pixel (i, j) of the board has to equal pixel
        # (i, j) of the cached terrain. The vignette is transparent near the
        # centre and no item or glow reaches it, so the comparison is exact.
        # Drawing the terrain through the board transform instead would resample
        # it and this block would no longer match.
        result = self.page.evaluate(
            """
            () => {
              const r = window.__cavernRenderer;
              const canvas = r.canvas, terrain = r.terrain;
              const size = 32;
              const x = Math.round(480 * r.scaleX) - size / 2;
              const y = Math.round(288 * r.scaleY) - size / 2;
              const a = canvas.getContext('2d').getImageData(x, y, size, size).data;
              const b = terrain.getContext('2d').getImageData(x, y, size, size).data;
              let differing = 0, painted = 0;
              for (let i = 0; i < a.length; i += 4) {
                if (a[i + 3] > 0) painted++;
                if (a[i] !== b[i] || a[i + 1] !== b[i + 1] ||
                    a[i + 2] !== b[i + 2] || a[i + 3] !== b[i + 3]) differing++;
              }
              return {differing, painted, total: a.length / 4};
            }
            """
        )
        self.assertEqual(result["painted"], result["total"])
        self.assertEqual(result["differing"], 0)
        self.assertEqual(self.errors, [])

    def test_drawing_buffer_follows_display_and_density(self):
        self.context.close()
        self.context = self.browser.new_context(
            viewport={"width": 1280, "height": 900}, device_scale_factor=3
        )
        self.page = self.context.new_page()
        self.errors = []
        self.page.on("pageerror", lambda error: self.errors.append(str(error)))
        self.page.goto(self.url)
        expect(self.page.locator("body")).to_have_attribute("data-engine", "ready")
        self.start()
        # A 3x phone screen does not need 3x the pixels: the ratio is capped.
        # int(x + 0.5) matches the renderer's Math.round without tripping over
        # Python's banker's rounding on exact halves.
        def expected_size():
            box = self.page.evaluate(
                "() => { const r = document.getElementById('cavern')"
                ".getBoundingClientRect(); return [r.width, r.height]; }"
            )
            return int(box[0] * 2 + 0.5), int(box[1] * 2 + 0.5)

        width, height = expected_size()
        self.assertEqual(
            self.page.evaluate("document.getElementById('cavern').width"), width
        )
        self.assertEqual(
            self.page.evaluate("document.getElementById('cavern').height"), height
        )
        # Shrinking the viewport rescales the backing store instead of stretching.
        self.page.set_viewport_size({"width": 640, "height": 700})
        self.page.wait_for_timeout(150)
        width, height = expected_size()
        self.assertEqual(
            self.page.evaluate("document.getElementById('cavern').width"), width
        )
        self.assertEqual(
            self.page.evaluate("document.getElementById('cavern').height"), height
        )
        self.assertEqual(self.errors, [])


if __name__ == "__main__":
    unittest.main(verbosity=2)
