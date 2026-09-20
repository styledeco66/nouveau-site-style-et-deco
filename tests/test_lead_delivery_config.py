from html.parser import HTMLParser
from pathlib import Path
import re
import tomllib
import unittest


ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / "sitesite-template"
ENDPOINT = "/.netlify/functions/lead"
FORMS = {
    "index.html": {"lead_hero", "lead_contact"},
    "perpignan.html": {"lead_perpignan"},
}
ENV_VARIABLES = ["RESEND_API_KEY", "LEAD_TO_EMAIL", "LEAD_FROM_EMAIL", "LEAD_ALLOWED_ORIGINS"]


class FormCollector(HTMLParser):
    """Collecte, pour chaque <form>, ses attributs et ses champs."""

    def __init__(self):
        super().__init__()
        self.forms = []
        self.scripts = []
        self._current = None

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "form":
            self._current = {"attrs": attrs, "inputs": [], "status": None}
            self.forms.append(self._current)
        elif tag == "script" and attrs.get("src"):
            self.scripts.append(attrs["src"])
        elif self._current is not None:
            if tag == "input":
                self._current["inputs"].append(attrs)
            if "js-form-status" in (attrs.get("class") or "").split():
                self._current["status"] = attrs

    def handle_endtag(self, tag):
        if tag == "form":
            self._current = None


def parse(page):
    collector = FormCollector()
    collector.feed((SITE / page).read_text(encoding="utf-8"))
    return collector


class LeadFormMarkupTests(unittest.TestCase):
    def test_forms_post_to_the_netlify_function_without_netlify_forms(self):
        for page, expected in FORMS.items():
            forms = parse(page).forms
            self.assertEqual({f["attrs"].get("name") for f in forms}, expected, page)
            for form in forms:
                attrs = form["attrs"]
                self.assertEqual(attrs.get("action"), ENDPOINT, attrs.get("name"))
                self.assertEqual((attrs.get("method") or "").lower(), "post", attrs.get("name"))
                self.assertNotIn("data-netlify", attrs)
                self.assertNotIn("data-netlify-honeypot", attrs)
                hidden_names = {i.get("name"): i.get("value") for i in form["inputs"] if i.get("type") == "hidden"}
                self.assertEqual(hidden_names.get("form-name"), attrs.get("name"))

    def test_no_page_still_relies_on_netlify_forms(self):
        for page in SITE.rglob("*.html"):
            self.assertNotIn("data-netlify", page.read_text(encoding="utf-8"), str(page))

    def test_each_form_keeps_an_invisible_honeypot(self):
        for page in FORMS:
            source = (SITE / page).read_text(encoding="utf-8")
            self.assertEqual(source.count('<p style="display:none;">'), len(parse(page).forms), page)
            for form in parse(page).forms:
                honeypots = [i for i in form["inputs"] if i.get("name") == "bot-field"]
                self.assertEqual(len(honeypots), 1)
                self.assertEqual(honeypots[0].get("tabindex"), "-1")
                self.assertEqual(honeypots[0].get("autocomplete"), "off")

    def test_each_form_has_an_accessible_hidden_error_area(self):
        for page in FORMS:
            for form in parse(page).forms:
                status = form["status"]
                self.assertIsNotNone(status, form["attrs"].get("name"))
                self.assertEqual(status.get("role"), "alert")
                self.assertIn("hidden", status)

    def test_lead_form_script_is_loaded_before_app_script_on_form_pages(self):
        for page in FORMS:
            scripts = parse(page).scripts
            lead = [i for i, src in enumerate(scripts) if src.endswith("assets/js/lead-form.js")]
            app = [i for i, src in enumerate(scripts) if src.endswith("assets/js/app.js")]
            self.assertEqual(len(lead), 1, page)
            self.assertEqual(len(app), 1, page)
            self.assertLess(lead[0], app[0], page)

    def test_app_script_no_longer_pushes_conversion_events_on_bare_submit(self):
        app = (SITE / "assets" / "js" / "app.js").read_text(encoding="utf-8")
        self.assertNotIn("form_submit_", app)

    def test_csp_still_restricts_form_actions_and_connections_to_same_origin(self):
        headers = (SITE / "_headers").read_text(encoding="utf-8")
        self.assertIn("form-action 'self'", headers)
        self.assertIn("default-src 'self'", headers)
        self.assertNotIn("connect-src", headers)  # repli sur default-src 'self'


class LeadDeliveryConfigTests(unittest.TestCase):
    def test_netlify_declares_the_functions_directory(self):
        config = tomllib.loads((ROOT / "netlify.toml").read_text(encoding="utf-8"))
        self.assertEqual(config["functions"]["directory"], "netlify/functions")
        self.assertTrue((ROOT / "netlify" / "functions" / "lead.mjs").is_file())

    def test_env_files_are_gitignored(self):
        ignored = (ROOT / ".gitignore").read_text(encoding="utf-8").splitlines()
        self.assertIn(".env", ignored)
        self.assertIn(".env.*", ignored)

    def test_documentation_lists_variables_without_secret_values(self):
        doc = (ROOT / "docs" / "lead-delivery.md").read_text(encoding="utf-8")
        for name in ENV_VARIABLES:
            self.assertIn(name, doc)
        self.assertIsNone(re.search(r"re_[A-Za-z0-9]{16,}", doc), "aucune clé Resend réelle")
        self.assertIn("Idempotency-Key", doc)
        self.assertIn("Limites", doc)

    def test_privacy_policy_names_the_new_processor(self):
        policy = (SITE / "legal" / "politique-confidentialite.html").read_text(encoding="utf-8")
        self.assertIn("Resend", policy)
        self.assertNotIn("Netlify Forms", policy)

    def test_rate_limit_rewrite_page_shows_the_exact_error_without_javascript(self):
        page = (SITE / "lead-rate-limited.html").read_text(encoding="utf-8")
        self.assertIn("Votre demande n’a pas pu être envoyée. Réessayez dans quelques minutes ou appelez le 06 50 75 62 42.", page)
        self.assertIn("<meta name=\"robots\" content=\"noindex\"", page)


if __name__ == "__main__":
    unittest.main()
