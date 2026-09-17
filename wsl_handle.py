#!/usr/bin/env python3
"""Recebe base64 via stdin e escreve o arquivo no WSL."""
import sys, os, base64

dest = '/home/vsai/vsaiptv/server/data/iptv.db'
tmp = dest + '.tmp'

print(f'Escrevendo para {dest}...', file=sys.stderr)
total = 0
with open(tmp, 'wb') as f:
    for line in sys.stdin:
        data = base64.b64decode(line.strip())
        f.write(data)
        total += len(data)

os.rename(tmp, dest)
print(f'OK: {total} bytes escritos', file=sys.stderr)
