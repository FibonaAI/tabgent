import sys, tempfile, subprocess
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'native'))
import local_files
with tempfile.TemporaryDirectory() as folder:
    path = Path(folder) / '报告 $(touch nope).txt'
    path.write_text('example')
    thread = {'turns': [{'items': [{'type':'agentMessage', 'text':f'[报告](<{path}>)'}]}]}
    with patch.object(subprocess, 'run') as run:
        local_files.open_shared(thread, str(path))
        assert run.call_args.args[0] == ['/usr/bin/open', str(path)]
        local_files.open_shared(thread, str(path), True)
        assert run.call_args.args[0] == ['/usr/bin/open', '-R', str(path)]
        for invalid in [str(Path(folder)/'other.txt'), 'https://example.com', '/etc/passwd']:
            try: local_files.open_shared(thread, invalid)
            except ValueError: pass
            else: raise AssertionError('Unshared link accepted')
        assert run.call_count == 2
print('PASS shared file open/reveal, literal arguments, unshared paths rejected')
