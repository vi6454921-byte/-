"""AEGIS local-only HTTP launcher. Python 3.8+, no dependencies."""
import argparse
import functools
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import threading
import webbrowser

ROOT = Path(__file__).resolve().parent.parent

class Handler(SimpleHTTPRequestHandler):
    extensions_map = dict(SimpleHTTPRequestHandler.extensions_map,
                          **{'.mjs': 'text/javascript', '.js': 'text/javascript',
                             '.wasm': 'application/wasm'})

    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        self.send_header('X-Content-Type-Options', 'nosniff')
        super().end_headers()

    def list_directory(self, path):
        self.send_error(403, 'Directory listing disabled')
        return None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--no-browser', action='store_true')
    parser.add_argument('--active-body-lab', action='store_true', help='Open the experimental dynamic-body lab')
    parser.add_argument('--port', type=int, default=8000)
    args = parser.parse_args()
    if not 0 <= args.port <= 65535:
        parser.error('Port must be between 0 and 65535')
    if not (ROOT / 'index.html').is_file() or not (ROOT / 'vendor/recast/core.mjs').is_file():
        raise SystemExit('Game files missing. Extract the ENTIRE archive before starting.')
    handler = functools.partial(Handler, directory=str(ROOT))
    server = None
    ports = [args.port] if args.port == 0 else range(args.port, min(args.port + 20, 65536))
    for port in ports:
        try:
            server = ThreadingHTTPServer(('127.0.0.1', port), handler)
            break
        except OSError:
            continue
    if server is None:
        raise SystemExit('Cannot start local server. Try another port: --port 9000')
    url = 'http://127.0.0.1:%d/index.html' % server.server_port
    if args.active_body_lab:
        url += '?activebodylab&map=angar_map'
    print('\nAEGIS is ready: ' + url, flush=True)
    print('Keep this window open while playing. Stop: Ctrl+C.\n', flush=True)
    if not args.no_browser:
        timer = threading.Timer(0.3, webbrowser.open, args=(url,))
        timer.daemon = True
        timer.start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nServer stopped.')
    finally:
        server.server_close()

if __name__ == '__main__':
    main()
