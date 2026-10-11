"""Exact message cutoffs through a real app-server; no account or model requests."""
import json
import sys
import tempfile
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'native'))
import host
import message_fork

with tempfile.TemporaryDirectory(prefix='tabgent-fork-') as directory, \
        patch.object(host, 'HOME', Path(directory)), patch.object(host, 'send', lambda _: None):
    session = host.Session('fork-test', {})
    try:
        session.start()
        source = session.rpc('thread/start', session.thread_params({}))['thread']
        # Materialize only local history, without inference.
        session.rpc('thread/inject_items', {'threadId': source['id'], 'items': [{'type': 'message', 'role': 'developer', 'content': [{'type': 'input_text', 'text': 'fixture'}]}]})
        path = Path(source['path'])
        initial = path.read_text() if path.exists() else ''
        assert initial, 'App-server must materialize the fixture'
        rows = []
        messages = []
        for index, (role, text) in enumerate([('user', 'first question'), ('assistant', 'first answer'), ('user', 'second question'), ('assistant', 'second answer')]):
            if role == 'user':
                rows.append({'type': 'event_msg', 'payload': {'type': 'task_started', 'turn_id': f'turn-{index}', 'started_at': 1}})
            rows.append({'type': 'response_item', 'payload': {'type': 'message', 'role': role, 'content': [{'type': 'input_text' if role == 'user' else 'output_text', 'text': text}]}})
            rows.append({'type': 'event_msg', 'payload': {'type': 'user_message' if role == 'user' else 'agent_message', 'message': text}})
            if role == 'assistant':
                rows.append({'type': 'event_msg', 'payload': {'type': 'task_complete', 'turn_id': f'turn-{index-1}'}})
            messages.append({'id': str(index), 'type': 'userMessage' if role == 'user' else 'agentMessage', 'content': [{'type': 'text', 'text': text}], 'text': text})
        path.write_text(initial + ''.join(json.dumps({'timestamp': '2026-10-11T00:00:00Z', **r}) + '\n' for r in rows))
        original = path.read_bytes()
        source['turns'] = [{'items': messages}]
        source['status'] = {'type': 'idle'}
        session.thread = source
        real_rpc = session.rpc
        def rpc(method, params=None):
            return {'thread': source} if method == 'thread/read' else real_rpc(method, params)
        with patch.object(session, 'rpc', rpc):
            for index, edit, expected in [('0', False, ['first question']), ('1', False, ['first question', 'first answer']), ('2', False, ['first question', 'first answer', 'second question']), ('2', True, ['first question', 'first answer'])]:
                result = message_fork.fork(session, index, edit)
                values = [i.get('text') or '\n'.join(p.get('text', '') for p in i.get('content', [])) for t in result['thread']['turns'] for i in t['items'] if i['type'] in ('userMessage', 'agentMessage')]
                assert values == expected, (index, edit, values)
                assert result['thread']['id'] != source['id']
                assert path.read_bytes() == original, 'Source history changed'
            for message, edit in [('missing', False), ('0', True)]:
                try: message_fork.fork(session, message, edit)
                except ValueError: pass
                else: raise AssertionError('Invalid request accepted')
        print('PASS exact user/assistant forks, edited prefix, source unchanged, invalid requests')
    finally:
        session.close()
        host.POOL.shutdown(wait=True, cancel_futures=True)
