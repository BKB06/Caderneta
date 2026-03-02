<?php
// conexao.php — Ligação segura ao MySQL do XAMPP (Linux)
// IMPORTANTE: Em produção, mova credenciais para um ficheiro .env ou fora do webroot.

$servidor   = "localhost";
$utilizador = "root";              // Recomendação: criar um utilizador dedicado
$senha      = "";                  // Recomendação: definir senha no painel do phpMyAdmin
$banco      = "caderneta_apostas";

// Ativar exceções do mysqli para erros serem capturados por try/catch
mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);

try {
    $conn = new mysqli($servidor, $utilizador, $senha, $banco);
    $conn->set_charset("utf8mb4");
} catch (mysqli_sql_exception $e) {
    // Nunca expor detalhes da conexão ao utilizador final
    error_log("Falha na conexão MySQL: " . $e->getMessage());
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(["sucesso" => false, "erro" => "Erro interno do servidor."]);
    exit;
}
?>