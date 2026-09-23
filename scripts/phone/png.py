import sys, zlib, struct
def readpng(p):
    d=open(p,'rb').read(); pos=8; w=h=0; idat=b''
    while pos<len(d):
        n=struct.unpack('>I',d[pos:pos+4])[0]; t=d[pos+4:pos+8]; c=d[pos+8:pos+8+n]; pos+=12+n
        if t==b'IHDR': w,h,bd,ct=struct.unpack('>IIBB',c[:10])
        elif t==b'IDAT': idat+=c
    raw=zlib.decompress(idat); bpp=4 if ct==6 else 3; stride=w*bpp; rows=[]; prev=bytearray(stride); i=0
    for y in range(h):
        f=raw[i]; i+=1; line=bytearray(raw[i:i+stride]); i+=stride
        for x in range(stride):
            a=line[x-bpp] if x>=bpp else 0; b=prev[x]; c=prev[x-bpp] if x>=bpp else 0
            if f==1: line[x]=(line[x]+a)&255
            elif f==2: line[x]=(line[x]+b)&255
            elif f==3: line[x]=(line[x]+(a+b)//2)&255
            elif f==4:
                pa=abs(b-c); pb=abs(a-c); pc=abs(a+b-2*c)
                pr=a if pa<=pb and pa<=pc else (b if pb<=pc else c); line[x]=(line[x]+pr)&255
        rows.append(bytes(line)); prev=line
    return w,h,bpp,rows
def extent(rows,bpp,y0,y1,x0,x1,thr=140):
    xs=[x for y in range(y0,y1) for x in range(x0,x1) if rows[y][x*bpp]>thr and rows[y][x*bpp+1]>thr and rows[y][x*bpp+2]>thr]
    return (min(xs),max(xs)) if xs else None
if __name__=="__main__":
    p=sys.argv[1]; w,h,bpp,rows=readpng(p)
    for spec in sys.argv[2:]:
        name,y0,y1=spec.split(':'); print(name, extent(rows,bpp,int(y0),int(y1),14,396))
