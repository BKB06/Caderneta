<?php
// conexao.php - Documentação: Este ficheiro estabelece a ligação com o MySQL do XAMPP no Linux

$servidor = "localhost";
$utilizador = "root"; // O utilizador padrão do XAMPP é root
$senha = "";          // A senha padrão costuma vir vazia
$banco = "caderneta_apostas"; // A base de dados que criámos

// Criar a ligação
$conn = new mysqli($servidor, $utilizador, $senha, $banco);

// Verificar a ligação
if ($conn->connect_error) {
    die("Falha na conexão: " . $conn->connect_error);
}

// Configurar o charset para suportar acentuação e emojis
$conn->set_charset("utf8mb4");
?>