"""Checks for the separate service pages and their original sample mappings."""

from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse
import hashlib
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]
BLOG = "https://hawkarc2003-cell.github.io/Theaerallapfl/"
EMAIL = "hawkarc2003@gmail.com"


class Element:
    def __init__(self, tag, attrs=()):
        self.tag = tag
        self.attrs = dict(attrs)
        self.children = []

    def descendants(self):
        for child in self.children:
            if isinstance(child, Element):
                yield child
                yield from child.descendants()

    def find_all(self, tag=None, css_class=None):
        return [item for item in self.descendants()
                if (tag is None or item.tag == tag)
                and (css_class is None or css_class in item.attrs.get("class", "").split())]

    def text(self):
        return "".join(child.text() if isinstance(child, Element) else child
                       for child in self.children)


class Document(HTMLParser):
    VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input",
            "link", "meta", "param", "source", "track", "wbr"}

    def __init__(self, path):
        super().__init__(convert_charrefs=True)
        self.root = Element("document")
        self.stack = [self.root]
        self.feed(path.read_text(encoding="utf-8"))

    def handle_starttag(self, tag, attrs):
        element = Element(tag, attrs)
        self.stack[-1].children.append(element)
        if tag not in self.VOID:
            self.stack.append(element)

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in self.VOID:
            self.handle_endtag(tag)

    def handle_endtag(self, tag):
        for index in range(len(self.stack) - 1, 0, -1):
            if self.stack[index].tag == tag:
                del self.stack[index:]
                break

    def handle_data(self, data):
        self.stack[-1].children.append(data)


def normalized(text):
    return " ".join(text.split())


def one(items):
    if len(items) != 1:
        raise AssertionError(f"Expected one matching element; got {len(items)}")
    return items[0]


SERVICES = {
    "pinterest": {
        "file": "service-pinterest.html",
        "title": "Pinterest Content",
        "description": "Save-worthy pins and visual content designed to help ideas be discovered.",
        "tiers": [
            ("Starter", "3 working days", ["5 custom pins", "SEO titles and descriptions"]),
            ("Growth", "5 working days", ["10 custom pins", "SEO titles, descriptions and keywords"]),
            ("Premium", "7 working days", ["15 custom pins", "SEO titles, descriptions and keywords", "2 carousel designs"]),
        ],
    },
    "productVisuals": {
        "file": "service-product-visuals.html",
        "title": "Faceless Product Visuals",
        "description": "Product-led imagery and short-form edits that put the little details in focus.",
        "tiers": [
            ("Starter", "3 working days", ["3 static visuals"]),
            ("Growth", "5 working days", ["5 static visuals", "1 short video edit"]),
            ("Premium", "7 working days", ["8 static visuals", "2 short video edits"]),
        ],
    },
    "websites": {
        "file": "service-websites.html",
        "title": "One-page Websites",
        "description": "Considered websites and landing pages that give brands an inviting digital home.",
        "tiers": [
            ("Starter", "5 working days", ["Up to 4 sections"]),
            ("Growth", "7 working days", ["Up to 6 sections", "Animations", "Contact links"]),
            ("Premium", "10–14 working days", ["Up to 8 sections", "Advanced visual styling", "Animations", "Responsive design"]),
        ],
    },
}


class ServicePageTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.home = Document(ROOT / "index.html").root
        cls.pages = {key: Document(ROOT / value["file"]).root for key, value in SERVICES.items()}

    def test_home_has_only_the_requested_service_links(self):
        service_list = one(self.home.find_all(css_class="service-list"))
        cards = service_list.find_all(css_class="service")
        self.assertEqual(len(cards), 3)
        for card, data in zip(cards, SERVICES.values()):
            self.assertEqual(card.tag, "a")
            self.assertEqual(card.attrs["href"], data["file"])
            self.assertEqual(normalized(one(card.find_all("h3")).text()), data["title"])
            self.assertEqual(normalized(one(card.find_all("p")).text()), data["description"])
        self.assertFalse(service_list.find_all("img"))
        self.assertFalse(self.home.find_all(css_class="package-card"))

    def test_blog_is_navigation_only_and_all_local_resources_exist(self):
        for name, root in [("home", self.home), *self.pages.items()]:
            with self.subTest(page=name):
                blogs = [a for a in root.find_all("a") if a.attrs.get("href") == BLOG]
                self.assertEqual(len(blogs), 2)  # desktop and mobile navigation
                for link in blogs:
                    self.assertEqual(link.attrs.get("target"), "_blank")
                    self.assertIn("noopener", link.attrs.get("rel", ""))
                for element in root.descendants():
                    for attr in ("href", "src", "poster"):
                        value = element.attrs.get(attr)
                        if not value or value.startswith(("#", "http:", "https:", "mailto:", "tel:", "data:")):
                            continue
                        path = unquote(urlparse(value).path)
                        self.assertTrue((ROOT / path).is_file(), f"{name}: missing {path}")
                if name != "home":
                    samples = one(root.find_all(css_class="service-samples"))
                    self.assertNotIn(BLOG, [link.attrs.get("href") for link in samples.find_all("a")])
                    self.assertTrue(any(link.attrs.get("href") == "index.html#services" for link in root.find_all("a")))

    def test_packages_delivery_revisions_policies_and_enquiries(self):
        for key, data in SERVICES.items():
            with self.subTest(service=key):
                root = self.pages[key]
                cards = root.find_all(css_class="package-card")
                self.assertEqual(len(cards), 3)
                for card, (tier, delivery, inclusions) in zip(cards, data["tiers"]):
                    self.assertEqual(normalized(one(card.find_all("h3")).text()), tier)
                    self.assertIn(delivery, normalized(one(card.find_all(css_class="package-card__delivery")).text()))
                    self.assertEqual([normalized(li.text()) for li in card.find_all("li")], inclusions + ["2 free revision rounds"])
                    price = one(card.find_all(css_class="package-card__price"))
                    self.assertEqual(price.attrs["data-service"], key)
                    self.assertEqual(price.attrs["data-tier"], tier.lower())
                    self.assertEqual(normalized(price.text()), "Price on enquiry")
                    enquiry = one(card.find_all(css_class="package-card__link"))
                    parsed = urlparse(enquiry.attrs["href"])
                    self.assertEqual((parsed.scheme, parsed.path), ("mailto", EMAIL))
                    subject = parse_qs(parsed.query)["subject"][0]
                    self.assertIn(data["title"], subject)
                    self.assertIn(tier, subject)
                policy = normalized(one(root.find_all(css_class="policy-list")).text())
                for phrase in ("50% advance", "remaining 50% due before final delivery",
                               "advance is paid and all required materials are received",
                               "Extra revisions and out-of-package work are quoted separately",
                               "exclude Sundays and public holidays"):
                    self.assertIn(phrase, policy)

    def test_editable_price_configuration_covers_all_nine_fields(self):
        prices = (ROOT / "service-prices.js").read_text(encoding="utf-8")
        for key in SERVICES:
            match = re.search(rf"\b{key}\s*:\s*\{{([^}}]+)\}}", prices)
            self.assertIsNotNone(match)
            for tier in ("starter", "growth", "premium"):
                self.assertRegex(match.group(1), rf'\b{tier}\s*:\s*"[^"]*"')
        for root in self.pages.values():
            scripts = [s.attrs.get("src") for s in root.find_all("script")]
            self.assertLess(scripts.index("service-prices.js"), scripts.index("script.js"))

    def test_pinterest_and_product_sample_sources(self):
        # Original files copied byte-for-byte from the creator's previous repositories.
        originals = {
            "assets/pinterest/rings-collection.jpg": "1c75fc2737dc1bf8f4e82afc833af8c6d6fe3077774d9638ff02bfce503529ed",
            "assets/product-visuals/summer-fridays.jpg": "ca907d9c1c76b04e2e889215d3f5beeac402d8122e26808e56c6c1c851e4e0c6",
        }
        for path, digest in originals.items():
            self.assertEqual(hashlib.sha256((ROOT / path).read_bytes()).hexdigest(), digest)

        pinterest = one(self.pages["pinterest"].find_all(css_class="service-samples"))
        pin_cards = pinterest.find_all("figure")
        self.assertEqual(len(pin_cards), 2)
        self.assertEqual(one(pin_cards[0].find_all("img")).attrs["src"], "assets/pinterest/rings-collection.jpg")
        self.assertIn("https://www.pinterest.com/trendcart77/premium-jewelry-collection-designer-rings/",
                      [a.attrs.get("href") for a in pin_cards[0].find_all("a")])
        pin_video = one(pin_cards[1].find_all("video"))
        self.assertEqual(one(pin_video.find_all("source")).attrs["src"], "assets/media/peaceful-notes.mp4")
        self.assertEqual(pin_video.attrs["data-has-audio"], "false")
        self.assertIn("https://www.pinterest.com/pin/939774647267567002/",
                      [a.attrs.get("href") for a in pin_cards[1].find_all("a")])

        product = one(self.pages["productVisuals"].find_all(css_class="service-samples"))
        cards = product.find_all("figure")
        self.assertEqual(len(cards), 6)
        self.assertEqual({img.attrs["src"] for img in product.find_all("img")}, {
            "assets/media/file_00000000b4e4821185a0f62eccb2d9fc.jpg",
            "assets/media/file_00000000311c8211bea4f023861b57ba.png",
            "assets/product-visuals/summer-fridays.jpg",
        })
        videos = product.find_all("video")
        self.assertEqual({one(v.find_all("source")).attrs["src"] for v in videos}, {
            "assets/media/lv_7610453473481493813_20261114134247(3).mp4",
            "assets/media/lv_7627484597755989269_20261113153930(5).mp4",
            "assets/media/lv-ugc(2).mp4",
        })
        sneaker = one([card for card in cards if any(
            source.attrs.get("src") == "assets/media/lv_7627484597755989269_20261113153930(5).mp4"
            for source in card.find_all("source"))])
        self.assertIn("https://www.instagram.com/p/DgAOBa2T61J/",
                      [a.attrs.get("href") for a in sneaker.find_all("a")])
        for video in [pin_video, *videos]:
            self.assertIn("controls", video.attrs)
            self.assertIn("playsinline", video.attrs)
            self.assertNotIn("muted", video.attrs)
            self.assertNotIn("autoplay", video.attrs)

    def test_website_examples_use_the_two_confirmed_sites(self):
        section = one(self.pages["websites"].find_all(css_class="service-samples"))
        cards = section.find_all(css_class="website-card")
        self.assertEqual(len(cards), 2)
        expected = [
            ("https://hawkarc2003-cell.github.io/Theaeralla/", "assets/site-previews/theaeralla-portfolio.png"),
            ("https://hawkarc2003-cell.github.io/Theaerallaptfl/", "assets/site-previews/theaerallaptfl-portfolio.png"),
        ]
        for card, (url, preview) in zip(cards, expected):
            image = one(card.find_all("img"))
            self.assertEqual(image.attrs["src"], preview)
            self.assertTrue(image.attrs.get("alt"))
            self.assertEqual((image.attrs["width"], image.attrs["height"]), ("1440", "900"))
            preview_link = one(card.find_all(css_class="website-card__preview"))
            self.assertEqual(one(preview_link.find_all("img")), image)
            self.assertIn("website preview", preview_link.attrs.get("aria-label", "").lower())
            view_link = one(card.find_all(css_class="website-card__link"))
            heading = normalized(one(card.find_all("h3")).text())
            self.assertIn(heading.lower(), view_link.attrs.get("aria-label", "").lower())
            self.assertEqual(len(card.find_all("a")), 2)
            for link in (preview_link, view_link):
                self.assertEqual(link.attrs["href"], url)
                self.assertEqual(link.attrs.get("target"), "_blank")
                self.assertIn("noopener", link.attrs.get("rel", "").split())
                self.assertIn("noreferrer", link.attrs.get("rel", "").split())
                self.assertIn("opens in a new tab", (link.attrs.get("aria-label", "") + link.text()).lower())
        self.assertNotIn("client", section.text().lower())
        self.assertNotIn("wedding", section.text().lower())


if __name__ == "__main__":
    unittest.main()
