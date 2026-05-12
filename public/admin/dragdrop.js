var dragId=null;
document.addEventListener('DOMContentLoaded',function(){
  var s=document.createElement('style');
  s.textContent='tr.dragging{opacity:.4;}tr.drag-over{border-top:2px solid #38bdf8;}';
  document.head.appendChild(s);
});
function dragStart(e,id){
  dragId=id;
  setTimeout(function(){
    var tr=document.querySelector('tr[data-id="'+id+'"]');
    if(tr)tr.classList.add('dragging');
  },0);
  e.dataTransfer.effectAllowed='move';
}
function dragOver(e){
  e.preventDefault();
  document.querySelectorAll('tr.drag-over').forEach(function(el){el.classList.remove('drag-over');});
  var tr=e.target.closest('tr');
  if(tr&&tr.dataset.id)tr.classList.add('drag-over');
}
function dragEnd(e){
  document.querySelectorAll('tr.dragging,tr.drag-over').forEach(function(el){
    el.classList.remove('dragging');el.classList.remove('drag-over');
  });
}
function drop(e,targetId){
  e.preventDefault();
  document.querySelectorAll('tr.drag-over').forEach(function(el){el.classList.remove('drag-over');});
  if(!dragId||dragId===targetId){dragId=null;return;}
  fetch('/api/monitors/reorder',{
    method:'POST',
    headers:{'Content-Type':'application/json','Authorization':'Bearer '+localStorage.getItem('m_tok')},
    body:JSON.stringify({id1:dragId,id2:targetId})
  }).then(function(){dragId=null;if(typeof loadM==='function')loadM();});
}
