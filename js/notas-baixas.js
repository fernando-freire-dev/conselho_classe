// ============================================
// DESTAQUE DE NOTAS E FALTAS
// ============================================

/**
 * Aplica destaque em notas (todas abaixo de 5 em vermelho)
 */
function aplicarDestaqueNota(elemento, valor) {
  if (!elemento) return;

  elemento.classList.remove('nota-baixa', 'nota-muito-baixa', 'nota-baixa-cell', 'nota-muito-baixa-cell');

  const nota = parseFloat(valor);
  if (isNaN(nota)) return;

  if (nota < 5) {
    if (elemento.tagName === 'INPUT' || elemento.tagName === 'TEXTAREA') {
      elemento.classList.add('nota-baixa');
    } else {
      elemento.classList.add('nota-baixa-cell');
    }
  }
}

/**
 * Aplica destaque em faltas (acima de 8 em amarelo)
 */
function aplicarDestaqueFalta(elemento, valor) {
  if (!elemento) return;

  elemento.classList.remove('falta-alta', 'falta-alta-cell');

  const faltas = parseInt(valor, 10);
  if (isNaN(faltas)) return;

  if (faltas > 8) {
    if (elemento.tagName === 'INPUT' || elemento.tagName === 'TEXTAREA') {
      elemento.classList.add('falta-alta');
    } else {
      elemento.classList.add('falta-alta-cell');
    }
  }
}

/**
 * Monitorar inputs de notas
 */
function monitorarInputNota(input) {
  if (!input) return;

  aplicarDestaqueNota(input, input.value);

  input.addEventListener('input', function () {
    aplicarDestaqueNota(this, this.value);
  });

  input.addEventListener('change', function () {
    aplicarDestaqueNota(this, this.value);
  });
}

/**
 * Monitorar inputs de faltas
 */
function monitorarInputFalta(input) {
  if (!input) return;

  aplicarDestaqueFalta(input, input.value);

  input.addEventListener('input', function () {
    aplicarDestaqueFalta(this, this.value);
  });

  input.addEventListener('change', function () {
    aplicarDestaqueFalta(this, this.value);
  });
}

/**
 * Aplica destaque em toda a página
 */
function destacarTodasNotas() {
  // Notas
  document.querySelectorAll('input.media').forEach(input => {
    monitorarInputNota(input);
  });

  // Faltas
  document.querySelectorAll('input.faltas').forEach(input => {
    monitorarInputFalta(input);
  });

  // Células (caso existam)
  document.querySelectorAll('[data-media], .cell-media').forEach(cell => {
    const valor = cell.getAttribute('data-media') || cell.textContent;
    aplicarDestaqueNota(cell, valor);
  });

  document.querySelectorAll('[data-faltas], .cell-faltas').forEach(cell => {
    const valor = cell.getAttribute('data-faltas') || cell.textContent;
    aplicarDestaqueFalta(cell, valor);
  });
}

/**
 * Conta notas abaixo de 5
 */
function contarNotasBaixas() {
  const inputs = document.querySelectorAll('input.media');

  let total = 0;

  inputs.forEach(el => {
    const nota = parseFloat(el.value);
    if (!isNaN(nota) && nota < 5) {
      total++;
    }
  });

  return { total };
}

/**
 * Inicialização automática
 */
function inicializarDestaqueNotas() {
  destacarTodasNotas();

  const observer = new MutationObserver(mutations => {
    mutations.forEach(mutation => {
      mutation.addedNodes.forEach(node => {
        if (node.nodeType !== 1) return;

        const notas = node.querySelectorAll?.('input.media') || [];
        notas.forEach(input => monitorarInputNota(input));

        const faltas = node.querySelectorAll?.('input.faltas') || [];
        faltas.forEach(input => monitorarInputFalta(input));
      });
    });
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  console.log('✅ Destaque de notas e faltas ativo');
}

// Auto start
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', inicializarDestaqueNotas);
} else {
  inicializarDestaqueNotas();
}
