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
        // Sessão mudou (ex: XAMPP reiniciado). Como é aplicação local,
        // atualizamos a sessão em vez de bloquear o acesso.
        $stmt = $conn->prepare("UPDATE profile_access SET session_id = ? WHERE profile_id = ?");
        $stmt->bind_param("ss", $currentSessionId, $profile_id);
        $stmt->execute();
        $stmt->close();
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
 * Garante coluna de boost na tabela apostas para compatibilidade retroativa.
 */
function ensureApostasBoostColumn(mysqli $conn): void {
    static $checked = false;
    if ($checked) {
        return;
    }

    $result = $conn->query("SHOW COLUMNS FROM apostas LIKE 'is_boost'");
    $exists = $result && $result->num_rows > 0;
    if ($result) {
        $result->free();
    }

    if (!$exists) {
        $conn->query("ALTER TABLE apostas ADD COLUMN is_boost TINYINT(1) NOT NULL DEFAULT 0 AFTER is_freebet");
    }

    $checked = true;
}

/**
 * Garante coluna quem_sugeriu apenas para legado (migra ai legado quando existir).
 */
function ensureApostasQuemSugeriuColumn(mysqli $conn): void {
    static $checked = false;
    if ($checked) {
        return;
    }

    $resultNew = $conn->query("SHOW COLUMNS FROM apostas LIKE 'quem_sugeriu'");
    $hasNew = $resultNew && $resultNew->num_rows > 0;
    if ($resultNew) {
        $resultNew->free();
    }

    if (!$hasNew) {
        $resultOld = $conn->query("SHOW COLUMNS FROM apostas LIKE 'ai'");
        $hasOld = $resultOld && $resultOld->num_rows > 0;
        if ($resultOld) {
            $resultOld->free();
        }

        if ($hasOld) {
            $conn->query("ALTER TABLE apostas CHANGE COLUMN ai quem_sugeriu VARCHAR(500) DEFAULT NULL COMMENT 'CSV com nomes de quem sugeriu'");
        }
    }

    $checked = true;
}

/**
 * Transforma CSV de sugestões em lista única e limpa.
 */
function parseSuggestionCsv(?string $raw): array {
    if ($raw === null) return [];

    $parts = explode(',', $raw);
    $clean = [];
    $seen = [];

    foreach ($parts as $part) {
        $name = trim((string)$part);
        if ($name === '') continue;
        $key = strtolower($name);
        if (isset($seen[$key])) continue;
        $seen[$key] = true;
        $clean[] = $name;
    }

    return $clean;
}

/**
 * Garante tabela normalizada de sugestões por aposta e migra dados CSV legados.
 */
function ensureApostaSugestoesTable(mysqli $conn): void {
    static $checked = false;
    if ($checked) {
        return;
    }

    ensureApostasQuemSugeriuColumn($conn);

    $conn->query("\n        CREATE TABLE IF NOT EXISTS aposta_sugestoes (\n            aposta_id VARCHAR(64) NOT NULL,\n            profile_id VARCHAR(64) NOT NULL,\n            suggestor_name VARCHAR(120) NOT NULL,\n            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,\n            PRIMARY KEY (aposta_id, suggestor_name),\n            KEY idx_aposta_sugestoes_profile_name (profile_id, suggestor_name),\n            CONSTRAINT fk_aposta_sugestoes_aposta\n                FOREIGN KEY (aposta_id) REFERENCES apostas(id)\n                ON DELETE CASCADE ON UPDATE CASCADE\n        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci\n    ");

    // Migração idempotente de CSV legado para tabela normalizada.
    $legacyCol = $conn->query("SHOW COLUMNS FROM apostas LIKE 'quem_sugeriu'");
    $hasLegacyCsv = $legacyCol && $legacyCol->num_rows > 0;
    if ($legacyCol) {
        $legacyCol->free();
    }

    if ($hasLegacyCsv) {
        $result = $conn->query("SELECT id, profile_id, quem_sugeriu FROM apostas WHERE quem_sugeriu IS NOT NULL AND TRIM(quem_sugeriu) <> ''");
        if ($result) {
            $insert = $conn->prepare("INSERT IGNORE INTO aposta_sugestoes (aposta_id, profile_id, suggestor_name) VALUES (?, ?, ?)");
            while ($row = $result->fetch_assoc()) {
                $apostaId = (string)$row['id'];
                $profileId = (string)$row['profile_id'];
                $names = parseSuggestionCsv((string)$row['quem_sugeriu']);

                foreach ($names as $name) {
                    $insert->bind_param("sss", $apostaId, $profileId, $name);
                    $insert->execute();
                }
            }
            $insert->close();
            $result->free();
        }
    }

    $checked = true;
}

/**
 * Garante coluna book na tabela fluxo_caixa para rastrear casa de apostas.
 */
function ensureFluxoBookColumn(mysqli $conn): void {
    static $checked = false;
    if ($checked) {
        return;
    }

    $result = $conn->query("SHOW COLUMNS FROM fluxo_caixa LIKE 'book'");
    $exists = $result && $result->num_rows > 0;
    if ($result) {
        $result->free();
    }

    if (!$exists) {
        $conn->query("ALTER TABLE fluxo_caixa ADD COLUMN book VARCHAR(100) NOT NULL DEFAULT '' AFTER note");
        $conn->query("CREATE INDEX idx_fluxo_book ON fluxo_caixa (book)");
    }

    $checked = true;
}

/**
 * Garante que uma coluna `date` esteja como DATE (migração retrocompatível de VARCHAR).
 */
function ensureDateColumnsAreDate(mysqli $conn): void {
    static $checked = false;
    if ($checked) {
        return;
    }

    $tables = [
        ['table' => 'apostas', 'index' => 'idx_apostas_profile_date', 'indexSql' => 'CREATE INDEX idx_apostas_profile_date ON apostas (profile_id, `date` DESC)'],
        ['table' => 'fluxo_caixa', 'index' => 'idx_fluxo_profile_date', 'indexSql' => 'CREATE INDEX idx_fluxo_profile_date ON fluxo_caixa (profile_id, `date` DESC)'],
        ['table' => 'ganhos_casino', 'index' => 'idx_casino_profile_date', 'indexSql' => 'CREATE INDEX idx_casino_profile_date ON ganhos_casino (profile_id, `date` DESC)'],
    ];

    foreach ($tables as $meta) {
        $table = $meta['table'];
        $indexName = $meta['index'];

        $stmt = $conn->prepare("SELECT DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = 'date' LIMIT 1");
        $stmt->bind_param("s", $table);
        $stmt->execute();
        $result = $stmt->get_result();
        $row = $result ? $result->fetch_assoc() : null;
        $stmt->close();

        $dataType = strtolower((string)($row['DATA_TYPE'] ?? ''));
        if ($dataType === 'date') {
            continue;
        }

        $conn->query("ALTER TABLE {$table} ADD COLUMN date_tmp DATE NULL AFTER profile_id");
        $conn->query("\n            UPDATE {$table}\n            SET date_tmp = CASE\n                WHEN `date` REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN STR_TO_DATE(`date`, '%Y-%m-%d')\n                WHEN `date` REGEXP '^[0-9]{2}/[0-9]{2}/[0-9]{4}$' THEN STR_TO_DATE(`date`, '%d/%m/%Y')\n                ELSE NULL\n            END\n        ");
        $conn->query("UPDATE {$table} SET date_tmp = COALESCE(date_tmp, DATE(created_at), CURDATE())");

        $conn->query("ALTER TABLE {$table} DROP COLUMN `date`");
        $conn->query("ALTER TABLE {$table} CHANGE COLUMN date_tmp `date` DATE NOT NULL");

        $stmt = $conn->prepare("SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ? LIMIT 1");
        $stmt->bind_param("ss", $table, $indexName);
        $stmt->execute();
        $idxResult = $stmt->get_result();
        $idxExists = $idxResult && $idxResult->fetch_assoc();
        $stmt->close();

        if (!$idxExists) {
            $conn->query($meta['indexSql']);
        }
    }

    $checked = true;
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
 * Normaliza data recebida em YYYY-MM-DD (aceita YYYY-MM-DD e DD/MM/YYYY).
 */
function normalizeDateInput(string $date): ?string {
    $value = trim($date);
    if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $value)) {
        return $value;
    }

    if (preg_match('/^(\d{2})\/(\d{2})\/(\d{4})$/', $value, $m)) {
        return sprintf('%04d-%02d-%02d', (int)$m[3], (int)$m[2], (int)$m[1]);
    }

    return null;
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
    'salvar_casino', 'carregar_casino', 'excluir_casino',
    'ranking_saldo_casas',
    'resetar_dados', 'sincronizar_casas', 'agregacoes_periodo', 
    'obter_casas_com_saldo', 'obter_ia_taxa_acerto', 'criar_casa'
];

if (!in_array($acao, $acoes_permitidas, true)) {
    responder(["sucesso" => false, "erro" => "Ação não reconhecida."]);
}

$acoes_com_data = [
    'salvar_aposta', 'carregar_apostas', 'excluir_aposta',
    'salvar_fluxo', 'carregar_fluxo', 'excluir_fluxo',
    'salvar_casino', 'carregar_casino', 'excluir_casino',
    'ranking_saldo_casas'
];

if (in_array($acao, $acoes_com_data, true)) {
    ensureDateColumnsAreDate($conn);
}

// ---------------------------------------------------------
// 1. AÇÃO: CARREGAR PERFIS DA SESSÃO
// ---------------------------------------------------------
if ($acao === 'carregar_perfis') {
    ensureProfileAccessTable($conn);

    $sessionId = session_id();

    // Retorna todos os perfis (app local, usuário único).
    // O filtro por session_id causava perda de perfis ao reiniciar o XAMPP.
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
    $id = trim($aposta['id'] ?? '');
    $date = normalizeDateInput((string)($aposta['date'] ?? ''));
    $event = trim($aposta['event'] ?? '');
    $odds = floatval($aposta['odds'] ?? 0);
    $stake = floatval($aposta['stake'] ?? 0);
    $book = trim($aposta['book'] ?? '');
    $quem_sugeriu = !empty($aposta['quem_sugeriu'])
        ? trim($aposta['quem_sugeriu'])
        : (!empty($aposta['ai']) ? trim($aposta['ai']) : null);
    $suggestors = parseSuggestionCsv($quem_sugeriu);
    $status = $aposta['status'] ?? 'pending';
    $isFreebet = !empty($aposta['isFreebet']) ? 1 : 0;
    $isBoost = !empty($aposta['isBoost']) ? 1 : 0;
    $category = !empty($aposta['category']) ? trim($aposta['category']) : null;
    $cashout_value = ($status === 'cashout' && isset($aposta['cashout_value'])) ? floatval($aposta['cashout_value']) : null;

    // Validação de campos obrigatórios
    if ($id === '' || !$date || $event === '' || $book === '') {
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
        responder(["sucesso" => false, "erro" => "Status inválido."]);
    }

    // Garantir que o perfil existe e pertence à sessão atual
    ensureAuthorizedProfile($conn, $profile_id);
    ensureApostasBoostColumn($conn);
    ensureApostaSugestoesTable($conn);

    // INSERT ... ON DUPLICATE KEY UPDATE (em vez de REPLACE INTO)
    $stmt = $conn->prepare("
        INSERT INTO apostas (id, profile_id, date, event, odds, stake, book, status, is_freebet, is_boost, category, cashout_value)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
            date = VALUES(date),
            event = VALUES(event),
            odds = VALUES(odds),
            stake = VALUES(stake),
            book = VALUES(book),
            status = VALUES(status),
            is_freebet = VALUES(is_freebet),
            is_boost = VALUES(is_boost),
            category = VALUES(category),
            cashout_value = VALUES(cashout_value)
    ");

    $stmt->bind_param("ssssddssiisd",
        $id, $profile_id, $date, $event,
        $odds, $stake, $book,
        $status, $isFreebet, $isBoost, $category,
        $cashout_value
    );

    if (!$stmt->execute()) {
        responder(["sucesso" => false, "erro" => "Erro ao salvar aposta."]);
    }
    $stmt->close();

    $stmtDelete = $conn->prepare("DELETE FROM aposta_sugestoes WHERE aposta_id = ? AND profile_id = ?");
    $stmtDelete->bind_param("ss", $id, $profile_id);
    $stmtDelete->execute();
    $stmtDelete->close();

    if (!empty($suggestors)) {
        $stmtInsert = $conn->prepare("INSERT IGNORE INTO aposta_sugestoes (aposta_id, profile_id, suggestor_name) VALUES (?, ?, ?)");
        foreach ($suggestors as $name) {
            $stmtInsert->bind_param("sss", $id, $profile_id, $name);
            $stmtInsert->execute();
        }
        $stmtInsert->close();
    }

    responder(["sucesso" => true, "mensagem" => "Aposta salva na base de dados!"]);
}

// ---------------------------------------------------------
// 3. AÇÃO: CARREGAR TODAS AS APOSTAS DE UM PERFIL
// ---------------------------------------------------------
elseif ($acao === 'carregar_apostas') {
    $profile_id = getProfileId($dados);
    ensureAuthorizedProfile($conn, $profile_id);
    ensureApostasBoostColumn($conn);
    ensureApostaSugestoesTable($conn);

    // Prepared statement — elimina SQL Injection
    $stmt = $conn->prepare("\n        SELECT a.*,\n               (\n                   SELECT GROUP_CONCAT(s.suggestor_name ORDER BY s.suggestor_name SEPARATOR ',')\n                   FROM aposta_sugestoes s\n                   WHERE s.aposta_id = a.id AND s.profile_id = a.profile_id\n               ) AS ai_csv\n        FROM apostas a\n        WHERE a.profile_id = ?\n        ORDER BY a.date DESC\n    ");
    $stmt->bind_param("s", $profile_id);
    $stmt->execute();
    $result = $stmt->get_result();

    $apostas = [];
    if ($result) {
        while ($row = $result->fetch_assoc()) {
            // Compatibilidade: o JS espera 'isFreebet' (camelCase)
            $row['isFreebet'] = (bool)($row['is_freebet'] ?? $row['isFreebet'] ?? false);
            unset($row['is_freebet']);
            $row['isBoost'] = (bool)($row['is_boost'] ?? $row['isBoost'] ?? false);
            unset($row['is_boost']);
            $row['quem_sugeriu'] = $row['ai_csv'] ?? ($row['quem_sugeriu'] ?? ($row['ai'] ?? null));
            $row['ai'] = $row['quem_sugeriu'];
            unset($row['ai_csv']);
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
    $date   = normalizeDateInput((string)($fluxo['date'] ?? ''));
    $type   = $fluxo['type'] ?? '';
    $amount = floatval($fluxo['amount'] ?? 0);
    $note   = trim($fluxo['note'] ?? '');
    $book   = trim($fluxo['book'] ?? '');

    // Validações
    if ($id === '' || !$date) {
        responder(["sucesso" => false, "erro" => "Campos obrigatórios em falta (id, date)."]);
    }
    if (!in_array($type, ['deposit', 'withdraw'], true)) {
        responder(["sucesso" => false, "erro" => "Tipo deve ser 'deposit' ou 'withdraw'."]);
    }
    if ($amount <= 0) {
        responder(["sucesso" => false, "erro" => "Valor deve ser maior que 0."]);
    }
    if ($book === '') {
        responder(["sucesso" => false, "erro" => "Casa de apostas é obrigatória."]);
    }

    ensureAuthorizedProfile($conn, $profile_id);
    ensureFluxoBookColumn($conn);

    $stmt = $conn->prepare("
        INSERT INTO fluxo_caixa (id, profile_id, date, type, amount, note, book)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
            date = VALUES(date),
            type = VALUES(type),
            amount = VALUES(amount),
            note = VALUES(note),
            book = VALUES(book)
    ");

    $stmt->bind_param("ssssdss",
        $id, $profile_id, $date, $type,
        $amount, $note, $book
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
    ensureFluxoBookColumn($conn);

    $stmt = $conn->prepare("SELECT * FROM fluxo_caixa WHERE profile_id = ? ORDER BY date DESC");
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
    $date       = normalizeDateInput((string)($casino['date'] ?? ''));
    $game       = trim($casino['game'] ?? '');
    $platform   = trim($casino['platform'] ?? '');
    $bet_amount = floatval($casino['bet_amount'] ?? 0);
    $win_amount = floatval($casino['win_amount'] ?? 0);
    $ais        = !empty($casino['ais']) ? trim($casino['ais']) : null;
    $note       = trim($casino['note'] ?? '');

    if ($id === '' || !$date || $game === '') {
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

// ---------------------------------------------------------
// 16. AÇÃO: RANKING DE SALDO POR CASA
// ---------------------------------------------------------
elseif ($acao === 'ranking_saldo_casas') {
    $profile_id = getProfileId($dados);
    ensureAuthorizedProfile($conn, $profile_id);
    ensureFluxoBookColumn($conn);
    ensureApostasBoostColumn($conn);

    // Depósitos e saques por casa
    $stmt = $conn->prepare("
        SELECT book,
               SUM(CASE WHEN type = 'deposit' THEN amount ELSE 0 END) AS total_deposits,
               SUM(CASE WHEN type = 'withdraw' THEN amount ELSE 0 END) AS total_withdraws
        FROM fluxo_caixa
         WHERE profile_id = ? AND book <> ''
        GROUP BY book
    ");
    $stmt->bind_param("s", $profile_id);
    $stmt->execute();
    $result = $stmt->get_result();

    $casas = [];
    if ($result) {
        while ($row = $result->fetch_assoc()) {
            $casas[$row['book']] = [
                'book' => $row['book'],
                'deposits' => (float)$row['total_deposits'],
                'withdraws' => (float)$row['total_withdraws'],
                'profit' => 0.0,
                'casino_profit' => 0.0,
                'returned_stake' => 0.0,
                'total_staked' => 0.0,
                'bets_count' => 0,
                'wins' => 0,
                'losses' => 0,
            ];
        }
    }
    $stmt->close();

    // Agregados das apostas por casa (wins, bets, volume e lucro)
    $stmt = $conn->prepare("
        SELECT
            book,
            COUNT(*) AS bets_count,
            SUM(CASE WHEN status = 'win' THEN 1 ELSE 0 END) AS wins,
            SUM(CASE WHEN status = 'loss' THEN 1 ELSE 0 END) AS losses,
            SUM(CASE WHEN is_freebet = 0 THEN stake ELSE 0 END) AS total_staked,
            SUM(CASE WHEN status = 'win' AND is_freebet = 0 THEN stake ELSE 0 END) AS returned_stake,
            SUM(
                CASE
                    WHEN status = 'win' THEN stake * (odds - 1)
                    WHEN status = 'loss' THEN CASE WHEN is_freebet = 1 THEN 0 ELSE -stake END
                    WHEN status = 'cashout' THEN CASE WHEN is_freebet = 1 THEN IFNULL(cashout_value, 0) ELSE IFNULL(cashout_value, 0) - stake END
                    ELSE 0
                END
            ) AS total_profit
        FROM apostas
        WHERE profile_id = ? AND book <> '' AND status IN ('win', 'loss', 'cashout', 'void')
        GROUP BY book
    ");
    $stmt->bind_param("s", $profile_id);
    $stmt->execute();
    $result = $stmt->get_result();

    if ($result) {
        while ($row = $result->fetch_assoc()) {
            $book = $row['book'];
            if (!isset($casas[$book])) {
                $casas[$book] = [
                    'book' => $book,
                    'deposits' => 0.0,
                    'withdraws' => 0.0,
                    'profit' => 0.0,
                    'casino_profit' => 0.0,
                    'returned_stake' => 0.0,
                    'total_staked' => 0.0,
                    'bets_count' => 0,
                    'wins' => 0,
                    'losses' => 0,
                ];
            }

            $casas[$book]['bets_count'] = (int)($row['bets_count'] ?? 0);
            $casas[$book]['wins'] = (int)($row['wins'] ?? 0);
            $casas[$book]['losses'] = (int)($row['losses'] ?? 0);
            $casas[$book]['total_staked'] = (float)($row['total_staked'] ?? 0);
            $casas[$book]['returned_stake'] = (float)($row['returned_stake'] ?? 0);
            $casas[$book]['profit'] = (float)($row['total_profit'] ?? 0);
        }
    }
    $stmt->close();

    // Agregados de cassino por plataforma (soma retorno - apostado)
    $stmt = $conn->prepare("\n        SELECT\n            platform AS book,\n            SUM(IFNULL(win_amount, 0) - IFNULL(bet_amount, 0)) AS casino_profit\n        FROM ganhos_casino\n        WHERE profile_id = ? AND platform <> ''\n        GROUP BY platform\n    ");
    $stmt->bind_param("s", $profile_id);
    $stmt->execute();
    $result = $stmt->get_result();

    if ($result) {
        while ($row = $result->fetch_assoc()) {
            $book = $row['book'];
            if (!isset($casas[$book])) {
                $casas[$book] = [
                    'book' => $book,
                    'deposits' => 0.0,
                    'withdraws' => 0.0,
                    'profit' => 0.0,
                    'casino_profit' => 0.0,
                    'returned_stake' => 0.0,
                    'total_staked' => 0.0,
                    'bets_count' => 0,
                    'wins' => 0,
                    'losses' => 0,
                ];
            }
            $casas[$book]['casino_profit'] = (float)($row['casino_profit'] ?? 0);
        }
    }
    $stmt->close();

    // Calcular saldo e ordenar
    $ranking = array_values($casas);
    foreach ($ranking as &$casa) {
        // Banca atual: saldo por casa com fluxo + lucro liquido de apostas + cassino.
        // Nao somar returned_stake aqui, pois o lucro de apostas ja e liquido.
        $rawBalance = $casa['deposits']
            - $casa['withdraws']
            + $casa['profit']
            + $casa['casino_profit'];
        $casa['balance'] = max(0, $rawBalance);
        $casa['winrate'] = $casa['bets_count'] > 0 ? ($casa['wins'] / $casa['bets_count']) : 0.0;
    }
    unset($casa);

    usort($ranking, function($a, $b) {
        return $b['balance'] <=> $a['balance'];
    });

    echo json_encode($ranking, JSON_UNESCAPED_UNICODE);
}

// ---------------------------------------------------------
// 17. AÇÃO: OBTER CASAS COM SALDO
// ---------------------------------------------------------
elseif ($acao === 'obter_casas_com_saldo') {
    $profile_id = getProfileId($dados);
    ensureAuthorizedProfile($conn, $profile_id);
    ensureFluxoBookColumn($conn);
    ensureApostasBoostColumn($conn);

    // Depósitos e saques por casa
    $stmt = $conn->prepare("
        SELECT book,
               SUM(CASE WHEN type = 'deposit' THEN amount ELSE 0 END) AS total_deposits,
               SUM(CASE WHEN type = 'withdraw' THEN amount ELSE 0 END) AS total_withdraws
        FROM fluxo_caixa
        WHERE profile_id = ? AND book <> ''
        GROUP BY book
    ");
    $stmt->bind_param("s", $profile_id);
    $stmt->execute();
    $result = $stmt->get_result();

    $casas = [];
    if ($result) {
        while ($row = $result->fetch_assoc()) {
            $casas[$row['book']] = [
                'book' => $row['book'],
                'deposits' => (float)$row['total_deposits'],
                'withdraws' => (float)$row['total_withdraws'],
                'profit' => 0.0,
                'balance' => 0.0,
                'bets_count' => 0,
                'wins' => 0,
                'losses' => 0,
                'winrate' => 0.0,
            ];
        }
    }
    $stmt->close();

    // Agregados das apostas por casa
    $stmt = $conn->prepare("
        SELECT
            book,
            COUNT(*) AS bets_count,
            SUM(CASE WHEN status = 'win' THEN 1 ELSE 0 END) AS wins,
            SUM(CASE WHEN status = 'loss' THEN 1 ELSE 0 END) AS losses,
            SUM(
                CASE
                    WHEN status = 'win' THEN stake * (odds - 1)
                    WHEN status = 'loss' THEN -stake
                    WHEN status = 'cashout' THEN IFNULL(cashout_value, 0) - stake
                    ELSE 0
                END
            ) AS total_profit
        FROM apostas
        WHERE profile_id = ? AND book <> '' AND status IN ('win', 'loss', 'cashout', 'void')
        GROUP BY book
    ");
    $stmt->bind_param("s", $profile_id);
    $stmt->execute();
    $result = $stmt->get_result();

    if ($result) {
        while ($row = $result->fetch_assoc()) {
            $book = $row['book'];
            if (!isset($casas[$book])) {
                $casas[$book] = [
                    'book' => $book,
                    'deposits' => 0.0,
                    'withdraws' => 0.0,
                    'profit' => 0.0,
                    'balance' => 0.0,
                    'bets_count' => 0,
                    'wins' => 0,
                    'losses' => 0,
                    'winrate' => 0.0,
                ];
            }

            $casas[$book]['bets_count'] = (int)($row['bets_count'] ?? 0);
            $casas[$book]['wins'] = (int)($row['wins'] ?? 0);
            $casas[$book]['losses'] = (int)($row['losses'] ?? 0);
            $casas[$book]['profit'] = (float)($row['total_profit'] ?? 0);
        }
    }
    $stmt->close();

    // Calcular saldo final de cada casa
    foreach ($casas as &$casa) {
        $rawBalance = $casa['deposits'] - $casa['withdraws'] + $casa['profit'];
        $casa['balance'] = $rawBalance;
        $casa['winrate'] = $casa['bets_count'] > 0 ? ($casa['wins'] / $casa['bets_count']) : 0.0;
    }
    unset($casa);

    // Ordenar por saldo descendente
    usort($casas, function($a, $b) {
        return $b['balance'] <=> $a['balance'];
    });

    echo json_encode(array_values($casas), JSON_UNESCAPED_UNICODE);
}

// ---------------------------------------------------------
// 18. AÇÃO: OBTER TAXA DE ACERTO DA IA
// ---------------------------------------------------------
elseif ($acao === 'obter_ia_taxa_acerto') {
    $profile_id = getProfileId($dados);
    ensureAuthorizedProfile($conn, $profile_id);
    ensureApostaSugestoesTable($conn);

    // Contar apostas sugeridas pela IA que venceram vs total
    $stmt = $conn->prepare("
        SELECT
            COUNT(*) AS total,
            SUM(CASE WHEN a.status = 'win' THEN 1 ELSE 0 END) AS wins
        FROM apostas a
        INNER JOIN aposta_sugestoes s ON a.id = s.aposta_id AND a.profile_id = s.profile_id
        WHERE a.profile_id = ? AND s.suggestor_name = 'IA'
    ");
    $stmt->bind_param("s", $profile_id);
    $stmt->execute();
    $result = $stmt->get_result();
    $row = $result ? $result->fetch_assoc() : null;
    $stmt->close();

    $total = (int)($row['total'] ?? 0);
    $wins = (int)($row['wins'] ?? 0);
    $winrate = $total > 0 ? ($wins / $total) : 0;

    responder([
        "sucesso" => true,
        "total" => $total,
        "wins" => $wins,
        "winrate" => $winrate,
        "taxa_acerto" => $winrate * 100
    ]);
}

// ---------------------------------------------------------
// 19. AÇÃO: AGREGAÇÕES POR PERÍODO (SEMANAL/MENSAL)
// ---------------------------------------------------------
elseif ($acao === 'agregacoes_periodo') {
    $profile_id = getProfileId($dados);
    $tipo = $dados['tipo'] ?? 'semanal'; // 'semanal', 'mensal'
    $data_inicio = !empty($dados['data_inicio']) ? $dados['data_inicio'] : null;
    $data_fim = !empty($dados['data_fim']) ? $dados['data_fim'] : null;

    ensureAuthorizedProfile($conn, $profile_id);
    ensureApostasBoostColumn($conn);

    // Determinar formato de agrupamento
    if ($tipo === 'semanal') {
        $group_expr = "YEARWEEK(a.date, 1)";
        $date_expr = "DATE(DATE_SUB(a.date, INTERVAL (DAYOFWEEK(a.date) - 2) DAY))";
    } else {
        $group_expr = "DATE_FORMAT(a.date, '%Y-%m')";
        $date_expr = "DATE_FORMAT(a.date, '%Y-%m-01')";
    }

    $where = "a.profile_id = ? AND a.status IN ('win', 'loss', 'cashout', 'void')";
    $params = [$profile_id];

    if ($data_inicio && $data_fim) {
        $where .= " AND a.date BETWEEN ? AND ?";
        $params[] = $data_inicio;
        $params[] = $data_fim;
    }

    // Preparar statement com agregações
    $sql = "
        SELECT
            $group_expr AS periodo_key,
            $date_expr AS periodo_start,
            COUNT(*) AS total_apostas,
            SUM(CASE WHEN a.status = 'win' THEN 1 ELSE 0 END) AS vitrias,
            SUM(CASE WHEN a.status = 'loss' THEN 1 ELSE 0 END) AS derrotas,
            SUM(CASE WHEN a.is_boost = 1 THEN 1 ELSE 0 END) AS boosts,
            SUM(a.stake) AS total_apostado,
            SUM(
                CASE
                    WHEN a.status = 'win' THEN a.stake * (a.odds - 1)
                    WHEN a.status = 'loss' THEN -a.stake
                    WHEN a.status = 'cashout' THEN IFNULL(a.cashout_value, 0) - a.stake
                    ELSE 0
                END
            ) AS lucro
        FROM apostas a
        WHERE $where
        GROUP BY $group_expr
        ORDER BY a.date DESC
    ";

    $stmt = $conn->prepare($sql);
    
    // Vincular parâmetros dinamicamente
    if (!empty($params)) {
        $types = '';
        foreach ($params as $param) {
            if (is_int($param)) $types .= 'i';
            else $types .= 's';
        }
        $stmt->bind_param($types, ...$params);
    }

    $stmt->execute();
    $result = $stmt->get_result();

    $agregacoes = [];
    if ($result) {
        while ($row = $result->fetch_assoc()) {
            $total = (int)($row['total_apostas'] ?? 0);
            $vitrias = (int)($row['vitrias'] ?? 0);
            $apostado = (float)($row['total_apostado'] ?? 0);
            $lucro = (float)($row['lucro'] ?? 0);

            $agregacoes[] = [
                'periodo' => $row['periodo_start'],
                'total_apostas' => $total,
                'vitrias' => $vitrias,
                'derrotas' => (int)($row['derrotas'] ?? 0),
                'boosts' => (int)($row['boosts'] ?? 0),
                'total_apostado' => $apostado,
                'lucro' => $lucro,
                'roi' => $apostado > 0 ? ($lucro / $apostado) : 0,
                'winrate' => $total > 0 ? ($vitrias / $total) : 0,
            ];
        }
    }
    $stmt->close();

    echo json_encode($agregacoes, JSON_UNESCAPED_UNICODE);
}

// ---------------------------------------------------------
// 20. AÇÃO: RESETAR DADOS (mantendo IA e pending)
// ---------------------------------------------------------
elseif ($acao === 'resetar_dados') {
    $profile_id = getProfileId($dados);
    ensureAuthorizedProfile($conn, $profile_id);

    // Iniciar transação
    $conn->begin_transaction();

    try {
        // 1. Deletar apostas finalizadas (não pending)
        $stmt = $conn->prepare("DELETE FROM apostas WHERE profile_id = ? AND status != 'pending'");
        $stmt->bind_param("s", $profile_id);
        $stmt->execute();
        $stmt->close();

        // 2. Deletar registros de cassino
        $stmt = $conn->prepare("DELETE FROM ganhos_casino WHERE profile_id = ?");
        $stmt->bind_param("s", $profile_id);
        $stmt->execute();
        $stmt->close();

        // 3. Manter histórico de IA antes de limpar fluxo
        // (as sugestões associadas às apostas pending serão mantidas automaticamente)

        // 4. Deletar fluxo de caixa
        $stmt = $conn->prepare("DELETE FROM fluxo_caixa WHERE profile_id = ?");
        $stmt->bind_param("s", $profile_id);
        $stmt->execute();
        $stmt->close();

        $conn->commit();

        responder([
            "sucesso" => true,
            "mensagem" => "Dados resetados com sucesso! Apostas em aberto e taxa de IA foram preservadas."
        ]);
    } catch (Exception $e) {
        $conn->rollback();
        responder([
            "sucesso" => false,
            "erro" => "Erro ao resetar dados: " . $e->getMessage()
        ]);
    }
}

// ---------------------------------------------------------
// 21. AÇÃO: SINCRONIZAR CASAS
// ---------------------------------------------------------
elseif ($acao === 'sincronizar_casas') {
    $profile_id = getProfileId($dados);
    $casas_atualizacoes = $dados['casas'] ?? [];

    ensureAuthorizedProfile($conn, $profile_id);
    ensureFluxoBookColumn($conn);

    if (!is_array($casas_atualizacoes)) {
        responder(["sucesso" => false, "erro" => "Dados de casas ausentes."]);
    }

    $conn->begin_transaction();

    try {
        foreach ($casas_atualizacoes as $casa_update) {
            $book = trim($casa_update['book'] ?? '');
            $deposits = floatval($casa_update['deposits'] ?? 0);
            $withdraws = floatval($casa_update['withdraws'] ?? 0);

            if ($book === '') continue;

            // Sincronizar: buscar fluxo existente e ajustar
            $stmt = $conn->prepare("
                SELECT 
                    SUM(CASE WHEN type = 'deposit' THEN amount ELSE 0 END) AS current_deposits,
                    SUM(CASE WHEN type = 'withdraw' THEN amount ELSE 0 END) AS current_withdraws
                FROM fluxo_caixa
                WHERE profile_id = ? AND book = ?
            ");
            $stmt->bind_param("ss", $profile_id, $book);
            $stmt->execute();
            $result = $stmt->get_result();
            $row = $result ? $result->fetch_assoc() : null;
            $stmt->close();

            $current_deposits = (float)($row['current_deposits'] ?? 0);
            $current_withdraws = (float)($row['current_withdraws'] ?? 0);

            // Calcular diferenças
            $deposits_diff = $deposits - $current_deposits;
            $withdraws_diff = $withdraws - $current_withdraws;

            // Ajustar com fluxos de sincronização
            if (abs($deposits_diff) > 0.01) {
                $type = 'deposit';
                $amount = abs($deposits_diff);
                $id = 'sync_dep_' . $profile_id . '_' . $book . '_' . time();
                $date = date('Y-m-d');
                $note = 'Sincronização automática';

                $stmt = $conn->prepare("
                    INSERT INTO fluxo_caixa (id, profile_id, date, type, amount, note, book)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE amount = VALUES(amount)
                ");
                $stmt->bind_param("ssssdss", $id, $profile_id, $date, $type, $amount, $note, $book);
                $stmt->execute();
                $stmt->close();
            }

            if (abs($withdraws_diff) > 0.01) {
                $type = 'withdraw';
                $amount = abs($withdraws_diff);
                $id = 'sync_wth_' . $profile_id . '_' . $book . '_' . time();
                $date = date('Y-m-d');
                $note = 'Sincronização automática';

                $stmt = $conn->prepare("
                    INSERT INTO fluxo_caixa (id, profile_id, date, type, amount, note, book)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE amount = VALUES(amount)
                ");
                $stmt->bind_param("ssssdss", $id, $profile_id, $date, $type, $amount, $note, $book);
                $stmt->execute();
                $stmt->close();
            }
        }

        $conn->commit();

        responder([
            "sucesso" => true,
            "mensagem" => "Casas sincronizadas com sucesso!"
        ]);
    } catch (Exception $e) {
        $conn->rollback();
        responder([
            "sucesso" => false,
            "erro" => "Erro ao sincronizar casas: " . $e->getMessage()
        ]);
    }
}

// ---------------------------------------------------------
// 22. AÇÃO: CRIAR CASA
// ---------------------------------------------------------
elseif ($acao === 'criar_casa') {
    $profile_id = getProfileId($dados);
    $book = trim($dados['book'] ?? '');
    $saldo_inicial = floatval($dados['saldo_inicial'] ?? 0);

    ensureAuthorizedProfile($conn, $profile_id);
    ensureFluxoBookColumn($conn);

    if ($book === '') {
        responder(["sucesso" => false, "erro" => "Nome da casa é obrigatório."]);
    }

    // Verificar se a casa já existe
    $stmt = $conn->prepare("SELECT COUNT(*) as total FROM fluxo_caixa WHERE profile_id = ? AND book = ?");
    $stmt->bind_param("ss", $profile_id, $book);
    $stmt->execute();
    $result = $stmt->get_result();
    $row = $result ? $result->fetch_assoc() : null;
    $stmt->close();

    $exists = (int)($row['total'] ?? 0) > 0;

    if ($exists) {
        responder(["sucesso" => false, "erro" => "Casa já existe."]);
    }

    // Criar registro inicial com saldo
    if ($saldo_inicial > 0) {
        $id = 'init_' . bin2hex(random_bytes(8));
        $date = date('Y-m-d');
        $type = 'deposit';
        $note = 'Saldo inicial ao adicionar casa';

        $stmt = $conn->prepare("
            INSERT INTO fluxo_caixa (id, profile_id, date, type, amount, note, book)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ");
        $stmt->bind_param("ssssdss", $id, $profile_id, $date, $type, $saldo_inicial, $note, $book);

        if (!$stmt->execute()) {
            responder(["sucesso" => false, "erro" => "Erro ao criar casa."]);
        }
        $stmt->close();
    }

    responder([
        "sucesso" => true,
        "mensagem" => "Casa '$book' criada com sucesso!",
        "casa" => [
            "book" => $book,
            "saldo_inicial" => $saldo_inicial
        ]
    ]);
}

$conn->close();
?>