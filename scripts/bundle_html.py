#!/usr/bin/env python3
"""Bundle a static HTML intro and selected guide/license pages, without network."""
import argparse, base64, hashlib, html, json, mimetypes, re
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit

class Bundle:
    def __init__(self, entry, pages):
        self.entry=entry.resolve()
        self.root=self.entry.parent
        self.pages={self.resolve(self.entry,p):i for i,p in enumerate(pages)}
        self.sources={}
    def resolve(self, owner, url):
        u=urlsplit(url)
        if u.scheme or u.netloc or not u.path:return None
        p=(owner.parent/unquote(u.path)).resolve()
        if not p.is_relative_to(self.root):raise ValueError(f"资源在项目目录之外：{url}")
        if not p.is_file():raise FileNotFoundError(p)
        return p
    def record(self,p):
        raw=p.read_bytes()
        self.sources[str(p.relative_to(self.root))]={"sha256":hashlib.sha256(raw).hexdigest(),"bytes":len(raw)}
        return raw
    def data(self,p):
        raw=self.record(p)
        return "data:"+(mimetypes.guess_type(p.name)[0] or "application/octet-stream")+";base64,"+base64.b64encode(raw).decode()
    def css(self,p):
        text=self.record(p).decode("utf-8")
        if re.search(r"@import\b",text):raise ValueError(f"请先展开 CSS @import：{p.name}")
        def sub(m):
            v=m[1].strip().strip("\"'")
            if not v or v.startswith(("#","data:")):return m[0]
            q=self.resolve(p,v)
            if q is None:raise ValueError(f"离线 CSS 仍引用外部资源：{v}")
            return 'url("'+self.data(q)+'")'
        return re.sub(r"url\(([^)]+)\)",sub,text)
    def rewrite(self,p,is_page=False):
        outer=self
        class Parser(HTMLParser):
            def __init__(self):
                super().__init__(convert_charrefs=False);self.out=[];self.skip_script=False
            def handle_starttag(self,tag,attrs):
                d=dict(attrs)
                if tag=="base":raise ValueError("请先移除 base 并解析相对路径")
                if tag=="link" and d.get("rel")=="stylesheet":
                    q=outer.resolve(p,d.get("href",""))
                    if q is None:raise ValueError("样式表必须已下载到项目中")
                    self.out.append("<style>"+outer.css(q).replace("</style","<\\/style")+"</style>");return
                if tag=="script" and d.get("src"):
                    q=outer.resolve(p,d["src"])
                    if q is None:raise ValueError("脚本必须已下载到项目中")
                    code=outer.record(q).decode("utf-8")
                    if d.get("type")=="module" and re.search(r"\bimport\b",code):raise ValueError("请先将模块 JS 构建为静态单文件")
                    d.pop("src");d.pop("integrity",None);d.pop("crossorigin",None)
                    a="".join(" "+k+(('="'+html.escape(v,quote=True)+'"') if v is not None else "") for k,v in d.items())
                    self.out.append("<script"+a+">"+code.replace("</script","<\\/script")+"</script>");self.skip_script=True;return
                for k in ("src","poster","href"):
                    if k not in d:continue
                    url=d[k]
                    if not url or url.startswith(("#","data:","blob:","mailto:","tel:")):continue
                    if tag=="a" and k=="href" and urlsplit(url).scheme:continue
                    q=outer.resolve(p,url)
                    if q is None:raise ValueError(f"自动加载仍依赖网络：{url}")
                    if tag=="a" and q==outer.entry:
                        d[k]="#intro-close-page";d["data-intro-close"]="";continue
                    if tag=="a" and q in outer.pages:
                        d[k]="#intro-page-"+str(outer.pages[q]);d["data-intro-page"]=str(outer.pages[q]);continue
                    if q.suffix.lower() in (".html",".htm") and tag=="a":raise ValueError(f"请用 --page 内嵌指南：{q.name}")
                    d[k]=outer.data(q)
                    if tag=="a" and q.suffix.lower() not in (".png",".jpg",".jpeg",".webp",".gif",".svg",".avif"):
                        d.setdefault("download",q.name)
                if d.get("srcset") and not d["srcset"].startswith("data:"):raise ValueError("请先把 srcset 简化为所需的本地 src")
                if d.get("style"):
                    if re.search(r"url\(",d["style"]):raise ValueError("请先把带 url 的行内样式移到 CSS 文件")
                a="".join(" "+k+(('="'+html.escape(v,quote=True)+'"') if v is not None else "") for k,v in d.items())
                self.out.append("<"+tag+a+">")
            def handle_startendtag(self,t,a):
                self.handle_starttag(t,a)
                if t not in {'area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr'}:
                    self.handle_endtag(t)
            def handle_endtag(self,t):
                if t=="script" and self.skip_script:self.skip_script=False;return
                self.out.append("</"+t+">")
            def handle_data(self,s):self.out.append(s)
            def handle_entityref(self,s):self.out.append("&"+s+";")
            def handle_charref(self,s):self.out.append("&#"+s+";")
            def handle_comment(self,s):self.out.append("<!--"+s+"-->")
            def handle_decl(self,s):self.out.append("<!"+s+">")
        if p.suffix.lower() not in (".html",".htm"):
            return "<!doctype html><meta charset=utf-8><pre style='white-space:pre-wrap;padding:24px'>"+html.escape(self.record(p).decode("utf-8"))+"</pre>"
        parser=Parser();parser.feed(self.record(p).decode("utf-8"))
        text="".join(parser.out)
        if is_page:
            text+="<script>document.querySelectorAll('[data-intro-close]').forEach(a=>a.onclick=e=>{e.preventDefault();parent.postMessage('intro-close-page','*')})</script>"
        return text
    def build(self):
        main=self.rewrite(self.entry)
        pages=[None]*len(self.pages)
        for p,i in self.pages.items():pages[i]=self.rewrite(p,True)
        payload=json.dumps(pages,ensure_ascii=False).replace("</","<\\/")
        extra="""<style>#intro-pages{border:0;border-radius:12px;padding:0;width:1160px;max-width:96vw;height:92vh}#intro-pages::backdrop{background:#101014cc}#intro-pages button{display:block;margin:8px 8px 8px auto;padding:8px 16px}#intro-page-frame{border:0;width:100%;height:calc(100% - 52px)}</style><dialog id="intro-pages"><button id="intro-page-close">关闭 ×</button><iframe id="intro-page-frame" title="完整说明"></iframe></dialog>"""
        extra+='<script type="application/json" id="intro-page-data">'+payload+'</script>'
        extra+="""<script>(()=>{const d=document.querySelector('#intro-pages'),f=document.querySelector('#intro-page-frame'),pages=JSON.parse(document.querySelector('#intro-page-data').textContent);document.querySelectorAll('[data-intro-page]').forEach(a=>a.onclick=e=>{e.preventDefault();document.querySelector('#play[aria-label="暂停"]')?.click();f.srcdoc=pages[Number(a.dataset.introPage)];d.showModal()});document.querySelector('#intro-page-close').onclick=()=>d.close();window.addEventListener('message',e=>{if(e.source===f.contentWindow&&e.data==='intro-close-page')d.close()})})();</script>"""
        return main.replace("</body>",extra+"</body>") if "</body>" in main else main+extra

def main():
    a=argparse.ArgumentParser(description=__doc__)
    a.add_argument("input",type=Path);a.add_argument("--output",type=Path,required=True);a.add_argument("--page",action="append",default=[])
    args=a.parse_args()
    if args.input.resolve()==args.output.resolve():a.error("输出必须与输入入口不同")
    b=Bundle(args.input,args.page);result=b.build()
    args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_text(result,encoding="utf-8")
    manifest={"entry":args.input.name,"output":args.output.name,"sources":b.sources,"output_sha256":hashlib.sha256(args.output.read_bytes()).hexdigest()}
    args.output.with_suffix(".manifest.json").write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding="utf-8")
    print(f"完成：{args.output}，{len(b.sources)} 个来源文件；请继续做独立断网浏览器验收。")
if __name__=="__main__":main()

