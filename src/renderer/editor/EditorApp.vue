<template>
  <div class="editor-app">
    <header class="editor-topbar">
      <div class="editor-brand"><span class="brand-pixel" /><div><strong>小伴编辑器</strong><small>{{ project.canvas.width }} × {{ project.canvas.height }}</small></div></div>
      <input v-model="project.name" class="project-name" aria-label="项目名称" @change="markDirty" />
      <div class="topbar-actions">
        <select v-model="projectPicker" aria-label="已保存项目"><option value="">本地项目</option><option v-for="item in summaries" :key="item.id" :value="item.id">{{ item.name }} {{ item.width }}×{{ item.height }}</option></select>
        <button class="button subtle" @click="loadProject(projectPicker)">载入</button>
        <button class="button subtle" @click="newProject">新建</button>
        <button class="icon-text-button" :disabled="!history.canUndo" @click="undo">↶ <span>撤销</span></button>
        <button class="icon-text-button" :disabled="!history.canRedo" @click="redo">↷ <span>恢复</span></button>
        <button class="button subtle" @click="exportProject">导出宠物包</button>
        <button class="button primary" @click="saveProject">保存项目</button>
      </div>
    </header>

    <main class="editor-workspace">
      <aside class="tool-rail" aria-label="绘图工具">
        <button v-for="item in tools" :key="item.id" class="tool-button" :class="{ active: tool === item.id }" type="button" @click="tool = item.id"><span>{{ item.icon }}</span><small>{{ item.name }}</small></button>
        <span class="tool-divider" />
        <label class="onion-toggle"><input v-model="onionSkin" type="checkbox" /><span>◉</span><small>洋葱皮</small></label>
      </aside>

      <section class="canvas-panel">
        <div class="canvas-toolbar"><div><strong>{{ activeAction.name }}</strong><span>{{ activeFrame.name }}</span></div><label>缩放 <input v-model.number="zoom" type="range" min="6" max="24" /><output>{{ zoom }}×</output></label></div>
        <div class="canvas-viewport">
          <canvas ref="editorCanvas" :width="project.canvas.width * zoom" :height="project.canvas.height * zoom" aria-label="像素绘图画布" @pointerdown="pointerDown" @pointermove="pointerMove" @pointerup="finishStroke" @pointercancel="finishStroke" />
        </div>
        <div class="statusbar"><span>X {{ pointer.x }} Y {{ pointer.y }}</span><span :class="{ saved: !dirty }">{{ saveStatus }}</span></div>
      </section>

      <aside class="inspector">
        <section class="inspector-section preview-section">
          <div class="section-heading"><h2>动画预览</h2><button @click="previewPlaying = !previewPlaying">{{ previewPlaying ? '暂停' : '播放' }}</button></div>
          <div class="preview-stage"><canvas ref="previewCanvas" width="192" height="192" /></div>
        </section>
        <section class="inspector-section">
          <div class="section-heading"><h2>动作</h2><button @click="addAction">＋</button></div>
          <select v-model="selectedActionId" class="wide-select"><option v-for="action in project.actions" :key="action.id" :value="action.id">{{ action.name }}</option></select>
          <input v-model="activeAction.name" class="text-setting" aria-label="动作名称" @change="commitMutation" />
          <label class="inline-setting"><span>循环播放</span><input v-model="activeAction.loop" type="checkbox" @change="commitMutation" /></label>
        </section>
        <section class="inspector-section layers-section">
          <div class="section-heading"><h2>拼豆图层</h2><button @click="addLayer">＋</button></div>
          <div class="layer-list">
            <div v-for="layer in reversedLayers" :key="layer.id" class="layer-row" :class="{ selected: layer.id === selectedLayerId }">
              <button @click="toggleLayer(layer.id)">{{ layer.visible ? '◉' : '○' }}</button>
              <button class="layer-select" @click="selectedLayerId = layer.id" @dblclick="toggleLock(layer.id)">{{ layer.locked ? '🔒 ' : '' }}{{ layer.name }}</button>
              <button class="layer-delete" :disabled="project.layers.length <= 1" @click="deleteLayer(layer.id)">×</button>
            </div>
          </div>
          <input v-model="activeLayer.name" class="text-setting" aria-label="图层名称" @change="commitMutation" />
        </section>
        <section class="inspector-section palette-section">
          <div class="section-heading"><h2>调色板</h2><input v-model="customColor" type="color" @input="applyCustomColor" /></div>
          <div class="palette"><button v-for="(color,index) in project.palette" :key="`${index}-${color}`" class="palette-color" :class="{ transparent:index===0,selected:index===selectedColorIndex }" :style="{ '--swatch': color }" :title="color" @click="selectColor(index)" /></div>
        </section>
      </aside>

      <section class="timeline">
        <div class="timeline-heading"><div><strong>逐帧动画</strong><span>{{ activeAction.frames.length }} 帧</span></div><div class="timeline-actions"><label>帧时长 <input v-model.number="activeFrame.durationMs" type="number" min="20" max="5000" @change="commitMutation" /> ms</label><button class="button subtle" @click="addFrame(true)">复制帧</button><button class="button subtle danger" :disabled="activeAction.frames.length<=1" @click="deleteFrame">删除帧</button><button class="button primary compact" @click="addFrame(false)">＋ 新建帧</button></div></div>
        <div class="frame-list"><button v-for="(frame,index) in activeAction.frames" :key="frame.id" class="frame-card" :class="{ selected:frame.id===selectedFrameId }" @click="selectFrame(frame.id,index)"><ProjectCanvas :project="project" :frame="frame" :width="96" :height="96" :max-size="88" /><span>{{ index+1 }} · {{ frame.durationMs }} ms</span></button></div>
      </section>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, triggerRef, watch } from "vue";
import { cloneEditorProject, createEditorFrame, createEditorId, createEditorProject, createEmptyCel, normalizeEditorProject, type EditorAction, type EditorExportBundle, type EditorFrame, type EditorLayer, type EditorProject, type EditorProjectSummary } from "../../shared/editor-project";
import ProjectCanvas from "../components/ProjectCanvas.vue";
import { EditorHistory, type PixelChange } from "./history";
import { recordTypingInteraction } from "../lib/typing-interaction";

type Tool = "pencil" | "eraser" | "fill" | "eyedropper";
const tools = [{id:"pencil",name:"画笔",icon:"✎"},{id:"eraser",name:"橡皮",icon:"●"},{id:"fill",name:"填充",icon:"■"},{id:"eyedropper",name:"吸色",icon:"◌"}] as const;
const desktopPet=window.desktopPet;
const project=shallowRef(createEditorProject());
const summaries=ref<EditorProjectSummary[]>([]);
const projectPicker=ref("");
const selectedActionId=ref(project.value.actions[0]!.id);
const selectedFrameId=ref(project.value.actions[0]!.frames[0]!.id);
const selectedLayerId=ref(project.value.layers[0]!.id);
const selectedColorIndex=ref(3);
const customColor=ref(project.value.palette[3]!.slice(0,7));
const tool=ref<Tool>("pencil");
const zoom=ref(16);
const onionSkin=ref(true);
const dirty=ref(true);
const saveStatus=ref("未保存");
const pointer=ref({x:0,y:0});
const editorCanvas=ref<HTMLCanvasElement>();
const previewCanvas=ref<HTMLCanvasElement>();
const previewPlaying=ref(false);
const history=new EditorHistory();
const strokeChanges=new Map<number,PixelChange>();
let drawing=false, previewIndex=0, previewStarted=performance.now(), animationFrame=0;
let removeProjectRequest:(()=>void)|undefined;

const activeAction=computed(()=>project.value.actions.find(a=>a.id===selectedActionId.value)??project.value.actions[0]!);
const activeFrame=computed(()=>activeAction.value.frames.find(f=>f.id===selectedFrameId.value)??activeAction.value.frames[0]!);
const activeLayer=computed(()=>project.value.layers.find(l=>l.id===selectedLayerId.value)??project.value.layers[0]!);
const reversedLayers=computed(()=>[...project.value.layers].reverse());
function pixels(){return activeFrame.value.cels[activeLayer.value.id]!.pixels;}
function markDirty(){dirty.value=true;saveStatus.value="未保存";project.value.updatedAt=new Date().toISOString();triggerRef(project);}
function ensureSelection(){selectedActionId.value=activeAction.value.id;selectedFrameId.value=activeFrame.value.id;selectedLayerId.value=activeLayer.value.id;}
function mutate(change:()=>void){const before=cloneEditorProject(project.value);change();history.pushProject(before,cloneEditorProject(project.value));ensureSelection();markDirty();}
function commitMutation(){markDirty();}
function parseColor(color:string):[number,number,number,number]{const n=color.replace("#","");return [parseInt(n.slice(0,2),16),parseInt(n.slice(2,4),16),parseInt(n.slice(4,6),16),n.length===8?parseInt(n.slice(6,8),16):255];}
function drawFrame(context:CanvasRenderingContext2D,frame:EditorFrame,w:number,h:number,opacity=1,clear=true){if(clear)context.clearRect(0,0,w,h);const scale=Math.max(1,Math.floor(Math.min(w/project.value.canvas.width,h/project.value.canvas.height))),ox=Math.floor((w-project.value.canvas.width*scale)/2),oy=Math.floor((h-project.value.canvas.height*scale)/2);context.imageSmoothingEnabled=false;for(const layer of project.value.layers){if(!layer.visible)continue;const cel=frame.cels[layer.id];if(!cel)continue;context.globalAlpha=layer.opacity*opacity;cel.pixels.forEach((pi,index)=>{if(!pi)return;const color=project.value.palette[pi];if(!color)return;const x=index%project.value.canvas.width+cel.offsetX,y=Math.floor(index/project.value.canvas.width)+cel.offsetY;if(x>=0&&y>=0&&x<project.value.canvas.width&&y<project.value.canvas.height){context.fillStyle=color;context.fillRect(ox+x*scale,oy+y*scale,scale,scale);}});}context.globalAlpha=1;}
function render(){const canvas=editorCanvas.value,preview=previewCanvas.value;if(!canvas||!preview)return;const context=canvas.getContext("2d"),pc=preview.getContext("2d");if(!context||!pc)return;context.clearRect(0,0,canvas.width,canvas.height);for(let y=0;y<project.value.canvas.height;y++)for(let x=0;x<project.value.canvas.width;x++){context.fillStyle=(x+y)%2===0?"#d9dde1":"#c8cdd2";context.fillRect(x*zoom.value,y*zoom.value,zoom.value,zoom.value);}if(onionSkin.value){const i=activeAction.value.frames.findIndex(f=>f.id===selectedFrameId.value);if(i>0)drawFrame(context,activeAction.value.frames[i-1]!,canvas.width,canvas.height,.18,false);}drawFrame(context,activeFrame.value,canvas.width,canvas.height,1,false);if(zoom.value>=8){context.beginPath();context.strokeStyle="rgba(57,64,73,.24)";for(let x=1;x<project.value.canvas.width;x++){context.moveTo(x*zoom.value+.5,0);context.lineTo(x*zoom.value+.5,canvas.height);}for(let y=1;y<project.value.canvas.height;y++){context.moveTo(0,y*zoom.value+.5);context.lineTo(canvas.width,y*zoom.value+.5);}context.stroke();}drawFrame(pc,activeFrame.value,preview.width,preview.height);}
function cell(event:PointerEvent){const canvas=editorCanvas.value;if(!canvas)return;const b=canvas.getBoundingClientRect(),x=Math.floor((event.clientX-b.left)/b.width*project.value.canvas.width),y=Math.floor((event.clientY-b.top)/b.height*project.value.canvas.height);pointer.value={x,y};if(x<0||y<0||x>=project.value.canvas.width||y>=project.value.canvas.height)return;return {index:y*project.value.canvas.width+x};}
function recordPixel(index:number,value:number){if(activeLayer.value.locked||!activeLayer.value.visible)return;const list=pixels(),before=list[index]??0;if(before===value)return;const prior=strokeChanges.get(index);strokeChanges.set(index,{index,before:prior?.before??before,after:value});list[index]=value;markDirty();}
function fill(start:number){const list=pixels(),target=list[start]??0,replacement=selectedColorIndex.value;if(target===replacement)return;const queue=[start],seen=new Set<number>(queue);while(queue.length){const index=queue.shift()!;if((list[index]??0)!==target)continue;recordPixel(index,replacement);const x=index%project.value.canvas.width;for(const n of [x>0?index-1:-1,x<project.value.canvas.width-1?index+1:-1,index>=project.value.canvas.width?index-project.value.canvas.width:-1,index<list.length-project.value.canvas.width?index+project.value.canvas.width:-1])if(n>=0&&!seen.has(n)&&list[n]===target){seen.add(n);queue.push(n);}}finishStroke();}
function pick(index:number){for(const layer of [...project.value.layers].reverse()){if(!layer.visible)continue;const value=activeFrame.value.cels[layer.id]?.pixels[index]??0;if(value){selectColor(value);return;}}selectColor(0);}
function paint(index:number){if(tool.value==="eyedropper")pick(index);else if(tool.value==="fill")fill(index);else recordPixel(index,tool.value==="eraser"?0:selectedColorIndex.value);render();}
function pointerDown(event:PointerEvent){const c=cell(event);if(!c)return;drawing=true;strokeChanges.clear();paint(c.index);}
function pointerMove(event:PointerEvent){const c=cell(event);if(c&&drawing&&(tool.value==="pencil"||tool.value==="eraser"))paint(c.index);}
function finishStroke(){drawing=false;if(!strokeChanges.size)return;history.pushPixels({actionId:activeAction.value.id,frameId:activeFrame.value.id,layerId:activeLayer.value.id,changes:[...strokeChanges.values()]});strokeChanges.clear();triggerRef(project);render();}
function selectColor(index:number){selectedColorIndex.value=index;if(index>0)customColor.value=project.value.palette[index]!.slice(0,7);}
function applyCustomColor(){if(selectedColorIndex.value===0)selectedColorIndex.value=1;project.value.palette[selectedColorIndex.value]=customColor.value;markDirty();}
function addLayer(){mutate(()=>{const layer:EditorLayer={id:createEditorId("layer"),name:`图层 ${project.value.layers.length+1}`,visible:true,locked:false,opacity:1};project.value.layers.push(layer);for(const action of project.value.actions)for(const frame of action.frames)frame.cels[layer.id]=createEmptyCel(project.value.canvas);selectedLayerId.value=layer.id;});}
function deleteLayer(id:string){if(project.value.layers.length<=1)return;mutate(()=>{project.value.layers=project.value.layers.filter(l=>l.id!==id);for(const action of project.value.actions)for(const frame of action.frames)delete frame.cels[id];selectedLayerId.value=project.value.layers.at(-1)!.id;});}
function toggleLayer(id:string){mutate(()=>{const layer=project.value.layers.find(l=>l.id===id);if(layer)layer.visible=!layer.visible;});} function toggleLock(id:string){mutate(()=>{const layer=project.value.layers.find(l=>l.id===id);if(layer)layer.locked=!layer.locked;});}
function addAction(){mutate(()=>{const action:EditorAction={id:createEditorId("action"),name:`动作 ${project.value.actions.length+1}`,loop:true,frames:[createEditorFrame(project.value.canvas,project.value.layers)]};project.value.actions.push(action);selectedActionId.value=action.id;selectedFrameId.value=action.frames[0]!.id;});}
function addFrame(copy:boolean){mutate(()=>{const frame=copy?structuredClone(activeFrame.value):createEditorFrame(project.value.canvas,project.value.layers,`帧 ${activeAction.value.frames.length+1}`);frame.id=createEditorId("frame");activeAction.value.frames.push(frame);selectedFrameId.value=frame.id;});}
function deleteFrame(){if(activeAction.value.frames.length<=1)return;mutate(()=>{const i=activeAction.value.frames.findIndex(f=>f.id===selectedFrameId.value);activeAction.value.frames.splice(i,1);selectedFrameId.value=activeAction.value.frames[Math.max(0,i-1)]!.id;});}
function selectFrame(id:string,index:number){selectedFrameId.value=id;previewIndex=index;previewStarted=performance.now();}
function undo(){project.value=history.undo(project.value);ensureSelection();markDirty();} function redo(){project.value=history.redo(project.value);ensureSelection();markDirty();}
async function refreshSummaries(){summaries.value=await desktopPet.listEditorProjects();}
async function saveProject(){saveStatus.value="保存中…";project.value=normalizeEditorProject(await desktopPet.saveEditorProject(project.value));dirty.value=false;saveStatus.value="已保存";projectPicker.value=project.value.id;await refreshSummaries();}
async function loadProject(id:string){if(!id)return;const loaded=await desktopPet.loadEditorProject(id);if(!loaded)return;project.value=normalizeEditorProject(loaded);selectedActionId.value=project.value.actions[0]!.id;selectedFrameId.value=project.value.actions[0]!.frames[0]!.id;selectedLayerId.value=project.value.layers[0]!.id;history.clear();dirty.value=false;saveStatus.value="已保存";}
function newProject(){if(dirty.value&&!confirm("当前项目尚未保存，确定新建吗？"))return;project.value=createEditorProject();selectedActionId.value=project.value.actions[0]!.id;selectedFrameId.value=project.value.actions[0]!.frames[0]!.id;selectedLayerId.value=project.value.layers[0]!.id;history.clear();markDirty();}
async function exportProject(){const images:EditorExportBundle["images"]=[],actions:EditorExportBundle["manifest"]["actions"]=[];for(const action of project.value.actions){const frames=[];for(let i=0;i<action.frames.length;i++){const frame=action.frames[i]!,canvas=document.createElement("canvas");canvas.width=project.value.canvas.width;canvas.height=project.value.canvas.height;const context=canvas.getContext("2d")!;drawFrame(context,frame,canvas.width,canvas.height);const file=`actions/${action.id}/frame-${String(i+1).padStart(3,"0")}.png`;images.push({file,dataUrl:canvas.toDataURL("image/png")});frames.push({file,durationMs:frame.durationMs,pivot:{...frame.pivot}});}actions.push({id:action.id,name:action.name,loop:action.loop,frames});}saveStatus.value="正在导出…";const result=await desktopPet.exportEditorProject({manifest:{version:1,id:project.value.id,name:project.value.name,canvas:{...project.value.canvas},actions},images});saveStatus.value=result.canceled?(dirty.value?"未保存":"已保存"):`已导出：${result.path??""}`;}
function previewLoop(now:number){if(previewPlaying.value){const frames=activeAction.value.frames,frame=frames[previewIndex]??frames[0]!;if(now-previewStarted>=frame.durationMs){previewIndex=previewIndex>=frames.length-1?(activeAction.value.loop?0:frames.length-1):previewIndex+1;previewStarted=now;}const context=previewCanvas.value?.getContext("2d");if(context)drawFrame(context,frames[previewIndex]??frames[0]!,192,192);}animationFrame=requestAnimationFrame(previewLoop);}
function keydown(event:KeyboardEvent){recordTypingInteraction(event);if(event.ctrlKey&&event.key.toLowerCase()==="z"){event.preventDefault();undo();}else if(event.ctrlKey&&event.key.toLowerCase()==="y"){event.preventDefault();redo();}else if(event.ctrlKey&&event.key.toLowerCase()==="s"){event.preventDefault();void saveProject();}else{const map:Record<string,Tool>={b:"pencil",e:"eraser",g:"fill",i:"eyedropper"};if(map[event.key.toLowerCase()])tool.value=map[event.key.toLowerCase()]!;}}
watch([project,selectedActionId,selectedFrameId,selectedLayerId,zoom,onionSkin],()=>void nextTick(render),{deep:true});
watch(selectedActionId,()=>{selectedFrameId.value=activeAction.value.frames[0]!.id;previewIndex=0;});
onMounted(async()=>{window.addEventListener("keydown",keydown);await refreshSummaries();const initial=summaries.value[0]?.id;if(initial){projectPicker.value=initial;await loadProject(initial);}removeProjectRequest=desktopPet.onEditorProjectRequested(id=>{projectPicker.value=id;void loadProject(id);});render();animationFrame=requestAnimationFrame(previewLoop);});
onBeforeUnmount(()=>{window.removeEventListener("keydown",keydown);removeProjectRequest?.();cancelAnimationFrame(animationFrame);});
</script>
