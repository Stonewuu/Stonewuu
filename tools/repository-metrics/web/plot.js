const palette = ["var(--violet)","var(--green)","#be7222","#c54e83","#3e83ca","#959133","#946459","#4b97a3","#9471aa"];
const reduced = matchMedia("(prefers-reduced-motion: reduce)");
const esc = s => String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const nameOf = repository => repository.split("/").at(-1);
const colorFor = n => palette[n % palette.length];
const compactDate = date => date.slice(5).replace("-","/");
const fullDate = date => new Intl.DateTimeFormat("zh-CN",{year:"numeric",month:"long",day:"numeric",timeZone:"UTC"}).format(dayTime(date));

function curves(points) {
  let group = [];
  const groups = [];
  for (const point of points) {
    if (point === null) {
      if (group.length) {
        groups.push(group);
        group = [];
      }
    } else {
      group.push(point);
    }
  }
  if (group.length) {
    groups.push(group);
  }
  return groups;
}

function linePath(points) {
  const slopes = points.slice(1).map(([x,y],i)=>(y-points[i][1])/(x-points[i][0]));
  const tangent = points.map((_,i)=>{
    if (i===0 || i===points.length-1) {
      return slopes[i===0 ? 0 : i-1];
    }
    const a=slopes[i-1], b=slopes[i];
    return a*b<=0 ? 0 : 2*a*b/(a+b);
  });
  let d="M"+points[0].join(" ");
  for (let i=1;i<points.length;i++) {
    const [x0,y0]=points[i-1], [x1,y1]=points[i];
    const w=(x1-x0)/3;
    d+="C"+[x0+w,y0+w*tangent[i-1],x1-w,y1-w*tangent[i],x1,y1].map(n=>+n.toFixed(2)).join(" ");
  }
  return d;
}

function scaleFor(max, relative) {
  if (relative) {
    return {ceiling:100,step:25};
  }
  const target=Math.max(1,max/4), base=10**Math.floor(Math.log10(target));
  const step=[1,2,2.5,5,10].map(n=>n*base).find(n=>Number.isInteger(n)&&n>=target);
  return {step,ceiling:Math.max(step,Math.ceil(max/step)*step)};
}

let chartId=0;
class MetricPlot {
  constructor(host,title,dates,rows,relative,compare,grain) {
    this.dates=dates;
    this.rows=rows;
    this.relative=relative;
    this.compare=compare;
    this.grain=grain;
    this.index=-1;
    this.id="metric-plot-"+(++chartId);
    const item=document.createElement("div");
    item.className="chart-card";
    host.append(item);
    item.innerHTML=(title?'<h3 class="chart-label">'+esc(title)+'</h3>':"")+
      '<div class="chart-legend">'+rows.map(s=>'<span><i class="'+(s.secondary?"second":"")+'" style="--swatch:'+s.color+'"></i>'+esc(this.label(s))+'</span>').join("")+'</div>';
    if (!dates.length || !rows.some(s=>s.values.some(v=>v!=null))) {
      item.insertAdjacentHTML("beforeend",'<p class="chart-empty">所选时段暂无这项指标的记录</p>');
      return;
    }
    item.insertAdjacentHTML("beforeend",'<div class="chart-wrap"><svg class="graph" tabindex="0" role="group" aria-label="'+esc(title||"指标趋势")+'，使用左右方向键逐期查看，Home 和 End 跳到首尾"></svg><div class="tooltip point-tip" hidden></div></div><span class="sr-only reading" aria-live="polite"></span>');
    this.svg=item.querySelector("svg");
    this.tip=item.querySelector(".tooltip");
    this.reading=item.querySelector(".reading");
    this.peaks=rows.map(s=>s.values.reduce((n,v)=>v==null?n:Math.max(n,v),0));
    this.draw(true);
    this.observer=new ResizeObserver(()=>{
      const {width,height}=this.svg.getBoundingClientRect();
      if (width!==this.width || height!==this.height) {
        this.draw(false);
      }
    });
    this.observer.observe(this.svg);
    const pointer=e=>{
      const offset=e.clientX-this.svg.getBoundingClientRect().left;
      const factor=Math.max(0,Math.min(1,(offset-this.left)/(this.right-this.left)));
      this.show(Math.round(factor*(dates.length-1)),false);
    };
    this.svg.addEventListener("pointermove",pointer);
    this.svg.addEventListener("pointerdown",pointer);
    this.svg.addEventListener("pointerleave",e=>{
      if(e.pointerType==="mouse") {
        this.clear();
      }
    });
    this.svg.addEventListener("focus",()=>this.show(this.index<0?dates.length-1:this.index,true));
    this.svg.addEventListener("blur",()=>this.clear());
    this.svg.addEventListener("keydown",e=>{
      const keys={ArrowLeft:Math.max(0,this.index-1),ArrowRight:Math.min(dates.length-1,this.index+1),Home:0,End:dates.length-1};
      if (Object.hasOwn(keys,e.key)) {
        e.preventDefault();
        this.show(keys[e.key],true);
      } else if (e.key==="Escape") {
        this.clear();
      }
    });
  }

  label(s) {
    return s.metric.label+(this.compare?" · "+nameOf(s.repository):"");
  }

  scaled(value,index) {
    if (!this.relative || !this.peaks[index]) {
      return value;
    }
    return value/this.peaks[index]*100;
  }

  x(i) {
    return this.dates.length===1 ? (this.left+this.right)/2 : this.left+i*(this.right-this.left)/(this.dates.length-1);
  }

  y(v) {
    return this.bottom-(this.bottom-this.top)*v/this.scale.ceiling;
  }

  draw(animate) {
    const {width,height}=this.svg.getBoundingClientRect();
    if(width<1) {
      return;
    }
    this.clear();
    this.width=width;
    this.height=height;
    this.scale=scaleFor(Math.max(...this.peaks),this.relative);
    const {ceiling,step}=this.scale;
    const tickLabel=v=>this.relative?v+"%":display(v,this.rows[0].metric.unit,true);
    this.left=Math.max(29,tickLabel(ceiling).length*7+12);
    this.right=width-12;
    this.top=17;
    this.bottom=height-30;
    this.svg.setAttribute("viewBox",[0,0,width,height].join(" "));
    const axis=[];
    for(let v=0;v<=ceiling;v+=step) {
      const y=this.y(v);
      axis.push('<line class="'+(v?"grid":"baseline")+'" x1="'+this.left+'" x2="'+this.right+'" y1="'+y+'" y2="'+y+'"/><text class="axis" x="'+(this.left-7)+'" y="'+(y+4)+'" text-anchor="end">'+esc(tickLabel(v))+'</text>');
    }
    const count=Math.min(this.dates.length,Math.max(2,Math.floor((this.right-this.left)/80)+1));
    for(let t=0;t<count;t++) {
      const i=count===1?0:Math.round(t*(this.dates.length-1)/(count-1));
      const day=this.dates[i];
      const label=this.grain==="month"||this.dates.length>500?day.slice(0,7):compactDate(day);
      const anchor=count===1?"middle":t===0?"start":t===count-1?"end":"middle";
      axis.push('<text class="axis" x="'+this.x(i)+'" y="'+(height-7)+'" text-anchor="'+anchor+'">'+label+'</text>');
    }
    const paths=[];
    this.rows.forEach((s,j)=>{
      const points=s.values.map((v,i)=>v==null?null:[this.x(i),this.y(this.scaled(v,j))]);
      for(const segment of curves(points)) {
        if(segment.length===1) {
          paths.push('<circle cx="'+segment[0][0]+'" cy="'+segment[0][1]+'" r="3.5" fill="'+s.color+'"/>');
        } else {
          const d=linePath(segment);
          if(j===0) {
            const area=d+"L"+segment.at(-1)[0]+" "+this.bottom+"L"+segment[0][0]+" "+this.bottom+"Z";
            paths.push('<path d="'+area+'" fill="url(#'+this.id+'-fill)"/>');
          }
          paths.push('<path class="plot-line" d="'+d+'" stroke="'+s.color+'"'+(s.secondary?' stroke-dasharray="6 4"':"")+'/>');
        }
      }
    });
    this.svg.innerHTML='<defs><linearGradient id="'+this.id+'-fill" x2="0" y2="1"><stop stop-color="'+this.rows[0].color+'" stop-opacity=".16"/><stop offset="1" stop-color="'+this.rows[0].color+'" stop-opacity=".01"/></linearGradient><clipPath id="'+this.id+'-clip"><rect width="'+width+'" height="'+height+'"/></clipPath></defs>'+axis.join("")+'<g clip-path="url(#'+this.id+'-clip)">'+paths.join("")+'</g><g class="marks" aria-hidden="true"></g>';
    if(animate&&!reduced.matches) {
      this.svg.querySelector("clipPath rect").animate([{transform:"scaleX(0)"},{transform:"scaleX(1)"}],{duration:300,easing:"cubic-bezier(.2,.65,.35,1)"});
    }
  }

  show(i,announce) {
    const marks=this.svg.querySelector(".marks");
    if(!marks) {
      return;
    }
    this.index=i;
    const x=this.x(i);
    const date=this.dates[i];
    const caption=this.grain==="month"?date.slice(0,7):fullDate(date)+(this.grain==="week"?" 起的周":"");
    this.tip.innerHTML="<strong>"+esc(caption)+"</strong>"+this.rows.map(s=>'<div class="tip-row"><span class="tip-item"><i style="--swatch:'+s.color+'"></i>'+esc(this.label(s))+'</span><b>'+esc(display(s.values[i],s.metric.unit))+'</b></div>').join("");
    marks.innerHTML='<line class="guide" x1="'+x+'" x2="'+x+'" y1="'+this.top+'" y2="'+this.bottom+'"/>'+
      this.rows.map((s,j)=>s.values[i]==null?"":'<circle class="dot" cx="'+x+'" cy="'+this.y(this.scaled(s.values[i],j))+'" r="4" fill="'+s.color+'"/>').join("");
    this.tip.hidden=false;
    const w=this.tip.offsetWidth;
    this.tip.style.left=Math.max(0,Math.min(this.width-w,x+w+14<this.width?x+12:x-w-12))+"px";
    this.tip.style.top="12px";
    if(announce) {
      this.reading.textContent=this.tip.innerText;
    }
  }

  clear() {
    this.index=-1;
    this.tip.hidden=true;
    this.svg.querySelector(".marks")?.replaceChildren();
  }

  destroy() {
    this.observer?.disconnect();
  }
}
