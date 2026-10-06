"""Real app-server history injection; isolated home, no login or model requests."""
import importlib.util
import tempfile
from pathlib import Path
from unittest.mock import patch
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'native'))
import lineage
spec = importlib.util.spec_from_file_location('connector', Path(__file__).resolve().parents[1] / 'native/host.py')
host = importlib.util.module_from_spec(spec)
spec.loader.exec_module(host)
real_rpc = host.Session.rpc
def fixture_rpc(self, method, params=None):
    if method == 'account/read':
        return {'requiresOpenaiAuth': False}
    return real_rpc(self, method, params)

with patch.object(host.Session, 'rpc', fixture_rpc), tempfile.TemporaryDirectory(prefix='tabgent-lineage-') as directory, patch.object(host, 'HOME', Path(directory)), patch.object(host, 'send', lambda _: None):
    home = Path(directory)
    parent, child = host.Session('parent', {}), host.Session('child', {})
    try:
        for session in (parent, child):
            session.start()
            assert session.ready
            assert session.thread
        lineage.record(home, parent.thread['id'], child.thread['id'], {'url': 'https://example.test', 'title': 'Source'})
        for session in (parent, child):
            lineage.flush(session, home)
            thread = session.rpc('thread/read', {'threadId': session.thread['id']})['thread']
            path = Path(thread['path'])
            before = path.read_text()
            assert parent.thread['id'] in before and child.thread['id'] in before
            assert 'browser-lineage:' in before
            session.lineage_completed.clear()
            lineage.flush(session, home)
            assert path.read_text() == before, 'Repeated delivery must not duplicate notes'
        assert lineage.relatives(child, home)['parents'][0]['threadId'] == parent.thread['id']
        assert lineage.relatives(parent, home)['children'][0]['threadId'] == child.thread['id']
        parent.rpc('thread/inject_items', {'threadId': parent.thread['id'], 'items': [{
            'type': 'message', 'role': 'user', 'content': [{'type': 'input_text', 'text': 'Keep this conversation'}],
        }]})
        lineage.discard_empty(parent, home)
        assert lineage.relatives(child, home)['parents'], 'Real user messages protect a conversation from cleanup'
        child_id = child.thread['id']
        child.close()
        assert lineage.relatives(parent, home)['children'][0]['threadId'] == child_id
        resumed = host.Session('resumed', {}, child_id)
        resumed.start()
        try:
            assert resumed.ready and resumed.thread['id'] == child_id
            history = resumed.rpc('thread/read', {'threadId': child_id, 'includeTurns': True})
            assert history['thread']['id'] == child_id
        finally:
            resumed.close()
        cleanup = host.Session('cleanup', {}, child_id)
        cleanup.start()
        try:
            lineage.discard_empty(cleanup, home)
            assert not lineage.relatives(parent, home)['children']
            lineage.record(home, parent.thread['id'], child_id, {})
            assert not lineage.relatives(parent, home)['children'], 'Late events must not recreate discarded branches'
            assert (home / 'projects/browser-agent-connector/lineage' / f'{child_id}.discarded').exists()
        finally:
            cleanup.close()
        print('PASS durable reciprocal lineage / no generated turns / idempotent delivery / history readable after close')
    finally:
        parent.close()
        child.close()
        host.POOL.shutdown(wait=True, cancel_futures=True)
