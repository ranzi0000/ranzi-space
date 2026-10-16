#!/usr/bin/env python3
"""Local static preview with an offline summary fixture; no production APIs."""

import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit


class PreviewHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, summary_fixture, **kwargs):
        self.summary_fixture = summary_fixture
        super().__init__(*args, **kwargs)

    def do_GET(self):
        if urlsplit(self.path).path == "/api/summary":
            self.send_summary()
        else:
            super().do_GET()

    def do_HEAD(self):
        if urlsplit(self.path).path == "/api/summary":
            self.send_summary(head=True)
        else:
            super().do_HEAD()

    def send_summary(self, head=False):
        content = self.summary_fixture.read_bytes()
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
    # Bind only to the local machine; never proxy or mutate production data.
    with ThreadingHTTPServer(("localhost", args.port), handler) as server:
        print(f"Preview ready on port {server.server_port}", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
