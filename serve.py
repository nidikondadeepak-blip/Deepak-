#!/usr/bin/env python3
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import os

ROOT = os.path.dirname(os.path.abspath(__file__))
os.chdir(ROOT)

class H(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-store")
        SimpleHTTPRequestHandler.end_headers(self)

    def log_message(self, fmt, *args):
        print(self.address_string(), "-", fmt % args)

if __name__ == "__main__":
    httpd = ThreadingHTTPServer(("0.0.0.0", 3000), H)
    print("serving on 0.0.0.0:3000", ROOT)
    httpd.serve_forever()
