"""Build review-only GIFs from generated 8x6 pet sheets."""
from pathlib import Path
import hashlib, json
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageSequence
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/product-regression/other-pets-review'
SOURCES = {
    'rabbit': ROOT / 'docs/pet-generation/rabbit-sheet-v4-8x6.png',
    'cat': ROOT / 'docs/pet-generation/cat-sheet-v2-8x6.png',
    'dog': ROOT / 'docs/pet-generation/dog-sheet-v2-8x6.png',
}
STATES = ['idle','listening','thinking','comforting','encouraging','resting']
CELL, CANVAS = 181, 256

def export_pet(pet, source_path):
    source = Image.open(source_path).convert('RGBA')
    assert source.size == (1448, 1086), source.size
    arr = np.array(source); alpha = arr[:,:,3]
    pet_out = OUT / pet; pet_out.mkdir(parents=True, exist_ok=True)
    font = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 14)
    contact = Image.new('RGB',(8*CANVAS,6*(CANVAS+30)),'#f4f1eb')
    cd = ImageDraw.Draw(contact)
    manifest = {'source': str(source_path.relative_to(ROOT)), 'sha256': hashlib.sha256(source_path.read_bytes()).hexdigest(), 'states': {}}
    for row,state in enumerate(STATES):
        poses=[]
        for col in range(8):
            x0,x1=col*CELL,(col+1)*CELL; y0,y1=row*CELL,min((row+1)*CELL,source.height)
            # Expand each cell and assign pixels by nearest cell center. This
            # preserves ears/tails crossing a gutter without importing a
            # neighbor's detached pixels.
            pad=34; ex0,ex1=max(0,x0-pad),min(source.width,x1+pad); ey0,ey1=y0,y1
            crop=arr[ey0:ey1,ex0:ex1].copy(); yy,xx=np.mgrid[ey0:ey1,ex0:ex1]
            cx,cy=(x0+x1)/2,(y0+y1)/2
            nearest=((xx-cx)**2+(yy-cy)**2)
            for rr in range(max(0,row-1),min(6,row+2)):
                for cc in range(max(0,col-1),min(8,col+2)):
                    if rr==row and cc==col: continue
                    ncx,ncy=(cc*CELL+(cc+1)*CELL)/2,(rr*CELL+(rr+1)*CELL)/2
                    nearest=np.minimum(nearest, (xx-ncx)**2+(yy-ncy)**2)
            keep=((xx-cx)**2+(yy-cy)**2 <= nearest) & (crop[:,:,3]>=128)
            # Remove tiny islands caused by antialiasing while retaining all
            # connected parts of the current subject within the Voronoi cell.
            lab,n=ndimage.label(keep)
            counts=np.bincount(lab.ravel()); counts[0]=0
            if counts.max() < 100:
                # Some generated poses sit far enough off-center that the
                # Voronoi partition has no pixels. Fall back to the largest
                # component inside the expanded cell.
                raw=crop[:,:,3]>=128; lab,n=ndimage.label(raw); counts=np.bincount(lab.ravel()); counts[0]=0
            if counts.max() < 100: raise AssertionError((pet,state,col,'no subject'))
            keep=lab==counts.argmax(); crop[:,:,3][~keep]=0
            ys,xs=np.where(keep); source_top=ey0+int(ys.min())
            crop=crop[ys.min():ys.max()+1,xs.min():xs.max()+1]
            pose=Image.fromarray(crop)
            bbox=pose.getchannel('A').getbbox()
            assert bbox, (pet,state,col)
            # One shared scale per character; preserve authored per-frame vertical motion.
            scale=0.92
            pose=pose.resize((round(pose.width*scale),round(pose.height*scale)),Image.Resampling.LANCZOS)
            canvas=Image.new('RGBA',(CANVAS,CANVAS))
            # Keep a stable horizontal anchor while retaining authored vertical
            # offsets such as a hop or a curled-down resting pose.
            dy=round(10 + ((source_top-row*CELL) * scale))
            # Keep authored height differences while clamping only when a
            # subject would cross the preview canvas boundary.
            dy=max(2,min(CANVAS-pose.height-2,dy))
            canvas.alpha_composite(pose,(round(CANVAS/2-pose.width/2),dy))
            ca=np.array(canvas); ca[:,:,3]=np.where(ca[:,:,3]>=128,255,0)
            # Final guard against fragments that were already connected in the
            # source sheet across a gutter (for example stray paws above a
            # kitten). Only the largest visible subject component is kept.
            rawmask=ca[:,:,3]>=128
            # Opening breaks one-pixel bridges caused by overlapping source
            # rows before choosing the main subject component.
            opened=ndimage.binary_opening(rawmask, structure=np.ones((9,9)))
            lab,n=ndimage.label(opened); counts=np.bincount(lab.ravel()); counts[0]=0
            if counts.max() < 100: raise AssertionError((pet,state,col,'empty after composite'))
            main=ndimage.binary_dilation(lab == counts.argmax(), iterations=2) & rawmask
            ca[:,:,3][~main] = 0
            # Remove a detached strip that can remain at the very top when a
            # source row overlaps the next row. Keep genuine ears/head shapes
            # because they continue through the band without a gap.
            rows=(ca[:,:,3]>=128).any(axis=1)
            if rows[:35].any() and (~rows[35:55]).sum() >= 5:
                ca[:35,:,3]=0
            canvas=Image.fromarray(ca)
            assert canvas.getbbox(), (pet,state,col,'empty')
            canvas.save(pet_out/f'{state}-{col+1:02d}.png')
            poses.append(canvas)
            sx,sy=col*CANVAS,row*(CANVAS+30); contact.paste(canvas.convert('RGB'),(sx,sy+26),canvas); cd.text((sx+5,sy+6),f'{state} / {col+1:02d}',font=font,fill='#38332c')
        order=list(range(8))+list(range(6,0,-1))
        # Palette includes reserved transparent index 255; no crossfade frames.
        atlas=Image.new('RGB',(CANVAS*8,CANVAS),'#f4f1eb')
        for i,p in enumerate(poses): atlas.paste(p.convert('RGB'),(i*CANVAS,0))
        pal=atlas.quantize(colors=255,dither=Image.Dither.NONE); palette=pal.getpalette()[:765]+[0,0,0]; pal.putpalette(palette)
        encoded=[]
        for i in order:
            p=poses[i].convert('RGB').quantize(palette=pal,dither=Image.Dither.NONE); idx=np.array(p); idx[np.array(poses[i])[:,:,3]==0]=255; p=Image.fromarray(idx,'P'); p.putpalette(palette); p.info['transparency']=255; encoded.append(p)
        gif=pet_out/f'{state}.gif'; encoded[0].save(gif,save_all=True,append_images=encoded[1:],duration=160 if state not in ('idle','resting') else 190,loop=0,disposal=2,transparency=255,optimize=False)
        with Image.open(gif) as g:
            decoded=[f.convert('RGBA').copy() for f in ImageSequence.Iterator(g)]
            assert len(decoded)==14 and len({hashlib.sha256(f.tobytes()).hexdigest() for f in decoded[:8]})==8 and decoded[0].getpixel((0,0))[3]==0
        strip=Image.new('RGB',(CANVAS*8,CANVAS+30),'#f4f1eb'); sd=ImageDraw.Draw(strip)
        for i,p in enumerate(decoded[:8]): strip.paste(p,(i*CANVAS,30),p); sd.text((i*CANVAS+5,7),f'{state} / source {i+1:02d}',font=font,fill='#38332c')
        strip.save(pet_out/f'{state}-frames.png')
        manifest['states'][state]={'keyframes':8,'loop_frames':14,'decoded_checks':'passed'}
    contact.save(OUT/f'{pet}-all-48-frames.png'); (pet_out/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')

def main():
    OUT.mkdir(parents=True,exist_ok=True)
    for pet,path in SOURCES.items(): export_pet(pet,path)
    print('exported', ', '.join(SOURCES))
if __name__=='__main__': main()
