import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
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
const web=fileURLToPath(new URL("./web/",import.meta.url));
const assets=path.join(root,"assets");
await mkdir(assets,{recursive:true});
const [template,js,css]=await Promise.all([
  read("./web/page.html"),
  build({entryPoints:[path.join(web,"App.jsx")],bundle:true,minify:true,write:false,format:"esm",platform:"browser",target:"es2022",
    jsx:"automatic",legalComments:"eof",define:{"process.env.NODE_ENV":'"production"'}}),
  read("./web/theme.css").then(source=>postcss([tailwind({base:web,optimize:true})]).process(source,{from:path.join(web,"theme.css")}))
]);
async function asset(name,content) {
  await writeFile(path.join(assets,name),content);
  return "assets/"+name+"?v="+createHash("sha256").update(content).digest("hex").slice(0,12);
}
const [styleUrl,scriptUrl]=await Promise.all([asset("report.css",css.css),asset("report.js",js.outputFiles[0].contents)]);
const page=template.replace("<!--STYLES-->",()=>'<link rel="stylesheet" href="'+styleUrl+'">')
  .replace("<!--DATA-->",()=>JSON.stringify(manifest).replaceAll("<","\\u003c"))
  .replace("<!--APP-->",()=>'<script type="module" src="'+scriptUrl+'"></script>');
await writeFile(path.join(root,"index.html"),page);
