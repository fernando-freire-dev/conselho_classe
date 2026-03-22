// ============================================================
// js/modals.js — Carrega modals.html e gerencia modais globais
// Incluir em todos os HTMLs APÓS o bootstrap.bundle.min.js
// e APÓS js/supabase.js.
// ============================================================

(async function carregarModais() {
  try {
    const resp = await fetch("modals.html");
    if (!resp.ok) throw new Error("modals.html não encontrado");
    const html = await resp.text();

    const container = document.createElement("div");
    container.id = "globalModals";
    container.innerHTML = html;
    document.body.appendChild(container);
  } catch (err) {
    console.warn("modals.js: não foi possível carregar modals.html →", err.message);
  }
})();


// ── Modal: Alterar Senha ─────────────────────────────────────

let modalSenhaInstance = null;

function abrirModalSenha() {
  // Garante que o modal já foi injetado no DOM
  const modalEl = document.getElementById("modalAlterarSenha");
  if (!modalEl) {
    console.warn("Modal de senha ainda não foi carregado no DOM.");
    return;
  }

  document.getElementById("senhaAtual").value        = "";
  document.getElementById("senhaNova").value         = "";
  document.getElementById("senhaNovaConfirm").value  = "";
  document.getElementById("feedbackSenha").innerHTML = "";

  if (!modalSenhaInstance) {
    modalSenhaInstance = new bootstrap.Modal(modalEl);
  }
  modalSenhaInstance.show();
}

function toggleSenhaModal(inputId) {
  const input = document.getElementById(inputId);
  if (input) input.type = input.type === "password" ? "text" : "password";
}

async function salvarNovaSenha() {
  const senhaAtual   = document.getElementById("senhaAtual").value;
  const senhaNova    = document.getElementById("senhaNova").value;
  const senhaConfirm = document.getElementById("senhaNovaConfirm").value;
  const feedback     = document.getElementById("feedbackSenha");
  const btn          = document.getElementById("btnSalvarSenha");
  const btnTexto     = document.getElementById("btnSalvarSenhaTexto");
  const spinner      = document.getElementById("btnSalvarSenhaSpinner");

  feedback.innerHTML = "";

  if (!senhaAtual || !senhaNova || !senhaConfirm) {
    feedback.innerHTML = `<div class="alert alert-warning py-2">Preencha todos os campos.</div>`;
    return;
  }

  if (senhaNova.length < 6) {
    feedback.innerHTML = `<div class="alert alert-warning py-2">A nova senha precisa ter no mínimo 6 caracteres.</div>`;
    return;
  }

  if (senhaNova !== senhaConfirm) {
    feedback.innerHTML = `<div class="alert alert-warning py-2">A confirmação de senha não confere.</div>`;
    return;
  }

  btn.disabled = true;
  btnTexto.textContent = "Salvando...";
  spinner.classList.remove("d-none");

  try {
    // Reautentica com a senha atual para garantir que é o próprio usuário
    const { data: { user } } = await supabaseClient.auth.getUser();
    const { error: reAuthErr } = await supabaseClient.auth.signInWithPassword({
      email: user.email,
      password: senhaAtual,
    });

    if (reAuthErr) {
      feedback.innerHTML = `<div class="alert alert-danger py-2">Senha atual incorreta.</div>`;
      return;
    }

    // Atualiza para a nova senha
    const { error: updateErr } = await supabaseClient.auth.updateUser({
      password: senhaNova,
    });

    if (updateErr) {
      feedback.innerHTML = `<div class="alert alert-danger py-2">Erro ao atualizar senha: ${updateErr.message}</div>`;
      return;
    }

    feedback.innerHTML = `<div class="alert alert-success py-2">Senha alterada com sucesso!</div>`;

    setTimeout(() => {
      modalSenhaInstance?.hide();
    }, 1500);

  } catch (err) {
    feedback.innerHTML = `<div class="alert alert-danger py-2">Erro inesperado: ${err.message}</div>`;
  } finally {
    btn.disabled = false;
    btnTexto.textContent = "Salvar";
    spinner.classList.add("d-none");
  }
}

// ── Adicione funções de novos modais globais abaixo desta linha ──
