function pointText(x, y) {
  return +x.toFixed(2) + " " + +y.toFixed(2);
}

// 两段曲线在同一个观测点使用同一条切线。相邻斜率反向时切线水平，避免转折处超出原值范围。
function tangent(points, left, right, i) {
  if (i === 0) {
    return right;
  }
  if (i === points.length - 1) {
    return left;
  }
  if (left * right <= 0) {
    return 0;
  }
  const before = points[i].x - points[i - 1].x;
  const after = points[i + 1].x - points[i].x;
  const a = 2 * after + before;
  const b = after + 2 * before;
  return (a + b) / (a / left + b / right);
}

export function curveGeometry(values, x, y) {
  const points = [];
  values.forEach((value, index) => {
    if (value != null) {
      points.push({ index, x: x(index), y: y(value) });
    }
  });
  const slopes = points.slice(1).map((p,i) => (p.y-points[i].y)/(p.x-points[i].x));
  const tangents = points.map((_,i) => tangent(points, slopes[i-1], slopes[i], i));
  const pieces = [];
  for (let i=1; i<points.length; i++) {
    const from=points[i-1], to=points[i];
    const gap=to.index-from.index>1;
    const width=(to.x-from.x)/3;
    const step="C"+pointText(from.x+width,from.y+width*tangents[i-1])+" "+
      pointText(to.x-width,to.y-width*tangents[i])+" "+pointText(to.x,to.y);
    const previous=pieces.at(-1);
    if (!gap && previous && !previous.gap) {
      previous.path+=step;
      previous.to=to;
    } else {
      pieces.push({gap,from,to,path:"M"+pointText(from.x,from.y)+step});
    }
  }
  const isolated=points.filter(p=>values[p.index-1]==null && values[p.index+1]==null);
  return {pieces,isolated};
}

export function axisDomain(low,high,relative) {
  if (relative) {
    return {min:low<0?-100:0,max:high>0||low===0?100:0,step:low<0&&high>0?50:25};
  }
  const bottom=Math.min(0,low);
  const top=Math.max(0,high);
  const target=(top-bottom||4)/4;
  const base=10**Math.floor(Math.log10(target));
  const step=[1,2,2.5,5,10].map(n=>n*base).find(n=>n>=target);
  return {min:Math.floor(bottom/step)*step,max:top===0&&bottom===0?step*4:Math.ceil(top/step)*step,step};
}
