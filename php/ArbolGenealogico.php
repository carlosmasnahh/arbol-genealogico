<?php
declare(strict_types=1);

final class PersonNode {
    public int $id;
    public string $name;
    /** @var int[] */
    public array $children = [];
    public ?int $parentId = null;
    public function __construct(int $id, string $name){ $this->id=$id; $this->name=$name; }
}

final class GeneTree {
    /** @var array<int,PersonNode> */
    private array $nodes = [];
    /** @var array<int,int> ids raíz */
    private array $roots = [];
    /** parejas "a-b" con a<b */
    private array $couples = [];
    /** índice por nombre */
    private array $nameIndex = [];

    /* ===== Persistencia ===== */
    public static function load(string $path): self {
        $tree = new self();
        if (!is_file($path)) return $tree;
        $raw = json_decode(file_get_contents($path), true) ?: [];
        foreach (($raw['nodes'] ?? []) as $n) {
            $p = new PersonNode((int)$n['id'], (string)$n['name']);
            $p->parentId = $n['parentId'] ?? null;
            $p->children = array_map('intval', $n['children'] ?? []);
            $tree->nodes[$p->id] = $p;
            $tree->indexName($p->id, $p->name);
        }
        foreach (($raw['roots'] ?? []) as $r) $tree->roots[(int)$r] = (int)$r;
        $tree->couples = array_values($raw['couples'] ?? []);
        $tree->pruneDanglingCouples(); // asegura consistencia al cargar
        return $tree;
    }

    public function save(string $path): void {
        $this->pruneDanglingCouples(); 
        $out = [
            'nodes' => array_map(fn($n)=>[
                'id'=>$n->id,'name'=>$n->name,'parentId'=>$n->parentId,'children'=>array_values($n->children)
            ], array_values($this->nodes)),
            'roots'   => array_values($this->roots),
            'couples' => array_values($this->couples),
        ];
        if (!is_dir(dirname($path))) mkdir(dirname($path), 0777, true);
        file_put_contents($path, json_encode($out, JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE));
    }

    /* ===== API de dominio ===== */
    public function addPerson(int $id, string $name): void {
        if (isset($this->nodes[$id])) throw new RuntimeException("Ya existe $id");
        $n = new PersonNode($id, $name);
        $this->nodes[$id] = $n;
        $this->roots[$id] = $id;
        $this->indexName($id, $name);
    }
    public function rename(int $id, string $name): void {
        $n = $this->get($id);
        $this->unindexName($id, $n->name);
        $n->name = $name;
        $this->indexName($id, $name);
    }
    public function link(int $parentId, int $childId): void {
        if ($parentId === $childId) throw new RuntimeException("Padre=hijo no válido");
        $p = $this->get($parentId); $c = $this->get($childId);
        if ($this->isAncestor($childId, $parentId)) throw new RuntimeException("Ciclo detectado");
        if ($c->parentId !== null) {
            $op = $this->get($c->parentId);
            $op->children = array_values(array_filter($op->children, fn($x)=>$x!==$childId));
        } else {
            unset($this->roots[$childId]);
        }
        if (!in_array($childId, $p->children, true)) $p->children[] = $childId;
        $c->parentId = $parentId;
        if ($p->parentId === null) $this->roots[$parentId] = $parentId;
    }
    public function remove(int $id): void {
        // cierre: nodo, descendientes y parejas (y descendientes de esas parejas)
        $toDelete = [];
        $inSet = [];
        $q = [$id];

        $partnersOf = function(int $x): array {
            $out = [];
            foreach ($this->couples as $k) {
                [$a,$b] = array_map('intval', explode('-', $k));
                if ($a === $x) $out[] = $b;
                if ($b === $x) $out[] = $a;
            }
            return $out;
        };

        while (!empty($q)) {
            $v = array_shift($q);
            if (!isset($this->nodes[$v]) || isset($inSet[$v])) continue;
            $inSet[$v] = true;
            $toDelete[] = $v;

            // hijos
            foreach ($this->nodes[$v]->children as $c) $q[] = $c;
            // pareja(s)
            foreach ($partnersOf($v) as $p) $q[] = $p;
        }

        // desconectar del padre los "raíces" del conjunto
        foreach ($toDelete as $v) {
            $n = $this->nodes[$v] ?? null;
            if ($n && $n->parentId !== null && !isset($inSet[$n->parentId])) {
                $p = $this->nodes[$n->parentId] ?? null;
                if ($p) {
                    $p->children = array_values(array_filter($p->children, fn($x)=>$x!==$v));
                }
            }
        }

        // eliminar nodos y parejas relacionadas
        foreach ($toDelete as $v) {
            if (!isset($this->nodes[$v])) continue;
            $this->unindexName($v, $this->nodes[$v]->name);
            unset($this->roots[$v], $this->nodes[$v]);
            $this->couples = array_values(array_filter($this->couples, function(string $k) use ($v) {
                [$a,$b] = array_map('intval', explode('-', $k));
                return $a !== $v && $b !== $v;
            }));
        }

        $this->pruneDanglingCouples();
    }

    public function move(int $subtreeRootId, int $newParentId): void { $this->link($newParentId,$subtreeRootId); }

    public function setCouple(int $a, int $b): void {
        if ($a === $b) throw new RuntimeException("Misma persona");
        $this->get($a); $this->get($b);
        // Monogamia: eliminar parejas previas de A o B
        $this->couples = array_values(array_filter($this->couples, function($k) use($a,$b){
            [$x,$y] = array_map('intval', explode('-', $k));
            return $x!==$a && $y!==$a && $x!==$b && $y!==$b;
        }));
        $key = ($a < $b) ? "$a-$b" : "$b-$a";
        if (!in_array($key, $this->couples, true)) $this->couples[] = $key;
    }
    public function unsetCouple(int $a, int $b): void {
        $key = ($a < $b) ? "$a-$b" : "$b-$a";
        $this->couples = array_values(array_filter($this->couples, fn($k)=>$k!==$key));
    }

    public function searchByName(string $name): array {
        $k = mb_strtolower(trim($name));
        $ids = $this->nameIndex[$k] ?? [];
        return array_map(fn($id)=>$this->nodes[$id], $ids);
    }
    public function maxDepth(): int {
        if (!$this->nodes) return 0;
        $max = 0;
        foreach ($this->roots as $r) {
            $q = [[$r,1]];
            while ($q) {
                [$v,$d] = array_shift($q);
                $max = max($max,$d);
                foreach ($this->nodes[$v]->children as $c) $q[] = [$c,$d+1];
            }
        }
        return $max;
    }
    public function countDescendants(int $id): int {
        $this->get($id);
        $cnt = 0; $q = $this->nodes[$id]->children;
        while ($q) {
            $v = array_shift($q); $cnt++;
            foreach ($this->nodes[$v]->children as $c) $q[] = $c;
        }
        return $cnt;
    }
    public function dfs(?int $start=null): array {
        $starts = $start!==null ? [$start] : array_values($this->roots);
        $stack = array_reverse($starts); $out=[];
        while ($stack) {
            $v = array_pop($stack); if (!isset($this->nodes[$v])) continue;
            $out[] = $v;
            $ch = $this->nodes[$v]->children;
            for ($i=count($ch)-1; $i>=0; $i--) $stack[]=$ch[$i];
        }
        return $out;
    }
    public function bfs(?int $start=null): array {
        $starts = $start!==null ? [$start] : array_values($this->roots);
        $q=$starts; $out=[]; $i=0;
        while ($i < count($q)) {
          $v = $q[$i++]; if (!isset($this->nodes[$v])) continue;
          $out[]=$v; foreach ($this->nodes[$v]->children as $c) $q[]=$c;
        }
        return $out;
    }

    public function snapshot(): array {
        $this->pruneDanglingCouples(); // ← garantiza snapshot limpio
        return [
            'nodes'=>array_map(fn($n)=>['id'=>$n->id,'name'=>$n->name,'parentId'=>$n->parentId,'children'=>array_values($n->children)], array_values($this->nodes)),
            'roots'=>array_values($this->roots),
            'couples'=>array_values($this->couples)
        ];
    }

    /* ===== internos ===== */
    private function get(int $id): PersonNode {
        if (!isset($this->nodes[$id])) throw new RuntimeException("No existe $id");
        return $this->nodes[$id];
    }
    private function isAncestor(int $a, int $b): bool {
        $cur = $this->nodes[$b] ?? null;
        while ($cur && $cur->parentId !== null) {
            if ($cur->parentId === $a) return true;
            $cur = $this->nodes[$cur->parentId] ?? null;
        }
        return false;
    }
    private function indexName(int $id, string $name): void {
        $k = mb_strtolower(trim($name));
        $this->nameIndex[$k] ??= [];
        $this->nameIndex[$k][] = $id;
    }
    private function unindexName(int $id, string $name): void {
        $k = mb_strtolower(trim($name));
        if (!isset($this->nameIndex[$k])) return;
        $this->nameIndex[$k] = array_values(array_filter($this->nameIndex[$k], fn($x)=>$x!==$id));
        if (!$this->nameIndex[$k]) unset($this->nameIndex[$k]);
    }
    /** elimina parejas cuyos extremos no existan en $nodes */
    private function pruneDanglingCouples(): void {
        $this->couples = array_values(array_filter($this->couples, function(string $k): bool {
            [$a,$b] = array_map('intval', explode('-', $k));
            return isset($this->nodes[$a]) && isset($this->nodes[$b]);
        }));
    }
}
