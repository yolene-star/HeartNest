from pathlib import Path
from PIL import Image, ImageDraw
import numpy as np
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / 'docs/product-regression/other-pets-review-v2-spaced/rabbit'
OUT = ROOT / 'docs/product-regression/rabbit-circled-review'
OUT.mkdir(parents=True, exist_ok=True)
STRIPS = {
    'listening': ROOT / 'docs/pet-generation/rabbit-listening-strip.png',
    'thinking': ROOT / 'docs/pet-generation/rabbit-thinking-strip.png',
    'encouraging': ROOT / 'docs/pet-generation/rabbit-encouraging-strip.png',
    'resting': ROOT / 'docs/pet-generation/rabbit-resting-strip.png',
}
STATES = ('idle','listening','thinking','comforting','encouraging','resting')

def extract(path):
    arr = np.array(Image.open(path).convert('RGBA'))
    labels, n = ndimage.label(arr[:,:,3] >= 128)
    comps=[]
    for lab in range(1,n+1):
        y,x=np.where(labels==lab)
        if len(x) >= 3000:
            comps.append((float(x.mean()), len(x), (x.min(),y.min(),x.max()+1,y.max()+1)))
    comps.sort()
    assert len(comps) >= 8, (path, len(comps))
    return [Image.fromarray(arr[y0:y1,x0:x1]) for _,_,(x0,y0,x1,y1) in comps[:8]]

def normalize(im):
    a=np.array(im); mask=a[:,:,3]>=128
    labels,n=ndimage.label(mask); counts=np.bincount(labels.ravel()); counts[0]=0
    if counts.max()<100: raise AssertionError('empty frame')
    mask=labels==counts.argmax(); a[:,:,3][~mask]=0; im=Image.fromarray(a)
    im=im.crop(im.getchannel('A').getbbox())
    scale=min(190/im.width,190/im.height,1)
    im=im.resize((round(im.width*scale),round(im.height*scale)),Image.Resampling.LANCZOS)
    out=Image.new('RGBA',(256,256)); out.alpha_composite(im,((256-im.width)//2,(256-im.height)//2))
    a=np.array(out); a[:,:,3]=np.where(a[:,:,3]>=128,255,0)
    a[:14,:,-1]=0; a[-14:,:,-1]=0; a[:,:14,-1]=0; a[:,-14:,-1]=0
    return Image.fromarray(a)

def save_gif(frames,path):
    order=list(range(8))+list(range(6,0,-1)); atlas=Image.new('RGB',(2048,256),'#f4f1eb')
    for i,f in enumerate(frames): atlas.paste(f.convert('RGB'),(i*256,0))
    pal=atlas.quantize(colors=255,dither=Image.Dither.NONE); palette=pal.getpalette()[:765]+[0,0,0]; pal.putpalette(palette); encoded=[]
    for i in order:
        q=frames[i].convert('RGB').quantize(palette=pal,dither=Image.Dither.NONE); idx=np.array(q); idx[np.array(frames[i])[:,:,3]==0]=255
        q=Image.fromarray(idx,'P'); q.putpalette(palette); q.info['transparency']=255; encoded.append(q)
    encoded[0].save(path,save_all=True,append_images=encoded[1:],duration=160,loop=0,disposal=2,transparency=255,optimize=False)

for state in STATES:
    frames=[normalize(f) for f in extract(STRIPS[state])] if state in STRIPS else [Image.open(BASE/f'{state}-{i:02d}.png').convert('RGBA') for i in range(1,9)]
    folder=OUT/state; folder.mkdir(exist_ok=True)
    for i,f in enumerate(frames,1): f.save(folder/f'{state}-{i:02d}.png')
    save_gif(frames,folder/f'{state}.gif')
    strip=Image.new('RGB',(2048,286),'#f4f1eb'); draw=ImageDraw.Draw(strip)
    for i,f in enumerate(frames): strip.paste(f,(i*256,30),f); draw.text((i*256+5,7),f'{state} / {i+1:02d}',fill='#38332c')
    strip.save(folder/f'{state}-frames.png')
print('rabbit circled replacements exported')
