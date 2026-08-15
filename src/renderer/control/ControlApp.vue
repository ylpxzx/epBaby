<template>
  <div class="app-shell">
    <header class="topbar" data-window-drag>
      <strong class="brand">{{ copy.brand }}</strong>
      <p class="page-title">{{ copy.pageTitle }}</p>
      <div class="topbar-tools" data-window-no-drag>
        <button class="editor-entry" type="button" @click="desktopPet.showEditor(state?.selectedPetId || undefined)">
          <span>{{ copy.designPet }}</span>
        </button>
        <button class="icon-button" type="button" :aria-label="copy.toggleTheme" @click="toggleTheme">◐</button>
        <button
          class="icon-button"
          type="button"
          aria-label="玩法说明"
          title="单击/双击/三连击、长按、滚轮、拖动释放；应用内快速输入 20 次；Ctrl+Alt+1/2/3 触发动作，Ctrl+Alt+R 召回，Ctrl+Alt+P 暂停"
        >?</button>
        <span class="toolbar-divider" />
        <button class="locale-button" type="button" :aria-label="copy.toggleLanguage" @click="toggleLocale">
          <span>{{ copy.localeLabel }}</span>
        </button>
        <span class="toolbar-divider" />
        <div class="window-controls" role="group" :aria-label="copy.windowControls">
          <button class="window-button" type="button" :aria-label="copy.minimize" @click="desktopPet.minimizeControl()">—</button>
          <button class="window-button" type="button" :aria-label="copy.maximize" @click="desktopPet.toggleMaximizeControl()">□</button>
          <button class="window-button close" type="button" :aria-label="copy.close" @click="desktopPet.closeControl()">×</button>
        </div>
      </div>
    </header>

    <main class="console-main">
      <section class="stage" :aria-labelledby="activeProject ? 'pet-name' : undefined">
        <div class="stage-light" aria-hidden="true" />
        <div class="pet-stage-visual">
          <canvas ref="stageCanvas" width="720" height="520" aria-hidden="true" />
          <div class="stage-shadow" aria-hidden="true" />
          <div v-if="!activeProject" class="empty-state">
            <span class="empty-pixel" aria-hidden="true" />
            <h1>{{ copy.emptyTitle }}</h1>
            <p>{{ copy.emptyDescription }}</p>
            <button type="button" @click="desktopPet.showEditor()">{{ copy.createPet }}</button>
          </div>
          <h1 id="pet-name" class="visually-hidden">{{ activeProject?.name || copy.emptyTitle }}</h1>
        </div>

        <section class="control-card">
          <div class="current-row"><span>{{ copy.currentAction }}</span><strong>{{ activeAction?.name || copy.noAction }}</strong></div>
          <div class="action-list" role="group" :aria-label="copy.actionControl" :style="actionGridStyle">
            <button
              v-for="action in activeProject?.actions || []"
              :key="action.id"
              class="action-button"
              :class="{ active: action.id === state?.currentActionId }"
              type="button"
              :aria-pressed="action.id === state?.currentActionId"
              @click="setAction(action.id)"
            >{{ action.name }}</button>
          </div>
          <div class="range-row">
            <label for="speed">{{ copy.speed }}</label>
            <input id="speed" v-model.number="draftSpeed" type="range" min="0.5" max="2" step="0.1" :disabled="!activeProject" :style="rangeStyle(draftSpeed, .5, 2)" @change="saveSpeed" />
            <output>{{ draftSpeed.toFixed(1) }}×</output>
          </div>
          <div class="range-row">
            <label for="scale">{{ copy.size }}</label>
            <input id="scale" v-model.number="draftScale" type="range" min="0.7" max="1.35" step="0.05" :disabled="!activeProject" :style="rangeStyle(draftScale, .7, 1.35)" @change="saveScale" />
            <output>{{ Math.round(draftScale * 100) }}%</output>
          </div>
          <div class="control-card-footer">
            <button class="pause-button" :class="{ active: state?.paused }" type="button" :disabled="!activeProject" @click="togglePaused">
              {{ state?.paused ? '▶' : 'Ⅱ' }}
            </button>
            <button class="recall-button" type="button" :disabled="!activeProject" @click="recall">{{ copy.recall }}</button>
          </div>
        </section>
      </section>

      <footer class="pet-dock">
        <div class="pet-list" aria-label="宠物列表">
          <p v-if="!projects.length" class="pet-library-empty">{{ copy.emptyLibrary }}</p>
          <div v-for="project in projects" :key="project.id" class="pet-card" :class="{ selected: project.id === state?.selectedPetId }">
            <button class="pet-card-select" type="button" :aria-pressed="project.id === state?.selectedPetId" @click="selectPet(project.id)">
              <span class="pet-preview"><ProjectCanvas :project="project" /></span><strong>{{ project.name }}</strong>
            </button>
            <div class="pet-card-tools">
              <button class="pet-card-tool" type="button" :title="copy.chooseCover" @click="openCover(project)">▧</button>
              <button class="pet-card-tool danger" type="button" :title="copy.deletePet" @click="openDelete(project)">×</button>
            </div>
          </div>
        </div>
        <div class="dock-divider" aria-hidden="true" />
        <label class="auto-toggle">
          <span>{{ copy.autoCompanion }}</span>
          <input :checked="state?.autoMode" type="checkbox" :disabled="!activeProject" @change="setAutoMode" />
          <span class="switch" aria-hidden="true" />
        </label>
      </footer>
    </main>

    <dialog ref="coverDialog" class="pet-dialog cover-dialog">
      <div class="pet-dialog-panel">
        <header class="pet-dialog-header"><div><p class="pet-dialog-eyebrow">{{ copy.coverEyebrow }}</p><h2>{{ copy.coverTitle }}</h2></div><button class="dialog-close" @click="coverDialog?.close()">×</button></header>
        <p class="pet-dialog-project">{{ coverProject?.name }}</p>
        <label class="cover-action-field"><span>{{ copy.coverAction }}</span><select v-model="coverActionId" @change="selectFirstCoverFrame"><option v-for="action in coverProject?.actions" :key="action.id" :value="action.id">{{ action.name }}</option></select></label>
        <div class="cover-frame-list" role="listbox">
          <button v-for="(frame, index) in coverFrames" :key="frame.id" class="cover-frame-option" :class="{ selected: frame.id === coverFrameId }" role="option" :aria-selected="frame.id === coverFrameId" @click="coverFrameId = frame.id">
            <ProjectCanvas v-if="coverProject" :project="coverProject" :frame="frame" :width="150" :height="108" /><span>{{ frame.name || `${locale === 'zh-CN' ? '帧' : 'Frame'} ${index + 1}` }}</span>
          </button>
        </div>
        <footer class="pet-dialog-footer"><button class="dialog-secondary" @click="coverDialog?.close()">{{ copy.cancel }}</button><button class="dialog-primary" :disabled="savingCover" @click="saveCover">{{ copy.saveCover }}</button></footer>
      </div>
    </dialog>

    <dialog ref="deleteDialog" class="pet-dialog delete-dialog">
      <div class="pet-dialog-panel">
        <header class="pet-dialog-header"><div><p class="pet-dialog-eyebrow danger">{{ copy.deleteEyebrow }}</p><h2>{{ copy.deleteTitle }}</h2></div><button class="dialog-close" @click="deleteDialog?.close()">×</button></header>
        <p class="delete-message">{{ deleteMessage }}</p>
        <footer class="pet-dialog-footer"><button class="dialog-secondary" @click="deleteDialog?.close()">{{ copy.cancel }}</button><button class="dialog-danger" :disabled="deleting" @click="deleteProject">{{ copy.deleteConfirm }}</button></footer>
      </div>
    </dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import type { RuntimeState } from "../../shared/contracts";
import type { EditorProject } from "../../shared/editor-project";
import { drawProjectFrame, findProjectAction, frameAtElapsed } from "../lib/project-renderer";
import ProjectCanvas from "../components/ProjectCanvas.vue";
import { recordTypingInteraction } from "../lib/typing-interaction";

type Locale = "zh-CN" | "en";
type Theme = "light" | "dark";
const COPY = {
  "zh-CN": { brand:"小伴",pageTitle:"我的桌面伙伴",currentAction:"当前动作",actionControl:"动作控制",speed:"速度",size:"大小",autoCompanion:"自动陪伴",designPet:"设计宠物",recall:"召回桌面",toggleTheme:"切换主题",toggleLanguage:"切换语言",windowControls:"窗口控制",minimize:"最小化",maximize:"最大化",close:"关闭",localeLabel:"简体中文",title:"小伴控制台",emptyTitle:"还没有桌面宠物",emptyDescription:"从一张空白像素画布开始，设计你的第一个伙伴。",createPet:"创建像素宠物",emptyLibrary:"宠物库为空",noAction:"暂无动作",chooseCover:"选择首页展示帧",deletePet:"删除宠物",coverEyebrow:"首页展示图",coverTitle:"选择封面帧",coverAction:"动作",cancel:"取消",saveCover:"设为首页展示图",deleteEyebrow:"删除宠物",deleteTitle:"确定删除这个宠物？",deleteConfirm:"永久删除" },
  en: { brand:"Buddy",pageTitle:"My desktop companions",currentAction:"Current action",actionControl:"Action control",speed:"Speed",size:"Size",autoCompanion:"Auto companion",designPet:"Design pet",recall:"Recall to desktop",toggleTheme:"Toggle theme",toggleLanguage:"Switch language",windowControls:"Window controls",minimize:"Minimize",maximize:"Maximize",close:"Close",localeLabel:"English",title:"Buddy Console",emptyTitle:"No desktop pets yet",emptyDescription:"Start with a blank pixel canvas and design your first companion.",createPet:"Create pixel pet",emptyLibrary:"Pet library is empty",noAction:"No actions",chooseCover:"Choose home preview frame",deletePet:"Delete pet",coverEyebrow:"Home preview",coverTitle:"Choose a cover frame",coverAction:"Action",cancel:"Cancel",saveCover:"Use as home preview",deleteEyebrow:"Delete pet",deleteTitle:"Delete this pet?",deleteConfirm:"Delete permanently" }
} as const;

const desktopPet = window.desktopPet;
const savedLocale = localStorage.getItem("ep-baby.locale");
const locale = ref<Locale>(savedLocale === "zh-CN" || savedLocale === "en" ? savedLocale : navigator.language.startsWith("zh") ? "zh-CN" : "en");
const savedTheme = localStorage.getItem("ep-baby.theme");
const theme = ref<Theme>(savedTheme === "light" || savedTheme === "dark" ? savedTheme : matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
const state = shallowRef<RuntimeState>();
const projects = shallowRef<EditorProject[]>([]);
const stageCanvas = ref<HTMLCanvasElement>();
const coverDialog = ref<HTMLDialogElement>();
const deleteDialog = ref<HTMLDialogElement>();
const coverProject = shallowRef<EditorProject>();
const deleteTarget = shallowRef<EditorProject>();
const coverActionId = ref("");
const coverFrameId = ref("");
const savingCover = ref(false);
const deleting = ref(false);
const draftSpeed = ref(1);
const draftScale = ref(1);
let actionStartedAt = performance.now();
let lastActionKey = "";
let animationFrame = 0;
let removeStateListener: (() => void) | undefined;
let removeProjectListener: (() => void) | undefined;

const copy = computed(() => COPY[locale.value]);
const activeProject = computed(() => projects.value.find(project => project.id === state.value?.selectedPetId));
const activeAction = computed(() => activeProject.value ? findProjectAction(activeProject.value, state.value?.currentActionId || "") : undefined);
const coverAction = computed(() => coverProject.value?.actions.find(action => action.id === coverActionId.value));
const coverFrames = computed(() => coverAction.value?.frames || []);
const actionGridStyle = computed(() => ({ gridTemplateColumns: `repeat(${Math.max(1, Math.min(6, activeProject.value?.actions.length || 1))}, minmax(0, 1fr))` }));
const deleteMessage = computed(() => deleteTarget.value ? locale.value === "zh-CN" ? `“${deleteTarget.value.name}”及其全部动作将从本机永久删除。此操作无法撤销。` : `“${deleteTarget.value.name}” and all actions will be permanently deleted. This cannot be undone.` : "");

function applyState(next: RuntimeState): void { const key = `${next.selectedPetId}:${next.currentActionId}`; if (key !== lastActionKey) { lastActionKey = key; actionStartedAt = performance.now(); } state.value = next; draftSpeed.value = next.speed; draftScale.value = next.scale; }
async function refreshProjects(): Promise<void> { const summaries = await desktopPet.listEditorProjects(); const loaded = await Promise.all(summaries.map(item => desktopPet.loadEditorProject(item.id))); projects.value = loaded.filter((item): item is EditorProject => Boolean(item)); }
function rangeStyle(value:number,min:number,max:number) { return { "--range-progress": `${((value-min)/(max-min))*100}%` }; }
function selectPet(id:string) { void desktopPet.selectPet(id).then(applyState); }
function setAction(id:string) { void desktopPet.setAction(id).then(applyState); }
function setAutoMode(event:Event) { void desktopPet.setAutoMode((event.target as HTMLInputElement).checked).then(applyState); }
function togglePaused() { void desktopPet.setPaused(!(state.value?.paused ?? false)).then(applyState); }
function recall() { void desktopPet.recall().then(applyState); }
function saveSpeed() { void desktopPet.setSpeed(draftSpeed.value).then(applyState); }
function saveScale() { void desktopPet.setScale(draftScale.value).then(applyState); }
function toggleLocale() { locale.value = locale.value === "zh-CN" ? "en" : "zh-CN"; localStorage.setItem("ep-baby.locale", locale.value); }
function toggleTheme() { theme.value = theme.value === "light" ? "dark" : "light"; }
function applyTheme() { document.documentElement.dataset.theme = theme.value; document.documentElement.style.colorScheme = theme.value; localStorage.setItem("ep-baby.theme", theme.value); }
function openCover(project:EditorProject) { coverProject.value = project; const action = project.actions.find(item => item.id === project.cover.actionId) || project.actions[0]; coverActionId.value = action?.id || ""; coverFrameId.value = action?.frames.some(frame => frame.id === project.cover.frameId) ? project.cover.frameId : action?.frames[0]?.id || ""; coverDialog.value?.showModal(); }
function selectFirstCoverFrame() { coverFrameId.value = coverFrames.value[0]?.id || ""; }
async function saveCover() { const project=coverProject.value, action=coverAction.value; if(!project||!action||!coverFrameId.value)return; savingCover.value=true; try { await desktopPet.setEditorProjectCover(project.id,action.id,coverFrameId.value); await refreshProjects(); coverDialog.value?.close(); } finally { savingCover.value=false; } }
function openDelete(project:EditorProject) { deleteTarget.value=project; deleteDialog.value?.showModal(); }
async function deleteProject() { if(!deleteTarget.value)return; deleting.value=true; try { applyState(await desktopPet.deleteEditorProject(deleteTarget.value.id)); await refreshProjects(); deleteDialog.value?.close(); } finally { deleting.value=false; } }
function drawStage(now:number) { const canvas=stageCanvas.value, project=activeProject.value, current=state.value; const context=canvas?.getContext("2d"); if(canvas&&context){ context.clearRect(0,0,canvas.width,canvas.height); if(project&&current){ const action=findProjectAction(project,current.currentActionId); const frame=frameAtElapsed(action,current.paused?0:now-actionStartedAt,current.speed); drawProjectFrame(context,project,frame,{maxSize:Math.min(370,320*current.scale),bottomPadding:58,flip:current.direction===-1}); }} animationFrame=requestAnimationFrame(drawStage); }
function handleKeydown(event:KeyboardEvent) { recordTypingInteraction(event); if(event.target instanceof HTMLInputElement)return; if(event.key.toLowerCase()==="r"&&state.value?.selectedPetId)recall(); if(event.code==="Space"&&state.value?.selectedPetId){event.preventDefault();togglePaused();} }

watch(theme, applyTheme, { immediate:true });
watch(copy, value => { document.documentElement.lang=locale.value; document.title=value.title; }, { immediate:true });
onMounted(async()=>{ window.addEventListener("keydown",handleKeydown); removeStateListener=desktopPet.onStateChanged(applyState); removeProjectListener=desktopPet.onEditorProjectChanged(()=>void refreshProjects()); await refreshProjects(); applyState(await desktopPet.getState()); animationFrame=requestAnimationFrame(drawStage); });
onBeforeUnmount(()=>{ window.removeEventListener("keydown",handleKeydown); removeStateListener?.(); removeProjectListener?.(); cancelAnimationFrame(animationFrame); });
</script>
