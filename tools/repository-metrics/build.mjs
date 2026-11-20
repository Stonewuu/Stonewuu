import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { prepare } from "./prepare.mjs";

const [archive,site] = process.argv.slice(2);
if (!archive || !site) {
  throw new Error("用法：node build.mjs 历史归档目录 Pages站点目录");
}
const read = name=>readFile(new URL(name,import.meta.url),"utf8");
const repositories=JSON.parse(await read("./repositories.json"));
const root=path.join(site,"traffic");
const manifest={};
await mkdir(root,{recursive:true});
for(const repo of repositories) {
  const repoDir=path.join(archive,...repo.split("/"));
  const history=JSON.parse(await readFile(path.join(repoDir,"history.json"),"utf8"));
  const snapshotDir=path.join(repoDir,"observations");
  const dates=(await readdir(snapshotDir)).filter(n=>/^\d{4}-\d{2}-\d{2}\.json$/.test(n)).sort();
  const observations=[];
  for(const name of dates) {
    observations.push(JSON.parse(await readFile(path.join(snapshotDir,name),"utf8")));
  }
  let starHistory=null;
  try {
    starHistory=JSON.parse(await readFile(path.join(site,"star-history",repo+".json"),"utf8"));
  } catch(err) {
    if(err.code!=="ENOENT") {
      throw err;
    }
  }
  const data=JSON.stringify(prepare(repo,history,observations,starHistory));
  const rel="data/"+repo+".json";
  await mkdir(path.dirname(path.join(root,rel)),{recursive:true});
  await writeFile(path.join(root,rel),data+"\n");
  manifest[repo]=rel+"?v="+createHash("sha256").update(data).digest("hex").slice(0,12);
}
const [template,base,styles,model,...modules]=await Promise.all([
  "./web/index.html","./web/base.css","./web/screen.css","./model.mjs","./web/plot.js","./web/breakdowns.js","./web/app.js"
].map(read));
const inline = ["const manifest="+JSON.stringify(manifest)+";",model.replace(/^export /gm,""),...modules].join("\n");
if (/<\/script/i.test(inline)) {
  throw new Error("页面脚本包含意外的结束标签。");
}
const page=template.replace("<!--STYLES-->",()=>"<style>"+base+"\n"+styles+"</style>")
  .replace("<!--APP-->",()=>'<script type="module">'+inline+"</script>");
await writeFile(path.join(root,"index.html"),page);
