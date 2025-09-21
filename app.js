const API_URL = 'php/api.php';
const api = (action, payload = {}) =>
  fetch(`${API_URL}?action=${encodeURIComponent(action)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...payload })
  }).then(r => r.json());

// Icono de las personas 
const PERSON_SVG =
  'data:image/svg+xml;base64,' +
  'PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZmlsbD0iIzBmMTcyYSIgZD0iTTEyIDEyYTQgNCAwIDEgMC00LTRhNCA0IDAgMCAwIDQgNG0wIDJjLTMuMzEgMC02IDEuNzktNiA0djJoMTJ2LTJjMC0yLjIxLTIuNjktNC02LTR6Ii8+PC9zdmc+';

/* ===================== Estructura de datos ===================== */
class PersonNode {
  constructor(id, name) {
    this.id = id;
    this.name = name;
    this.children = [];  // ids
    this.parentId = null;
  }
}

class GeneTree {
  constructor() {
    /** @type {Map<number, PersonNode>} */
    this.nodes = new Map();
    this.roots = new Set();
    this.nameIndex = new Map();
    /** parejas "a-b" con a<b */
    this.couples = new Set();
  }

  addPerson(id, name) {
    if (this.nodes.has(id)) throw new Error(`Ya existe persona con id ${id}`);
    const n = new PersonNode(id, String(name));
    this.nodes.set(id, n);
    this.roots.add(id);
    this.#indexName(id, n.name);
  }

  rename(id, newName) {
    const n = this.#get(id);
    this.#unindexName(id, n.name);
    n.name = String(newName);
    this.#indexName(id, n.name);
  }

  link(parentId, childId) {
    if (parentId === childId) throw new Error("No puedes ser tu propio padre.");
    const p = this.#get(parentId);
    const c = this.#get(childId);

    if (this.#isAncestor(childId, parentId)) {
      throw new Error("Movimiento inválido: crearías un ciclo.");
    }

    if (c.parentId !== null) {
      const oldP = this.#get(c.parentId);
      oldP.children = oldP.children.filter(x => x !== childId);
    } else {
      this.roots.delete(childId);
    }

    if (!p.children.includes(childId)) p.children.push(childId);
    c.parentId = parentId;

    if (p.parentId === null) this.roots.add(parentId);
  }

  /** Eliminar persona + todo su subárbol y elimina parejas colgantes */
  remove(personId) {
    const toDelete = new Set();
    const queue = [Number(personId)];

    const enqueuePartners = (id) => {
      for (const key of this.couples) {
        const [a, b] = key.split('-').map(Number);
        if (a === id && !toDelete.has(b)) queue.push(b);
        if (b === id && !toDelete.has(a)) queue.push(a);
      }
    };

    while (queue.length) {
      const v = Number(queue.shift());
      if (!this.nodes.has(v) || toDelete.has(v)) continue;
      toDelete.add(v);

      const n = this.nodes.get(v);
      for (const c of n.children) queue.push(c);
      enqueuePartners(v);
    }

    // desconectar del padre los "raíces" del conjunto
    for (const v of toDelete) {
      const n = this.nodes.get(v);
      if (n && n.parentId !== null && !toDelete.has(n.parentId)) {
        const p = this.nodes.get(n.parentId);
        if (p) p.children = p.children.filter(x => x !== v);
      }
    }

    // eliminar nodos y desindexar
    for (const v of toDelete) {
      const n = this.nodes.get(v);
      if (!n) continue;
      this.#unindexName(v, n.name);
      this.nodes.delete(v);
      this.roots.delete(v);
    }

    // quitar parejas donde participe cualquiera del conjunto
    for (const key of [...this.couples]) {
      const [a, b] = key.split('-').map(Number);
      if (toDelete.has(a) || toDelete.has(b)) this.couples.delete(key);
    }

    this.pruneDanglingCouples();
  }

  move(subtreeRootId, newParentId) { this.link(newParentId, subtreeRootId); }

  dfs(startId = null) {
    const starts = startId !== null ? [startId] : Array.from(this.roots);
    const stack = [...starts].reverse(), out = [];
    while (stack.length) {
      const id = stack.pop();
      if (!this.nodes.has(id)) continue;
      out.push(id);
      const n = this.nodes.get(id);
      for (let i = n.children.length - 1; i >= 0; i--) stack.push(n.children[i]);
    }
    return out;
  }

  bfs(startId = null) {
    const starts = startId !== null ? [startId] : Array.from(this.roots);
    const q = [...starts]; let qi = 0; const out = [];
    while (qi < q.length) {
      const id = q[qi++]; if (!this.nodes.has(id)) continue;
      out.push(id);
      const n = this.nodes.get(id);
      for (const c of n.children) q.push(c);
    }
    return out;
  }

  maxDepth() {
    if (this.nodes.size === 0) return 0;
    let best = 0;
    for (const r of this.roots) {
      const q = [[r,1]]; let qi = 0;
      while (qi < q.length) {
        const [id,d] = q[qi++]; best = Math.max(best, d);
        const n = this.nodes.get(id);
        for (const c of n.children) q.push([c, d+1]);
      }
    }
    return best;
  }

  countDescendants(id) {
    const n0 = this.#get(id);
    let count = 0;
    const q = [...n0.children]; let qi = 0;
    while (qi < q.length) {
      const v = q[qi++]; count++;
      const n = this.nodes.get(v);
      for (const c of n.children) q.push(c);
    }
    return count;
  }

  searchByName(name) {
    const key = String(name).trim().toLowerCase();
    const ids = this.nameIndex.get(key) ?? new Set();
    return [...ids].map(id => this.nodes.get(id));
  }

  /* ===== PAREJAS (usando monogamia) ===== */
  setCouple(aId, bId) {
    aId = Number(aId); bId = Number(bId);
    if (aId === bId) throw new Error("No puedes emparejar a la misma persona.");
    this.#get(aId); this.#get(bId);

    // Monogamia: eliminar cualquier pareja existente de A o B
    this.#removeCouplesOf(aId);
    this.#removeCouplesOf(bId);

    const key = aId < bId ? `${aId}-${bId}` : `${bId}-${aId}`;
    this.couples.add(key);
  }

  unsetCouple(aId, bId) {
    aId = Number(aId); bId = Number(bId);
    const key = aId < bId ? `${aId}-${bId}` : `${bId}-${aId}`;
    this.couples.delete(key);
  }

  #removeCouplesOf(id) {
    for (const key of [...this.couples]) {
      const [a,b] = key.split('-').map(Number);
      if (a === id || b === id) this.couples.delete(key);
    }
  }

  /** Poda de parejas cuyos extremos ya no existan */
  pruneDanglingCouples() {
    for (const key of [...this.couples]) {
      const [a, b] = key.split('-').map(Number);
      if (!this.nodes.has(a) || !this.nodes.has(b)) this.couples.delete(key);
    }
  }

  getSnapshot() {
    return {
      nodes: [...this.nodes.values()].map(n => ({
        id: n.id, name: n.name, parentId: n.parentId, children: [...n.children]
      })),
      roots: [...this.roots],
      couples: [...this.couples]
    };
  }

  loadSnapshot(snap) {
    this.nodes.clear(); this.roots.clear(); this.nameIndex.clear();
    this.couples = new Set(snap.couples ?? []);
    for (const raw of snap.nodes) {
      const n = new PersonNode(raw.id, raw.name);
      n.parentId = raw.parentId ?? null;
      n.children = [...raw.children];
      this.nodes.set(n.id, n);
      this.#indexName(n.id, n.name);
    }
    for (const r of snap.roots) this.roots.add(r);
    this.pruneDanglingCouples();
  }

  /* ====== privados ====== */
  #get(id){ const n = this.nodes.get(Number(id)); if(!n) throw new Error(`No existe persona con id ${id}`); return n; }
  #isAncestor(aId,bId){ let cur=this.nodes.get(bId); while(cur && cur.parentId!==null){ if(cur.parentId===aId) return true; cur=this.nodes.get(cur.parentId); } return false; }
  #indexName(id,name){ const k=String(name).trim().toLowerCase(); if(!this.nameIndex.has(k)) this.nameIndex.set(k,new Set()); this.nameIndex.get(k).add(id); }
  #unindexName(id,name){ const k=String(name).trim().toLowerCase(); const s=this.nameIndex.get(k); if(!s) return; s.delete(id); if(s.size===0) this.nameIndex.delete(k); }
}

/* ===================== Visualización con Cytoscape ===================== */
const tree = new GeneTree();
const log = (msg) => {
  const el = document.getElementById('log');
  if (!el) { console.warn('No existe #log'); return; }
  el.textContent += msg + "\n";
  el.scrollTop = el.scrollHeight;
};

let cy = null;

function render() {
  const container = document.getElementById('chart');
  if (!container) { console.error('Falta #chart'); return; }

  const elements = [];

  // Nodos
  for (const [id, n] of tree.nodes.entries()) {
    elements.push({ data: { id: String(id), label: `${n.id} · ${n.name}` } });
  }
  // Padre→hijo
  for (const [id, n] of tree.nodes.entries()) {
    for (const c of n.children) {
      elements.push({
        data: { id: `e${id}-${c}`, source: String(id), target: String(c) },
        classes: 'parentEdge'
      });
    }
  }
  // Parejas
  for (const key of tree.couples) {
    const [a, b] = key.split('-');
    if (!tree.nodes.has(Number(a)) || !tree.nodes.has(Number(b))) continue;
    elements.push({
      data: { id: `c${a}-${b}`, source: a, target: b, label: '♥' },
      classes: 'coupleEdge'
    });
  }

  if (!cy) {
    cy = cytoscape({
      container,
      elements,
      style: [
        {
          selector: 'node',
          style: {
            'shape': 'ellipse',
            'background-color': '#0ea5e9',
            'border-width': 2,
            'border-color': '#0ea5e9',

            // Persona
            'background-image': PERSON_SVG,
            'background-fit': 'contain',
            'background-clip': 'none',
            'background-opacity': 1,
            'background-width': '80%',
            'background-height': '80%',

            // Label
            'label': 'data(label)',
            'color': '#0f172a',
            'font-size': 12,
            'text-wrap': 'wrap',
            'text-max-width': 180,
            'text-margin-y': -24,

            // Tamaño
            'width': 28,
            'height': 28
          }
        },
        {
          selector: 'edge.parentEdge',
          style: {
            'width': 2,
            'curve-style': 'bezier',
            'line-color': '#cbd5e1',
            'target-arrow-color': '#cbd5e1',
            'target-arrow-shape': 'triangle'
          }
        },
        {
          selector: 'edge.coupleEdge',
          style: {
            'curve-style': 'bezier',
            'line-style': 'dotted',
            'width': 2,
            'line-color': '#ef4444',
            'target-arrow-shape': 'none',
            'source-arrow-shape': 'none',
            'label': 'data(label)',
            'color': '#ef4444',
            'font-size': 18,
            'text-background-color': '#ffffff',
            'text-background-opacity': 1,
            'text-background-padding': 2
          }
        },
        {
          selector: ':selected',
          style: {
            'background-color': '#16a34a',
            'line-color': '#16a34a',
            'target-arrow-color': '#16a34a'
          }
        },
        {
          selector: '.subhl',
          style: {
            'background-color': '#22c55e',
            'line-color': '#22c55e',
            'target-arrow-color': '#22c55e'
          }
        }
      ],
      wheelSensitivity: 0.2,
      pixelRatio: 1
    });
  } else {
    cy.json({ elements });
  }

  cy.layout({ name: 'dagre', rankDir: 'LR', nodeSep: 30, rankSep: 80, animate: false, padding: 20 }).run();

  // Resaltar subárbol al click
  cy.off('tap');
  cy.on('tap', 'node', (evt) => {
    const n = evt.target;
    cy.elements().removeClass('subhl');
    const sub = n.outgoers().union(n);
    sub.addClass('subhl');
    cy.animate({ center: { eles: sub }, fit: { eles: sub, padding: 40 }, duration: 200 });
  });
}

function clearVisualization() {
  if (!cy) return;
  cy.stop();
  cy.elements().removeClass('subhl');
  cy.$(':selected').unselect();
  cy.fit(cy.elements(), 40);
  log('🧹 Vista limpia');
}

/* ===== refrescar desde el servidor y cargar al árbol local (para "Eliminar TODO") ===== */
async function refreshSnapshot() {
  const res = await api('snapshot');
  if (!res.ok) throw new Error(res.error || 'Error cargando snapshot');
  tree.loadSnapshot(res.snapshot);
  render();
}

/* ===== helpers de UI ===== */
const $ = (id) => document.getElementById(id);
const valNum = (id) => Number($(id)?.value);
const valStr = (id) => String($(id)?.value || '').trim();

const onClick = (id, handler) => {
  const el = $(id);
  if (!el) { log('UI WARN: falta #' + id); return; }
  el.addEventListener('click', handler);
};

// Se engancha a #ID (si existe) y a cualquier [data-click="ID"]
const onAction = (id, handler) => {
  const btn = $(id);
  if (btn) btn.addEventListener('click', handler);
  else log('UI INFO: usando data-click para ' + id);

  document.querySelectorAll(`[data-click="${id}"]`).forEach(el => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      handler(e);
    });
  });
};


function setupDemo() {
  // Dos raíces
  tree.addPerson(1, "Papá");
  tree.addPerson(2, "Mamá");

  // Hijos demo
  tree.addPerson(3, "Juanito");
  tree.addPerson(4, "pepe");
  tree.link(2, 4);
  tree.link(4, 3);

  tree.addPerson(5, "luciana");
  tree.link(2, 5);

  // Pareja demo
  tree.setCouple(1, 2);

  render();
  log("Demo inicial creada con pareja y monogamia activa.");
}

/* ===== bind de eventos  ===== */
function bindEvents() {
  // Mini-toolbar 
  onClick('btnAdd', () => {
    try { const id=valNum('newId'), name=valStr('newName'); tree.addPerson(id,name); render(); log(`+ Persona ${id} (${name})`); }
    catch(e){ log('ERROR: '+e.message); }
  });

  onClick('btnLink', () => {
    try { tree.link(valNum('pid'), valNum('cid')); render(); log(`→ Padre ${valNum('pid')} → hijo ${valNum('cid')}`); }
    catch(e){ log('ERROR: '+e.message); }
  });

  onClick('btnDel', () => {
    try { tree.remove(valNum('delId')); render(); log(`Eliminado subárbol desde ${valNum('delId')}`); }
    catch(e){ log('ERROR: '+e.message); }
  });

  onClick('btnMove', () => {
    try { tree.move(valNum('moveSubtreeId'), valNum('moveNewParentId')); render(); log(`⇄ Movido ${valNum('moveSubtreeId')} → padre ${valNum('moveNewParentId')}`); }
    catch(e){ log('ERROR: '+e.message); }
  });

  // Parejas
  onClick('btnCouple', () => {
    try { const a=valNum('coupleA'), b=valNum('coupleB'); tree.setCouple(a,b); render(); log(`Pareja definida: ${a} – ${b}`); }
    catch(e){ log('ERROR: '+e.message); }
  });
  onClick('btnUnCouple', () => {
    const a=valNum('coupleA'), b=valNum('coupleB'); tree.unsetCouple(a,b); render(); log(`Pareja quitada ${a} – ${b}`);
  });

  // Búsqueda y algoritmos 
  onClick('btnSearch', () => {
    const q = valStr('searchName');
    const res = tree.searchByName(q);
    const out = res.map(n=>`(${n.id}) ${n.name}`).join(', ') || '— sin resultados —';
    const sr = $('searchResults'); if (sr) sr.textContent = out;
    log(`Buscar "${q}": ${out}`);
  });
  onClick('btnDFS',   () => log('DFS: ' + tree.dfs().join(' → ')));
  onClick('btnBFS',   () => log('BFS: ' + tree.bfs().join(' → ')));
  onClick('btnDepth', () => log('Profundidad máxima: ' + tree.maxDepth()));
  onClick('btnDesc',  () => {
    try { const id=valNum('descId'); log(`Descendientes de ${id}: `+tree.countDescendants(id)); }
    catch(e){ log('ERROR: '+e.message); }
  });

  // Acciones rápidas 
  onAction('btnClearView', () => { clearVisualization(); });

  onAction('btnExport', () => {
    const data = tree.getSnapshot();
    const blob = new Blob([JSON.stringify(data, null, 2)], {type: "application/json"});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = "genealogico.json";
    a.click();
  });

  onAction('btnNuke', async () => {
    const sure = window.confirm('⚠ Esto eliminará TODO el árbol (personas, relaciones y parejas) de forma permanente.\n¿Deseas continuar?');
    if (!sure) return;
    const again = window.prompt('Escribe ELIMINAR para confirmar:');
    if (again !== 'ELIMINAR') { log('Cancelado.'); return; }
    try {
      const emptySnap = { nodes: [], roots: [], couples: [] };
      const res = await api('loadSnapshot', { snapshot: emptySnap });
      if (!res.ok) throw new Error(res.error || 'Error al vaciar árbol');
      await refreshSnapshot();
      log('Árbol eliminado por completo.');
    } catch (e) { log('ERROR: ' + e.message); }
  });

  onAction('btnExportJPG', () => {
    if (!cy) { log('ERROR: visualización no inicializada'); return; }
    const jpg = cy.jpg({ quality: 0.95, scale: 2, full: true, bg: '#ffffff' });
    const a = document.createElement('a');
    a.href = jpg;
    a.download = 'genealogico.jpg';
    a.click();
    log(' Exportado JPG');
  });

  onAction('btnReset', () => {
    tree.nodes.clear(); tree.roots.clear(); tree.nameIndex.clear(); tree.couples.clear();
    render(); setupDemo(); log(' Reiniciado');
  });

  // Import JSON (real input file)
  const importInput = $('fileImport');
  if (importInput) {
    importInput.onchange = (ev) => {
      const file = ev.target.files[0]; if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try { tree.loadSnapshot(JSON.parse(reader.result)); render(); log(' Importado JSON'); }
        catch(e){ log('ERROR al importar: ' + e.message); }
      };
      reader.readAsText(file);
    };
  } else {
    log('UI WARN: falta #fileImport');
  }
}


window.addEventListener('DOMContentLoaded', () => { setupDemo(); bindEvents(); });
