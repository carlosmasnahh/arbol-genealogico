<?php
declare(strict_types=1);
require __DIR__ . '/config.php';
require __DIR__ . '/ArbolGenealogico.php';
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit; }


$DATA_PATH = dirname(__DIR__) . '/data/tree.json';
$body = json_decode(file_get_contents('php://input') ?: '[]', true) ?? [];
$action = $_GET['action'] ?? $body['action'] ?? null;

try {
    $tree = GeneTree::load($DATA_PATH);

    switch ($action) {
        case 'addPerson':
            $tree->addPerson((int)$body['id'], (string)$body['name']); break;
        case 'rename':
            $tree->rename((int)$body['id'], (string)$body['name']); break;
        case 'link':
            $tree->link((int)$body['parentId'], (int)$body['childId']); break;
        case 'remove':
            $tree->remove((int)$body['id']); break;
        case 'move':
            $tree->move((int)$body['subtreeRootId'], (int)$body['newParentId']); break;
        case 'setCouple':
            $tree->setCouple((int)$body['aId'], (int)$body['bId']); break;
        case 'unsetCouple':
            $tree->unsetCouple((int)$body['aId'], (int)$body['bId']); break;
        case 'searchByName':
            $res = $tree->searchByName((string)$body['q']);
            echo json_encode(['ok'=>true,'results'=>array_map(fn($n)=>['id'=>$n->id,'name'=>$n->name], $res)], JSON_UNESCAPED_UNICODE); exit;
        case 'dfs':
            echo json_encode(['ok'=>true,'order'=>$tree->dfs(isset($body['start'])?(int)$body['start']:null)]); exit;
        case 'bfs':
            echo json_encode(['ok'=>true,'order'=>$tree->bfs(isset($body['start'])?(int)$body['start']:null)]); exit;
        case 'maxDepth':
            echo json_encode(['ok'=>true,'value'=>$tree->maxDepth()]); exit;
        case 'countDescendants':
            echo json_encode(['ok'=>true,'value'=>$tree->countDescendants((int)$body['id'])]); exit;
        case 'snapshot':
            echo json_encode(['ok'=>true,'snapshot'=>$tree->snapshot()], JSON_UNESCAPED_UNICODE); exit;
        case 'loadSnapshot':
            
            $snap = $body['snapshot'] ?? null;
            if (!$snap) throw new RuntimeException('snapshot requerido');
            file_put_contents($DATA_PATH, json_encode($snap, JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE));
            echo json_encode(['ok'=>true]); exit;
        default:
            if ($action !== null) throw new RuntimeException("Acción '$action' desconocida");
            
            echo json_encode(['ok'=>true,'snapshot'=>$tree->snapshot()], JSON_UNESCAPED_UNICODE); exit;
    }

    // para acciones que mutan, guardar y responder snapshot
    $tree->save($DATA_PATH);
    echo json_encode(['ok'=>true,'snapshot'=>$tree->snapshot()], JSON_UNESCAPED_UNICODE);

} catch (Throwable $e) {
    http_response_code(400);
    echo json_encode(['ok'=>false,'error'=>$e->getMessage()]);
}
