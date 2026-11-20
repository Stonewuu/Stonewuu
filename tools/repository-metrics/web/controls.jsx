import React, { useState, useSyncExternalStore } from "react";
import { Button, Checkbox, Disclosure, Drawer, EmptyState, ListBox, Pagination, Popover, RangeCalendar, SearchField, Select, Table, ToggleButton, ToggleButtonGroup } from "@heroui/react";
import { parseDate } from "@internationalized/date";
import { CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, ListFilter } from "lucide-react";
import { metrics, metricGroups } from "../model.mjs";
import { dateRange } from "./view-state.mjs";
import { useSelectionTrack } from "./motion.js";

const compactMedia=matchMedia("(max-width: 680px)");
function watchCompact(update) {
  compactMedia.addEventListener("change",update);
  return ()=>compactMedia.removeEventListener("change",update);
}
function AdaptivePanel({open,onOpenChange,label,trigger,kind,children}) {
  const compact=useSyncExternalStore(watchCompact,()=>compactMedia.matches);
  if (compact) {
    return <Drawer isOpen={open} onOpenChange={onOpenChange}>{trigger}<Drawer.Backdrop>
      <Drawer.Content placement="bottom" className="mobile-sheet"><Drawer.Dialog aria-label={label} className={"sheet-dialog "+kind}>
        <Drawer.Handle/>{children}</Drawer.Dialog></Drawer.Content></Drawer.Backdrop></Drawer>;
  }
  return <Popover isOpen={open} onOpenChange={onOpenChange}>{trigger}
    <Popover.Content className={kind} placement={kind==="calendar-popover"?"bottom end":"bottom start"} offset={7}>
      <Popover.Dialog aria-label={label}>{children}</Popover.Dialog></Popover.Content></Popover>;
}

export function Rail({value,options,onChange,label,className=""}) {
  const bindTrack=useSelectionTrack(value,"[data-selected]");
  return <div ref={bindTrack} className={"rail-track "+className}><span className="selection-glide" aria-hidden/>
    <ToggleButtonGroup className="rail" aria-label={label} selectionMode="single" disallowEmptySelection
    selectedKeys={[value]} onSelectionChange={keys=>{
      const next=[...keys][0];
      if(next!=null && next!==value) {
        onChange(next);
      }
    }}>
    {options.map(({id,label:caption,icon:Icon})=><ToggleButton className="rail-item" key={id} id={id}>
      {Icon&&<Icon size={14} aria-hidden/>}{caption}</ToggleButton>)}
  </ToggleButtonGroup></div>;
}

export function MenuSelect({label,value,items,onChange,disabled=false,className=""}) {
  return <Select className={"menu-select "+className} aria-label={label} value={value} onChange={onChange} isDisabled={disabled}>
    <Select.Trigger className="select-button"><Select.Value/><Select.Indicator/></Select.Trigger>
    <Select.Popover className="consumer-menu" placement="bottom end"><ListBox aria-label={label}>
      {items.map(item=><ListBox.Item key={item.id} id={item.id} textValue={item.label}>
        {item.label}<ListBox.ItemIndicator/></ListBox.Item>)}
    </ListBox></Select.Popover>
  </Select>;
}

export function Blank({children}) {
  return <EmptyState className="blank-state">{children}</EmptyState>;
}
export function Search({label,value,onChange}) {
  return <SearchField aria-label={label} value={value} onChange={onChange}>
    <SearchField.Group><SearchField.SearchIcon/><SearchField.Input placeholder={label}/><SearchField.ClearButton aria-label="清除搜索"/></SearchField.Group>
  </SearchField>;
}
export function MetricsPicker({selected,onChange}) {
  const [open,setOpen]=useState(false),[query,setQuery]=useState(""),[category,setCategory]=useState("全部分类");
  const term=query.trim().toLowerCase();
  const groups=metricGroups.map(group=>[group,Object.values(metrics).filter(m=>
    m.group===group && (category==="全部分类"||category===group) && (m.label+" "+m.id).toLowerCase().includes(term)
  )]).filter(([,list])=>list.length);
  function toggle(id,checked) {
    onChange(checked?[...selected,id]:selected.filter(item=>item!==id));
  }
  return <AdaptivePanel open={open} onOpenChange={v=>{setOpen(v);if(!v){setQuery("");}}} label="指标库" kind="metric-popover"
    trigger={<Button className="picker-trigger" variant="secondary" aria-label={"选择指标，已选 "+selected.length+" 项"}>
      <ListFilter size={16}/>选择指标<span className="selection-number">{selected.length}</span></Button>}>
      <div className="popover-heading"><h3>指标库</h3><span>{Object.keys(metrics).length} 项指标</span></div>
      <div className="picker-tools"><Search label="搜索指标" value={query} onChange={setQuery}/>
        <MenuSelect label="指标分类" value={category} onChange={setCategory} items={["全部分类",...metricGroups].map(id=>({id,label:id}))}/></div>
      <div className="picker-scroll">
        {groups.length===0?<Blank>没有匹配的指标</Blank>:groups.map(([group,list])=><section className="metric-group" key={group}>
          <h4>{group}</h4><div className="checkbox-grid">{list.map(m=><Checkbox key={m.id} isSelected={selected.includes(m.id)}
            isDisabled={selected.length===1&&selected[0]===m.id} onChange={checked=>toggle(m.id,checked)}>
            <Checkbox.Control><Checkbox.Indicator/></Checkbox.Control><Checkbox.Content>{m.label}</Checkbox.Content>
          </Checkbox>)}</div></section>)}
      </div><div className="popover-footer"><span>已选 {selected.length} 项</span>
        <Button variant="primary" size="sm" onPress={()=>setOpen(false)}><Check size={14}/>完成</Button></div>
  </AdaptivePanel>;
}

export function DateRangeMenu({period,limits,onApply,active}) {
  const [open,setOpen]=useState(false),[draft,setDraft]=useState(null);
  function changeOpen(next) {
    if (next) {
      setDraft(period.start&&period.end?{start:parseDate(period.start),end:parseDate(period.end)}:null);
    }
    setOpen(next);
  }
  const from=limits.first?parseDate(limits.first):undefined;
  const to=limits.last?parseDate(limits.last):undefined;
  return <AdaptivePanel open={open} onOpenChange={changeOpen} label="选择日期范围" kind="calendar-popover"
    trigger={<Button variant="tertiary" className={"date-trigger "+(active?"current":"")} aria-label="自选日期范围" isDisabled={!from}>
      <CalendarDays size={15}/>自选日期</Button>}>
      <h3>自选日期范围</h3>
      <RangeCalendar aria-label="统计日期范围" minValue={from} maxValue={to} value={draft} onChange={setDraft}
        defaultFocusedValue={draft?.end??to} firstDayOfWeek="sun">{({state})=><>
        <RangeCalendar.Header><RangeCalendar.NavButton slot="previous" aria-label="上个月"/><RangeCalendar.Heading/>
          <RangeCalendar.NavButton slot="next" aria-label="下个月"/></RangeCalendar.Header>
        <RangeCalendar.Grid><RangeCalendar.GridHeader>{d=><RangeCalendar.HeaderCell>{d}</RangeCalendar.HeaderCell>}</RangeCalendar.GridHeader>
          <RangeCalendar.GridBody>{d=><RangeCalendar.Cell date={d}/>}</RangeCalendar.GridBody></RangeCalendar.Grid>
      <div className="calendar-selection" aria-live="polite">{state.anchorDate?state.anchorDate.toString()+" · 请选择结束日期":draft?dateRange(draft.start.toString(),draft.end.toString()):"选择开始和结束日期"}</div>
      <div className="calendar-actions"><Button slot={null} variant="ghost" size="sm" onPress={()=>setOpen(false)}>取消</Button>
        <Button slot={null} size="sm" isDisabled={!draft||!!state.anchorDate} onPress={()=>{onApply(draft.start.toString(),draft.end.toString());setOpen(false);}}>应用日期</Button></div>
      </>}</RangeCalendar>
  </AdaptivePanel>;
}

export function DataTable({label,headers,rows}) {
  if (!rows.length) {
    return <Blank>此范围暂无记录</Blank>;
  }
  return <Table className="data-table" variant="secondary"><Table.ScrollContainer><Table.Content aria-label={label}>
    <Table.Header>{headers.map((title,i)=><Table.Column key={i} id={"col-"+i} isRowHeader={i===0}>{title}</Table.Column>)}</Table.Header>
    <Table.Body>{rows.map((row,i)=><Table.Row key={row.id??i} id={row.id??i} textValue={row.text??String(i+1)}>
      {row.cells.map((cell,j)=><Table.Cell key={j}>{cell}</Table.Cell>)}</Table.Row>)}</Table.Body>
  </Table.Content></Table.ScrollContainer></Table>;
}
export function Pager({current,total,onChange}) {
  if (total<=1) {
    return null;
  }
  return <Pagination className="page-control" aria-label="数据分页"><Pagination.Summary>第 {current+1} / {total} 页</Pagination.Summary>
    <Pagination.Content>
      <Pagination.Item><Pagination.Previous aria-label="上一页" isDisabled={current<=0} onPress={()=>onChange(current-1)}><ChevronLeft size={16}/></Pagination.Previous></Pagination.Item>
      <Pagination.Item><Pagination.Next aria-label="下一页" isDisabled={current>=total-1} onPress={()=>onChange(current+1)}><ChevronRight size={16}/></Pagination.Next></Pagination.Item>
    </Pagination.Content></Pagination>;
}
export function Fold({title,children}) {
  return <Disclosure className="fold"><Disclosure.Heading><Disclosure.Trigger>{title}<Disclosure.Indicator><ChevronDown size={15}/></Disclosure.Indicator></Disclosure.Trigger></Disclosure.Heading>
    <Disclosure.Content><Disclosure.Body>{children}</Disclosure.Body></Disclosure.Content></Disclosure>;
}
