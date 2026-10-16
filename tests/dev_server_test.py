"""Exercise the real request handler with in-memory HTTP, without opening ports."""
import importlib.util
import io
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("dev_server", ROOT / "scripts/dev_server.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class Connection:
    def __init__(self, request):
        self.input = io.BytesIO(request)
        self.output = io.BytesIO()

    def makefile(self, *args, **kwargs):
        return self.input

    def sendall(self, data):
        self.output.write(data)


class Handler(module.PreviewHandler):
    def log_message(self, *args):
        pass


class PreviewTests(unittest.TestCase):
    def request(self, path, method="GET"):
        connection = Connection(f"{method} {path} HTTP/1.0\r\n\r\n".encode())
        Handler(connection, ("sample-client", 0), None, directory=str(ROOT),
                summary_fixture=ROOT / "tests/fixtures/summary.json")
        headers, body = connection.output.getvalue().split(b"\r\n\r\n", 1)
        self.assertIn(b"200 OK", headers)
        return headers, body

    def test_summary(self):
        headers, body = self.request("/api/summary?ignored=1")
        self.assertIn(b"application/json; charset=utf-8", headers)
        self.assertIn(b"Cache-Control: no-store", headers)
        self.assertEqual(body, (ROOT / "tests/fixtures/summary.json").read_bytes())
        self.assertEqual(self.request("/api/summary", "HEAD")[1], b"")

    def test_static_and_real_registry(self):
        for path in ["projects.json", "assets/base.css", "assets/home/data.js"]:
            headers, body = self.request("/" + path)
            self.assertEqual(body, (ROOT / path).read_bytes())
            if path.endswith(".js"):
                self.assertIn(b"javascript", headers)


if __name__ == "__main__":
    unittest.main()
