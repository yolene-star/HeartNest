from pathlib import Path
from PIL import Image, ImageDraw
import numpy as np

ROOT=Path(__file__).resolve().parents[1]; SRC=ROOT/'docs/product-regression/other-pets-review'; OUT=ROOT/'docs/product-regression/other-pets-review-v2-spaced'
PETS=('rabbit','cat','dog'); STATES=('idle','listening','thinking','comforting','encouraging','resting'); CELL=224; PAD=22; CANVAS=256
OUT.mkdir(parents=True,exist_ok=True)
for pet in PETS:
 po=OUT/pet; po.mkdir(exist_ok=True); sheet=Image.new('RGBA',(CELL*8,CELL*6))
 for r,state in enumerate(STATES):
  frames=[]
  for c in range(8):
   f=Image.open(SRC/pet/f'{state}-{c+1:02d}.png').convert('RGBA'); f=f.crop(f.getchannel('A').getbbox()); scale=min((CELL-2*PAD)/f.width,(CELL-2*PAD)/f.height,1.0); f=f.resize((round(f.width*scale),round(f.height*scale)),Image.Resampling.LANCZOS)
   frame=Image.new('RGBA',(CANVAS,CANVAS)); frame.alpha_composite(f,((CANVAS-f.width)//2,(CANVAS-f.height)//2)); a=np.array(frame); a[:,:,3]=np.where(a[:,:,3]>=128,255,0); frame=Image.fromarray(a); frame.save(po/f'{state}-{c+1:02d}.png'); frames.append(frame); sheet.alpha_composite(f,(c*CELL+(CELL-f.width)//2,r*CELL+(CELL-f.height)//2))
  order=list(range(8))+list(range(6,0,-1)); atlas=Image.new('RGB',(CANVAS*8,CANVAS),'#f4f1eb')
  for i,f in enumerate(frames): atlas.paste(f.convert('RGB'),(i*CANVAS,0))
  pal=atlas.quantize(colors=255,dither=Image.Dither.NONE); palette=pal.getpalette()[:765]+[0,0,0]; pal.putpalette(palette); enc=[]
  for i in order:
   q=frames[i].convert('RGB').quantize(palette=pal,dither=Image.Dither.NONE); idx=np.array(q); idx[np.array(frames[i])[:,:,3]==0]=255; q=Image.fromarray(idx,'P'); q.putpalette(palette); q.info['transparency']=255; enc.append(q)
  enc[0].save(po/f'{state}.gif',save_all=True,append_images=enc[1:],duration=160 if state not in ('idle','resting') else 190,loop=0,disposal=2,transparency=255,optimize=False)
  strip=Image.new('RGB',(CANVAS*8,CANVAS+30),'#f4f1eb'); d=ImageDraw.Draw(strip)
  for i,f in enumerate(frames): strip.paste(f,(i*CANVAS,30),f); d.text((i*CANVAS+5,7),f'{state} / {i+1:02d}',fill='#38332c')
  strip.save(po/f'{state}-frames.png')
 sheet.save(OUT/f'{pet}-spaced-sheet.png'); print(pet,'done')
