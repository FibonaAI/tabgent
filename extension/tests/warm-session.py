"""Exercise the real native host against a delayed local app-server fixture."""
import io
from pathlib import Path
import subprocess
import sys
import tempfile
import time
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'native'))
import host

server = r'''
import json, sys, time
for line in sys.stdin:
 m = json.loads(line)
 if 'id' not in m: continue
 method = m.get('method')
 if method in ('account/read', 'model/list'): time.sleep(0.3)
 result = {'project': {'id': 'project'}} if method == 'project/create' else {'account': {'id': 'test'}} if method == 'account/read' else {'thread': {'id': 'blank'}} if method == 'thread/start' else {'data': [{'model': 'test', 'displayName': 'Test'}]} if method == 'model/list' else {}
 print(json.dumps({'id': m['id'], 'result': result}), flush=True)
'''
real_popen = subprocess.Popen
with tempfile.TemporaryDirectory() as folder:
 with patch.object(host, 'HOME', Path(folder)), patch.object(host, 'executable', return_value='fixture'), patch.object(host.Session, 'sync_lineage'), patch.object(host.subprocess, 'Popen', side_effect=lambda *a, **kw: real_popen([sys.executable, '-u', '-c', server], **kw)):
  session = host.Session('spare', {})
  messages = []
  session.emit = messages.append
  session.start_server()
  assert session.ready and session.thread['id'] == 'blank'
  writes = []
  original_write = session.write
  def write(m):
   writes.append(m)
   original_write(m)
  session.write = write
  started = time.monotonic()
  for ident, method in [(11, 'account/read'), (12, 'model/list')]:
   session.request({'id': ident, 'method': method, 'params': {}})
   while not any(m.get('id') == ident for m in messages):
    assert time.monotonic() - started < 5
    time.sleep(.005)
  elapsed = time.monotonic() - started
  session.close()
  print(f'Ready spare consumed: {elapsed:.3f}s, repeated account/model RPCs: {len(writes)}')
  assert not writes, 'Ready spare still waits for account/read and model/list round trips'
print('PASS prewarmed session serves setup without new app-server round trips')
