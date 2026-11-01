from pathlib import Path
import numpy as np
from PIL import Image

root = Path(__file__).resolve().parents[1]
p = root / 'docs/product-regression/other-pets-review/cat'
src = Path(r'C:/Users/莴嗳雪曦/.codex/generated_images/01a17d54-44f8-72f3-a237-b7da0211254e/exec-8682303a-e70b-44ba-be40-98976ef7b1b2.png')
im = Image.open(src).convert('RGBA')
im = im.crop(im.getchannel('A').getbbox())
im.thumbnail((205,205), Image.Resampling.LANCZOS)
canvas = Image.new('RGBA',(256,256)); canvas.alpha_composite(im,((256-im.width)//2,(256-im.height)//2))
a=np.array(canvas); a[:,:,3]=np.where(a[:,:,3]>=128,255,0)
Image.fromarray(a).save(p/'comforting-06.png')
frames=[Image.open(p/f'comforting-{i:02d}.png').convert('RGBA') for i in range(1,9)]
order=list(range(8))+list(range(6,0,-1))
atlas=Image.new('RGB',(2048,256),'#f4f1eb')
for i,f in enumerate(frames): atlas.paste(f.convert('RGB'),(i*256,0))
pal=atlas.quantize(colors=255,dither=Image.Dither.NONE); palette=pal.getpalette()[:765]+[0,0,0]; pal.putpalette(palette)
enc=[]
for i in order:
    q=frames[i].convert('RGB').quantize(palette=pal,dither=Image.Dither.NONE); idx=np.array(q); idx[np.array(frames[i])[:,:,3]==0]=255
    q=Image.fromarray(idx,'P'); q.putpalette(palette); q.info['transparency']=255; enc.append(q)
enc[0].save(p/'comforting.gif',save_all=True,append_images=enc[1:],duration=160,loop=0,disposal=2,transparency=255,optimize=False)
strip=Image.new('RGB',(2048,286),'#f4f1eb')
for i,f in enumerate(frames): strip.paste(f,(i*256,30),f)
strip.save(p/'comforting-frames.png')
