<template><canvas ref="canvas" :width="width" :height="height" aria-hidden="true" /></template>

<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import type { EditorFrame, EditorProject } from "../../shared/editor-project";
import { drawProjectThumbnail } from "../lib/project-renderer";

const props = withDefaults(defineProps<{
  project: EditorProject;
  frame?: EditorFrame;
  width?: number;
  height?: number;
  maxSize?: number;
}>(), { width: 220, height: 150, maxSize: 96 });
const canvas = ref<HTMLCanvasElement>();

function draw(): void {
  const context = canvas.value?.getContext("2d");
  if (!context) return;
  drawProjectThumbnail(context, props.project, props.frame);
}

onMounted(draw);
watch(() => [props.project, props.frame, props.maxSize], draw, { deep: true });
</script>
