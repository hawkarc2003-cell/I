"""Regression checks. Run: python3 -m unittest discover -s tests."""

from html.parser import HTMLParser
from pathlib import Path
import hashlib
import os
import shutil
import struct
import subprocess
import unittest
import zlib

ROOT = Path(__file__).resolve().parents[1]


class PortfolioParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.cards = {}
        self.projects = {}
        self.links = []
        self.card = None
        self.project = None
        self.project_depth = 0
        self.library_hidden = False
        self.logo_src = None
        self.in_logo = False

    def handle_starttag(self, tag, attributes):
        attrs = dict(attributes)
        if tag == "a":
            self.links.append(attrs.get("href", ""))
            if "data-fan-project" in attrs:
                self.card = attrs["data-fan-project"]
                self.cards[self.card] = attrs
        if tag == "div" and attrs.get("class") == "project-library":
            self.library_hidden = "hidden" in attrs
        if tag == "div" and attrs.get("class") == "hero__logo":
            self.in_logo = True
        if tag == "div" and "data-project" in attrs:
            self.project = attrs["data-index"]
            self.project_depth = 1
            self.projects[self.project] = attrs
        elif tag == "div" and self.project:
            self.project_depth += 1
        if tag == "img":
            if self.in_logo:
                self.logo_src = attrs.get("src")
            if self.card:
                self.cards[self.card]["thumbnail"] = attrs["src"]
            if self.project:
                self.projects[self.project]["media"] = attrs["src"]
        if tag == "video" and self.project:
            self.projects[self.project]["video"] = attrs
        if tag == "source" and self.project:
            self.projects[self.project]["media"] = attrs["src"]

    def handle_endtag(self, tag):
        if tag == "a":
            self.card = None
        if tag == "div" and self.project:
            self.project_depth -= 1
            if self.project_depth == 0:
                self.project = None
        if tag == "div" and self.in_logo:
            self.in_logo = False


def first_png_pixel_alpha(path):
    data = path.read_bytes()
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError("Not a PNG")
    offset = 8
    chunks = []
    color_type = None
    while offset < len(data):
        length = struct.unpack(">I", data[offset:offset + 4])[0]
        kind = data[offset + 4:offset + 8]
        content = data[offset + 8:offset + 8 + length]
        if kind == b"IHDR":
            color_type = content[9]
        elif kind == b"IDAT":
            chunks.append(content)
        elif kind == b"IEND":
            break
        offset += length + 12
    if color_type != 6:
        raise ValueError("Expected RGBA PNG")
    # The first pixel has no left or above neighbours, so every PNG row
    # filter stores its RGBA bytes directly after the first filter byte.
    first_row = zlib.decompress(b"".join(chunks))
    return first_row[4]


class PortfolioTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.page = PortfolioParser()
        cls.page.feed((ROOT / "index.html").read_text(encoding="utf-8"))

    def test_one_gallery_and_one_link_per_social(self):
        self.assertTrue(self.page.library_hidden)
        self.assertEqual(len(self.page.cards), 12)
        self.assertEqual(len(self.page.projects), 12)
        self.assertEqual(self.page.links.count("https://instagram.com/theaeralla"), 1)
        self.assertEqual(self.page.links.count("https://in.pinterest.com/TRENDCART77/"), 1)

    def test_every_card_links_to_the_matching_original(self):
        for number in (f"{i:02}" for i in range(1, 13)):
            with self.subTest(project=number):
                card = self.page.cards[number]
                project = self.page.projects[number]
                video = project.get("video")
                self.assertEqual(card["href"], project["media"])
                self.assertTrue((ROOT / project["media"]).is_file())
                self.assertTrue(project["data-title"] and project["data-detail"] and project["data-description"])
                action, kind = ("Play", "video") if video else ("View", "image")
                self.assertEqual(card["aria-label"], f"{number}, {action} {project['data-title']} {kind}")
                if video:
                    poster = f"assets/work-previews/{number}.jpg"
                    self.assertEqual(video["poster"], poster)
                    self.assertEqual(card["thumbnail"], poster)
                    self.assertTrue((ROOT / poster).is_file())
                    self.assertIn("controls", video)
                    self.assertIn("playsinline", video)
                    self.assertNotIn("muted", video)
                    self.assertEqual(video["data-has-audio"], "false" if number in {"07", "09", "11"} else "true")
                else:
                    self.assertEqual(card["thumbnail"], project["media"])

    def test_transparent_logo_and_original_sources(self):
        self.assertEqual(self.page.logo_src, "assets/brand/theaeralla-logo-transparent.png")
        self.assertEqual(first_png_pixel_alpha(ROOT / self.page.logo_src), 0)
        original = ROOT / "assets/brand/file_000000003ecc8211a7451f649c04458b.png"
        self.assertEqual(hashlib.sha256(original.read_bytes()).hexdigest(), "1cbe70af4e428675d6c2680618277d0b6785aab794bd2d209130586fe0fe8004")
        sums = (ROOT / "assets/media/SHA256SUMS.txt").read_text(encoding="utf-8").splitlines()
        self.assertEqual(len(sums), 12)
        for line in sums:
            digest, name = line.split("  ", 1)
            with self.subTest(file=name):
                self.assertEqual(hashlib.sha256((ROOT / "assets/media" / name).read_bytes()).hexdigest(), digest)

    def test_audio_flags_match_original_files_when_ffmpeg_available(self):
        ffmpeg = os.environ.get("FFMPEG") or shutil.which("ffmpeg")
        if not ffmpeg:
            self.skipTest("FFmpeg is optional; set FFMPEG to check original audio tracks")
        for number, project in self.page.projects.items():
            if "video" not in project:
                continue
            with self.subTest(project=number):
                result = subprocess.run([ffmpeg, "-hide_banner", "-i", str(ROOT / project["media"])],
                                        capture_output=True, text=True, check=False)
                self.assertIn("Video:", result.stderr)
                self.assertEqual("Audio:" in result.stderr, project["video"]["data-has-audio"] == "true")


if __name__ == "__main__":
    unittest.main()
