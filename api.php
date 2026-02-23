<?php
// --- MODO DETETIVE: LIGADO ---
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);

header('Content-Type: application/json');

require 'conexao.php';

$dados = json_decode(file_get_contents("php://input"), true);
$acao = $dados['acao'] ?? '';

// ---------------------------------------------------------
// 1. AÇÃO: SALVAR OU ATUALIZAR UMA APOSTA
// ---------------------------------------------------------
if ($acao == 'salvar_aposta') {
    $aposta = $dados['aposta'];
    
    // CORREÇÃO MÁGICA: Se o JS enviar nulo ou vazio, usamos 'default'
    $profile_id = !empty($dados['profile_id']) ? $dados['profile_id'] : 'default';

    $conn->query("INSERT IGNORE INTO perfis (id, name) VALUES ('$profile_id', 'Perfil Principal')");

    $stmt = $conn->prepare("REPLACE INTO apostas (id, profile_id, date, event, odds, stake, book, ai, status, isFreebet) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
    
    $isFreebet = $aposta['isFreebet'] ? 1 : 0;
    
    $stmt->bind_param("ssssddsssi", 
        $aposta['id'], $profile_id, $aposta['date'], $aposta['event'], 
        $aposta['odds'], $aposta['stake'], $aposta['book'], 
        $aposta['ai'], $aposta['status'], $isFreebet
    );

    if ($stmt->execute()) {
        echo json_encode(["sucesso" => true, "mensagem" => "Aposta salva na base de dados!"]);
    } else {
        echo json_encode(["sucesso" => false, "erro" => "Erro do MySQL: " . $stmt->error]);
    }
    $stmt->close();
}

// ---------------------------------------------------------
// 2. AÇÃO: CARREGAR TODAS AS APOSTAS DE UM PERFIL
// ---------------------------------------------------------
elseif ($acao == 'carregar_apostas') {
    // Mesma segurança aqui na hora de carregar
    $profile_id = !empty($dados['profile_id']) ? $dados['profile_id'] : 'default';
    
    $result = $conn->query("SELECT * FROM apostas WHERE profile_id = '$profile_id' ORDER BY date DESC");
    
    $apostas = [];
    if ($result) {
        while ($row = $result->fetch_assoc()) {
            $row['isFreebet'] = (bool)$row['isFreebet'];
            $row['odds'] = (float)$row['odds'];
            $row['stake'] = (float)$row['stake'];
            $apostas[] = $row;
        }
    }
    
    echo json_encode($apostas);
}
// ---------------------------------------------------------
// 3. AÇÃO: SALVAR OU ATUALIZAR FLUXO DE CAIXA
// ---------------------------------------------------------
elseif ($acao == 'salvar_fluxo') {
    $fluxo = $dados['fluxo'];
    $profile_id = !empty($dados['profile_id']) ? $dados['profile_id'] : 'default';

    $conn->query("INSERT IGNORE INTO perfis (id, name) VALUES ('$profile_id', 'Perfil Principal')");

    $stmt = $conn->prepare("REPLACE INTO fluxo_caixa (id, profile_id, date, type, amount, note) VALUES (?, ?, ?, ?, ?, ?)");
    
    $stmt->bind_param("ssssds", 
        $fluxo['id'], $profile_id, $fluxo['date'], $fluxo['type'], 
        $fluxo['amount'], $fluxo['note']
    );

    if ($stmt->execute()) {
        echo json_encode(["sucesso" => true]);
    } else {
        echo json_encode(["sucesso" => false, "erro" => $stmt->error]);
    }
    $stmt->close();
}

// ---------------------------------------------------------
// 4. AÇÃO: CARREGAR FLUXO DE CAIXA
// ---------------------------------------------------------
elseif ($acao == 'carregar_fluxo') {
    $profile_id = !empty($dados['profile_id']) ? $dados['profile_id'] : 'default';
    
    $result = $conn->query("SELECT * FROM fluxo_caixa WHERE profile_id = '$profile_id' ORDER BY date DESC");
    
    $fluxos = [];
    if ($result) {
        while ($row = $result->fetch_assoc()) {
            $row['amount'] = (float)$row['amount'];
            $fluxos[] = $row;
        }
    }
    echo json_encode($fluxos);
}

elseif ($acao == 'excluir_fluxo') {
    $id = $dados['id'];
    $stmt = $conn->prepare("DELETE FROM fluxo_caixa WHERE id = ?");
    $stmt->bind_param("s", $id);
    $stmt->execute();
    echo json_encode(["sucesso" => true]);
    $stmt->close();
}
elseif ($acao == 'salvar_dados_extras') {
    $profile_id = !empty($dados['profile_id']) ? $dados['profile_id'] : 'default';
    $tipo = $dados['tipo']; // Vai nos dizer se é 'settings', 'goals', 'notes' ou 'bankroll'
    
    // Como algumas coisas são texto (Notas) e outras são JSON (Configurações), recebemos tudo como String
    $valor = $dados['valor']; 

    // Garante que o perfil existe
    $conn->query("INSERT IGNORE INTO perfis (id, name) VALUES ('$profile_id', 'Perfil Principal')");
    // Garante que a linha de dados extras deste perfil já existe antes de a atualizarmos
    $conn->query("INSERT IGNORE INTO dados_extras (profile_id) VALUES ('$profile_id')");

    // Dependendo do que o JS pedir para salvar, atualizamos a coluna certa!
    if ($tipo == 'settings') {
        $stmt = $conn->prepare("UPDATE dados_extras SET settings_json = ? WHERE profile_id = ?");
    } elseif ($tipo == 'goals') {
        $stmt = $conn->prepare("UPDATE dados_extras SET goals_json = ? WHERE profile_id = ?");
    } elseif ($tipo == 'notes') {
        $stmt = $conn->prepare("UPDATE dados_extras SET notes = ? WHERE profile_id = ?");
    } elseif ($tipo == 'bankroll') {
        $stmt = $conn->prepare("UPDATE dados_extras SET bankroll = ? WHERE profile_id = ?");
    }
    
    // Vincula o valor e o ID do perfil e executa
    $stmt->bind_param("ss", $valor, $profile_id);
    $stmt->execute();
    echo json_encode(["sucesso" => true]);
    $stmt->close();
}

// ---------------------------------------------------------
// 7. AÇÃO: CARREGAR DADOS EXTRAS
// ---------------------------------------------------------
elseif ($acao == 'carregar_dados_extras') {
    $profile_id = !empty($dados['profile_id']) ? $dados['profile_id'] : 'default';
    
    $result = $conn->query("SELECT * FROM dados_extras WHERE profile_id = '$profile_id'");
    
    if ($result && $row = $result->fetch_assoc()) {
        // Se encontrar os dados, devolve-os para o JS
        echo json_encode(["sucesso" => true, "dados" => $row]);
    } else {
        // Se não encontrar nada, avisa que está vazio
        echo json_encode(["sucesso" => false, "erro" => "Nenhum dado encontrado"]);
    }
}
else {
    echo json_encode(["sucesso" => false, "erro" => "Ação não reconhecida."]);
}

$conn->close();
?>