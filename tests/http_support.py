"""Real Uvicorn HTTP server adapter for existing raster regression tests."""
import socket,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
if (ROOT.parent/'.pg-libs').is_dir():sys.path.insert(0,str(ROOT.parent/'.pg-libs'))
import uvicorn
import database
class HTTPTestServer:
    def __init__(self,app):
        database.health()
        self.socket=socket.socket();self.socket.bind(('127.0.0.1',0));self.socket.listen(128)
        self.server_port=self.socket.getsockname()[1]
        self.server=uvicorn.Server(uvicorn.Config(app,log_level='error'))
    def serve_forever(self):
        try:self.server.run(sockets=[self.socket])
        finally:self.socket.close()
    def shutdown(self):self.server.should_exit=True
    def server_close(self):pass
