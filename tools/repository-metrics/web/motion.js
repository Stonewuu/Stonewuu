import { useLayoutEffect, useState } from "react";

export const calm = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

// 指示器是轨道上的同一个元素。切换时更新目标位置，正在进行的过渡也会从当前位置接着走。
export function useSelectionTrack(selected, selector, scroll) {
  const [element,bind]=useState(null);
  useLayoutEffect(()=>{
    if (!element) {
      return;
    }
    function measure(center=false) {
      const active=element.querySelector(selector);
      if (!active) {
        delete element.dataset.measured;
        return;
      }
      const a=active.getBoundingClientRect(),b=element.getBoundingClientRect();
      const style=getComputedStyle(element);
      element.style.setProperty("--selection-x",(a.left-b.left-parseFloat(style.borderLeftWidth||0))+"px");
      element.style.setProperty("--selection-w",a.width+"px");
      element.style.setProperty("--selection-y",(a.top-b.top-parseFloat(style.borderTopWidth||0))+"px");
      element.style.setProperty("--selection-h",a.height+"px");
      element.dataset.measured="true";
      const viewport=scroll?.current;
      if (center && viewport && viewport.clientWidth<viewport.scrollWidth) {
        const outer=viewport.getBoundingClientRect();
        if (a.left<outer.left+5 || a.right>outer.right-5) {
          viewport.scrollTo({left:viewport.scrollLeft+a.left-outer.left-(outer.width-a.width)/2,behavior:calm()?"instant":"smooth"});
        }
      }
    }
    measure(true);
    const observer=new ResizeObserver(()=>measure());
    observer.observe(element);
    const changes=new MutationObserver(()=>measure(true));
    changes.observe(element,{subtree:true,childList:true,attributes:true,attributeFilter:["aria-selected","aria-checked","data-selected"]});
    return ()=>{
      observer.disconnect();
      changes.disconnect();
    };
  },[selected,element,scroll,selector]);
  return bind;
}
