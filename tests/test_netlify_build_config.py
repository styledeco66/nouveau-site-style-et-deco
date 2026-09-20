from pathlib import Path
import tomllib
import unittest


NETLIFY_CONFIG = Path(__file__).resolve().parents[1] / "netlify.toml"


class NetlifyBuildConfigurationTests(unittest.TestCase):
    def test_publish_directory_is_the_deployed_site_directory(self):
        config = tomllib.loads(NETLIFY_CONFIG.read_text(encoding="utf-8"))
        self.assertEqual(config["build"]["publish"], "sitesite-template")


if __name__ == "__main__":
    unittest.main()
