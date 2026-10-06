"""Concurrent real app-server startup, without login or model calls."""
import concurrent.futures
import sys
import tempfile
import threading
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'native'))
import host

account_checks = threading.Barrier(3)
release_lineage = threading.Event()
ready = set()
real_rpc = host.Session.rpc

def rpc(self, method, params=None):
    if method == 'account/read':
        # Every startup must reach account checking while the others are still there.
        account_checks.wait(timeout=5)
        return {'requiresOpenaiAuth': False}
    return real_rpc(self, method, params)

def emit(message):
    if message.get('message', {}).get('method') == 'bridge/ready':
        ready.add(message['session'])

with tempfile.TemporaryDirectory(prefix='tabgent-startup-') as directory, \
        patch.object(host, 'HOME', Path(directory)), \
        patch.object(host, 'send', emit), \
        patch.object(host.Session, 'rpc', rpc), \
        patch.object(host.lineage, 'flush', lambda *_: release_lineage.wait(5)):
    sessions = [host.Session(str(i), {}) for i in range(3)]
    try:
        with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
            jobs = [executor.submit(session.start) for session in sessions]
            for job in jobs:
                job.result(timeout=10)
        assert ready == {'0', '1', '2'}, 'Slow account checks must not serialize startup'
        assert all(session.thread for session in sessions)
        assert not release_lineage.is_set(), 'Connection readiness must not await lineage'
        print('PASS concurrent account checks / ready before lineage / shared project initialization')
    finally:
        release_lineage.set()
        host.POOL.shutdown(wait=True, cancel_futures=True)
        for session in sessions:
            session.close()
