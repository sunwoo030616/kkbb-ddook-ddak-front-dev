import { useEffect, useState, useSyncExternalStore } from 'react';
import { CanvasWorkspace } from './canvasWorkspace.js';
export function useCanvasWorkspace() {
  const [workspace]=useState(()=>new CanvasWorkspace());
  const state=useSyncExternalStore(workspace.subscribe,workspace.snapshot);
  useEffect(()=>{workspace.connect();return workspace.disconnect;},[workspace]);
  return [state,workspace];
}
