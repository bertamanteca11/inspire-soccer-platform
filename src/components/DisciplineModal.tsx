import {useCallback,useRef} from 'react';
import type {Role} from '../types';
import {Modal} from './ui';
import {SuspensionManager} from './SuspensionManager';

// Closing the dialog must not silently discard a decision or an unsubmitted
// service match. Confirming discard never writes or completes a case.
export function DisciplineModal({title,role,playerId,onClose,onChanged,initialCreate=false}:{title:string;role:Role;playerId:string;onClose:()=>void;onChanged?:()=>void|Promise<void>;initialCreate?:boolean}) {
  const dirty=useRef(false);
  const reportDirty=useCallback((value:boolean)=>{dirty.current=value;},[]);
  function close(){
    if(!dirty.current||window.confirm('Hay cambios sin guardar. ¿Cerrar sin guardarlos?'))onClose();
  }
  return <Modal title={title} onClose={close}><SuspensionManager role={role} playerId={playerId} onChanged={onChanged} initialCreate={initialCreate} onDirtyChange={reportDirty}/></Modal>;
}
