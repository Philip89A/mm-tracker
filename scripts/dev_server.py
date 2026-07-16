"""Local dev server that disables all HTTP caching, so the browser always
fetches fresh files during development (Python's plain http.server sends no
Cache-Control headers, which lets browsers cache aggressively via heuristic
freshness — very confusing when testing changes)."""
import http.server
import sys


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8734
    http.server.test(HandlerClass=NoCacheHandler, port=port)
