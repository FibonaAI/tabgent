"""Exercise permission settings against an isolated real app-server; no model calls."""
import sys, tempfile, threading
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1] / 'native'))
import host
real_rpc = host.Session.rpc
received = []
done = threading.Event()
def rpc(self, method, params=None):
    if method == 'account/read': return {'requiresOpenaiAuth':False}
    return real_rpc(self, method, params)
def send(value):
    if value.get('message',{}).get('id') == 99:
        received.append(value['message']); done.set()
with tempfile.TemporaryDirectory() as d, patch.object(host,'HOME',Path(d)), patch.object(host,'send',send), patch.object(host.Session,'rpc',rpc):
    session=host.Session('test',{})
    try:
        session.start()
        assert session.ready and session.thread
        for mode in ('auto','full','ask'):
            done.clear()
            session.request({'id':99,'method':'bridge/permissions/set','params':{'mode':mode}})
            assert done.wait(5)
            assert received[-1].get('result') == {'mode':mode}, received[-1]
            params=session.thread_params({})
            assert params['sandbox'] == ('danger-full-access' if mode=='full' else 'read-only')
            assert params['approvalsReviewer'] == ('auto_review' if mode=='auto' else 'user')
        print('PASS real permission changes / auto reviewer / full access / restore conservative mode')
    finally:
        host.POOL.shutdown(wait=True,cancel_futures=True)
        session.close()
