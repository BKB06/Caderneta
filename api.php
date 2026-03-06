<?php
// =============================================================
// api.php — Backend da Caderneta de Apostas (versão corrigida)
// Correções: SQL Injection, validação, REPLACE→ON DUPLICATE KEY,
//            display_errors desabilitado, prepared statements em 100%
// =============================================================

// Erros vão para log, nunca para o output (evita expor dados internos)
ini_set('display_errors', 0);
ini_set('log_errors', 1);
error_reporting(E_ALL);

header('Content-Type: application/json; charset=utf-8');

require 'conexao.php';

// ---------------------------------------------------------
// HELPERS
// ---------------------------------------------------------

/**
 * Garante que o profile_id existe na tabela perfis (via prepared statement).
 */
function ensureProfileExists(mysqli $conn, string $profile_id): void {
    $stmt = $conn->prepare("INSERT IGNORE INTO perfis (id, name) VALUES (?, 'Perfil Principal')");
    $stmt->bind_param("s", $profile_id);
    $stmt->execute();
    $stmt->close();
}

/**
 * Garante que a linha de dados_extras existe para o perfil.
 */
function ensureDadosExtrasExists(mysqli $conn, string $profile_id): void {
    $stmt = $conn->prepare("INSERT IGNORE INTO dados_extras (profile_id) VALUES (?)");
    $stmt->bind_param("s", $profile_id);
    $stmt->execute();
    $stmt->close();
}

/**
 * Retorna um profile_id sanitizado (nunca vazio).
 */
function getProfileId(array $dados): string {
    return !empty($dados['profile_id']) ? trim($dados['profile_id']) : 'default';
}

/**
 * Responde com JSON e encerra o script.
 */
function responder(array $payload): void {
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

// ---------------------------------------------------------
// LEITURA DO INPUT
// ---------------------------------------------------------
$dados = json_decode(file_get_contents("php://input"), true);

if (!is_array($dados)) {
    responder(["sucesso" => false, "erro" => "Payload JSON inválido."]);
}

$acao = $dados['acao'] ?? '';

// Lista de ações permitidas (whitelist)
$acoes_permitidas = [
    'salvar_aposta', 'carregar_apostas', 'excluir_aposta',
    'salvar_fluxo', 'carregar_fluxo', 'excluir_fluxo',
    'salvar_dados_extras', 'carregar_dados_extras',
    'salvar_categoria', 'carregar_categorias', 'excluir_categoria'
];

if (!in_array($acao, $acoes_permitidas, true)) {
    responder(["sucesso" => false, "erro" => "Ação não reconhecida."]);
}

// ---------------------------------------------------------
// 1. AÇÃO: SALVAR OU ATUALIZAR UMA APOSTA
// ---------------------------------------------------------
if ($acao === 'salvar_aposta') {
    $aposta = $dados['aposta'] ?? null;
    if (!is_array($aposta)) {
        responder(["sucesso" => false, "erro" => "Dados da aposta ausentes."]);
    }

    $profile_id = getProfileId($dados);

    // Validações do lado do servidor
    $id     = trim($aposta['id'] ?? '');
    $date   = trim($aposta['date'] ?? '');
    $event  = trim($aposta['event'] ?? '');
    $odds   = floatval($aposta['odds'] ?? 0);
    $stake  = floatval($aposta['stake'] ?? 0);
    $book   = trim($aposta['book'] ?? '');
    $ai     = !empty($aposta['ai']) ? trim($aposta['ai']) : null;
    $status = $aposta['status'] ?? 'pending';
    $isFreebet = !empty($aposta['isFreebet']) ? 1 : 0;
    $category = !empty($aposta['category']) ? trim($aposta['category']) : null;

    // Validação de campos obrigatórios
    if ($id === '' || $date === '' || $event === '' || $book === '') {
        responder(["sucesso" => false, "erro" => "Campos obrigatórios em falta (id, date, event, book)."]);
    }
    if ($odds <= 1.0) {
        responder(["sucesso" => false, "erro" => "Odd deve ser maior que 1.0."]);
    }
    if ($stake <= 0) {
        responder(["sucesso" => false, "erro" => "Stake deve ser maior que 0."]);
    }

    // Validar status contra whitelist
    $status_permitidos = ['pending', 'win', 'loss'];
    if (!in_array($status, $status_permitidos, true)) {
        $status = 'pending';
    }

    // Garantir que o perfil existe (prepared statement)
    ensureProfileExists($conn, $profile_id);

    // INSERT ... ON DUPLICATE KEY UPDATE (em vez de REPLACE INTO)
    $stmt = $conn->prepare("
        INSERT INTO apostas (id, profile_id, date, event, odds, stake, book, ai, status, is_freebet, category)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
            date = VALUES(date),
            event = VALUES(event),
            odds = VALUES(odds),
            stake = VALUES(stake),
            book = VALUES(book),
            ai = VALUES(ai),
            status = VALUES(status),
            is_freebet = VALUES(is_freebet),
            category = VALUES(category)
    ");

    $stmt->bind_param("ssssddsssis",
        $id, $profile_id, $date, $event,
        $odds, $stake, $book,
        $ai, $status, $isFreebet, $category
    );

    if ($stmt->execute()) {
        responder(["sucesso" => true, "mensagem" => "Aposta salva na base de dados!"]);
    } else {
        responder(["sucesso" => false, "erro" => "Erro ao salvar aposta."]);
    }
}

// ---------------------------------------------------------
// 2. AÇÃO: CARREGAR TODAS AS APOSTAS DE UM PERFIL
// ---------------------------------------------------------
elseif ($acao === 'carregar_apostas') {
    $profile_id = getProfileId($dados);

    // Prepared statement — elimina SQL Injection
    $stmt = $conn->prepare("SELECT * FROM apostas WHERE profile_id = ? ORDER BY date DESC");
    $stmt->bind_param("s", $profile_id);
    $stmt->execute();
    $result = $stmt->get_result();

    $apostas = [];
    if ($result) {
        while ($row = $result->fetch_assoc()) {
            // Compatibilidade: o JS espera 'isFreebet' (camelCase)
            $row['isFreebet'] = (bool)($row['is_freebet'] ?? $row['isFreebet'] ?? false);
            unset($row['is_freebet']);
            $row['odds']  = (float)$row['odds'];
            $row['stake'] = (float)$row['stake'];
            $row['category'] = $row['category'] ?? null;
            $apostas[] = $row;
        }
    }
    $stmt->close();

    echo json_encode($apostas, JSON_UNESCAPED_UNICODE);
}

// ---------------------------------------------------------
// 3. AÇÃO: SALVAR OU ATUALIZAR FLUXO DE CAIXA
// ---------------------------------------------------------
elseif ($acao === 'salvar_fluxo') {
    $fluxo = $dados['fluxo'] ?? null;
    if (!is_array($fluxo)) {
        responder(["sucesso" => false, "erro" => "Dados do fluxo ausentes."]);
    }

    $profile_id = getProfileId($dados);

    $id     = trim($fluxo['id'] ?? '');
    $date   = trim($fluxo['date'] ?? '');
    $type   = $fluxo['type'] ?? '';
    $amount = floatval($fluxo['amount'] ?? 0);
    $note   = trim($fluxo['note'] ?? '');

    // Validações
    if ($id === '' || $date === '') {
        responder(["sucesso" => false, "erro" => "Campos obrigatórios em falta (id, date)."]);
    }
    if (!in_array($type, ['deposit', 'withdraw'], true)) {
        responder(["sucesso" => false, "erro" => "Tipo deve ser 'deposit' ou 'withdraw'."]);
    }
    if ($amount <= 0) {
        responder(["sucesso" => false, "erro" => "Valor deve ser maior que 0."]);
    }

    ensureProfileExists($conn, $profile_id);

    $stmt = $conn->prepare("
        INSERT INTO fluxo_caixa (id, profile_id, date, type, amount, note)
        VALUES (?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
            date = VALUES(date),
            type = VALUES(type),
            amount = VALUES(amount),
            note = VALUES(note)
    ");

    $stmt->bind_param("ssssds",
        $id, $profile_id, $date, $type,
        $amount, $note
    );

    if ($stmt->execute()) {
        responder(["sucesso" => true]);
    } else {
        responder(["sucesso" => false, "erro" => "Erro ao salvar fluxo."]);
    }
}

// ---------------------------------------------------------
// 4. AÇÃO: CARREGAR FLUXO DE CAIXA
// ---------------------------------------------------------
elseif ($acao === 'carregar_fluxo') {
    $profile_id = getProfileId($dados);

    $stmt = $conn->prepare("SELECT * FROM fluxo_caixa WHERE profile_id = ? ORDER BY date DESC");
    $stmt->bind_param("s", $profile_id);
    $stmt->execute();
    $result = $stmt->get_result();

    $fluxos = [];
    if ($result) {
        while ($row = $result->fetch_assoc()) {
            $row['amount'] = (float)$row['amount'];
            $fluxos[] = $row;
        }
    }
    $stmt->close();

    echo json_encode($fluxos, JSON_UNESCAPED_UNICODE);
}

// ---------------------------------------------------------
// 4B. AÇÃO: EXCLUIR APOSTA
// ---------------------------------------------------------
elseif ($acao === 'excluir_aposta') {
    $id = trim($dados['id'] ?? '');
    $profile_id = getProfileId($dados);
    if ($id === '') {
        responder(["sucesso" => false, "erro" => "ID da aposta ausente."]);
    }

    $stmt = $conn->prepare("DELETE FROM apostas WHERE id = ? AND profile_id = ?");
    $stmt->bind_param("ss", $id, $profile_id);
    $stmt->execute();
    $stmt->close();

    responder(["sucesso" => true, "mensagem" => "Aposta excluída com sucesso."]);
}

// ---------------------------------------------------------
// 5. AÇÃO: EXCLUIR FLUXO DE CAIXA
// ---------------------------------------------------------
elseif ($acao === 'excluir_fluxo') {
    $id = trim($dados['id'] ?? '');
    if ($id === '') {
        responder(["sucesso" => false, "erro" => "ID do fluxo ausente."]);
    }

    $stmt = $conn->prepare("DELETE FROM fluxo_caixa WHERE id = ?");
    $stmt->bind_param("s", $id);
    $stmt->execute();
    $stmt->close();

    responder(["sucesso" => true]);
}

// ---------------------------------------------------------
// 6. AÇÃO: SALVAR DADOS EXTRAS (settings, goals, notes, bankroll)
// ---------------------------------------------------------
elseif ($acao === 'salvar_dados_extras') {
    $profile_id = getProfileId($dados);
    $tipo  = $dados['tipo'] ?? '';
    $valor = $dados['valor'] ?? '';

    // Whitelist de tipos permitidos — previne crash e acesso a colunas indevidas
    $tipos_permitidos = ['settings', 'goals', 'notes', 'bankroll'];
    if (!in_array($tipo, $tipos_permitidos, true)) {
        responder(["sucesso" => false, "erro" => "Tipo inválido. Permitidos: settings, goals, notes, bankroll."]);
    }

    // Mapeamento tipo → coluna (seguro pois $tipo já está validado pela whitelist)
    $colunas = [
        'settings' => 'settings_json',
        'goals'    => 'goals_json',
        'notes'    => 'notes',
        'bankroll' => 'bankroll',
    ];
    $coluna = $colunas[$tipo];

    ensureProfileExists($conn, $profile_id);
    ensureDadosExtrasExists($conn, $profile_id);

    // Como a coluna vem de whitelist hardcoded, é seguro interpolar aqui
    $stmt = $conn->prepare("UPDATE dados_extras SET $coluna = ? WHERE profile_id = ?");
    $stmt->bind_param("ss", $valor, $profile_id);

    if ($stmt->execute()) {
        responder(["sucesso" => true]);
    } else {
        responder(["sucesso" => false, "erro" => "Erro ao salvar dados extras."]);
    }
}

// ---------------------------------------------------------
// 7. AÇÃO: CARREGAR DADOS EXTRAS
// ---------------------------------------------------------
elseif ($acao === 'carregar_dados_extras') {
    $profile_id = getProfileId($dados);

    $stmt = $conn->prepare("SELECT * FROM dados_extras WHERE profile_id = ?");
    $stmt->bind_param("s", $profile_id);
    $stmt->execute();
    $result = $stmt->get_result();

    if ($result && $row = $result->fetch_assoc()) {
        responder(["sucesso" => true, "dados" => $row]);
    } else {
        responder(["sucesso" => false, "erro" => "Nenhum dado encontrado"]);
    }
}

// ---------------------------------------------------------
// 8. AÇÃO: SALVAR CATEGORIA
// ---------------------------------------------------------
elseif ($acao === 'salvar_categoria') {
    $profile_id = getProfileId($dados);
    $cat = $dados['categoria'] ?? null;
    if (!is_array($cat)) {
        responder(["sucesso" => false, "erro" => "Dados da categoria ausentes."]);
    }

    $id   = trim($cat['id'] ?? '');
    $name = trim($cat['name'] ?? '');
    $icon = trim($cat['icon'] ?? '🏅');
    $sort_order = intval($cat['sort_order'] ?? 0);

    if ($id === '' || $name === '') {
        responder(["sucesso" => false, "erro" => "Campos obrigatórios em falta (id, name)."]);
    }

    ensureProfileExists($conn, $profile_id);

    $stmt = $conn->prepare("
        INSERT INTO categorias (id, profile_id, name, icon, sort_order)
        VALUES (?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
            name = VALUES(name),
            icon = VALUES(icon),
            sort_order = VALUES(sort_order)
    ");

    $stmt->bind_param("ssssi", $id, $profile_id, $name, $icon, $sort_order);

    if ($stmt->execute()) {
        responder(["sucesso" => true, "mensagem" => "Categoria salva!"]);
    } else {
        responder(["sucesso" => false, "erro" => "Erro ao salvar categoria."]);
    }
}

// ---------------------------------------------------------
// 9. AÇÃO: CARREGAR CATEGORIAS
// ---------------------------------------------------------
elseif ($acao === 'carregar_categorias') {
    $profile_id = getProfileId($dados);

    $stmt = $conn->prepare("SELECT * FROM categorias WHERE profile_id = ? ORDER BY sort_order ASC, name ASC");
    $stmt->bind_param("s", $profile_id);
    $stmt->execute();
    $result = $stmt->get_result();

    $categorias = [];
    if ($result) {
        while ($row = $result->fetch_assoc()) {
            $categorias[] = $row;
        }
    }
    $stmt->close();

    echo json_encode($categorias, JSON_UNESCAPED_UNICODE);
}

// ---------------------------------------------------------
// 10. AÇÃO: EXCLUIR CATEGORIA
// ---------------------------------------------------------
elseif ($acao === 'excluir_categoria') {
    $id = trim($dados['id'] ?? '');
    $profile_id = getProfileId($dados);
    if ($id === '') {
        responder(["sucesso" => false, "erro" => "ID da categoria ausente."]);
    }

    // Buscar nome da categoria antes de excluir
    $stmt = $conn->prepare("SELECT name FROM categorias WHERE id = ? AND profile_id = ?");
    $stmt->bind_param("ss", $id, $profile_id);
    $stmt->execute();
    $result = $stmt->get_result();
    $catName = null;
    if ($result && $row = $result->fetch_assoc()) {
        $catName = $row['name'];
    }
    $stmt->close();

    // Limpar categoria das apostas que a usavam
    if ($catName) {
        $stmt = $conn->prepare("UPDATE apostas SET category = NULL WHERE profile_id = ? AND category = ?");
        $stmt->bind_param("ss", $profile_id, $catName);
        $stmt->execute();
        $stmt->close();
    }

    // Excluir categoria
    $stmt = $conn->prepare("DELETE FROM categorias WHERE id = ? AND profile_id = ?");
    $stmt->bind_param("ss", $id, $profile_id);
    $stmt->execute();
    $stmt->close();

    responder(["sucesso" => true, "mensagem" => "Categoria excluída com sucesso."]);
}

$conn->close();
?>