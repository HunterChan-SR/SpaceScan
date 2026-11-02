"""Generate SpaceScan's code-defined icon. Requires Pillow; no remote assets."""
from pathlib import Path
import io
import struct
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parent.parent / 'build'
root.mkdir(exist_ok=True)
canvas = Image.new('RGBA', (1024, 1024), (0, 0, 0, 0))
draw = ImageDraw.Draw(canvas)
draw.rounded_rectangle((48, 48, 976, 976), radius=218, fill='#f4f3fb')
draw.rounded_rectangle((164, 164, 575, 590), radius=45, fill='#8270d5')
draw.rounded_rectangle((601, 164, 860, 407), radius=40, fill='#b5a6e7')
draw.rounded_rectangle((601, 433, 860, 860), radius=42, fill='#d7ad76')
draw.rounded_rectangle((164, 616, 575, 860), radius=42, fill='#66aea3')
draw.rounded_rectangle((190, 190, 549, 258), radius=17, fill='#a493e6')
draw.rounded_rectangle((190, 284, 363, 564), radius=22, fill='#9180dd')
draw.rounded_rectangle((389, 284, 549, 564), radius=22, fill='#9e8de2')
canvas.save(root / 'icon.png')
canvas.save(root / 'icon.ico', sizes=[(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)])
chunks = []
for code, size in [('icp4',16),('icp5',32),('icp6',64),('ic07',128),('ic08',256),('ic09',512),('ic10',1024)]:
    stream = io.BytesIO()
    canvas.resize((size,size), Image.Resampling.LANCZOS).save(stream, format='PNG')
    data = stream.getvalue()
    chunks.append(code.encode() + struct.pack('>I', len(data)+8) + data)
payload = b''.join(chunks)
(root / 'icon.icns').write_bytes(b'icns' + struct.pack('>I',len(payload)+8) + payload)
print('Generated build/icon.png, icon.ico and icon.icns')
