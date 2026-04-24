from http.server import HTTPServer, SimpleHTTPRequestHandler
import socketserver
import os

PORT = 8000
DIRECTORY = "d:/IBS Solutions"

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

with HTTPServer(('', PORT), Handler) as httpd:
    print(f"🚀 IBS Website live at http://localhost:{PORT}/index.html")
    print("Press Ctrl+C to stop")
    httpd.serve_forever()
