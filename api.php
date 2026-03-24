<?php
// =============================================================
// api.php — Backend da Caderneta de Apostas
// =============================================================

ini_set('display_errors', 0);
ini_set('log_errors', 1);
error_reporting(E_ALL);

header('Content-Type: application/json; charset=utf-8');

require 'conexao.php';

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

function responder(array $payload): void {
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

function ensureProfileExists(mysqli $conn, string $profile_id): void {
    $stmt = $conn->prepare("INSERT IGNORE INTO perfis (id, name) VALUES (?, 'Perfil Principal')");
    $stmt->bind_param("s", $profile_id);
    $stmt->execute();
    $stmt->close();
}

function ensureProfileAccessTable(mysqli $conn): void {
    static $initialized = false;
    if ($initialized) {
        return;
    }

    $sql = "
        CREATE TABLE IF NOT EXISTS profile_access (
            profile_id VARCHAR(64) NOT NULL,
            session_id VARCHAR(128) NOT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (profile_id),
            KEY idx_profile_access_session (session_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ";

    $conn->query($sql);
    $initialized = true;
}

function ensureAuthorizedProfile(mysqli $conn, string $profile_id): void {
    ensureProfileAccessTable($conn);
    ensureProfileExists($conn, $profile_id);

    $currentSessionId = session_id();

    $stmt = $conn->prepare("SELECT session_id FROM profile_access WHERE profile_id = ? LIMIT 1");
    $stmt->bind_param("s", $profile_id);
    $stmt->execute();
    $result = $stmt->get_result();
    $row = $result ? $result->fetch_assoc() : null;
    $stmt->close();

    if (!$row) {
        $stmt = $conn->prepare("INSERT INTO profile_access (profile_id, session_id) VALUES (?, ?)");
        $stmt->bind_param("ss", $profile_id, $currentSessionId);
        $stmt->execute();
        $stmt->close();
        return;
    }

    if (!hash_equals((string)$row['session_id'], $currentSessionId)) {
        $stmt = $conn->prepare("UPDATE profile_access SET session_id = ? WHERE profile_id = ?");
        $stmt->bind_param("ss", $currentSessionId, $profile_id);
        $stmt->execute();
        $stmt->close();
    }
}

function ensureDadosExtrasExists(mysqli $conn, string $profile_id): void {
    $stmt = $conn->prepare("INSERT IGNORE INTO dados_extras (profile_id) VALUES (?)");
    $stmt->bind_param("s", $profile_id);
    $stmt->execute();
    $stmt->close();
}

function getProfileId(array $dados): string {
    $profile_id = !empty($dados['profile_id'])
        ? trim((string)$dados['profile_id'])
        : ('profile_' . substr(hash('sha256', session_id()), 0, 16));

    if (!preg_match('/^[a-zA-Z0-9._-]{1,64}$/', $profile_id)) {
        responder(["sucesso" => false, "erro" => "profile_id inválido."]);
    }

    return $profile_id;
}

function fluxoHasBookColumn(mysqli $conn): bool {
    static $hasBookColumn = null;

    if ($hasBookColumn !== null) {
        return $hasBookColumn;
    }

    $result = $conn->query("SHOW COLUMNS FROM fluxo_caixa LIKE 'book'");
    $hasBookColumn = ($result && $result->num_rows > 0);
    if ($result) {
        $result->free();
    }

    if ($hasBookColumn) {
        return true;
    }

    // Best-effort para ambientes sem migration aplicada.
    $conn->query("ALTER TABLE fluxo_caixa ADD COLUMN book VARCHAR(100) NOT NULL DEFAULT '' AFTER amount");
    $conn->query("CREATE INDEX idx_fluxo_caixa_book ON fluxo_caixa (book)");

    $result = $conn->query("SHOW COLUMNS FROM fluxo_caixa LIKE 'book'");
    $hasBookColumn = ($result && $result->num_rows > 0);
    if ($result) {
        $result->free();
    }

    return $hasBookColumn;
}

$dados = json_decode(file_get_contents('php://input'), true);
if (!is_array($dados)) {
    responder(["sucesso" => false, "erro" => "Payload JSON inválido."]);
}

$acao = $dados['acao'] ?? '';
$acoesPermitidas = [
    'carregar_perfis',
    'salvar_perfil',
    'excluir_perfil',
    'salvar_aposta',
    'carregar_apostas',
    'excluir_aposta',
    'salvar_fluxo',
    'carregar_fluxo',
    'excluir_fluxo',
    'renomear_casa_historico',
    'salvar_dados_extras',
    'carregar_dados_extras',
    'salvar_categoria',
    'carregar_categorias',
    'excluir_categoria',
    'salvar_casino',
    'carregar_casino',
    'excluir_casino',
];

if (!in_array($acao, $acoesPermitidas, true)) {
    responder(["sucesso" => false, "erro" => "Ação não reconhecida."]);
}

if ($acao === 'carregar_perfis') {
    ensureProfileAccessTable($conn);

    $result = $conn->query("SELECT id, name FROM perfis ORDER BY created_at ASC");
    $perfis = [];

    if ($result) {
        while ($row = $result->fetch_assoc()) {
            $perfis[] = $row;
        }
    }

    if (count($perfis) === 0) {
        $defaultId = 'profile_' . substr(hash('sha256', session_id()), 0, 16);
        $defaultName = 'Perfil Principal';

        $stmt = $conn->prepare("INSERT IGNORE INTO perfis (id, name) VALUES (?, ?)");
        $stmt->bind_param("ss", $defaultId, $defaultName);
        $stmt->execute();
        $stmt->close();

        $stmt = $conn->prepare("INSERT IGNORE INTO profile_access (profile_id, session_id) VALUES (?, ?)");
        $sessionId = session_id();
        $stmt->bind_param("ss", $defaultId, $sessionId);
        $stmt->execute();
        $stmt->close();

        $perfis[] = ['id' => $defaultId, 'name' => $defaultName];
    }

    echo json_encode($perfis, JSON_UNESCAPED_UNICODE);
}

elseif ($acao === 'salvar_perfil') {
    $perfil = $dados['perfil'] ?? null;
    if (!is_array($perfil)) {
        responder(["sucesso" => false, "erro" => "Dados do perfil ausentes."]);
    }

    ensureProfileAccessTable($conn);

    $id = trim((string)($perfil['id'] ?? ''));
    $name = trim((string)($perfil['name'] ?? ''));

    if ($name === '') {
        responder(["sucesso" => false, "erro" => "Nome do perfil é obrigatório."]);
    }

    if ($id === '') {
        $id = 'profile_' . bin2hex(random_bytes(8));
    }

    if (!preg_match('/^[a-zA-Z0-9._-]{1,64}$/', $id)) {
        responder(["sucesso" => false, "erro" => "ID de perfil inválido."]);
    }

    $stmt = $conn->prepare("SELECT id FROM perfis WHERE id = ? LIMIT 1");
    $stmt->bind_param("s", $id);
    $stmt->execute();
    $result = $stmt->get_result();
    $exists = $result && $result->fetch_assoc();
    $stmt->close();

    if ($exists) {
        ensureAuthorizedProfile($conn, $id);
        $stmt = $conn->prepare("UPDATE perfis SET name = ? WHERE id = ?");
        $stmt->bind_param("ss", $name, $id);
        $stmt->execute();
        $stmt->close();
    } else {
        $stmt = $conn->prepare("INSERT INTO perfis (id, name) VALUES (?, ?)");
        $stmt->bind_param("ss", $id, $name);
        $stmt->execute();
        $stmt->close();

        $stmt = $conn->prepare("INSERT INTO profile_access (profile_id, session_id) VALUES (?, ?)");
        $sessionId = session_id();
        $stmt->bind_param("ss", $id, $sessionId);
        $stmt->execute();
        $stmt->close();
    }

    responder([
        "sucesso" => true,
        "perfil" => ["id" => $id, "name" => $name],
    ]);
}

elseif ($acao === 'excluir_perfil') {
    $profile_id = getProfileId($dados);
    ensureAuthorizedProfile($conn, $profile_id);

    $result = $conn->query("SELECT COUNT(*) AS total FROM perfis");
    $row = $result ? $result->fetch_assoc() : null;
    $total = (int)($row['total'] ?? 0);

    if ($total <= 1) {
        responder(["sucesso" => false, "erro" => "Você precisa manter pelo menos um perfil."]);
    }

    $stmt = $conn->prepare("DELETE FROM perfis WHERE id = ?");
    $stmt->bind_param("s", $profile_id);
    $stmt->execute();
    $stmt->close();

    $stmt = $conn->prepare("DELETE FROM profile_access WHERE profile_id = ?");
    $stmt->bind_param("s", $profile_id);
    $stmt->execute();
    $stmt->close();

    responder(["sucesso" => true]);
}

elseif ($acao === 'salvar_aposta') {
    $aposta = $dados['aposta'] ?? null;
    if (!is_array($aposta)) {
        responder(["sucesso" => false, "erro" => "Dados da aposta ausentes."]);
    }

    $profile_id = getProfileId($dados);

    $id = trim((string)($aposta['id'] ?? ''));
    $date = trim((string)($aposta['date'] ?? ''));
    $event = trim((string)($aposta['event'] ?? ''));
    $odds = floatval($aposta['odds'] ?? 0);
    $stake = floatval($aposta['stake'] ?? 0);
    $book = trim((string)($aposta['book'] ?? ''));
    $ai = !empty($aposta['ai']) ? trim((string)$aposta['ai']) : null;
    $status = (string)($aposta['status'] ?? 'pending');
    $isFreebet = !empty($aposta['isFreebet']) ? 1 : 0;
    $category = !empty($aposta['category']) ? trim((string)$aposta['category']) : null;
    $cashoutValue = ($status === 'cashout' && isset($aposta['cashout_value'])) ? floatval($aposta['cashout_value']) : null;

    if ($id === '' || $date === '' || $event === '' || $book === '') {
        responder(["sucesso" => false, "erro" => "Campos obrigatórios em falta (id, date, event, book)."]);
    }
    if ($odds <= 1.0) {
        responder(["sucesso" => false, "erro" => "Odd deve ser maior que 1.0."]);
    }
    if ($stake <= 0) {
        responder(["sucesso" => false, "erro" => "Stake deve ser maior que 0."]);
    }

    $statusPermitidos = ['pending', 'win', 'loss', 'void', 'cashout'];
    if (!in_array($status, $statusPermitidos, true)) {
        $status = 'pending';
    }

    ensureAuthorizedProfile($conn, $profile_id);

    $stmt = $conn->prepare("\n        INSERT INTO apostas (id, profile_id, date, event, odds, stake, book, ai, status, is_freebet, category, cashout_value)\n        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)\n        ON DUPLICATE KEY UPDATE\n            date = VALUES(date),\n            event = VALUES(event),\n            odds = VALUES(odds),\n            stake = VALUES(stake),\n            book = VALUES(book),\n            ai = VALUES(ai),\n            status = VALUES(status),\n            is_freebet = VALUES(is_freebet),\n            category = VALUES(category),\n            cashout_value = VALUES(cashout_value)\n    ");

    if (!$stmt) {
        responder(["sucesso" => false, "erro" => "Erro ao preparar statement da aposta."]);
    }

    $stmt->bind_param(
        "ssssddsssisd",
        $id,
        $profile_id,
        $date,
        $event,
        $odds,
        $stake,
        $book,
        $ai,
        $status,
        $isFreebet,
        $category,
        $cashoutValue
    );

    if ($stmt->execute()) {
        $stmt->close();
        responder(["sucesso" => true, "mensagem" => "Aposta salva na base de dados!"]);
    }

    $erroStmt = $stmt->error;
    $stmt->close();
    responder(["sucesso" => false, "erro" => "Erro ao salvar aposta.", "detalhe" => $erroStmt]);
}

elseif ($acao === 'carregar_apostas') {
    $profile_id = getProfileId($dados);
    ensureAuthorizedProfile($conn, $profile_id);

    $stmt = $conn->prepare("SELECT * FROM apostas WHERE profile_id = ? ORDER BY date DESC");
    $stmt->bind_param("s", $profile_id);
    $stmt->execute();
    $result = $stmt->get_result();

    $apostas = [];
    if ($result) {
        while ($row = $result->fetch_assoc()) {
            $row['isFreebet'] = (bool)($row['is_freebet'] ?? false);
            unset($row['is_freebet']);
            $row['odds'] = (float)$row['odds'];
            $row['stake'] = (float)$row['stake'];
            $row['cashout_value'] = isset($row['cashout_value']) ? (float)$row['cashout_value'] : null;
            $apostas[] = $row;
        }
    }
    $stmt->close();

    echo json_encode($apostas, JSON_UNESCAPED_UNICODE);
}

elseif ($acao === 'excluir_aposta') {
    $id = trim((string)($dados['id'] ?? ''));
    $profile_id = getProfileId($dados);
    ensureAuthorizedProfile($conn, $profile_id);

    if ($id === '') {
        responder(["sucesso" => false, "erro" => "ID da aposta ausente."]);
    }

    $stmt = $conn->prepare("DELETE FROM apostas WHERE id = ? AND profile_id = ?");
    $stmt->bind_param("ss", $id, $profile_id);
    $stmt->execute();
    $stmt->close();

    responder(["sucesso" => true, "mensagem" => "Aposta excluída com sucesso."]);
}

elseif ($acao === 'salvar_fluxo') {
    $fluxo = $dados['fluxo'] ?? null;
    if (!is_array($fluxo)) {
        responder(["sucesso" => false, "erro" => "Dados de fluxo ausentes."]);
    }

    $profile_id = getProfileId($dados);

    $id = trim((string)($fluxo['id'] ?? ''));
    $date = trim((string)($fluxo['date'] ?? ''));
    $type = trim((string)($fluxo['type'] ?? ''));
    $amount = floatval($fluxo['amount'] ?? 0);
    $book = trim((string)($fluxo['book'] ?? ''));
    $note = trim((string)($fluxo['note'] ?? ''));

    if ($id === '' || $date === '') {
        responder(["sucesso" => false, "erro" => "Campos obrigatórios em falta (id, date)."]);
    }
    if ($book === '') {
        responder(["sucesso" => false, "erro" => "⚠️ Casa de aposta é OBRIGATÓRIA. Não pode ser vazia."]);
    }
    if (!in_array($type, ['deposit', 'withdraw'], true)) {
        responder(["sucesso" => false, "erro" => "Tipo deve ser 'deposit' ou 'withdraw'."]);
    }
    if ($amount <= 0) {
        responder(["sucesso" => false, "erro" => "Valor deve ser maior que 0."]);
    }

    ensureAuthorizedProfile($conn, $profile_id);

    $hasBookColumn = fluxoHasBookColumn($conn);

    if ($hasBookColumn) {
        $stmt = $conn->prepare("\n            INSERT INTO fluxo_caixa (id, profile_id, date, type, amount, book, note)\n            VALUES (?, ?, ?, ?, ?, ?, ?)\n            ON DUPLICATE KEY UPDATE\n                date = VALUES(date),\n                type = VALUES(type),\n                amount = VALUES(amount),\n                book = VALUES(book),\n                note = VALUES(note)\n        ");

        if (!$stmt) {
            responder(["sucesso" => false, "erro" => "Erro ao preparar statement do fluxo."]);
        }

        $stmt->bind_param("ssssdss", $id, $profile_id, $date, $type, $amount, $book, $note);
    } else {
        $stmt = $conn->prepare("\n            INSERT INTO fluxo_caixa (id, profile_id, date, type, amount, note)\n            VALUES (?, ?, ?, ?, ?, ?)\n            ON DUPLICATE KEY UPDATE\n                date = VALUES(date),\n                type = VALUES(type),\n                amount = VALUES(amount),\n                note = VALUES(note)\n        ");

        if (!$stmt) {
            responder(["sucesso" => false, "erro" => "Erro ao preparar statement do fluxo."]);
        }

        $stmt->bind_param("ssssds", $id, $profile_id, $date, $type, $amount, $note);
    }

    if ($stmt->execute()) {
        $stmt->close();
        responder(["sucesso" => true]);
    }

    $erroStmt = $stmt->error;
    $stmt->close();
    responder(["sucesso" => false, "erro" => "Erro ao salvar fluxo.", "detalhe" => $erroStmt]);
}

elseif ($acao === 'carregar_fluxo') {
    $profile_id = getProfileId($dados);
    ensureAuthorizedProfile($conn, $profile_id);

    $hasBookColumn = fluxoHasBookColumn($conn);

    if ($hasBookColumn) {
        $stmt = $conn->prepare("SELECT * FROM fluxo_caixa WHERE profile_id = ? ORDER BY date DESC");
    } else {
        $stmt = $conn->prepare("SELECT id, profile_id, date, type, amount, '' AS book, note, created_at FROM fluxo_caixa WHERE profile_id = ? ORDER BY date DESC");
    }

    $stmt->bind_param("s", $profile_id);
    $stmt->execute();
    $result = $stmt->get_result();

    $fluxos = [];
    if ($result) {
        while ($row = $result->fetch_assoc()) {
            $row['amount'] = (float)$row['amount'];
            $row['book'] = $row['book'] ?? '';
            $fluxos[] = $row;
        }
    }
    $stmt->close();

    echo json_encode($fluxos, JSON_UNESCAPED_UNICODE);
}

elseif ($acao === 'excluir_fluxo') {
    $id = trim((string)($dados['id'] ?? ''));
    $profile_id = getProfileId($dados);
    ensureAuthorizedProfile($conn, $profile_id);

    if ($id === '') {
        responder(["sucesso" => false, "erro" => "ID do fluxo ausente."]);
    }

    $stmt = $conn->prepare("DELETE FROM fluxo_caixa WHERE id = ? AND profile_id = ?");
    $stmt->bind_param("ss", $id, $profile_id);
    $stmt->execute();
    $stmt->close();

    responder(["sucesso" => true]);
}

elseif ($acao === 'renomear_casa_historico') {
    $profile_id = getProfileId($dados);
    ensureAuthorizedProfile($conn, $profile_id);

    $old_name = trim((string)($dados['old_name'] ?? ''));
    $new_name = trim((string)($dados['new_name'] ?? ''));

    if ($old_name === '' || $new_name === '') {
        responder(["sucesso" => false, "erro" => "Informe os nomes antigo e novo da casa."]);
    }

    if ($old_name === $new_name) {
        responder([
            "sucesso" => true,
            "mensagem" => "Nenhuma alteração necessária.",
            "apostas_atualizadas" => 0,
            "fluxos_atualizados" => 0,
        ]);
    }

    $stmt = $conn->prepare("UPDATE apostas SET book = ? WHERE profile_id = ? AND book = ?");
    $stmt->bind_param("sss", $new_name, $profile_id, $old_name);
    $stmt->execute();
    $apostasAtualizadas = $stmt->affected_rows;
    $stmt->close();

    $fluxosAtualizados = 0;
    if (fluxoHasBookColumn($conn)) {
        $stmt = $conn->prepare("UPDATE fluxo_caixa SET book = ? WHERE profile_id = ? AND book = ?");
        $stmt->bind_param("sss", $new_name, $profile_id, $old_name);
        $stmt->execute();
        $fluxosAtualizados = $stmt->affected_rows;
        $stmt->close();
    }

    responder([
        "sucesso" => true,
        "mensagem" => "Casa renomeada no histórico.",
        "apostas_atualizadas" => max(0, (int)$apostasAtualizadas),
        "fluxos_atualizados" => max(0, (int)$fluxosAtualizados),
    ]);
}

elseif ($acao === 'salvar_dados_extras') {
    $profile_id = getProfileId($dados);
    ensureAuthorizedProfile($conn, $profile_id);

    $tipo = (string)($dados['tipo'] ?? '');
    $valor = $dados['valor'] ?? '';

    $tiposPermitidos = ['settings', 'goals', 'notes', 'bankroll'];
    if (!in_array($tipo, $tiposPermitidos, true)) {
        responder(["sucesso" => false, "erro" => "Tipo inválido. Permitidos: settings, goals, notes, bankroll."]);
    }

    $colunas = [
        'settings' => 'settings_json',
        'goals' => 'goals_json',
        'notes' => 'notes',
        'bankroll' => 'bankroll',
    ];
    $coluna = $colunas[$tipo];

    ensureDadosExtrasExists($conn, $profile_id);

    $valorStr = is_string($valor) ? $valor : json_encode($valor, JSON_UNESCAPED_UNICODE);
    $stmt = $conn->prepare("UPDATE dados_extras SET $coluna = ? WHERE profile_id = ?");
    $stmt->bind_param("ss", $valorStr, $profile_id);

    if ($stmt->execute()) {
        $stmt->close();
        responder(["sucesso" => true]);
    }

    $erroStmt = $stmt->error;
    $stmt->close();
    responder(["sucesso" => false, "erro" => "Erro ao salvar dados extras.", "detalhe" => $erroStmt]);
}

elseif ($acao === 'carregar_dados_extras') {
    $profile_id = getProfileId($dados);
    ensureAuthorizedProfile($conn, $profile_id);

    $stmt = $conn->prepare("SELECT * FROM dados_extras WHERE profile_id = ?");
    $stmt->bind_param("s", $profile_id);
    $stmt->execute();
    $result = $stmt->get_result();

    if ($result && ($row = $result->fetch_assoc())) {
        $stmt->close();
        responder(["sucesso" => true, "dados" => $row]);
    }

    $stmt->close();
    responder(["sucesso" => false, "erro" => "Nenhum dado encontrado"]);
}

elseif ($acao === 'salvar_categoria') {
    $profile_id = getProfileId($dados);
    ensureAuthorizedProfile($conn, $profile_id);

    $cat = $dados['categoria'] ?? null;
    if (!is_array($cat)) {
        responder(["sucesso" => false, "erro" => "Dados da categoria ausentes."]);
    }

    $id = trim((string)($cat['id'] ?? ''));
    $name = trim((string)($cat['name'] ?? ''));
    $icon = trim((string)($cat['icon'] ?? '*'));
    $sort_order = intval($cat['sort_order'] ?? 0);

    if ($id === '' || $name === '') {
        responder(["sucesso" => false, "erro" => "Campos obrigatórios em falta (id, name)."]);
    }

    $stmt = $conn->prepare("\n        INSERT INTO categorias (id, profile_id, name, icon, sort_order)\n        VALUES (?, ?, ?, ?, ?)\n        ON DUPLICATE KEY UPDATE\n            name = VALUES(name),\n            icon = VALUES(icon),\n            sort_order = VALUES(sort_order)\n    ");
    $stmt->bind_param("ssssi", $id, $profile_id, $name, $icon, $sort_order);

    if ($stmt->execute()) {
        $stmt->close();
        responder(["sucesso" => true, "mensagem" => "Categoria salva!"]);
    }

    $erroStmt = $stmt->error;
    $stmt->close();
    responder(["sucesso" => false, "erro" => "Erro ao salvar categoria.", "detalhe" => $erroStmt]);
}

elseif ($acao === 'carregar_categorias') {
    $profile_id = getProfileId($dados);
    ensureAuthorizedProfile($conn, $profile_id);

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

elseif ($acao === 'excluir_categoria') {
    $id = trim((string)($dados['id'] ?? ''));
    $profile_id = getProfileId($dados);
    ensureAuthorizedProfile($conn, $profile_id);

    if ($id === '') {
        responder(["sucesso" => false, "erro" => "ID da categoria ausente."]);
    }

    $stmt = $conn->prepare("SELECT name FROM categorias WHERE id = ? AND profile_id = ?");
    $stmt->bind_param("ss", $id, $profile_id);
    $stmt->execute();
    $result = $stmt->get_result();
    $catName = null;
    if ($result && ($row = $result->fetch_assoc())) {
        $catName = $row['name'];
    }
    $stmt->close();

    if ($catName !== null) {
        $stmt = $conn->prepare("UPDATE apostas SET category = NULL WHERE profile_id = ? AND category = ?");
        $stmt->bind_param("ss", $profile_id, $catName);
        $stmt->execute();
        $stmt->close();
    }

    $stmt = $conn->prepare("DELETE FROM categorias WHERE id = ? AND profile_id = ?");
    $stmt->bind_param("ss", $id, $profile_id);
    $stmt->execute();
    $stmt->close();

    responder(["sucesso" => true, "mensagem" => "Categoria excluída com sucesso."]);
}

elseif ($acao === 'salvar_casino') {
    $casino = $dados['casino'] ?? null;
    if (!is_array($casino)) {
        responder(["sucesso" => false, "erro" => "Dados do cassino ausentes."]);
    }

    $profile_id = getProfileId($dados);

    $id = trim((string)($casino['id'] ?? ''));
    $date = trim((string)($casino['date'] ?? ''));
    $game = trim((string)($casino['game'] ?? ''));
    $platform = trim((string)($casino['platform'] ?? ''));
    $bet_amount = floatval($casino['bet_amount'] ?? 0);
    $win_amount = floatval($casino['win_amount'] ?? 0);
    $is_free = !empty($casino['is_free']) ? 1 : 0;
    $free_spins = isset($casino['free_spins']) && $casino['free_spins'] !== '' ? intval($casino['free_spins']) : null;
    $spin_bet = isset($casino['spin_bet']) && $casino['spin_bet'] !== '' ? floatval($casino['spin_bet']) : null;
    $ais = !empty($casino['ais']) ? trim((string)$casino['ais']) : null;
    $note = trim((string)($casino['note'] ?? ''));

    if ($id === '' || $date === '' || $game === '') {
        responder(["sucesso" => false, "erro" => "Campos obrigatórios em falta (id, date, game)."]);
    }

    ensureAuthorizedProfile($conn, $profile_id);
    error_log("CASINO DEBUG: id=$id date=$date game=$game");
    error_log("CASINO TABLE EXISTS: " . ($conn->query("SHOW TABLES LIKE 'ganhos_casino'")->num_rows > 0 ? "SIM" : "NÃO"));
    $stmt = $conn->prepare("\n        INSERT INTO ganhos_casino (id, profile_id, date, game, platform, bet_amount, win_amount, is_free, free_spins, spin_bet, ais, note)\n        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)\n        ON DUPLICATE KEY UPDATE\n            date = VALUES(date),\n            game = VALUES(game),\n            platform = VALUES(platform),\n            bet_amount = VALUES(bet_amount),\n            win_amount = VALUES(win_amount),\n            is_free = VALUES(is_free),\n            free_spins = VALUES(free_spins),\n            spin_bet = VALUES(spin_bet),\n            ais = VALUES(ais),\n            note = VALUES(note)\n    ");
    if (!$stmt) {
    error_log("CASINO PREPARE ERROR: " . $conn->error);
    responder(["sucesso" => false, "erro" => "Prepare falhou: " . $conn->error]);
    }
    if (!$stmt) {
        responder(["sucesso" => false, "erro" => "Erro ao preparar statement do cassino."]);
    }
   
    $stmt->bind_param(
        "sssssddiidss",
        $id,
        $profile_id,
        $date,
        $game,
        $platform,
        $bet_amount,
        $win_amount,
        $is_free,
        $free_spins,
        $spin_bet,
        $ais,
        $note
    );

    if ($stmt->execute()) {
        $stmt->close();
        responder(["sucesso" => true, "mensagem" => "Registro de cassino salvo!"]);
    }

    $erroStmt = $stmt->error;
    $stmt->close();
    responder(["sucesso" => false, "erro" => "Erro ao salvar registro de cassino.", "detalhe" => $erroStmt]);
}

elseif ($acao === 'carregar_casino') {
    $profile_id = getProfileId($dados);
    ensureAuthorizedProfile($conn, $profile_id);

    $stmt = $conn->prepare("SELECT * FROM ganhos_casino WHERE profile_id = ? ORDER BY date DESC");
    $stmt->bind_param("s", $profile_id);
    $stmt->execute();
    $result = $stmt->get_result();

    $registros = [];
    if ($result) {
        while ($row = $result->fetch_assoc()) {
            $row['bet_amount'] = (float)$row['bet_amount'];
            $row['win_amount'] = (float)$row['win_amount'];
            $row['is_free'] = (int)($row['is_free'] ?? 0);
            $row['free_spins'] = isset($row['free_spins']) ? (int)$row['free_spins'] : null;
            $row['spin_bet'] = isset($row['spin_bet']) ? (float)$row['spin_bet'] : null;
            $registros[] = $row;
        }
    }
    $stmt->close();

    echo json_encode($registros, JSON_UNESCAPED_UNICODE);
}

elseif ($acao === 'excluir_casino') {
    $id = trim((string)($dados['id'] ?? ''));
    $profile_id = getProfileId($dados);
    ensureAuthorizedProfile($conn, $profile_id);

    if ($id === '') {
        responder(["sucesso" => false, "erro" => "ID do registro ausente."]);
    }

    $stmt = $conn->prepare("DELETE FROM ganhos_casino WHERE id = ? AND profile_id = ?");
    $stmt->bind_param("ss", $id, $profile_id);
    $stmt->execute();
    $stmt->close();

    responder(["sucesso" => true, "mensagem" => "Registro de cassino excluído."]);
}

$conn->close();
?>