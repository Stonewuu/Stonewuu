import { test } from "node:test";
import assert from "node:assert/strict";
import { curveGeometry, axisDomain } from "./geometry.mjs";

const curve = values => curveGeometry(values, i=>i*10, v=>v);

test("缺口前后相邻观测沿同一条曲线连接，虚线只覆盖内部缺口", () => {
  const values=[null,0,4,null,null,10,11,null];
  const {pieces}=curve(values);
  assert.deepEqual(pieces.map(p=>[p.gap,p.from.index,p.to.index]),[[false,1,2],[true,2,5],[false,5,6]]);
  assert.equal(pieces[1].from.y,4);
  assert.equal(pieces[1].to.y,10);
  assert.equal(values[3],null);
});
test("孤立点和真实零保留读数，不向首尾无记录区间外推", () => {
  assert.deepEqual(curve([null,null]).pieces,[]);
  assert.deepEqual(curve([null,0,null]).isolated,[{index:1,x:10,y:0}]);
  const {pieces,isolated}=curve([4,null,0,null,2]);
  assert.deepEqual(pieces.map(p=>p.gap),[true,true]);
  assert.deepEqual(isolated.map(p=>p.y),[4,0,2]);
});
test("负的净变化、全零与相对峰值都得到可用的纵轴", () => {
  assert.deepEqual(axisDomain(-4,6,true),{min:-100,max:100,step:50});
  for (const [lo,hi] of [[0,0],[-5,0],[-20,12],[0,.008]]) {
    const axis=axisDomain(lo,hi,false);
    assert.ok(axis.max>axis.min && axis.min<=lo && axis.max>=hi && axis.step>0);
  }
});
