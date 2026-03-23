/**
 * Remove acentos e diacríticos de uma string.
 * Exemplo: "Sérgio" -> "Sergio", "Conceição" -> "Conceicao"
 * Utiliza a Decomposição Canônica (NFD) do JavaScript.
 */
function removerAcentos(texto) {
    if (!texto) return "";
    // O normalize('NFD') separa a letra base do acento.
    // O replace(/[\u0300-\u036f]/g, "") remove os caracteres de acento da string.
    return String(texto).normalize('NFD').replace(/[\u0300-\u036f]/g, "");
}

/**
 * Remove espaços em branco no início, no fim e espaços duplicados entre as palavras.
 * Exemplo: " Sérgio    Gabriel  " -> "Sérgio Gabriel"
 */
function removerEspacosExtras(texto) {
    if (!texto) return "";
    return String(texto).trim().replace(/\s+/g, ' ');
}

/**
 * Função principal de normalização de texto.
 * Converte para minúsculas, remove acentos e remove espaços extras.
 * Ideal para comparações e buscas no sistema.
 * Exemplo: "Sérgio Gabriel " -> "sergio gabriel"
 */
function normalizarTexto(texto) {
    if (texto === null || texto === undefined) {
        return "";
    }

    let textoNormalizado = String(texto).toLowerCase();
    textoNormalizado = removerAcentos(textoNormalizado);
    textoNormalizado = removerEspacosExtras(textoNormalizado);

    return textoNormalizado;
}

/**
 * Compara duas strings garantindo que a acentuação, case e espaços não interfiram.
 */
function compararTextos(texto1, texto2) {
    return normalizarTexto(texto1) === normalizarTexto(texto2);
}