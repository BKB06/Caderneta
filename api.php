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

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

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
 * Garante que existe tabela de ownership por sessão.
 */
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

/**
 * Víncula profile_id à sessão atual e impede acesso cruzado.
 */
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
        responder(["sucesso" => false, "erro" => "Não autorizado para este perfil."]);
    }
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
    $profile_id = !empty($dados['profile_id'])
        ? trim((string)$dados['profile_id'])
        : ('profile_' . substr(hash('sha256', session_id()), 0, 16));

    if (!preg_match('/^[a-zA-Z0-9._-]{1,64}$/', $profile_id)) {
        responder(["sucesso" => false, "erro" => "profile_id inválido."]);
    }

    return $profile_id;
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
    'carregar_perfis',
    'salvar_perfil',
    'excluir_perfil',
    'salvar_aposta', 'carregar_apostas', 'excluir_aposta',
    'salvar_fluxo', 'carregar_fluxo', 'excluir_fluxo',
    'salvar_dados_extras', 'carregar_dados_extras',
    'salvar_categoria', 'carregar_categorias', 'excluir_categoria',
    'salvar_casino', 'carregar_casino', 'excluir_casino'
];

if (!in_array($acao, $acoes_permitidas, true)) {
    responder(["sucesso" => false, "erro" => "Ação não reconhecida."]);
}

// ---------------------------------------------------------
// 1. AÇÃO: CARREGAR PERFIS DA SESSÃO
// ---------------------------------------------------------
if ($acao === 'carregar_perfis') {
    ensureProfileAccessTable($conn);

    $sessionId = session_id();
    $stmt = $conn->prepare("SELECT p.id, p.name FROM perfis p INNER JOIN profile_access pa ON pa.profile_id = p.id WHERE pa.session_id = ? ORDER BY p.created_at ASC");
    $stmt->bind_param("s", $sessionId);
    $stmt->execute();
    $result = $stmt->get_result();

    $perfis = [];
    if ($result) {
        while ($row = $result->fetch_assoc()) {
            $perfis[] = $row;
        }
    }
    $stmt->close();

    if (count($perfis) === 0) {
        $defaultId = 'profile_' . substr(hash('sha256', session_id()), 0, 16);
        $defaultName = 'Perfil Principal';

        $stmt = $conn->prepare("INSERT IGNORE INTO perfis (id, name) VALUES (?, ?)");
        $stmt->bind_param("ss", $defaultId, $defaultName);
        $stmt->execute();
        $stmt->close();

        $stmt = $conn->prepare("INSERT IGNORE INTO profile_access (profile_id, session_id) VALUES (?, ?)");
        $stmt->bind_param("ss", $defaultId, $sessionId);
        $stmt->execute();
        $stmt->close();

        $perfis[] = [
            'id' => $defaultId,
            'name' => $defaultName,
        ];
    }

    echo json_encode($perfis, JSON_UNESCAPED_UNICODE);
}

// ---------------------------------------------------------
// 2. AÇÃO: SALVAR OU ATUALIZAR PERFIL
// ---------------------------------------------------------
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

    $sessionId = session_id();

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
        $stmt->bind_param("ss", $id, $sessionId);
        $stmt->execute();
        $stmt->close();
    }

    responder([
        "sucesso" => true,
        "perfil" => ["id" => $id, "name" => $name]
    ]);
}

// ---------------------------------------------------------
// 3. AÇÃO: EXCLUIR PERFIL
// ---------------------------------------------------------
elseif ($acao === 'excluir_perfil') {
    $profile_id = getProfileId($dados);
    ensureAuthorizedProfile($conn, $profile_id);

    $sessionId = session_id();
    $stmt = $conn->prepare("SELECT COUNT(*) AS total FROM profile_access WHERE session_id = ?");
    $stmt->bind_param("s", $sessionId);
    $stmt->execute();
    $result = $stmt->get_result();
    $row = $result ? $result->fetch_assoc() : null;
    $stmt->close();

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

// ---------------------------------------------------------
// 4. AÇÃO: SALVAR OU ATUALIZAR UMA APOSTA
// ---------------------------------------------------------
elseif ($acao === 'salvar_aposta') {
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
    $status_permitidos = ['pending', 'win', 'loss', 'void', 'cashout'];
    if (!in_array($status, $status_permitidos, true)) {
        $status = 'pending';
    }

    $cashout_value = ($status === 'cashout' && isset($aposta['cashout_value'])) ? floatval($aposta['cashout_value']) : null;

    // Garantir que o perfil existe e pertence à sessão atual
    ensureAuthorizedProfile($conn, $profile_id);

    // INSERT ... ON DUPLICATE KEY UPDATE (em vez de REPLACE INTO)
    $stmt = $conn->prepare("
        INSERT INTO apostas (id, profile_id, date, event, odds, stake, book, ai, status, is_freebet, category, cashout_value)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
            date = VALUES(date),
            event = VALUES(event),
            odds = VALUES(odds),
            stake = VALUES(stake),
            book = VALUES(book),
            ai = VALUES(ai),
            status = VALUES(status),
            is_freebet = VALUES(is_freebet),
            category = VALUES(category),
            cashout_value = VALUES(cashout_value)
    ");

    $stmt->bind_param("ssssddsssisd",
        $id, $profile_id, $date, $event,
        $odds, $stake, $book,
        $ai, $status, $isFreebet, $category,
        $cashout_value
    );

    if ($stmt->execute()) {
        responder(["sucesso" => true, "mensagem" => "Aposta salva na base de dados!"]);
    } else {
        responder(["sucesso" => false, "erro" => "Erro ao salvar aposta."]);
    }
}

// ---------------------------------------------------------
// 3. AÇÃO: CARREGAR TODAS AS APOSTAS DE UM PERFIL
// ---------------------------------------------------------
elseif ($acao === 'carregar_apostas') {
    $profile_id = getProfileId($dados);
    ensureAuthorizedProfile($conn, $profile_id);

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
            $row['cashout_value'] = isset($row['cashout_value']) ? (float)$row['cashout_value'] : null;
            $apostas[] = $row;
        }
    }
    $stmt->close();

    echo json_encode($apostas, JSON_UNESCAPED_UNICODE);
}

// ---------------------------------------------------------
// 4. AÇÃO: SALVAR OU ATUALIZAR FLUXO DE CAIXA
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

    ensureAuthorizedProfile($conn, $profile_id);

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
// 5. AÇÃO: CARREGAR FLUXO DE CAIXA
// ---------------------------------------------------------
elseif ($acao === 'carregar_fluxo') {
    $profile_id = getProfileId($dados);
    ensureAuthorizedProfile($conn, $profile_id);

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
// 6. AÇÃO: EXCLUIR APOSTA
// ---------------------------------------------------------
elseif ($acao === 'excluir_aposta') {
    $id = trim($dados['id'] ?? '');
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

// ---------------------------------------------------------
// 7. AÇÃO: EXCLUIR FLUXO DE CAIXA
// ---------------------------------------------------------
elseif ($acao === 'excluir_fluxo') {
    $id = trim($dados['id'] ?? '');
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

// ---------------------------------------------------------
// 8. AÇÃO: SALVAR DADOS EXTRAS (settings, goals, notes, bankroll)
// ---------------------------------------------------------
elseif ($acao === 'salvar_dados_extras') {
    $profile_id = getProfileId($dados);
    ensureAuthorizedProfile($conn, $profile_id);
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
// 9. AÇÃO: CARREGAR DADOS EXTRAS
// ---------------------------------------------------------
elseif ($acao === 'carregar_dados_extras') {
    $profile_id = getProfileId($dados);
    ensureAuthorizedProfile($conn, $profile_id);

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
// 10. AÇÃO: SALVAR CATEGORIA
// ---------------------------------------------------------
elseif ($acao === 'salvar_categoria') {
    $profile_id = getProfileId($dados);
    ensureAuthorizedProfile($conn, $profile_id);
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
// 11. AÇÃO: CARREGAR CATEGORIAS
// ---------------------------------------------------------
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

// ---------------------------------------------------------
// 12. AÇÃO: EXCLUIR CATEGORIA
// ---------------------------------------------------------
elseif ($acao === 'excluir_categoria') {
    $id = trim($dados['id'] ?? '');
    $profile_id = getProfileId($dados);
    ensureAuthorizedProfile($conn, $profile_id);
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

// ---------------------------------------------------------
// 13. AÇÃO: SALVAR OU ATUALIZAR GANHO DE CASSINO
// ---------------------------------------------------------
elseif ($acao === 'salvar_casino') {
    $casino = $dados['casino'] ?? null;
    if (!is_array($casino)) {
        responder(["sucesso" => false, "erro" => "Dados do cassino ausentes."]);
    }

    $profile_id = getProfileId($dados);

    $id         = trim($casino['id'] ?? '');
    $date       = trim($casino['date'] ?? '');
    $game       = trim($casino['game'] ?? '');
    $platform   = trim($casino['platform'] ?? '');
    $bet_amount = floatval($casino['bet_amount'] ?? 0);
    $win_amount = floatval($casino['win_amount'] ?? 0);
    $ais        = !empty($casino['ais']) ? trim($casino['ais']) : null;
    $note       = trim($casino['note'] ?? '');

    if ($id === '' || $date === '' || $game === '') {
        responder(["sucesso" => false, "erro" => "Campos obrigatórios em falta (id, date, game)."]);
    }

    ensureAuthorizedProfile($conn, $profile_id);

    $stmt = $conn->prepare("
        INSERT INTO ganhos_casino (id, profile_id, date, game, platform, bet_amount, win_amount, ais, note)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
            date = VALUES(date),
            game = VALUES(game),
            platform = VALUES(platform),
            bet_amount = VALUES(bet_amount),
            win_amount = VALUES(win_amount),
            ais = VALUES(ais),
            note = VALUES(note)
    ");

    $stmt->bind_param("sssssddss",
        $id, $profile_id, $date, $game,
        $platform, $bet_amount, $win_amount,
        $ais, $note
    );

    if ($stmt->execute()) {
        responder(["sucesso" => true, "mensagem" => "Registro de cassino salvo!"]);
    } else {
        responder(["sucesso" => false, "erro" => "Erro ao salvar registro de cassino."]);
    }
}

// ---------------------------------------------------------
// 14. AÇÃO: CARREGAR GANHOS DE CASSINO
// ---------------------------------------------------------
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
            $registros[] = $row;
        }
    }
    $stmt->close();

    echo json_encode($registros, JSON_UNESCAPED_UNICODE);
}

// ---------------------------------------------------------
// 15. AÇÃO: EXCLUIR GANHO DE CASSINO
// ---------------------------------------------------------
elseif ($acao === 'excluir_casino') {
    $id = trim($dados['id'] ?? '');
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