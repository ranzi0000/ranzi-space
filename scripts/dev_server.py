#!/usr/bin/env python3
"""Offline preview. Open /?fixture=ok|alerts|unknown|error to set a local cookie.

The page JS stays unchanged; /api/summary reads that cookie. An explicit API
?fixture= overrides it for this request only. No production APIs are proxied.
"""

import argparse
from functools import partial
from http.cookies import CookieError, SimpleCookie
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

FIXTURES = frozenset({"ok", "alerts", "unknown", "error"})
COOKIE = "preview_fixture"


class PreviewHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, summary_fixture, **kwargs):
        self.summary_fixture = summary_fixture
        self.fixture_cookie = None
        super().__init__(*args, **kwargs)

    def selected_fixture(self):
        query = parse_qs(urlsplit(self.path).query, keep_blank_values=True)
        if "fixture" in query:
            return query["fixture"][0]
        cookie = SimpleCookie()
        try:
            cookie.load(self.headers.get("Cookie", ""))
        except CookieError:
            return None
        return cookie[COOKIE].value if COOKIE in cookie else None

    def dispatch(self, head=False):
        path = urlsplit(self.path).path
        if path == "/api/summary":
            self.send_summary(head=head)
        elif path in ("/", "/index.html") and "fixture" in parse_qs(urlsplit(self.path).query, keep_blank_values=True):
            name = self.selected_fixture()
            if name not in FIXTURES:
                self.send_error(400, "Unknown fixture")
                return
            self.fixture_cookie = name
            super().do_HEAD() if head else super().do_GET()
        else:
            super().do_HEAD() if head else super().do_GET()

    def do_GET(self):
        self.dispatch()

    def do_HEAD(self):
        self.dispatch(head=True)

    def end_headers(self):
        if self.fixture_cookie:
            self.send_header("Set-Cookie", f"{COOKIE}={self.fixture_cookie}; Path=/; HttpOnly; SameSite=Lax")
            self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def send_summary(self, head=False):
        name = self.selected_fixture()
        if name is not None and name not in FIXTURES:
            self.send_error(400, "Unknown fixture")
            return
        fixture = self.summary_fixture.with_name(name + ".json") if name else self.summary_fixture
        content = fixture.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        if not head:
            self.wfile.write(content)


def main():
    repo = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=repo,
                        help="static root (can point to an exported baseline)")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()
    handler = partial(PreviewHandler, directory=str(args.root.resolve()),
                      summary_fixture=repo / "tests/fixtures/summary.json")
    with ThreadingHTTPServer(("localhost", args.port), handler) as server:
        print(f"Preview ready on port {server.server_port}", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
