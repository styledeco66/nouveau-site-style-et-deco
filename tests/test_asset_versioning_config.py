from pathlib import Path
import tomllib
import unittest


ROOT = Path(__file__).resolve().parents[1]


class AssetVersioningBuildTests(unittest.TestCase):
    def test_build_verifies_asset_fingerprints_before_publishing(self):
        config = tomllib.loads((ROOT / "netlify.toml").read_text(encoding="utf-8"))
        self.assertEqual(config["build"]["command"], "node scripts/asset-versions.mjs --check && node scripts/build-email-logo.mjs --check")
        self.assertEqual(config["build"]["publish"], "sitesite-template")
        self.assertTrue((ROOT / "scripts" / "asset-versions.mjs").is_file())

    def test_functions_directory_is_unchanged(self):
        config = tomllib.loads((ROOT / "netlify.toml").read_text(encoding="utf-8"))
        self.assertEqual(config["functions"]["directory"], "netlify/functions")


if __name__ == "__main__":
    unittest.main()
