"""Раздаёт каждый лендинг из site/ на своём порту."""

import functools
import http.server
import os
import socketserver
import sys
import threading

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "site")
BASE_PORT = 8081

PAGES = [
    "berezhno",
    "bairus",
    "beauty-and-balance",
    "cup-cup",
    "french-nails",
    "gigi-samara",
    "komod-samara",
    "nicehair",
    "strawberry-shop63",
]


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


def serve(port: int, directory: str) -> Server:
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=directory)
    httpd = Server(("0.0.0.0", port), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


def main() -> int:
    for index, slug in enumerate(PAGES):
        port = BASE_PORT + index
        serve(port, os.path.join(ROOT, slug))
        print(f"{slug}: http://0.0.0.0:{port}/", flush=True)
    threading.Event().wait()
    return 0


if __name__ == "__main__":
    sys.exit(main())
