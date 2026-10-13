"""User-clicked local links, verified against the owning conversation."""
import re
import subprocess
from pathlib import Path
from urllib.parse import unquote, urlparse


def open_shared(thread, reference, reveal=False):
    if not isinstance(reference, str) or '\x00' in reference:
        raise ValueError('Invalid file link')
    pattern = re.compile(r'\[[^\]\n]*\]\(\s*(?:<' + re.escape(reference) + r'>|' + re.escape(reference) + r')(?=\s|\))')
    if not any(item.get('type') == 'agentMessage' and pattern.search(item.get('text', ''))
               for turn in thread.get('turns', []) for item in turn.get('items', [])):
        raise ValueError('File is not shared in this conversation')
    if reference.startswith('file:'):
        parsed = urlparse(reference)
        if parsed.netloc not in ('', 'localhost'):
            raise ValueError('Only local files can be opened')
        reference = unquote(parsed.path)
    if not reference.startswith('/') or reference.startswith('//'):
        raise ValueError('Only absolute local file paths are allowed')
    path = Path(reference)
    if not path.is_file():
        raise ValueError('File no longer exists')
    # Argument array, never a shell; even filenames containing shell syntax are literal.
    subprocess.run(['/usr/bin/open', *(['-R'] if reveal else []), str(path)], check=True, timeout=15)
    return {'success': True}
