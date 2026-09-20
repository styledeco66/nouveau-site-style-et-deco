from pathlib import Path
import unittest


REDIRECTS = Path(__file__).resolve().parents[1] / "sitesite-template" / "_redirects"


class PerpignanCanonicalRedirectTests(unittest.TestCase):
    def test_extensionless_perpignan_redirects_permanently_to_canonical_url(self):
        rules = REDIRECTS.read_text(encoding="utf-8").splitlines()
        self.assertIn("/perpignan /perpignan.html 301", rules)


if __name__ == "__main__":
    unittest.main()
