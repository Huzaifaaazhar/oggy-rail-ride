import sys
from PIL import Image
out, cols, *files = sys.argv[1:]
cols = int(cols)
ims = [Image.open(f) for f in files]
w, h = ims[0].size
rows = (len(ims) + cols - 1) // cols
o = Image.new('RGB', (w * cols, h * rows), 'white')
for i, im in enumerate(ims):
    o.paste(im, ((i % cols) * w, (i // cols) * h))
scale = min(1.0, 1800 / o.width)
o.resize((int(o.width * scale), int(o.height * scale))).save(out)
